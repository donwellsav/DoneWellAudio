/**
 * Canvas Drawing — PA2 Companion Overlays
 *
 * PA2 RTA trace, GEQ bar overlay, and PEQ slot indicator pill.
 */

import { freqToLogPosition, clamp } from '@/lib/utils/mathHelpers'

import {
  type CanvasTheme,
  type DbRange,
  DARK_CANVAS_THEME,
} from './canvasTypes'

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
