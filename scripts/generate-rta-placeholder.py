#!/usr/bin/env python3
"""
Generate RTA placeholder PNG images for Kill The Ring.
Produces dark and light mode variants that match the live canvas rendering.

Usage: python3 scripts/generate-rta-placeholder.py
Output: public/rta-placeholder-dark.png, public/rta-placeholder-light.png
"""

import math
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

# ── Dimensions ─────────────────────────────────────────────────────────────────
W, H = 2560, 1280  # 2x retina

# ── Padding (percentage-based, matching spectrumDrawing.ts) ────────────────────
PAD_TOP = int(H * 0.05)
PAD_BOTTOM = int(H * 0.09)
PAD_LEFT = int(W * 0.065)
PAD_RIGHT = int(W * 0.02)

PLOT_W = W - PAD_LEFT - PAD_RIGHT
PLOT_H = H - PAD_TOP - PAD_BOTTOM

# ── dB and Frequency ranges ───────────────────────────────────────────────────
DB_MIN, DB_MAX = -100, 0
FREQ_MIN, FREQ_MAX = 20, 20000

# ── Frequency helpers ─────────────────────────────────────────────────────────
def freq_to_x(f):
    """Log-scale frequency to pixel X within plot area."""
    if f <= 0: return PAD_LEFT
    log_min = math.log10(FREQ_MIN)
    log_max = math.log10(FREQ_MAX)
    ratio = (math.log10(f) - log_min) / (log_max - log_min)
    return PAD_LEFT + ratio * PLOT_W

def db_to_y(db):
    """Linear dB to pixel Y within plot area."""
    ratio = (DB_MAX - db) / (DB_MAX - DB_MIN)
    return PAD_TOP + ratio * PLOT_H

# ── Theme configurations ──────────────────────────────────────────────────────
DARK = {
    'name': 'dark',
    'bg': (8, 10, 12),
    'vignette_alpha': 0.4,
    'grid_major': (30, 32, 36),
    'grid_minor': (18, 20, 22),
    'grid_freq': (22, 24, 32),
    'axis_label': (136, 145, 160),
    'axis_shadow': (0, 0, 0),
    'zone_label': (160, 170, 190, 89),  # 35% alpha
    'spectrum': (255, 179, 71),  # Amber warm mode
    'threshold': (255, 179, 71),
    'placeholder_fill_top': 0.85,
    'placeholder_fill_mid': 0.45,
    'placeholder_fill_bottom': 0.10,
    'zones': [
        (20, 120, 'SUB', (139, 92, 246), 0.06),
        (120, 500, 'LOW MID', (96, 165, 250), 0.05),
        (500, 2000, 'MID', (75, 146, 255), 0.05),
        (2000, 6000, 'PRESENCE', (250, 204, 21), 0.04),
        (6000, 20000, 'AIR', (96, 165, 250), 0.04),
    ],
}

LIGHT = {
    'name': 'light',
    'bg': (240, 241, 244),
    'vignette_alpha': 0.06,
    'grid_major': (192, 197, 204),
    'grid_minor': (216, 219, 224),
    'grid_freq': (208, 212, 218),
    'axis_label': (90, 100, 120),
    'axis_shadow': (255, 255, 255),
    'zone_label': (80, 90, 110, 115),  # 45% alpha
    'spectrum': (37, 99, 235),
    'threshold': (37, 99, 235),
    'placeholder_fill_top': 0.80,
    'placeholder_fill_mid': 0.40,
    'placeholder_fill_bottom': 0.08,
    'zones': [
        (20, 120, 'SUB', (139, 92, 246), 0.04),
        (120, 500, 'LOW MID', (96, 165, 250), 0.03),
        (500, 2000, 'MID', (75, 146, 255), 0.03),
        (2000, 6000, 'PRESENCE', (200, 160, 21), 0.03),
        (6000, 20000, 'AIR', (96, 165, 250), 0.03),
    ],
}

# ── Placeholder curve — realistic jagged FFT spectrum ─────────────────────────
# Simulates a real live audio FFT: jagged, with sharp peaks, natural valleys,
# harmonics, and a noise floor — NOT a smooth hill

import random

def a_weight(freq):
    """IEC 61672 A-weighting curve in dB (attempt to model the standard)."""
    f2 = freq * freq
    # A-weighting transfer function numerator/denominator squared magnitudes
    num = (12194**2 * f2**2)
    den = ((f2 + 20.6**2) * math.sqrt((f2 + 107.7**2) * (f2 + 737.9**2)) * (f2 + 12194**2))
    if den == 0: return -80
    ra = num / den
    return 20 * math.log10(max(ra, 1e-10)) + 2.0  # +2 dB offset to normalize to 0 at 1kHz

def generate_realistic_spectrum(num_points=1200):
    """Generate a raw FFT-style jagged spectrum with A-weighting applied."""
    rng = random.Random(73)  # Deterministic seed

    # Base envelope: flat broadband signal + A-weighting
    def base_envelope(freq):
        if freq < 20: return -95
        # Start with a relatively flat broadband signal around -45dB
        flat = -45
        # Apply A-weighting curve (rolls off lows and extreme highs)
        aw = a_weight(freq)
        # Room resonances (subtle bumps on top of A-weighted response)
        log_f = math.log10(freq)
        res = 0
        res += 3 * math.exp(-((log_f - math.log10(250))**2) / 0.03)   # 250 Hz room mode
        res += 4 * math.exp(-((log_f - math.log10(1000))**2) / 0.06)  # 1kHz speech
        res += 5 * math.exp(-((log_f - math.log10(3000))**2) / 0.04)  # 3kHz presence peak
        res += 2 * math.exp(-((log_f - math.log10(6000))**2) / 0.05)  # 6kHz air
        return max(-95, min(-20, flat + aw + res))

    result = []
    prev_db = -60
    for i in range(num_points):
        freq = FREQ_MIN * (FREQ_MAX / FREQ_MIN) ** (i / (num_points - 1))
        base = base_envelope(freq)

        # FFT-style jaggedness: rapid fluctuations that look like real bin data
        if freq < 80:
            jag = rng.gauss(0, 3.0)
        elif freq < 500:
            jag = rng.gauss(0, 4.5)
        elif freq < 2000:
            jag = rng.gauss(0, 5.5)
        elif freq < 8000:
            jag = rng.gauss(0, 5.0)
        else:
            jag = rng.gauss(0, 3.5)

        # Occasional sharp peaks (harmonics / resonances)
        if rng.random() < 0.025:
            jag += rng.choice([-1, 1]) * rng.uniform(5, 10)

        # Slight correlation with previous bin
        db = base + jag
        db = prev_db * 0.15 + db * 0.85
        db = max(-96, min(-18, db))
        prev_db = db

        result.append((freq, db))
    return result

def interpolate_curve(num_points=1200):
    return generate_realistic_spectrum(num_points)

# ── Font loading ──────────────────────────────────────────────────────────────
FONT_DIR = os.path.join(os.path.dirname(__file__), '..', '.claude', 'skills', 'canvas-design', 'canvas-fonts')
# Fallback to system font dir
FONT_DIR_ALT = r'C:\Users\dwell\.claude\skills\canvas-design\canvas-fonts'

def load_font(name, size):
    # Try canvas-fonts directory first
    for d in [FONT_DIR, FONT_DIR_ALT]:
        path = os.path.join(d, name)
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                pass
    # Fallback to system monospace fonts
    for fallback in ['consola.ttf', 'cour.ttf', 'arial.ttf']:
        try:
            return ImageFont.truetype(fallback, size)
        except (OSError, IOError):
            pass
    return ImageFont.load_default(size=size)

# ── Drawing functions ─────────────────────────────────────────────────────────

def draw_vignette(img, theme):
    """Radial vignette overlay."""
    vignette = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(vignette)
    cx, cy = PLOT_W // 2 + PAD_LEFT, PLOT_H // 2 + PAD_TOP
    max_r = int(PLOT_W * 0.75)
    alpha_max = int(255 * theme['vignette_alpha'])
    # Draw concentric circles from outside in
    for r in range(max_r, int(PLOT_W * 0.25), -2):
        t = (r - PLOT_W * 0.25) / (max_r - PLOT_W * 0.25)
        a = int(alpha_max * t)
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(0, 0, 0, a))
    img.paste(Image.alpha_composite(img.convert('RGBA'), vignette).convert('RGB'), (0, 0))

def draw_zones(draw, theme, zone_font):
    """Frequency zone overlays with labels."""
    for fmin, fmax, label, color, alpha in theme['zones']:
        x0 = int(freq_to_x(fmin))
        x1 = int(freq_to_x(fmax))
        a = int(255 * alpha)
        # Zone fill
        zone_overlay = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        zone_draw = ImageDraw.Draw(zone_overlay)
        zone_draw.rectangle([x0, PAD_TOP, x1, PAD_TOP + PLOT_H], fill=(*color, a))
        # Zone separator line
        zone_draw.line([(x1, PAD_TOP), (x1, PAD_TOP + PLOT_H)], fill=(*color, int(255 * 0.15)), width=1)
        return zone_overlay  # We'll composite all at once

def draw_grid(draw, theme):
    """Major and minor grid lines."""
    # dB grid lines (horizontal)
    major_dbs = [-90, -60, -30, 0]
    minor_dbs = [-80, -70, -50, -40, -20, -10]

    for db in minor_dbs:
        y = int(db_to_y(db))
        draw.line([(PAD_LEFT, y), (PAD_LEFT + PLOT_W, y)], fill=theme['grid_minor'], width=1)

    for db in major_dbs:
        y = int(db_to_y(db))
        draw.line([(PAD_LEFT, y), (PAD_LEFT + PLOT_W, y)], fill=theme['grid_major'], width=2)

    # Frequency grid lines (vertical)
    freq_labels = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]
    for f in freq_labels:
        x = int(freq_to_x(f))
        draw.line([(x, PAD_TOP), (x, PAD_TOP + PLOT_H)], fill=theme['grid_freq'], width=1)

def draw_axis_labels(img, theme):
    """dB and frequency axis labels."""
    mono_font = load_font('GeistMono-Regular.ttf', 24)
    mono_font_sm = load_font('GeistMono-Regular.ttf', 20)
    draw = ImageDraw.Draw(img)

    # dB labels (Y-axis, right-aligned to left of plot)
    db_labels = [0, -10, -20, -30, -40, -50, -60, -70, -80, -90]
    for db in db_labels:
        y = int(db_to_y(db))
        label = str(db)
        bbox = draw.textbbox((0, 0), label, font=mono_font_sm)
        tw = bbox[2] - bbox[0]
        # Shadow
        draw.text((PAD_LEFT - tw - 12 + 1, y - 10 + 1), label, fill=theme['axis_shadow'], font=mono_font_sm)
        draw.text((PAD_LEFT - tw - 12, y - 10), label, fill=theme['axis_label'], font=mono_font_sm)

    # Frequency labels (X-axis, below plot)
    freq_labels = {20: '20', 50: '50', 100: '100', 200: '200', 500: '500',
                   1000: '1k', 2000: '2k', 5000: '5k', 10000: '10k', 20000: '20k'}
    y_label = PAD_TOP + PLOT_H + int(PAD_BOTTOM * 0.55)
    for f, label in freq_labels.items():
        x = int(freq_to_x(f))
        bbox = draw.textbbox((0, 0), label, font=mono_font)
        tw = bbox[2] - bbox[0]
        # Shadow
        draw.text((x - tw // 2 + 1, y_label + 1), label, fill=theme['axis_shadow'], font=mono_font)
        draw.text((x - tw // 2, y_label), label, fill=theme['axis_label'], font=mono_font)

def draw_zone_overlays(img, theme):
    """Draw frequency zone overlays with prominent bracket labels."""
    label_font = load_font('GeistMono-Regular.ttf', 22)
    is_dark = theme['name'] == 'dark'

    for fmin, fmax, label, color, alpha in theme['zones']:
        x0 = int(freq_to_x(fmin))
        x1 = int(freq_to_x(fmax))
        a = int(255 * alpha)

        # Zone fill overlay
        overlay = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        od = ImageDraw.Draw(overlay)
        od.rectangle([x0, PAD_TOP, x1, PAD_TOP + PLOT_H], fill=(*color, a))
        img_rgba = img.convert('RGBA')
        img_rgba = Image.alpha_composite(img_rgba, overlay)
        img.paste(img_rgba.convert('RGB'), (0, 0))

        draw = ImageDraw.Draw(img)
        zone_w = x1 - x0
        if zone_w < 40:
            continue

        # ── Bracket: vertical ticks at zone edges + label centered ──
        bracket_y = PAD_TOP + 6
        tick_h = 12
        bracket_color = theme['zone_label'] if len(theme['zone_label']) == 4 else (*color, 100 if is_dark else 140)

        # Left tick
        draw.line([(x0 + 1, bracket_y), (x0 + 1, bracket_y + tick_h)], fill=bracket_color, width=2)
        # Right tick
        draw.line([(x1 - 1, bracket_y), (x1 - 1, bracket_y + tick_h)], fill=bracket_color, width=2)
        # Horizontal bar connecting ticks
        bar_y = bracket_y + tick_h // 2
        bbox = draw.textbbox((0, 0), label, font=label_font)
        tw = bbox[2] - bbox[0]
        th = bbox[3] - bbox[1]
        label_x = x0 + (zone_w - tw) // 2
        label_y = bracket_y + 2

        # Bar left of label
        if label_x - x0 > 8:
            draw.line([(x0 + 1, bar_y), (label_x - 4, bar_y)], fill=bracket_color, width=1)
        # Bar right of label
        if x1 - (label_x + tw) > 8:
            draw.line([(label_x + tw + 4, bar_y), (x1 - 1, bar_y)], fill=bracket_color, width=1)

        # Zone label text
        label_color = tuple(c for c in bracket_color[:3]) + (int(255 * (0.55 if is_dark else 0.65)),)
        # Draw with RGBA overlay for alpha control
        txt_overlay = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        txt_draw = ImageDraw.Draw(txt_overlay)
        txt_draw.text((label_x, label_y), label, fill=label_color, font=label_font)
        img_rgba = img.convert('RGBA')
        img_rgba = Image.alpha_composite(img_rgba, txt_overlay)
        img.paste(img_rgba.convert('RGB'), (0, 0))

        # Separator line at zone boundary (full height, subtle)
        sep_overlay = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        sep_draw = ImageDraw.Draw(sep_overlay)
        sep_draw.line([(x1, PAD_TOP), (x1, PAD_TOP + PLOT_H)], fill=(*color, int(255 * 0.12)), width=1)
        img_rgba = img.convert('RGBA')
        img_rgba = Image.alpha_composite(img_rgba, sep_overlay)
        img.paste(img_rgba.convert('RGB'), (0, 0))

def draw_spectrum_curve(img, theme):
    """Multi-pass glow spectrum curve with gradient fill."""
    curve = interpolate_curve(600)
    points = [(int(freq_to_x(f)), int(db_to_y(db))) for f, db in curve]

    r, g, b = theme['spectrum']

    # Pass 1: Deep halo (wide, very transparent)
    halo = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    halo_draw = ImageDraw.Draw(halo)
    for i in range(len(points) - 1):
        halo_draw.line([points[i], points[i+1]], fill=(r, g, b, 15), width=16)
    halo_blurred = halo.filter(ImageFilter.GaussianBlur(radius=8))
    img_rgba = img.convert('RGBA')
    img_rgba = Image.alpha_composite(img_rgba, halo_blurred)

    # Pass 2: Mid glow
    mid = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    mid_draw = ImageDraw.Draw(mid)
    for i in range(len(points) - 1):
        mid_draw.line([points[i], points[i+1]], fill=(r, g, b, 38), width=6)
    mid_blurred = mid.filter(ImageFilter.GaussianBlur(radius=3))
    img_rgba = Image.alpha_composite(img_rgba, mid_blurred)

    # Gradient fill under curve — column-based for smooth result
    fill_layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    fill_draw = ImageDraw.Draw(fill_layer)
    bottom_y = PAD_TOP + PLOT_H
    # For each column, draw a vertical line from curve point to bottom with gradient
    for px, py in points:
        if px < PAD_LEFT or px > PAD_LEFT + PLOT_W:
            continue
        span = max(1, bottom_y - py)
        # Draw vertical gradient stripe
        for stripe_y in range(py, bottom_y, 3):
            t = (stripe_y - py) / span
            alpha_top = theme['placeholder_fill_top']
            alpha_bot = theme['placeholder_fill_bottom']
            a = int(255 * (alpha_top + (alpha_bot - alpha_top) * t))
            fill_draw.line([(px, stripe_y), (px, min(stripe_y + 3, bottom_y))], fill=(r, g, b, a), width=1)
    # Blur to smooth out striping
    fill_layer = fill_layer.filter(ImageFilter.GaussianBlur(radius=2))
    img_rgba = Image.alpha_composite(img_rgba, fill_layer)

    # Pass 3: Sharp line
    sharp = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    sharp_draw = ImageDraw.Draw(sharp)
    for i in range(len(points) - 1):
        sharp_draw.line([points[i], points[i+1]], fill=(r, g, b, 255), width=3)
    # Add slight glow to sharp line
    sharp_glow = sharp.filter(ImageFilter.GaussianBlur(radius=1))
    img_rgba = Image.alpha_composite(img_rgba, sharp_glow)
    img_rgba = Image.alpha_composite(img_rgba, sharp)

    img.paste(img_rgba.convert('RGB'), (0, 0))

def draw_threshold_line(img, theme):
    """Dashed threshold line with grab handle."""
    draw = ImageDraw.Draw(img)
    mono_font = load_font('GeistMono-Regular.ttf', 22)
    mono_font_hint = load_font('GeistMono-Bold.ttf', 22)

    threshold_db = -27  # Default speech mode
    y = int(db_to_y(threshold_db))
    r, g, b = theme['threshold']

    # Dashed line
    dash_len, gap_len = 12, 12
    x = PAD_LEFT
    while x < PAD_LEFT + PLOT_W:
        x_end = min(x + dash_len, PAD_LEFT + PLOT_W)
        draw.line([(x, y), (x_end, y)], fill=(r, g, b, 128), width=3)
        x += dash_len + gap_len

    # Grab handle
    handle_w, handle_h = 24, 72  # 2x for retina
    handle_x = PAD_LEFT + PLOT_W - handle_w - 4
    handle_y = y - handle_h // 2
    draw.rounded_rectangle(
        [handle_x, handle_y, handle_x + handle_w, handle_y + handle_h],
        radius=8, fill=(r, g, b, 191)
    )

    # Notch lines on handle
    for i in [-1, 0, 1]:
        ny = y + i * 12
        draw.line([(handle_x + 6, ny), (handle_x + handle_w - 6, ny)], fill=(0, 0, 0, 102), width=2)

    # Sensitivity label
    label = "Sens +27dB"
    bbox = draw.textbbox((0, 0), label, font=mono_font)
    tw = bbox[2] - bbox[0]
    draw.text((handle_x - tw - 12, y - 16), label, fill=(r, g, b, 178), font=mono_font)

    # Drag hint
    hint = "Drag to adjust sensitivity"
    bbox_h = draw.textbbox((0, 0), hint, font=mono_font_hint)
    tw_h = bbox_h[2] - bbox_h[0]
    draw.text((handle_x - tw_h - 12, y + 12), hint, fill=(r, g, b, 166), font=mono_font_hint)

def generate_placeholder(theme, output_path):
    """Generate a single RTA placeholder PNG."""
    print(f"Generating {theme['name']} mode: {output_path}")

    # Create base image
    img = Image.new('RGB', (W, H), theme['bg'])

    # Vignette
    draw_vignette(img, theme)

    # Zone overlays (before grid so grid draws on top)
    draw_zone_overlays(img, theme)

    # Grid
    draw = ImageDraw.Draw(img)
    draw_grid(draw, theme)

    # Spectrum curve with glow
    draw_spectrum_curve(img, theme)

    # Threshold line
    draw_threshold_line(img, theme)

    # Axis labels (last, on top)
    draw_axis_labels(img, theme)

    # Save
    img.save(output_path, 'PNG', optimize=True)
    size_kb = os.path.getsize(output_path) / 1024
    print(f"  Saved: {output_path} ({size_kb:.0f} KB)")

# ── Main ──────────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    out_dir = os.path.join(os.path.dirname(__file__), '..', 'public')
    os.makedirs(out_dir, exist_ok=True)

    generate_placeholder(DARK, os.path.join(out_dir, 'rta-placeholder-dark.png'))
    generate_placeholder(LIGHT, os.path.join(out_dir, 'rta-placeholder-light.png'))
    print("Done!")
