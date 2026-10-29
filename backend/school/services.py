from datetime import date
from calendar import monthrange

from django.db.models import Sum

from .models import Payment, Student

SCHOOL_MONTHS = [9, 10, 11, 12, 1, 2, 3, 4, 5, 6]


def parse_month(value):
    try:
        y, m = (int(x) for x in str(value).split("-")[:2])
        return date(y, m, 1)
    except (ValueError, TypeError):
        t = date.today()
        return date(t.year, t.month, 1)


def month_end(d):
    return date(d.year, d.month, monthrange(d.year, d.month)[1])


def year_months(school_year):
    y = int(school_year[:4])
    return [date(y + (1 if m < 9 else 0), m, 1) for m in SCHOOL_MONTHS]


def paid_map(upto):
    rows = Payment.objects.filter(month__lte=upto).values("student_id", "month").annotate(t=Sum("amount"))
    return {(r["student_id"], r["month"]): r["t"] for r in rows}


def student_months(student, upto, pmap):
    """Une ligne par mensualité due jusqu'à `upto` : chaque mois est suivi séparément."""
    start = student.enrolled_on.replace(day=1)
    out = []
    for m in year_months(student.classroom.school_year):
        if m > upto:
            break
        if m < start:
            continue
        paid = pmap.get((student.id, m), 0)
        out.append({"month": m.strftime("%Y-%m"), "due": student.monthly_fee, "paid": paid,
                    "remaining": max(0, student.monthly_fee - paid)})
    return out


def dues(month, classroom=None):
    pmap = paid_map(month)
    qs = Student.objects.filter(status="active").select_related("classroom")
    if classroom:
        qs = qs.filter(classroom_id=classroom)
    key = month.strftime("%Y-%m")
    rows = []
    for s in qs:
        months = student_months(s, month, pmap)
        cur = next((x for x in months if x["month"] == key), None)
        if cur is None:
            continue
        arrears = sum(x["remaining"] for x in months if x["month"] != key)
        status = "paid" if cur["remaining"] == 0 else ("partial" if cur["paid"] > 0 else "none")
        rows.append({"student": s.id, "name": s.full_name, "matricule": s.matricule,
                     "classroom": s.classroom.name, "guardian_phone": s.guardian_phone,
                     "monthly_fee": s.monthly_fee, "paid": cur["paid"], "remaining": cur["remaining"],
                     "arrears": arrears, "total_due": cur["remaining"] + arrears, "status": status,
                     "months": [x for x in months if x["remaining"] > 0]})
    return rows
