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
// HOPKINS MODAL DENSITY  n(f)  —  "Sound Insulation" §1.2.6.4 (Eq. 1.77)
// ============================================================================

/**
 * Speed of sound in air at 20 °C (m/s).
 * Hopkins uses c₀ = 343 m/s throughout Chapter 1.
 */
const C0 = 343

/**
 * Calculate the statistical modal density of a rectangular room (modes/Hz)
 * using the full Hopkins three-term formula (Eq. 1.77):
 *
 *   n(f) = 4π f² V / c₀³  +  π f S / (2 c₀²)  +  L / (8 c₀)
 *
 * - Term 1 (volume):  dominant above the Schroeder frequency
 * - Term 2 (surface): significant at mid-low frequencies
 * - Term 3 (edges):   relevant only at very low frequencies
 *
 * @param frequencyHz  - Frequency in Hz
 * @param roomVolume   - Room volume in m³    (e.g. 500 for a medium hall)
 * @param surfaceArea  - Total surface area m² (default: estimated from volume)
 * @param edgeLength   - Total edge length m   (default: estimated from volume)
 * @returns Modal density in modes/Hz
 */
export function calculateModalDensity(
  frequencyHz: number,
  roomVolume: number,
  surfaceArea?: number,
  edgeLength?: number
): number {
  if (frequencyHz <= 0 || roomVolume <= 0) return 0

  // Estimate geometry from volume if not supplied.
  // Assume a roughly cuboid room: V = a·b·c.
  // For a cube: a = V^(1/3), S = 6a², L = 12a.
  // Scale factor 1.2 accounts for non-cubic rooms (Hopkins recommends using
  // measured geometry when available, estimated otherwise).
  const sideLen = Math.pow(roomVolume, 1 / 3) * 1.2
  const S = surfaceArea ?? 6 * sideLen * sideLen
  const L = edgeLength  ?? 12 * sideLen

  const f   = frequencyHz
  const c   = C0
  const c2  = c * c
  const c3  = c2 * c

  const term1 = (4 * Math.PI * f * f * roomVolume) / c3           // volume term
  const term2 = (Math.PI * f * S)                  / (2 * c2)     // surface term
  const term3 = L                                  / (8 * c)      // edge term

  return term1 + term2 + term3   // modes / Hz
}

/**
 * Frequency-dependent feedback probability modifier derived from modal density.
 *
 * Hopkins §1.2.6: Below the Schroeder frequency individual modes dominate.
 * At a given frequency the expected number of modes per Hz tells us how
 * likely a spectral peak is to be a room resonance vs. acoustic feedback.
 *
 *   - n(f) < 0.5  modes/Hz → modal field is sparse → peaks *may* be room modes
 *     but feedback is still possible (cannot distinguish on density alone).
 *   - n(f) 0.5–2  modes/Hz → transitional → neutral
 *   - n(f) > 2    modes/Hz → dense modal field → sharp peaks MORE likely
 *     feedback (a room mode would blend in, only feedback stands out).
 *
 * @returns delta to apply to pFeedback, plus a human-readable note.
 */
export function modalDensityFeedbackAdjustment(
  frequencyHz: number,
  roomVolume: number,
  measuredQ: number
): { delta: number; note: string | null } {
  const nf = calculateModalDensity(frequencyHz, roomVolume)

  if (nf < 0.5) {
    // Very sparse modes — a peak here is ambiguous; slight reduction
    return {
      delta: -0.08,
      note: `Sparse modal field at ${frequencyHz.toFixed(0)} Hz (n(f)=${nf.toFixed(2)} modes/Hz) — ambiguous`,
    }
  }

  if (nf > 2) {
    // Dense modal field — feedback peaks stand out above the modal bath
    // Only apply boost when Q is also high (i.e. the peak is genuinely narrow)
    if (measuredQ > 15) {
      return {
        delta: +0.08,
        note: `Dense modal field (n(f)=${nf.toFixed(1)} modes/Hz) with high Q=${measuredQ.toFixed(0)} — sharp peak above modal bath`,
      }
    }
  }

  return { delta: 0, note: null }
}

// ============================================================================
// REVERBERATION-AWARE Q ADJUSTMENT  (Hopkins §1.2.6.3)
// ============================================================================

/**
 * Compare a measured peak Q against the room's natural reverberation Q.
 *
 * A room mode at frequency f with reverberation time T₆₀ has a natural
 * 3 dB bandwidth of:  Δf = 6.9 / (π · T₆₀)
 * and a corresponding "room Q":  Q_room = π · f · T₆₀ / 6.9
 *
 * Interpretation (Hopkins §1.2.6.3):
 *   - measuredQ ≤ Q_room : The peak is no sharper than expected for this room's
 *     decay — it is more likely a room mode than feedback.  Reduce pFeedback.
 *   - measuredQ ≫ Q_room : The peak is far sharper than the room can sustain —
 *     something external (i.e. the PA loop) is sustaining it.  Boost pFeedback.
 *
 * @param measuredQ   - Q factor of the detected peak
 * @param frequencyHz - Centre frequency of the peak (Hz)
 * @param rt60        - Room reverberation time T₆₀ (seconds)
 * @returns { delta, reason } — delta to add to pFeedback, optional reason string
 */
export function reverberationQAdjustment(
  measuredQ: number,
  frequencyHz: number,
  rt60: number
): { delta: number; reason: string | null } {
  if (measuredQ <= 0 || frequencyHz <= 0 || rt60 <= 0) {
    return { delta: 0, reason: null }
  }

  // Q_room = π · f · T₆₀ / 6.9
  const qRoom = (Math.PI * frequencyHz * rt60) / 6.9

  const ratio = measuredQ / qRoom

  if (ratio <= 1.0) {
    // Peak is at or below the room's natural decay sharpness — likely a room mode
    return {
      delta: -0.10,
      reason: `Q=${measuredQ.toFixed(0)} ≤ Q_room=${qRoom.toFixed(0)} — consistent with room decay (RT60=${rt60}s)`,
    }
  }

  if (ratio >= 3.0) {
    // Peak is ≥3× sharper than the room can naturally sustain — strong feedback indicator
    return {
      delta: +0.12,
      reason: `Q=${measuredQ.toFixed(0)} >> Q_room=${qRoom.toFixed(0)} (×${ratio.toFixed(1)}) — unusually sharp, likely feedback loop`,
    }
  }

  // Transitional range (1–3×): small positive nudge
  return {
    delta: +0.04,
    reason: null,
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

// ============================================================================
// UNIT CONVERSIONS
// ============================================================================

/**
 * Convert feet to meters
 */
export function feetToMeters(feet: number): number {
  return feet * 0.3048
}

// ============================================================================
// ROOM MODE CALCULATION
// ============================================================================

export interface RoomMode {
  frequency: number   // Hz
  label: string       // e.g. "1,0,0"
  type: 'axial' | 'tangential' | 'oblique'
}

export interface RoomModesResult {
  all: RoomMode[]
  axial: RoomMode[]
  tangential: RoomMode[]
  oblique: RoomMode[]
}

export interface FormattedRoomMode {
  hz: string
  label: string
}

export interface FormattedRoomModesResult {
  all: FormattedRoomMode[]
  axial: FormattedRoomMode[]
  tangential: FormattedRoomMode[]
  oblique: FormattedRoomMode[]
}

/**
 * Calculate axial, tangential, and oblique room modes up to 300 Hz.
 * Uses the standard formula: f = (c/2) * sqrt((nx/L)² + (ny/W)² + (nz/H)²)
 * where c = 343 m/s (speed of sound).
 *
 * @param lengthM - Room length in meters
 * @param widthM  - Room width in meters
 * @param heightM - Room height in meters
 * @param maxHz   - Upper frequency limit (default 300 Hz)
 */
export function calculateRoomModes(
  lengthM: number,
  widthM: number,
  heightM: number,
  maxHz = 300
): RoomModesResult {
  const c = 343 // speed of sound m/s
  const MAX_ORDER = 6 // check modes up to 6th order per dimension
  const modes: RoomMode[] = []

  for (let nx = 0; nx <= MAX_ORDER; nx++) {
    for (let ny = 0; ny <= MAX_ORDER; ny++) {
      for (let nz = 0; nz <= MAX_ORDER; nz++) {
        if (nx === 0 && ny === 0 && nz === 0) continue

        const term = (nx / lengthM) ** 2 + (ny / widthM) ** 2 + (nz / heightM) ** 2
        const freq = (c / 2) * Math.sqrt(term)

        if (freq > maxHz) continue

        // Classify mode type by number of non-zero indices
        const nonZero = (nx > 0 ? 1 : 0) + (ny > 0 ? 1 : 0) + (nz > 0 ? 1 : 0)
        const type: RoomMode['type'] =
          nonZero === 1 ? 'axial' : nonZero === 2 ? 'tangential' : 'oblique'

        modes.push({
          frequency: freq,
          label: `${nx},${ny},${nz}`,
          type,
        })
      }
    }
  }

  // Sort by frequency
  modes.sort((a, b) => a.frequency - b.frequency)

  return {
    all: modes,
    axial: modes.filter((m) => m.type === 'axial'),
    tangential: modes.filter((m) => m.type === 'tangential'),
    oblique: modes.filter((m) => m.type === 'oblique'),
  }
}

/**
 * Format room modes for display in the UI
 */
export function formatRoomModesForDisplay(modes: RoomModesResult): FormattedRoomModesResult {
  const fmt = (m: RoomMode): FormattedRoomMode => ({
    hz: m.frequency.toFixed(1),
    label: m.label,
  })
  return {
    all: modes.all.map(fmt),
    axial: modes.axial.map(fmt),
    tangential: modes.tangential.map(fmt),
    oblique: modes.oblique.map(fmt),
  }
}

// ============================================================================
// ROOM PARAMETER ESTIMATION FROM DIMENSIONS
// ============================================================================

export interface RoomParameters {
  volume: number    // m³
  rt60: number      // seconds (estimated)
  schroederHz: number
}

/**
 * Estimate RT60 and calculate room volume from physical dimensions.
 * Uses a simplified Sabine approximation with preset absorption coefficients.
 *
 * @param lengthM        - Room length in meters
 * @param widthM         - Room width in meters
 * @param heightM        - Room height in meters
 * @param absorptionType - Acoustic treatment level
 */
export function getRoomParametersFromDimensions(
  lengthM: number,
  widthM: number,
  heightM: number,
  absorptionType: 'untreated' | 'typical' | 'treated' | 'studio' = 'typical'
): RoomParameters {
  // Average absorption coefficient by treatment type (broadband estimate)
  const absorptionCoeff: Record<typeof absorptionType, number> = {
    untreated: 0.07,
    typical:   0.15,
    treated:   0.25,
    studio:    0.45,
  }

  const alpha = absorptionCoeff[absorptionType]
  const volume = lengthM * widthM * heightM

  // Total surface area
  const surface =
    2 * (lengthM * widthM + lengthM * heightM + widthM * heightM)

  // Sabine's formula: RT60 = 0.161 * V / (alpha * S)
  const sabineRT60 = surface > 0 ? (0.161 * volume) / (alpha * surface) : 1.0
  // Eyring is more accurate for absorptive rooms (α > 0.2)
  const eyringRT60 = calculateEyringRT60(volume, surface, alpha)
  // Use the more conservative (shorter) estimate
  const rt60 = Math.min(sabineRT60, eyringRT60)

  const schroederHz = calculateSchroederFrequency(rt60, volume)

  return {
    volume: Math.round(volume * 10) / 10,
    rt60: Math.round(rt60 * 10) / 10,
    schroederHz,
  }
}

// ============================================================================
// EYRING RT60 — More accurate than Sabine for absorptive rooms
// ============================================================================

/**
 * Calculate Eyring RT60 — more accurate than Sabine when α > 0.2.
 * Formula: RT60 = 0.161 × V / (-S × ln(1 - α))
 *
 * Falls back to Sabine when α is very small (ln(1-α) ≈ -α).
 *
 * @param volume      - Room volume m³
 * @param surfaceArea - Total surface area m²
 * @param alpha       - Average absorption coefficient (0–1)
 */
export function calculateEyringRT60(volume: number, surfaceArea: number, alpha: number): number {
  if (volume <= 0 || surfaceArea <= 0 || alpha <= 0) return 1.0
  // Clamp alpha to prevent ln(0) — α = 1.0 means perfect absorption
  const clampedAlpha = Math.min(alpha, 0.99)
  const denominator = -surfaceArea * Math.log(1 - clampedAlpha)
  if (denominator <= 0) return 1.0
  return (0.161 * volume) / denominator
}

// ============================================================================
// AIR ABSORPTION CORRECTION — Hopkins §1.2.4
// ============================================================================

/**
 * Apply air absorption correction to RT60 for high frequencies.
 *
 * Air absorbs sound energy proportional to f^~1.7. Below 2 kHz the effect
 * is negligible; above 4 kHz it significantly shortens effective RT60.
 *
 * Simplified fit for 20°C, 50% RH (typical indoor conditions):
 *   m ≈ 5.5e-4 × (f/1000)^1.7  (Np/m → absorption per meter)
 *
 * Corrected RT60 (Hopkins §1.2.4):
 *   RT60_corr = RT60 / (1 + 4mV × RT60 / S)
 *
 * @param rt60        - Uncorrected RT60 in seconds
 * @param frequencyHz - Frequency in Hz
 * @param volume      - Room volume m³
 * @param surfaceArea - Total surface area m² (estimated from volume if not given)
 */
export function airAbsorptionCorrectedRT60(
  rt60: number,
  frequencyHz: number,
  volume: number,
  surfaceArea?: number
): number {
  if (rt60 <= 0 || frequencyHz <= 0 || volume <= 0) return rt60
  // Below 2 kHz, air absorption is negligible
  if (frequencyHz < 2000) return rt60

  // Estimate surface area from volume if not provided (cube approximation)
  const sideLen = Math.pow(volume, 1 / 3) * 1.2
  const S = surfaceArea ?? 6 * sideLen * sideLen

  // Simplified air absorption coefficient at 20°C, 50% RH
  const fKHz = frequencyHz / 1000
  const m = 5.5e-4 * Math.pow(fKHz, 1.7) // Np/m

  // Corrected RT60
  const correction = 1 + (4 * m * volume * rt60) / S
  return rt60 / Math.max(correction, 1)
}

// ============================================================================
// ROOM MODE PROXIMITY PENALTY
// ============================================================================

/**
 * Check if a detected peak frequency coincides with a calculated room mode.
 *
 * Uses existing calculateRoomModes() to enumerate eigenfrequencies, then
 * checks if the detected peak falls within the -3 dB bandwidth of any mode.
 * Bandwidth from Hopkins §1.2.6.3: Δf_3dB = 6.9 / (π × RT60).
 *
 * @param frequencyHz - Detected peak frequency
 * @param roomLengthM - Room length in meters
 * @param roomWidthM  - Room width in meters
 * @param roomHeightM - Room height in meters
 * @param rt60        - Room RT60 in seconds
 * @returns delta to apply to pFeedback, plus reason string
 */
export function roomModeProximityPenalty(
  frequencyHz: number,
  roomLengthM: number,
  roomWidthM: number,
  roomHeightM: number,
  rt60: number
): { delta: number; reason: string | null } {
  if (roomLengthM <= 0 || roomWidthM <= 0 || roomHeightM <= 0 || rt60 <= 0) {
    return { delta: 0, reason: null }
  }

  // Only check up to 500 Hz — above that, room modes are too dense to be useful
  if (frequencyHz > 500) {
    return { delta: 0, reason: null }
  }

  // Mode bandwidth (Hopkins §1.2.6.3): Δf_3dB = 6.9 / (π × RT60)
  const bandwidth3dB = 6.9 / (Math.PI * rt60)

  const modes = calculateRoomModes(roomLengthM, roomWidthM, roomHeightM, 500)

  let bestDelta = 0
  let bestReason: string | null = null

  for (const mode of modes.all) {
    const distance = Math.abs(frequencyHz - mode.frequency)

    if (distance <= bandwidth3dB && bestDelta > -0.15) {
      // Within -3 dB bandwidth — strong room mode match
      bestDelta = -0.15
      bestReason = `Peak ${frequencyHz.toFixed(0)} Hz matches room mode ${mode.label} (${mode.type}) at ${mode.frequency.toFixed(1)} Hz ±${bandwidth3dB.toFixed(1)} Hz`
    } else if (distance <= 2 * bandwidth3dB && bestDelta > -0.08) {
      // Within 2× bandwidth — mild room mode proximity
      bestDelta = -0.08
      bestReason = `Peak ${frequencyHz.toFixed(0)} Hz near room mode ${mode.label} at ${mode.frequency.toFixed(1)} Hz`
    }
  }

  return { delta: bestDelta, reason: bestReason }
}

// ============================================================================
// FREQUENCY-DEPENDENT PROMINENCE THRESHOLD
// ============================================================================

/**
 * Calculate a frequency-dependent prominence floor using modal density.
 *
 * In sparse modal regions (low frequency, small rooms), room modes can
 * look like sharp peaks.  Require higher prominence to confirm feedback.
 * In dense modal regions, the standard floor suffices.
 *
 * @param baseProminenceDb - Base prominence floor (e.g. 10 dB)
 * @param frequencyHz      - Frequency of the peak
 * @param roomVolume       - Room volume m³
 * @returns Adjusted prominence floor in dB
 */
export function frequencyDependentProminence(
  baseProminenceDb: number,
  frequencyHz: number,
  roomVolume: number
): number {
  if (frequencyHz <= 0 || roomVolume <= 0) return baseProminenceDb

  const nf = calculateModalDensity(frequencyHz, roomVolume)

  // In sparse regions (n(f) < 1), scale up the prominence requirement
  // Cap the multiplier at 1.5× to avoid over-suppression
  if (nf < 1.0) {
    const multiplier = Math.min(1 + 0.5 / Math.max(nf, 0.1), 1.5)
    return baseProminenceDb * multiplier
  }

  return baseProminenceDb
}
