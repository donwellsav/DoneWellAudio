/**
 * Canvas Drawing — Spectrum Rendering
 *
 * Main RTA spectrum trace, peak hold, gradient fill, and frequency range overlay.
 */

import { freqToLogPosition, freqToLogPositionFast, clamp } from '@/lib/utils/mathHelpers'
import type { SpectrumData } from '@/types/advisory'

import {
  type CanvasTheme,
  type DbRange,
  DARK_CANVAS_THEME,
  PEAK_HOLD_DECAY_DB_PER_SEC,
  PEAK_HOLD_MAX_DT_SEC,
} from './canvasTypes'

export function drawSpectrum(
  ctx: CanvasRenderingContext2D,
  plotWidth: number,
  plotHeight: number,
  range: DbRange,
  spectrum: SpectrumData | null,
  displayFreqDb: Float32Array | null,
  gradientRef: { current: CanvasGradient | null },
  gradientHeightRef: { current: number },
  spectrumLineWidth: number,
  peakHoldRef: { current: Float32Array | null },
  warmMode: boolean = false,
  theme: CanvasTheme = DARK_CANVAS_THEME,
  dtSeconds: number = 0.04,
) {
  if (!spectrum?.freqDb || !displayFreqDb || !spectrum.sampleRate || !spectrum.fftSize) return

  const freqDb = displayFreqDb
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

  // Pre-compute log-scale constants — hoisted outside loop to eliminate
  // 2 of 3 Math.log10 calls per bin (~8,000 fewer transcendental ops/frame)
  const logMin = Math.log10(range.freqMin)
  const invLogRange = 1 / (Math.log10(range.freqMax) - logMin)

  for (let i = 1; i < n; i++) {
    const freq = i * hzPerBin
    if (freq < range.freqMin || freq > range.freqMax) continue

    const x = freqToLogPositionFast(freq, logMin, invLogRange) * plotWidth

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
