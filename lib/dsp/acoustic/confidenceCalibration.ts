/**
 * Confidence Calibration
 *
 * Combines multiple probability signals (feedback, whistle, instrument)
 * with modal overlap and cumulative growth into a calibrated confidence score.
 */

// ============================================================================
// CONFIDENCE CALIBRATION
// ============================================================================

/**
 * Calculate calibrated confidence score
 * Combines multiple factors into a well-calibrated confidence percentage
 *
 * @param pFeedback - Raw feedback probability
 * @param pWhistle - Raw whistle probability
 * @param pInstrument - Raw instrument probability
 * @param modalOverlapBoost - Boost from modal overlap analysis
 * @param cumulativeGrowthSeverity - Severity from cumulative growth
 * @returns Calibrated confidence (0-1)
 */
export function calculateCalibratedConfidence(
  pFeedback: number,
  pWhistle: number,
  pInstrument: number,
  modalOverlapBoost: number = 0,
  cumulativeGrowthSeverity: 'NONE' | 'BUILDING' | 'GROWING' | 'RUNAWAY' = 'NONE'
): {
  confidence: number
  adjustedPFeedback: number
  confidenceLabel: 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH'
} {
  let adjustedPFeedback = pFeedback

  // Apply modal overlap boost to feedback probability
  adjustedPFeedback = Math.min(1, pFeedback + modalOverlapBoost)

  // Apply cumulative growth boost
  switch (cumulativeGrowthSeverity) {
    case 'RUNAWAY':
      adjustedPFeedback = Math.max(adjustedPFeedback, 0.85)
      break
    case 'GROWING':
      adjustedPFeedback = Math.min(1, adjustedPFeedback + 0.15)
      break
    case 'BUILDING':
      adjustedPFeedback = Math.min(1, adjustedPFeedback + 0.08)
      break
  }

  // Confidence must describe the same posterior state that the caller returns.
  // Using the pre-adjustment max here made sharp isolated feedback more
  // feedback-like without making it any more reportable.
  const confidence = Math.max(adjustedPFeedback, pWhistle, pInstrument)

  // Determine confidence label
  let confidenceLabel: 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH'
  if (confidence >= 0.85) {
    confidenceLabel = 'VERY_HIGH'
  } else if (confidence >= 0.70) {
    confidenceLabel = 'HIGH'
  } else if (confidence >= 0.55) {
    confidenceLabel = 'MEDIUM'
  } else {
    confidenceLabel = 'LOW'
  }

  return {
    confidence,
    adjustedPFeedback,
    confidenceLabel,
  }
}
