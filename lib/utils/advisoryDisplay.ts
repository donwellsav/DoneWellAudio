/**
 * Advisory Display Utilities — Pure presentation functions for advisory rendering.
 *
 * Extracted from DSP modules (classifier.ts, eqAdvisor.ts) to decouple
 * UI components from algorithm implementations. These are pure mappers
 * with zero DSP logic — safe to import from any layer.
 */

import type { SeverityLevel } from '@/types/advisory'
import { VIZ_COLORS, VIZ_COLORS_LIGHT } from '@/lib/dsp/constants'

/**
 * Get display color for severity level.
 * @param severity - Advisory severity level
 * @param isDark - true for dark theme (default), false for light theme with WCAG AA contrast
 */
export function getSeverityColor(severity: SeverityLevel, isDark: boolean = true): string {
  const colors = isDark ? VIZ_COLORS : { ...VIZ_COLORS, ...VIZ_COLORS_LIGHT }
  switch (severity) {
    case 'RUNAWAY': return colors.RUNAWAY
    case 'GROWING': return colors.GROWING
    case 'RESONANCE': return colors.RESONANCE
    case 'POSSIBLE_RING': return colors.POSSIBLE_RING
    case 'WHISTLE': return colors.WHISTLE
    case 'INSTRUMENT': return colors.INSTRUMENT
    default: return VIZ_COLORS.NOISE_FLOOR
  }
}

/**
 * Get display text for severity level.
 */
export function getSeverityText(severity: SeverityLevel): string {
  switch (severity) {
    case 'RUNAWAY': return 'RUNAWAY'
    case 'GROWING': return 'Growing'
    case 'RESONANCE': return 'Resonance'
    case 'POSSIBLE_RING': return 'Ring'
    case 'WHISTLE': return 'Whistle'
    case 'INSTRUMENT': return 'Instrument'
    default: return 'Unknown'
  }
}
