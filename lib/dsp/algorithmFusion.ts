/**
 * Algorithm Fusion Engine
 *
 * Combines scores from MSD, Phase Coherence, Spectral Flatness, Comb Pattern,
 * Inter-Harmonic Ratio (IHR), and Peak-to-Median Ratio (PTMR) into a unified
 * feedback probability with confidence and verdict.
 *
 * Also contains: detectCombPattern (DBX paper), analyzeInterHarmonicRatio,
 * calculatePTMR, calculateMINDS (DAFx-16), and detectContentType.
 */

import type { AlgorithmMode, ContentType } from '@/types/advisory'
import { COMB_PATTERN_SETTINGS, COMPRESSION_SETTINGS, TEMPORAL_ENVELOPE } from './constants'
import type { MSDResult } from './msdAnalysis'
import { MSD_CONSTANTS } from './msdAnalysis'
import type { PhaseCoherenceResult } from './phaseCoherence'
import { PHASE_CONSTANTS } from './phaseCoherence'
import type { SpectralFlatnessResult, CompressionResult } from './compressionDetection'
import { COMPRESSION_CONSTANTS } from './compressionDetection'

// Re-export from canonical source so existing imports from advancedDetection still work
export type { AlgorithmMode, ContentType } from '@/types/advisory'

// ── Types ────────────────────────────────────────────────────────────────────

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

/** ML model score result — output of the 7th fusion algorithm */
export interface MLScoreResult {
  /** Probability that this peak is feedback [0, 1] */
  feedbackScore: number
  /** Model confidence / calibration quality [0, 1] */
  modelConfidence: number
  /** True if the model is loaded and produced this score */
  isAvailable: boolean
  /** Model version string for tracking */
  modelVersion: string
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
  /** ML meta-model FP filter — 7th fusion algorithm (null if model not loaded) */
  ml: MLScoreResult | null
}

export interface FusedDetectionResult {
  feedbackProbability: number
  confidence: number
  contributingAlgorithms: string[]
  algorithmScores: AlgorithmScores
  verdict: 'FEEDBACK' | 'POSSIBLE_FEEDBACK' | 'NOT_FEEDBACK' | 'UNCERTAIN'
  reasons: string[]
}

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

export interface PTMRResult {
  /** Peak-to-median ratio in dB */
  ptmrDb: number
  /** Whether PTMR exceeds the feedback threshold */
  isFeedbackLike: boolean
  /** Feedback score contribution (0-1) */
  feedbackScore: number
}

export interface FusionConfig {
  mode: AlgorithmMode
  enabledAlgorithms?: string[]
  customWeights?: Partial<typeof FUSION_WEIGHTS.DEFAULT>
  msdMinFrames: number
  phaseThreshold: number
  enableCompressionDetection: boolean
  feedbackThreshold: number
  /** When false, ML algorithm is excluded from all mode branches including Auto. */
  mlEnabled?: boolean
}

export interface MINDSResult {
  suggestedDepthDb: number
  isGrowing: boolean
  recentGradient: number
  confidence: number
  recommendation: string
}

// ── Constants ────────────────────────────────────────────────────────────────

export const COMB_CONSTANTS = {
  SPEED_OF_SOUND: COMB_PATTERN_SETTINGS.SPEED_OF_SOUND,
  MIN_PEAKS_FOR_PATTERN: COMB_PATTERN_SETTINGS.MIN_PEAKS,
  SPACING_TOLERANCE: COMB_PATTERN_SETTINGS.SPACING_TOLERANCE,
  MAX_PATH_LENGTH: COMB_PATTERN_SETTINGS.MAX_PATH_LENGTH,
} as const

/**
 * Temporal comb stability tracking — distinguishes static feedback loops
 * from sweeping time-based effects (flanger, phaser, chorus).
 *
 * Acoustic feedback creates a fixed comb pattern (constant path length d).
 * Flangers/phasers modulate delay time via LFO (typically 0.1–5 Hz),
 * causing fundamentalSpacing to drift across frames.
 *
 * Method: Track fundamentalSpacing over a sliding window, compute
 * coefficient of variation CV = σ/μ. Low CV (< threshold) = static = feedback.
 * High CV (> threshold) = sweeping = effect → suppress comb contribution.
 */
const COMB_STABILITY_WINDOW = 16       // Frames of history (~320ms at 50fps)
const COMB_STABILITY_CV_THRESHOLD = 0.05 // CV above this = sweeping effect
const COMB_SWEEP_PENALTY = 0.25        // Reduce comb confidence when sweeping

/** Maximum entries in the comb history cache (LRU eviction). */
const COMB_HISTORY_CACHE_MAX = 32
/** Time-to-live for cached comb history entries (5 seconds). */
const COMB_HISTORY_CACHE_TTL_MS = 5000

/**
 * Quantize a frequency to the nearest MIDI semitone bin.
 * Two frequencies within ~50 cents of each other map to the same bin.
 * Returns the MIDI note number (integer).
 */
function quantizeFreqToSemitone(hz: number): number {
  if (hz <= 0) return 0
  // MIDI note = 69 + 12 * log2(hz / 440)
  return Math.round(69 + 12 * Math.log2(hz / 440))
}

/** Cached comb spacing history for a recently-pruned track. */
interface CombHistoryEntry {
  spacings: number[]
  cachedAt: number   // Date.now() when entry was stored
  lastUsed: number   // Date.now() when entry was last accessed (LRU)
}

/**
 * Short-term cache for comb tracker history.
 *
 * When a track is pruned, its spacing history is saved here keyed by
 * quantized frequency (semitone bin). If a new track appears at a nearby
 * frequency within the TTL, the cached history warm-starts the new tracker
 * so it doesn't lose evidence of whether the comb pattern was stable or sweeping.
 *
 * Bounded at {@link COMB_HISTORY_CACHE_MAX} entries with LRU eviction.
 * Entries expire after {@link COMB_HISTORY_CACHE_TTL_MS}.
 */
export class CombHistoryCache {
  private _entries = new Map<number, CombHistoryEntry>()
  private _maxEntries: number
  private _ttlMs: number

  constructor(maxEntries = COMB_HISTORY_CACHE_MAX, ttlMs = COMB_HISTORY_CACHE_TTL_MS) {
    this._maxEntries = maxEntries
    this._ttlMs = ttlMs
  }

  /**
   * Save a tracker's spacing history before it is pruned.
   * @param frequencyHz The track's frequency in Hz.
   * @param spacings The spacing history array (will be copied).
   */
  save(frequencyHz: number, spacings: readonly number[]): void {
    if (spacings.length === 0) return

    const key = quantizeFreqToSemitone(frequencyHz)
    const now = Date.now()

    // Evict expired entries first
    this._evictExpired(now)

    // If at capacity and this key is new, evict LRU
    if (!this._entries.has(key) && this._entries.size >= this._maxEntries) {
      this._evictLRU()
    }

    this._entries.set(key, {
      spacings: spacings.slice(),
      cachedAt: now,
      lastUsed: now,
    })
  }

  /**
   * Look up cached history for a frequency. Returns the spacing array
   * if a non-expired entry exists within one semitone, or null.
   * Consumes (deletes) the entry on hit.
   */
  retrieve(frequencyHz: number): number[] | null {
    const key = quantizeFreqToSemitone(frequencyHz)
    const entry = this._entries.get(key)
    if (!entry) return null

    const now = Date.now()
    if (now - entry.cachedAt > this._ttlMs) {
      this._entries.delete(key)
      return null
    }

    // Consume on hit — one warm-start per cached entry
    this._entries.delete(key)
    return entry.spacings
  }

  /** Number of entries currently in the cache. */
  get size(): number {
    return this._entries.size
  }

  /** Clear all cached entries. */
  clear(): void {
    this._entries.clear()
  }

  /** Remove all entries older than TTL. */
  private _evictExpired(now: number): void {
    for (const [key, entry] of this._entries) {
      if (now - entry.cachedAt > this._ttlMs) {
        this._entries.delete(key)
      }
    }
  }

  /** Remove the least-recently-used entry. */
  private _evictLRU(): void {
    let oldestKey: number | null = null
    let oldestTime = Infinity
    for (const [key, entry] of this._entries) {
      if (entry.lastUsed < oldestTime) {
        oldestTime = entry.lastUsed
        oldestKey = key
      }
    }
    if (oldestKey !== null) this._entries.delete(oldestKey)
  }
}

export class CombStabilityTracker {
  private _history: number[] = []
  private _maxLen: number

  constructor(maxLen = COMB_STABILITY_WINDOW) {
    this._maxLen = maxLen
  }

  /** Push a new fundamentalSpacing observation. */
  push(spacing: number): void {
    this._history.push(spacing)
    if (this._history.length > this._maxLen) this._history.shift()
  }

  /** Clear history (e.g. on session reset). */
  reset(): void {
    this._history.length = 0
  }

  /** Number of observations collected so far. */
  get length(): number {
    return this._history.length
  }

  /** Read-only view of the current spacing history (for caching on prune). */
  get spacings(): readonly number[] {
    return this._history
  }

  /**
   * Warm-start this tracker with previously cached spacings.
   * Appended values are capped at maxLen. Existing history is preserved
   * (cached values are prepended).
   */
  warmStart(cachedSpacings: readonly number[]): void {
    // Prepend cached spacings, then cap at maxLen
    const merged = [...cachedSpacings, ...this._history]
    // Keep only the most recent maxLen entries
    this._history = merged.length > this._maxLen
      ? merged.slice(merged.length - this._maxLen)
      : merged
  }

  /**
   * Coefficient of variation of stored spacings.
   * Returns 0 when fewer than 4 samples (not enough data to judge).
   */
  get cv(): number {
    if (this._history.length < 4) return 0
    const n = this._history.length
    let sum = 0
    for (let i = 0; i < n; i++) sum += this._history[i]
    const mean = sum / n
    if (mean === 0) return 0
    let sumSq = 0
    for (let i = 0; i < n; i++) sumSq += (this._history[i] - mean) ** 2
    return Math.sqrt(sumSq / n) / mean
  }

  /** True when enough history exists and spacing is sweeping (effect, not feedback). */
  get isSweeping(): boolean {
    return this._history.length >= 4 && this.cv > COMB_STABILITY_CV_THRESHOLD
  }
}

// 14.8: Agreement persistence tracker (EWMA of single-frame agreement)
export class AgreementPersistenceTracker {
  private _ewma = 0
  private _alpha: number
  private _frames = 0
  constructor(alpha = 0.15) { this._alpha = alpha }
  update(agreement: number): void {
    this._frames++
    this._ewma = this._frames === 1 ? agreement : this._alpha * agreement + (1 - this._alpha) * this._ewma
  }
  get persistenceBonus(): number {
    return this._frames >= 4 && this._ewma > 0.6 ? Math.min((this._ewma - 0.6) * 0.15, 0.05) : 0
  }
  get ewma(): number { return this._ewma }
  get frames(): number { return this._frames }
  reset(): void { this._ewma = 0; this._frames = 0 }
}

// 14.3: Post-gate probability calibration types and function
export interface CalibrationBreakpoint { raw: number; calibrated: number }
export interface CalibrationTable { breakpoints: CalibrationBreakpoint[] }
export const IDENTITY_CALIBRATION: CalibrationTable = { breakpoints: [] }

export function calibrateProbability(raw: number, table?: CalibrationTable): number {
  if (!table || table.breakpoints.length === 0) return raw
  const bp = table.breakpoints
  if (raw <= bp[0].raw) return bp[0].calibrated
  if (raw >= bp[bp.length - 1].raw) return bp[bp.length - 1].calibrated
  for (let i = 0; i < bp.length - 1; i++) {
    if (raw >= bp[i].raw && raw <= bp[i + 1].raw) {
      const span = bp[i + 1].raw - bp[i].raw
      if (span === 0) return bp[i].calibrated
      const t = (raw - bp[i].raw) / span
      return bp[i].calibrated + t * (bp[i + 1].calibrated - bp[i].calibrated)
    }
  }
  return raw
}

/** Module-level fallback — only used when no per-track tracker is provided. */
const combStabilityTracker = new CombStabilityTracker()

/** Pre-allocated buffer for effective scores in fuseAlgorithmResults().
 *  Avoids per-call heap allocation (~500 calls/sec). Max 7 algorithms + 1 spare. */
const _effScores = new Float64Array(8)

// Three-model consensus (Claude+Gemini+ChatGPT): 'existing' was a legacy
// prominence metric that overlapped with spectral/MSD (double-counting).
// Removed entirely and redistributed to IHR (harmonic discrimination) and
// PTMR (peak shape) — the two novel algorithms measuring unique properties.
export const FUSION_WEIGHTS = {
  DEFAULT: {
    msd: 0.27,
    phase: 0.23,
    spectral: 0.11,
    comb: 0.07,
    ihr: 0.12,
    ptmr: 0.10,
    ml: 0.10,
  },
  // SPEECH MSD reduced from 0.40 to 0.33 (effective 42.1% → ~34.7%)
  // Three-model consensus: 0.40 caused false positives on sustained vowels.
  // Gemini: 'Ummmm' scored 0.710. ChatGPT: 'Wooooo!' scored 0.720.
  // Redistributed to phase (+0.04) and ptmr (+0.03) for better discrimination.
  // ML weight (~10%) redistributed proportionally from all existing algorithms.
  SPEECH: {
    msd: 0.30,
    phase: 0.22,
    spectral: 0.09,
    comb: 0.04,
    ihr: 0.09,
    ptmr: 0.16,
    ml: 0.10,
  },
  // MUSIC MSD reduced from 0.15 to 0.08. DAFx-16 paper reports 22% accuracy
  // on rock music. Giving MSD 15% of the vote means it's wrong 78% of the
  // time but still influencing 15% of the decision. At 0.08, it's a weak
  // corroborator, not a lead vote.
  MUSIC: {
    msd: 0.07,
    phase: 0.32,
    spectral: 0.09,
    comb: 0.07,
    ihr: 0.22,
    ptmr: 0.13,
    ml: 0.10,
  },
  // COMPRESSED phase reduced from 0.38 to 0.30 (effective 41.3% → ~33%)
  // Three-model consensus: single-feature conviction risk. Phase at 41.3%
  // effective could convict on Auto-Tuned vocals (ChatGPT) and
  // pitch-corrected worship content (Gemini).
  // Redistributed to spectral/ihr/ptmr for broader corroboration.
  COMPRESSED: {
    msd: 0.11,
    phase: 0.27,
    spectral: 0.16,
    comb: 0.07,
    ihr: 0.16,
    ptmr: 0.13,
    ml: 0.10,
  },
} as const

export const DEFAULT_FUSION_CONFIG: FusionConfig = {
  mode: 'combined',
  msdMinFrames: MSD_CONSTANTS.MIN_FRAMES_SPEECH,
  phaseThreshold: PHASE_CONSTANTS.HIGH_COHERENCE,
  enableCompressionDetection: true,
  feedbackThreshold: 0.60,
}

// ── Comb Filter Pattern Detection — DBX paper ────────────────────────────────

/**
 * Detect comb filter pattern from multiple peak frequencies.
 *
 * FLAW 4 FIX: Path length formula corrected.
 * Open round-trip: d = c / Δf (not c / 2Δf which is for closed tubes).
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
  const tol = COMB_CONSTANTS.SPACING_TOLERANCE
  const diffMap = new Map<number, { diff: number; count: number }>()
  const quantize = (f: number) => Math.round(f)

  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const diff = sorted[j] - sorted[i]

      for (let k = 1; k <= 8; k++) {
        const fundamental = diff / k
        if (fundamental < 20 || fundamental > sampleRate / 4) continue

        const key = quantize(fundamental)
        let matched = false
        for (let offset = -1; offset <= 1; offset++) {
          const entry = diffMap.get(key + offset)
          if (entry && Math.abs(entry.diff - fundamental) / fundamental < tol) {
            entry.count++
            matched = true
            break
          }
        }
        if (!matched) {
          diffMap.set(key, { diff: fundamental, count: 1 })
        }
      }
    }
  }

  if (diffMap.size === 0) {
    return {
      hasPattern: false,
      fundamentalSpacing: null,
      estimatedPathLength: null,
      matchingPeaks: 0,
      predictedFrequencies: [],
      confidence: 0,
    }
  }

  let bestSpacing = { diff: 0, count: 0 }
  for (const entry of diffMap.values()) {
    if (entry.count > bestSpacing.count) bestSpacing = entry
  }
  const tolerance = bestSpacing.diff * COMB_CONSTANTS.SPACING_TOLERANCE

  let matchingPeaks = 0
  for (const freq of sorted) {
    const nearestHarmonic = Math.round(freq / bestSpacing.diff)
    const expectedFreq    = nearestHarmonic * bestSpacing.diff
    if (Math.abs(freq - expectedFreq) <= tolerance) matchingPeaks++
  }

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

// ── Inter-Harmonic Ratio (IHR) ───────────────────────────────────────────────

/**
 * Analyze inter-harmonic energy distribution to distinguish feedback from music.
 * Low IHR = feedback (clean tone), high IHR = music (rich harmonics).
 */
export function analyzeInterHarmonicRatio(
  spectrum: Float32Array,
  fundamentalBin: number,
  sampleRate: number,
  fftSize: number
): InterHarmonicResult {
  const maxBin = spectrum.length - 1
  const nyquistBin = Math.floor(maxBin * 0.95)

  if (fundamentalBin <= 0 || fundamentalBin >= nyquistBin) {
    return { interHarmonicRatio: 0.5, isFeedbackLike: false, isMusicLike: false, harmonicsFound: 0, feedbackScore: 0 }
  }

  const maxHarmonic = 8
  let harmonicEnergy = 0
  let interHarmonicEnergy = 0
  let harmonicsFound = 0
  /** Maximum relative deviation for a peak to count as a validated harmonic.
   *  Matches the search window tolerance (2% of expected bin position). */
  const HARMONIC_VALIDATION_TOLERANCE = 0.02
  const halfBinWidth = Math.max(1, Math.round(fundamentalBin * HARMONIC_VALIDATION_TOLERANCE))

  for (let k = 1; k <= maxHarmonic; k++) {
    const expectedBin = Math.round(fundamentalBin * k)
    if (expectedBin >= nyquistBin) break

    let hPeak = -Infinity
    let hPeakBin = expectedBin
    for (let b = Math.max(0, expectedBin - halfBinWidth); b <= Math.min(maxBin, expectedBin + halfBinWidth); b++) {
      if (spectrum[b] > hPeak) {
        hPeak = spectrum[b]
        hPeakBin = b
      }
    }
    const hPower = Math.pow(10, hPeak / 10)
    harmonicEnergy += hPower

    // Validate: peak must be within tolerance of exact integer multiple of f0
    // to count toward the harmonic series. Coincidental near-harmonic peaks
    // that happen to fall in the search window but deviate from k*f0 are excluded.
    if (hPeak > -80) {
      const relDev = Math.abs(hPeakBin - fundamentalBin * k) / (fundamentalBin * k)
      if (relDev <= HARMONIC_VALIDATION_TOLERANCE) {
        harmonicsFound++
      }
    }

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

  const ihr = harmonicEnergy > 0 ? interHarmonicEnergy / harmonicEnergy : 0.5
  const isFeedbackLike = ihr < 0.15 && harmonicsFound <= 2
  const isMusicLike = ihr > 0.35 && harmonicsFound >= 3

  let feedbackScore = 0
  if (harmonicsFound <= 1) {
    feedbackScore = Math.max(0, 1 - ihr * 5)
  } else if (harmonicsFound <= 2) {
    feedbackScore = Math.max(0, 0.7 - ihr * 3)
  } else {
    feedbackScore = Math.max(0, 0.3 - ihr)
  }

  return {
    interHarmonicRatio: ihr,
    isFeedbackLike,
    isMusicLike,
    harmonicsFound,
    feedbackScore: Math.min(feedbackScore, 1),
  }
}

// ── Peak-to-Median Ratio (PTMR) ─────────────────────────────────────────────

/**
 * Calculate peak-to-median ratio for a spectral peak.
 * Feedback peaks have PTMR > 15 dB; music < 10 dB.
 */
export function calculatePTMR(
  spectrum: Float32Array,
  peakBin: number,
  halfWidth: number = 20
): PTMRResult {
  const n = spectrum.length
  const start = Math.max(0, peakBin - halfWidth)
  const end = Math.min(n - 1, peakBin + halfWidth)

  const values: number[] = []
  for (let i = start; i <= end; i++) {
    if (Math.abs(i - peakBin) > 2) {
      values.push(spectrum[i])
    }
  }

  if (values.length < 4) {
    return { ptmrDb: 0, isFeedbackLike: false, feedbackScore: 0 }
  }

  values.sort((a, b) => a - b)
  const mid = values.length >> 1
  const median = (values.length & 1)
    ? values[mid]
    : (values[mid - 1] + values[mid]) / 2

  const ptmrDb = spectrum[peakBin] - median
  const isFeedbackLike = ptmrDb > 15
  const feedbackScore = Math.min(Math.max((ptmrDb - 8) / 15, 0), 1)

  return { ptmrDb, isFeedbackLike, feedbackScore }
}

// ── Algorithm Fusion ─────────────────────────────────────────────────────────

/**
 * Fuse multiple algorithm results into a unified detection score.
 *
 * FLAW 6 FIX: When comb pattern detected, doubles both numerator AND
 * denominator weight so feedbackProbability stays in [0, 1].
 */
export function fuseAlgorithmResults(
  scores: AlgorithmScores,
  contentType: ContentType = 'unknown',
  config: FusionConfig = DEFAULT_FUSION_CONFIG,
  /** Peak frequency in Hz. When provided, enables frequency-aware scoring. */
  peakFrequencyHz?: number,
  /** Per-track comb stability tracker. Falls back to module-level singleton if not provided. */
  trackCombTracker?: CombStabilityTracker,
  /** Per-track agreement persistence tracker for confidence bonus. */
  agreementTracker?: AgreementPersistenceTracker,
  /** Optional calibration table for post-gate probability mapping. Default is identity. */
  calibrationTable?: CalibrationTable,
  /** Optional gate overrides from DiagnosticsProfile (expert-only). */
  gateOverrides?: { combSweepOverride?: number; ihrGateOverride?: number; ptmrGateOverride?: number },
): FusedDetectionResult {
  const reasons: string[] = []
  const contributingAlgorithms: string[] = []

  let weights: { msd: number; phase: number; spectral: number; comb: number; ihr: number; ptmr: number; ml: number }
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

  let activeAlgorithms = ['msd', 'phase', 'spectral', 'comb', 'ihr', 'ptmr', 'ml']
  switch (config.mode) {
    case 'msd':
      activeAlgorithms = ['msd', 'ihr', 'ptmr', 'ml']
      break
    case 'phase':
      activeAlgorithms = ['phase', 'ihr', 'ptmr', 'ml']
      break
    case 'combined':
      activeAlgorithms = ['msd', 'phase', 'spectral', 'comb', 'ihr', 'ptmr', 'ml']
      break
    case 'all':
      activeAlgorithms = ['msd', 'phase', 'spectral', 'comb', 'ihr', 'ptmr', 'ml']
      break
    case 'auto':
      if (scores.msd && scores.msd.framesAnalyzed >= config.msdMinFrames) {
        activeAlgorithms = ['msd', 'phase', 'spectral', 'comb', 'ihr', 'ptmr', 'ml']
      } else {
        activeAlgorithms = ['phase', 'spectral', 'comb', 'ihr', 'ptmr', 'ml']
      }
      break
    case 'custom':
      activeAlgorithms = config.enabledAlgorithms ?? ['msd', 'phase', 'spectral', 'comb', 'ihr', 'ptmr', 'ml']
      break
  }

  // Convert to Set for O(1) .has() instead of O(n) .includes() on each algorithm check.
  // Also handles mlEnabled filtering (replaces .filter(a => a !== 'ml')).
  const active = new Set(activeAlgorithms)
  if (config.mlEnabled === false) active.delete('ml')

  let weightedSum  = 0
  let totalWeight  = 0
  // F2 fix: collect effective (transformed) scores for agreement/confidence
  // Pre-allocated typed array avoids per-call heap allocation + GC pressure (~500 calls/sec)
  let effCount = 0

  if (active.has('msd') && scores.msd) {
    weightedSum += scores.msd.feedbackScore * weights.msd
    totalWeight += weights.msd
    _effScores[effCount++] = scores.msd.feedbackScore
    contributingAlgorithms.push('MSD')
    if (scores.msd.isFeedbackLikely) {
      reasons.push(`MSD indicates feedback (${scores.msd.msd.toFixed(3)} dB/frame\u00b2)`)
    }
  }

  if (active.has('phase') && scores.phase) {
    // Low-frequency phase suppression: below 200 Hz, FFT phase resolution
    // is too coarse for reliable coherence measurement (8 bins at 50 Hz).
    // Reduce phase influence by 50% to prevent phase noise from tanking
    // detection of low-frequency feedback. Source: Gemini deep-think.
    const phaseScore = (peakFrequencyHz !== undefined && peakFrequencyHz < 200)
      ? scores.phase.feedbackScore * 0.5
      : scores.phase.feedbackScore
    weightedSum += phaseScore * weights.phase
    totalWeight += weights.phase
    _effScores[effCount++] = phaseScore
    contributingAlgorithms.push('Phase')
    if (scores.phase.isFeedbackLikely) {
      reasons.push(`High phase coherence (${(scores.phase.coherence * 100).toFixed(0)}%)`)
    }
  }

  if (active.has('spectral') && scores.spectral) {
    weightedSum += scores.spectral.feedbackScore * weights.spectral
    totalWeight += weights.spectral
    _effScores[effCount++] = scores.spectral.feedbackScore
    contributingAlgorithms.push('Spectral')
    if (scores.spectral.isFeedbackLikely) {
      reasons.push(`Pure tone detected (flatness ${scores.spectral.flatness.toFixed(3)})`)
    }
  }

  // Comb doubling: when acoustic comb pattern detected, comb weight doubles
  // in the numerator only (e.g., 0.08 → 0.16 contribution to weightedSum).
  // Only the base weight is added to totalWeight so other algorithms are NOT
  // diluted. This gives comb a bonus boost without penalizing MSD/phase/etc.
  // See: ChatGPT-CTX finding #3, Gemini deep-think finding #6.
  //
  // Temporal comb stability: track fundamentalSpacing across frames.
  // Static spacing (low CV) = feedback loop. Sweeping spacing (high CV)
  // = flanger/phaser effect → reduce comb confidence to suppress FP.
  // Use per-track tracker when provided, fall back to module-level singleton.
  // Per-track trackers prevent cross-peak contamination when multiple peaks
  // have comb patterns in the same frame window.
  const cst = trackCombTracker ?? combStabilityTracker
  if (active.has('comb') && scores.comb && scores.comb.hasPattern) {
    // Feed spacing into temporal tracker
    if (scores.comb.fundamentalSpacing != null) {
      cst.push(scores.comb.fundamentalSpacing)
    }

    // Apply sweep penalty: if spacing is drifting, this is likely an effect
    const sweeping = cst.isSweeping
    const combConfidence = sweeping
      ? scores.comb.confidence * (gateOverrides?.combSweepOverride ?? COMB_SWEEP_PENALTY)
      : scores.comb.confidence

    const combWeight = weights.comb * 2
    weightedSum += combConfidence * combWeight
    totalWeight += weights.comb
    _effScores[effCount++] = combConfidence
    contributingAlgorithms.push('Comb')

    const cvStr = cst.length >= 4
      ? `, CV=${cst.cv.toFixed(3)}`
      : ''
    const sweepStr = sweeping ? ' [SWEEPING — effect suppressed]' : ''
    reasons.push(
      `Comb pattern: ${scores.comb.matchingPeaks} peaks, ` +
      `${scores.comb.fundamentalSpacing?.toFixed(0)} Hz spacing` +
      (scores.comb.estimatedPathLength != null
        ? ` (path ~${scores.comb.estimatedPathLength.toFixed(1)} m)`
        : '') +
      cvStr + sweepStr
    )
  } else {
    // No comb pattern this frame — reset tracker to avoid stale history
    // bleeding across unrelated peaks
    cst.reset()
  }

  if (active.has('ihr') && scores.ihr) {
    weightedSum += scores.ihr.feedbackScore * weights.ihr
    totalWeight += weights.ihr
    _effScores[effCount++] = scores.ihr.feedbackScore
    contributingAlgorithms.push('IHR')
    if (scores.ihr.isFeedbackLike) {
      reasons.push(`Clean tone (IHR ${scores.ihr.interHarmonicRatio.toFixed(2)}, ${scores.ihr.harmonicsFound} harmonics)`)
    } else if (scores.ihr.isMusicLike) {
      reasons.push(`Rich harmonics suggest music (IHR ${scores.ihr.interHarmonicRatio.toFixed(2)})`)
    }
  }

  if (active.has('ptmr') && scores.ptmr) {
    weightedSum += scores.ptmr.feedbackScore * weights.ptmr
    totalWeight += weights.ptmr
    _effScores[effCount++] = scores.ptmr.feedbackScore
    contributingAlgorithms.push('PTMR')
    if (scores.ptmr.isFeedbackLike) {
      reasons.push(`Sharp spectral peak (PTMR ${scores.ptmr.ptmrDb.toFixed(1)} dB)`)
    }
  }

  // ML meta-model: 7th algorithm for false positive reduction.
  // Only contributes when model is loaded and available (graceful degradation).
  if (active.has('ml') && scores.ml?.isAvailable) {
    weightedSum += scores.ml.feedbackScore * weights.ml
    totalWeight += weights.ml
    _effScores[effCount++] = scores.ml.feedbackScore
    contributingAlgorithms.push('ML')
    reasons.push(`ML: ${(scores.ml.feedbackScore * 100).toFixed(0)}% (${scores.ml.modelVersion})`)
  }

  let feedbackProbability = totalWeight > 0
    ? Math.min(weightedSum / totalWeight, 1)
    : 0

  // IHR penalty gate: rich harmonic content (>= 3 harmonics) reduces probability
  // by 35%. This converts IHR from a weak linear contributor to a discriminative
  // veto. Source: ChatGPT multiplicative gate proposal + Gemini deep-think.
  // Musical instruments have rich harmonic series; feedback is a singular tone.
  if (scores.ihr?.isMusicLike === true && (scores.ihr?.harmonicsFound ?? 0) >= 3) {
    feedbackProbability *= (gateOverrides?.ihrGateOverride ?? 0.65)
  }

  // PTMR breadth gate: very broad spectral peak (PTMR < 0.2) is unlikely to be
  // feedback. Reduces probability by 20% to penalize wide-spectrum energy.
  if ((scores.ptmr?.feedbackScore ?? 1) < 0.2) {
    feedbackProbability *= (gateOverrides?.ptmrGateOverride ?? 0.80)
  }

  // 14.3: Apply post-gate calibration (identity by default — zero behavior change)
  feedbackProbability = calibrateProbability(feedbackProbability, calibrationTable)

  // Agreement and confidence use effective scores (collected above) so that
  // active algorithm filtering, phase suppression, and comb sweep penalties
  // are reflected in both probability and confidence.
  // Single-pass mean + variance over pre-allocated _effScores (no .reduce(), no Math.pow).
  let _effSum = 0
  for (let i = 0; i < effCount; i++) _effSum += _effScores[i]
  const mean = effCount > 0 ? _effSum / effCount : 0
  let _effVarSum = 0
  for (let i = 0; i < effCount; i++) {
    const d = _effScores[i] - mean
    _effVarSum += d * d
  }
  const variance = effCount > 0 ? _effVarSum / effCount : 0
  const agreement = 1 - Math.sqrt(variance)
  // 14.8: Update agreement tracker and add persistence bonus to confidence
  agreementTracker?.update(agreement)
  const confidence = Math.min(
    feedbackProbability * (0.5 + 0.5 * agreement) + (agreementTracker?.persistenceBonus ?? 0),
    1,
  )

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

// ── MINDS Algorithm — DAFx-16 ────────────────────────────────────────────────

/**
 * MINDS: MSD-Inspired Notch Depth Setting.
 * Strategy: start shallow (-3 dB), deepen 1 dB at a time until growth stops.
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

// ── Content Type Detection ───────────────────────────────────────────────────

/**
 * Classify audio content as speech, music, or compressed using 4 global
 * spectral features: centroid, rolloff, crest factor, and spectral flatness.
 *
 * Previous versions used aggressive single-feature early gates (crestFactor > 8
 * → speech, flatness > 0.2 → music) that failed in practice because:
 * - Music with a loud fundamental easily has crest factor > 8 dB
 * - Speech in rooms with ambient noise often has flatness > 0.2
 * - The `spectralFlatness` parameter was peak-local (±5 bins), not global
 *
 * Now uses multi-feature scoring + temporal envelope analysis. Global flatness
 * is computed internally from the full spectrum (geometric/arithmetic mean ratio).
 * When temporal metrics are provided, they receive 40% weight — temporal envelope
 * (silence gaps, energy variance) is the most reliable speech/music discriminator.
 *
 * @param spectrum - Full-resolution spectrum in dBFS
 * @param crestFactor - specMax − rmsDb in dB (global)
 * @param temporalMetrics - Optional energy variance + silence gap ratio from FeedbackDetector
 */
/**
 * Temporal envelope metrics for speech/music discrimination.
 * Computed from a ring buffer of per-frame energy values in FeedbackDetector.
 */
export interface TemporalMetrics {
  /** Variance of energy (dB²). Speech: >12 (silence gaps). Music: <10 (continuous). */
  energyVariance: number
  /** Fraction of frames below silence threshold. Speech: >0.10. Music: <0.08. */
  silenceGapRatio: number
}

export function detectContentType(
  spectrum: Float32Array,
  crestFactor: number,
  temporalMetrics?: TemporalMetrics,
): ContentType {
  // Only reliable early gate: low crest factor = heavily compressed
  if (crestFactor < COMPRESSION_CONSTANTS.COMPRESSED_CREST_FACTOR) {
    return 'compressed'
  }

  // ── Compute global spectral features from full spectrum ─────────────
  let totalPower = 0
  let weightedSum = 0
  let logSum = 0  // for geometric mean (global flatness)
  let validBins = 0
  for (let i = 0; i < spectrum.length; i++) {
    const power = Math.pow(10, spectrum[i] / 10)
    if (power > 0) {
      totalPower += power
      weightedSum += i * power
      logSum += Math.log(power)
      validBins++
    }
  }
  if (totalPower <= 0 || validBins === 0) return 'unknown'

  const centroidNormalized = weightedSum / totalPower / spectrum.length

  // Global spectral flatness: geometric mean / arithmetic mean
  const arithmeticMean = totalPower / validBins
  const geometricMean = Math.exp(logSum / validBins)
  const globalFlatness = arithmeticMean > 0 ? geometricMean / arithmeticMean : 0

  // Spectral rolloff: bin where 85% of energy is reached
  const rolloffThreshold = totalPower * 0.85
  let cumulative = 0
  let rolloffBin = spectrum.length - 1
  for (let i = 0; i < spectrum.length; i++) {
    cumulative += Math.pow(10, spectrum[i] / 10)
    if (cumulative >= rolloffThreshold) {
      rolloffBin = i
      break
    }
  }
  const rolloffNormalized = rolloffBin / spectrum.length

  // ── Multi-feature scoring ──────────────────────────────────────────
  // When temporal data is available, it gets 40% weight (most reliable).
  // Spectral features scale down proportionally to fill the remaining 60%.
  const hasTemporal = temporalMetrics !== undefined
  const spectralScale = hasTemporal ? 0.60 : 1.0

  let speechScore = 0
  let musicScore = 0

  // Spectral centroid: speech concentrates in 100–4kHz, music spreads wider
  if (centroidNormalized < 0.10) speechScore += 0.35 * spectralScale
  else if (centroidNormalized < 0.15) speechScore += 0.20 * spectralScale
  else if (centroidNormalized < 0.20) speechScore += 0.05 * spectralScale
  if (centroidNormalized > 0.20) musicScore += 0.30 * spectralScale
  else if (centroidNormalized > 0.15) musicScore += 0.15 * spectralScale

  // Spectral rolloff: speech energy dies above ~4kHz
  if (rolloffNormalized < 0.15) speechScore += 0.30 * spectralScale
  else if (rolloffNormalized < 0.22) speechScore += 0.15 * spectralScale
  if (rolloffNormalized > 0.25) musicScore += 0.30 * spectralScale
  else if (rolloffNormalized > 0.18) musicScore += 0.10 * spectralScale

  // Global spectral flatness
  if (globalFlatness < 0.03) speechScore += 0.25 * spectralScale
  else if (globalFlatness < 0.06) speechScore += 0.15 * spectralScale
  else if (globalFlatness < 0.10) speechScore += 0.05 * spectralScale
  if (globalFlatness > 0.15) musicScore += 0.25 * spectralScale
  else if (globalFlatness > 0.08) musicScore += 0.10 * spectralScale

  // Crest factor: weak signal, small contribution
  if (crestFactor > 14) speechScore += 0.10 * spectralScale
  else if (crestFactor > 12) speechScore += 0.05 * spectralScale
  if (crestFactor < 7) musicScore += 0.10 * spectralScale

  // ── Temporal envelope scoring (40% weight when available) ──────────
  // Speech: high energy variance (pauses between words), frequent silence gaps.
  // Music: low energy variance (continuous signal), few/no silence gaps.
  if (hasTemporal) {
    const { energyVariance, silenceGapRatio } = temporalMetrics

    // Silence gap ratio — strongest temporal discriminator
    if (silenceGapRatio > TEMPORAL_ENVELOPE.SPEECH_GAP_HIGH) speechScore += 0.25
    else if (silenceGapRatio > TEMPORAL_ENVELOPE.SPEECH_GAP_MED) speechScore += 0.15
    if (silenceGapRatio < TEMPORAL_ENVELOPE.MUSIC_GAP_LOW) musicScore += 0.25
    else if (silenceGapRatio < TEMPORAL_ENVELOPE.MUSIC_GAP_MED) musicScore += 0.15

    // Energy variance
    if (energyVariance > TEMPORAL_ENVELOPE.SPEECH_VARIANCE_HIGH) speechScore += 0.15
    else if (energyVariance > TEMPORAL_ENVELOPE.SPEECH_VARIANCE_MED) speechScore += 0.08
    if (energyVariance < TEMPORAL_ENVELOPE.MUSIC_VARIANCE_LOW) musicScore += 0.15
    else if (energyVariance < TEMPORAL_ENVELOPE.MUSIC_VARIANCE_MED) musicScore += 0.08
  }

  if (speechScore > musicScore && speechScore > 0.3) return 'speech'
  if (musicScore > speechScore && musicScore > 0.3) return 'music'

  return 'unknown'
}
