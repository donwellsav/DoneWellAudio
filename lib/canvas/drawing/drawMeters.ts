/**
 * Canvas Drawing — Level Meters
 *
 * Vertical input level meter bar and ambient level glow.
 */

import { clamp } from '@/lib/utils/mathHelpers'
import type { SpectrumData } from '@/types/advisory'

import type { CanvasTheme, DbRange } from './canvasTypes'

// ── Level Meter ────────────────────────────────────────────────────────────────

/** Peak-hold state for the level meter (decays slowly like a VU meter) */
let _meterPeakDb = -100
const METER_PEAK_DECAY_DB_PER_SEC = 15

/**
 * Draw a vertical input level meter bar on the left edge of the plot area.
 * Uses the same dB scale as the RTA. Called inside translated context.
 *
 * Color: green (below -12dB) → amber (-12 to -3dB) → red (above -3dB).
 * Gradient stop colors read from `theme.meter*` so light-theme rendering
 * picks up darker, more-saturated variants that contrast with a light canvas.
 */
export function drawLevelMeter(
  ctx: CanvasRenderingContext2D,
  plotHeight: number,
  range: DbRange,
  spectrum: SpectrumData | null,
  theme: CanvasTheme,
  dtSeconds: number = 0.04,
) {
  const peakDb = spectrum?.peak ?? -100
  if (peakDb <= range.dbMin) return

  const dbSpan = range.dbMax - range.dbMin
  const meterWidth = 6
  const meterX = -meterWidth - 2 // Left of plot area (negative x in translated context)

  // Clamp level to visible range
  const clampedDb = Math.max(range.dbMin, Math.min(range.dbMax, peakDb))
  const fillY = ((range.dbMax - clampedDb) / dbSpan) * plotHeight

  // Draw filled bar from bottom to level
  // Four-segment gradient: blue → green → amber → red (bottom to top)
  // Gradient stop 0 = bottom (dbMin), stop 1 = top (dbMax)
  const grad = ctx.createLinearGradient(0, plotHeight, 0, 0)
  grad.addColorStop(0, theme.meterBlue)                     // blue at bottom (below -75dB)
  const greenStop = clamp((-75 - range.dbMin) / dbSpan, 0.01, 0.99)
  grad.addColorStop(greenStop, theme.meterGreen)            // green at -75dB
  const amberStop = clamp((-30 - range.dbMin) / dbSpan, 0.01, 0.99)
  grad.addColorStop(amberStop, theme.meterAmber)            // amber at -30dB
  const redStop = clamp((-3 - range.dbMin) / dbSpan, 0.01, 0.99)
  grad.addColorStop(redStop, theme.meterRed)                // red at -3dB
  grad.addColorStop(1, theme.meterRed)                      // red at top

  ctx.fillStyle = grad
  ctx.fillRect(meterX, fillY, meterWidth, plotHeight - fillY)

  // Meter background (unfilled portion)
  ctx.fillStyle = theme.meterBg
  ctx.fillRect(meterX, 0, meterWidth, fillY)

  // Peak hold line (decays slowly)
  const clampedDt = Math.min(dtSeconds, 0.1)
  _meterPeakDb = Math.max(clampedDb, _meterPeakDb - METER_PEAK_DECAY_DB_PER_SEC * clampedDt)
  const peakY = ((range.dbMax - _meterPeakDb) / dbSpan) * plotHeight

  ctx.strokeStyle = theme.meterPeakHold
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(meterX, peakY)
  ctx.lineTo(meterX + meterWidth, peakY)
  ctx.stroke()
}

/**
 * Draw an ambient background glow behind the spectrum that shifts color with input level.
 * Called inside translated context, before drawSpectrum.
 *
 * Low level: transparent. Rising: blue tint. Hot: amber → red wash.
 */
export function drawLevelGlow(
  ctx: CanvasRenderingContext2D,
  plotWidth: number,
  plotHeight: number,
  spectrum: SpectrumData | null,
  isDark: boolean = true,
) {
  const peakDb = spectrum?.peak ?? -100
  if (peakDb < -40) return // No glow below -40dB

  // Map level to opacity (0 at -40dB, max at 0dB)
  const t = clamp((peakDb + 40) / 40, 0, 1) // 0..1

  // Color shift: blue → amber → red
  let r: number, g: number, b: number, alpha: number
  if (peakDb < -12) {
    // Blue zone: -40 to -12dB
    const s = clamp((peakDb + 40) / 28, 0, 1)
    r = 75; g = 146; b = 255
    alpha = s * (isDark ? 0.12 : 0.08)
  } else if (peakDb < -3) {
    // Amber zone: -12 to -3dB
    const s = clamp((peakDb + 12) / 9, 0, 1)
    r = Math.round(75 + (245 - 75) * s)
    g = Math.round(146 + (158 - 146) * s)
    b = Math.round(255 + (11 - 255) * s)
    alpha = isDark ? 0.15 : 0.10
  } else {
    // Red zone: above -3dB
    const s = clamp((peakDb + 3) / 3, 0, 1)
    r = Math.round(245 + (239 - 245) * s)
    g = Math.round(158 - 158 * s * 0.6)
    b = Math.round(11 + (68 - 11) * s)
    alpha = (isDark ? 0.18 : 0.12) + s * 0.07
  }

  // Radial gradient from center — creates a soft wash
  const cx = plotWidth / 2
  const cy = plotHeight / 2
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(plotWidth, plotHeight) * 0.7)
  grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${alpha * t})`)
  grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`)

  ctx.fillStyle = grad
  ctx.fillRect(0, 0, plotWidth, plotHeight)
}
