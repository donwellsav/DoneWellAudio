/**
 * Modal Analysis — Density, Overlap, and Feedback Adjustments
 *
 * Hopkins three-term modal density formula, modal overlap classification,
 * and frequency-dependent prominence scaling for feedback detection.
 *
 * @see Hopkins, "Sound Insulation" (2007) §1.2.6 (Eqs. 1.77, 1.109)
 */

import { MODAL_OVERLAP } from '../constants'

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Speed of sound in air at 20 °C (m/s).
 * Hopkins uses c₀ = 343 m/s throughout Chapter 1.
 */
const C0 = 343

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
