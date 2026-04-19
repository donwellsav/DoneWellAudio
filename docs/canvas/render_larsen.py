"""
Larsen Threshold — Plate IV
Scientific-plate expression of the Larsen Threshold design philosophy.
A single-page 9x12 PDF. No decoration, only measurement.
"""
import math
import os
import numpy as np
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import Color


FONT_DIR = r"C:/Windows/Fonts"
OUT_PDF  = r"C:/DoneWellAV/DoneWellAudio/docs/canvas/larsen_threshold.pdf"


def rgb(h):
    h = h.lstrip("#")
    return Color(int(h[0:2], 16) / 255, int(h[2:4], 16) / 255, int(h[4:6], 16) / 255)


def rgba(h, a):
    c = rgb(h)
    return Color(c.red, c.green, c.blue, alpha=a)


# ── fonts ────────────────────────────────────────────────────────────
_FONTS = {
    # Classical engraving serif (Microsoft's book-grade face by John Hudson)
    "Serif":       "constan.ttf",
    "Serif-Bold":  "constanb.ttf",
    "Serif-It":    "constani.ttf",
    # Mechanical monospace — carries every number, every whisper of calibration
    "Mono":        "consola.ttf",
    "Mono-Bold":   "consolab.ttf",
}
for name, fn in _FONTS.items():
    pdfmetrics.registerFont(TTFont(name, os.path.join(FONT_DIR, fn)))


# ── acoustician's notebook palette ───────────────────────────────────
CREAM     = rgb("#F4EEE1")
INK       = rgb("#11243A")
INK_LT    = rgb("#213754")
AMBER     = rgb("#B8591E")
GRAPHITE  = rgb("#4A4A42")
INK_H1    = rgba("#11243A", 0.60)
INK_H2    = rgba("#11243A", 0.30)
INK_H3    = rgba("#11243A", 0.14)


def tracked_text(x, y, s, font, size, fill, char_space, anchor="left"):
    """Draw `s` with letter tracking using a TextObject, anchored left/center/right.

    TextObject charSpace leaks into subsequent canvas-level draws, so wrap in
    saveState/restoreState so the tracking does not affect later text calls.
    """
    tw = pdfmetrics.stringWidth(s, font, size) + char_space * max(0, len(s) - 1)
    if anchor == "center":
        x = x - tw / 2
    elif anchor == "right":
        x = x - tw
    c.saveState()
    t = c.beginText(x, y)
    t.setFont(font, size)
    t.setFillColor(fill)
    t.setCharSpace(char_space)
    t.textOut(s)
    c.drawText(t)
    c.restoreState()
    return tw


# ── page setup ───────────────────────────────────────────────────────
W, H = 9 * inch, 12 * inch   # 648 x 864 pt
c = rl_canvas.Canvas(OUT_PDF, pagesize=(W, H))

# paper ground
c.setFillColor(CREAM)
c.rect(0, 0, W, H, stroke=0, fill=1)

# subtle four-corner vignette (tiny translucent dabs — paper presence)
c.setFillColor(rgba("#C4B89C", 0.07))
for vx in (W * 0.08, W * 0.92):
    for vy in (H * 0.08, H * 0.92):
        c.circle(vx, vy, 140, stroke=0, fill=1)


# ── mandala frame ────────────────────────────────────────────────────
cx, cy = W / 2, H / 2 + 58
R_out  = 233
R_in   = 24


def a_deg(deg):
    """degrees, 0 at top, clockwise → math radians for reportlab cos/sin."""
    return math.radians(90 - deg)


def freq_to_r(f):
    return R_in + (math.log(f) - math.log(20)) / (math.log(20000) - math.log(20)) * (R_out - R_in)


# Layer 1 — 1/3-octave rings (faintest)
c.setStrokeColor(INK_H3)
c.setLineWidth(0.22)
for oi in range(10):
    base = 20 * 2**oi
    for step in (1.26, 1.585):
        f = base * step
        if 20 <= f <= 20000:
            c.circle(cx, cy, freq_to_r(f), stroke=1, fill=0)

# Layer 2 — octave rings
OCTAVES = [20, 40, 80, 160, 315, 630, 1250, 2500, 5000, 10000, 20000]
c.setStrokeColor(INK_H1)
c.setLineWidth(0.38)
for f in OCTAVES:
    c.circle(cx, cy, freq_to_r(f), stroke=1, fill=0)

# Layer 3 — outer + inner boundary rings (strong)
c.setStrokeColor(INK)
c.setLineWidth(0.9)
c.circle(cx, cy, R_out, stroke=1, fill=0)
c.setLineWidth(0.55)
c.circle(cx, cy, R_in, stroke=1, fill=0)

# center dot + tiny ƒ₀ label
c.setFillColor(INK)
c.circle(cx, cy, 1.4, stroke=0, fill=1)
c.setFont("Serif-It", 8)
c.drawCentredString(cx, cy - R_in + 6, "ƒ\u2080")


# Layer 4 — 360 angular tick marks on outer edge
for deg in range(360):
    a = a_deg(deg)
    if deg % 30 == 0:
        length, w, col = 11, 0.65, INK
    elif deg % 10 == 0:
        length, w, col = 6, 0.33, INK_H1
    else:
        length, w, col = 2, 0.2, INK_H2
    c.setStrokeColor(col)
    c.setLineWidth(w)
    r1 = R_out
    r2 = R_out + length
    c.line(cx + r1 * math.cos(a), cy + r1 * math.sin(a),
           cx + r2 * math.cos(a), cy + r2 * math.sin(a))

# degree labels at 30° increments
c.setFont("Mono", 5.2)
c.setFillColor(GRAPHITE)
for deg in range(0, 360, 30):
    a = a_deg(deg)
    r = R_out + 19
    x = cx + r * math.cos(a)
    y = cy + r * math.sin(a) - 2
    c.drawCentredString(x, y, f"{deg:03d}")


# Layer 5 — 7 radial axes (roman numerals at outer tips)
ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"]
c.setStrokeColor(INK_H2)
c.setLineWidth(0.32)
for i in range(7):
    a = a_deg(i * 360 / 7)
    c.line(cx + R_in * math.cos(a), cy + R_in * math.sin(a),
           cx + R_out * math.cos(a), cy + R_out * math.sin(a))

c.setFont("Mono-Bold", 7)
c.setFillColor(INK)
for i, r_num in enumerate(ROMAN):
    a = a_deg(i * 360 / 7)
    r = R_out + 35
    x = cx + r * math.cos(a)
    y = cy + r * math.sin(a) - 2.4
    c.drawCentredString(x, y, r_num)


# Layer 6 — frequency cartouches at 12 o'clock on each octave ring
c.setFont("Mono", 5.0)
for f in OCTAVES[1:-1]:  # skip 20 Hz (near center) and 20 kHz (on boundary)
    r = freq_to_r(f)
    label = f"{f // 1000}k" if f >= 1000 else f"{f}"
    tw = c.stringWidth(label, "Mono", 5.0)
    pad = 2.2
    cw = tw + 2 * pad
    ch = 6.4
    c.setFillColor(CREAM)
    c.rect(cx - cw / 2, cy + r - ch / 2, cw, ch, stroke=0, fill=1)
    c.setFillColor(GRAPHITE)
    c.drawCentredString(cx, cy + r - 1.9, label)


# Layer 7 — Archimedean spiral (harmonic trajectory from center outward)
spiral_revs = 5
max_theta   = spiral_revs * 2 * math.pi
steps       = 2400
thetas      = np.linspace(0, max_theta, steps)
r_start     = R_in + 7
r_end       = R_out - 10
radii_s     = r_start + (r_end - r_start) * (thetas / max_theta)

c.setStrokeColor(INK)
c.setLineWidth(0.55)
path = c.beginPath()
path.moveTo(
    cx + radii_s[0] * math.cos(math.pi / 2 - thetas[0]),
    cy + radii_s[0] * math.sin(math.pi / 2 - thetas[0]),
)
for i in range(1, steps):
    path.lineTo(
        cx + radii_s[i] * math.cos(math.pi / 2 - thetas[i]),
        cy + radii_s[i] * math.sin(math.pi / 2 - thetas[i]),
    )
c.drawPath(path, stroke=1, fill=0)


def spiral_point_at_radius(r_target):
    """Return (x, y) for the point on the spiral whose radius is r_target."""
    if r_target < r_start or r_target > r_end:
        return None
    t = (r_target - r_start) / (r_end - r_start) * max_theta
    ang = math.pi / 2 - t
    return cx + r_target * math.cos(ang), cy + r_target * math.sin(ang)


# Layer 8 — harmonic markers on the spiral (k × 440 Hz, the concert A series)
c.setFillColor(INK)
for k in range(1, 40):
    f = 440 * k
    if f > 19000:
        break
    r_k = freq_to_r(f)
    pt = spiral_point_at_radius(r_k)
    if pt is None:
        continue
    x, y = pt
    # Fundamental = larger solid dot with a subtle cream "breath" around it.
    # Higher harmonics become progressively smaller — the way energy thins upward.
    if k == 1:
        c.setFillColor(CREAM)
        c.circle(x, y, 3.0, stroke=0, fill=1)  # cream halo masks spiral behind fundamental
        c.setFillColor(INK)
        c.circle(x, y, 1.9, stroke=0, fill=1)
    else:
        rad = max(0.7, 1.35 - 0.03 * (k - 1))
        c.circle(x, y, rad, stroke=0, fill=1)


# Layer 9 — amber threshold crosshair at the loop-closure frequency
# (placed at 5 kHz — the ear's most sensitive band; where feedback is meanest)
f_T = 5000
r_T = freq_to_r(f_T)
pt_T = spiral_point_at_radius(r_T)
if pt_T:
    xt, yt = pt_T
    # cream "breath" ring behind crosshair so it doesn't fight the spiral ink
    c.setFillColor(CREAM)
    c.circle(xt, yt, 6.2, stroke=0, fill=1)
    # crosshair — slightly shorter arms so they punctuate, not puncture
    c.setStrokeColor(AMBER)
    c.setLineWidth(0.8)
    L = 9.5
    c.line(xt - L, yt, xt + L, yt)
    c.line(xt, yt - L, xt, yt + L)
    c.circle(xt, yt, 4.6, stroke=1, fill=0)
    c.setFillColor(AMBER)
    c.circle(xt, yt, 1.25, stroke=0, fill=1)
    # label — placed outward-radially from center so it sits in negative space
    # (rather than overlapping adjacent ring ticks)
    ang_T = math.atan2(yt - cy, xt - cx)
    lx = xt + math.cos(ang_T) * 14
    ly = yt + math.sin(ang_T) * 14
    c.setFont("Serif-It", 12)
    c.setFillColor(AMBER)
    c.drawString(lx, ly + 2, "\u0394")
    tracked_text(lx, ly - 6, "LARSEN COORD.", "Mono", 5.2, AMBER, 1.2, "left")


# ── title band below mandala ─────────────────────────────────────────
sep_y = cy - R_out - 56

c.setStrokeColor(INK)
c.setLineWidth(0.3)
c.line(W * 0.22, sep_y, W * 0.78, sep_y)

# TITLE — classical serif, all caps, widely tracked
tracked_text(W / 2, sep_y - 34, "LARSEN   THRESHOLD", "Serif-Bold", 26, INK, 6.5, "center")

# italic subtitle
c.setFont("Serif-It", 11)
c.setFillColor(INK_LT)
c.drawCentredString(W / 2, sep_y - 55, "on the topology of the self\u2013exciting frequency")

# marginalia — layer enumeration
tracked_text(
    W / 2, sep_y - 76,
    "I. CONCENTRIC FIELD       II. RADIAL DECOMPOSITION       III. HARMONIC TRACE",
    "Mono", 6.2, GRAPHITE, 2.4, "center",
)


# ── top plate number & date ──────────────────────────────────────────
m = 26
tracked_text(m + 14, H - m - 2, "PLATE   IV", "Mono", 7, INK, 3, "left")
tracked_text(W - m - 14, H - m - 2, "MMXXVI",     "Mono", 7, INK, 3, "right")


# ── corner registration marks ────────────────────────────────────────
def reg(x, y, sz=5):
    c.setStrokeColor(INK)
    c.setLineWidth(0.4)
    c.line(x - sz, y, x + sz, y)
    c.line(x, y - sz, x, y + sz)


for x in (m, W - m):
    for y in (m, H - m):
        reg(x, y)


# ── bottom: formula, signature, edition ──────────────────────────────
# Render "when  Ω ƒ₀  →  1" with an explicit geometric arrow so missing
# glyphs never drop silently. Compose left-half text + arrow + right-half text.
formula_y = m + 40
left_txt  = "when   \u03a9\u2009\u0192\u2080"  # when  Ω ƒ₀
right_txt = "1"
font_fs   = 11

left_w  = pdfmetrics.stringWidth(left_txt,  "Serif-It", font_fs)
right_w = pdfmetrics.stringWidth(right_txt, "Serif-It", font_fs)
arrow_w = 26   # arrow shaft length + head
gap     = 10   # gap on each side of arrow

total_w = left_w + gap + arrow_w + gap + right_w
x0 = (W - total_w) / 2

c.setFont("Serif-It", font_fs)
c.setFillColor(INK)
c.drawString(x0, formula_y, left_txt)

# arrow
ax0 = x0 + left_w + gap
ax1 = ax0 + arrow_w
ay  = formula_y + 3.1   # align to x-height
c.setStrokeColor(INK)
c.setLineWidth(0.7)
c.line(ax0, ay, ax1 - 3, ay)
# arrowhead — two small strokes forming a chevron
c.line(ax1 - 5, ay + 2.2, ax1, ay)
c.line(ax1 - 5, ay - 2.2, ax1, ay)

c.drawString(ax1 + gap, formula_y, right_txt)

tracked_text(m + 14, m + 10, "INK   COTTON   PAPER", "Mono", 6, GRAPHITE, 2, "left")
tracked_text(W - m - 14, m + 10, "ED. I   NO. 047 / 256", "Mono", 6, GRAPHITE, 2, "right")


c.save()
print("wrote", OUT_PDF, "->", os.path.getsize(OUT_PDF), "bytes")
