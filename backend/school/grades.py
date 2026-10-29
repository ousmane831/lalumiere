from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from . import models as m


def term_name(settings, term):
    return f"{'Trimestre' if settings.term_system == 'trimester' else 'Semestre'} {term}"


def appreciation(avg):
    if avg is None:
        return ""
    return "Très bien" if avg >= 16 else "Bien" if avg >= 14 else "Assez bien" if avg >= 12 else "Passable" if avg >= 10 else "Insuffisant"


def class_results(classroom, term):
    """Moyenne par matière = moyenne pondérée des évaluations ramenées sur 20 (composition ×2, devoir ×1).
    Moyenne générale = moyenne des matières pondérée par les coefficients. Rang dans la classe."""
    subjects = list(m.ClassSubject.objects.filter(classroom=classroom))
    students = list(m.Student.objects.filter(classroom=classroom, status="active"))
    acc = {}
    for g in m.Grade.objects.filter(evaluation__class_subject__classroom=classroom, evaluation__term=term,
                                    score__isnull=False).select_related("evaluation"):
        ev = g.evaluation
        a = acc.setdefault((g.student_id, ev.class_subject_id), [0.0, 0])
        a[0] += float(g.score) / ev.max_score * 20 * ev.weight
        a[1] += ev.weight
    remarks = {r.student_id: r.comment for r in m.BulletinRemark.objects.filter(classroom=classroom, term=term)}
    rows = []
    for st in students:
        av, num, den = {}, 0.0, 0.0
        for sub in subjects:
            a = acc.get((st.id, sub.id))
            if a and a[1]:
                v = a[0] / a[1]
                av[sub.id] = round(v, 2)
                num += v * float(sub.coefficient)
                den += float(sub.coefficient)
        rows.append({"student": st.id, "name": st.full_name, "averages": av, "general": round(num / den, 2) if den else None,
                     "rank": None, "remark": remarks.get(st.id, "")})
    ranked = sorted([r for r in rows if r["general"] is not None], key=lambda r: -r["general"])
    for i, r in enumerate(ranked):
        r["rank"] = i + 1 if i == 0 or r["general"] != ranked[i - 1]["general"] else ranked[i - 1]["rank"]
    cls = {}
    for sub in subjects:
        vals = [r["averages"][sub.id] for r in rows if sub.id in r["averages"]]
        cls[sub.id] = round(sum(vals) / len(vals), 2) if vals else None
    gens = [r["general"] for r in rows if r["general"] is not None]
    return {"subjects": [{"id": s.id, "name": s.name, "coefficient": float(s.coefficient), "teacher": s.teacher.full_name if s.teacher else ""} for s in subjects],
            "rows": rows, "class_averages": cls, "class_size": len(students),
            "class_general": round(sum(gens) / len(gens), 2) if gens else None}


def bulletin_pdf(student, term):
    st = m.SchoolSettings.get()
    res = class_results(student.classroom, term)
    row = next((r for r in res["rows"] if r["student"] == student.id), None) or {"averages": {}, "general": None, "rank": None, "remark": ""}
    ab = student.absences.all()
    ss = getSampleStyleSheet()
    cell = ss["Normal"].clone("cell", fontSize=9)
    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=16 * mm, rightMargin=16 * mm, topMargin=14 * mm, bottomMargin=14 * mm)
    head = [Paragraph(f"<b><font size=16>{st.name}</font></b><br/>{st.address}<br/>{st.phone}", ss["Normal"])]
    try:
        if st.logo:
            head.insert(0, Image(st.logo.path, width=20 * mm, height=20 * mm))
    except Exception:
        pass
    el = [Table([head], colWidths=[24 * mm, 140 * mm] if len(head) == 2 else [164 * mm]), Spacer(1, 6),
          Paragraph(f"<b><font size=14>BULLETIN DE NOTES — {term_name(st, term)}</font></b>", ss["Title"]),
          Paragraph(f"<b>Élève :</b> {student.full_name} &nbsp;&nbsp; <b>Matricule :</b> {student.matricule}<br/>"
                    f"<b>Classe :</b> {student.classroom.name} ({student.classroom.school_year}) &nbsp;&nbsp; <b>Effectif :</b> {res['class_size']}", ss["Normal"]),
          Spacer(1, 8)]
    data = [["Matière", "Coef.", "Moy. élève /20", "Moy. classe /20", "Appréciation"]]
    for s in res["subjects"]:
        v = row["averages"].get(s["id"])
        data.append([Paragraph(f"{s['name']}<br/><font size=7 color='#667'>{s['teacher']}</font>", cell), s["coefficient"],
                     "—" if v is None else f"{v:.2f}", "—" if res["class_averages"][s["id"]] is None else f"{res['class_averages'][s['id']]:.2f}", appreciation(v)])
    t = Table(data, colWidths=[62 * mm, 16 * mm, 32 * mm, 32 * mm, 22 * mm], repeatRows=1)
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0f1c3f")), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                           ("FONTSIZE", (0, 0), (-1, -1), 9), ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#bbc")),
                           ("ALIGN", (1, 0), (-1, -1), "CENTER"), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                           ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f3f5fa")])]))
    g = row["general"]
    el += [t, Spacer(1, 10),
           Paragraph(f"<b>Moyenne générale : {'—' if g is None else f'{g:.2f} / 20'}</b> &nbsp;&nbsp; <b>Rang :</b> "
                     f"{'—' if row['rank'] is None else f'{row['rank']} / {res['class_size']}'} &nbsp;&nbsp; <b>Mention :</b> {appreciation(g) or '—'}<br/>"
                     f"Moyenne générale de la classe : {'—' if res['class_general'] is None else res['class_general']}", ss["Normal"]),
           Spacer(1, 6),
           Paragraph(f"<b>Assiduité :</b> {ab.filter(kind='absent').count()} absence(s) dont {ab.filter(kind='absent', justified=True).count()} justifiée(s), "
                     f"{ab.filter(kind='late').count()} retard(s).", ss["Normal"]),
           Spacer(1, 6), Paragraph(f"<b>Appréciation du directeur :</b> {row['remark'] or '………………………………………………………'}", ss["Normal"]),
           Spacer(1, 26), Paragraph("Le Directeur &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Signature des parents", ss["Normal"])]
    doc.build(el)
    return buf.getvalue()
