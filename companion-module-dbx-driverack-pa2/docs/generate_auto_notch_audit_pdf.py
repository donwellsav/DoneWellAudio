from pathlib import Path

import fitz
from reportlab.graphics.charts.barcharts import VerticalBarChart
from reportlab.graphics.shapes import Drawing, Line, Rect, String
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


ROOT = Path(__file__).resolve().parents[1]
PDF_PATH = ROOT / "output" / "pdf" / "PA2-Auto-Notch-Code-Audit.pdf"
PNG_DIR = ROOT / "tmp" / "pdfs"

COUNTS = {
    "Critical Bugs": 5,
    "High Bugs": 2,
    "Medium Bugs": 4,
    "Gaps": 11,
    "Optimizations": 4,
}

ARCHITECTURE_ROWS = [
    ("1", "lib/pa2/advisoryBridge.ts", "234", "Advisory to GEQ/PEQ mapping"),
    ("2", "hooks/usePA2Bridge.ts", "453", "Polling, auto-send, state"),
    ("3", "lib/pa2/pa2Client.ts", "226", "HTTP client"),
    ("4", "types/pa2.ts", "276", "TypeScript interfaces"),
    ("5", "companion-module.../src/main.js", "1739", "HTTP handler, TCP transport, notch tracking"),
    ("6", "companion-module.../src/pa2-protocol.js", "965", "Command builder, parser"),
]

BUGS = [
    ("B9", "Critical", "Both mode double-cuts", "Partition GEQ and PEQ ownership"),
    ("B1", "Critical", "Hybrid drops confidence and Q", "Forward advisory confidence and Q"),
    ("B4", "Critical", "/approve checks slots globally", "Allocate per output"),
    ("B10", "Critical", "Routing fails when HPF is bypassed", "Use explicit bypass/LPF logic"),
    ("B3", "Critical", "/approve returns wrong output", "Return approveOutput"),
    ("B7", "High", "GEQ corrections accumulate per cycle", "Track applied deltas"),
    ("B11", "High", "Macro keys mismatch handler contract", "Use value keys"),
    ("B6", "Medium", "Severity depth ignores Q", "Scale cut depth by Q"),
    ("B8", "Medium", "Bell filter used instead of notch", "Use notch-capable filter type"),
    ("B5", "Medium", "AbortSignal listener leak", "Use AbortSignal.any or cleanup"),
    ("B12", "Medium", "Poll vs auto-send race", "Plan writes from stable snapshots"),
]

GAPS = [
    "No closed-loop verification after notch placement",
    "No automatic notch release when advisories resolve",
    "No per-output slot ownership persistence across reconnect",
    "No AFS coordination before placing a manual notch",
    "No depth ramping from mild to aggressive cuts",
    "Panic mute setting exists but is unwired",
    "No slot prioritization when the output is full",
    "No closed-loop success metric exposed to the UI",
    "No hardware-state reconciliation before release or delete",
    "No transactional acknowledgement before ownership mutation",
    "No dedicated bridge-layer test coverage",
]

OPTIMIZATIONS = [
    ("O1", "Collapse polling and auto-send into one state cycle"),
    ("O2", "Replace custom abort fan-in with AbortSignal.any or explicit cleanup"),
    ("O3", "Reuse one planner for route, dedup, and slot allocation"),
    ("O4", "Serialize writes and batch only when ordering remains safe"),
]

RECOMMENDATIONS = [
    ("1", "B9", "Partition both mode", "2h"),
    ("2", "B1", "Forward confidence and Q", "1h"),
    ("3", "B4 + B3", "Per-output slots and correct response", "30m"),
    ("4", "B10", "Fix routing guard", "30m"),
    ("5", "B11", "Fix macro keys", "15m"),
    ("6", "B7", "Delta-only GEQ corrections", "2h"),
]


def styles():
    sample = getSampleStyleSheet()
    sample.add(
        ParagraphStyle(
            name="AuditTitle",
            parent=sample["Title"],
            fontName="Helvetica-Bold",
            fontSize=22,
            leading=26,
            textColor=colors.HexColor("#162338"),
            spaceAfter=8,
        )
    )
    sample.add(
        ParagraphStyle(
            name="AuditSubtitle",
            parent=sample["BodyText"],
            fontName="Helvetica",
            fontSize=10,
            leading=13,
            textColor=colors.HexColor("#44566C"),
            spaceAfter=6,
        )
    )
    sample.add(
        ParagraphStyle(
            name="AuditSection",
            parent=sample["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=15,
            leading=18,
            textColor=colors.HexColor("#10233F"),
            spaceBefore=6,
            spaceAfter=8,
        )
    )
    sample.add(
        ParagraphStyle(
            name="AuditBody",
            parent=sample["BodyText"],
            fontName="Helvetica",
            fontSize=9.3,
            leading=12.5,
            textColor=colors.HexColor("#223248"),
            spaceAfter=5,
        )
    )
    sample.add(
        ParagraphStyle(
            name="AuditSmall",
            parent=sample["BodyText"],
            fontName="Helvetica",
            fontSize=8.2,
            leading=10.5,
            textColor=colors.HexColor("#4B5E75"),
            spaceAfter=4,
        )
    )
    sample.add(
        ParagraphStyle(
            name="AuditCenter",
            parent=sample["BodyText"],
            fontName="Helvetica",
            fontSize=8.5,
            leading=11,
            alignment=TA_CENTER,
            textColor=colors.HexColor("#4B5E75"),
            spaceAfter=4,
        )
    )
    return sample


def p(text: str, style_name: str, style_sheet):
    return Paragraph(text.replace("\n", "<br/>"), style_sheet[style_name])


def page_frame(canvas, doc):
    width, height = letter
    canvas.saveState()
    canvas.setStrokeColor(colors.HexColor("#D7E0EA"))
    canvas.line(0.6 * inch, height - 0.52 * inch, width - 0.6 * inch, height - 0.52 * inch)
    canvas.line(0.6 * inch, 0.55 * inch, width - 0.6 * inch, 0.55 * inch)
    canvas.setFont("Helvetica-Bold", 9)
    canvas.setFillColor(colors.HexColor("#172033"))
    canvas.drawString(0.65 * inch, height - 0.38 * inch, "PA2 Auto-Notch Pipeline Audit")
    canvas.setFont("Helvetica", 8.4)
    canvas.setFillColor(colors.HexColor("#54657A"))
    canvas.drawRightString(width - 0.65 * inch, 0.36 * inch, f"Page {doc.page}")
    canvas.restoreState()


def metric_chart():
    labels = ["Critical", "High", "Medium", "Gaps", "Opts"]
    values = [
        COUNTS["Critical Bugs"],
        COUNTS["High Bugs"],
        COUNTS["Medium Bugs"],
        COUNTS["Gaps"],
        COUNTS["Optimizations"],
    ]
    palette = [
        colors.HexColor("#C44753"),
        colors.HexColor("#E59648"),
        colors.HexColor("#5B8DEF"),
        colors.HexColor("#6C8A54"),
        colors.HexColor("#7D6BB4"),
    ]
    drawing = Drawing(500, 230)
    drawing.add(
        String(
            250,
            210,
            "Audit Distribution",
            fontName="Helvetica-Bold",
            fontSize=12,
            textAnchor="middle",
            fillColor=colors.HexColor("#10233F"),
        )
    )
    chart = VerticalBarChart()
    chart.x = 40
    chart.y = 45
    chart.width = 410
    chart.height = 130
    chart.data = [tuple(values)]
    chart.categoryAxis.categoryNames = labels
    chart.categoryAxis.labels.angle = 0
    chart.categoryAxis.labels.boxAnchor = "n"
    chart.categoryAxis.labels.fontName = "Helvetica"
    chart.categoryAxis.labels.fontSize = 7.5
    chart.valueAxis.valueMin = 0
    chart.valueAxis.valueMax = 12
    chart.valueAxis.valueStep = 2
    for index, color in enumerate(palette):
        chart.bars[index].fillColor = color
    drawing.add(chart)
    drawing.add(
        String(
            250,
            18,
            "The bug load is concentrated in routing, planning, and bridge-to-hardware write behavior.",
            fontName="Helvetica",
            fontSize=8.5,
            textAnchor="middle",
            fillColor=colors.HexColor("#57687E"),
        )
    )
    return drawing


def coverage_chart():
    drawing = Drawing(500, 220)
    drawing.add(
        String(
            250,
            205,
            "Coverage Shape",
            fontName="Helvetica-Bold",
            fontSize=12,
            textAnchor="middle",
            fillColor=colors.HexColor("#10233F"),
        )
    )
    chart = VerticalBarChart()
    chart.x = 45
    chart.y = 50
    chart.width = 400
    chart.height = 120
    chart.data = [(89, 0, 0, 0, 0)]
    chart.categoryAxis.categoryNames = ["protocol", "bridge", "detect", "approve", "recovery"]
    chart.categoryAxis.labels.fontSize = 8
    chart.valueAxis.valueMin = 0
    chart.valueAxis.valueMax = 95
    chart.valueAxis.valueStep = 10
    chart.bars[0].fillColor = colors.HexColor("#2A9D8F")
    drawing.add(chart)
    drawing.add(
        String(
            250,
            26,
            "Tests exist where strings are parsed. The risky planner and handler layers remain uncovered.",
            fontName="Helvetica",
            fontSize=8.5,
            textAnchor="middle",
            fillColor=colors.HexColor("#57687E"),
        )
    )
    return drawing


def workflow_timeline():
    drawing = Drawing(500, 165)
    drawing.add(
        String(
            250,
            146,
            "Current Detection-to-Cut Workflow",
            fontName="Helvetica-Bold",
            fontSize=12,
            textAnchor="middle",
            fillColor=colors.HexColor("#10233F"),
        )
    )
    steps = [
        "Browser detect",
        "Confidence gate",
        "Route output",
        "Dedup",
        "Allocate PEQ",
        "Send commands",
        "Ledger mutate",
    ]
    x = 10
    y = 70
    width = 62
    height = 34
    gap = 8
    for index, label in enumerate(steps):
        left = x + index * (width + gap)
        drawing.add(
            Rect(
                left,
                y,
                width,
                height,
                rx=6,
                ry=6,
                fillColor=colors.HexColor("#EAF2FF"),
                strokeColor=colors.HexColor("#5E85C7"),
                strokeWidth=1,
            )
        )
        drawing.add(
            String(
                left + width / 2,
                y + 20,
                label,
                fontName="Helvetica-Bold",
                fontSize=7.6,
                textAnchor="middle",
                fillColor=colors.HexColor("#18345B"),
            )
        )
        if index < len(steps) - 1:
            start_x = left + width
            end_x = left + width + gap
            mid_y = y + height / 2
            drawing.add(Line(start_x, mid_y, end_x, mid_y, strokeColor=colors.HexColor("#6C7F99"), strokeWidth=1.1))
            drawing.add(Line(end_x - 4, mid_y + 3, end_x, mid_y, strokeColor=colors.HexColor("#6C7F99"), strokeWidth=1.1))
            drawing.add(Line(end_x - 4, mid_y - 3, end_x, mid_y, strokeColor=colors.HexColor("#6C7F99"), strokeWidth=1.1))
    drawing.add(
        String(
            250,
            30,
            "Failure concentration: readiness gating, output routing, slot ownership, and asynchronous writes.",
            fontName="Helvetica",
            fontSize=8.5,
            textAnchor="middle",
            fillColor=colors.HexColor("#57687E"),
        )
    )
    return drawing


def risk_matrix():
    drawing = Drawing(500, 235)
    drawing.add(
        String(
            250,
            215,
            "Risk Matrix",
            fontName="Helvetica-Bold",
            fontSize=12,
            textAnchor="middle",
            fillColor=colors.HexColor("#10233F"),
        )
    )
    origin_x = 105
    origin_y = 40
    cell_w = 100
    cell_h = 48
    fills = [
        [colors.HexColor("#EAF4E6"), colors.HexColor("#F3F5D6"), colors.HexColor("#FBE7C8")],
        [colors.HexColor("#F3F5D6"), colors.HexColor("#FBE7C8"), colors.HexColor("#F9D0B8")],
        [colors.HexColor("#FBE7C8"), colors.HexColor("#F9D0B8"), colors.HexColor("#F5B7B1")],
    ]
    col_labels = ["Low", "Medium", "High"]
    row_labels = ["Possible", "Likely", "Certain"]
    cell_text = [
        ["Abort leak", "Q-blind depth\nPoll/send race", "No verify loop"],
        ["Polling cost", "Confidence/Q\nMacro keys", "Routing on bypass"],
        ["Bell vs notch", "GEQ ratchet", "Both-mode double-cut"],
    ]
    drawing.add(String(65, 145, "Likelihood", fontName="Helvetica-Bold", fontSize=9, fillColor=colors.HexColor("#18345B")))
    drawing.add(String(235, 20, "Impact", fontName="Helvetica-Bold", fontSize=9, textAnchor="middle", fillColor=colors.HexColor("#18345B")))
    for col, label in enumerate(col_labels):
        drawing.add(
            String(
                origin_x + col * cell_w + cell_w / 2,
                origin_y + 3 * cell_h + 8,
                label,
                fontName="Helvetica-Bold",
                fontSize=8.5,
                textAnchor="middle",
                fillColor=colors.HexColor("#18345B"),
            )
        )
    for row, label in enumerate(row_labels):
        drawing.add(
            String(
                origin_x - 12,
                origin_y + row * cell_h + cell_h / 2,
                label,
                fontName="Helvetica-Bold",
                fontSize=8.5,
                textAnchor="end",
                fillColor=colors.HexColor("#18345B"),
            )
        )
        for col in range(3):
            x = origin_x + col * cell_w
            y = origin_y + row * cell_h
            drawing.add(Rect(x, y, cell_w, cell_h, fillColor=fills[row][col], strokeColor=colors.HexColor("#CBD5E1")))
            lines = cell_text[row][col].split("\n")
            for idx, line in enumerate(lines):
                drawing.add(
                    String(
                        x + cell_w / 2,
                        y + 30 - idx * 10,
                        line,
                        fontName="Helvetica",
                        fontSize=7.2,
                        textAnchor="middle",
                        fillColor=colors.HexColor("#223248"),
                    )
                )
    return drawing


def build_table(rows, widths, header_fill="#172033", row_fill="#F6F9FC", font_size=8.3):
    table = Table(rows, colWidths=widths)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(header_fill)),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), font_size),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.HexColor(row_fill), colors.white]),
                ("GRID", (0, 0), (-1, -1), 0.45, colors.HexColor("#CBD5E1")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEADING", (0, 0), (-1, -1), font_size + 2),
            ]
        )
    )
    return table


def build_story():
    style_sheet = styles()
    story = []

    story.append(p("PA2 Auto-Notch Pipeline", "AuditTitle", style_sheet))
    story.append(p("Detection to Cut - Deep Code Audit", "AuditSubtitle", style_sheet))
    story.append(
        p(
            "DoneWell Audio | March 2026 | 6 files | 3,893 lines | 11 bugs | 11 gaps | 4 optimizations",
            "AuditSubtitle",
            style_sheet,
        )
    )
    story.append(
        p(
            "This report is derived from the current code only. Existing markdown and legacy notes were treated as non-authoritative.",
            "AuditSmall",
            style_sheet,
        )
    )
    story.append(p("Executive Summary", "AuditSection", style_sheet))
    story.append(
        p(
            "The pipeline is effective as a prototype, but the current automation boundary is not production-safe. The highest-risk behavior is concentrated in route selection, per-output slot ownership, and non-transactional hardware writes.",
            "AuditBody",
            style_sheet,
        )
    )
    summary_rows = [["Category", "Count", "Impact"]]
    summary_rows.extend(
        [
            ["Critical Bugs", "5", "Double-cut audio, wrong output routing, slot mistakes"],
            ["High Bugs", "2", "Accumulating GEQ cuts, undefined macro parameters"],
            ["Medium Bugs", "4", "Wrong filter type, listener leak, race risk, Q-blind depth"],
            ["Gaps", "11", "No verify loop, no release logic, no bridge tests"],
            ["Optimizations", "4", "Polling, signals, dedup reuse, batching"],
        ]
    )
    story.append(build_table(summary_rows, [1.8 * inch, 0.8 * inch, 4.1 * inch]))
    story.append(Spacer(1, 0.14 * inch))
    story.append(metric_chart())
    story.append(Spacer(1, 0.1 * inch))
    architecture_rows = [["#", "File", "Lines", "Role"]]
    architecture_rows.extend([list(row) for row in ARCHITECTURE_ROWS])
    story.append(p("Architecture", "AuditSection", style_sheet))
    story.append(build_table(architecture_rows, [0.35 * inch, 2.45 * inch, 0.6 * inch, 3.25 * inch]))

    story.append(PageBreak())
    story.append(p("Workflow", "AuditSection", style_sheet))
    severity_rows = [
        ["Severity", "Meaning", "Depth"],
        ["RUNAWAY", "Exponential growth", "-12 dB"],
        ["GROWING", "Sustained rise", "-6 dB"],
        ["RESONANCE", "Room mode", "-3 dB"],
        ["WHISTLE", "Pure tone", "-4 dB"],
    ]
    story.append(build_table(severity_rows, [1.25 * inch, 3.35 * inch, 1.2 * inch]))
    story.append(Spacer(1, 0.14 * inch))
    story.append(workflow_timeline())
    story.append(Spacer(1, 0.12 * inch))
    workflow_rows = [
        ["Stage", "Current behavior"],
        ["Bridge functions", "advisoriesToGEQCorrections, advisoriesToDetectPayload, advisoriesToHybridActions"],
        ["Companion step 1", "Connection check and confidence threshold"],
        ["Companion step 2", "_routeToOutput, 1/3-octave dedup, PEQ slot allocation"],
        ["Companion step 3", "buildCommand('peq_filter') then write to PA2"],
        ["Concentrated risks", "Readiness gating, output routing, queueing, ownership mutation before verify"],
    ]
    story.append(build_table(workflow_rows, [1.35 * inch, 5.3 * inch]))

    story.append(PageBreak())
    story.append(p("Bugs", "AuditSection", style_sheet))
    critical_rows = [["ID", "Severity", "Finding", "Fix"]]
    critical_rows.extend([list(row) for row in BUGS[:5]])
    story.append(build_table(critical_rows, [0.45 * inch, 0.75 * inch, 2.55 * inch, 2.9 * inch], row_fill="#FEF4F2"))
    story.append(Spacer(1, 0.12 * inch))
    other_rows = [["ID", "Severity", "Finding", "Fix"]]
    other_rows.extend([list(row) for row in BUGS[5:]])
    story.append(build_table(other_rows, [0.45 * inch, 0.75 * inch, 2.55 * inch, 2.9 * inch], row_fill="#F8FBFF"))
    story.append(Spacer(1, 0.14 * inch))
    story.append(risk_matrix())

    story.append(PageBreak())
    story.append(p("Gaps and Optimizations", "AuditSection", style_sheet))
    gap_rows = [["Gap", "Current hole"]]
    for index, text in enumerate(GAPS, start=1):
        gap_rows.append([f"G{index}", text])
    story.append(build_table(gap_rows, [0.55 * inch, 5.95 * inch], row_fill="#F7FBF1"))
    story.append(Spacer(1, 0.14 * inch))
    optimization_rows = [["ID", "Opportunity"]]
    optimization_rows.extend([list(row) for row in OPTIMIZATIONS])
    story.append(build_table(optimization_rows, [0.45 * inch, 6.05 * inch], row_fill="#F7F3FF"))
    story.append(Spacer(1, 0.14 * inch))
    story.append(p("Recommendations", "AuditSection", style_sheet))
    recommendation_rows = [["#", "Bug", "Fix", "Effort"]]
    recommendation_rows.extend([list(row) for row in RECOMMENDATIONS])
    story.append(build_table(recommendation_rows, [0.35 * inch, 0.85 * inch, 4.55 * inch, 0.75 * inch]))

    story.append(PageBreak())
    story.append(p("Engineering Guide", "AuditSection", style_sheet))
    story.append(
        p(
            "Beginner: feedback is speaker output re-entering the microphone. GEQ is broad and fixed. PEQ is surgical and variable. Q controls notch width. Severity controls the first cut depth.",
            "AuditBody",
            style_sheet,
        )
    )
    story.append(
        p(
            "Intermediate: the browser detects feedback, the bridge decides GEQ versus PEQ, and the companion module turns that decision into PA2 TCP writes. The current weak points are state sync and write correctness, not FFT detection.",
            "AuditBody",
            style_sheet,
        )
    )
    advanced_rows = [
        ["Layer", "Default", "Purpose"],
        ["Advisory", "Varies", "Worth reporting?"],
        ["Bridge", "0.7 / 0.6", "Worth sending?"],
        ["Companion", "0.8", "Worth cutting?"],
    ]
    story.append(build_table(advanced_rows, [1.25 * inch, 1.0 * inch, 4.25 * inch], row_fill="#F5F8FC"))
    story.append(Spacer(1, 0.12 * inch))
    dedup_rows = [
        ["Layer", "Behavior"],
        ["1", "Advisory timing gates"],
        ["2", "Bridge deepest-cut winner"],
        ["3", "Companion 1/3-octave proximity"],
        ["4", "Auto-send interval gate"],
    ]
    story.append(build_table(dedup_rows, [0.65 * inch, 5.85 * inch], row_fill="#F5F8FC"))
    story.append(Spacer(1, 0.16 * inch))
    story.append(coverage_chart())
    story.append(Spacer(1, 0.12 * inch))
    next_rows = [
        ["Implementation order", "Priority"],
        ["Readiness gating and routing correctness", "First"],
        ["Queue serialization and transactional acknowledgement", "First"],
        ["Per-output slot ownership persistence", "First"],
        ["Bridge both-mode partition and confidence/Q propagation", "Second"],
        ["Delta GEQ corrections, release logic, verify loop", "Third"],
    ]
    story.append(build_table(next_rows, [3.6 * inch, 2.9 * inch], row_fill="#F9FBFE"))

    return story


def render_review_pages():
    PNG_DIR.mkdir(parents=True, exist_ok=True)
    document = fitz.open(PDF_PATH)
    for index in range(len(document)):
        page = document.load_page(index)
        pixmap = page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5), alpha=False)
        pixmap.save(PNG_DIR / f"pa2-auto-notch-audit-page-{index + 1}.png")
    document.close()


def main():
    PDF_PATH.parent.mkdir(parents=True, exist_ok=True)
    document = SimpleDocTemplate(
        str(PDF_PATH),
        pagesize=letter,
        leftMargin=0.6 * inch,
        rightMargin=0.6 * inch,
        topMargin=0.72 * inch,
        bottomMargin=0.72 * inch,
        title="PA2 Auto-Notch Pipeline Audit",
        author="OpenAI Codex",
    )
    document.build(build_story(), onFirstPage=page_frame, onLaterPages=page_frame)
    render_review_pages()
    print(PDF_PATH)


if __name__ == "__main__":
    main()
