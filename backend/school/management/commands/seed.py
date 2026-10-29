import random
from datetime import date, time
from decimal import Decimal

from django.core.management.base import BaseCommand

from school import models as m

LEVELS = [("preschool", ["Petite section", "Moyenne section", "Grande section"]),
          ("primary", ["CI", "CP", "CE1", "CE2", "CM1", "CM2"]),
          ("middle", ["Sixième", "Cinquième", "Quatrième", "Troisième"]),
          ("high", ["Seconde", "Première", "Terminale"])]
FEES = {"preschool": 15000, "primary": 20000, "middle": 25000, "high": 30000}
FIRST = ["Awa", "Moussa", "Fatou", "Ibrahima", "Aminata", "Cheikh", "Khady", "Mamadou", "Mariama", "Ousmane"]
LAST = ["Diop", "Ndiaye", "Sow", "Fall", "Ba", "Sarr", "Diallo", "Gueye", "Sy", "Faye", "Mbaye", "Thiam"]


class Command(BaseCommand):
    help = "Données de démonstration fictives. Comptes : directeur, secretaire, comptable, enseignant (mot de passe lumiere2026)."

    def handle(self, *a, **kw):
        U = m.User.objects
        for u, role in [("directeur", "director"), ("secretaire", "secretary"), ("comptable", "accountant"), ("enseignant", "teacher")]:
            if not U.filter(username=u).exists():
                U.create_user(u, password="lumiere2026", role=role, first_name=u.capitalize(),
                              is_staff=role == "director", is_superuser=role == "director")
        pos, rooms = 0, []
        for level, names in LEVELS:
            for n in names:
                pos += 1
                rooms.append(m.ClassRoom.objects.get_or_create(name=n, school_year="2026-2027", defaults={"level": level, "position": pos})[0])
        random.seed(7)
        if not m.Student.objects.exists():
            for room in rooms:
                for _ in range(3):
                    st = m.Student.objects.create(
                        first_name=random.choice(FIRST), last_name=random.choice(LAST), sex=random.choice("MF"),
                        classroom=room, monthly_fee=FEES[room.level], registration_fee=25000, guardian_name="Parent",
                        guardian_phone=f"77 {random.randint(100, 999)} {random.randint(10, 99)} {random.randint(10, 99)}",
                        enrolled_on=date(2026, 9, 1))
                    m.Income.objects.create(date=date(2026, 9, 1), category="registration", label=f"Frais d’inscription — {st.full_name}", amount=25000, method="cash")
                    for mo in (9, 10):
                        r = random.random()
                        if r < 0.7:
                            m.Payment.objects.create(student=st, month=date(2026, mo, 1), amount=st.monthly_fee, paid_on=date(2026, mo, 5), method=random.choice(["cash", "wave", "orange"]))
                        elif r < 0.85:
                            m.Payment.objects.create(student=st, month=date(2026, mo, 1), amount=st.monthly_fee // 2, paid_on=date(2026, mo, 8), method="wave")
        if not m.Teacher.objects.exists():
            t1 = m.Teacher.objects.create(first_name="Alioune", last_name="Seck", subjects="Mathématiques", weekly_hours=18, hourly_rate=2500, user=U.get(username="enseignant"))
            t2 = m.Teacher.objects.create(first_name="Ndeye", last_name="Ndao", subjects="Français", weekly_hours=20, fixed_salary=150000)
            t3 = m.Teacher.objects.create(first_name="Lamine", last_name="Camara", subjects="Anglais", weekly_hours=12, hourly_rate=2500)
            tro, sec = m.ClassRoom.objects.get(name="Troisième"), m.ClassRoom.objects.get(name="Seconde")
            for t, room, sub, h in [(t1, tro, "Mathématiques", 6), (t1, sec, "Mathématiques", 5), (t2, tro, "Français", 6), (t3, sec, "Anglais", 4)]:
                m.TeachingAssignment.objects.create(teacher=t, classroom=room, subject=sub, weekly_hours=h)
                m.ClassSubject.objects.get_or_create(classroom=room, name=sub, defaults={"coefficient": Decimal("3") if sub != "Anglais" else Decimal("2"), "teacher": t})
            m.TimetableSlot.objects.create(classroom=tro, teacher=t1, subject="Mathématiques", weekday=1, start=time(8), end=time(10), room="Salle 4")
            m.TimetableSlot.objects.create(classroom=tro, teacher=t2, subject="Français", weekday=1, start=time(10), end=time(12), room="Salle 4")
            m.TimetableSlot.objects.create(classroom=sec, teacher=t3, subject="Anglais", weekday=2, start=time(8), end=time(10), room="Salle 7")
            m.TeacherAbsence.objects.create(teacher=t1, date=date(2026, 10, 12), hours=2, replaced_by=t3, note="Maladie")
            for cs in m.ClassSubject.objects.all():
                for title, kind in (("Devoir 1", "homework"), ("Composition", "exam")):
                    ev = m.Evaluation.objects.create(class_subject=cs, term=1, title=title, kind=kind, date=date(2026, 10, 20))
                    for st in cs.classroom.students.all():
                        m.Grade.objects.create(evaluation=ev, student=st, score=Decimal(str(round(random.uniform(6, 19), 2))))
            for st in tro.students.all():
                m.Absence.objects.create(student=st, date=date(2026, 10, 14), kind=random.choice(["absent", "late"]), justified=random.random() < .5)
        if not m.Expense.objects.exists():
            m.Expense.objects.create(date=date(2026, 10, 2), label="Facture d’électricité", category="electricity", amount=150000)
            m.Expense.objects.create(date=date(2026, 10, 5), label="Achat de fournitures", category="supplies", amount=75000, method="wave")
        c = m.SchoolSettings.get(); c.opening_balance = 1000000; c.save()
        self.stdout.write(self.style.SUCCESS("Données de démonstration créées."))
