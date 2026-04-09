/**
 * Canvas Drawing — Grid & Background Layers
 *
 * Static background: grid lines, frequency zones, room mode lines, axis labels.
 */

import { freqToLogPosition } from '@/lib/utils/mathHelpers'
import type { RoomMode } from '@/lib/dsp/acousticUtils'

import {
  type CanvasTheme,
  type DbRange,
  DARK_CANVAS_THEME,
  DB_MAJOR,
  DB_MINOR,
  DB_ALL,
  FREQ_LABELS,
  cachedMeasureText,
} from './canvasTypes'

// ── Grid Path2D cache — geometry rebuilt only when range or dimensions change ──
let _gridMinorPath: Path2D | null = null
let _gridMajorPath: Path2D | null = null
let _gridFreqPath: Path2D | null = null
let _gridCacheKey = ''

export function drawGrid(
  ctx: CanvasRenderingContext2D,
  plotWidth: number,
  plotHeight: number,
  range: DbRange,
  theme: CanvasTheme = DARK_CANVAS_THEME,
) {
  // Background
  ctx.fillStyle = theme.background
  ctx.fillRect(0, 0, plotWidth, plotHeight)

  // Radial vignette — subtle depth from center to edges
  const vg = ctx.createRadialGradient(
    plotWidth / 2, plotHeight / 2, plotWidth * 0.25,
    plotWidth / 2, plotHeight / 2, plotWidth * 0.75,
  )
  vg.addColorStop(0, 'transparent')
  vg.addColorStop(1, theme.vignette)
  ctx.fillStyle = vg
  ctx.fillRect(0, 0, plotWidth, plotHeight)

  // Instrument backlight — diffuse glow centered where spectrum data lives.
  // Dark: cool blue-white. Light: warm amber tint matching amber-sidecar palette.
  const isDark = theme === DARK_CANVAS_THEME
  const backlight = ctx.createRadialGradient(
    plotWidth * 0.5, plotHeight * 0.3, 0,
    plotWidth * 0.5, plotHeight * 0.5, plotWidth * 0.52,
  )
  backlight.addColorStop(0, isDark ? 'rgba(20, 45, 90, 0.28)' : 'rgba(180, 140, 60, 0.18)')
  backlight.addColorStop(1, isDark ? 'rgba(0, 0, 0, 0)' : 'rgba(0, 0, 0, 0)')
  ctx.fillStyle = backlight
  ctx.fillRect(0, 0, plotWidth, plotHeight)

  // Rebuild cached grid paths only when geometry inputs change
  const key = `${plotWidth}|${plotHeight}|${range.dbMin}|${range.dbMax}|${range.freqMin}|${range.freqMax}`
  if (key !== _gridCacheKey) {
    const dbSpan = range.dbMax - range.dbMin

    _gridMinorPath = new Path2D()
    for (const db of DB_MINOR) {
      const y = ((range.dbMax - db) / dbSpan) * plotHeight
      _gridMinorPath.moveTo(0, y)
      _gridMinorPath.lineTo(plotWidth, y)
    }

    _gridMajorPath = new Path2D()
    for (const db of DB_MAJOR) {
      const y = ((range.dbMax - db) / dbSpan) * plotHeight
      _gridMajorPath.moveTo(0, y)
      _gridMajorPath.lineTo(plotWidth, y)
    }

    _gridFreqPath = new Path2D()
    for (const freq of FREQ_LABELS) {
      const x = freqToLogPosition(freq, range.freqMin, range.freqMax) * plotWidth
      _gridFreqPath.moveTo(x, 0)
      _gridFreqPath.lineTo(x, plotHeight)
    }

    _gridCacheKey = key
  }

  // Stroke cached paths with current theme colors
  ctx.strokeStyle = theme.gridMinor
  ctx.lineWidth = 0.5
  ctx.stroke(_gridMinorPath!)

  ctx.strokeStyle = theme.gridMajor
  ctx.lineWidth = 1
  ctx.stroke(_gridMajorPath!)

  ctx.strokeStyle = theme.gridFreq
  ctx.lineWidth = 0.5
  ctx.stroke(_gridFreqPath!)
}

/** Frequency zone band boundaries — colors are theme-dependent */
const FREQ_ZONE_BANDS = [
  { label: 'SUB',      minHz: 20,   maxHz: 120,   rgb: '139, 92, 246'  },  // violet
  { label: 'LOW MID',  minHz: 120,  maxHz: 500,   rgb: '96, 165, 250'  },  // blue
  { label: 'MID',      minHz: 500,  maxHz: 2000,  rgb: '75, 146, 255'  },  // primary blue
  { label: 'PRESENCE', minHz: 2000, maxHz: 6000,  rgb: '250, 204, 21'  },  // yellow
  { label: 'AIR',      minHz: 6000, maxHz: 20000, rgb: '96, 165, 250'  },  // light blue
] as const

// Zone fill opacity per band — dark mode is stronger (dark bg absorbs color)
const ZONE_ALPHA_DARK  = [0.20, 0.17, 0.15, 0.14, 0.14]
const ZONE_ALPHA_LIGHT = [0.08, 0.07, 0.07, 0.06, 0.06]

// #5 Zone fade-in state — module-level for zero-alloc per-frame tracking
let _zoneFadeStart = 0
let _zoneWasVisible = false

/**
 * Draw labeled frequency zone bands behind the spectrum.
 * Tinted rectangles with labels at top to help engineers orient.
 * Theme-aware: stronger fills on dark backgrounds, subtler on light.
 * Fades in over 300ms when toggled on (#5).
 * @param showZones - when false, this function is a no-op
 */
export function drawFreqZones(
  ctx: CanvasRenderingContext2D,
  plotWidth: number,
  plotHeight: number,
  range: DbRange,
  showZones: boolean,
  theme: CanvasTheme = DARK_CANVAS_THEME,
) {
  if (!showZones) { _zoneWasVisible = false; return }
  // Track fade-in start time
  if (!_zoneWasVisible) { _zoneFadeStart = performance.now(); _zoneWasVisible = true }
  const fadeProgress = Math.min(1, (performance.now() - _zoneFadeStart) / 300)

  const isDark = theme === DARK_CANVAS_THEME
  const alphas = isDark ? ZONE_ALPHA_DARK : ZONE_ALPHA_LIGHT

  for (let z = 0; z < FREQ_ZONE_BANDS.length; z++) {
    const zone = FREQ_ZONE_BANDS[z]
    const x1 = freqToLogPosition(Math.max(zone.minHz, range.freqMin), range.freqMin, range.freqMax) * plotWidth
    const x2 = freqToLogPosition(Math.min(zone.maxHz, range.freqMax), range.freqMin, range.freqMax) * plotWidth
    if (x2 <= x1) continue // zone outside visible range

    // Tinted background band (faded in via fadeProgress)
    ctx.fillStyle = `rgba(${zone.rgb}, ${alphas[z] * fadeProgress})`
    ctx.fillRect(x1, 0, x2 - x1, plotHeight)

    // Fix 12 (AI Fight Club): save/restore to prevent alpha leakage on exception
    ctx.save()
    ctx.strokeStyle = theme.zoneLabel
    ctx.globalAlpha = 0.25 * fadeProgress
    ctx.lineWidth = 0.5
    ctx.beginPath()
    ctx.moveTo(x1, 0)
    ctx.lineTo(x1, plotHeight)
    ctx.stroke()
    ctx.restore()

    // Label at top center of zone
    const centerX = (x1 + x2) / 2
    const labelWidth = x2 - x1
    if (labelWidth > 30) { // only draw label if zone is wide enough
      ctx.save()
      ctx.globalAlpha = fadeProgress
      ctx.font = '10px var(--font-sans, sans-serif)'
      ctx.fillStyle = theme.zoneLabel
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillText(zone.label, centerX, 4)
      ctx.restore()
    }
  }

  // Reset text state to avoid leaking font/alignment to subsequent draw calls
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
}


/** Draw predicted axial room mode lines as faint dashed verticals on the RTA. */
export function drawRoomModeLines(
  ctx: CanvasRenderingContext2D,
  plotWidth: number,
  plotHeight: number,
  range: DbRange,
  modes: RoomMode[] | null,
  show: boolean,
  theme: CanvasTheme = DARK_CANVAS_THEME,
) {
  if (!show || !modes || modes.length === 0) return
  const sorted = [...modes].sort((a, b) => a.frequency - b.frequency)
  const deduped: { frequency: number; label: string; count: number }[] = []
  for (const mode of sorted) {
    const centsHz = mode.frequency * (Math.pow(2, 50 / 1200) - 1)
    const thresh = Math.min(Math.max(1.5, centsHz), 5)
    const existing = deduped.find(d => Math.abs(d.frequency - mode.frequency) <= thresh)
    if (existing) { existing.count++; existing.frequency = (existing.frequency + mode.frequency) / 2 }
    else deduped.push({ frequency: mode.frequency, label: mode.label, count: 1 })
  }
  const isDark = theme === DARK_CANVAS_THEME
  const lineColor = isDark ? 'rgba(147,197,253,0.25)' : 'rgba(59,130,246,0.20)'
  const labelColor = isDark ? 'rgba(147,197,253,0.45)' : 'rgba(59,130,246,0.40)'
  ctx.save()
  ctx.setLineDash([2, 4])
  for (const g of deduped) {
    const x = freqToLogPosition(g.frequency, range.freqMin, range.freqMax) * plotWidth
    if (x < 0 || x > plotWidth) continue
    ctx.lineWidth = g.count >= 3 ? 2 : g.count === 2 ? 1.5 : 1
    ctx.strokeStyle = lineColor
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, plotHeight); ctx.stroke()
    ctx.font = '9px var(--font-sans, sans-serif)'
    ctx.fillStyle = labelColor
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
    ctx.fillText(String(Math.round(g.frequency)), x, plotHeight - 2)
  }
  ctx.setLineDash([])
  ctx.restore()
}

export function drawAxisLabels(
  ctx: CanvasRenderingContext2D,
  padding: { top: number; left: number; right: number; bottom: number },
  plotWidth: number,
  plotHeight: number,
  range: DbRange,
  fontSize: number,
  width: number,
  height: number,
  theme: CanvasTheme = DARK_CANVAS_THEME,
) {
  ctx.font = `${fontSize}px monospace`
  ctx.textBaseline = 'middle'

  // Text shadow for readability
  ctx.shadowColor = theme.axisLabelShadow
  ctx.shadowBlur = 3
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = 0
  ctx.fillStyle = theme.axisLabel

  // Y-axis (dB) — thin out labels when plot is short (#4)
  ctx.textAlign = 'right'
  const dbLabels = plotHeight < 200 ? DB_MAJOR : DB_ALL
  for (const db of dbLabels) {
    const y = padding.top + ((range.dbMax - db) / (range.dbMax - range.dbMin)) * plotHeight
    ctx.fillText(`${db}`, padding.left - 5, y)
  }

  // X-axis (Hz) with tick marks (#6)
  ctx.textAlign = 'center'
  const xLabelY = padding.top + plotHeight + padding.bottom * 0.55
  ctx.strokeStyle = theme.gridMinor
  ctx.lineWidth = 0.75
  for (const freq of FREQ_LABELS) {
    const x = padding.left + freqToLogPosition(freq, range.freqMin, range.freqMax) * plotWidth
    const label = freq >= 1000 ? `${freq / 1000}k` : `${freq}`
    ctx.fillText(label, x, xLabelY)
    // Tick mark connecting axis to plot
    ctx.beginPath()
    ctx.moveTo(x, padding.top + plotHeight)
    ctx.lineTo(x, padding.top + plotHeight + 4)
    ctx.stroke()
  }

  // Reset shadow
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
}
