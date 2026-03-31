/**
 * Pure utility functions for PA2 Companion bridge.
 *
 * Extracted from usePA2Bridge.ts to reduce hook complexity and enable
 * independent testing. All functions are stateless and side-effect-free.
 */

import type { PA2LoopResponse, PA2MetersResponse } from '@/types/pa2'

// ── Constants ────────────────────────────────────────────────────────────────

/** ISO 1/3 octave center frequencies for 31-band GEQ (PA2 DriveRack) */
export const PA2_RTA_FREQS = [
  20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500,
  630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000,
  10000, 12500, 16000, 20000,
] as const

/** Minimum confidence increase to re-send a PEQ detection for the same advisory */
export const CONFIDENCE_RESEND_DELTA = 0.10

// ── RTA conversion ──────────────────────────────────────────────────────────

/** Convert /loop RTA object (freq keys) to sorted array of 31 values */
export function loopRTAToArray(loop: PA2LoopResponse): number[] {
  const arr = new Array(31).fill(-90)
  for (let i = 0; i < PA2_RTA_FREQS.length; i++) {
    const val = loop.rta[String(PA2_RTA_FREQS[i])]
    if (val !== undefined) arr[i] = val
  }
  return arr
}

/** Reshape /loop meters to full PA2MetersResponse format */
export function loopMetersToFull(loop: PA2LoopResponse): PA2MetersResponse {
  return {
    input: loop.meters.input,
    output: loop.meters.output,
    compressor: { input: 0, gr: loop.meters.comp_gr },
    limiter: { input: 0, gr: loop.meters.lim_gr },
    timestamp: loop.timestamp,
  }
}

// ── Dual-RTA cross-validation ───────────────────────────────────────────────

/**
 * Compare a DoneWell detection against the PA2's independent RTA measurement mic.
 * Two mics agreeing = higher confidence. Disagreeing = possible false positive.
 *
 * @param advFreqHz   Detected feedback frequency from DoneWell
 * @param advConfidence  DoneWell's confidence in this detection (0–1)
 * @param pa2Rta      31-band RTA snapshot from PA2 /loop endpoint
 * @returns Adjusted confidence (boosted if PA2 confirms, reduced if it doesn't)
 */
export function crossValidateWithPA2RTA(
  advFreqHz: number,
  advConfidence: number,
  pa2Rta: readonly number[],
): number {
  if (!pa2Rta || pa2Rta.length < 31) return advConfidence

  // Find nearest PA2 RTA band to the advisory frequency
  let bestIdx = 0
  let bestDist = Infinity
  for (let i = 0; i < PA2_RTA_FREQS.length; i++) {
    const dist = Math.abs(Math.log2(advFreqHz / PA2_RTA_FREQS[i]))
    if (dist < bestDist) { bestDist = dist; bestIdx = i }
  }

  // Check if PA2 RTA shows a peak at this frequency (above neighbors)
  const bandDb = pa2Rta[bestIdx]
  const leftDb = bestIdx > 0 ? pa2Rta[bestIdx - 1] : -90
  const rightDb = bestIdx < 30 ? pa2Rta[bestIdx + 1] : -90
  const neighborAvg = (leftDb + rightDb) / 2
  const prominence = bandDb - neighborAvg

  if (prominence > 6) {
    // PA2 RTA confirms a peak — boost confidence 15%
    return Math.min(1.0, advConfidence + 0.15)
  } else if (prominence < 2 && bandDb < -60) {
    // PA2 RTA shows no peak and low energy — reduce confidence 20%
    return Math.max(0, advConfidence - 0.20)
  }
  return advConfidence
}

// ── PEQ dedup ───────────────────────────────────────────────────────────────

/**
 * Filter PEQ detection payload to only include new or worsened advisories.
 * Skips advisories already sent at similar confidence. Re-sends if confidence
 * rose by CONFIDENCE_RESEND_DELTA (10%+) — indicates feedback worsening.
 */
export function filterNewOrWorsened<T extends { hz: number; confidence: number; clientId?: string }>(
  payload: T[],
  sentPEQ: Record<string, number>,
): T[] {
  return payload.filter(det => {
    const id = det.clientId
    if (!id) return true
    const prev = sentPEQ[id]
    if (prev === undefined) return true
    return det.confidence >= prev + CONFIDENCE_RESEND_DELTA
  })
}

/** Record sent PEQ detections for dedup tracking */
export function markPEQSent(
  payload: { confidence: number; clientId?: string }[],
  sentPEQ: Record<string, number>,
): void {
  for (const det of payload) {
    if (det.clientId) sentPEQ[det.clientId] = det.confidence
  }
}
