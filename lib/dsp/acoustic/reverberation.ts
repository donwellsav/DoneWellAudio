/**
 * Reverberation Time Calculations
 *
 * Eyring RT60, air absorption correction, and reverberation-aware Q adjustment
 * for distinguishing room modes from acoustic feedback.
 *
 * @see Hopkins, "Sound Insulation" (2007) §1.2.4, §1.2.6.3
 */

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
