"""Builds the course attendance report as a PDF (in-memory bytes).

Present is drawn as a green check, absent as a red cross — the visual
equivalent of ✅ / ❌. We draw them as small vector shapes rather than emoji so
the report renders identically on any server without an emoji font installed.
"""
from io import BytesIO
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.graphics.shapes import Drawing, Line, PolyLine
from reportlab.platypus import (
    SimpleDocTemplate,
    Table,
    TableStyle,
    Paragraph,
    Spacer,
)

GREEN = colors.HexColor("#16a34a")
RED = colors.HexColor("#dc2626")
INK = colors.HexColor("#0f172a")
MUTED = colors.HexColor("#475569")
HEADER_BG = colors.HexColor("#1e293b")
GRID = colors.HexColor("#cbd5e1")
STRIPE = colors.HexColor("#f1f5f9")


def _check() -> Drawing:
    """A small green check mark."""
    d = Drawing(11, 11)
    d.add(PolyLine([1.5, 5.5, 4, 2.5, 9, 9], strokeColor=GREEN, strokeWidth=1.6))
    return d


def _cross() -> Drawing:
    """A small red cross."""
    d = Drawing(11, 11)
    d.add(Line(2, 2, 9, 9, strokeColor=RED, strokeWidth=1.6))
    d.add(Line(2, 9, 9, 2, strokeColor=RED, strokeWidth=1.6))
    return d


def _fmt_date(value) -> str:
    if isinstance(value, datetime):
        return value.strftime("%d/%m")
    return str(value or "")


def build_attendance_pdf(data: dict) -> bytes:
    course = data["course"]
    sessions = data["sessions"]
    students = data["students"]
    total_sessions = data["total_sessions"]

    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=landscape(A4),
        leftMargin=12 * mm,
        rightMargin=12 * mm,
        topMargin=12 * mm,
        bottomMargin=12 * mm,
        title=f"Attendance — {course.title}",
    )

    title_style = ParagraphStyle(
        "ReportTitle", fontName="Helvetica-Bold", fontSize=16,
        alignment=1, textColor=INK, spaceAfter=2,
    )
    meta_style = ParagraphStyle(
        "ReportMeta", fontName="Helvetica", fontSize=9.5,
        alignment=1, textColor=MUTED, leading=14,
    )
    header_cell = ParagraphStyle(
        "HeaderCell", fontName="Helvetica-Bold", fontSize=7.5,
        alignment=1, textColor=colors.white, leading=9,
    )
    name_cell = ParagraphStyle(
        "NameCell", fontName="Helvetica", fontSize=8, textColor=INK, leading=10,
    )
    small_center = ParagraphStyle(
        "SmallCenter", fontName="Helvetica", fontSize=8,
        alignment=1, textColor=INK, leading=10,
    )

    elements = []

    # --- Centered heading block ---
    elements.append(Paragraph(course.title or "Course", title_style))
    meta_lines = [
        f"Course ID: {course.code or '—'}",
        f"Department: {course.department or '—'}",
        f"Session: {course.session_target or '—'}",
        f"Total classes: {total_sessions}",
    ]
    elements.append(Paragraph(" &nbsp;•&nbsp; ".join(meta_lines), meta_style))
    elements.append(Spacer(1, 8 * mm))

    if not students:
        elements.append(Paragraph("No students are enrolled in this course yet.", meta_style))
        doc.build(elements)
        return buffer.getvalue()

    # --- Table header ---
    header = [
        Paragraph("Student Name", header_cell),
        Paragraph("Student ID", header_cell),
    ]
    for s in sessions:
        header.append(Paragraph(f"#{s['session_number']}<br/>{_fmt_date(s['date'])}", header_cell))
    header += [
        Paragraph("Present", header_cell),
        Paragraph("Absent", header_cell),
        Paragraph("%", header_cell),
    ]

    rows = [header]
    for st in students:
        row = [
            Paragraph(st["full_name"] or "—", name_cell),
            Paragraph(str(st["student_id"]), small_center),
        ]
        for present in st["attendance"]:
            row.append(_check() if present else _cross())
        row += [
            Paragraph(str(st["present_count"]), small_center),
            Paragraph(str(st["absent_count"]), small_center),
            Paragraph(f"{st['percentage']:.0f}%", small_center),
        ]
        rows.append(row)

    # --- Column widths ---
    session_w = 15  # pt per session column
    col_widths = [95, 55] + [session_w] * len(sessions) + [34, 34, 34]

    table = Table(rows, colWidths=col_widths, repeatRows=1)
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), HEADER_BG),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (1, 0), (-1, -1), "CENTER"),
        ("ALIGN", (0, 0), (0, -1), "LEFT"),
        ("GRID", (0, 0), (-1, -1), 0.4, GRID),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 3),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3),
    ]
    # Zebra striping for readability
    for i in range(1, len(rows)):
        if i % 2 == 0:
            style.append(("BACKGROUND", (0, i), (-1, i), STRIPE))
    table.setStyle(TableStyle(style))

    elements.append(table)
    doc.build(elements)
    return buffer.getvalue()
