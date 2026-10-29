from datetime import date

from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    class Role(models.TextChoices):
        DIRECTOR = "director", "Directeur"
        SECRETARY = "secretary", "Secrétariat"
        ACCOUNTANT = "accountant", "Comptable / Caissier"
        TEACHER = "teacher", "Enseignant"

    role = models.CharField(max_length=12, choices=Role.choices, default=Role.SECRETARY)


class ClassRoom(models.Model):
    LEVELS = [("preschool", "Préscolaire"), ("primary", "Élémentaire"), ("middle", "Collège"), ("high", "Lycée")]
    name = models.CharField(max_length=40)
    level = models.CharField(max_length=10, choices=LEVELS)
    school_year = models.CharField(max_length=9, default="2026-2027")
    position = models.PositiveSmallIntegerField(default=0)

    class Meta:
        verbose_name = "classe"
        unique_together = ("name", "school_year")
        ordering = ["position", "name"]

    def __str__(self):
        return f"{self.name} ({self.school_year})"


class Student(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "active", "Inscrit"
        LEFT = "left", "Parti"

    matricule = models.CharField(max_length=20, unique=True, null=True, blank=True, editable=False)
    first_name = models.CharField(max_length=80)
    last_name = models.CharField(max_length=80)
    birth_date = models.DateField(null=True, blank=True)
    sex = models.CharField(max_length=1, choices=[("M", "Garçon"), ("F", "Fille")], default="M")
    address = models.CharField(max_length=200, blank=True)
    photo = models.ImageField(upload_to="students/", null=True, blank=True)
    guardian_name = models.CharField(max_length=120, blank=True)
    guardian_phone = models.CharField(max_length=30, blank=True)
    classroom = models.ForeignKey(ClassRoom, on_delete=models.PROTECT, related_name="students")
    enrolled_on = models.DateField(default=date.today)
    registration_fee = models.PositiveIntegerField(default=0)
    monthly_fee = models.PositiveIntegerField()
    status = models.CharField(max_length=8, choices=Status.choices, default=Status.ACTIVE)

    class Meta:
        verbose_name = "élève"
        ordering = ["last_name", "first_name"]

    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}".strip()

    def save(self, *args, **kwargs):
        new = self.pk is None
        super().save(*args, **kwargs)
        if not self.matricule:
            self.matricule = f"LUM{self.enrolled_on.year}{self.pk:05d}"
            super().save(update_fields=["matricule"])
        if new:
            Enrollment.objects.create(student=self, classroom=self.classroom,
                                      enrolled_on=self.enrolled_on, registration_fee=self.registration_fee)

    def __str__(self):
        return self.full_name


class Enrollment(models.Model):
    """Historique scolaire : une ligne par inscription ou réinscription."""
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name="enrollments")
    classroom = models.ForeignKey(ClassRoom, on_delete=models.PROTECT)
    enrolled_on = models.DateField(default=date.today)
    registration_fee = models.PositiveIntegerField(default=0)

    class Meta:
        verbose_name = "inscription"
        ordering = ["-enrolled_on", "-id"]


class Payment(models.Model):
    METHODS = [("cash", "Espèces"), ("wave", "Wave"), ("orange", "Orange Money"), ("bank", "Virement bancaire")]
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name="payments")
    month = models.DateField(help_text="Mensualité concernée (1er du mois)")
    amount = models.PositiveIntegerField()
    paid_on = models.DateField(default=date.today)
    method = models.CharField(max_length=8, choices=METHODS, default="cash")
    reference = models.CharField(max_length=80, blank=True)
    received_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)

    class Meta:
        verbose_name = "paiement"
        ordering = ["-paid_on", "-id"]

    def save(self, *args, **kwargs):
        self.month = self.month.replace(day=1)
        super().save(*args, **kwargs)

    @property
    def receipt_no(self):
        return f"R-{self.pk:06d}"

    def __str__(self):
        return f"{self.receipt_no} · {self.student} · {self.amount} FCFA ({self.month:%m/%Y})"


class Teacher(models.Model):
    CONTRACTS = [("cdi", "CDI"), ("cdd", "CDD"), ("part", "Vacataire")]
    user = models.OneToOneField(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    first_name = models.CharField(max_length=80)
    last_name = models.CharField(max_length=80)
    phone = models.CharField(max_length=30, blank=True)
    address = models.CharField(max_length=200, blank=True)
    subjects = models.CharField(max_length=200, blank=True)
    hired_on = models.DateField(default=date.today)
    contract = models.CharField(max_length=5, choices=CONTRACTS, default="cdi")
    weekly_hours = models.PositiveSmallIntegerField(default=0)
    hourly_rate = models.PositiveIntegerField(default=0, help_text="FCFA / heure, 0 si salaire fixe")
    fixed_salary = models.PositiveIntegerField(default=0, help_text="FCFA / mois, 0 si payé à l'heure")

    class Meta:
        verbose_name = "enseignant"
        ordering = ["last_name", "first_name"]

    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}".strip()

    def __str__(self):
        return self.full_name


class TeachingAssignment(models.Model):
    teacher = models.ForeignKey(Teacher, on_delete=models.CASCADE, related_name="assignments")
    classroom = models.ForeignKey(ClassRoom, on_delete=models.CASCADE)
    subject = models.CharField(max_length=80)
    weekly_hours = models.PositiveSmallIntegerField(default=0)

    class Meta:
        verbose_name = "affectation"

    def __str__(self):
        return f"{self.teacher} · {self.subject} · {self.classroom.name}"


class TimetableSlot(models.Model):
    DAYS = [(1, "Lundi"), (2, "Mardi"), (3, "Mercredi"), (4, "Jeudi"), (5, "Vendredi"), (6, "Samedi")]
    classroom = models.ForeignKey(ClassRoom, on_delete=models.CASCADE, related_name="slots")
    teacher = models.ForeignKey(Teacher, on_delete=models.CASCADE, related_name="slots")
    subject = models.CharField(max_length=80)
    weekday = models.PositiveSmallIntegerField(choices=DAYS)
    start = models.TimeField()
    end = models.TimeField()
    room = models.CharField(max_length=30, blank=True)

    class Meta:
        verbose_name = "cours"
        ordering = ["weekday", "start"]

    def __str__(self):
        return f"{self.subject} · {self.classroom.name} · {self.get_weekday_display()} {self.start:%H:%M}"


class WorkedHours(models.Model):
    """Heures prévues et réalisées d'un enseignant pour un mois, et paiement du salaire."""
    teacher = models.ForeignKey(Teacher, on_delete=models.CASCADE, related_name="hours")
    month = models.DateField()
    planned_hours = models.DecimalField(max_digits=6, decimal_places=1, default=0)
    done_hours = models.DecimalField(max_digits=6, decimal_places=1, default=0)
    paid = models.BooleanField(default=False)

    class Meta:
        verbose_name = "heures mensuelles"
        unique_together = ("teacher", "month")
        ordering = ["teacher__last_name"]

    def __str__(self):
        return f"{self.teacher} · {self.month:%m/%Y}"

    @property
    def amount(self):
        t = self.teacher
        return t.fixed_salary if t.fixed_salary > 0 else int(self.done_hours * t.hourly_rate)


METHODS = Payment.METHODS


class Expense(models.Model):
    CATEGORIES = [("salaries", "Salaires des enseignants"), ("admin_salaries", "Salaires du personnel administratif"),
                  ("electricity", "Électricité"), ("water", "Eau"), ("supplies", "Fournitures scolaires"),
                  ("maintenance", "Réparations et entretien"), ("transport", "Transport"),
                  ("equipment", "Matériel informatique"), ("other", "Autres dépenses")]
    date = models.DateField(default=date.today)
    label = models.CharField(max_length=200)
    category = models.CharField(max_length=14, choices=CATEGORIES, default="other")
    amount = models.PositiveIntegerField()
    beneficiary = models.CharField(max_length=120, blank=True)
    method = models.CharField(max_length=8, choices=METHODS, default="cash")
    proof = models.FileField(upload_to="proofs/", null=True, blank=True)

    class Meta:
        verbose_name = "dépense"
        ordering = ["-date", "-id"]

    def __str__(self):
        return f"{self.label} · {self.amount} FCFA"


class Income(models.Model):
    """Recettes autres que les mensualités (les mensualités sont dans Payment)."""
    CATEGORIES = [("registration", "Frais d’inscription"), ("exam", "Frais d’examen"),
                  ("transport", "Transport scolaire"), ("canteen", "Cantine"), ("other", "Autres recettes")]
    date = models.DateField(default=date.today)
    category = models.CharField(max_length=12, choices=CATEGORIES, default="other")
    label = models.CharField(max_length=200)
    amount = models.PositiveIntegerField()
    method = models.CharField(max_length=8, choices=METHODS, default="cash")
    reference = models.CharField(max_length=80, blank=True)
    proof = models.FileField(upload_to="proofs/", null=True, blank=True)
    received_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)

    class Meta:
        verbose_name = "recette"
        ordering = ["-date", "-id"]

    def __str__(self):
        return f"{self.label} · {self.amount} FCFA"


class SchoolSettings(models.Model):
    TERMS = [("trimester", "Trimestres"), ("semester", "Semestres")]
    name = models.CharField(max_length=120, default="La Lumière")
    address = models.CharField(max_length=200, blank=True)
    phone = models.CharField(max_length=40, blank=True)
    logo = models.ImageField(upload_to="logo/", null=True, blank=True)
    opening_balance = models.IntegerField(default=0)
    term_system = models.CharField(max_length=9, choices=TERMS, default="trimester")

    class Meta:
        verbose_name = "paramètres de l’école"

    def __str__(self):
        return self.name

    @classmethod
    def get(cls):
        return cls.objects.first() or cls.objects.create()


class TeacherAbsence(models.Model):
    """Absence d'un enseignant : réduit ses heures réalisées ; un remplaçant les gagne."""
    teacher = models.ForeignKey(Teacher, on_delete=models.CASCADE, related_name="absences")
    date = models.DateField(default=date.today)
    hours = models.DecimalField(max_digits=4, decimal_places=1, default=1)
    replaced_by = models.ForeignKey(Teacher, null=True, blank=True, on_delete=models.SET_NULL, related_name="replacements")
    note = models.CharField(max_length=200, blank=True)

    class Meta:
        verbose_name = "absence d’enseignant"
        ordering = ["-date"]

    def __str__(self):
        return f"{self.teacher} · {self.date:%d/%m/%Y} · {self.hours} h"


class ClassSubject(models.Model):
    classroom = models.ForeignKey(ClassRoom, on_delete=models.CASCADE, related_name="subjects")
    name = models.CharField(max_length=80)
    coefficient = models.DecimalField(max_digits=4, decimal_places=1, default=1)
    teacher = models.ForeignKey(Teacher, null=True, blank=True, on_delete=models.SET_NULL, related_name="class_subjects")

    class Meta:
        verbose_name = "matière"
        unique_together = ("classroom", "name")
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} · {self.classroom.name}"


class Evaluation(models.Model):
    KINDS = [("homework", "Devoir"), ("exam", "Composition")]
    class_subject = models.ForeignKey(ClassSubject, on_delete=models.CASCADE, related_name="evaluations")
    term = models.PositiveSmallIntegerField(default=1)
    title = models.CharField(max_length=80)
    kind = models.CharField(max_length=8, choices=KINDS, default="homework")
    max_score = models.PositiveSmallIntegerField(default=20)
    date = models.DateField(default=date.today)

    class Meta:
        verbose_name = "évaluation"
        ordering = ["-date", "-id"]

    @property
    def weight(self):
        return 2 if self.kind == "exam" else 1

    def __str__(self):
        return f"{self.title} · {self.class_subject}"


class Grade(models.Model):
    evaluation = models.ForeignKey(Evaluation, on_delete=models.CASCADE, related_name="grades")
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name="grades")
    score = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)

    class Meta:
        verbose_name = "note"
        unique_together = ("evaluation", "student")


class BulletinRemark(models.Model):
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name="remarks")
    classroom = models.ForeignKey(ClassRoom, on_delete=models.CASCADE)
    term = models.PositiveSmallIntegerField(default=1)
    comment = models.CharField(max_length=300, blank=True)

    class Meta:
        verbose_name = "appréciation"
        unique_together = ("student", "classroom", "term")


class Absence(models.Model):
    KINDS = [("absent", "Absent"), ("late", "En retard")]
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name="absences")
    date = models.DateField(default=date.today)
    kind = models.CharField(max_length=6, choices=KINDS, default="absent")
    justified = models.BooleanField(default=False)
    reason = models.CharField(max_length=200, blank=True)
    recorded_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)

    class Meta:
        verbose_name = "absence"
        unique_together = ("student", "date")
        ordering = ["-date"]


class AuditLog(models.Model):
    """Historique des opérations importantes (qui a fait quoi, quand)."""
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    action = models.CharField(max_length=10)
    model = models.CharField(max_length=60)
    object_id = models.CharField(max_length=20, blank=True)
    summary = models.CharField(max_length=250, blank=True)
    at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "opération"
        ordering = ["-at", "-id"]
