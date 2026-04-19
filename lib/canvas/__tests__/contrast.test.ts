/**
 * WCAG 2.1 AA contrast regression for VIZ_COLORS + VIZ_COLORS_LIGHT.
 *
 * Mechanically enforces what /audit caught manually in Batch 25: three
 * light-theme severity colors were below 4.5:1 on a white card background
 * (GROWING 3.55:1, WHISTLE 3.62:1, INSTRUMENT 3.26:1) — all failing WCAG
 * AA for body text. This test pins the contrast ratios against both theme
 * card backgrounds so any future color change must either maintain AA or
 * explicitly update this test with a rationale.
 */
import { describe, it, expect } from 'vitest'
import { VIZ_COLORS, VIZ_COLORS_LIGHT } from '@/lib/dsp/constants'

// ── WCAG 2.1 contrast math ──────────────────────────────────────────────

function hexToLinear(hex: string): [number, number, number] {
  const m = hex.replace('#', '')
  const r = parseInt(m.slice(0, 2), 16) / 255
  const g = parseInt(m.slice(2, 4), 16) / 255
  const b = parseInt(m.slice(4, 6), 16) / 255
  const linearize = (c: number) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  return [linearize(r), linearize(g), linearize(b)]
}

function luminance(hex: string): number {
  const [r, g, b] = hexToLinear(hex)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrast(fg: string, bg: string): number {
  const lf = luminance(fg)
  const lb = luminance(bg)
  return (Math.max(lf, lb) + 0.05) / (Math.min(lf, lb) + 0.05)
}

// Card backgrounds — keep these in sync with app/globals.css --card tokens.
//   :root   --card: #181a1e   (dark, session default)
//   .light  --card: #ffffff
const DARK_CARD = '#181a1e'
const LIGHT_CARD = '#ffffff'

// WCAG 2.1 AA body-text threshold.
const AA_BODY = 4.5

const SEVERITIES = [
  'RUNAWAY',
  'GROWING',
  'RESONANCE',
  'POSSIBLE_RING',
  'WHISTLE',
  'INSTRUMENT',
] as const

describe('VIZ_COLORS — dark theme contrast on #181a1e card', () => {
  it.each(SEVERITIES)('%s passes WCAG AA 4.5:1', (severity) => {
    const color = VIZ_COLORS[severity]
    const ratio = contrast(color, DARK_CARD)
    expect(
      ratio,
      `${severity} (${color}) contrast ${ratio.toFixed(2)}:1 on ${DARK_CARD}`,
    ).toBeGreaterThanOrEqual(AA_BODY)
  })
})

describe('VIZ_COLORS_LIGHT — light theme contrast on #ffffff card', () => {
  it.each(SEVERITIES)('%s passes WCAG AA 4.5:1', (severity) => {
    // VIZ_COLORS_LIGHT is consumed via spread-override in the real code,
    // so a missing key falls through to VIZ_COLORS[severity]. Mirror that
    // resolution here so the test fails if a severity loses its light override.
    const override = (VIZ_COLORS_LIGHT as Record<string, string | undefined>)[severity]
    const color = override ?? VIZ_COLORS[severity]
    const ratio = contrast(color, LIGHT_CARD)
    expect(
      ratio,
      `${severity} (${color}) contrast ${ratio.toFixed(2)}:1 on ${LIGHT_CARD}`,
    ).toBeGreaterThanOrEqual(AA_BODY)
  })
})

describe('contrast() utility — self-check', () => {
  it('white on black is the maximum ~21:1', () => {
    expect(contrast('#ffffff', '#000000')).toBeCloseTo(21, 0)
  })

  it('identical colors return 1:1', () => {
    expect(contrast('#888888', '#888888')).toBeCloseTo(1, 2)
  })
})
