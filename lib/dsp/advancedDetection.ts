/**
 * Advanced Feedback Detection Algorithms
 * 
 * Based on academic research:
 * 1. DAFx-16 Paper: Magnitude Slope Deviation (MSD) Algorithm
 * 2. DBX Paper: Comb Filter Pattern Detection
 * 3. KU Leuven 2025: Phase Coherence Analysis
 * 4. Carl Hopkins "Sound Insulation": Modal Analysis
 * 
 * These algorithms work together to dramatically reduce false positives
 * and improve detection accuracy for professional live sound applications.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface MSDResult {
  /** Magnitude Slope Deviation value (low = likely feedback, high = likely music) */
  msd: number
  /** Normalized MSD score (0-1, higher = more likely feedback) */
  feedbackScore: number
  /** Second derivative of dB magnitude (should be near-zero for feedback) */
  secondDerivative: number
  /** Whether this passes the MSD threshold for feedback */
  isFeedbackLikely: boolean
  /** Number of frames used in analysis */
  framesAnalyzed: number
}

export interface PhaseCoherenceResult {
  /** Phase coherence value (0-1, higher = more stable phase = more likely feedback) */
  coherence: number
  /** Normalized phase score (0-1, higher = more likely feedback) */
  feedbackScore: number
  /** Average phase difference between consecutive frames */
  meanPhaseDelta: number
  /** Standard deviation of phase differences */
  phaseDeltaStd: number
  /** Whether this passes the phase coherence threshold for feedback */
  isFeedbackLikely: boolean
}

export interface SpectralFlatnessResult {
  /** Spectral flatness (Wiener entropy) around the peak (0-1, lower = more tonal) */
  flatness: number
  /** Kurtosis of the amplitude distribution (higher = more peaky) */
  kurtosis: number
  /** Normalized spectral score (0-1, higher = more likely feedback) */
  feedbackScore: number
  /** Whether this passes spectral thresholds for feedback */
  isFeedbackLikely: boolean
}

export interface CombPatternResult {
  /** Whether a comb filter pattern was detected */
  hasPattern: boolean
  /** Detected fundamental frequency spacing (Hz) */
  fundamentalSpacing: number | null
  /** Estimated acoustic path length (meters) */
  estimatedPathLength: number | null
  /** Number of peaks matching the pattern */
  matchingPeaks: number
  /** Predicted next feedback frequencies (Hz) */
  predictedFrequencies: number[]
  /** Confidence in the pattern detection (0-1) */
  confidence: number
}

export interface CompressionResult {
  /** Whether dynamic compression is detected */
  isCompressed: boolean
  /** Estimated compression ratio (1 = no compression, higher = more compressed) */
  estimatedRatio: number
  /** Crest factor (peak-to-RMS ratio in dB) */
  crestFactor: number
  /** Dynamic range over the analysis window (dB) */
  dynamicRange: number
  /** Recommended threshold adjustment factor (1 = no adjustment) */
  thresholdMultiplier: number
}

export interface AlgorithmScores {
  msd: MSDResult | null
  phase: PhaseCoherenceResult | null
  spectral: SpectralFlatnessResult | null
  comb: CombPatternResult | null
  compression: CompressionResult | null
}

export interface FusedDetectionResult {
  /** Combined feedback probability (0-1) */
  feedbackProbability: number
  /** Confidence in the detection (0-1) */
  confidence: number
  /** Which algorithms contributed to the decision */
  contributingAlgorithms: string[]
  /** Individual algorithm scores */
  algorithmScores: AlgorithmScores
  /** Detection verdict */
  verdict: 'FEEDBACK' | 'POSSIBLE_FEEDBACK' | 'NOT_FEEDBACK' | 'UNCERTAIN'
  /** Reasons for the verdict */
  reasons: string[]
}

// ============================================================================
// CONSTANTS (from research papers)
// ============================================================================

/** MSD thresholds from DAFx-16 paper - TUNED FOR FAST DETECTION */
export const MSD_CONSTANTS = {
  /** Threshold for MSD - values below this indicate feedback (dB²/frame²) 
   *  INCREASED from 0.5 to 0.8 for faster detection (accepts more false positives) */
  THRESHOLD: 0.8,
  /** Minimum frames needed for reliable speech detection (per paper: 7 = 100%) */
  MIN_FRAMES_SPEECH: 5, // FAST: Reduced from 7 for quicker response
  /** Minimum frames needed for reliable music detection */
  MIN_FRAMES_MUSIC: 10, // FAST: Reduced from 13
  /** Default number of frames for general use */
  DEFAULT_FRAMES: 7, // FAST: Reduced from 20
  /** Maximum frames to use (balance accuracy vs latency) */
  MAX_FRAMES: 30, // FAST: Reduced from 50
} as const

/** Phase coherence thresholds - TUNED FOR FAST DETECTION */
export const PHASE_CONSTANTS = {
  /** High coherence indicates feedback (pure tone maintains phase relationship)
   *  REDUCED from 0.85 for faster detection (accepts more false positives) */
  HIGH_COHERENCE: 0.70,
  /** Medium coherence is uncertain */
  MEDIUM_COHERENCE: 0.50,
  /** Low coherence indicates random phase (music/noise) */
  LOW_COHERENCE: 0.3,
  /** Minimum samples for reliable phase analysis - REDUCED for speed */
  MIN_SAMPLES: 3,
} as const

/** Spectral flatness thresholds */
export const SPECTRAL_CONSTANTS = {
  /** Pure tone has very low spectral flatness */
  PURE_TONE_FLATNESS: 0.05,
  /** Music has moderate spectral flatness */
  MUSIC_FLATNESS: 0.3,
  /** High kurtosis indicates a peaky distribution (feedback) */
  HIGH_KURTOSIS: 10,
  /** Bandwidth around peak to analyze (bins) */
  ANALYSIS_BANDWIDTH_BINS: 10,
} as const

/** Comb filter pattern detection */
export const COMB_CONSTANTS = {
  /** Speed of sound (m/s) for path length calculation */
  SPEED_OF_SOUND: 343,
  /** Minimum peaks needed to establish a pattern */
  MIN_PEAKS_FOR_PATTERN: 3,
  /** Tolerance for frequency spacing match (as fraction) */
  SPACING_TOLERANCE: 0.05,
  /** Maximum path length to consider (meters) */
  MAX_PATH_LENGTH: 50,
} as const

/** Compression detection thresholds */
export const COMPRESSION_CONSTANTS = {
  /** Normal crest factor for uncompressed audio (dB) */
  NORMAL_CREST_FACTOR: 12,
  /** Heavy compression crest factor (dB) */
  COMPRESSED_CREST_FACTOR: 6,
  /** Minimum dynamic range for detection (dB) */
  MIN_DYNAMIC_RANGE: 20,
  /** Compressed dynamic range (dB) */
  COMPRESSED_DYNAMIC_RANGE: 8,
  /** Analysis window (ms) */
  ANALYSIS_WINDOW_MS: 500,
} as const

/** Algorithm fusion weights */
export const FUSION_WEIGHTS = {
  /** Default weights for each algorithm (sum to 1) */
  DEFAULT: {
    msd: 0.35,
    phase: 0.30,
    spectral: 0.15,
    comb: 0.10,
    existing: 0.10,
  },
  /** Weights for speech content (MSD is most reliable) */
  SPEECH: {
    msd: 0.45,
    phase: 0.25,
    spectral: 0.15,
    comb: 0.05,
    existing: 0.10,
  },
  /** Weights for music content (phase is more reliable) */
  MUSIC: {
    msd: 0.20,
    phase: 0.40,
    spectral: 0.15,
    comb: 0.10,
    existing: 0.15,
  },
  /** Weights when compression is detected */
  COMPRESSED: {
    msd: 0.15,
    phase: 0.45,
    spectral: 0.20,
    comb: 0.10,
    existing: 0.10,
  },
} as const

// ============================================================================
// MAGNITUDE SLOPE DEVIATION (MSD) ALGORITHM
// From DAFx-16 Paper: "Automatic Detection of Audio Problems..."
// ============================================================================

/**
 * History buffer for MSD calculation
 * Stores dB magnitude history for each frequency bin
 */
export class MSDHistoryBuffer {
  private history: Float32Array[]
  private frameIndex: number = 0
  private frameCount: number = 0
  private maxFrames: number

  constructor(numBins: number, maxFrames: number = MSD_CONSTANTS.DEFAULT_FRAMES) {
    this.maxFrames = maxFrames
    this.history = []
    for (let i = 0; i < maxFrames; i++) {
      this.history.push(new Float32Array(numBins))
    }
  }

  /**
   * Add a new frame of magnitude data (in dB)
   */
  addFrame(magnitudeDb: Float32Array): void {
    const frame = this.history[this.frameIndex]
    for (let i = 0; i < magnitudeDb.length && i < frame.length; i++) {
      frame[i] = magnitudeDb[i]
    }
    this.frameIndex = (this.frameIndex + 1) % this.maxFrames
    this.frameCount = Math.min(this.frameCount + 1, this.maxFrames)
  }

  /**
   * Get magnitude at a specific bin across time
   * Returns array ordered from oldest to newest
   */
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
   * Calculate MSD for a specific frequency bin
   * 
   * The key insight from DAFx-16: Feedback grows exponentially in amplitude,
   * which is LINEAR in dB. Therefore, the second derivative of dB magnitude
   * over time is near-zero for feedback, but non-zero for music.
   * 
   * MSD = sum of squared second derivatives
   * Low MSD = likely feedback, High MSD = likely music
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
      }
    }

    // Calculate second derivative: G''(n) = G(n) - 2*G(n-1) + G(n-2)
    // This is the discrete approximation of the second derivative
    let sumSquaredSecondDeriv = 0
    let lastSecondDeriv = 0
    
    for (let n = 2; n < history.length; n++) {
      const secondDeriv = history[n] - 2 * history[n - 1] + history[n - 2]
      sumSquaredSecondDeriv += secondDeriv * secondDeriv
      lastSecondDeriv = secondDeriv
    }

    // Normalize by number of terms (Summing MSD from paper)
    const numTerms = history.length - 2
    const msd = numTerms > 0 ? sumSquaredSecondDeriv / numTerms : Infinity

    // Convert to feedback score (0-1, higher = more likely feedback)
    // Using exponential mapping: score = exp(-msd / threshold)
    const feedbackScore = Math.exp(-msd / MSD_CONSTANTS.THRESHOLD)

    // Threshold check
    const isFeedbackLikely = msd < MSD_CONSTANTS.THRESHOLD

    return {
      msd,
      feedbackScore,
      secondDerivative: lastSecondDeriv,
      isFeedbackLikely,
      framesAnalyzed: history.length,
    }
  }

  /**
   * Reset the buffer
   */
  reset(): void {
    this.frameIndex = 0
    this.frameCount = 0
    for (const frame of this.history) {
      frame.fill(0)
    }
  }

  /**
   * Get the number of frames currently in the buffer
   */
  getFrameCount(): number {
    return this.frameCount
  }
}

// ============================================================================
// PHASE COHERENCE ANALYSIS
// Based on Nyquist stability criterion and KU Leuven research
// ============================================================================

/**
 * History buffer for phase coherence calculation
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

  /**
   * Add a new frame of phase data (in radians)
   */
  addFrame(phaseRadians: Float32Array): void {
    const frame = this.history[this.frameIndex]
    for (let i = 0; i < phaseRadians.length && i < frame.length; i++) {
      frame[i] = phaseRadians[i]
    }
    this.frameIndex = (this.frameIndex + 1) % this.maxFrames
    this.frameCount = Math.min(this.frameCount + 1, this.maxFrames)
  }

  /**
   * Get phase history for a specific bin
   */
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
   * Calculate phase coherence for a specific frequency bin
   * 
   * Phase coherence measures how stable the phase relationship is over time.
   * Feedback maintains a constant phase relationship (coherence ≈ 1).
   * Music has random phase variations (coherence < 0.5).
   * 
   * Formula: coherence = |mean(exp(j * deltaPhase))|
   * This is the magnitude of the mean phasor of phase differences.
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

    // Calculate phase differences between consecutive frames
    const phaseDeltas: number[] = []
    for (let i = 1; i < history.length; i++) {
      // Unwrap phase difference to [-π, π]
      let delta = history[i] - history[i - 1]
      while (delta > Math.PI) delta -= 2 * Math.PI
      while (delta < -Math.PI) delta += 2 * Math.PI
      phaseDeltas.push(delta)
    }

    // Calculate mean phase delta
    const meanPhaseDelta = phaseDeltas.reduce((a, b) => a + b, 0) / phaseDeltas.length

    // Calculate standard deviation
    const variance = phaseDeltas.reduce((sum, d) => sum + Math.pow(d - meanPhaseDelta, 2), 0) / phaseDeltas.length
    const phaseDeltaStd = Math.sqrt(variance)

    // Calculate coherence as magnitude of mean phasor
    // coherence = |1/N * sum(exp(j * deltaPhase))|
    let realSum = 0
    let imagSum = 0
    for (const delta of phaseDeltas) {
      realSum += Math.cos(delta)
      imagSum += Math.sin(delta)
    }
    realSum /= phaseDeltas.length
    imagSum /= phaseDeltas.length
    const coherence = Math.sqrt(realSum * realSum + imagSum * imagSum)

    // Convert to feedback score
    // High coherence = high feedback probability
    const feedbackScore = coherence

    // Threshold check
    const isFeedbackLikely = coherence >= PHASE_CONSTANTS.HIGH_COHERENCE

    return {
      coherence,
      feedbackScore,
      meanPhaseDelta,
      phaseDeltaStd,
      isFeedbackLikely,
    }
  }

  /**
   * Reset the buffer
   */
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

/**
 * Calculate spectral flatness (Wiener entropy) around a peak
 * 
 * Spectral flatness = geometric mean / arithmetic mean
 * Pure tone: flatness ≈ 0
 * White noise: flatness ≈ 1
 * 
 * @param spectrum - Magnitude spectrum (linear, not dB)
 * @param peakBin - Center bin of the peak
 * @param bandwidth - Number of bins to analyze on each side
 */
export function calculateSpectralFlatness(
  spectrum: Float32Array,
  peakBin: number,
  bandwidth: number = SPECTRAL_CONSTANTS.ANALYSIS_BANDWIDTH_BINS
): SpectralFlatnessResult {
  // Extract region around peak
  const startBin = Math.max(0, peakBin - bandwidth)
  const endBin = Math.min(spectrum.length - 1, peakBin + bandwidth)
  const region: number[] = []

  for (let i = startBin; i <= endBin; i++) {
    // Convert from dB to linear power (avoid negative values)
    const linear = Math.pow(10, spectrum[i] / 10)
    if (linear > 0) region.push(linear)
  }

  if (region.length === 0) {
    return {
      flatness: 1,
      kurtosis: 0,
      feedbackScore: 0,
      isFeedbackLikely: false,
    }
  }

  // Geometric mean (use log-sum-exp for numerical stability)
  const logSum = region.reduce((sum, x) => sum + Math.log(x), 0)
  const geometricMean = Math.exp(logSum / region.length)

  // Arithmetic mean
  const arithmeticMean = region.reduce((a, b) => a + b, 0) / region.length

  // Spectral flatness
  const flatness = arithmeticMean > 0 ? geometricMean / arithmeticMean : 1

  // Calculate kurtosis
  // Kurtosis = E[(X-μ)⁴] / E[(X-μ)²]² - 3 (excess kurtosis)
  const mean = arithmeticMean
  const m2 = region.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / region.length
  const m4 = region.reduce((sum, x) => sum + Math.pow(x - mean, 4), 0) / region.length
  const kurtosis = m2 > 0 ? m4 / (m2 * m2) - 3 : 0

  // Calculate feedback score
  // Low flatness AND high kurtosis = pure tone = likely feedback
  const flatnessScore = 1 - Math.min(flatness / SPECTRAL_CONSTANTS.MUSIC_FLATNESS, 1)
  const kurtosisScore = Math.min(Math.max(kurtosis, 0) / SPECTRAL_CONSTANTS.HIGH_KURTOSIS, 1)
  const feedbackScore = (flatnessScore * 0.6 + kurtosisScore * 0.4)

  // Threshold check
  const isFeedbackLikely = flatness < SPECTRAL_CONSTANTS.PURE_TONE_FLATNESS && kurtosis > SPECTRAL_CONSTANTS.HIGH_KURTOSIS / 2

  return {
    flatness,
    kurtosis,
    feedbackScore,
    isFeedbackLikely,
  }
}

// ============================================================================
// COMB FILTER PATTERN DETECTION
// From DBX Feedback Prevention paper
// ============================================================================

/**
 * Detect comb filter pattern from multiple peak frequencies
 * 
 * Feedback occurs at frequencies where the round-trip delay causes
 * constructive interference. These frequencies are evenly spaced:
 * f_n = n * c / (2 * d)
 * 
 * Where:
 * - c = speed of sound (343 m/s)
 * - d = acoustic path length (microphone to speaker to microphone)
 * - n = harmonic number (1, 2, 3, ...)
 * 
 * @param peakFrequencies - Array of detected peak frequencies in Hz
 * @param sampleRate - Audio sample rate
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

  // Sort frequencies
  const sorted = [...peakFrequencies].sort((a, b) => a - b)

  // Calculate all pairwise frequency differences
  const differences: { diff: number; count: number }[] = []
  
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const diff = sorted[j] - sorted[i]
      
      // Look for GCD - differences that could be multiples of a fundamental
      for (let k = 1; k <= 8; k++) {
        const fundamental = diff / k
        if (fundamental < 20 || fundamental > sampleRate / 4) continue

        // Check if this fundamental explains other peaks
        const existing = differences.find(d => 
          Math.abs(d.diff - fundamental) / fundamental < COMB_CONSTANTS.SPACING_TOLERANCE
        )
        
        if (existing) {
          existing.count++
        } else {
          differences.push({ diff: fundamental, count: 1 })
        }
      }
    }
  }

  // Find the fundamental spacing with the most matches
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

  // Count how many peaks fit the pattern
  let matchingPeaks = 0
  const tolerance = bestSpacing.diff * COMB_CONSTANTS.SPACING_TOLERANCE

  for (const freq of sorted) {
    const harmonic = freq / bestSpacing.diff
    const nearestHarmonic = Math.round(harmonic)
    const expectedFreq = nearestHarmonic * bestSpacing.diff
    
    if (Math.abs(freq - expectedFreq) <= tolerance) {
      matchingPeaks++
    }
  }

  // Calculate estimated path length
  // f = c / (2 * d) => d = c / (2 * f)
  const estimatedPathLength = COMB_CONSTANTS.SPEED_OF_SOUND / (2 * bestSpacing.diff)

  // Validate path length is reasonable
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

  // Predict next feedback frequencies
  const maxFreq = Math.min(sampleRate / 2, 20000)
  const predictedFrequencies: number[] = []
  
  for (let n = 1; n <= 20; n++) {
    const predicted = n * bestSpacing.diff
    if (predicted > maxFreq) break
    
    // Only predict frequencies not already detected
    const alreadyDetected = sorted.some(f => Math.abs(f - predicted) < tolerance)
    if (!alreadyDetected) {
      predictedFrequencies.push(predicted)
    }
  }

  // Calculate confidence
  const confidence = Math.min(matchingPeaks / sorted.length, 1) * 
                     Math.min(matchingPeaks / COMB_CONSTANTS.MIN_PEAKS_FOR_PATTERN, 1)

  return {
    hasPattern: matchingPeaks >= COMB_CONSTANTS.MIN_PEAKS_FOR_PATTERN,
    fundamentalSpacing: bestSpacing.diff,
    estimatedPathLength,
    matchingPeaks,
    predictedFrequencies: predictedFrequencies.slice(0, 5), // Top 5 predictions
    confidence,
  }
}

// ============================================================================
// COMPRESSION DETECTION
// Detects dynamically compressed audio to adjust detection thresholds
// ============================================================================

/**
 * AmplitudeHistoryBuffer v2 — stores peak and RMS separately.
 *
 * True dynamic range = max(peak) - min(rms) over the analysis window.
 * Crest factor       = mean(peak - rms) per frame.
 *
 * Compressed content: low crest factor (< ~6 dB), narrow dynamic range.
 * Uncompressed speech/acoustic: crest factor 12-18 dB, dynamic range 20-40 dB.
 */
export class AmplitudeHistoryBuffer {
  private peakHistory: Float64Array
  private rmsHistory: Float64Array
  private writePos: number = 0
  private count: number = 0
  private readonly maxSize: number

  constructor(maxSize: number = 100) {
    this.maxSize = maxSize
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

    let maxPeak = -Infinity
    let minRms  =  Infinity
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
// ALGORITHM FUSION ENGINE
// Combines all algorithms into a unified detection score
// ============================================================================

export type AlgorithmMode = 'auto' | 'msd' | 'phase' | 'combined' | 'all'
export type ContentType = 'speech' | 'music' | 'compressed' | 'unknown'

export interface FusionConfig {
  /** Which algorithms to use */
  mode: AlgorithmMode
  /** Override weights (optional) */
  customWeights?: Partial<typeof FUSION_WEIGHTS.DEFAULT>
  /** Minimum frames for MSD analysis */
  msdMinFrames: number
  /** Phase coherence threshold */
  phaseThreshold: number
  /** Enable compression detection */
  enableCompressionDetection: boolean
  /** Feedback probability threshold for positive detection */
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
 * Fuse multiple algorithm results into a unified detection
 */
export function fuseAlgorithmResults(
  scores: AlgorithmScores,
  contentType: ContentType = 'unknown',
  existingScore: number = 0.5,
  config: FusionConfig = DEFAULT_FUSION_CONFIG
): FusedDetectionResult {
  const reasons: string[] = []
  const contributingAlgorithms: string[] = []

  // Select weights based on content type and compression
  let weights: typeof FUSION_WEIGHTS.DEFAULT
  if (scores.compression?.isCompressed) {
    weights = FUSION_WEIGHTS.COMPRESSED
    reasons.push(`Compression detected (ratio ~${scores.compression.estimatedRatio.toFixed(1)}:1)`)
  } else if (contentType === 'speech') {
    weights = FUSION_WEIGHTS.SPEECH
  } else if (contentType === 'music') {
    weights = FUSION_WEIGHTS.MUSIC
  } else {
    weights = FUSION_WEIGHTS.DEFAULT
  }

  // Apply custom weight overrides
  if (config.customWeights) {
    weights = { ...weights, ...config.customWeights }
  }

  // Filter algorithms based on mode
  let activeAlgorithms = ['msd', 'phase', 'spectral', 'comb', 'existing']
  switch (config.mode) {
    case 'msd':
      activeAlgorithms = ['msd', 'existing']
      break
    case 'phase':
      activeAlgorithms = ['phase', 'existing']
      break
    case 'combined':
      activeAlgorithms = ['msd', 'phase', 'existing']
      break
    case 'all':
      // Use all algorithms
      break
    case 'auto':
      // Auto-select based on available data
      if (scores.msd && scores.msd.framesAnalyzed >= config.msdMinFrames) {
        activeAlgorithms = ['msd', 'phase', 'spectral', 'existing']
      } else {
        activeAlgorithms = ['phase', 'spectral', 'existing']
      }
      break
  }

  // Calculate weighted sum
  let weightedSum = 0
  let totalWeight = 0

  // MSD
  if (activeAlgorithms.includes('msd') && scores.msd) {
    weightedSum += scores.msd.feedbackScore * weights.msd
    totalWeight += weights.msd
    contributingAlgorithms.push('MSD')
    if (scores.msd.isFeedbackLikely) {
      reasons.push(`MSD indicates feedback (${scores.msd.msd.toFixed(3)} dB²/frame²)`)
    }
  }

  // Phase
  if (activeAlgorithms.includes('phase') && scores.phase) {
    weightedSum += scores.phase.feedbackScore * weights.phase
    totalWeight += weights.phase
    contributingAlgorithms.push('Phase')
    if (scores.phase.isFeedbackLikely) {
      reasons.push(`High phase coherence (${(scores.phase.coherence * 100).toFixed(0)}%)`)
    }
  }

  // Spectral
  if (activeAlgorithms.includes('spectral') && scores.spectral) {
    weightedSum += scores.spectral.feedbackScore * weights.spectral
    totalWeight += weights.spectral
    contributingAlgorithms.push('Spectral')
    if (scores.spectral.isFeedbackLikely) {
      reasons.push(`Pure tone detected (flatness ${scores.spectral.flatness.toFixed(3)})`)
    }
  }

  // Comb pattern (bonus, doesn't reduce other weights)
  if (activeAlgorithms.includes('comb') && scores.comb && scores.comb.hasPattern) {
    // Comb pattern is a strong indicator, boost overall score
    weightedSum += scores.comb.confidence * weights.comb * 2 // Double weight when pattern found
    totalWeight += weights.comb
    contributingAlgorithms.push('Comb')
    reasons.push(`Comb pattern: ${scores.comb.matchingPeaks} peaks, ${scores.comb.fundamentalSpacing?.toFixed(0)}Hz spacing`)
  }

  // Existing algorithm score
  if (activeAlgorithms.includes('existing')) {
    weightedSum += existingScore * weights.existing
    totalWeight += weights.existing
    contributingAlgorithms.push('Legacy')
  }

  // Normalize
  const feedbackProbability = totalWeight > 0 ? weightedSum / totalWeight : 0

  // Calculate confidence based on algorithm agreement
  const algorithmScoresList = [
    scores.msd?.feedbackScore,
    scores.phase?.feedbackScore,
    scores.spectral?.feedbackScore,
    existingScore,
  ].filter((s): s is number => s !== undefined && s !== null)

  // Confidence is higher when algorithms agree
  const mean = algorithmScoresList.reduce((a, b) => a + b, 0) / algorithmScoresList.length
  const variance = algorithmScoresList.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / algorithmScoresList.length
  const agreement = 1 - Math.sqrt(variance) // Lower variance = higher agreement

  const confidence = agreement * feedbackProbability + (1 - agreement) * 0.5

  // Determine verdict
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

/**
 * Detect content type from signal characteristics
 */
// ============================================================================
// MINDS ALGORITHM (MSD-Inspired Notch Depth Setting)
// From DAFx-16 paper: dynamically calculate minimum notch filter depth
// ============================================================================

export interface MINDSResult {
  /** Suggested notch depth in dB (negative value) */
  suggestedDepthDb: number
  /** Whether the feedback is still growing */
  isGrowing: boolean
  /** Recent magnitude gradient (dB/frame) */
  recentGradient: number
  /** Confidence in the suggestion (0-1) */
  confidence: number
  /** Human-readable recommendation */
  recommendation: string
}

/**
 * MINDS: MSD-Inspired Notch Depth Setting
 * 
 * From DAFx-16 paper: "A suggested approach is to start with a shallow notch
 * and then widen or deepen it if the magnitude gradient indicates continued growth."
 * 
 * Algorithm:
 * 1. Monitor magnitude gradient over time
 * 2. If both recent gradients are positive (growing), increase notch depth by 1dB
 * 3. Stop when magnitude stops growing
 * 
 * @param magnitudeHistory - Recent magnitude values in dB (oldest to newest)
 * @param currentDepthDb - Current applied notch depth (negative)
 * @param framesPerSecond - Analysis frame rate for timing calculations
 */
export function calculateMINDS(
  magnitudeHistory: number[],
  currentDepthDb: number = 0,
  framesPerSecond: number = 50
): MINDSResult {
  const minFrames = 3
  
  if (magnitudeHistory.length < minFrames) {
    return {
      suggestedDepthDb: -3, // Start with a light cut
      isGrowing: false,
      recentGradient: 0,
      confidence: 0.3,
      recommendation: 'Not enough data yet - try -3dB notch',
    }
  }

  // Calculate recent gradients (first derivative)
  const n = magnitudeHistory.length
  const gradients: number[] = []
  for (let i = 1; i < n; i++) {
    gradients.push(magnitudeHistory[i] - magnitudeHistory[i - 1])
  }

  // Get last two gradients
  const lastGradient = gradients[gradients.length - 1] || 0
  const prevGradient = gradients[gradients.length - 2] || 0
  
  // Average recent gradient (last 3 frames)
  const recentGradients = gradients.slice(-3)
  const recentGradient = recentGradients.reduce((a, b) => a + b, 0) / recentGradients.length

  // Check if feedback is still growing (both recent gradients positive)
  const isGrowing = lastGradient > 0.1 && prevGradient > 0.1

  // Calculate total growth
  const totalGrowth = magnitudeHistory[n - 1] - magnitudeHistory[0]
  
  // Calculate growth rate in dB/second
  const durationSec = magnitudeHistory.length / framesPerSecond
  const growthRateDbPerSec = durationSec > 0 ? totalGrowth / durationSec : 0

  // Determine suggested notch depth based on growth behavior
  let suggestedDepthDb: number
  let confidence: number
  let recommendation: string

  if (isGrowing) {
    // Feedback is actively growing - need deeper cut
    // Rule from paper: if magnitude keeps rising, increase notch by 1dB
    const baseDepth = Math.abs(currentDepthDb) || 3
    
    if (growthRateDbPerSec > 6) {
      // Runaway feedback - aggressive cut needed
      suggestedDepthDb = -Math.min(baseDepth + 6, 18)
      confidence = 0.9
      recommendation = `URGENT: Runaway feedback (${growthRateDbPerSec.toFixed(1)} dB/s) - apply ${suggestedDepthDb}dB notch immediately`
    } else if (growthRateDbPerSec > 3) {
      // Fast growth
      suggestedDepthDb = -Math.min(baseDepth + 3, 15)
      confidence = 0.85
      recommendation = `Growing feedback (${growthRateDbPerSec.toFixed(1)} dB/s) - suggest ${suggestedDepthDb}dB notch`
    } else if (growthRateDbPerSec > 1) {
      // Moderate growth
      suggestedDepthDb = -Math.min(baseDepth + 2, 12)
      confidence = 0.75
      recommendation = `Slow growth detected - suggest ${suggestedDepthDb}dB notch`
    } else {
      // Very slow growth
      suggestedDepthDb = -Math.min(baseDepth + 1, 9)
      confidence = 0.6
      recommendation = `Minor growth - try ${suggestedDepthDb}dB notch`
    }
  } else {
    // Feedback is not growing (or magnitude is stable/decreasing)
    if (totalGrowth > 6) {
      // High level but stable - maintain current depth
      suggestedDepthDb = currentDepthDb || -6
      confidence = 0.7
      recommendation = `Level stable at high gain - maintain ${suggestedDepthDb}dB notch`
    } else if (totalGrowth > 3) {
      // Moderate level
      suggestedDepthDb = currentDepthDb || -4
      confidence = 0.6
      recommendation = `Moderate resonance - suggest ${suggestedDepthDb}dB notch`
    } else {
      // Low/decreasing level - can try lighter cut
      suggestedDepthDb = -3
      confidence = 0.5
      recommendation = `Light resonance - try ${suggestedDepthDb}dB notch`
    }
  }

  return {
    suggestedDepthDb,
    isGrowing,
    recentGradient,
    confidence,
    recommendation,
  }
}

export function detectContentType(
  spectrum: Float32Array,
  crestFactor: number,
  spectralFlatness: number
): ContentType {
  // ---- Very low crest factor → heavy brick-wall compression ----
  if (crestFactor < COMPRESSION_CONSTANTS.COMPRESSED_CREST_FACTOR) {
    return 'compressed'
  }

  // ---- Pure tone detection (active feedback or strong sine wave) ----
  // A sustained feedback tone has spectral flatness ≈ 0.01–0.04, meaning
  // a single dominant bin and very low energy everywhere else.
  // This is LOWER than speech (0.05–0.15) so the old code accidentally
  // classified feedback as 'speech'.  We now explicitly detect it as
  // 'unknown' (no extra compression penalty) so the MSD and phase
  // coherence algorithms handle it cleanly.
  if (spectralFlatness < 0.05) {
    // Could be feedback, a sine-wave test tone, or a very pitched instrument.
    // Return 'unknown' so the fusion engine weights all algorithms equally —
    // do NOT call this 'speech' which would over-weight MSD alone.
    return 'unknown'
  }

  // ---- High spectral flatness → broadband, music or noise ----
  if (spectralFlatness > 0.2) {
    // Optionally use zero-crossing rate from spectrum energy spread to distinguish
    // music from white noise, but 'music' weights are fine for both.
    return 'music'
  }

  // ---- Mid flatness (0.05–0.2) with high crest factor → speech ----
  // Speech has highly variable spectral shape (vowels/consonants) and
  // high peak-to-RMS ratio due to transient consonant bursts.
  if (crestFactor > 8) {
    return 'speech'
  }

  return 'unknown'
}
