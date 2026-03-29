/**
 * Comb Filter Pattern Detection + Temporal Stability Tracking
 *
 * Detects evenly-spaced peaks characteristic of acoustic feedback loops
 * (DBX whitepaper). Includes temporal stability tracking to distinguish
 * static feedback loops from sweeping time-based effects (flanger, phaser).
 *
 * Extracted from algorithmFusion.ts for maintainability.
 */

import { COMB_PATTERN_SETTINGS } from './constants'

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
export const COMB_STABILITY_CV_THRESHOLD = 0.05 // CV above this = sweeping effect
export const COMB_SWEEP_PENALTY = 0.25        // Reduce comb confidence when sweeping

/** Maximum entries in the comb history cache (LRU eviction). */
const COMB_HISTORY_CACHE_MAX = 32
/** Time-to-live for cached comb history entries (5 seconds). */
const COMB_HISTORY_CACHE_TTL_MS = 5000

// ── Helpers ──────────────────────────────────────────────────────────────────

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

// ── Classes ──────────────────────────────────────────────────────────────────

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

// ── Detection ────────────────────────────────────────────────────────────────

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
