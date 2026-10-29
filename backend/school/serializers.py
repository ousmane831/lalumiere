from django.contrib.auth.password_validation import validate_password
from django.db.models import Sum
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from . import models as m

MONTH = {"input_formats": ["%Y-%m", "%Y-%m-%d"]}
MONEY_ROLES = ("director", "accountant")


def role_of(ctx):
    r = ctx.get("request")
    u = getattr(r, "user", None)
    if not u or not u.is_authenticated:
        return None
    return "director" if u.is_superuser else u.role


class LoginSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        data = super().validate(attrs)
        u = self.user
        data["user"] = {"id": u.id, "name": u.get_full_name() or u.username, "role": "director" if u.is_superuser else u.role}
        return data


class UserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = m.User
        fields = ["id", "username", "first_name", "last_name", "role", "is_active", "password"]

    def validate_password(self, v):
        if v:
            validate_password(v)
        return v

    def create(self, d):
        pw = d.pop("password", "")
        if not pw:
            raise serializers.ValidationError({"password": "Le mot de passe est obligatoire."})
        return m.User.objects.create_user(password=pw, **d)

    def update(self, inst, d):
        pw = d.pop("password", "")
        inst = super().update(inst, d)
        if pw:
            inst.set_password(pw)
            inst.save()
        return inst


class SettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = m.SchoolSettings
        fields = ["name", "address", "phone", "logo", "term_system"]


class ClassRoomSerializer(serializers.ModelSerializer):
    level_label = serializers.CharField(source="get_level_display", read_only=True)
    students_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = m.ClassRoom
        fields = "__all__"


class StudentSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)
    classroom_name = serializers.CharField(source="classroom.name", read_only=True)
    collect_registration = serializers.BooleanField(write_only=True, required=False, default=False)
    registration_method = serializers.ChoiceField(choices=m.METHODS, write_only=True, required=False, default="cash")

    class Meta:
        model = m.Student
        fields = "__all__"

    def create(self, d):
        collect = d.pop("collect_registration", False)
        method = d.pop("registration_method", "cash")
        st = super().create(d)
        if collect and st.registration_fee > 0:
            m.Income.objects.create(date=st.enrolled_on, category="registration", method=method,
                                    label=f"Frais d’inscription — {st.full_name}", amount=st.registration_fee,
                                    received_by=self.context["request"].user)
        return st

    def update(self, inst, d):
        d.pop("collect_registration", None)
        d.pop("registration_method", None)
        return super().update(inst, d)


class StudentLightSerializer(serializers.ModelSerializer):
    """Vue enseignant : aucune donnée financière."""
    full_name = serializers.CharField(read_only=True)
    classroom_name = serializers.CharField(source="classroom.name", read_only=True)

    class Meta:
        model = m.Student
        fields = ["id", "matricule", "first_name", "last_name", "full_name", "sex", "birth_date", "photo", "classroom", "classroom_name", "status"]


class EnrollmentSerializer(serializers.ModelSerializer):
    classroom_name = serializers.CharField(source="classroom.name", read_only=True)
    school_year = serializers.CharField(source="classroom.school_year", read_only=True)

    class Meta:
        model = m.Enrollment
        fields = "__all__"


class PaymentSerializer(serializers.ModelSerializer):
    month = serializers.DateField(**MONTH)
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    classroom_name = serializers.CharField(source="student.classroom.name", read_only=True)
    method_label = serializers.CharField(source="get_method_display", read_only=True)
    receipt_no = serializers.CharField(read_only=True)
    received_by_name = serializers.SerializerMethodField()

    class Meta:
        model = m.Payment
        fields = "__all__"
        read_only_fields = ["received_by"]

    def get_received_by_name(self, o):
        return (o.received_by.get_full_name() or o.received_by.username) if o.received_by else ""

    def validate_amount(self, v):
        if v <= 0:
            raise serializers.ValidationError("Le montant doit être supérieur à 0.")
        return v


class IncomeSerializer(serializers.ModelSerializer):
    category_label = serializers.CharField(source="get_category_display", read_only=True)
    method_label = serializers.CharField(source="get_method_display", read_only=True)

    class Meta:
        model = m.Income
        fields = "__all__"
        read_only_fields = ["received_by"]


class ExpenseSerializer(serializers.ModelSerializer):
    category_label = serializers.CharField(source="get_category_display", read_only=True)
    method_label = serializers.CharField(source="get_method_display", read_only=True)

    class Meta:
        model = m.Expense
        fields = "__all__"


class TeacherSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)
    assigned_hours = serializers.SerializerMethodField()
    user_name = serializers.CharField(source="user.username", read_only=True, default="")

    class Meta:
        model = m.Teacher
        fields = "__all__"

    def get_fields(self):
        f = super().get_fields()
        if role_of(self.context) not in MONEY_ROLES:  # le secrétariat ne voit pas les rémunérations
            f.pop("hourly_rate", None)
            f.pop("fixed_salary", None)
        return f

    def get_assigned_hours(self, o):
        return sum(a.weekly_hours for a in o.assignments.all())


class AssignmentSerializer(serializers.ModelSerializer):
    teacher_name = serializers.CharField(source="teacher.full_name", read_only=True)
    classroom_name = serializers.CharField(source="classroom.name", read_only=True)

    class Meta:
        model = m.TeachingAssignment
        fields = "__all__"


class SlotSerializer(serializers.ModelSerializer):
    teacher_name = serializers.CharField(source="teacher.full_name", read_only=True)
    classroom_name = serializers.CharField(source="classroom.name", read_only=True)

    class Meta:
        model = m.TimetableSlot
        fields = "__all__"

    def validate(self, d):
        g = lambda k: d.get(k, getattr(self.instance, k, None))
        if g("start") >= g("end"):
            raise serializers.ValidationError("L’heure de fin doit être après l’heure de début.")
        base = m.TimetableSlot.objects.filter(weekday=g("weekday"), start__lt=g("end"), end__gt=g("start"))
        if self.instance:
            base = base.exclude(pk=self.instance.pk)
        if base.filter(teacher=g("teacher")).exists():
            raise serializers.ValidationError("Cet enseignant a déjà un cours à ce moment.")
        if base.filter(classroom=g("classroom")).exists():
            raise serializers.ValidationError("Cette classe a déjà un cours à ce moment.")
        return d


class TeacherAbsenceSerializer(serializers.ModelSerializer):
    teacher_name = serializers.CharField(source="teacher.full_name", read_only=True)
    replaced_by_name = serializers.CharField(source="replaced_by.full_name", read_only=True, default="")

    class Meta:
        model = m.TeacherAbsence
        fields = "__all__"


class WorkedHoursSerializer(serializers.ModelSerializer):
    month = serializers.DateField(**MONTH)
    teacher_name = serializers.CharField(source="teacher.full_name", read_only=True)
    amount = serializers.IntegerField(read_only=True)
    mode = serializers.SerializerMethodField()
    absent_hours = serializers.SerializerMethodField()
    replacement_hours = serializers.SerializerMethodField()

    class Meta:
        model = m.WorkedHours
        fields = "__all__"

    def get_mode(self, o):
        return "fixe" if o.teacher.fixed_salary > 0 else "heures"

    def _sum(self, qs, o):
        return float(qs.filter(date__year=o.month.year, date__month=o.month.month).aggregate(t=Sum("hours"))["t"] or 0)

    def get_absent_hours(self, o):
        return self._sum(m.TeacherAbsence.objects.filter(teacher=o.teacher), o)

    def get_replacement_hours(self, o):
        return self._sum(m.TeacherAbsence.objects.filter(replaced_by=o.teacher), o)


class ClassSubjectSerializer(serializers.ModelSerializer):
    teacher_name = serializers.CharField(source="teacher.full_name", read_only=True, default="")
    classroom_name = serializers.CharField(source="classroom.name", read_only=True)

    class Meta:
        model = m.ClassSubject
        fields = "__all__"


class EvaluationSerializer(serializers.ModelSerializer):
    subject_name = serializers.CharField(source="class_subject.name", read_only=True)
    classroom = serializers.IntegerField(source="class_subject.classroom_id", read_only=True)
    classroom_name = serializers.CharField(source="class_subject.classroom.name", read_only=True)
    kind_label = serializers.CharField(source="get_kind_display", read_only=True)
    graded = serializers.SerializerMethodField()

    class Meta:
        model = m.Evaluation
        fields = "__all__"

    def get_graded(self, o):
        return o.grades.filter(score__isnull=False).count()


class AbsenceSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    classroom_name = serializers.CharField(source="student.classroom.name", read_only=True)

    class Meta:
        model = m.Absence
        fields = "__all__"
        read_only_fields = ["recorded_by"]
        validators = []


class AuditSerializer(serializers.ModelSerializer):
    user_name = serializers.SerializerMethodField()

    class Meta:
        model = m.AuditLog
        fields = ["id", "user_name", "action", "model", "object_id", "summary", "at"]

    def get_user_name(self, o):
        return (o.user.get_full_name() or o.user.username) if o.user else "—"
