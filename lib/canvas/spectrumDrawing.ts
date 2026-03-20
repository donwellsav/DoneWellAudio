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

/** Peak hold decay rate: ~0.5 dB per frame at 60fps (~30 dB/sec) */
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

/** Frequency zone definitions for the educational overlay */
const FREQ_ZONES: { label: string; minHz: number; maxHz: number; color: string }[] = [
  { label: 'SUB',      minHz: 20,   maxHz: 120,   color: 'rgba(139, 92, 246, 0.06)' },  // violet tint
  { label: 'LOW MID',  minHz: 120,  maxHz: 500,   color: 'rgba(96, 165, 250, 0.05)' },  // blue tint
  { label: 'MID',      minHz: 500,  maxHz: 2000,  color: 'rgba(75, 146, 255, 0.05)' },  // primary blue tint
  { label: 'PRESENCE', minHz: 2000, maxHz: 6000,  color: 'rgba(250, 204, 21, 0.04)' },  // yellow tint
  { label: 'AIR',      minHz: 6000, maxHz: 20000, color: 'rgba(96, 165, 250, 0.04)' },  // light blue tint
]

/**
 * Draw labeled frequency zone bands behind the spectrum.
 * Very faint tinted rectangles with small labels at top to help engineers orient.
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

  for (const zone of FREQ_ZONES) {
    const x1 = freqToLogPosition(Math.max(zone.minHz, range.freqMin), range.freqMin, range.freqMax) * plotWidth
    const x2 = freqToLogPosition(Math.min(zone.maxHz, range.freqMax), range.freqMin, range.freqMax) * plotWidth
    if (x2 <= x1) continue // zone outside visible range

    // Tinted background
    ctx.fillStyle = zone.color
    ctx.fillRect(x1, 0, x2 - x1, plotHeight)

    // Thin separator at zone start
    ctx.strokeStyle = theme.zoneLabel
    ctx.globalAlpha = 0.15
    ctx.lineWidth = 0.5
    ctx.beginPath()
    ctx.moveTo(x1, 0)
    ctx.lineTo(x1, plotHeight)
    ctx.stroke()
    ctx.globalAlpha = 1

    // Label at top center of zone
    const centerX = (x1 + x2) / 2
    const labelWidth = x2 - x1
    if (labelWidth > 30) { // only draw label if zone is wide enough
      ctx.font = '9px var(--font-sans, sans-serif)'
      ctx.fillStyle = theme.zoneLabel
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillText(zone.label, centerX, 4)
    }
  }
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

    // Noise floor line
    ctx.strokeStyle = VIZ_COLORS.NOISE_FLOOR
    ctx.globalAlpha = 0.6
    ctx.lineWidth = 1
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(0, floorY)
    ctx.lineTo(plotWidth, floorY)
    ctx.stroke()
    ctx.setLineDash([])

    // Right-aligned label
    ctx.font = `${Math.max(8, fontSize - 2)}px monospace`
    ctx.fillStyle = VIZ_COLORS.NOISE_FLOOR
    ctx.globalAlpha = 0.85
    ctx.textAlign = 'right'
    ctx.fillText('Floor', plotWidth - 4, floorY - 4)
    ctx.globalAlpha = 1
    ctx.textAlign = 'left'
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
) {
  if (!spectrum?.freqDb || !spectrum.sampleRate || !spectrum.fftSize) return

  const freqDb = spectrum.freqDb
  const hzPerBin = spectrum.sampleRate / spectrum.fftSize
  const n = freqDb.length

  // ── Update peak hold buffer ──────────────────────────────────
  let peakHold = peakHoldRef.current
  if (!peakHold || peakHold.length !== n) {
    peakHold = new Float32Array(n)
    peakHold.set(freqDb) // Initialize to current spectrum
    peakHoldRef.current = peakHold
  } else {
    for (let i = 0; i < n; i++) {
      peakHold[i] = Math.max(freqDb[i], peakHold[i] - PEAK_HOLD_DECAY_DB)
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
) {
  const visible = advisories
    .filter(a => !clearedIds?.has(a.id))
    .slice(-7) // Same cap as drawMarkers

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
    if (x2 - x1 < 1) continue // Too narrow to draw

    const color = getSeverityColor(advisory.severity)

    // Semi-transparent band fill
    ctx.globalAlpha = 0.08
    ctx.fillStyle = color
    ctx.fillRect(x1, 0, x2 - x1, plotHeight)

    // Thin boundary lines at edges
    ctx.globalAlpha = 0.25
    ctx.strokeStyle = color
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(x1, 0)
    ctx.lineTo(x1, plotHeight)
    ctx.moveTo(x2, 0)
    ctx.lineTo(x2, plotHeight)
    ctx.stroke()
  }

  ctx.globalAlpha = 1
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
) {
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
  const labelPadding = 8
  const labelShowFlags: boolean[] = new Array(visibleAdvisories.length).fill(false)

  // Build priority-sorted indices (most problematic first)
  const indices = visibleAdvisories.map((_, i) => i)
  indices.sort((a, b) => {
    const urgA = getSeverityUrgency(visibleAdvisories[a].severity)
    const urgB = getSeverityUrgency(visibleAdvisories[b].severity)
    if (urgB !== urgA) return urgB - urgA
    return visibleAdvisories[b].confidence - visibleAdvisories[a].confidence
  })

  // Compute label x-ranges (center ± half-width + padding)
  const labelXRanges: Array<{ left: number; right: number }> = visibleAdvisories.map(advisory => {
    const freq = advisory.trueFrequencyHz
    const x = freqToLogPosition(freq, range.freqMin, range.freqMax) * plotWidth
    const halfWidth = ctx.measureText(formatFrequency(freq)).width / 2 + labelPadding
    return { left: x - halfWidth, right: x + halfWidth }
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

  for (let i = 0; i < visibleAdvisories.length; i++) {
    const advisory = visibleAdvisories[i]
    const freq = advisory.trueFrequencyHz
    const db = advisory.trueAmplitudeDb
    const x = freqToLogPosition(freq, range.freqMin, range.freqMax) * plotWidth
    const y = ((range.dbMax - clamp(db, range.dbMin, range.dbMax)) / (range.dbMax - range.dbMin)) * plotHeight
    const color = getSeverityColor(advisory.severity)

    // Vertical line
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.globalAlpha = 0.7
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x, plotHeight)
    ctx.stroke()
    ctx.globalAlpha = 1

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
      ctx.fillStyle = color
      ctx.font = labelFont
      ctx.textAlign = 'center'
      ctx.fillText(formatFrequency(freq), x, y - 10)
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
