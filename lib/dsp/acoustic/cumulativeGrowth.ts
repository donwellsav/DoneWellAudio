/**
 * Cumulative Growth Tracking
 *
 * Detects slow-building feedback that may not trigger velocity thresholds
 * by analyzing total amplitude growth over time.
 */

import { CUMULATIVE_GROWTH } from '../constants'

// ============================================================================
// CUMULATIVE GROWTH TRACKING
// ============================================================================

/**
 * Calculate cumulative growth from track history
 * Detects slow-building feedback that may not trigger velocity thresholds
 *
 * @param onsetDb - Amplitude at track onset
 * @param currentDb - Current amplitude
 * @param durationMs - Time since onset
 * @returns Growth analysis
 */
export function analyzeCumulativeGrowth(
  onsetDb: number,
  currentDb: number,
  durationMs: number
): {
  totalGrowthDb: number
  averageGrowthRateDbPerSec: number
  severity: 'NONE' | 'BUILDING' | 'GROWING' | 'RUNAWAY'
  shouldAlert: boolean
} {
  const totalGrowthDb = currentDb - onsetDb

  // Calculate average growth rate
  const durationSec = Math.max(durationMs / 1000, 0.1) // Avoid division by zero
  const averageGrowthRateDbPerSec = totalGrowthDb / durationSec

  // Only consider cumulative growth if duration is within valid range
  if (durationMs < CUMULATIVE_GROWTH.MIN_DURATION_MS ||
      durationMs > CUMULATIVE_GROWTH.MAX_DURATION_MS) {
    return {
      totalGrowthDb,
      averageGrowthRateDbPerSec,
      severity: 'NONE',
      shouldAlert: false,
    }
  }

  // Determine severity based on cumulative growth
  let severity: 'NONE' | 'BUILDING' | 'GROWING' | 'RUNAWAY' = 'NONE'
  let shouldAlert = false

  if (totalGrowthDb >= CUMULATIVE_GROWTH.RUNAWAY_THRESHOLD_DB) {
    severity = 'RUNAWAY'
    shouldAlert = true
  } else if (totalGrowthDb >= CUMULATIVE_GROWTH.ALERT_THRESHOLD_DB) {
    severity = 'GROWING'
    shouldAlert = true
  } else if (totalGrowthDb >= CUMULATIVE_GROWTH.WARNING_THRESHOLD_DB) {
    severity = 'BUILDING'
    shouldAlert = true
  }

  return {
    totalGrowthDb,
    averageGrowthRateDbPerSec,
    severity,
    shouldAlert,
  }
}
