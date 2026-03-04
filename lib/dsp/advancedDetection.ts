/**
 * Advanced Feedback Detection Algorithms
 *
 * Based on academic research:
 * 1. DAFx-16 Paper: Magnitude Slope Deviation (MSD) Algorithm
 * 2. DBX Paper: Comb Filter Pattern Detection
 * 3. KU Leuven 2025 (arXiv 2512.01466): Phase Coherence Analysis
 * 4. Carl Hopkins "Sound Insulation": Modal Analysis
 * 5. Smaart v8: Coherence measurement methodology
 *
 * Research-backed fixes applied (2025-03):
 * - Flaw 2: MSD now has an energy gate — silent bins no longer produce
 *   false-positive feedback scores (was score=1.0 for silence).
 * - Flaw 3: MSD threshold corrected from 0.8 to 0.1 to match the DAFx-16
 *   paper's normalized threshold (paper: 1.0 dB²/frame² / 14 terms ≈ 0.071).
 * - Flaw 4: Comb path length formula corrected from c/(2f) to c/f.
 *   A round-trip open acoustic path has comb spacing Δf = c/d, not c/(2d)
 *   (the c/2d formula applies to a closed tube standing wave).
 * - Flaw 6: Comb weight normalization fixed — totalWeight now includes the
 *   full boosted comb weight so feedbackProbability stays in [0, 1].
 * - AmplitudeHistoryBuffer rewritten as v3 with typed circular buffer to
 *   definitively clear the stale Turbopack build-cache parse error.
 */

// ============================================================================
// TYPES
// ============================================================================

import type { AlgorithmMode, ContentType } from '@/types/advisory'
import {
  MSD_SETTINGS,
  PHASE_SETTINGS,
  SPECTRAL_FLATNESS_SETTINGS,
  COMB_PATTERN_SETTINGS,
  COMPRESSION_SETTINGS,
} from './constants'

export interface MSDResult {
  msd: number
  feedbackScore: number
  secondDerivative: number
  isFeedbackLikely: boolean
  framesAnalyzed: number
  /** Mean magnitude over the history window (dB) — used for energy gate */
  meanMagnitudeDb: number
}

export interface PhaseCoherenceResult {
  coherence: number
  feedbackScore: number
  meanPhaseDelta: number
  phaseDeltaStd: number
  isFeedbackLikely: boolean
}

export interface SpectralFlatnessResult {
  flatness: number
  kurtosis: number
  feedbackScore: number
  isFeedbackLikely: boolean
}

export interface CombPatternResult {
  hasPattern: boolean
  fundamentalSpacing: number | null
  /** Estimated mic-to-speaker acoustic path length in metres.
   *  Formula: d = c / Δf  (open round-trip path, DBX paper eq. 1) */
  estimatedPathLength: number | null
  matchingPeaks: number
  predictedFrequencies: number[]
  confidence: number
}

export interface CompressionResult {
  isCompressed: boolean
  estimatedRatio: number
  crestFactor: number
  dynamicRange: number
  thresholdMultiplier: number
}

export interface AlgorithmScores {
  msd: MSDResult | null
  phase: PhaseCoherenceResult | null
  spectral: SpectralFlatnessResult | null
  comb: CombPatternResult | null
  compression: CompressionResult | null
  /** Inter-harmonic ratio analysis — low IHR = feedback, high IHR = music */
  ihr: InterHarmonicResult | null
  /** Peak-to-median ratio — high PTMR = narrow spectral peak (feedback) */
  ptmr: PTMRResult | null
}

export interface FusedDetectionResult {
  feedbackProbability: number
  confidence: number
  contributingAlgorithms: string[]
  algorithmScores: AlgorithmScores
  verdict: 'FEEDBACK' | 'POSSIBLE_FEEDBACK' | 'NOT_FEEDBACK' | 'UNCERTAIN'
  reasons: string[]
}

// ============================================================================
// CONSTANTS — sourced from the canonical definitions in constants.ts
//
// Previously advancedDetection.ts maintained its own MSD_CONSTANTS, PHASE_CONSTANTS,
// etc. that duplicated and conflicted with constants.ts values (different thresholds,
// frame counts, coherence levels).  Now all algorithm constants live in constants.ts
// and are re-exported here for backwards compatibility.
// ============================================================================

/**
 * MSD thresholds from DAFx-16 paper.
 * Now sourced from constants.ts MSD_SETTINGS for single source of truth.
 */
export const MSD_CONSTANTS = {
  THRESHOLD: MSD_SETTINGS.THRESHOLD,
  SILENCE_FLOOR_DB: -70,
  MIN_FRAMES_SPEECH: MSD_SETTINGS.MIN_FRAMES_SPEECH,
  MIN_FRAMES_MUSIC: MSD_SETTINGS.MIN_FRAMES_MUSIC,
  DEFAULT_FRAMES: MSD_SETTINGS.MIN_FRAMES_SPEECH, // Use speech frames as default (fastest, 100% accuracy)
  MAX_FRAMES: MSD_SETTINGS.MAX_FRAMES,
} as const

export const PHASE_CONSTANTS = {
  HIGH_COHERENCE: PHASE_SETTINGS.HIGH_COHERENCE,
  MEDIUM_COHERENCE: PHASE_SETTINGS.MEDIUM_COHERENCE,
  LOW_COHERENCE: PHASE_SETTINGS.LOW_COHERENCE,
  MIN_SAMPLES: PHASE_SETTINGS.MIN_SAMPLES,
} as const

export const SPECTRAL_CONSTANTS = {
  PURE_TONE_FLATNESS: SPECTRAL_FLATNESS_SETTINGS.PURE_TONE,
  MUSIC_FLATNESS: SPECTRAL_FLATNESS_SETTINGS.MUSIC,
  HIGH_KURTOSIS: SPECTRAL_FLATNESS_SETTINGS.HIGH_KURTOSIS,
  ANALYSIS_BANDWIDTH_BINS: SPECTRAL_FLATNESS_SETTINGS.ANALYSIS_BANDWIDTH,
} as const

export const COMB_CONSTANTS = {
  SPEED_OF_SOUND: COMB_PATTERN_SETTINGS.SPEED_OF_SOUND,
  MIN_PEAKS_FOR_PATTERN: COMB_PATTERN_SETTINGS.MIN_PEAKS,
  SPACING_TOLERANCE: COMB_PATTERN_SETTINGS.SPACING_TOLERANCE,
  MAX_PATH_LENGTH: COMB_PATTERN_SETTINGS.MAX_PATH_LENGTH,
} as const

export const COMPRESSION_CONSTANTS = {
  NORMAL_CREST_FACTOR: COMPRESSION_SETTINGS.NORMAL_CREST_FACTOR,
  COMPRESSED_CREST_FACTOR: COMPRESSION_SETTINGS.COMPRESSED_CREST_FACTOR,
  MIN_DYNAMIC_RANGE: COMPRESSION_SETTINGS.MIN_DYNAMIC_RANGE,
  COMPRESSED_DYNAMIC_RANGE: COMPRESSION_SETTINGS.COMPRESSED_DYNAMIC_RANGE,
  ANALYSIS_WINDOW_MS: 500,
} as const

export const FUSION_WEIGHTS = {
  DEFAULT: {
    msd: 0.30,
    phase: 0.25,
    spectral: 0.12,
    comb: 0.08,
    ihr: 0.08,
    ptmr: 0.07,
    existing: 0.10,
  },
  SPEECH: {
    msd: 0.40,
    phase: 0.20,
    spectral: 0.10,
    comb: 0.05,
    ihr: 0.05,
    ptmr: 0.10,
    existing: 0.10,
  },
  MUSIC: {
    msd: 0.15,
    phase: 0.35,
    spectral: 0.10,
    comb: 0.08,
    ihr: 0.12,
    ptmr: 0.05,
    existing: 0.15,
  },
  COMPRESSED: {
    msd: 0.12,
    phase: 0.38,
    spectral: 0.15,
    comb: 0.08,
    ihr: 0.10,
    ptmr: 0.07,
    existing: 0.10,
  },
} as const

// ============================================================================
// MAGNITUDE SLOPE DEVIATION (MSD) — DAFx-16
// ============================================================================

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

  getBinHistory(binIndex: number): number[] {
    const result: number[] = []
    const start = (this.frameIndex - this.frameCount + this.maxFrames) % this.maxFrames
    for (let i = 0; i < this.frameCount; i++) {
      const frameIdx = (start + i) % this.maxFrames
      result.push(this.history[frameIdx][binIndex])
    }
    return result
  }

  /**
   * Calculate MSD for a specific frequency bin.
   *
   * FLAW 2 FIX: Added energy gate — if the mean magnitude over the history
   * window is below SILENCE_FLOOR_DB, the bin has no meaningful content and
   * we return feedbackScore = 0 to prevent false-positive detections on
   * silent frequency bands (a silent flat history has second derivative = 0
   * which previously gave feedbackScore = exp(0) = 1.0).
   *
   * FLAW 3 FIX: threshold is now 0.1 (paper-correct) not 0.8. The exponential
   * mapping exp(-msd/0.1) now correctly maps:
   *   feedback (msd ~ 0)    → score ~ 1.0
   *   music    (msd ~ 1–20) → score ~ 0 (exp(-10) ≈ 0)
   */
  calculateMSD(binIndex: number, minFrames: number = MSD_CONSTANTS.MIN_FRAMES_SPEECH): MSDResult {
    const history = this.getBinHistory(binIndex)

    if (history.length < minFrames) {
      return {
        msd: Infinity,
        feedbackScore: 0,
        secondDerivative: 0,
        isFeedbackLikely: false,
        framesAnalyzed: history.length,
        meanMagnitudeDb: -Infinity,
      }
    }

    // Energy gate: compute mean magnitude over the history window.
    const meanMagnitudeDb = history.reduce((a, b) => a + b, 0) / history.length
    if (meanMagnitudeDb < MSD_CONSTANTS.SILENCE_FLOOR_DB) {
      // Silent bin — return zero score, do not flag as feedback.
      return {
        msd: Infinity,
        feedbackScore: 0,
        secondDerivative: 0,
        isFeedbackLikely: false,
        framesAnalyzed: history.length,
        meanMagnitudeDb,
      }
    }

    let sumSquaredSecondDeriv = 0
    let lastSecondDeriv = 0

    for (let n = 2; n < history.length; n++) {
      const secondDeriv = history[n] - 2 * history[n - 1] + history[n - 2]
      sumSquaredSecondDeriv += secondDeriv * secondDeriv
      lastSecondDeriv = secondDeriv
    }

    const numTerms = history.length - 2
    const msd = numTerms > 0 ? sumSquaredSecondDeriv / numTerms : Infinity

    const feedbackScore = Math.exp(-msd / MSD_CONSTANTS.THRESHOLD)
    const isFeedbackLikely = msd < MSD_CONSTANTS.THRESHOLD

    return {
      msd,
      feedbackScore,
      secondDerivative: lastSecondDeriv,
      isFeedbackLikely,
      framesAnalyzed: history.length,
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

// ============================================================================
// PHASE COHERENCE ANALYSIS
// KU Leuven 2025 / Nyquist stability criterion
// ============================================================================

/**
 * Phase history buffer for coherence analysis.
 *
 * Stores raw phase angle φ_k per bin per frame (radians, from atan2).
 * calculateCoherence() then computes frame-to-frame phase differences
 * internally and returns |mean phasor| as the coherence metric.
 *
 * Q1 answer: we store raw phase (not Δφ) so coherence measures carrier
 * phase stability — the correct discriminant for sustained feedback tones.
 */
export class PhaseHistoryBuffer {
  private history: Float32Array[]
  private frameIndex: number = 0
  private frameCount: number = 0
  private maxFrames: number

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
  }

  getBinHistory(binIndex: number): number[] {
    const result: number[] = []
    const start = (this.frameIndex - this.frameCount + this.maxFrames) % this.maxFrames
    for (let i = 0; i < this.frameCount; i++) {
      const frameIdx = (start + i) % this.maxFrames
      result.push(this.history[frameIdx][binIndex])
    }
    return result
  }

  /**
   * Phase coherence = |mean phasor of frame-to-frame phase differences|.
   *
   * Formula (KU Leuven 2025, Eq. 4):
   *   coherence = | (1/N) * Σ exp(j * Δφ_n) |
   *
   * Feedback: Δφ_n is constant across frames → all phasors point the same
   *   direction → |mean| ≈ 1.
   * Music: Δφ_n varies randomly → phasors cancel → |mean| ≈ 0.
   */
  calculateCoherence(binIndex: number): PhaseCoherenceResult {
    const history = this.getBinHistory(binIndex)

    if (history.length < PHASE_CONSTANTS.MIN_SAMPLES) {
      return {
        coherence: 0,
        feedbackScore: 0,
        meanPhaseDelta: 0,
        phaseDeltaStd: 0,
        isFeedbackLikely: false,
      }
    }

    // Frame-to-frame phase differences (unwrapped to [-π, π])
    const phaseDeltas: number[] = []
    for (let i = 1; i < history.length; i++) {
      let delta = history[i] - history[i - 1]
      while (delta > Math.PI)  delta -= 2 * Math.PI
      while (delta < -Math.PI) delta += 2 * Math.PI
      phaseDeltas.push(delta)
    }

    const meanPhaseDelta = phaseDeltas.reduce((a, b) => a + b, 0) / phaseDeltas.length
    const variance = phaseDeltas.reduce((sum, d) => sum + Math.pow(d - meanPhaseDelta, 2), 0) / phaseDeltas.length
    const phaseDeltaStd = Math.sqrt(variance)

    // Mean phasor magnitude
    let realSum = 0
    let imagSum = 0
    for (const delta of phaseDeltas) {
      realSum += Math.cos(delta)
      imagSum += Math.sin(delta)
    }
    realSum /= phaseDeltas.length
    imagSum /= phaseDeltas.length
    const coherence = Math.sqrt(realSum * realSum + imagSum * imagSum)

    return {
      coherence,
      feedbackScore: coherence,
      meanPhaseDelta,
      phaseDeltaStd,
      isFeedbackLikely: coherence >= PHASE_CONSTANTS.HIGH_COHERENCE,
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

// ============================================================================
// SPECTRAL FLATNESS + KURTOSIS
// ============================================================================

export function calculateSpectralFlatness(
  spectrum: Float32Array,
  peakBin: number,
  bandwidth?: number
): SpectralFlatnessResult {
  const bw = bandwidth ?? 5
  const startBin = Math.max(0, peakBin - bw)
  const endBin   = Math.min(spectrum.length - 1, peakBin + bw)
  const region: number[] = []

  for (let i = startBin; i <= endBin; i++) {
    const linear = Math.pow(10, spectrum[i] / 10)
    if (linear > 0) region.push(linear)
  }

  if (region.length === 0) {
    return { flatness: 1, kurtosis: 0, feedbackScore: 0, isFeedbackLikely: false }
  }

  const logSum        = region.reduce((sum, x) => sum + Math.log(x), 0)
  const geometricMean = Math.exp(logSum / region.length)
  const arithmeticMean = region.reduce((a, b) => a + b, 0) / region.length
  const flatness      = arithmeticMean > 0 ? geometricMean / arithmeticMean : 1

  const mean    = arithmeticMean
  const m2      = region.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / region.length
  const m4      = region.reduce((sum, x) => sum + Math.pow(x - mean, 4), 0) / region.length
  const kurtosis = m2 > 0 ? m4 / (m2 * m2) - 3 : 0

  const flatnessScore  = 1 - Math.min(flatness / SPECTRAL_CONSTANTS.MUSIC_FLATNESS, 1)
  const kurtosisScore  = Math.min(Math.max(kurtosis, 0) / SPECTRAL_CONSTANTS.HIGH_KURTOSIS, 1)
  const feedbackScore  = flatnessScore * 0.6 + kurtosisScore * 0.4
  const isFeedbackLikely = flatness < SPECTRAL_CONSTANTS.PURE_TONE_FLATNESS &&
                           kurtosis > SPECTRAL_CONSTANTS.HIGH_KURTOSIS / 2

  return { flatness, kurtosis, feedbackScore, isFeedbackLikely }
}

// ============================================================================
// COMB FILTER PATTERN DETECTION — DBX paper
// ============================================================================

/**
 * Detect comb filter pattern from multiple peak frequencies.
 *
 * FLAW 4 FIX: Path length formula corrected.
 *
 * OLD (wrong): d = c / (2 * Δf)   — formula for closed-tube standing wave
 * NEW (correct): d = c / Δf        — formula for open acoustic feedback path
 *
 * Physical basis (DBX paper, eq. 1): the round-trip loop delay is τ = d/c
 * seconds.  Constructive interference (feedback) occurs at all f where
 * the loop phase shift is a multiple of 2π:
 *   f_n = n / τ = n * c / d
 * So the comb spacing is Δf = c / d  →  d = c / Δf.
 */
export function detectCombPattern(
  peakFrequencies: number[],
  sampleRate: number = 48000
): CombPatternResult {
  if (peakFrequencies.length < COMB_CONSTANTS.MIN_PEAKS_FOR_PATTERN) {
    return {
      hasPattern: false,
      fundamentalSpacing: null,
      estimatedPathLength: null,
      matchingPeaks: 0,
      predictedFrequencies: [],
      confidence: 0,
    }
  }

  const sorted = [...peakFrequencies].sort((a, b) => a - b)
  const differences: { diff: number; count: number }[] = []

  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const diff = sorted[j] - sorted[i]

      for (let k = 1; k <= 8; k++) {
        const fundamental = diff / k
        if (fundamental < 20 || fundamental > sampleRate / 4) continue

        const existing = differences.find(
          d => Math.abs(d.diff - fundamental) / fundamental < COMB_CONSTANTS.SPACING_TOLERANCE
        )
        if (existing) {
          existing.count++
        } else {
          differences.push({ diff: fundamental, count: 1 })
        }
      }
    }
  }

  if (differences.length === 0) {
    return {
      hasPattern: false,
      fundamentalSpacing: null,
      estimatedPathLength: null,
      matchingPeaks: 0,
      predictedFrequencies: [],
      confidence: 0,
    }
  }

  differences.sort((a, b) => b.count - a.count)
  const bestSpacing = differences[0]
  const tolerance   = bestSpacing.diff * COMB_CONSTANTS.SPACING_TOLERANCE

  let matchingPeaks = 0
  for (const freq of sorted) {
    const nearestHarmonic = Math.round(freq / bestSpacing.diff)
    const expectedFreq    = nearestHarmonic * bestSpacing.diff
    if (Math.abs(freq - expectedFreq) <= tolerance) matchingPeaks++
  }

  // FLAW 4 FIX: open round-trip path → d = c / Δf
  const estimatedPathLength = COMB_CONSTANTS.SPEED_OF_SOUND / bestSpacing.diff

  if (estimatedPathLength > COMB_CONSTANTS.MAX_PATH_LENGTH || estimatedPathLength < 0.1) {
    return {
      hasPattern: false,
      fundamentalSpacing: bestSpacing.diff,
      estimatedPathLength,
      matchingPeaks,
      predictedFrequencies: [],
      confidence: 0,
    }
  }

  const maxFreq = Math.min(sampleRate / 2, 20000)
  const predictedFrequencies: number[] = []
  for (let n = 1; n <= 20; n++) {
    const predicted = n * bestSpacing.diff
    if (predicted > maxFreq) break
    const alreadyDetected = sorted.some(f => Math.abs(f - predicted) < tolerance)
    if (!alreadyDetected) predictedFrequencies.push(predicted)
  }

  const confidence = Math.min(matchingPeaks / sorted.length, 1) *
                     Math.min(matchingPeaks / COMB_CONSTANTS.MIN_PEAKS_FOR_PATTERN, 1)

  return {
    hasPattern: matchingPeaks >= COMB_CONSTANTS.MIN_PEAKS_FOR_PATTERN,
    fundamentalSpacing: bestSpacing.diff,
    estimatedPathLength,
    matchingPeaks,
    predictedFrequencies: predictedFrequencies.slice(0, 5),
    confidence,
  }
}

// ============================================================================
// COMPRESSION DETECTION
// AmplitudeHistoryBuffer v3 — typed circular buffer, no dynamic array growth
// ============================================================================

/**
 * AmplitudeHistoryBuffer v3.
 *
 * Uses Float64Array circular buffers (writePos + count) to avoid the
 * push/shift allocation pattern that caused the stale Turbopack parse error
 * in v1. Peak and RMS are stored separately for true dynamic range measurement.
 */
export class AmplitudeHistoryBuffer {
  private readonly peakHistory: Float64Array
  private readonly rmsHistory: Float64Array
  private writePos: number = 0
  private count: number = 0
  private readonly maxSize: number

  constructor(maxSize: number = 100) {
    this.maxSize     = maxSize
    this.peakHistory = new Float64Array(maxSize)
    this.rmsHistory  = new Float64Array(maxSize)
  }

  addSample(peakDb: number, rmsDb: number): void {
    this.peakHistory[this.writePos] = peakDb
    this.rmsHistory[this.writePos]  = rmsDb
    this.writePos = (this.writePos + 1) % this.maxSize
    if (this.count < this.maxSize) this.count++
  }

  detectCompression(): CompressionResult {
    if (this.count < 10) {
      return {
        isCompressed: false,
        estimatedRatio: 1,
        crestFactor: COMPRESSION_CONSTANTS.NORMAL_CREST_FACTOR,
        dynamicRange: COMPRESSION_CONSTANTS.MIN_DYNAMIC_RANGE,
        thresholdMultiplier: 1,
      }
    }

    let maxPeak  = -Infinity
    let minRms   =  Infinity
    let crestSum = 0

    for (let i = 0; i < this.count; i++) {
      const p = this.peakHistory[i]
      const r = this.rmsHistory[i]
      if (p > maxPeak) maxPeak = p
      if (r < minRms)  minRms  = r
      crestSum += (p - r)
    }

    const dynamicRange   = maxPeak - minRms
    const crestFactor    = crestSum / this.count
    const normalCrest    = COMPRESSION_CONSTANTS.NORMAL_CREST_FACTOR
    const estimatedRatio = normalCrest / Math.max(crestFactor, 1)

    const isCompressed =
      crestFactor  < COMPRESSION_CONSTANTS.COMPRESSED_CREST_FACTOR ||
      dynamicRange < COMPRESSION_CONSTANTS.COMPRESSED_DYNAMIC_RANGE

    const thresholdMultiplier = isCompressed
      ? Math.min(1 + (estimatedRatio - 1) * 0.25, 1.5)
      : 1

    return { isCompressed, estimatedRatio, crestFactor, dynamicRange, thresholdMultiplier }
  }

  reset(): void {
    this.writePos = 0
    this.count    = 0
    this.peakHistory.fill(0)
    this.rmsHistory.fill(0)
  }
}

// ============================================================================
// INTER-HARMONIC RATIO ANALYSIS
// Distinguishes feedback (single or evenly-spaced tones) from musical content
// (rich harmonic series with characteristic amplitude decay).
// ============================================================================

export interface InterHarmonicResult {
  /** Ratio of energy between harmonics vs at harmonics (0 = clean, 1 = noisy) */
  interHarmonicRatio: number
  /** Whether the harmonic pattern suggests feedback (clean, evenly-spaced) */
  isFeedbackLike: boolean
  /** Whether the harmonic pattern suggests music (rich, decaying harmonics) */
  isMusicLike: boolean
  /** Number of harmonics detected */
  harmonicsFound: number
  /** Feedback score contribution (0-1) */
  feedbackScore: number
}

/**
 * Analyze inter-harmonic energy distribution to distinguish feedback from music.
 *
 * Musical instruments produce harmonics with characteristic amplitude decay
 * (roughly -6 dB/octave for most) and significant inter-harmonic energy from
 * formants, noise, and resonances. Feedback produces a clean tone (or evenly
 * spaced comb) with very little energy between harmonics.
 *
 * The inter-harmonic ratio (IHR) measures the energy between expected harmonic
 * peaks relative to the energy at those peaks. Low IHR = feedback, high IHR = music.
 *
 * @param spectrum - Magnitude spectrum (dB)
 * @param fundamentalBin - Bin index of the suspected fundamental
 * @param sampleRate - Audio sample rate
 * @param fftSize - FFT size
 */
export function analyzeInterHarmonicRatio(
  spectrum: Float32Array,
  fundamentalBin: number,
  sampleRate: number,
  fftSize: number
): InterHarmonicResult {
  const maxBin = spectrum.length - 1
  const nyquistBin = Math.floor(maxBin * 0.95) // Stay below Nyquist

  if (fundamentalBin <= 0 || fundamentalBin >= nyquistBin) {
    return { interHarmonicRatio: 0.5, isFeedbackLike: false, isMusicLike: false, harmonicsFound: 0, feedbackScore: 0 }
  }

  // Look for harmonics at 2f, 3f, 4f, ... up to 8th
  const maxHarmonic = 8
  let harmonicEnergy = 0
  let interHarmonicEnergy = 0
  let harmonicsFound = 0
  const halfBinWidth = Math.max(1, Math.round(fundamentalBin * 0.02)) // ±2% tolerance in bins

  for (let k = 1; k <= maxHarmonic; k++) {
    const expectedBin = Math.round(fundamentalBin * k)
    if (expectedBin >= nyquistBin) break

    // Sum energy at harmonic (±tolerance)
    let hPeak = -Infinity
    for (let b = Math.max(0, expectedBin - halfBinWidth); b <= Math.min(maxBin, expectedBin + halfBinWidth); b++) {
      if (spectrum[b] > hPeak) hPeak = spectrum[b]
    }
    // Convert dB to linear power for summing
    const hPower = Math.pow(10, hPeak / 10)
    harmonicEnergy += hPower
    if (hPeak > -80) harmonicsFound++

    // Sum inter-harmonic energy (midpoint between k-th and (k+1)-th harmonic)
    if (k < maxHarmonic) {
      const midBin = Math.round(fundamentalBin * (k + 0.5))
      if (midBin < nyquistBin) {
        let ihPeak = -Infinity
        for (let b = Math.max(0, midBin - halfBinWidth); b <= Math.min(maxBin, midBin + halfBinWidth); b++) {
          if (spectrum[b] > ihPeak) ihPeak = spectrum[b]
        }
        interHarmonicEnergy += Math.pow(10, ihPeak / 10)
      }
    }
  }

  // Compute ratio
  const ihr = harmonicEnergy > 0 ? interHarmonicEnergy / harmonicEnergy : 0.5

  // Feedback: IHR < 0.15 (very clean tone, almost no inter-harmonic energy)
  // Music: IHR > 0.35 (rich inter-harmonic content from formants, noise, etc.)
  const isFeedbackLike = ihr < 0.15 && harmonicsFound <= 2
  const isMusicLike = ihr > 0.35 && harmonicsFound >= 3

  // Score: low IHR + few harmonics → feedback-like
  let feedbackScore = 0
  if (harmonicsFound <= 1) {
    feedbackScore = Math.max(0, 1 - ihr * 5) // Single peak = strong feedback indicator
  } else if (harmonicsFound <= 2) {
    feedbackScore = Math.max(0, 0.7 - ihr * 3)
  } else {
    feedbackScore = Math.max(0, 0.3 - ihr) // Many harmonics = probably music
  }

  return {
    interHarmonicRatio: ihr,
    isFeedbackLike,
    isMusicLike,
    harmonicsFound,
    feedbackScore: Math.min(feedbackScore, 1),
  }
}

// ============================================================================
// PEAK-TO-MEDIAN RATIO (PTMR)
// Measures how much a spectral peak exceeds the local median level.
// Feedback peaks are extremely narrow and tall relative to surroundings.
// ============================================================================

export interface PTMRResult {
  /** Peak-to-median ratio in dB */
  ptmrDb: number
  /** Whether PTMR exceeds the feedback threshold */
  isFeedbackLike: boolean
  /** Feedback score contribution (0-1) */
  feedbackScore: number
}

/**
 * Calculate peak-to-median ratio (PTMR) for a spectral peak.
 *
 * Instead of using the neighborhood mean (which is pulled up by the peak
 * itself), use the MEDIAN of a wider neighborhood. This is more robust
 * to the peak's own influence and gives a cleaner measure of how much
 * the peak exceeds the local spectral floor.
 *
 * Feedback peaks typically have PTMR > 15 dB. Musical content has
 * PTMR < 10 dB due to broader spectral energy distribution.
 *
 * @param spectrum - Magnitude spectrum (dB)
 * @param peakBin - Bin index of the peak
 * @param halfWidth - Half-width of the analysis window in bins
 */
export function calculatePTMR(
  spectrum: Float32Array,
  peakBin: number,
  halfWidth: number = 20
): PTMRResult {
  const n = spectrum.length
  const start = Math.max(0, peakBin - halfWidth)
  const end = Math.min(n - 1, peakBin + halfWidth)

  // Collect neighborhood values EXCLUDING the peak ±2 bins
  const values: number[] = []
  for (let i = start; i <= end; i++) {
    if (Math.abs(i - peakBin) > 2) {
      values.push(spectrum[i])
    }
  }

  if (values.length < 4) {
    return { ptmrDb: 0, isFeedbackLike: false, feedbackScore: 0 }
  }

  // Sort for median
  values.sort((a, b) => a - b)
  const mid = values.length >> 1
  const median = (values.length & 1)
    ? values[mid]
    : (values[mid - 1] + values[mid]) / 2

  const ptmrDb = spectrum[peakBin] - median

  // Thresholds: >20 dB = almost certainly feedback, <8 dB = probably not
  const isFeedbackLike = ptmrDb > 15
  const feedbackScore = Math.min(Math.max((ptmrDb - 8) / 15, 0), 1)

  return { ptmrDb, isFeedbackLike, feedbackScore }
}

// ============================================================================
// ALGORITHM FUSION ENGINE
// ============================================================================

// Re-export from canonical source so existing imports from advancedDetection still work
export type { AlgorithmMode, ContentType } from '@/types/advisory'

export interface FusionConfig {
  mode: AlgorithmMode
  customWeights?: Partial<typeof FUSION_WEIGHTS.DEFAULT>
  msdMinFrames: number
  phaseThreshold: number
  enableCompressionDetection: boolean
  feedbackThreshold: number
}

export const DEFAULT_FUSION_CONFIG: FusionConfig = {
  mode: 'combined',
  msdMinFrames: MSD_CONSTANTS.MIN_FRAMES_SPEECH,
  phaseThreshold: PHASE_CONSTANTS.HIGH_COHERENCE,
  enableCompressionDetection: true,
  feedbackThreshold: 0.65,
}

/**
 * Fuse multiple algorithm results into a unified detection score.
 *
 * FLAW 6 FIX: Comb weight normalization.
 * OLD: weightedSum += score * weights.comb * 2  but  totalWeight += weights.comb
 *   → feedbackProbability could exceed 1.0.
 * NEW: When a comb pattern is detected the weight applied to BOTH the numerator
 *   AND denominator is doubled (weights.comb * 2), so the probability stays in
 *   [0, 1] while still giving comb patterns extra influence.
 */
export function fuseAlgorithmResults(
  scores: AlgorithmScores,
  contentType: ContentType = 'unknown',
  existingScore: number = 0.5,
  config: FusionConfig = DEFAULT_FUSION_CONFIG
): FusedDetectionResult {
  const reasons: string[] = []
  const contributingAlgorithms: string[] = []

  let weights: { msd: number; phase: number; spectral: number; comb: number; ihr: number; ptmr: number; existing: number }
  if (scores.compression?.isCompressed) {
    weights = { ...FUSION_WEIGHTS.COMPRESSED }
    reasons.push(`Compression detected (ratio ~${scores.compression.estimatedRatio.toFixed(1)}:1)`)
  } else if (contentType === 'speech') {
    weights = { ...FUSION_WEIGHTS.SPEECH }
  } else if (contentType === 'music') {
    weights = { ...FUSION_WEIGHTS.MUSIC }
  } else {
    weights = { ...FUSION_WEIGHTS.DEFAULT }
  }

  if (config.customWeights) {
    weights = { ...weights, ...config.customWeights }
  }

  let activeAlgorithms = ['msd', 'phase', 'spectral', 'comb', 'ihr', 'ptmr', 'existing']
  switch (config.mode) {
    case 'msd':
      activeAlgorithms = ['msd', 'ihr', 'ptmr', 'existing']
      break
    case 'phase':
      activeAlgorithms = ['phase', 'ihr', 'ptmr', 'existing']
      break
    case 'combined':
      activeAlgorithms = ['msd', 'phase', 'ihr', 'ptmr', 'existing']
      break
    case 'all':
      activeAlgorithms = ['msd', 'phase', 'spectral', 'comb', 'ihr', 'ptmr', 'existing']
      break
    case 'auto':
      if (scores.msd && scores.msd.framesAnalyzed >= config.msdMinFrames) {
        activeAlgorithms = ['msd', 'phase', 'spectral', 'comb', 'ihr', 'ptmr', 'existing']
      } else {
        activeAlgorithms = ['phase', 'spectral', 'comb', 'ihr', 'ptmr', 'existing']
      }
      break
  }

  let weightedSum  = 0
  let totalWeight  = 0

  if (activeAlgorithms.includes('msd') && scores.msd) {
    weightedSum += scores.msd.feedbackScore * weights.msd
    totalWeight += weights.msd
    contributingAlgorithms.push('MSD')
    if (scores.msd.isFeedbackLikely) {
      reasons.push(`MSD indicates feedback (${scores.msd.msd.toFixed(3)} dB/frame\u00b2)`)
    }
  }

  if (activeAlgorithms.includes('phase') && scores.phase) {
    weightedSum += scores.phase.feedbackScore * weights.phase
    totalWeight += weights.phase
    contributingAlgorithms.push('Phase')
    if (scores.phase.isFeedbackLikely) {
      reasons.push(`High phase coherence (${(scores.phase.coherence * 100).toFixed(0)}%)`)
    }
  }

  if (activeAlgorithms.includes('spectral') && scores.spectral) {
    weightedSum += scores.spectral.feedbackScore * weights.spectral
    totalWeight += weights.spectral
    contributingAlgorithms.push('Spectral')
    if (scores.spectral.isFeedbackLikely) {
      reasons.push(`Pure tone detected (flatness ${scores.spectral.flatness.toFixed(3)})`)
    }
  }

  // FLAW 6 FIX: when comb pattern is detected, double both numerator AND
  // denominator weight so feedbackProbability stays in [0, 1].
  if (activeAlgorithms.includes('comb') && scores.comb && scores.comb.hasPattern) {
    const combWeight = weights.comb * 2
    weightedSum += scores.comb.confidence * combWeight
    totalWeight += combWeight
    contributingAlgorithms.push('Comb')
    reasons.push(
      `Comb pattern: ${scores.comb.matchingPeaks} peaks, ` +
      `${scores.comb.fundamentalSpacing?.toFixed(0)} Hz spacing` +
      (scores.comb.estimatedPathLength != null
        ? ` (path ~${scores.comb.estimatedPathLength.toFixed(1)} m)`
        : '')
    )
  }

  // Inter-harmonic ratio: low IHR = clean tone (feedback), high IHR = rich harmonics (music)
  if (activeAlgorithms.includes('ihr') && scores.ihr) {
    weightedSum += scores.ihr.feedbackScore * weights.ihr
    totalWeight += weights.ihr
    contributingAlgorithms.push('IHR')
    if (scores.ihr.isFeedbackLike) {
      reasons.push(`Clean tone (IHR ${scores.ihr.interHarmonicRatio.toFixed(2)}, ${scores.ihr.harmonicsFound} harmonics)`)
    } else if (scores.ihr.isMusicLike) {
      reasons.push(`Rich harmonics suggest music (IHR ${scores.ihr.interHarmonicRatio.toFixed(2)})`)
    }
  }

  // Peak-to-median ratio: high PTMR = sharp spectral spike (feedback)
  if (activeAlgorithms.includes('ptmr') && scores.ptmr) {
    weightedSum += scores.ptmr.feedbackScore * weights.ptmr
    totalWeight += weights.ptmr
    contributingAlgorithms.push('PTMR')
    if (scores.ptmr.isFeedbackLike) {
      reasons.push(`Sharp spectral peak (PTMR ${scores.ptmr.ptmrDb.toFixed(1)} dB)`)
    }
  }

  if (activeAlgorithms.includes('existing')) {
    weightedSum += existingScore * weights.existing
    totalWeight += weights.existing
    contributingAlgorithms.push('Legacy')
  }

  const feedbackProbability = totalWeight > 0
    ? Math.min(weightedSum / totalWeight, 1)  // safety clamp
    : 0

  const algorithmScoresList = [
    scores.msd?.feedbackScore,
    scores.phase?.feedbackScore,
    scores.spectral?.feedbackScore,
    scores.ihr?.feedbackScore,
    scores.ptmr?.feedbackScore,
    existingScore,
  ].filter((s): s is number => s !== undefined && s !== null)

  const mean     = algorithmScoresList.reduce((a, b) => a + b, 0) / algorithmScoresList.length
  const variance = algorithmScoresList.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / algorithmScoresList.length
  const agreement = 1 - Math.sqrt(variance)
  const confidence = agreement * feedbackProbability + (1 - agreement) * 0.5

  let verdict: FusedDetectionResult['verdict']
  if (feedbackProbability >= config.feedbackThreshold && confidence >= 0.6) {
    verdict = 'FEEDBACK'
  } else if (feedbackProbability >= config.feedbackThreshold * 0.7 && confidence >= 0.4) {
    verdict = 'POSSIBLE_FEEDBACK'
  } else if (feedbackProbability < 0.3 && confidence >= 0.6) {
    verdict = 'NOT_FEEDBACK'
  } else {
    verdict = 'UNCERTAIN'
  }

  return {
    feedbackProbability,
    confidence,
    contributingAlgorithms,
    algorithmScores: scores,
    verdict,
    reasons,
  }
}

// ============================================================================
// MINDS ALGORITHM — DAFx-16 (MSD-Inspired Notch Depth Setting)
// ============================================================================

export interface MINDSResult {
  suggestedDepthDb: number
  isGrowing: boolean
  recentGradient: number
  confidence: number
  recommendation: string
}

/**
 * MINDS: MSD-Inspired Notch Depth Setting (DAFx-16).
 *
 * Strategy: start with a shallow notch (-3 dB), monitor whether the feedback
 * magnitude is still growing, and deepen 1 dB at a time until growth stops.
 */
export function calculateMINDS(
  magnitudeHistory: number[],
  currentDepthDb: number = 0,
  framesPerSecond: number = 50
): MINDSResult {
  const minFrames = 3

  if (magnitudeHistory.length < minFrames) {
    return {
      suggestedDepthDb: -3,
      isGrowing: false,
      recentGradient: 0,
      confidence: 0.3,
      recommendation: 'Not enough data yet - try -3 dB notch',
    }
  }

  const n = magnitudeHistory.length
  const gradients: number[] = []
  for (let i = 1; i < n; i++) {
    gradients.push(magnitudeHistory[i] - magnitudeHistory[i - 1])
  }

  const lastGradient  = gradients[gradients.length - 1] || 0
  const prevGradient  = gradients[gradients.length - 2] || 0
  const recentGrads   = gradients.slice(-3)
  const recentGradient = recentGrads.reduce((a, b) => a + b, 0) / recentGrads.length

  const isGrowing = lastGradient > 0.1 && prevGradient > 0.1

  const totalGrowth    = magnitudeHistory[n - 1] - magnitudeHistory[0]
  const durationSec    = n / framesPerSecond
  const growthRateDbPerSec = durationSec > 0 ? totalGrowth / durationSec : 0

  let suggestedDepthDb: number
  let confidence: number
  let recommendation: string

  if (isGrowing) {
    const baseDepth = Math.abs(currentDepthDb) || 3

    if (growthRateDbPerSec > 6) {
      suggestedDepthDb = -Math.min(baseDepth + 6, 18)
      confidence = 0.9
      recommendation = `URGENT: Runaway feedback (${growthRateDbPerSec.toFixed(1)} dB/s) - apply ${suggestedDepthDb} dB notch immediately`
    } else if (growthRateDbPerSec > 3) {
      suggestedDepthDb = -Math.min(baseDepth + 3, 15)
      confidence = 0.85
      recommendation = `Growing feedback (${growthRateDbPerSec.toFixed(1)} dB/s) - suggest ${suggestedDepthDb} dB notch`
    } else if (growthRateDbPerSec > 1) {
      suggestedDepthDb = -Math.min(baseDepth + 2, 12)
      confidence = 0.75
      recommendation = `Slow growth detected - suggest ${suggestedDepthDb} dB notch`
    } else {
      suggestedDepthDb = -Math.min(baseDepth + 1, 9)
      confidence = 0.6
      recommendation = `Minor growth - try ${suggestedDepthDb} dB notch`
    }
  } else {
    if (totalGrowth > 6) {
      suggestedDepthDb = currentDepthDb || -6
      confidence = 0.7
      recommendation = `Level stable at high gain - maintain ${suggestedDepthDb} dB notch`
    } else if (totalGrowth > 3) {
      suggestedDepthDb = currentDepthDb || -4
      confidence = 0.6
      recommendation = `Moderate resonance - suggest ${suggestedDepthDb} dB notch`
    } else {
      suggestedDepthDb = -3
      confidence = 0.5
      recommendation = `Light resonance - try ${suggestedDepthDb} dB notch`
    }
  }

  return { suggestedDepthDb, isGrowing, recentGradient, confidence, recommendation }
}

// ============================================================================
// CONTENT TYPE DETECTION
// ============================================================================

export function detectContentType(
  spectrum: Float32Array,
  crestFactor: number,
  spectralFlatness: number
): ContentType {
  // Very low crest factor → heavy brick-wall compression
  if (crestFactor < COMPRESSION_CONSTANTS.COMPRESSED_CREST_FACTOR) {
    return 'compressed'
  }

  // Very low spectral flatness → pure tone (feedback, sine wave, pitched instrument).
  // Previously this fell into the speech branch (flatness < 0.1 && crestFactor > 8)
  // causing feedback to be mis-weighted. Return 'unknown' so all algorithms are
  // equally weighted and the MSD + phase coherence can make the final call.
  if (spectralFlatness < 0.05) {
    return 'unknown'
  }

  // High spectral flatness → broadband music or noise
  if (spectralFlatness > 0.2) {
    return 'music'
  }

  // Mid flatness (0.05-0.2) with high crest factor → speech
  if (crestFactor > 8) {
    return 'speech'
  }

  // Compute spectral centroid and rolloff from the spectrum
  let totalPower = 0
  let weightedSum = 0
  for (let i = 0; i < spectrum.length; i++) {
    const power = spectrum[i] * spectrum[i]
    totalPower += power
    weightedSum += i * power
  }
  const centroidNormalized = totalPower > 0 ? weightedSum / totalPower / spectrum.length : 0

  const rolloffThreshold = totalPower * 0.85
  let cumulative = 0
  let rolloffBin = spectrum.length - 1
  for (let i = 0; i < spectrum.length; i++) {
    cumulative += spectrum[i] * spectrum[i]
    if (cumulative >= rolloffThreshold) {
      rolloffBin = i
      break
    }
  }
  const rolloffNormalized = rolloffBin / spectrum.length

  // Score each content type using a weighted feature vector
  // Speech: low centroid (<0.15), low rolloff (<0.2), moderate crest (8-14), low flatness (<0.12)
  // Music: moderate centroid (0.1-0.3), moderate rolloff (0.15-0.4), varied crest, higher flatness
  // Compressed: any centroid/rolloff, low crest (<6)
  let speechScore = 0
  let musicScore = 0

  // Centroid analysis
  if (centroidNormalized < 0.12) speechScore += 0.3
  else if (centroidNormalized < 0.20) speechScore += 0.15
  if (centroidNormalized > 0.15) musicScore += 0.2

  // Roll-off analysis
  if (rolloffNormalized < 0.18) speechScore += 0.25
  else if (rolloffNormalized < 0.25) speechScore += 0.1
  if (rolloffNormalized > 0.25) musicScore += 0.2

  // Crest factor
  if (crestFactor > 10) speechScore += 0.2
  else if (crestFactor > 8) speechScore += 0.1
  if (crestFactor < 10 && crestFactor > 4) musicScore += 0.15

  // Spectral flatness
  if (spectralFlatness < 0.08) speechScore += 0.25
  else if (spectralFlatness < 0.15) speechScore += 0.1
  if (spectralFlatness > 0.15) musicScore += 0.25
  if (spectralFlatness > 0.3) musicScore += 0.2

  // Decision
  if (speechScore > musicScore && speechScore > 0.4) return 'speech'
  if (musicScore > speechScore && musicScore > 0.4) return 'music'

  return 'unknown'
}
