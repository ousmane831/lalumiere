from io import BytesIO

from reportlab.lib.pagesizes import A5
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader

from . import models as m
from .services import paid_map, student_months


def fcfa(n):
    return f"{n:,} FCFA".replace(",", " ")


def receipt_pdf(p):
    s, cfg = p.student, m.SchoolSettings.get()
    key = p.month.strftime("%Y-%m")
    cur = next((x for x in student_months(s, p.month, paid_map(p.month)) if x["month"] == key), None)
    left = cur["remaining"] if cur else 0
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=A5)
    w, h = A5
    c.setFillColorRGB(0.06, 0.11, 0.25); c.rect(0, h - 30 * mm, w, 30 * mm, fill=1, stroke=0)
    drawn = False
    if cfg.logo:
        try:
            c.drawImage(ImageReader(cfg.logo.path), 10 * mm, h - 25 * mm, 20 * mm, 20 * mm, mask="auto", preserveAspectRatio=True); drawn = True
        except Exception:
            pass
    if not drawn:
        c.setFillColorRGB(0.96, 0.72, 0.18); c.circle(20 * mm, h - 15 * mm, 7 * mm, fill=1, stroke=0)
    c.setFillColorRGB(1, 1, 1); c.setFont("Helvetica-Bold", 19); c.drawString(34 * mm, h - 15 * mm, cfg.name)
    c.setFont("Helvetica", 9); c.drawString(34 * mm, h - 21 * mm, "Reçu de paiement"); c.drawString(34 * mm, h - 26 * mm, " · ".join(x for x in (cfg.address, cfg.phone) if x))
    c.setFillColorRGB(0, 0, 0); c.setFont("Helvetica-Bold", 12)
    c.drawString(15 * mm, h - 42 * mm, f"Reçu n° {p.receipt_no}")
    rows = [("Élève", s.full_name), ("Matricule", s.matricule or ""), ("Classe", s.classroom.name),
            ("Mois payé", p.month.strftime("%m/%Y")), ("Montant reçu", fcfa(p.amount)),
            ("Reste à payer", fcfa(left)), ("Mode de paiement", p.get_method_display()),
            ("Référence", p.reference or "—"), ("Date", p.paid_on.strftime("%d/%m/%Y")),
            ("Caissier", (p.received_by.get_full_name() or p.received_by.username) if p.received_by else "—")]
    y = h - 54 * mm
    for k, v in rows:
        c.setFont("Helvetica", 10); c.setFillColorRGB(0.4, 0.4, 0.45); c.drawString(15 * mm, y, k)
        c.setFont("Helvetica-Bold", 11); c.setFillColorRGB(0, 0, 0); c.drawString(55 * mm, y, str(v))
        y -= 8 * mm
    c.setFont("Helvetica-Oblique", 8); c.setFillColorRGB(0.4, 0.4, 0.45)
    c.drawString(15 * mm, 12 * mm, "Merci de conserver ce reçu.")
    c.showPage(); c.save()
    return buf.getvalue()
