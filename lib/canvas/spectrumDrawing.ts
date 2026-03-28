/**
 * Spectrum Canvas Drawing Functions
 *
 * Pure canvas-drawing helpers extracted from SpectrumCanvas.tsx.
 * Stateless: all data received as parameters, no React dependency.
 */

import { freqToLogPosition, clamp } from '@/lib/utils/mathHelpers'
import { getSeverityColor } from '@/lib/dsp/eqAdvisor'
import { getSeverityUrgency } from '@/lib/dsp/severityUtils'
import { formatFrequency } from '@/lib/utils/pitchUtils'
import { CANVAS_SETTINGS, VIZ_COLORS } from '@/lib/dsp/constants'
import type { SpectrumData, Advisory } from '@/types/advisory'
import type { RoomMode } from '@/lib/dsp/acousticUtils'
import type { EarlyWarning } from '@/hooks/useAudioAnalyzer'

// ─── Types ──────────────────────────────────────────────────────────────────────

/** Theme-aware color palette for canvas drawing. Avoids per-frame getComputedStyle(). */
export interface CanvasTheme {
  background: string
  vignette: string
  gridMinor: string
  gridMajor: string
  gridFreq: string
  zoneLabel: string
  axisLabel: string
  axisLabelShadow: string
  peakHold: string
  freqRangeOverlay: string
  freqRangeLine: string
  placeholder: string
  placeholderShadow: string
}

export const DARK_CANVAS_THEME: CanvasTheme = {
  background: '#080a0c',
  vignette: 'rgba(0, 0, 0, 0.4)',
  gridMinor: '#121416',
  gridMajor: '#1e2024',
  gridFreq: '#161820',
  zoneLabel: 'rgba(160, 170, 190, 0.35)',
  axisLabel: '#8891a0',
  axisLabelShadow: 'rgba(0,0,0,0.7)',
  peakHold: 'rgba(200, 210, 225, 0.25)',
  freqRangeOverlay: 'rgba(0, 0, 0, 0.45)',
  freqRangeLine: '#4B92FF',
  placeholder: 'rgba(59, 130, 246, 0.12)',
  placeholderShadow: 'rgba(75, 146, 255, 0.35)',
}

export const LIGHT_CANVAS_THEME: CanvasTheme = {
  background: '#f0f1f4',
  vignette: 'rgba(0, 0, 0, 0.06)',
  gridMinor: '#d8dbe0',
  gridMajor: '#c0c5cc',
  gridFreq: '#d0d4da',
  zoneLabel: 'rgba(80, 90, 110, 0.45)',
  axisLabel: '#5a6478',
  axisLabelShadow: 'rgba(255,255,255,0.5)',
  peakHold: 'rgba(50, 60, 80, 0.30)',
  freqRangeOverlay: 'rgba(255, 255, 255, 0.45)',
  freqRangeLine: '#2563eb',
  placeholder: 'rgba(37, 99, 235, 0.10)',
  placeholderShadow: 'rgba(37, 99, 235, 0.25)',
}

export interface DbRange {
  dbMin: number
  dbMax: number
  freqMin: number
  freqMax: number
}

// ─── Constants ──────────────────────────────────────────────────────────────────

export const DB_MAJOR = [-90, -60, -30, 0]
export const DB_MINOR = [-80, -70, -50, -40, -20, -10]
export const DB_ALL = [...DB_MAJOR, ...DB_MINOR].sort((a, b) => a - b)

export const FREQ_LABELS = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]

/**
 * Peak hold decay rate in dB per second (frame-rate-independent).
 * At the canvas target of ~25 fps this yields ~0.5 dB/frame, matching pre-v0.8.0 visuals.
 * Using elapsed time instead of a fixed per-frame constant ensures consistent decay
 * across varying frame rates (throttled tabs, high-refresh monitors, etc.).
 */
export const PEAK_HOLD_DECAY_DB_PER_SEC = 12.5

/**
 * Maximum delta-time (seconds) used for peak hold decay calculation.
 * Clamps large gaps (e.g. returning from a backgrounded tab) so peaks
 * don't instantly vanish in a single frame.
 */
export const PEAK_HOLD_MAX_DT_SEC = 0.25

/** @deprecated Use PEAK_HOLD_DECAY_DB_PER_SEC with time-based decay instead. */
export const PEAK_HOLD_DECAY_DB = 0.5

/** Frequency->dB points describing a realistic idle room noise shape */
export const PLACEHOLDER_CURVE: [number, number][] = [
  [20, -92], [30, -88], [50, -78], [80, -70], [120, -64],
  [200, -58], [350, -55], [500, -54], [800, -56], [1200, -60],
  [2000, -64], [3500, -69], [5000, -74], [8000, -80], [12000, -86],
  [16000, -91], [20000, -95],
]

// ─── Drawing Functions ──────────────────────────────────────────────────────────

export function calcPadding(width: number, height: number) {
  return {
    top: Math.round(height * 0.05),
    right: Math.round(width * 0.02),
    bottom: Math.round(height * 0.09),
    left: Math.round(width * 0.065),
  }
}

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

  // Minor dB grid (subtle, drawn first)
  ctx.strokeStyle = theme.gridMinor
  ctx.lineWidth = 0.5
  ctx.beginPath()
  for (const db of DB_MINOR) {
    const y = ((range.dbMax - db) / (range.dbMax - range.dbMin)) * plotHeight
    ctx.moveTo(0, y)
    ctx.lineTo(plotWidth, y)
  }
  ctx.stroke()

  // Major dB grid (brighter, on top)
  ctx.strokeStyle = theme.gridMajor
  ctx.lineWidth = 1
  ctx.beginPath()
  for (const db of DB_MAJOR) {
    const y = ((range.dbMax - db) / (range.dbMax - range.dbMin)) * plotHeight
    ctx.moveTo(0, y)
    ctx.lineTo(plotWidth, y)
  }
  ctx.stroke()

  // Frequency grid
  ctx.strokeStyle = theme.gridFreq
  ctx.lineWidth = 0.5
  ctx.beginPath()
  for (const freq of FREQ_LABELS) {
    const x = freqToLogPosition(freq, range.freqMin, range.freqMax) * plotWidth
    ctx.moveTo(x, 0)
    ctx.lineTo(x, plotHeight)
  }
  ctx.stroke()
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
const ZONE_ALPHA_DARK  = [0.12, 0.10, 0.10, 0.08, 0.08]
const ZONE_ALPHA_LIGHT = [0.08, 0.07, 0.07, 0.06, 0.06]

/**
 * Draw labeled frequency zone bands behind the spectrum.
 * Tinted rectangles with labels at top to help engineers orient.
 * Theme-aware: stronger fills on dark backgrounds, subtler on light.
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
  if (!showZones) return
  const isDark = theme === DARK_CANVAS_THEME
  const alphas = isDark ? ZONE_ALPHA_DARK : ZONE_ALPHA_LIGHT

  for (let z = 0; z < FREQ_ZONE_BANDS.length; z++) {
    const zone = FREQ_ZONE_BANDS[z]
    const x1 = freqToLogPosition(Math.max(zone.minHz, range.freqMin), range.freqMin, range.freqMax) * plotWidth
    const x2 = freqToLogPosition(Math.min(zone.maxHz, range.freqMax), range.freqMin, range.freqMax) * plotWidth
    if (x2 <= x1) continue // zone outside visible range

    // Tinted background band
    ctx.fillStyle = `rgba(${zone.rgb}, ${alphas[z]})`
    ctx.fillRect(x1, 0, x2 - x1, plotHeight)

    // Fix 12 (AI Fight Club): save/restore to prevent alpha leakage on exception
    ctx.save()
    ctx.strokeStyle = theme.zoneLabel
    ctx.globalAlpha = 0.25
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
      ctx.font = '10px var(--font-sans, sans-serif)'
      ctx.fillStyle = theme.zoneLabel
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillText(zone.label, centerX, 4)
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

export function drawIndicatorLines(
  ctx: CanvasRenderingContext2D,
  plotWidth: number,
  plotHeight: number,
  range: DbRange,
  spectrum: SpectrumData | null,
  showThresholdLine: boolean,
  feedbackThresholdDb: number | undefined,
  fontSize: number,
  showDragHint: boolean = false,
) {
  // Noise floor
  if (spectrum?.noiseFloorDb !== null && spectrum?.noiseFloorDb !== undefined) {
    const floorY = ((range.dbMax - spectrum.noiseFloorDb) / (range.dbMax - range.dbMin)) * plotHeight

    // Semi-transparent fill below noise floor (subtle region indicator)
    ctx.fillStyle = `${VIZ_COLORS.NOISE_FLOOR}0D` // ~5% opacity
    ctx.fillRect(0, floorY, plotWidth, plotHeight - floorY)

    // Fix 12 (AI Fight Club): save/restore to prevent alpha/dash leakage on exception
    ctx.save()
    ctx.strokeStyle = VIZ_COLORS.NOISE_FLOOR
    ctx.globalAlpha = 0.6
    ctx.lineWidth = 1
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(0, floorY)
    ctx.lineTo(plotWidth, floorY)
    ctx.stroke()

    // Right-aligned label
    ctx.font = `${Math.max(8, fontSize - 2)}px monospace`
    ctx.fillStyle = VIZ_COLORS.NOISE_FLOOR
    ctx.globalAlpha = 0.85
    ctx.textAlign = 'right'
    ctx.fillText('Floor', plotWidth - 4, floorY - 4)
    ctx.restore()
  }

  // Effective threshold
  if (showThresholdLine && spectrum?.effectiveThresholdDb != null) {
    const threshY = ((range.dbMax - spectrum.effectiveThresholdDb) / (range.dbMax - range.dbMin)) * plotHeight
    ctx.strokeStyle = VIZ_COLORS.THRESHOLD
    ctx.globalAlpha = 0.5
    ctx.lineWidth = 1.5
    ctx.setLineDash([6, 6])
    ctx.beginPath()
    ctx.moveTo(0, threshY)
    ctx.lineTo(plotWidth, threshY)
    ctx.stroke()
    ctx.setLineDash([])
    // Grab handle — rounded rect on right side, indicates draggable
    // Enlarged for better discoverability (12×36px — exceeds 44px touch target with grab radius)
    const handleW = 12
    const handleH = 36
    const handleX = plotWidth - handleW - 2
    const handleY = threshY - handleH / 2

    // Subtle glow behind handle for first-time users (pulsing via showDragHint)
    if (showDragHint) {
      ctx.fillStyle = VIZ_COLORS.THRESHOLD
      ctx.globalAlpha = 0.15
      const glowPath = new Path2D()
      glowPath.roundRect(handleX - 4, handleY - 4, handleW + 8, handleH + 8, 6)
      ctx.fill(glowPath)
    }

    ctx.fillStyle = VIZ_COLORS.THRESHOLD
    ctx.globalAlpha = 0.75
    const handlePath = new Path2D()
    handlePath.roundRect(handleX, handleY, handleW, handleH, 4)
    ctx.fill(handlePath)
    // Inner notch lines (3 horizontal lines to indicate drag affordance)
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)'
    ctx.lineWidth = 1
    ctx.globalAlpha = 1
    for (let i = -1; i <= 1; i++) {
      const ny = threshY + i * 6
      ctx.beginPath()
      ctx.moveTo(handleX + 3, ny)
      ctx.lineTo(handleX + handleW - 3, ny)
      ctx.stroke()
    }

    // Right-aligned label (positioned left of handle)
    const threshLabel = `Sens +${feedbackThresholdDb ?? 0}dB`
    ctx.font = `${Math.max(8, fontSize - 2)}px monospace`
    ctx.fillStyle = VIZ_COLORS.THRESHOLD
    ctx.textAlign = 'right'
    ctx.globalAlpha = 0.7
    ctx.fillText(threshLabel, handleX - 6, threshY - 4)

    // First-drag hint — shows until user drags the threshold for the first time
    if (showDragHint) {
      ctx.font = `bold ${Math.max(10, fontSize)}px monospace`
      ctx.fillStyle = VIZ_COLORS.THRESHOLD
      ctx.globalAlpha = 0.65
      ctx.textAlign = 'right'
      ctx.fillText('↕ Drag to adjust sensitivity', handleX - 6, threshY + 14)
    }

    ctx.globalAlpha = 1
    ctx.textAlign = 'left'
  }
}

export function drawSpectrum(
  ctx: CanvasRenderingContext2D,
  plotWidth: number,
  plotHeight: number,
  range: DbRange,
  spectrum: SpectrumData | null,
  gradientRef: { current: CanvasGradient | null },
  gradientHeightRef: { current: number },
  spectrumLineWidth: number,
  peakHoldRef: { current: Float32Array | null },
  warmMode: boolean = false,
  theme: CanvasTheme = DARK_CANVAS_THEME,
  dtSeconds: number = 0.04,
) {
  if (!spectrum?.freqDb || !spectrum.sampleRate || !spectrum.fftSize) return

  const freqDb = spectrum.freqDb
  const hzPerBin = spectrum.sampleRate / spectrum.fftSize
  const n = freqDb.length

  // ── Update peak hold buffer (frame-rate-independent decay) ───
  const clampedDt = Math.min(dtSeconds, PEAK_HOLD_MAX_DT_SEC)
  const decayDb = PEAK_HOLD_DECAY_DB_PER_SEC * clampedDt
  let peakHold = peakHoldRef.current
  if (!peakHold || peakHold.length !== n) {
    peakHold = new Float32Array(n)
    peakHold.set(freqDb) // Initialize to current spectrum
    peakHoldRef.current = peakHold
  } else {
    for (let i = 0; i < n; i++) {
      peakHold[i] = Math.max(freqDb[i], peakHold[i] - decayDb)
    }
  }

  // Color channels: blue (default) or amber (warm mode)
  // Light theme always uses blue — amber is hard to read on light backgrounds
  const useWarm = warmMode && theme === DARK_CANVAS_THEME
  const r = useWarm ? 255 : 75
  const g = useWarm ? 179 : 146
  const b = useWarm ? 71 : 255

  // Cached gradient fill — recreated when plotHeight, warmMode, or theme changes
  // Encode warmMode+theme into sign to force invalidation
  const cacheKey = useWarm ? -plotHeight : plotHeight
  let gradient = gradientRef.current
  if (!gradient || gradientHeightRef.current !== cacheKey) {
    gradient = ctx.createLinearGradient(0, 0, 0, plotHeight)
    gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.85)`)
    gradient.addColorStop(0.4, `rgba(${r}, ${g}, ${b}, 0.35)`)
    gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0.05)`)
    gradientRef.current = gradient
    gradientHeightRef.current = cacheKey
  }

  // Single merged pass: build spectrum + peak-hold paths together (saves N freqToLogPosition calls)
  const strokePath = new Path2D()
  const fillPath = new Path2D()
  const holdPath = new Path2D()
  let lastX = 0
  let specStarted = false
  let holdStarted = false
  const dbSpan = range.dbMax - range.dbMin

  for (let i = 1; i < n; i++) {
    const freq = i * hzPerBin
    if (freq < range.freqMin || freq > range.freqMax) continue

    const x = freqToLogPosition(freq, range.freqMin, range.freqMax) * plotWidth

    // Spectrum path
    const db = clamp(freqDb[i], range.dbMin, range.dbMax)
    const y = ((range.dbMax - db) / dbSpan) * plotHeight
    if (!specStarted) {
      strokePath.moveTo(x, y)
      fillPath.moveTo(x, plotHeight)
      fillPath.lineTo(x, y)
      specStarted = true
    } else {
      strokePath.lineTo(x, y)
      fillPath.lineTo(x, y)
    }
    lastX = x

    // Peak hold path (same x, different y)
    const holdDb = clamp(peakHold[i], range.dbMin, range.dbMax)
    const holdY = ((range.dbMax - holdDb) / dbSpan) * plotHeight
    if (!holdStarted) {
      holdPath.moveTo(x, holdY)
      holdStarted = true
    } else {
      holdPath.lineTo(x, holdY)
    }
  }

  // Complete fill path back to baseline
  fillPath.lineTo(lastX, plotHeight)
  fillPath.closePath()

  // Draw fill then stroke (with layered glow)
  ctx.fillStyle = gradient
  ctx.fill(fillPath)

  const spectrumColor = `rgb(${r}, ${g}, ${b})`
  ctx.strokeStyle = spectrumColor

  // Deep halo — wide, barely visible
  ctx.globalAlpha = 0.06
  ctx.lineWidth = spectrumLineWidth + 8
  ctx.stroke(strokePath)

  // Mid glow — semi-transparent
  ctx.globalAlpha = 0.15
  ctx.lineWidth = spectrumLineWidth + 3
  ctx.stroke(strokePath)

  // Sharp pass — crisp line with shadow bloom
  ctx.globalAlpha = 1
  ctx.lineWidth = spectrumLineWidth
  ctx.shadowColor = `rgba(${r}, ${g}, ${b}, 0.35)`
  ctx.shadowBlur = 6
  ctx.stroke(strokePath)
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0

  // ── Peak hold trace — thin line above spectrum ──────────
  ctx.strokeStyle = theme.peakHold
  ctx.lineWidth = 1
  ctx.stroke(holdPath)
}

export function drawFreqRangeOverlay(
  ctx: CanvasRenderingContext2D,
  plotWidth: number,
  plotHeight: number,
  range: DbRange,
  freqRange: { min: number; max: number },
  theme: CanvasTheme = DARK_CANVAS_THEME,
) {
  const rangeMinX = freqToLogPosition(Math.max(freqRange.min, range.freqMin), range.freqMin, range.freqMax) * plotWidth
  const rangeMaxX = freqToLogPosition(Math.min(freqRange.max, range.freqMax), range.freqMin, range.freqMax) * plotWidth

  // Dim overlay outside detection range
  ctx.fillStyle = theme.freqRangeOverlay
  if (rangeMinX > 0) ctx.fillRect(0, 0, rangeMinX, plotHeight)
  if (rangeMaxX < plotWidth) ctx.fillRect(rangeMaxX, 0, plotWidth - rangeMaxX, plotHeight)

  // Vertical boundary lines
  const lineColor = theme.freqRangeLine
  ctx.strokeStyle = lineColor
  ctx.lineWidth = 2
  ctx.globalAlpha = 0.85

  // Min line
  ctx.beginPath()
  ctx.moveTo(rangeMinX, 0)
  ctx.lineTo(rangeMinX, plotHeight)
  ctx.stroke()

  // Max line
  ctx.beginPath()
  ctx.moveTo(rangeMaxX, 0)
  ctx.lineTo(rangeMaxX, plotHeight)
  ctx.stroke()

  // Grab handles (small rounded rects at vertical center)
  const handleW = 6
  const handleH = 24
  const handleY = (plotHeight - handleH) / 2
  ctx.fillStyle = lineColor
  ctx.globalAlpha = 0.7

  // Min handle
  const minHandleRect = new Path2D()
  minHandleRect.roundRect(rangeMinX - handleW / 2, handleY, handleW, handleH, 3)
  ctx.fill(minHandleRect)

  // Max handle
  const maxHandleRect = new Path2D()
  maxHandleRect.roundRect(rangeMaxX - handleW / 2, handleY, handleW, handleH, 3)
  ctx.fill(maxHandleRect)

  ctx.globalAlpha = 1
}

/**
 * Draw semi-transparent notch-width overlays behind advisory markers.
 *
 * For clustered advisories, the band spans clusterMinHz–clusterMaxHz
 * (matching the widened PEQ Q). For single peaks, the band is derived
 * from the PEQ Q recommendation: bandwidth = centerHz / Q.
 *
 * Drawn before drawMarkers() so peak dots/lines render on top.
 */
export function drawNotchOverlays(
  ctx: CanvasRenderingContext2D,
  plotWidth: number,
  plotHeight: number,
  range: DbRange,
  advisories: Advisory[],
  clearedIds: Set<string> | undefined,
  theme: CanvasTheme = DARK_CANVAS_THEME,
): Set<string> {
  const isDark = theme === DARK_CANVAS_THEME
  const notchedIds = new Set<string>()
  const visible = advisories
    .filter(a => !clearedIds?.has(a.id))
    .slice(-7) // Same cap as drawMarkers

  // Build pixel-space bars, then merge overlapping/adjacent ones into solid blocks
  const bars: { x1: number; x2: number; color: string; ids: string[] }[] = []

  for (const advisory of visible) {
    const centerHz = advisory.trueFrequencyHz
    const peqQ = advisory.advisory?.peq?.q ?? advisory.qEstimate

    // Determine band edges: cluster bounds or Q-derived bandwidth
    let minHz: number
    let maxHz: number
    if (advisory.clusterMinHz && advisory.clusterMaxHz && advisory.clusterMinHz < advisory.clusterMaxHz) {
      // Cluster: add 25% visual margin beyond the notch edges
      const span = advisory.clusterMaxHz - advisory.clusterMinHz
      const margin = span * 0.25
      minHz = advisory.clusterMinHz - margin
      maxHz = advisory.clusterMaxHz + margin
    } else {
      // Single peak: derive from PEQ Q
      const halfBw = centerHz / (2 * peqQ)
      minHz = centerHz - halfBw
      maxHz = centerHz + halfBw
    }

    // Clamp to visible range and convert to pixels
    const x1 = freqToLogPosition(Math.max(minHz, range.freqMin), range.freqMin, range.freqMax) * plotWidth
    const x2 = freqToLogPosition(Math.min(maxHz, range.freqMax), range.freqMin, range.freqMax) * plotWidth
    if (x2 - x1 < 1) continue

    const color = getSeverityColor(advisory.severity)
    bars.push({ x1, x2: Math.max(x2, x1 + 8), color, ids: [advisory.id] })
  }

  // Sort by x1, then merge nearby bars into single solid blocks
  // 3% of plot width (~27px on 900px) catches advisories in the same problem zone
  const mergeGap = plotWidth * 0.03
  bars.sort((a, b) => a.x1 - b.x1)
  const merged: typeof bars = []
  for (const bar of bars) {
    const prev = merged[merged.length - 1]
    if (prev && bar.x1 <= prev.x2 + mergeGap) {
      // Merge: extend previous bar, keep highest-severity color
      prev.x2 = Math.max(prev.x2, bar.x2)
      prev.ids.push(...bar.ids)
    } else {
      merged.push({ ...bar })
    }
  }

  // Draw merged bars as single solid blocks
  for (const bar of merged) {
    ctx.fillStyle = bar.color
    ctx.globalAlpha = 0.15
    ctx.fillRect(bar.x1, 0, bar.x2 - bar.x1, plotHeight)
    for (const id of bar.ids) notchedIds.add(id)
  }

  ctx.globalAlpha = 1
  return notchedIds
}

export function drawMarkers(
  ctx: CanvasRenderingContext2D,
  plotWidth: number,
  plotHeight: number,
  range: DbRange,
  earlyWarning: EarlyWarning | null | undefined,
  advisories: Advisory[],
  clearedIds: Set<string> | undefined,
  peakMarkerRadius: number,
  fontSize: number,
  theme: CanvasTheme = DARK_CANVAS_THEME,
  notchedIds?: Set<string>,
) {
  const isDark = theme === DARK_CANVAS_THEME
  // Early warning predictions
  if (earlyWarning && earlyWarning.predictedFrequencies.length > 0) {
    const warningColor = '#f59e0b' // amber-500
    ctx.strokeStyle = warningColor
    ctx.lineWidth = 1.5
    ctx.setLineDash([6, 4])
    ctx.globalAlpha = 0.6

    for (const freq of earlyWarning.predictedFrequencies) {
      if (freq < range.freqMin || freq > range.freqMax) continue
      const x = freqToLogPosition(freq, range.freqMin, range.freqMax) * plotWidth

      // Vertical dashed line
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, plotHeight)
      ctx.stroke()

      // Warning triangle at top
      ctx.fillStyle = warningColor
      ctx.beginPath()
      ctx.moveTo(x, 8)
      ctx.lineTo(x - 5, 0)
      ctx.lineTo(x + 5, 0)
      ctx.closePath()
      ctx.fill()
    }

    ctx.setLineDash([])
    ctx.globalAlpha = 1
  }

  // Advisory peak markers (persist until cleared, cap at 7)
  const visibleAdvisories = advisories
    .filter(a => !clearedIds?.has(a.id))
    .slice(-7)

  // Pre-compute label positions and determine which labels to show when overlapping.
  // Higher-severity (more problematic) advisories win; ties broken by confidence.
  const labelFont = `${fontSize + 3}px monospace`
  ctx.font = labelFont
  // Collision padding: pillPadX(7) + border(1) + shadow(1) + visual gap(7) = 16
  const labelPadding = 16
  const labelShowFlags: boolean[] = new Array(visibleAdvisories.length).fill(false)

  // Build priority-sorted indices (most problematic first)
  const indices = visibleAdvisories.map((_, i) => i)
  indices.sort((a, b) => {
    const urgA = getSeverityUrgency(visibleAdvisories[a].severity)
    const urgB = getSeverityUrgency(visibleAdvisories[b].severity)
    if (urgB !== urgA) return urgB - urgA
    return visibleAdvisories[b].confidence - visibleAdvisories[a].confidence
  })

  // Pre-compute x-center for each advisory
  const labelXCenters: number[] = visibleAdvisories.map(advisory =>
    freqToLogPosition(advisory.trueFrequencyHz, range.freqMin, range.freqMax) * plotWidth
  )

  // Compute label x-ranges (center ± half-width + padding)
  const labelXRanges: Array<{ left: number; right: number }> = visibleAdvisories.map((advisory, i) => {
    const halfWidth = ctx.measureText(formatFrequency(advisory.trueFrequencyHz)).width / 2 + labelPadding
    return { left: labelXCenters[i] - halfWidth, right: labelXCenters[i] + halfWidth }
  })

  // Greedily accept labels in priority order, reject overlaps
  const accepted: number[] = []
  for (const idx of indices) {
    const range_i = labelXRanges[idx]
    const overlaps = accepted.some(a => {
      const range_a = labelXRanges[a]
      return range_i.left < range_a.right && range_i.right > range_a.left
    })
    if (!overlaps) {
      labelShowFlags[idx] = true
      accepted.push(idx)
    }
  }

  // Merge nearby suppressed labels into range pills for accepted labels.
  // Each accepted label absorbs suppressed neighbors within merge distance,
  // producing a range label like "820–950Hz" or "1.2–1.5kHz ×3".
  const mergeDistance = labelPadding * 3
  const mergedLabelText = new Map<number, string>()
  const mergedLabelRange = new Map<number, { minHz: number; maxHz: number }>()
  const claimed = new Set<number>() // prevent double-claiming suppressed labels

  for (const acceptedIdx of accepted) {
    const group = [acceptedIdx]
    for (let j = 0; j < visibleAdvisories.length; j++) {
      if (labelShowFlags[j] || j === acceptedIdx || claimed.has(j)) continue
      const dist = Math.abs(labelXCenters[j] - labelXCenters[acceptedIdx])
      if (dist < mergeDistance) {
        group.push(j)
        claimed.add(j)
      }
    }
    if (group.length > 1) {
      const freqs = group.map(i => visibleAdvisories[i].trueFrequencyHz)
      const minF = Math.min(...freqs)
      const maxF = Math.max(...freqs)
      const countSuffix = group.length >= 3 ? ` ×${group.length}` : ''
      mergedLabelText.set(acceptedIdx, `${formatFrequency(minF)}–${formatFrequency(maxF)}${countSuffix}`)
      mergedLabelRange.set(acceptedIdx, { minHz: minF, maxHz: maxF })
    }
  }

  for (let i = 0; i < visibleAdvisories.length; i++) {
    const advisory = visibleAdvisories[i]
    const freq = advisory.trueFrequencyHz
    const db = advisory.trueAmplitudeDb
    const x = freqToLogPosition(freq, range.freqMin, range.freqMax) * plotWidth
    const y = ((range.dbMax - clamp(db, range.dbMin, range.dbMax)) / (range.dbMax - range.dbMin)) * plotHeight
    const color = getSeverityColor(advisory.severity)

    // Vertical line — skip when notch overlay already marks this frequency
    if (!notchedIds?.has(advisory.id)) {
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.globalAlpha = 0.42
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x, plotHeight)
      ctx.stroke()
    }

    // Peak halo — soft glow ring behind dot
    ctx.fillStyle = color
    ctx.globalAlpha = 0.15
    ctx.beginPath()
    ctx.arc(x, y, peakMarkerRadius * 2.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1

    // Peak dot
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(x, y, peakMarkerRadius, 0, Math.PI * 2)
    ctx.fill()

    // Frequency label — only show if not occluded by a higher-priority label
    if (labelShowFlags[i]) {
      const labelText = mergedLabelText.get(i) ?? formatFrequency(freq)

      // Merged range highlight band — severity-tinted full-height fill
      const mergeRange = mergedLabelRange.get(i)
      if (mergeRange) {
        const rx1 = freqToLogPosition(mergeRange.minHz, range.freqMin, range.freqMax) * plotWidth
        const rx2 = freqToLogPosition(mergeRange.maxHz, range.freqMin, range.freqMax) * plotWidth
        ctx.fillStyle = color
        ctx.globalAlpha = isDark ? 0.08 : 0.10
        ctx.fillRect(rx1, 0, rx2 - rx1, plotHeight)
        ctx.globalAlpha = 1
      }

      ctx.font = labelFont
      ctx.textAlign = 'center'
      const labelY = y - 10

      // Pro audio callout badge — frosted glass with severity accent
      // Uses measureText bounding box to perfectly center text inside pill
      const metrics = ctx.measureText(labelText)
      const ascent = metrics.actualBoundingBoxAscent
      const descent = metrics.actualBoundingBoxDescent
      const pillPadX = 7
      const pillPadY = 4
      const pillW = metrics.width + pillPadX * 2
      const pillH = ascent + descent + pillPadY * 2
      const pillX = x - pillW / 2
      // labelY is the text baseline — pill top sits ascent + padding above it
      const pillY = labelY - ascent - pillPadY
      const pillR = 4

      // 1. Drop shadow for depth
      ctx.fillStyle = isDark
        ? 'rgba(0, 0, 0, 0.35)'
        : 'rgba(0, 0, 0, 0.10)'
      ctx.beginPath()
      ctx.roundRect(pillX + 1, pillY + 2, pillW, pillH, pillR)
      ctx.fill()

      // 2. Frosted glass fill
      ctx.fillStyle = isDark
        ? 'rgba(12, 14, 18, 0.88)'
        : 'rgba(255, 255, 255, 0.93)'
      ctx.beginPath()
      ctx.roundRect(pillX, pillY, pillW, pillH, pillR)
      ctx.fill()

      // 3. Severity-tinted border (single path, no re-stroke)
      ctx.strokeStyle = color
      ctx.globalAlpha = isDark ? 0.35 : 0.50
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.globalAlpha = 1

      // 4. Severity accent strip at bottom (instrument LED bar)
      const accentH = 1.5
      ctx.fillStyle = color
      ctx.globalAlpha = isDark ? 0.50 : 0.60
      ctx.beginPath()
      ctx.roundRect(pillX + 2, pillY + pillH - accentH - 1, pillW - 4, accentH, 1)
      ctx.fill()
      ctx.globalAlpha = 1

      // 5. Label text — crisp against glass with subtle shadow
      ctx.shadowColor = isDark
        ? 'rgba(0, 0, 0, 0.70)'
        : 'rgba(255, 255, 255, 0.85)'
      ctx.shadowBlur = isDark ? 1 : 2
      ctx.shadowOffsetX = 0
      ctx.shadowOffsetY = isDark ? 1 : 0
      ctx.fillStyle = color
      ctx.fillText(labelText, x, labelY)
      ctx.shadowColor = 'transparent'
      ctx.shadowBlur = 0
      ctx.shadowOffsetY = 0
    }
  }
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

  // Y-axis (dB)
  ctx.textAlign = 'right'
  for (const db of DB_ALL) {
    const y = padding.top + ((range.dbMax - db) / (range.dbMax - range.dbMin)) * plotHeight
    ctx.fillText(`${db}`, padding.left - 5, y)
  }

  // X-axis (Hz)
  ctx.textAlign = 'center'
  const xLabelY = padding.top + plotHeight + padding.bottom * 0.55
  for (const freq of FREQ_LABELS) {
    const x = padding.left + freqToLogPosition(freq, range.freqMin, range.freqMax) * plotWidth
    const label = freq >= 1000 ? `${freq / 1000}k` : `${freq}`
    ctx.fillText(label, x, xLabelY)
  }

  // Reset shadow
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
}

// ─── Placeholder (pre-analysis idle state) ──────────────────────────────────────

export function drawPlaceholder(
  canvas: HTMLCanvasElement,
  graphFontSize: number,
  rtaDbMin: number | undefined,
  rtaDbMax: number | undefined,
  theme: CanvasTheme = DARK_CANVAS_THEME,
) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const dpr = window.devicePixelRatio || 1
  const width = canvas.width / dpr
  const height = canvas.height / dpr
  if (width === 0 || height === 0) return

  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.scale(dpr, dpr)
  ctx.clearRect(0, 0, width, height)

  const padding = calcPadding(width, height)
  const plotWidth = width - padding.left - padding.right
  const plotHeight = height - padding.top - padding.bottom

  const scaledFontSize = Math.max(9, Math.min(16, Math.round(width * 0.01)))
  const fontSize = Math.round((graphFontSize + scaledFontSize) / 2)

  const range: DbRange = {
    dbMin: rtaDbMin ?? CANVAS_SETTINGS.RTA_DB_MIN,
    dbMax: rtaDbMax ?? CANVAS_SETTINGS.RTA_DB_MAX,
    freqMin: CANVAS_SETTINGS.RTA_FREQ_MIN,
    freqMax: CANVAS_SETTINGS.RTA_FREQ_MAX,
  }

  ctx.save()
  ctx.translate(padding.left, padding.top)

  drawGrid(ctx, plotWidth, plotHeight, range, theme)

  // Educational frequency zone bands — always shown at idle
  drawFreqZones(ctx, plotWidth, plotHeight, range, true, theme)

  // Draw fake spectrum fill + stroke using PLACEHOLDER_CURVE
  // Use freqRangeLine color (primary blue) for the placeholder spectrum
  const pColor = theme.freqRangeLine
  const gradient = ctx.createLinearGradient(0, 0, 0, plotHeight)
  gradient.addColorStop(0, pColor + 'd9')  // ~85% opacity
  gradient.addColorStop(0.5, pColor + '73') // ~45% opacity (was 35%)
  gradient.addColorStop(1, pColor + '1a')   // ~10% opacity (was 5%)

  const strokePath = new Path2D()
  const fillPath = new Path2D()
  let started = false
  let lastX = 0

  for (const [freq, db] of PLACEHOLDER_CURVE) {
    if (freq < range.freqMin || freq > range.freqMax) continue
    const x = freqToLogPosition(freq, range.freqMin, range.freqMax) * plotWidth
    const y = ((range.dbMax - clamp(db, range.dbMin, range.dbMax)) / (range.dbMax - range.dbMin)) * plotHeight

    if (!started) {
      strokePath.moveTo(x, y)
      fillPath.moveTo(x, plotHeight)
      fillPath.lineTo(x, y)
      started = true
    } else {
      strokePath.lineTo(x, y)
      fillPath.lineTo(x, y)
    }
    lastX = x
  }

  fillPath.lineTo(lastX, plotHeight)
  fillPath.closePath()

  ctx.fillStyle = gradient
  ctx.fill(fillPath)

  ctx.strokeStyle = VIZ_COLORS.SPECTRUM

  // Deep halo
  ctx.globalAlpha = 0.06
  ctx.lineWidth = 9.5
  ctx.stroke(strokePath)

  // Mid glow
  ctx.globalAlpha = 0.15
  ctx.lineWidth = 4.5
  ctx.stroke(strokePath)

  // Sharp line with bloom
  ctx.globalAlpha = 1
  ctx.lineWidth = 1.5
  ctx.shadowColor = theme.placeholderShadow
  ctx.shadowBlur = 6
  ctx.stroke(strokePath)
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0

  ctx.restore()

  drawAxisLabels(ctx, padding, plotWidth, plotHeight, range, fontSize, width, height, theme)
}

// ─── PA2 RTA Overlay ─────────────────────────────────────────────────────────

/** ISO 31-band center frequencies matching PA2's RTA */
const PA2_RTA_FREQS = [
  20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160,
  200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600,
  2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000, 20000,
]

/**
 * Draw PA2's 31-band RTA as a dashed stepped line overlay.
 * Shows what the PA2's measurement mic sees vs the browser mic.
 */
export function drawPA2RTATrace(
  ctx: CanvasRenderingContext2D,
  plotWidth: number,
  plotHeight: number,
  range: DbRange,
  pa2RTA: Readonly<Record<string, number>>,
  theme: CanvasTheme = DARK_CANVAS_THEME,
) {
  const entries = Object.entries(pa2RTA)
  if (entries.length === 0) return

  const isDark = theme === DARK_CANVAS_THEME
  const color = isDark ? 'rgba(0, 200, 220, 0.4)' : 'rgba(0, 120, 180, 0.3)'

  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = 1.5
  ctx.setLineDash([4, 4])

  ctx.beginPath()
  let started = false

  for (const freq of PA2_RTA_FREQS) {
    const db = pa2RTA[String(freq)]
    if (db === undefined || db <= -89) continue
    if (freq < range.freqMin || freq > range.freqMax) continue

    const x = freqToLogPosition(freq, range.freqMin, range.freqMax) * plotWidth
    const y = ((range.dbMax - clamp(db, range.dbMin, range.dbMax)) / (range.dbMax - range.dbMin)) * plotHeight

    if (!started) {
      ctx.moveTo(x, y)
      started = true
    } else {
      ctx.lineTo(x, y)
    }
  }

  ctx.stroke()
  ctx.setLineDash([])

  // Label pill
  if (started) {
    const labelX = plotWidth - 60
    const labelY = 12
    ctx.fillStyle = isDark ? 'rgba(0, 200, 220, 0.15)' : 'rgba(0, 120, 180, 0.12)'
    ctx.beginPath()
    ctx.roundRect(labelX, labelY - 8, 52, 16, 4)
    ctx.fill()
    ctx.fillStyle = color
    ctx.font = '9px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('PA2 RTA', labelX + 26, labelY + 4)
  }

  ctx.restore()
}

/**
 * Draw PA2's current GEQ state as a stepped bar overlay.
 * Shows which GEQ bands have been adjusted.
 */
export function drawPA2GEQOverlay(
  ctx: CanvasRenderingContext2D,
  plotWidth: number,
  plotHeight: number,
  range: DbRange,
  pa2GEQ: Readonly<Record<string, number>>,
  theme: CanvasTheme = DARK_CANVAS_THEME,
) {
  const entries = Object.entries(pa2GEQ)
  if (entries.length === 0) return

  const isDark = theme === DARK_CANVAS_THEME
  const fillColor = isDark ? 'rgba(0, 180, 255, 0.08)' : 'rgba(0, 100, 200, 0.06)'
  const strokeColor = isDark ? 'rgba(0, 180, 255, 0.3)' : 'rgba(0, 100, 200, 0.25)'

  ctx.save()

  for (let i = 0; i < PA2_RTA_FREQS.length; i++) {
    const freq = PA2_RTA_FREQS[i]
    const bandNum = String(i + 1)
    const gain = pa2GEQ[bandNum]
    if (gain === undefined || gain === 0) continue
    if (freq < range.freqMin || freq > range.freqMax) continue

    // Calculate bar position and width
    const nextFreq = i < PA2_RTA_FREQS.length - 1 ? PA2_RTA_FREQS[i + 1] : freq * 1.26
    const prevFreq = i > 0 ? PA2_RTA_FREQS[i - 1] : freq / 1.26
    const x1 = freqToLogPosition(Math.sqrt(prevFreq * freq), range.freqMin, range.freqMax) * plotWidth
    const x2 = freqToLogPosition(Math.sqrt(freq * nextFreq), range.freqMin, range.freqMax) * plotWidth
    const barWidth = Math.max(2, x2 - x1)

    // Height proportional to gain (0dB = zero line at center-ish)
    const zeroY = ((range.dbMax - 0) / (range.dbMax - range.dbMin)) * plotHeight
    const gainY = ((range.dbMax - gain) / (range.dbMax - range.dbMin)) * plotHeight
    const barHeight = gainY - zeroY

    ctx.fillStyle = fillColor
    ctx.fillRect(x1, zeroY, barWidth, barHeight)
    ctx.strokeStyle = strokeColor
    ctx.lineWidth = 1
    ctx.strokeRect(x1, zeroY, barWidth, barHeight)
  }

  ctx.restore()
}

/**
 * Draw PA2 PEQ slot usage indicator pill.
 */
export function drawPA2SlotIndicator(
  ctx: CanvasRenderingContext2D,
  plotWidth: number,
  slotsUsed: number,
  slotsTotal: number,
  theme: CanvasTheme = DARK_CANVAS_THEME,
) {
  if (slotsTotal <= 0) return

  const isDark = theme === DARK_CANVAS_THEME
  const x = plotWidth - 70
  const y = 30

  ctx.save()
  ctx.fillStyle = isDark ? 'rgba(0, 200, 220, 0.12)' : 'rgba(0, 120, 180, 0.1)'
  ctx.beginPath()
  ctx.roundRect(x, y - 8, 62, 16, 4)
  ctx.fill()

  ctx.fillStyle = isDark ? 'rgba(0, 200, 220, 0.6)' : 'rgba(0, 120, 180, 0.5)'
  ctx.font = '9px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(`PA2: ${slotsUsed}/${slotsTotal} PEQ`, x + 31, y + 4)
  ctx.restore()
}
