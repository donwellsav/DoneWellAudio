/**
 * Acoustic Utilities for Kill The Ring
 * Based on "Sound Insulation" by Carl Hopkins (2007)
 * 
 * These utilities implement key acoustic formulas for improved feedback detection:
 * - Schroeder frequency calculation (room mode analysis)
 * - Modal overlap factor (isolated vs diffuse modes)
 * - Frequency band classification
 * - Cumulative growth tracking
 * - Formant/vibrato detection for voice discrimination
 */

import {
  SCHROEDER_CONSTANTS,
  FREQUENCY_BANDS,
  MODAL_OVERLAP,
  CUMULATIVE_GROWTH,
  VOCAL_FORMANTS,
  VIBRATO_DETECTION,
} from './constants'

// ============================================================================
// SCHROEDER FREQUENCY
// ============================================================================

/**
 * Calculate Schroeder frequency for a room
 * From textbook Equation 1.111: f_S = 2000 * sqrt(T/V)
 * 
 * Below this frequency, individual room modes dominate and statistical
 * analysis breaks down. Feedback detection needs different handling.
 * 
 * @param rt60 - Reverberation time in seconds (typical: 0.5-2.0)
 * @param volume - Room volume in cubic meters (typical: 100-2000)
 * @returns Schroeder cut-off frequency in Hz
 */
export function calculateSchroederFrequency(rt60: number, volume: number): number {
  // Validate inputs
  if (rt60 <= 0 || volume <= 0) {
    return SCHROEDER_CONSTANTS.DEFAULT_FREQUENCY
  }
  
  // f_S = 2000 * sqrt(T/V)
  const fs = SCHROEDER_CONSTANTS.COEFFICIENT * Math.sqrt(rt60 / volume)
  
  // Clamp to reasonable range (50Hz - 500Hz)
  return Math.max(50, Math.min(500, fs))
}

/**
 * Get frequency band for a given frequency
 * Uses Schroeder frequency to set the LOW/MID boundary
 * 
 * @param frequencyHz - Frequency to classify
 * @param schroederHz - Schroeder frequency (LOW/MID boundary)
 * @returns Band classification and multipliers
 */
export function getFrequencyBand(
  frequencyHz: number,
  schroederHz: number = SCHROEDER_CONSTANTS.DEFAULT_FREQUENCY
): {
  band: 'LOW' | 'MID' | 'HIGH'
  prominenceMultiplier: number
  sustainMultiplier: number
  qThresholdMultiplier: number
  description: string
} {
  // Use Schroeder frequency as LOW/MID boundary
  const lowMidBoundary = Math.max(schroederHz, FREQUENCY_BANDS.LOW.maxHz)
  
  if (frequencyHz < lowMidBoundary) {
    return {
      band: 'LOW',
      ...FREQUENCY_BANDS.LOW,
    }
  } else if (frequencyHz < FREQUENCY_BANDS.MID.maxHz) {
    return {
      band: 'MID',
      ...FREQUENCY_BANDS.MID,
    }
  } else {
    return {
      band: 'HIGH',
      ...FREQUENCY_BANDS.HIGH,
    }
  }
}

// ============================================================================
// MODAL OVERLAP FACTOR
// ============================================================================

/**
 * Calculate modal overlap factor from Q value
 * 
 * From textbook Section 1.2.6.7, Equation 1.109: M = f * η * n
 * Where: η = loss factor, n = modal density
 * 
 * For a single resonance with measured Q:
 * - The loss factor η relates to Q via: η ≈ 1/Q (for lightly damped systems)
 * - Reference: textbook discusses η = Δf_3dB / (π * f) and Q = f / Δf_3dB
 * 
 * For feedback detection, we use a normalized modal overlap indicator:
 * M_indicator = 1/Q (dimensionless ratio indicating resonance sharpness)
 * 
 * Interpretation (based on textbook Fig 1.23):
 * - M << 1 (< 0.03, i.e. Q > 33): Sharp isolated peak with deep troughs
 *   → More likely to be feedback (sustained single frequency)
 * - M ≈ 0.1 (Q ≈ 10): Moderate resonance
 *   → Could be feedback or room resonance
 * - M >> 0.1 (Q < 10): Broad peak, overlapping response
 *   → Less likely to be feedback (more noise-like)
 * 
 * @param qFactor - Q factor of the resonance (Q = f / Δf_3dB)
 * @returns Modal overlap indicator (1/Q)
 */
export function calculateModalOverlap(qFactor: number): number {
  if (qFactor <= 0) return Infinity
  // M_indicator = 1/Q = Δf_3dB / f
  return 1 / qFactor
}

/**
 * Classify modal overlap indicator as isolated, coupled, or diffuse
 * 
 * With M = 1/Q:
 * - Low M (high Q) = sharp isolated peak = likely feedback
 * - High M (low Q) = broad peak = less likely feedback
 */
export function classifyModalOverlap(modalOverlap: number): {
  classification: 'ISOLATED' | 'COUPLED' | 'DIFFUSE'
  feedbackProbabilityBoost: number
  description: string
} {
  // Note: With M = 1/Q, ISOLATED has the LOWEST M value (highest Q)
  if (modalOverlap < MODAL_OVERLAP.ISOLATED) {
    return {
      classification: 'ISOLATED',
      feedbackProbabilityBoost: 0.15, // Boost feedback probability for sharp peaks
      description: 'Sharp isolated peak (Q > 33) - high feedback risk',
    }
  } else if (modalOverlap < MODAL_OVERLAP.COUPLED) {
    return {
      classification: 'COUPLED',
      feedbackProbabilityBoost: 0.05, // Slight boost
      description: 'Moderate resonance (Q 10-33) - possible feedback',
    }
  } else if (modalOverlap < MODAL_OVERLAP.DIFFUSE) {
    return {
      classification: 'COUPLED',
      feedbackProbabilityBoost: 0, // Neutral
      description: 'Broader resonance (Q 3-10) - lower feedback risk',
    }
  } else {
    return {
      classification: 'DIFFUSE',
      feedbackProbabilityBoost: -0.10, // Reduce feedback probability
      description: 'Broad peak (Q < 3) - unlikely feedback',
    }
  }
}

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

// ============================================================================
// VOCAL/WHISTLE DISCRIMINATION
// ============================================================================

/**
 * Check if a set of peaks matches vocal formant pattern
 * Voice has characteristic formant structure that feedback lacks
 * 
 * @param peakFrequencies - Array of detected peak frequencies
 * @returns Formant analysis result
 */
export function analyzeFormantStructure(peakFrequencies: number[]): {
  hasFormantStructure: boolean
  formantCount: number
  voiceProbability: number
  detectedFormants: { formant: string; frequency: number }[]
} {
  const detectedFormants: { formant: string; frequency: number }[] = []
  
  // Check for F1 (first formant)
  const f1Match = peakFrequencies.find(f => 
    f >= VOCAL_FORMANTS.F1_CENTER - VOCAL_FORMANTS.F1_RANGE &&
    f <= VOCAL_FORMANTS.F1_CENTER + VOCAL_FORMANTS.F1_RANGE
  )
  if (f1Match) {
    detectedFormants.push({ formant: 'F1', frequency: f1Match })
  }
  
  // Check for F2 (second formant)
  const f2Match = peakFrequencies.find(f => 
    f >= VOCAL_FORMANTS.F2_CENTER - VOCAL_FORMANTS.F2_RANGE &&
    f <= VOCAL_FORMANTS.F2_CENTER + VOCAL_FORMANTS.F2_RANGE
  )
  if (f2Match) {
    detectedFormants.push({ formant: 'F2', frequency: f2Match })
  }
  
  // Check for F3 (third formant)
  const f3Match = peakFrequencies.find(f => 
    f >= VOCAL_FORMANTS.F3_CENTER - VOCAL_FORMANTS.F3_RANGE &&
    f <= VOCAL_FORMANTS.F3_CENTER + VOCAL_FORMANTS.F3_RANGE
  )
  if (f3Match) {
    detectedFormants.push({ formant: 'F3', frequency: f3Match })
  }
  
  const formantCount = detectedFormants.length
  const hasFormantStructure = formantCount >= VOCAL_FORMANTS.MIN_FORMANTS_FOR_VOICE
  
  // Calculate voice probability based on formant matches
  // More formants = higher probability of voice
  const voiceProbability = Math.min(formantCount / 3, 1) * 0.5 // Max 50% boost from formants
  
  return {
    hasFormantStructure,
    formantCount,
    voiceProbability,
    detectedFormants,
  }
}

/**
 * Analyze frequency stability for vibrato detection
 * Whistle has characteristic 4-8 Hz vibrato; feedback is rock-steady
 * 
 * @param frequencyHistory - Array of {time, frequency} measurements
 * @returns Vibrato analysis
 */
export function analyzeVibrato(
  frequencyHistory: Array<{ time: number; frequency: number }>
): {
  hasVibrato: boolean
  vibratoRateHz: number | null
  vibratoDepthCents: number | null
  whistleProbability: number
} {
  if (frequencyHistory.length < 10) {
    return {
      hasVibrato: false,
      vibratoRateHz: null,
      vibratoDepthCents: null,
      whistleProbability: 0,
    }
  }
  
  // Calculate frequency deviation over recent history
  const recentHistory = frequencyHistory.slice(-20) // Last 20 samples
  const frequencies = recentHistory.map(h => h.frequency)
  const meanFreq = frequencies.reduce((a, b) => a + b, 0) / frequencies.length
  
  // Calculate standard deviation
  const variance = frequencies.reduce((sum, f) => sum + Math.pow(f - meanFreq, 2), 0) / frequencies.length
  const stdDev = Math.sqrt(variance)
  
  // Convert to cents: cents = 1200 * log2(f1/f2)
  // Guard against division by zero or invalid log input
  const denominator = Math.max(meanFreq - stdDev, 1)
  const depthCents = stdDev > 0 ? 1200 * Math.log2((meanFreq + stdDev) / denominator) : 0
  
  // Estimate vibrato rate from zero crossings of deviation
  const deviations = frequencies.map(f => f - meanFreq)
  let zeroCrossings = 0
  for (let i = 1; i < deviations.length; i++) {
    if (deviations[i] * deviations[i - 1] < 0) {
      zeroCrossings++
    }
  }
  
  // Time span of history
  const timeSpanMs = recentHistory[recentHistory.length - 1].time - recentHistory[0].time
  const timeSpanSec = timeSpanMs / 1000
  
  // Vibrato rate ≈ zero crossings / (2 * time span)
  const vibratoRateHz = timeSpanSec > 0 ? zeroCrossings / (2 * timeSpanSec) : 0
  
  // Check if this matches whistle vibrato characteristics
  const isVibratoRate = vibratoRateHz >= VIBRATO_DETECTION.MIN_RATE_HZ && 
                        vibratoRateHz <= VIBRATO_DETECTION.MAX_RATE_HZ
  const isVibratoDepth = depthCents >= VIBRATO_DETECTION.MIN_DEPTH_CENTS && 
                         depthCents <= VIBRATO_DETECTION.MAX_DEPTH_CENTS
  
  const hasVibrato = isVibratoRate && isVibratoDepth
  
  // Calculate whistle probability
  let whistleProbability = 0
  if (hasVibrato) {
    // Strong vibrato in the right range = likely whistle
    whistleProbability = 0.3
    // Wider vibrato = more likely whistle
    if (depthCents > 50) whistleProbability += 0.1
    if (depthCents > 80) whistleProbability += 0.1
  }
  
  return {
    hasVibrato,
    vibratoRateHz: hasVibrato ? vibratoRateHz : null,
    vibratoDepthCents: hasVibrato ? depthCents : null,
    whistleProbability,
  }
}

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
  // Start with the highest probability
  let confidence = Math.max(pFeedback, pWhistle, pInstrument)
  let adjustedPFeedback = pFeedback
  
  // Apply modal overlap boost to feedback probability
  adjustedPFeedback = Math.min(1, pFeedback + modalOverlapBoost)
  
  // Apply cumulative growth boost
  switch (cumulativeGrowthSeverity) {
    case 'RUNAWAY':
      adjustedPFeedback = Math.max(adjustedPFeedback, 0.85)
      confidence = Math.max(confidence, 0.85)
      break
    case 'GROWING':
      adjustedPFeedback = Math.min(1, adjustedPFeedback + 0.15)
      confidence = Math.max(confidence, adjustedPFeedback)
      break
    case 'BUILDING':
      adjustedPFeedback = Math.min(1, adjustedPFeedback + 0.08)
      confidence = Math.max(confidence, adjustedPFeedback)
      break
  }
  
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

/**
 * Apply frequency-dependent threshold multipliers
 * Adjusts detection thresholds based on frequency band
 * 
 * @param baseThreshold - Base threshold value
 * @param frequencyHz - Frequency being analyzed
 * @param schroederHz - Schroeder frequency
 * @param thresholdType - Which type of threshold to adjust
 * @returns Adjusted threshold
 */
export function applyFrequencyDependentThreshold(
  baseThreshold: number,
  frequencyHz: number,
  schroederHz: number,
  thresholdType: 'prominence' | 'sustain' | 'q'
): number {
  const band = getFrequencyBand(frequencyHz, schroederHz)

  switch (thresholdType) {
    case 'prominence':
      return baseThreshold * band.prominenceMultiplier
    case 'sustain':
      return baseThreshold * band.sustainMultiplier
    case 'q':
      return baseThreshold * band.qThresholdMultiplier
    default:
      return baseThreshold
  }
}

// ============================================================================
// ROOM MODE CALCULATION
// From Carl Hopkins "Sound Insulation" Section 1.2
// ============================================================================

/** Speed of sound at ~20°C */
const SPEED_OF_SOUND = 343

interface RoomMode {
  /** Frequency in Hz */
  frequency: number
  /** Mode indices (nx, ny, nz) */
  nx: number
  ny: number
  nz: number
  /** Mode type: axial (1D), tangential (2D), or oblique (3D) */
  type: 'axial' | 'tangential' | 'oblique'
  /** Display label like "1,0,0" */
  label: string
}

/**
 * Calculate room modes below 300 Hz using the rectangular room equation:
 *   f = (c/2) * sqrt( (nx/Lx)² + (ny/Ly)² + (nz/Lz)² )
 *
 * @param lengthM - Room length in meters
 * @param widthM  - Room width in meters
 * @param heightM - Room height in meters
 * @param maxHz   - Maximum frequency to compute (default 300 Hz)
 */
export function calculateRoomModes(
  lengthM: number,
  widthM: number,
  heightM: number,
  maxHz: number = 300
): RoomMode[] {
  const modes: RoomMode[] = []
  const cHalf = SPEED_OF_SOUND / 2
  // Maximum mode order to search per axis
  const maxN = 10

  for (let nx = 0; nx <= maxN; nx++) {
    for (let ny = 0; ny <= maxN; ny++) {
      for (let nz = 0; nz <= maxN; nz++) {
        if (nx === 0 && ny === 0 && nz === 0) continue

        const f = cHalf * Math.sqrt(
          (nx / lengthM) ** 2 + (ny / widthM) ** 2 + (nz / heightM) ** 2
        )
        if (f > maxHz) continue

        const nonZero = (nx > 0 ? 1 : 0) + (ny > 0 ? 1 : 0) + (nz > 0 ? 1 : 0)
        let type: RoomMode['type']
        if (nonZero === 1) type = 'axial'
        else if (nonZero === 2) type = 'tangential'
        else type = 'oblique'

        modes.push({
          frequency: Math.round(f * 10) / 10,
          nx, ny, nz,
          type,
          label: `${nx},${ny},${nz}`,
        })
      }
    }
  }

  return modes.sort((a, b) => a.frequency - b.frequency)
}

interface FormattedMode {
  hz: string
  label: string
}

interface FormattedModes {
  all: FormattedMode[]
  axial: FormattedMode[]
  tangential: FormattedMode[]
  oblique: FormattedMode[]
}

/**
 * Format room modes for UI display, grouped by type
 */
export function formatRoomModesForDisplay(modes: RoomMode[]): FormattedModes {
  const fmt = (m: RoomMode): FormattedMode => ({
    hz: m.frequency.toFixed(0),
    label: m.label,
  })

  return {
    all: modes.map(fmt),
    axial: modes.filter(m => m.type === 'axial').map(fmt),
    tangential: modes.filter(m => m.type === 'tangential').map(fmt),
    oblique: modes.filter(m => m.type === 'oblique').map(fmt),
  }
}

/** Typical absorption coefficients by room type */
const ABSORPTION_COEFFICIENTS: Record<string, number> = {
  'live': 0.10,       // Hard surfaces, minimal treatment
  'average': 0.20,    // Typical room
  'dead': 0.40,       // Heavy acoustic treatment
  'very_dead': 0.60,  // Recording studio / anechoic
}

/**
 * Estimate RT60 and volume from room dimensions and absorption type.
 * Uses Sabine equation: T60 = 0.161 * V / A
 * where A = total absorption = α * S (surface area)
 */
export function getRoomParametersFromDimensions(
  lengthM: number,
  widthM: number,
  heightM: number,
  absorptionType: string = 'average'
): { rt60: number; volume: number } {
  const volume = lengthM * widthM * heightM
  const surfaceArea = 2 * (lengthM * widthM + lengthM * heightM + widthM * heightM)
  const alpha = ABSORPTION_COEFFICIENTS[absorptionType] ?? 0.20
  const totalAbsorption = alpha * surfaceArea

  // Sabine equation
  const rt60 = totalAbsorption > 0 ? (0.161 * volume) / totalAbsorption : 1.0

  return { rt60, volume }
}

/**
 * Convert feet to meters
 */
export function feetToMeters(feet: number): number {
  return feet * 0.3048
}
