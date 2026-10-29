from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.db.models import Count
from django.http import HttpResponse
from rest_framework import filters, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView

from . import exports, grades as gr, models as m, reports as rp, serializers as s, services as sv
from .receipts import receipt_pdf

DIR, SEC, ACC, TEA = "director", "secretary", "accountant", "teacher"


def role(u):
    return DIR if u.is_superuser else u.role


def audit(request, action_, obj_model, obj_id, summary):
    m.AuditLog.objects.create(user=request.user, action=action_, model=obj_model, object_id=str(obj_id), summary=summary[:250])


def teacher_rooms(u):
    """Classes d'un enseignant : affectations, emploi du temps et matières."""
    ids = set(m.TeachingAssignment.objects.filter(teacher__user=u).values_list("classroom_id", flat=True))
    ids |= set(m.TimetableSlot.objects.filter(teacher__user=u).values_list("classroom_id", flat=True))
    ids |= set(m.ClassSubject.objects.filter(teacher__user=u).values_list("classroom_id", flat=True))
    return ids


def check_room(request, classroom_id):
    if role(request.user) == TEA and int(classroom_id) not in teacher_rooms(request.user):
        raise PermissionDenied("Cette classe ne vous est pas attribuée.")


class Login(TokenObtainPairView):
    serializer_class = s.LoginSerializer
    permission_classes = []
    authentication_classes = []


class Base(viewsets.ModelViewSet):
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    audited = True

    def extra_save(self):
        return {}

    def log(self, act, obj, extra=""):
        if self.audited:
            audit(self.request, act, str(obj._meta.verbose_name), obj.pk, str(obj) + extra)

    def perform_create(self, ser):
        self.log("create", ser.save(**self.extra_save()))

    def perform_update(self, ser):
        self.log("update", ser.save(), " · champs : " + ", ".join(ser.validated_data.keys()))

    def perform_destroy(self, inst):
        self.log("delete", inst)
        inst.delete()


class UserViewSet(Base):
    queryset = m.User.objects.all().order_by("username")
    serializer_class = s.UserSerializer
    roles = {"read": [], "write": []}  # directeur uniquement
    http_method_names = ["get", "post", "patch", "head", "options"]

    def perform_update(self, ser):
        if ser.instance.pk == self.request.user.pk and ser.validated_data.get("is_active") is False:
            raise ValidationError("Vous ne pouvez pas désactiver votre propre compte.")
        super().perform_update(ser)


class AuditView(APIView):
    roles = {"read": [], "write": []}

    def get(self, request):
        qs = m.AuditLog.objects.select_related("user")
        p = request.query_params
        if p.get("model"):
            qs = qs.filter(model=p["model"])
        if p.get("q"):
            qs = qs.filter(summary__icontains=p["q"])
        return Response({"models": list(m.AuditLog.objects.values_list("model", flat=True).distinct()),
                         "results": s.AuditSerializer(qs[:300], many=True).data})


class SettingsView(APIView):
    roles = {"read": [SEC, ACC, TEA], "write": []}
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get(self, request):
        return Response(s.SettingsSerializer(m.SchoolSettings.get(), context={"request": request}).data)

    def patch(self, request):
        ser = s.SettingsSerializer(m.SchoolSettings.get(), data=request.data, partial=True, context={"request": request})
        ser.is_valid(raise_exception=True)
        ser.save()
        audit(request, "update", "paramètres de l’école", 1, "Modification des paramètres")
        return Response(ser.data)


class ClassRoomViewSet(Base):
    queryset = m.ClassRoom.objects.annotate(students_count=Count("students"))
    serializer_class = s.ClassRoomSerializer
    roles = {"read": [SEC, ACC, TEA], "write": [SEC]}


class StudentViewSet(Base):
    queryset = m.Student.objects.select_related("classroom")
    serializer_class = s.StudentSerializer
    search_fields = ["first_name", "last_name", "matricule", "classroom__name", "guardian_name"]
    roles = {"read": [SEC, ACC, TEA], "write": [SEC]}
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_serializer_class(self):
        return s.StudentLightSerializer if role(self.request.user) == TEA else s.StudentSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        u, p = self.request.user, self.request.query_params
        if role(u) == TEA:
            qs = qs.filter(classroom_id__in=teacher_rooms(u))
        if p.get("classroom"):
            qs = qs.filter(classroom_id=p["classroom"])
        if p.get("status"):
            qs = qs.filter(status=p["status"])
        return qs

    @action(detail=True, methods=["get", "post"])
    def reenroll(self, request, pk=None):
        st = self.get_object()
        if request.method == "GET":
            return Response(s.EnrollmentSerializer(st.enrollments.all(), many=True).data)
        d = request.data
        room = m.ClassRoom.objects.get(pk=d["classroom"])
        st.classroom, st.status = room, "active"
        st.monthly_fee = int(d.get("monthly_fee", st.monthly_fee))
        st.save()
        fee = int(d.get("registration_fee", 0))
        m.Enrollment.objects.create(student=st, classroom=room, registration_fee=fee)
        if d.get("collect_registration") in (True, "true", "True") and fee > 0:
            m.Income.objects.create(category="registration", label=f"Frais de réinscription — {st.full_name}", amount=fee,
                                    method=d.get("registration_method", "cash"), received_by=request.user)
        audit(request, "other", "élève", st.pk, f"Réinscription de {st.full_name} en {room.name}")
        return Response(s.StudentSerializer(st, context={"request": request}).data)

    @action(detail=True, methods=["get"])
    def dossier(self, request, pk=None):
        """Dossier complet : historique scolaire, assiduité et (selon le rôle) historique financier."""
        if role(request.user) == TEA:
            raise PermissionDenied()
        st = self.get_object()
        ab = st.absences.all()
        out = {"student": s.StudentSerializer(st, context={"request": request}).data,
               "enrollments": s.EnrollmentSerializer(st.enrollments.all(), many=True).data,
               "absences": {"absent": ab.filter(kind="absent").count(), "late": ab.filter(kind="late").count(),
                            "unjustified": ab.filter(kind="absent", justified=False).count(),
                            "recent": s.AbsenceSerializer(ab[:8], many=True).data}}
        if role(request.user) in (DIR, ACC):
            last = sv.year_months(st.classroom.school_year)
            upto = max(last[0], min(date.today().replace(day=1), last[-1]))
            out["months"] = sv.student_months(st, upto, sv.paid_map(upto))
            out["payments"] = s.PaymentSerializer(st.payments.select_related("student__classroom", "received_by"), many=True).data
        return Response(out)


class PaymentViewSet(Base):
    queryset = m.Payment.objects.select_related("student__classroom", "received_by")
    serializer_class = s.PaymentSerializer
    search_fields = ["student__first_name", "student__last_name", "reference"]
    roles = {"read": [ACC], "write": [ACC]}

    def extra_save(self):
        return {"received_by": self.request.user}

    def get_queryset(self):
        qs, p = super().get_queryset(), self.request.query_params
        if p.get("month"):
            qs = qs.filter(month=sv.parse_month(p["month"]))
        if p.get("student"):
            qs = qs.filter(student_id=p["student"])
        return qs

    @action(detail=True, methods=["get"])
    def receipt(self, request, pk=None):
        res = HttpResponse(receipt_pdf(self.get_object()), content_type="application/pdf")
        res["Content-Disposition"] = f'inline; filename="recu-{pk}.pdf"'
        return res


class IncomeViewSet(Base):
    queryset = m.Income.objects.all()
    serializer_class = s.IncomeSerializer
    search_fields = ["label", "reference"]
    roles = {"read": [ACC], "write": [ACC]}
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def extra_save(self):
        return {"received_by": self.request.user}

    def get_queryset(self):
        qs = super().get_queryset()
        if mo := self.request.query_params.get("month"):
            d = sv.parse_month(mo)
            qs = qs.filter(date__year=d.year, date__month=d.month)
        return qs


class ExpenseViewSet(Base):
    queryset = m.Expense.objects.all()
    serializer_class = s.ExpenseSerializer
    search_fields = ["label", "beneficiary"]
    roles = {"read": [ACC], "write": [ACC]}
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        qs = super().get_queryset()
        if mo := self.request.query_params.get("month"):
            d = sv.parse_month(mo)
            qs = qs.filter(date__year=d.year, date__month=d.month)
        return qs


class DuesView(APIView):
    roles = {"read": [ACC], "write": []}

    def get(self, request):
        rows = sv.dues(sv.parse_month(request.query_params.get("month")), request.query_params.get("classroom"))
        return Response(sorted(rows, key=lambda r: -r["total_due"]))


class TeacherViewSet(Base):
    queryset = m.Teacher.objects.select_related("user").prefetch_related("assignments")
    serializer_class = s.TeacherSerializer
    search_fields = ["first_name", "last_name", "subjects"]
    roles = {"read": [SEC, ACC], "write": []}


class AssignmentViewSet(Base):
    queryset = m.TeachingAssignment.objects.select_related("teacher", "classroom")
    serializer_class = s.AssignmentSerializer
    roles = {"read": [SEC, ACC, TEA], "write": [SEC]}

    def get_queryset(self):
        qs, u = super().get_queryset(), self.request.user
        if role(u) == TEA:
            qs = qs.filter(teacher__user=u)
        return qs


class SlotViewSet(Base):
    queryset = m.TimetableSlot.objects.select_related("teacher", "classroom")
    serializer_class = s.SlotSerializer
    roles = {"read": [SEC, TEA, ACC], "write": [SEC]}
    audited = False

    def get_queryset(self):
        qs, u = super().get_queryset(), self.request.user
        if role(u) == TEA:
            qs = qs.filter(teacher__user=u)
        if c := self.request.query_params.get("classroom"):
            qs = qs.filter(classroom_id=c)
        return qs


class TeacherAbsenceViewSet(Base):
    queryset = m.TeacherAbsence.objects.select_related("teacher", "replaced_by")
    serializer_class = s.TeacherAbsenceSerializer
    roles = {"read": [SEC, ACC], "write": [SEC]}

    def get_queryset(self):
        qs = super().get_queryset()
        if mo := self.request.query_params.get("month"):
            d = sv.parse_month(mo)
            qs = qs.filter(date__year=d.year, date__month=d.month)
        return qs


def planned_hours(t):
    slots = m.TimetableSlot.objects.filter(teacher=t)
    weekly = sum((datetime.combine(date.min, x.end) - datetime.combine(date.min, x.start)).seconds / 3600 for x in slots)
    return (weekly or t.weekly_hours) * 4  # 4 semaines par mois, modifiable ensuite


class WorkedHoursViewSet(Base):
    queryset = m.WorkedHours.objects.select_related("teacher")
    serializer_class = s.WorkedHoursSerializer
    roles = {"read": [ACC], "write": [ACC]}

    def get_queryset(self):
        qs = super().get_queryset()
        if mo := self.request.query_params.get("month"):
            qs = qs.filter(month=sv.parse_month(mo))
        return qs

    def _recalc(self, wh):
        ser = s.WorkedHoursSerializer(wh)
        wh.done_hours = max(Decimal(0), wh.planned_hours - Decimal(str(ser.data["absent_hours"])) + Decimal(str(ser.data["replacement_hours"])))
        wh.save()

    @action(detail=False, methods=["post"])
    def generate(self, request):
        mo = sv.parse_month(request.data.get("month"))
        for t in m.Teacher.objects.all():
            wh, new = m.WorkedHours.objects.get_or_create(teacher=t, month=mo, defaults={"planned_hours": Decimal(str(planned_hours(t)))})
            if new:
                self._recalc(wh)
        return Response(s.WorkedHoursSerializer(self.get_queryset().filter(month=mo), many=True).data)

    @action(detail=True, methods=["post"])
    def recalculate(self, request, pk=None):
        wh = self.get_object()
        if wh.paid:
            raise ValidationError("Salaire déjà versé.")
        self._recalc(wh)
        return Response(s.WorkedHoursSerializer(wh).data)

    @action(detail=True, methods=["post"])
    def pay(self, request, pk=None):
        wh = self.get_object()
        if wh.paid:
            raise ValidationError("Salaire déjà versé.")
        e = m.Expense.objects.create(date=date.today(), category="salaries", amount=wh.amount, method=request.data.get("method", "cash"),
                                     label=f"Salaire {wh.month:%m/%Y} — {wh.teacher.full_name}", beneficiary=wh.teacher.full_name)
        wh.paid = True
        wh.save()
        audit(request, "other", "heures mensuelles", wh.pk, f"Salaire versé : {e}")
        return Response(s.WorkedHoursSerializer(wh).data)


class FinanceView(APIView):
    roles = {"read": [ACC], "write": [ACC]}

    def get(self, request):
        return Response(rp.finance(sv.parse_month(request.query_params.get("month"))))

    def patch(self, request):
        cfg = m.SchoolSettings.get()
        cfg.opening_balance = int(request.data["opening_balance"])
        cfg.save()
        audit(request, "update", "paramètres de l’école", 1, f"Solde initial : {cfg.opening_balance} FCFA")
        return Response(rp.finance(sv.parse_month(request.query_params.get("month"))))


class DashboardView(APIView):
    roles = {"read": [ACC], "write": []}

    def get(self, request):
        month = sv.parse_month(request.query_params.get("month"))
        rows = sv.dues(month)
        year = month.year if month.month >= 9 else month.year - 1
        series = []
        for mo in sv.year_months(f"{year}-{year + 1}"):
            f = rp.finance(mo)
            series.append({"month": mo.strftime("%Y-%m"), "income": f["income"], "expenses": f["expenses"]})
        return Response({
            "students": m.Student.objects.filter(status="active").count(), "teachers": m.Teacher.objects.count(),
            "paid": sum(r["status"] == "paid" for r in rows), "partial": sum(r["status"] == "partial" for r in rows),
            "unpaid": sum(r["status"] == "none" for r in rows), "expected": sum(r["monthly_fee"] for r in rows),
            "collected": sum(min(r["paid"], r["monthly_fee"]) for r in rows), "arrears": sum(r["arrears"] for r in rows),
            "finance": rp.finance(month), "series": series})


class ReportView(APIView):
    roles = {"read": [ACC], "write": []}

    def get(self, request, kind):
        p = request.query_params
        if kind == "monthly":
            return Response(rp.monthly_report(sv.parse_month(p.get("month"))))
        t = date.today()
        return Response(rp.annual_report(int(p.get("year") or (t.year if t.month >= 9 else t.year - 1))))


EXPORT_ROLES = {"students": {SEC, ACC}, "results": {SEC}}


class ExportView(APIView):
    roles = {"read": [SEC, ACC], "write": []}

    def get(self, request, kind):
        if kind not in {*exports_kinds()}:
            raise ValidationError("Export inconnu.")
        if role(request.user) != DIR and role(request.user) not in EXPORT_ROLES.get(kind, {ACC}):
            raise PermissionDenied()
        body, ctype, name = exports.render(kind, request.query_params, request.query_params.get("fmt", "xlsx"))
        res = HttpResponse(body, content_type=ctype)
        res["Content-Disposition"] = f'attachment; filename="{name}"'
        audit(request, "other", "export", 0, f"Export {name}")
        return res


def exports_kinds():
    return ["students", "dues", "payments", "expenses", "incomes", "hours", "results", "report-monthly", "report-annual"]


# ---------- Notes, bulletins, absences ----------
class ClassSubjectViewSet(Base):
    queryset = m.ClassSubject.objects.select_related("classroom", "teacher")
    serializer_class = s.ClassSubjectSerializer
    roles = {"read": [SEC, TEA], "write": [SEC]}
    audited = False

    def get_queryset(self):
        qs, p, u = super().get_queryset(), self.request.query_params, self.request.user
        if p.get("classroom"):
            qs = qs.filter(classroom_id=p["classroom"])
        if role(u) == TEA:
            qs = qs.filter(classroom_id__in=teacher_rooms(u))
        return qs


class EvaluationViewSet(Base):
    queryset = m.Evaluation.objects.select_related("class_subject__classroom", "class_subject__teacher")
    serializer_class = s.EvaluationSerializer
    roles = {"read": [SEC, TEA], "write": [SEC, TEA]}
    audited = False

    def _own(self, cs):
        u = self.request.user
        if role(u) == TEA and not (cs.teacher and cs.teacher.user_id == u.id):
            raise PermissionDenied("Vous ne pouvez saisir que les évaluations de vos matières.")

    def get_queryset(self):
        qs, p, u = super().get_queryset(), self.request.query_params, self.request.user
        if p.get("classroom"):
            qs = qs.filter(class_subject__classroom_id=p["classroom"])
        if p.get("term"):
            qs = qs.filter(term=p["term"])
        if role(u) == TEA:
            qs = qs.filter(class_subject__classroom_id__in=teacher_rooms(u))
        return qs

    def perform_create(self, ser):
        self._own(ser.validated_data["class_subject"])
        ser.save()

    def perform_update(self, ser):
        self._own(ser.instance.class_subject)
        ser.save()

    def perform_destroy(self, inst):
        self._own(inst.class_subject)
        inst.delete()

    @action(detail=True, methods=["get", "post"])
    def grades(self, request, pk=None):
        ev = self.get_object()
        if request.method == "POST":
            self._own(ev.class_subject)
            with transaction.atomic():
                for e in request.data.get("grades", []):
                    raw = e.get("score")
                    if raw in ("", None):
                        m.Grade.objects.filter(evaluation=ev, student_id=e["student"]).delete()
                        continue
                    try:
                        v = Decimal(str(raw).replace(",", "."))
                    except InvalidOperation:
                        raise ValidationError("Note invalide.")
                    if v < 0 or v > ev.max_score:
                        raise ValidationError(f"Les notes doivent être comprises entre 0 et {ev.max_score}.")
                    m.Grade.objects.update_or_create(evaluation=ev, student_id=e["student"], defaults={"score": v})
        sc = {g.student_id: g.score for g in ev.grades.all()}
        studs = m.Student.objects.filter(classroom=ev.class_subject.classroom, status="active")
        return Response([{"student": x.id, "name": x.full_name, "score": None if sc.get(x.id) is None else float(sc[x.id])} for x in studs])


class ResultsView(APIView):
    roles = {"read": [SEC, TEA], "write": [SEC]}

    def get(self, request):
        room = m.ClassRoom.objects.get(pk=request.query_params["classroom"])
        check_room(request, room.pk)
        return Response(gr.class_results(room, int(request.query_params.get("term", 1))))

    def post(self, request):  # appréciation du directeur pour le bulletin
        st = m.Student.objects.get(pk=request.data["student"])
        m.BulletinRemark.objects.update_or_create(student=st, classroom=st.classroom, term=int(request.data.get("term", 1)),
                                                  defaults={"comment": request.data.get("comment", "")[:300]})
        return Response({"ok": True})


class BulletinView(APIView):
    roles = {"read": [SEC, TEA], "write": []}

    def get(self, request):
        st = m.Student.objects.select_related("classroom").get(pk=request.query_params["student"])
        check_room(request, st.classroom_id)
        res = HttpResponse(gr.bulletin_pdf(st, int(request.query_params.get("term", 1))), content_type="application/pdf")
        res["Content-Disposition"] = f'inline; filename="bulletin-{st.matricule}.pdf"'
        return res


class AbsenceViewSet(Base):
    queryset = m.Absence.objects.select_related("student__classroom")
    serializer_class = s.AbsenceSerializer
    roles = {"read": [SEC, TEA], "write": [SEC, TEA]}
    audited = False

    def extra_save(self):
        return {"recorded_by": self.request.user}

    def get_queryset(self):
        qs, p, u = super().get_queryset(), self.request.query_params, self.request.user
        for k, f in (("classroom", "student__classroom_id"), ("date", "date"), ("student", "student_id")):
            if p.get(k):
                qs = qs.filter(**{f: p[k]})
        if role(u) == TEA:
            qs = qs.filter(student__classroom_id__in=teacher_rooms(u))
        return qs

    @action(detail=False, methods=["post"])
    def sheet(self, request):
        """Appel d'une classe pour une date : remplace les absences de ce jour."""
        d = request.data
        check_room(request, d["classroom"])
        with transaction.atomic():
            m.Absence.objects.filter(student__classroom_id=d["classroom"], date=d["date"]).delete()
            for e in d.get("entries", []):
                if e.get("kind") in ("absent", "late"):
                    m.Absence.objects.create(student_id=e["student"], date=d["date"], kind=e["kind"], justified=bool(e.get("justified")),
                                             reason=e.get("reason", "")[:200], recorded_by=request.user)
        return Response({"ok": True})
