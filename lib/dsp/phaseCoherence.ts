/**
 * Phase Coherence Analysis — KU Leuven 2025 / Nyquist stability criterion
 *
 * Measures frame-to-frame phase stability. Feedback has constant phase
 * progression (coherence ≈ 1), while music varies randomly (coherence ≈ 0).
 */

import { PHASE_SETTINGS } from './constants'

// ── Types ────────────────────────────────────────────────────────────────────

export interface PhaseCoherenceResult {
  coherence: number
  feedbackScore: number
  meanPhaseDelta: number
  phaseDeltaStd: number
  isFeedbackLikely: boolean
}

// ── Constants ────────────────────────────────────────────────────────────────

export const PHASE_CONSTANTS = {
  HIGH_COHERENCE: PHASE_SETTINGS.HIGH_COHERENCE,
  MEDIUM_COHERENCE: PHASE_SETTINGS.MEDIUM_COHERENCE,
  LOW_COHERENCE: PHASE_SETTINGS.LOW_COHERENCE,
  MIN_SAMPLES: PHASE_SETTINGS.MIN_SAMPLES,
} as const

// ── Phase History Buffer ─────────────────────────────────────────────────────

/**
 * Stores raw phase angle φ_k per bin per frame (radians, from atan2).
 * calculateCoherence() computes frame-to-frame phase differences internally
 * and returns |mean phasor| as the coherence metric.
 */
export class PhaseHistoryBuffer {
  private history: Float32Array[]
  private frameIndex: number = 0
  private frameCount: number = 0
  private maxFrames: number
  // Per-frame coherence cache — invalidated on addFrame().
  // Prevents redundant circular-stats computation when multiple consumers
  // query the same bin within one frame (~4 bins/frame × 50fps).
  private _coherenceCache = new Map<number, PhaseCoherenceResult>()
  private _cacheFrameGen = 0

  constructor(numBins: number, maxFrames: number = 10) {
    this.maxFrames = maxFrames
    this.history = []
    for (let i = 0; i < maxFrames; i++) {
      this.history.push(new Float32Array(numBins))
    }
  }

  addFrame(phaseRadians: Float32Array): void {
    const frame = this.history[this.frameIndex]
    for (let i = 0; i < phaseRadians.length && i < frame.length; i++) {
      frame[i] = phaseRadians[i]
    }
    this.frameIndex = (this.frameIndex + 1) % this.maxFrames
    this.frameCount = Math.min(this.frameCount + 1, this.maxFrames)
    // Invalidate coherence cache — new frame means new results
    this._cacheFrameGen++
  }

  /**
   * Phase coherence = |mean phasor of frame-to-frame phase differences|.
   *
   * Formula (KU Leuven 2025, Eq. 4):
   *   coherence = | (1/N) * Σ exp(j * Δφ_n) |
   */
  calculateCoherence(binIndex: number): PhaseCoherenceResult {
    // Per-frame cache: skip circular-stats recomputation for same bin in same frame
    const cached = this._coherenceCache.get(binIndex)
    if (cached !== undefined) return cached

    const count = this.frameCount
    if (count < PHASE_CONSTANTS.MIN_SAMPLES) {
      return {
        coherence: 0,
        feedbackScore: 0,
        meanPhaseDelta: 0,
        phaseDeltaStd: 0,
        isFeedbackLikely: false,
      }
    }

    const start = (this.frameIndex - count + this.maxFrames) % this.maxFrames
    const hist = this.history
    const max = this.maxFrames
    const numDeltas = count - 1

    let deltaSum = 0
    let realSum = 0
    let imagSum = 0
    let deltaSqSum = 0
    let prevPhase = hist[start % max][binIndex]

    for (let i = 1; i < count; i++) {
      const phase = hist[(start + i) % max][binIndex]
      let delta = phase - prevPhase
      // Unwrap to [-π, π]
      if (delta > Math.PI) delta -= 2 * Math.PI
      else if (delta < -Math.PI) delta += 2 * Math.PI
      deltaSum += delta
      deltaSqSum += delta * delta
      realSum += Math.cos(delta)
      imagSum += Math.sin(delta)
      prevPhase = phase
    }

    const meanPhaseDelta = deltaSum / numDeltas
    const variance = (deltaSqSum / numDeltas) - meanPhaseDelta * meanPhaseDelta
    const phaseDeltaStd = Math.sqrt(Math.max(0, variance))

    realSum /= numDeltas
    imagSum /= numDeltas
    const coherence = Math.sqrt(realSum * realSum + imagSum * imagSum)

    const result: PhaseCoherenceResult = {
      coherence,
      feedbackScore: coherence,
      meanPhaseDelta,
      phaseDeltaStd,
      isFeedbackLikely: coherence >= PHASE_CONSTANTS.HIGH_COHERENCE,
    }
    this._coherenceCache.set(binIndex, result)
    return result
  }

  reset(): void {
    this.frameIndex = 0
    this.frameCount = 0
    this._coherenceCache.clear()
    this._cacheFrameGen = 0
    for (const frame of this.history) {
      frame.fill(0)
    }
  }

  getFrameCount(): number {
    return this.frameCount
  }
}
