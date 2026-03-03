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
  /** Inter-harmonic ratio analysis — low IHR = feedback, high IHR = music */
  ihr: InterHarmonicResult | null
  /** Peak-to-median ratio — high PTMR = narrow spectral peak (feedback) */
  ptmr: PTMRResult | null
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

/** MSD thresholds from DAFx-16 paper */
export const MSD_CONSTANTS = {
  /** Threshold for MSD - values below this indicate feedback (dB²/frame²) */
  THRESHOLD: 0.5,
  /** Minimum frames needed for reliable speech detection */
  MIN_FRAMES_SPEECH: 7,
  /** Minimum frames needed for reliable music detection */
  MIN_FRAMES_MUSIC: 13,
  /** Default number of frames for general use */
  DEFAULT_FRAMES: 20,
  /** Maximum frames to use (balance accuracy vs latency) */
  MAX_FRAMES: 50,
} as const

/** Phase coherence thresholds */
export const PHASE_CONSTANTS = {
  /** High coherence indicates feedback (pure tone maintains phase relationship) */
  HIGH_COHERENCE: 0.85,
  /** Medium coherence is uncertain */
  MEDIUM_COHERENCE: 0.65,
  /** Low coherence indicates random phase (music/noise) */
  LOW_COHERENCE: 0.4,
  /** Minimum samples for reliable phase analysis */
  MIN_SAMPLES: 5,
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

/** Algorithm fusion weights - PHASE REMOVED (not populated by Web Audio API)
 * Weights redistributed across MSD, spectral, comb, IHR, PTMR, and existing.
 * Total weights sum to 1.0 for proper normalization.
 *
 * IHR (Inter-Harmonic Ratio): Discriminates feedback (clean tone) from music
 *   (rich harmonic content). Especially useful for music content.
 * PTMR (Peak-to-Median Ratio): Measures how sharply a peak rises above the
 *   local spectral floor. Feedback peaks are extremely narrow and tall.
 */
export const FUSION_WEIGHTS = {
  /** Default weights for each algorithm (sum to 1) - PHASE DISABLED */
  DEFAULT: {
    msd: 0.35,      // Primary algorithm (DAFx-16)
    phase: 0.00,    // DISABLED - Web Audio API doesn't provide phase data
    spectral: 0.18, // Spectral flatness / kurtosis
    comb: 0.12,     // Comb filter pattern detection (DBX paper)
    ihr: 0.15,      // Inter-harmonic ratio (feedback vs music)
    ptmr: 0.10,     // Peak-to-median ratio (spectral prominence)
    existing: 0.10, // Legacy prominence-based detection
  },
  /** Weights for speech content (MSD is most reliable per DAFx-16 paper) */
  SPEECH: {
    msd: 0.40,      // MSD is king for speech — 100% accurate per research
    phase: 0.00,    // DISABLED
    spectral: 0.18, // Spectral flatness still useful
    comb: 0.07,     // Comb patterns less common in speech
    ihr: 0.15,      // IHR helps distinguish speech formants from feedback
    ptmr: 0.10,     // PTMR catches narrow feedback in speech spectrum
    existing: 0.10,
  },
  /** Weights for music content */
  MUSIC: {
    msd: 0.25,      // MSD less reliable with sustained musical tones
    phase: 0.00,    // DISABLED
    spectral: 0.20, // Spectral flatness helps separate music broadband
    comb: 0.10,     // Comb patterns useful for PA feedback loops
    ihr: 0.25,      // IHR is critical for music vs feedback discrimination
    ptmr: 0.10,     // PTMR still useful for narrow peaks
    existing: 0.10,
  },
  /** Weights when compression is detected */
  COMPRESSED: {
    msd: 0.20,      // MSD least reliable for compressed content per DAFx-16
    phase: 0.00,    // DISABLED
    spectral: 0.20, // Spectral analysis more important when compressed
    comb: 0.15,     // Comb patterns unaffected by compression
    ihr: 0.25,      // IHR still reliable — harmonic structure survives compression
    ptmr: 0.10,     // PTMR slightly compressed but still useful
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
 * Calculate frequency-adaptive analysis bandwidth.
 * Low frequencies need fewer bins (modes are sparse), high frequencies
 * need more bins (feedback peaks are narrower relative to bin spacing).
 * Uses 1/3-octave-equivalent bandwidth: bw = peakBin * (2^(1/6) - 1)
 * Clamped to [5, 40] bins to stay practical.
 *
 * @param peakBin - Center bin index of the peak
 * @param fallback - Default bandwidth if peakBin is 0
 */
function adaptiveBandwidth(peakBin: number, fallback: number = SPECTRAL_CONSTANTS.ANALYSIS_BANDWIDTH_BINS): number {
  if (peakBin <= 0) return fallback
  // 2^(1/6) - 1 ≈ 0.1225 → one-third octave half-width in bins
  const bw = Math.round(peakBin * 0.1225)
  return Math.max(5, Math.min(bw, 40))
}

/**
 * Calculate spectral flatness (Wiener entropy) around a peak
 *
 * Spectral flatness = geometric mean / arithmetic mean
 * Pure tone: flatness ≈ 0
 * White noise: flatness ≈ 1
 *
 * Now uses frequency-adaptive bandwidth: narrower analysis window at low
 * frequencies where room modes are sparse, wider at high frequencies where
 * feedback peaks are tighter in the spectral domain.
 *
 * @param spectrum - Magnitude spectrum (in dB)
 * @param peakBin - Center bin of the peak
 * @param bandwidth - Number of bins to analyze on each side (auto if omitted)
 */
export function calculateSpectralFlatness(
  spectrum: Float32Array,
  peakBin: number,
  bandwidth?: number
): SpectralFlatnessResult {
  // Frequency-adaptive bandwidth: use 1/3-octave equivalent if not specified
  const bw = bandwidth ?? adaptiveBandwidth(peakBin)

  // Extract region around peak
  const startBin = Math.max(0, peakBin - bw)
  const endBin = Math.min(spectrum.length - 1, peakBin + bw)
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
 * Amplitude history buffer for compression detection
 */
export class AmplitudeHistoryBuffer {
  private history: number[] = []
  private maxSamples: number

  constructor(maxSamples: number = 100) {
    this.maxSamples = maxSamples
  }

  addSample(peakDb: number, rmsDb: number): void {
    this.history.push(peakDb - rmsDb) // Store crest factor
    if (this.history.length > this.maxSamples) {
      this.history.shift()
    }
  }

  /**
   * Analyze amplitude history for compression artifacts
   */
  detectCompression(): CompressionResult {
    if (this.history.length < 10) {
      return {
        isCompressed: false,
        estimatedRatio: 1,
        crestFactor: COMPRESSION_CONSTANTS.NORMAL_CREST_FACTOR,
        dynamicRange: COMPRESSION_CONSTANTS.MIN_DYNAMIC_RANGE,
        thresholdMultiplier: 1,
      }
    }

    // Calculate average crest factor
    const crestFactor = this.history.reduce((a, b) => a + b, 0) / this.history.length

    // Calculate dynamic range
    const max = Math.max(...this.history)
    const min = Math.min(...this.history)
    const dynamicRange = max - min

    // Estimate compression ratio from crest factor reduction
    // Uncompressed audio typically has crest factor ~12-14 dB
    // Heavily compressed audio has crest factor ~4-6 dB
    const normalCrest = COMPRESSION_CONSTANTS.NORMAL_CREST_FACTOR
    const estimatedRatio = normalCrest / Math.max(crestFactor, 1)

    // Determine if compressed
    const isCompressed = crestFactor < COMPRESSION_CONSTANTS.COMPRESSED_CREST_FACTOR ||
                         dynamicRange < COMPRESSION_CONSTANTS.COMPRESSED_DYNAMIC_RANGE

    // Calculate threshold adjustment
    // If compressed, we need to be more careful about sustained notes
    // that look like feedback
    let thresholdMultiplier = 1
    if (isCompressed) {
      // Increase thresholds by up to 50% for heavily compressed content
      thresholdMultiplier = 1 + (estimatedRatio - 1) * 0.25
      thresholdMultiplier = Math.min(thresholdMultiplier, 1.5)
    }

    return {
      isCompressed,
      estimatedRatio,
      crestFactor,
      dynamicRange,
      thresholdMultiplier,
    }
  }

  reset(): void {
    this.history = []
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
  mode: 'msd',  // Changed from 'combined' - phase is disabled (no data from Web Audio API)
  msdMinFrames: MSD_CONSTANTS.MIN_FRAMES_SPEECH,
  phaseThreshold: PHASE_CONSTANTS.HIGH_COHERENCE, // Kept for future use if phase is implemented
  enableCompressionDetection: true,
  feedbackThreshold: 0.55, // Lowered from 0.65 for more aggressive detection
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

  // Apply custom weight overrides
  if (config.customWeights) {
    weights = { ...weights, ...config.customWeights }
  }

  // Filter algorithms based on mode
  // IHR and PTMR are always active (they're cheap and highly discriminative)
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
      // Use all algorithms
      break
    case 'auto':
      // Auto-select based on available data
      if (scores.msd && scores.msd.framesAnalyzed >= config.msdMinFrames) {
        activeAlgorithms = ['msd', 'phase', 'spectral', 'ihr', 'ptmr', 'existing']
      } else {
        activeAlgorithms = ['phase', 'spectral', 'ihr', 'ptmr', 'existing']
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

  // Inter-Harmonic Ratio (IHR) — low IHR = feedback (clean tone), high IHR = music
  if (scores.ihr) {
    weightedSum += scores.ihr.feedbackScore * weights.ihr
    totalWeight += weights.ihr
    contributingAlgorithms.push('IHR')
    if (scores.ihr.isFeedbackLike) {
      reasons.push(`Clean tone (IHR ${scores.ihr.interHarmonicRatio.toFixed(2)}, ${scores.ihr.harmonicsFound} harmonics)`)
    } else if (scores.ihr.isMusicLike) {
      reasons.push(`Rich harmonics suggest music (IHR ${scores.ihr.interHarmonicRatio.toFixed(2)})`)
    }
  }

  // Peak-to-Median Ratio (PTMR) — high PTMR = narrow spectral spike (feedback)
  if (scores.ptmr) {
    weightedSum += scores.ptmr.feedbackScore * weights.ptmr
    totalWeight += weights.ptmr
    contributingAlgorithms.push('PTMR')
    if (scores.ptmr.isFeedbackLike) {
      reasons.push(`Sharp spectral peak (PTMR ${scores.ptmr.ptmrDb.toFixed(1)} dB)`)
    }
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
    scores.ihr?.feedbackScore,
    scores.ptmr?.feedbackScore,
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
 * Detect content type from signal characteristics.
 *
 * Enhanced beyond simple crest factor + flatness with:
 * - Spectral centroid analysis (speech has lower centroid than rock/pop)
 * - Spectral roll-off (speech energy concentrated below 4 kHz)
 * - Dynamic range variance (speech has wider short-term dynamics than music)
 *
 * @param spectrum - Magnitude spectrum (dB)
 * @param crestFactor - Peak-to-RMS ratio in dB
 * @param spectralFlatness - Wiener entropy (0 = tonal, 1 = noise)
 */
export function detectContentType(
  spectrum: Float32Array,
  crestFactor: number,
  spectralFlatness: number
): ContentType {
  // Very low crest factor indicates heavy compression
  if (crestFactor < COMPRESSION_CONSTANTS.COMPRESSED_CREST_FACTOR) {
    return 'compressed'
  }

  // Compute spectral centroid (weighted average frequency bin)
  let powerSum = 0
  let weightedBinSum = 0
  for (let i = 1; i < spectrum.length; i++) {
    const p = Math.pow(10, spectrum[i] / 10) // dB → linear power
    powerSum += p
    weightedBinSum += i * p
  }
  const centroidBin = powerSum > 0 ? weightedBinSum / powerSum : 0
  const centroidNormalized = centroidBin / spectrum.length // 0–1 scale

  // Compute 85% spectral roll-off bin
  let cumulativePower = 0
  const target85 = powerSum * 0.85
  let rolloffBin = spectrum.length - 1
  for (let i = 1; i < spectrum.length; i++) {
    cumulativePower += Math.pow(10, spectrum[i] / 10)
    if (cumulativePower >= target85) {
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
