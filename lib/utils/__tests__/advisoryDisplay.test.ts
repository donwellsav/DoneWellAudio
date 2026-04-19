/**
 * Tests for advisoryDisplay.ts — presentation utilities extracted from DSP modules.
 *
 * Verifies that getSeverityColor and getSeverityText produce identical results
 * to the original implementations in classifier.ts and eqAdvisor.ts, ensuring
 * the extraction didn't change behavior.
 */

import { describe, it, expect } from 'vitest'
import { getSeverityColor, getSeverityText } from '../advisoryDisplay'
import type { SeverityLevel } from '@/types/advisory'

// ── getSeverityColor ────────────────────────────────────────────────────────

describe('getSeverityColor', () => {
  const severities: SeverityLevel[] = [
    'RUNAWAY', 'GROWING', 'RESONANCE', 'POSSIBLE_RING', 'WHISTLE', 'INSTRUMENT',
  ]

  it.each(severities)('returns a hex color for %s (dark theme)', (severity) => {
    const color = getSeverityColor(severity, true)
    expect(color).toMatch(/^#[0-9a-fA-F]{6}$/)
  })

  it.each(severities)('returns a hex color for %s (light theme)', (severity) => {
    const color = getSeverityColor(severity, false)
    expect(color).toMatch(/^#[0-9a-fA-F]{6}$/)
  })

  it('defaults to dark theme when isDark omitted', () => {
    expect(getSeverityColor('RUNAWAY')).toBe(getSeverityColor('RUNAWAY', true))
  })

  it('returns noise floor color for unknown severity', () => {
    const color = getSeverityColor('UNKNOWN_THING' as SeverityLevel)
    expect(color).toMatch(/^#[0-9a-fA-F]{6}$/)
  })

  it('light theme colors differ from dark for WCAG contrast', () => {
    // Light theme uses darker shades for legibility on white backgrounds
    for (const s of severities) {
      const dark = getSeverityColor(s, true)
      const light = getSeverityColor(s, false)
      // At least some should differ (RUNAWAY, GROWING definitely do)
      if (s === 'RUNAWAY' || s === 'GROWING') {
        expect(dark).not.toBe(light)
      }
    }
  })

  // Exact value regression tests matching VIZ_COLORS / VIZ_COLORS_LIGHT.
  // Light-theme values darkened in Batch 25 (audit fixes) for WCAG AA on white.
  it.each([
    ['RUNAWAY', true, '#ef4444'],
    ['GROWING', true, '#fb923c'],
    ['RESONANCE', true, '#facc15'],
    ['POSSIBLE_RING', true, '#c084fc'],
    ['WHISTLE', true, '#06b6d4'],
    ['INSTRUMENT', true, '#4ade80'],
    ['RUNAWAY', false, '#dc2626'],
    ['GROWING', false, '#c2410c'],
    ['WHISTLE', false, '#0e7490'],
    ['INSTRUMENT', false, '#15803d'],
  ] as const)('regression: %s isDark=%s → %s', (severity, isDark, expected) => {
    expect(getSeverityColor(severity, isDark)).toBe(expected)
  })
})

// ── getSeverityText ─────────────────────────────────────────────────────────

describe('getSeverityText', () => {
  it.each([
    ['RUNAWAY', 'RUNAWAY'],
    ['GROWING', 'Growing'],
    ['RESONANCE', 'Resonance'],
    ['POSSIBLE_RING', 'Ring'],
    ['WHISTLE', 'Whistle'],
    ['INSTRUMENT', 'Instrument'],
  ] as const)('maps %s → %s', (severity, expected) => {
    expect(getSeverityText(severity)).toBe(expected)
  })

  it('returns "Unknown" for unrecognized severity', () => {
    expect(getSeverityText('IMAGINARY' as SeverityLevel)).toBe('Unknown')
  })
})
