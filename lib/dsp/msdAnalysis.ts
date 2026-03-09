/**
 * Magnitude Slope Deviation (MSD) — DAFx-16 Paper
 *
 * MSD measures how "flat" a frequency bin's magnitude trajectory is over time.
 * Feedback produces a near-constant magnitude (MSD ≈ 0), while music/speech
 * fluctuates (MSD >> 0). The feedbackScore is exp(-MSD/threshold).
 */

import { MSD_SETTINGS } from './constants'

// ── Types ────────────────────────────────────────────────────────────────────

export interface MSDResult {
  msd: number
  feedbackScore: number
  secondDerivative: number
  isFeedbackLikely: boolean
  framesAnalyzed: number
  /** Mean magnitude over the history window (dB) — used for energy gate */
  meanMagnitudeDb: number
}

// ── Constants ────────────────────────────────────────────────────────────────

export const MSD_CONSTANTS = {
  THRESHOLD: MSD_SETTINGS.THRESHOLD,
  SILENCE_FLOOR_DB: -70,
  MIN_FRAMES_SPEECH: MSD_SETTINGS.MIN_FRAMES_SPEECH,
  MIN_FRAMES_MUSIC: MSD_SETTINGS.MIN_FRAMES_MUSIC,
  DEFAULT_FRAMES: MSD_SETTINGS.MIN_FRAMES_SPEECH,
  MAX_FRAMES: MSD_SETTINGS.MAX_FRAMES,
} as const

// ── MSD History Buffer ───────────────────────────────────────────────────────

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
   * FLAW 2 FIX: Energy gate — silent bins return feedbackScore = 0.
   * FLAW 3 FIX: Threshold is 0.1 (paper-correct), not 0.8.
   */
  calculateMSD(binIndex: number, minFrames: number = MSD_CONSTANTS.MIN_FRAMES_SPEECH): MSDResult {
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

    // Energy gate: compute mean magnitude over the history window
    let sum = 0
    for (let i = 0; i < count; i++) {
      sum += hist[(start + i) % max][binIndex]
    }
    const meanMagnitudeDb = sum / count
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

    // Compute MSD in a single pass over the ring buffer
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
