#!/usr/bin/env python3
"""Render the ForgeOS reference Markdown parts into one polished PDF.

Uses reportlab Platypus for guaranteed pagination and alignment:
- consistent margins; nothing bleeds past the printable frame
- cover page + auto table of contents (with page numbers) + footer page numbers
- API tables use fixed column widths with character-level word wrap so long
  paths/bodies wrap inside the cell border instead of overflowing
- code/JSON blocks render in a bordered, shaded box with character-level wrap

Run:  python3 docs/forgeos/build_pdf.py
Output: docs/forgeos/ForgeOS_Reference.pdf
"""

from __future__ import annotations

import os
import re

from reportlab.lib import colors
from reportlab.lib.enums import TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)
from reportlab.platypus.tableofcontents import TableOfContents

HERE = os.path.dirname(os.path.abspath(__file__))
PARTS = [
    "01_overview_workflow.md",
    "02_api_reference.md",
    "03_test_catalog.md",
]
OUTPUT = os.path.join(HERE, "ForgeOS_Reference.pdf")

MARGIN = 1.8 * cm
PAGE_W, PAGE_H = A4
PRINTABLE_W = PAGE_W - 2 * MARGIN


# ── Styles ───────────────────────────────────────────────────────────────

def build_styles():
    ss = getSampleStyleSheet()
    styles = {}
    styles["Title"] = ParagraphStyle(
        "DocTitle", parent=ss["Title"], fontSize=26, leading=30, spaceAfter=10,
        textColor=colors.HexColor("#1a2233"),
    )
    styles["Subtitle"] = ParagraphStyle(
        "DocSubtitle", parent=ss["Normal"], fontSize=12, leading=16,
        textColor=colors.HexColor("#5a6472"),
    )
    styles["H1"] = ParagraphStyle(
        "H1", parent=ss["Heading1"], fontSize=18, leading=22, spaceBefore=14,
        spaceAfter=8, textColor=colors.HexColor("#15233b"),
    )
    styles["H2"] = ParagraphStyle(
        "H2", parent=ss["Heading2"], fontSize=14, leading=18, spaceBefore=10,
        spaceAfter=6, textColor=colors.HexColor("#1f3350"),
    )
    styles["H3"] = ParagraphStyle(
        "H3", parent=ss["Heading3"], fontSize=11.5, leading=15, spaceBefore=8,
        spaceAfter=4, textColor=colors.HexColor("#33424f"),
    )
    styles["Body"] = ParagraphStyle(
        "Body", parent=ss["Normal"], fontSize=9.5, leading=13.5, spaceAfter=6,
        alignment=TA_JUSTIFY, textColor=colors.HexColor("#222a33"),
    )
    styles["Bullet"] = ParagraphStyle(
        "Bullet", parent=ss["Normal"], fontSize=9.5, leading=13, spaceAfter=2,
        leftIndent=12, bulletIndent=2, alignment=TA_LEFT,
        textColor=colors.HexColor("#222a33"),
    )
    styles["Code"] = ParagraphStyle(
        "Code", parent=ss["Normal"], fontName="Courier", fontSize=8.2,
        leading=11, textColor=colors.HexColor("#1d2733"),
        backColor=colors.HexColor("#f3f4f6"), borderColor=colors.HexColor("#d4d8de"),
        borderWidth=0.5, borderPadding=6, spaceBefore=4, spaceAfter=8,
        wordWrap="CJK",
    )
    styles["TableHead"] = ParagraphStyle(
        "TableHead", parent=ss["Normal"], fontName="Helvetica-Bold", fontSize=8.6,
        leading=11, textColor=colors.white, wordWrap="CJK",
    )
    styles["TableCell"] = ParagraphStyle(
        "TableCell", parent=ss["Normal"], fontSize=8.4, leading=11,
        textColor=colors.HexColor("#222a33"), wordWrap="CJK",
    )
    styles["TOCHeading"] = ParagraphStyle(
        "TOCHeading", parent=ss["Heading1"], fontSize=18, leading=22,
        textColor=colors.HexColor("#15233b"),
    )
    return styles


# ── Inline markup (escape then apply bold/code) ──────────────────────────

def inline(text: str) -> str:
    out = (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )
    out = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", out)
    out = re.sub(r"`(.+?)`", r'<font face="Courier" size="8.4">\1</font>', out)
    return out


def code_markup(lines: list[str]) -> str:
    rendered = []
    for ln in lines:
        esc = (
            ln.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            .replace(" ", "&nbsp;")
        )
        rendered.append(esc)
    return "<br/>".join(rendered) or "&nbsp;"


# ── Markdown -> flowables ────────────────────────────────────────────────

def parse_table(block: list[str], styles) -> Table:
    rows = []
    for i, line in enumerate(block):
        if i == 1 and set(line.replace("|", "").strip()) <= {"-", ":", " "}:
            continue  # separator row
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        rows.append(cells)
    if not rows:
        return None
    ncols = max(len(r) for r in rows)
    rows = [r + [""] * (ncols - len(r)) for r in rows]

    header, body = rows[0], rows[1:]
    data = [[Paragraph(inline(c), styles["TableHead"]) for c in header]]
    for r in body:
        data.append([Paragraph(inline(c), styles["TableCell"]) for c in r])

    col_w = PRINTABLE_W / ncols
    table = Table(data, colWidths=[col_w] * ncols, repeatRows=1, hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2f3e54")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f6f7f9")]),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#cdd2da")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    return table


def markdown_to_flowables(text: str, styles) -> list:
    flow = []
    lines = text.split("\n")
    i = 0
    n = len(lines)
    while i < n:
        line = lines[i]

        # Fenced code block
        if line.strip().startswith("```"):
            i += 1
            code_lines = []
            while i < n and not lines[i].strip().startswith("```"):
                code_lines.append(lines[i])
                i += 1
            i += 1  # consume closing fence
            flow.append(Paragraph(code_markup(code_lines), styles["Code"]))
            continue

        # Table block
        if line.strip().startswith("|"):
            block = []
            while i < n and lines[i].strip().startswith("|"):
                block.append(lines[i])
                i += 1
            table = parse_table(block, styles)
            if table is not None:
                flow.append(table)
                flow.append(Spacer(1, 6))
            continue

        stripped = line.strip()
        if not stripped:
            i += 1
            continue

        if stripped.startswith("### "):
            flow.append(Paragraph(inline(stripped[4:]), styles["H3"]))
        elif stripped.startswith("## "):
            flow.append(Paragraph(inline(stripped[3:]), styles["H2"]))
        elif stripped.startswith("# "):
            flow.append(Paragraph(inline(stripped[2:]), styles["H1"]))
        elif stripped.startswith("- "):
            flow.append(Paragraph(inline(stripped[2:]), styles["Bullet"], bulletText="\u2022"))
        else:
            # Gather a paragraph until a blank line or a block starter.
            para = [stripped]
            i += 1
            while i < n:
                nxt = lines[i].strip()
                if (not nxt or nxt.startswith(("#", "- ", "|", "```"))):
                    break
                para.append(nxt)
                i += 1
            flow.append(Paragraph(inline(" ".join(para)), styles["Body"]))
            continue
        i += 1
    return flow


# ── Document template with TOC + footer page numbers ─────────────────────

class ForgeDoc(BaseDocTemplate):
    def __init__(self, filename, **kw):
        super().__init__(filename, **kw)
        frame = Frame(MARGIN, MARGIN, PRINTABLE_W, PAGE_H - 2 * MARGIN, id="body")
        self.addPageTemplates([
            PageTemplate(id="main", frames=[frame], onPage=self._footer),
        ])

    @staticmethod
    def _footer(canvas, doc):
        canvas.saveState()
        canvas.setStrokeColor(colors.HexColor("#d4d8de"))
        canvas.setLineWidth(0.4)
        canvas.line(MARGIN, MARGIN - 0.5 * cm, PAGE_W - MARGIN, MARGIN - 0.5 * cm)
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(colors.HexColor("#8a93a0"))
        canvas.drawString(MARGIN, MARGIN - 0.9 * cm, "ForgeOS Reference")
        canvas.drawRightString(PAGE_W - MARGIN, MARGIN - 0.9 * cm, f"Page {doc.page}")
        canvas.restoreState()

    def afterFlowable(self, flowable):
        if not isinstance(flowable, Paragraph):
            return
        name = flowable.style.name
        level = {"H1": 0, "H2": 1, "H3": 2}.get(name)
        if level is None:
            return
        text = flowable.getPlainText()
        self.notify("TOCEntry", (level, text, self.page))


def build():
    styles = build_styles()

    cover = [
        Spacer(1, 5 * cm),
        Paragraph("ForgeOS", styles["Title"]),
        Paragraph("Reference Manual", styles["Title"]),
        Spacer(1, 0.6 * cm),
        Paragraph(
            "End-to-end workflow, REST API reference, and the full test catalog "
            "for the AI demand-to-delivery platform.",
            styles["Subtitle"],
        ),
        PageBreak(),
    ]

    toc = TableOfContents()
    toc.levelStyles = [
        ParagraphStyle("TOC0", fontName="Helvetica-Bold", fontSize=11, leading=18,
                       textColor=colors.HexColor("#15233b")),
        ParagraphStyle("TOC1", fontSize=9.5, leading=15, leftIndent=14,
                       textColor=colors.HexColor("#33424f")),
        ParagraphStyle("TOC2", fontSize=9, leading=13, leftIndent=28,
                       textColor=colors.HexColor("#5a6472")),
    ]
    toc_section = [
        Paragraph("Table of Contents", styles["TOCHeading"]),
        Spacer(1, 0.4 * cm),
        toc,
        PageBreak(),
    ]

    body = []
    for idx, part in enumerate(PARTS):
        with open(os.path.join(HERE, part), "r", encoding="utf-8") as fh:
            body.extend(markdown_to_flowables(fh.read(), styles))
        if idx < len(PARTS) - 1:
            body.append(PageBreak())

    story = cover + toc_section + body
    doc = ForgeDoc(OUTPUT, pagesize=A4)
    doc.multiBuild(story)
    print(f"Wrote {OUTPUT}")


if __name__ == "__main__":
    build()
