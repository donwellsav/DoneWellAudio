'use client'

import { memo, useMemo } from 'react'

interface KtrLogoProps {
  className?: string
  /** Normalized audio level 0-1. When provided, equalizer bars animate responsively. */
  audioLevel?: number
}

/** Default bar definitions: x position, base height (from baseline at y=117.2), base opacity */
const BARS: { x: number; baseH: number; baseOp: number }[] = [
  { x: 28.0, baseH: 6.7, baseOp: 0.60 },
  { x: 34.1, baseH: 10.0, baseOp: 0.63 },
  { x: 40.2, baseH: 12.5, baseOp: 0.65 },
  { x: 46.3, baseH: 16.6, baseOp: 0.68 },
  { x: 52.3, baseH: 15.0, baseOp: 0.66 },
  { x: 58.4, baseH: 20.8, baseOp: 0.72 },
  { x: 64.5, baseH: 24.9, baseOp: 0.76 },
  { x: 70.6, baseH: 31.6, baseOp: 0.80 },
  { x: 76.7, baseH: 41.6, baseOp: 0.86 },
  { x: 82.7, baseH: 54.1, baseOp: 0.93 },
  { x: 88.8, baseH: 83.2, baseOp: 1.00 },
  { x: 94.9, baseH: 51.6, baseOp: 0.92 },
  { x: 101.0, baseH: 39.9, baseOp: 0.84 },
  { x: 107.1, baseH: 29.1, baseOp: 0.78 },
  { x: 113.1, baseH: 23.3, baseOp: 0.74 },
  { x: 119.2, baseH: 18.3, baseOp: 0.70 },
  { x: 125.3, baseH: 15.0, baseOp: 0.66 },
  { x: 131.4, baseH: 11.6, baseOp: 0.64 },
  { x: 137.5, baseH: 9.1, baseOp: 0.62 },
  { x: 143.5, baseH: 7.5, baseOp: 0.61 },
  { x: 149.6, baseH: 5.0, baseOp: 0.60 },
]

/** Per-bar pseudo-random phase offsets (deterministic, avoids synchronized bounce) */
const PHASE_OFFSETS = [0.0, 0.3, 0.7, 0.1, 0.5, 0.9, 0.2, 0.6, 0.8, 0.4, 0.15, 0.55, 0.35, 0.85, 0.45, 0.75, 0.25, 0.65, 0.05, 0.95, 0.5]

const BASELINE_Y = 117.2

/**
 * KTR brand logo — frequency analyzer crosshair + equalizer bars.
 * When audioLevel is provided, bars scale dynamically to simulate a live spectrum.
 * Bars use hardcoded primary blue (#4B92FF) for vibrant color.
 * Crosshair uses currentColor so it adapts to parent text color.
 */
export const KtrLogo = memo(function KtrLogo({ className, audioLevel }: KtrLogoProps) {
  const bars = useMemo(() => {
    if (audioLevel == null) {
      // Static: render at full base heights
      return BARS.map(b => ({ x: b.x, h: b.baseH, op: b.baseOp }))
    }

    // Dynamic: mix base shape with audio level + per-bar variation
    // At level=0: bars at ~15% of base height (idle hum)
    // At level=1: bars at 100% of base height
    const minScale = 0.15
    return BARS.map((b, i) => {
      const phase = PHASE_OFFSETS[i]
      // Per-bar variation: ±20% randomized per bar so they don't all move identically
      const variation = 0.8 + 0.4 * phase
      const scale = minScale + (1 - minScale) * audioLevel * variation
      const h = Math.max(2, b.baseH * scale) // minimum 2px so bars don't disappear
      const op = 0.4 + 0.6 * scale // opacity tracks height
      return { x: b.x, h, op }
    })
  }, [audioLevel])

  return (
    <svg viewBox="18 16 144 106" className={className} fill="none" aria-hidden="true">
      <defs>
        <radialGradient id="ktr-glow" cx="90" cy="54" r="50" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--primary)" stopOpacity="0.20" />
          <stop offset="1" stopColor="var(--primary)" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* ── Radial glow behind crosshair ──────────────── */}
      <rect x="18" y="16" width="144" height="106" fill="url(#ktr-glow)" />

      {/* ── Crosshair target (uses currentColor) ─────── */}
      <circle cx="90" cy="46.5" r="19.7" stroke="currentColor" strokeOpacity="0.75" strokeWidth="1.5" />
      <line x1="90" y1="20.8" x2="90" y2="39.7" stroke="currentColor" strokeOpacity="0.75" strokeWidth="1.5" />
      <line x1="90" y1="53.4" x2="90" y2="72.2" stroke="currentColor" strokeOpacity="0.75" strokeWidth="1.5" />
      <line x1="64.3" y1="46.5" x2="83.1" y2="46.5" stroke="currentColor" strokeOpacity="0.75" strokeWidth="1.5" />
      <line x1="96.9" y1="46.5" x2="115.7" y2="46.5" stroke="currentColor" strokeOpacity="0.75" strokeWidth="1.5" />
      <circle cx="90" cy="46.5" r="2" fill="currentColor" />

      {/* ── Equalizer bars (responsive to audio level) ── */}
      {bars.map((b, i) => (
        <rect
          key={i}
          x={b.x}
          y={BASELINE_Y - b.h}
          width={2.4}
          height={b.h}
          rx={1.1}
          fill="var(--primary)"
          fillOpacity={b.op}
        />
      ))}

      {/* ── Baseline ─────────────────────────────────── */}
      <line x1="22" y1="117.2" x2="158" y2="117.2" stroke="var(--primary)" strokeOpacity="0.40" strokeWidth="1" />
    </svg>
  )
})
