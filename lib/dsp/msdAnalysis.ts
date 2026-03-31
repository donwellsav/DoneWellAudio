/**
 * Magnitude Slope Deviation (MSD) — DAFx-16 Paper
 *
 * MSD measures how "flat" a frequency bin's magnitude trajectory is over time.
 * Feedback produces a near-constant magnitude (MSD ≈ 0), while music/speech
 * fluctuates (MSD >> 0). The feedbackScore is exp(-MSD/threshold).
 */

import { MSD_SETTINGS } from './constants'
import type { MSDResult } from '@/types/advisory'
import { MSD_CONSTANTS } from './constants/detectionConstants'

// ── Re-exports (canonical homes: types/advisory.ts + constants/detectionConstants.ts) ──

export type { MSDResult } from '@/types/advisory'
export { MSD_CONSTANTS } from './constants/detectionConstants'

// ── MSD History Buffer ───────────────────────────────────────────────────────

/** @deprecated Use MSDPool from './msdPool' instead. Kept for one release cycle. */
export class MSDHistoryBuffer {
  private history: Float32Array[]
  private frameIndex: number = 0
  private frameCount: number = 0
  private maxFrames: number

  constructor(numBins: number, maxFrames: number = MSD_CONSTANTS.MAX_FRAMES) {
    this.maxFrames = maxFrames
    this.history = []
    for (let i = 0; i < maxFrames; i++) {
      this.history.push(new Float32Array(numBins))
    }
  }

  addFrame(magnitudeDb: Float32Array): void {
    const frame = this.history[this.frameIndex]
    for (let i = 0; i < magnitudeDb.length && i < frame.length; i++) {
      frame[i] = magnitudeDb[i]
    }
    this.frameIndex = (this.frameIndex + 1) % this.maxFrames
    this.frameCount = Math.min(this.frameCount + 1, this.maxFrames)
  }

  /**
   * Calculate MSD for a specific frequency bin.
   *
   * Energy gate: when noiseFloorDb is provided, uses relative gate (6 dB above
   * noise floor) matching feedbackDetector.ts. Falls back to absolute -70 dB
   * gate when noiseFloorDb is unavailable.
   *
   * SYNC: The second-derivative loop must produce identical results to
   * feedbackDetector.ts:calculateMsd() for identical input data.
   * See __tests__/msdConsistency.test.ts
   */
  calculateMSD(
    binIndex: number,
    minFrames: number = MSD_CONSTANTS.MIN_FRAMES_SPEECH,
    noiseFloorDb: number | null = null,
  ): MSDResult {
    const count = this.frameCount
    if (count < minFrames) {
      return {
        msd: Infinity,
        feedbackScore: 0,
        secondDerivative: 0,
        isFeedbackLikely: false,
        framesAnalyzed: count,
        meanMagnitudeDb: -Infinity,
      }
    }

    const start = (this.frameIndex - count + this.maxFrames) % this.maxFrames
    const hist = this.history
    const max = this.maxFrames

    // Compute mean magnitude over history window (used for absolute fallback gate)
    let sum = 0
    for (let i = 0; i < count; i++) {
      sum += hist[(start + i) % max][binIndex]
    }
    const meanMagnitudeDb = sum / count

    // Energy gate: prevent MSD from triggering on noise-floor fluctuations
    if (noiseFloorDb !== null) {
      // Relative gate (matches feedbackDetector.ts): current bin must be
      // MIN_ENERGY_ABOVE_NOISE_DB (6 dB) above the noise floor
      const latestFrameIdx = (this.frameIndex - 1 + this.maxFrames) % this.maxFrames
      const currentBinDb = hist[latestFrameIdx][binIndex]
      if (currentBinDb - noiseFloorDb < MSD_SETTINGS.MIN_ENERGY_ABOVE_NOISE_DB) {
        return {
          msd: Infinity,
          feedbackScore: 0,
          secondDerivative: 0,
          isFeedbackLikely: false,
          framesAnalyzed: count,
          meanMagnitudeDb,
        }
      }
    } else {
      // Absolute fallback gate for standalone usage (no noise floor available)
      if (meanMagnitudeDb < MSD_CONSTANTS.SILENCE_FLOOR_DB) {
        return {
          msd: Infinity,
          feedbackScore: 0,
          secondDerivative: 0,
          isFeedbackLikely: false,
          framesAnalyzed: count,
          meanMagnitudeDb,
        }
      }
    }

    // SYNC: MSD second-derivative computation — identical math to
    // feedbackDetector.ts:calculateMsd() lines 1444-1454.
    // secondDeriv = v[n] - 2*v[n-1] + v[n-2] (3-point stencil form)
    let sumSquaredSecondDeriv = 0
    let lastSecondDeriv = 0
    for (let n = 2; n < count; n++) {
      const v0 = hist[(start + n - 2) % max][binIndex]
      const v1 = hist[(start + n - 1) % max][binIndex]
      const v2 = hist[(start + n) % max][binIndex]
      const secondDeriv = v2 - 2 * v1 + v0
      sumSquaredSecondDeriv += secondDeriv * secondDeriv
      lastSecondDeriv = secondDeriv
    }

    const numTerms = count - 2
    const msd = numTerms > 0 ? sumSquaredSecondDeriv / numTerms : Infinity

    const feedbackScore = Math.exp(-msd / MSD_CONSTANTS.THRESHOLD)
    const isFeedbackLikely = msd < MSD_CONSTANTS.THRESHOLD

    return {
      msd,
      feedbackScore,
      secondDerivative: lastSecondDeriv,
      isFeedbackLikely,
      framesAnalyzed: count,
      meanMagnitudeDb,
    }
  }

  reset(): void {
    this.frameIndex = 0
    this.frameCount = 0
    for (const frame of this.history) {
      frame.fill(0)
    }
  }

  getFrameCount(): number {
    return this.frameCount
  }
}
