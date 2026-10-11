from pathlib import Path
from xml.sax.saxutils import escape

from docx import Document
from docx.document import Document as _Document
from docx.table import Table as DocxTable
from docx.text.paragraph import Paragraph as DocxParagraph
from docx.oxml.ns import qn
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    KeepTogether,
    NextPageTemplate,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
INPUT = ROOT / "artifacts" / "discovery" / "voprosy-dlya-obsuzhdeniya-kontseptsii.docx"
OUTPUT_DIR = ROOT / "output" / "pdf"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT = OUTPUT_DIR / "voprosy-dlya-obsuzhdeniya-kontseptsii.pdf"

pdfmetrics.registerFont(TTFont("Arial", "/System/Library/Fonts/Supplemental/Arial.ttf"))
pdfmetrics.registerFont(TTFont("Arial-Bold", "/System/Library/Fonts/Supplemental/Arial Bold.ttf"))
pdfmetrics.registerFont(TTFont("Arial-Italic", "/System/Library/Fonts/Supplemental/Arial Italic.ttf"))
pdfmetrics.registerFont(TTFont("Arial-BoldItalic", "/System/Library/Fonts/Supplemental/Arial Bold Italic.ttf"))
pdfmetrics.registerFontFamily(
    "Arial",
    normal="Arial",
    bold="Arial-Bold",
    italic="Arial-Italic",
    boldItalic="Arial-BoldItalic",
)

INK = colors.HexColor("#0B2545")
BLUE = colors.HexColor("#2E74B5")
BLUE_DARK = colors.HexColor("#1F4D78")
MUTED = colors.HexColor("#5C6773")
BORDER = colors.HexColor("#CCD6E0")


def normalize_text(text):
    return text.replace("—", " - ").replace("–", "-").replace("‑", "-")


def run_markup(paragraph):
    parts = []
    for run in paragraph.runs:
        text = escape(normalize_text(run.text)).replace("\n", "<br/>")
        if not text:
            continue
        if run.bold and run.italic:
            text = f"<b><i>{text}</i></b>"
        elif run.bold:
            text = f"<b>{text}</b>"
        elif run.italic:
            text = f"<i>{text}</i>"
        parts.append(text)
    return "".join(parts) or escape(normalize_text(paragraph.text)).replace("\n", "<br/>")


def iter_blocks(parent):
    parent_elm = parent.element.body if isinstance(parent, _Document) else parent._tc
    for child in parent_elm.iterchildren():
        if child.tag == qn("w:p"):
            yield DocxParagraph(child, parent)
        elif child.tag == qn("w:tbl"):
            yield DocxTable(child, parent)


styles = getSampleStyleSheet()
body = ParagraphStyle(
    "BodyRu",
    parent=styles["BodyText"],
    fontName="Arial",
    fontSize=9.6,
    leading=12.3,
    textColor=INK,
    spaceAfter=5,
    splitLongWords=True,
)
h1 = ParagraphStyle(
    "H1Ru",
    parent=body,
    fontName="Arial-Bold",
    fontSize=15,
    leading=17,
    textColor=BLUE,
    spaceBefore=14,
    spaceAfter=8,
    keepWithNext=True,
)
h2 = ParagraphStyle(
    "H2Ru",
    parent=body,
    fontName="Arial-Bold",
    fontSize=11.5,
    leading=14,
    textColor=BLUE_DARK,
    spaceBefore=10,
    spaceAfter=5,
    keepWithNext=True,
)
h3 = ParagraphStyle(
    "H3Ru",
    parent=body,
    fontName="Arial-Bold",
    fontSize=10.5,
    leading=13,
    textColor=BLUE_DARK,
    spaceBefore=8,
    spaceAfter=4,
    keepWithNext=True,
)
bullet = ParagraphStyle(
    "BulletRu",
    parent=body,
    leftIndent=16,
    firstLineIndent=-8,
    bulletIndent=2,
    spaceAfter=3,
)
numbered = ParagraphStyle(
    "NumberedRu",
    parent=body,
    leftIndent=18,
    firstLineIndent=-12,
    spaceAfter=3,
)
kicker = ParagraphStyle(
    "KickerRu",
    parent=body,
    fontName="Arial-Bold",
    fontSize=8.5,
    leading=10,
    textColor=BLUE,
    spaceAfter=7,
)
title = ParagraphStyle(
    "TitleRu",
    parent=body,
    fontName="Arial-Bold",
    fontSize=25,
    leading=28,
    textColor=INK,
    spaceAfter=7,
)
subtitle = ParagraphStyle(
    "SubtitleRu",
    parent=body,
    fontName="Arial",
    fontSize=12,
    leading=15,
    textColor=MUTED,
    spaceAfter=14,
)
why_style = ParagraphStyle(
    "WhyRu",
    parent=body,
    fontSize=9.2,
    leading=11.7,
    textColor=MUTED,
    spaceAfter=4,
    keepWithNext=True,
)
prompt_style = ParagraphStyle(
    "PromptRu",
    parent=body,
    spaceAfter=5,
    keepWithNext=True,
)


def page_decor(canvas, doc):
    canvas.saveState()
    width, height = letter
    canvas.setFont("Arial-Bold", 7.5)
    canvas.setFillColor(BLUE)
    canvas.drawString(0.75 * inch, height - 0.48 * inch, "DISCOVERY BRIEF")
    canvas.setFont("Arial", 7.5)
    canvas.setFillColor(MUTED)
    canvas.drawString(1.72 * inch, height - 0.48 * inch, "|  Площадка по технике и услугам")
    canvas.setStrokeColor(BORDER)
    canvas.setLineWidth(0.45)
    canvas.line(0.75 * inch, height - 0.58 * inch, width - 0.75 * inch, height - 0.58 * inch)
    canvas.setFont("Arial", 8)
    canvas.drawRightString(width - 0.75 * inch, 0.48 * inch, f"Страница {doc.page}")
    canvas.restoreState()


class ReviewDocTemplate(BaseDocTemplate):
    def __init__(self, filename):
        super().__init__(
            filename,
            pagesize=letter,
            leftMargin=0.75 * inch,
            rightMargin=0.75 * inch,
            topMargin=0.73 * inch,
            bottomMargin=0.68 * inch,
            title="Вопросы для обсуждения концепции проекта",
            author="Проектная команда",
            subject="Discovery brief для встречи с заказчиком",
        )
        frame = Frame(
            self.leftMargin,
            self.bottomMargin,
            self.width,
            self.height,
            id="normal",
            leftPadding=0,
            rightPadding=0,
            topPadding=0,
            bottomPadding=0,
        )
        self.addPageTemplates(PageTemplate(id="main", frames=[frame]))


def paragraph_flowable(p, number_state, after_why=False):
    text = run_markup(p)
    if not text.strip():
        return Spacer(1, 3)
    style_name = p.style.name if p.style else ""
    plain = normalize_text(p.text).strip()
    if style_name == "Heading 1":
        return Paragraph(text, h1)
    if style_name == "Heading 2":
        return Paragraph(text, h2)
    if style_name == "Heading 3":
        return Paragraph(text, h3)
    if style_name.startswith("List Bullet"):
        return Paragraph(text, bullet, bulletText="•")
    if style_name.startswith("List Number"):
        number_state[0] += 1
        return Paragraph(text, numbered, bulletText=f"{number_state[0]}.")
    number_state[0] = 0
    if plain == "АНАЛИТИЧЕСКАЯ ВСТРЕЧА":
        return Paragraph(text, kicker)
    if plain.startswith("Вопросы для обсуждения"):
        return Paragraph(text, title)
    if plain.startswith("Специализированная доска"):
        return Paragraph(text, subtitle)
    if plain.startswith("Почему это важно."):
        return Paragraph(text, why_style)
    if after_why:
        return Paragraph(text, prompt_style)
    return Paragraph(text, body)


def docx_fill(cell):
    shd = cell._tc.get_or_add_tcPr().find(qn("w:shd"))
    value = shd.get(qn("w:fill")) if shd is not None else None
    return colors.HexColor(f"#{value}") if value and value != "auto" else colors.white


def table_flowable(table):
    cols = len(table.columns)
    rows = len(table.rows)
    data = []
    fills = []
    for r_idx, row in enumerate(table.rows):
        pdf_row = []
        for c_idx, cell in enumerate(row.cells):
            cell_text = "<br/>".join(
                run_markup(p) for p in cell.paragraphs if p.text.strip()
            )
            font_size = 8.3 if rows > 3 else 9.2
            cell_style = ParagraphStyle(
                f"Cell{r_idx}_{c_idx}_{id(cell)}",
                parent=body,
                fontName="Arial-Bold" if r_idx == 0 and rows > 1 else "Arial",
                fontSize=font_size,
                leading=font_size * 1.27,
                textColor=BLUE_DARK if r_idx == 0 and rows > 1 else INK,
                alignment=TA_CENTER if cols == 3 and rows == 1 else TA_LEFT,
                spaceAfter=0,
            )
            pdf_row.append(Paragraph(cell_text or " ", cell_style))
            fills.append((r_idx, c_idx, docx_fill(cell)))
        data.append(pdf_row)

    if cols == 1:
        widths = [6.5 * inch]
    elif cols == 2:
        widths = [3.0 * inch, 3.5 * inch]
    elif cols == 3:
        widths = [6.5 * inch / 3] * 3
    else:
        widths = [6.5 * inch / cols] * cols

    pdf_table = Table(
        data,
        colWidths=widths,
        repeatRows=1 if rows > 3 else 0,
        hAlign="LEFT",
        splitByRow=True,
    )
    commands = [
        ("GRID", (0, 0), (-1, -1), 0.45, BORDER),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]
    for r_idx, c_idx, fill in fills:
        commands.append(("BACKGROUND", (c_idx, r_idx), (c_idx, r_idx), fill))
    pdf_table.setStyle(TableStyle(commands))
    return pdf_table


source = Document(INPUT)
story = []
number_state = [0]
after_why = False
for block in list(iter_blocks(source)):
    if isinstance(block, DocxParagraph):
        plain = normalize_text(block.text).strip()
        if plain == "Референсы":
            story.append(PageBreak())
        story.append(paragraph_flowable(block, number_state, after_why=after_why))
        after_why = plain.startswith("Почему это важно.")
    else:
        story.append(table_flowable(block))
        story.append(Spacer(1, 5))
        after_why = False

ReviewDocTemplate(str(OUTPUT)).build(story)
print(OUTPUT)
