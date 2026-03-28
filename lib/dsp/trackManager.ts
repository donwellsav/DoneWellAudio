// DoneWell Audio Track Manager - Associates peaks to tracks and extracts features

import { TRACK_SETTINGS } from './constants'
import { hzToCents } from '@/lib/utils/pitchUtils'
import { standardDeviation, autocorrelation, generateId } from '@/lib/utils/mathHelpers'
import type { Track, TrackHistoryEntry, TrackFeatures, DetectedPeak, TrackedPeak, Severity } from '@/types/advisory'

// Maximum number of confirmed partials used to normalise the harmonicity score (0..1)
const MAX_HARMONICS_FOR_SCORE = 4

// Cents tolerance when matching other tracks' harmonicOfHz to this track's frequency.
// Tighter than ASSOCIATION_TOLERANCE_CENTS because harmonic-root matching needs precision.
const HARMONIC_ROOT_TOLERANCE_CENTS = 20

// Minimum delta-time (seconds) for velocity calculation to avoid division by near-zero
const MIN_VELOCITY_DT_SEC = 0.05

/** Snapshot of an evicted track for fast restoration */
interface EvictedTrackSnapshot {
  frequencyHz: number
  cumulativeGrowthDb: number
  peakAmplitudeDb: number
  evictedAt: number
}

const EVICTION_CACHE_SIZE = 16
const EVICTION_CACHE_TTL_MS = 5000

export class TrackManager {
  private tracks: Map<string, Track> = new Map()
  private binToTrackId: Map<number, string> = new Map()
  private maxTracks: number
  private historySize: number
  private associationToleranceCents: number
  private trackTimeoutMs: number
  private _activeTracksCache: Track[] = []
  /** Recently evicted tracks — restore history on re-detection instead of starting cold */
  private _evictedCache: EvictedTrackSnapshot[] = []

  constructor(options: Partial<{
    maxTracks: number
    historySize: number
    associationToleranceCents: number
    trackTimeoutMs: number
  }> = {}) {
    this.maxTracks = options.maxTracks ?? TRACK_SETTINGS.MAX_TRACKS
    this.historySize = options.historySize ?? TRACK_SETTINGS.HISTORY_SIZE
    this.associationToleranceCents = options.associationToleranceCents ?? TRACK_SETTINGS.ASSOCIATION_TOLERANCE_CENTS
    this.trackTimeoutMs = options.trackTimeoutMs ?? TRACK_SETTINGS.TRACK_TIMEOUT_MS
  }

  /**
   * Update runtime-configurable options without clearing tracks
   */
  updateOptions(options: Partial<{ maxTracks: number; trackTimeoutMs: number }>) {
    if (options.maxTracks !== undefined) this.maxTracks = options.maxTracks
    if (options.trackTimeoutMs !== undefined) this.trackTimeoutMs = options.trackTimeoutMs
  }

  /**
   * Process a detected peak and associate/create a track
   */
  processPeak(peak: DetectedPeak & { qEstimate?: number; bandwidthHz?: number; msd?: number; msdGrowthRate?: number; msdIsHowl?: boolean; msdFastConfirm?: boolean }): Track {
    // Check if there's an existing track for this bin
    const existingTrackId = this.binToTrackId.get(peak.binIndex)
    
    if (existingTrackId) {
      const track = this.tracks.get(existingTrackId)
      if (track) {
        return this.updateTrack(track, peak)
      }
    }

    // Try to associate with nearby track by frequency
    const nearestTrack = this.findNearestTrack(peak.trueFrequencyHz)
    if (nearestTrack) {
      const cents = Math.abs(hzToCents(peak.trueFrequencyHz, nearestTrack.trueFrequencyHz))
      if (cents <= this.associationToleranceCents) {
        // Update bin association
        this.binToTrackId.delete(nearestTrack.binIndex)
        this.binToTrackId.set(peak.binIndex, nearestTrack.id)
        nearestTrack.binIndex = peak.binIndex
        return this.updateTrack(nearestTrack, peak)
      }
    }

    // Create new track
    return this.createTrack(peak)
  }

  /**
   * Mark a track as cleared (peak no longer detected)
   */
  clearTrack(binIndex: number, timestamp: number): number | null {
    const trackId = this.binToTrackId.get(binIndex)
    if (!trackId) return null

    const track = this.tracks.get(trackId)
    if (track) {
      const lastAmplitude = track.trueAmplitudeDb
      track.isActive = false
      track.lastUpdateTime = timestamp
      this._rebuildActiveCache()
      return lastAmplitude
    }
    return null
  }

  /**
   * Get all active tracks as TrackedPeak objects for UI consumption
   */
  getActiveTracks(): TrackedPeak[] {
    return this._activeTracksCache.map(track => this.trackToTrackedPeak(track))
  }

  /**
   * Get raw Track objects (for internal use)
   */
  getRawTracks(): Track[] {
    return this._activeTracksCache
  }

  /**
   * Convert internal Track to TrackedPeak for UI
   */
  private trackToTrackedPeak(track: Track): TrackedPeak {
    return {
      id: track.id,
      frequency: track.trueFrequencyHz,
      amplitude: track.trueAmplitudeDb,
      prominenceDb: track.prominenceDb,
      qEstimate: track.qEstimate,
      bandwidthHz: track.bandwidthHz,
      classification: 'unknown' as Severity, // Will be set by classifier
      severity: 'unknown' as Severity,
      onsetTime: track.onsetTime,
      lastUpdateTime: track.lastUpdateTime,
      active: track.isActive,
      history: track.history.map(h => ({
        time: h.time,
        frequency: h.freqHz,
        amplitude: h.ampDb,
      })),
      features: {
        stabilityCentsStd: track.features.stabilityCentsStd,
        harmonicityScore: track.features.harmonicityScore,
        modulationScore: track.features.modulationScore,
        velocityDbPerSec: track.velocityDbPerSec,
      },
    }
  }

  /**
   * Get all tracks (including inactive)
   */
  getAllTracks(): Track[] {
    return Array.from(this.tracks.values())
  }

  /**
   * Get track by ID
   */
  getTrack(id: string): Track | undefined {
    return this.tracks.get(id)
  }

  /**
   * Prune old inactive tracks
   */
  pruneInactiveTracks(currentTime: number): void {
    const toDelete: string[] = []

    for (const [id, track] of this.tracks) {
      if (!track.isActive && currentTime - track.lastUpdateTime > this.trackTimeoutMs) {
        toDelete.push(id)
        this.binToTrackId.delete(track.binIndex)
      }
    }

    for (const id of toDelete) {
      const evicted = this.tracks.get(id)
      if (evicted && evicted.trueFrequencyHz > 0) {
        // Save to eviction cache for fast restoration
        this._evictedCache.push({
          frequencyHz: evicted.trueFrequencyHz,
          cumulativeGrowthDb: evicted.trueAmplitudeDb - evicted.onsetDb,
          peakAmplitudeDb: evicted.trueAmplitudeDb,
          evictedAt: currentTime,
        })
        if (this._evictedCache.length > EVICTION_CACHE_SIZE) this._evictedCache.shift()
      }
      this.tracks.delete(id)
    }
    // Prune stale eviction cache entries
    this._evictedCache = this._evictedCache.filter(e => currentTime - e.evictedAt < EVICTION_CACHE_TTL_MS)

    // Also limit total tracks — evict by quality-weighted staleness score.
    // High-confidence tracks (high prominence, high Q, stable pitch) survive longer.
    if (this.tracks.size > this.maxTracks) {
      const sorted = Array.from(this.tracks.values())
        .sort((a, b) => {
          const scoreA = this._evictionScore(a, currentTime)
          const scoreB = this._evictionScore(b, currentTime)
          return scoreB - scoreA // highest eviction score first
        })

      const toRemove = sorted.slice(0, this.tracks.size - this.maxTracks)
      for (const track of toRemove) {
        this.tracks.delete(track.id)
        this.binToTrackId.delete(track.binIndex)
      }
    }

    this._rebuildActiveCache()
  }

  /**
   * Clear all tracks
   */
  clear(): void {
    this.tracks.clear()
    this.binToTrackId.clear()
    this._activeTracksCache = []
  }

  // ==================== Private Methods ====================

  /**
   * Compute eviction score for overflow pruning.
   * Higher score = more likely to be evicted.
   *
   * evictionScore = staleness - clarity * 0.5
   *
   * staleness: (now - lastUpdateTime) / trackTimeoutMs, normalised 0..1+
   * clarity:   average of normalised prominence, Q, and pitch stability
   *
   * This preserves high-confidence feedback tracks (high prominence,
   * narrow Q, stable pitch) longer than low-quality transient tracks.
   */
  private _evictionScore(track: Track, now: number): number {
    const staleness = (now - track.lastUpdateTime) / this.trackTimeoutMs

    const normProminence = Math.min(Math.max(track.prominenceDb / 30, 0), 1)
    const normQ = Math.min(track.qEstimate, 50) / 50
    const normStability = 1 - Math.min(track.features.stabilityCentsStd, 100) / 100
    const clarity = (normProminence + normQ + normStability) / 3

    return staleness - clarity * 0.5
  }

  private _rebuildActiveCache(): void {
    this._activeTracksCache = Array.from(this.tracks.values()).filter(t => t.isActive)
  }

  private createTrack(peak: DetectedPeak & { qEstimate?: number; bandwidthHz?: number; msd?: number; msdGrowthRate?: number; msdIsHowl?: boolean; msdFastConfirm?: boolean; persistenceFrames?: number; persistenceBoost?: number; isPersistent?: boolean; isHighlyPersistent?: boolean }): Track {
    const id = generateId()
    const qEstimate = peak.qEstimate ?? 10
    const bandwidthHz = peak.bandwidthHz ?? 100

    const track: Track = {
      id,
      binIndex: peak.binIndex,
      trueFrequencyHz: peak.trueFrequencyHz,
      trueAmplitudeDb: peak.trueAmplitudeDb,
      prominenceDb: peak.prominenceDb,
      onsetTime: peak.timestamp,
      onsetDb: peak.trueAmplitudeDb,
      lastUpdateTime: peak.timestamp,
      history: [{
        time: peak.timestamp,
        freqHz: peak.trueFrequencyHz,
        ampDb: peak.trueAmplitudeDb,
        prominenceDb: peak.prominenceDb,
        qEstimate,
      }],
      features: this.initializeFeatures(),
      qEstimate,
      bandwidthHz,
      phpr: peak.phpr,
      velocityDbPerSec: 0,
      harmonicOfHz: peak.harmonicOfHz,
      isSubHarmonicRoot: peak.isSubHarmonicRoot ?? false,
      isActive: true,
      // MSD data from feedbackDetector
      msd: peak.msd,
      msdGrowthRate: peak.msdGrowthRate,
      msdIsHowl: peak.msdIsHowl,
      msdFastConfirm: peak.msdFastConfirm,
      // Phase 2: Persistence scoring
      persistenceFrames: peak.persistenceFrames,
      persistenceBoost: peak.persistenceBoost,
      isPersistent: peak.isPersistent,
      isHighlyPersistent: peak.isHighlyPersistent,
    }

    // Check eviction cache — restore cumulative growth if this peak matches a recently evicted track
    const evictedIdx = this._evictedCache.findIndex(e =>
      Math.abs(1200 * Math.log2(peak.trueFrequencyHz / e.frequencyHz)) < 50 // within 50 cents
    )
    if (evictedIdx !== -1) {
      const restored = this._evictedCache[evictedIdx]
      // Restore growth by adjusting onsetDb so (currentDb - onsetDb) reflects prior growth
      track.onsetDb = track.trueAmplitudeDb - restored.cumulativeGrowthDb
      this._evictedCache.splice(evictedIdx, 1)
    }

    this.tracks.set(id, track)
    this.binToTrackId.set(peak.binIndex, id)

    this._rebuildActiveCache()
    return track
  }

  private updateTrack(track: Track, peak: DetectedPeak & { qEstimate?: number; bandwidthHz?: number; msd?: number; msdGrowthRate?: number; msdIsHowl?: boolean; msdFastConfirm?: boolean; persistenceFrames?: number; persistenceBoost?: number; isPersistent?: boolean; isHighlyPersistent?: boolean }): Track {
    const qEstimate = peak.qEstimate ?? track.qEstimate
    const bandwidthHz = peak.bandwidthHz ?? track.bandwidthHz

    // Add to history (ring buffer)
    const entry: TrackHistoryEntry = {
      time: peak.timestamp,
      freqHz: peak.trueFrequencyHz,
      ampDb: peak.trueAmplitudeDb,
      prominenceDb: peak.prominenceDb,
      qEstimate,
    }

    track.history.push(entry)
    if (track.history.length > this.historySize) {
      track.history.shift()
    }

    // Update track properties
    track.trueFrequencyHz = peak.trueFrequencyHz
    track.trueAmplitudeDb = peak.trueAmplitudeDb
    track.prominenceDb = peak.prominenceDb
    track.lastUpdateTime = peak.timestamp
    track.qEstimate = qEstimate
    track.bandwidthHz = bandwidthHz
    track.phpr = peak.phpr ?? track.phpr
    track.harmonicOfHz = peak.harmonicOfHz
    // Once a sub-harmonic root is identified, keep that flag sticky on the track
    if (peak.isSubHarmonicRoot) track.isSubHarmonicRoot = true
    track.isActive = true
    
    // Update MSD data from feedbackDetector
    track.msd = peak.msd
    track.msdGrowthRate = peak.msdGrowthRate
    track.msdIsHowl = peak.msdIsHowl
    track.msdFastConfirm = peak.msdFastConfirm
    
    // Phase 2: Persistence scoring
    track.persistenceFrames = peak.persistenceFrames
    track.persistenceBoost = peak.persistenceBoost
    track.isPersistent = peak.isPersistent
    track.isHighlyPersistent = peak.isHighlyPersistent
    
    // Calculate velocity (dB/sec) from recent history window (~500ms)
    // Uses recent slope instead of onset-to-now average to capture current growth rate
    const VELOCITY_WINDOW_MS = 500
    const now = peak.timestamp
    const hist = track.history
    if (hist.length >= 2) {
      // Find the oldest entry within the velocity window
      let windowStart = hist.length - 1
      for (let j = hist.length - 2; j >= 0; j--) {
        if (now - hist[j].time > VELOCITY_WINDOW_MS) break
        windowStart = j
      }
      const oldest = hist[windowStart]
      const newest = hist[hist.length - 1]
      const dtSec = Math.max((newest.time - oldest.time) / 1000, MIN_VELOCITY_DT_SEC)
      if (dtSec > MIN_VELOCITY_DT_SEC) {
        track.velocityDbPerSec = (newest.ampDb - oldest.ampDb) / dtSec
      }
    }

    // Extract features
    track.features = this.extractFeatures(track)

    this._rebuildActiveCache()
    return track
  }

  private initializeFeatures(): TrackFeatures {
    return {
      stabilityCentsStd: 0,
      meanQ: 10,
      minQ: 10,
      meanVelocityDbPerSec: 0,
      maxVelocityDbPerSec: 0,
      persistenceMs: 0,
      harmonicityScore: 0,
      modulationScore: 0,
      noiseSidebandScore: 0,
    }
  }

  private extractFeatures(track: Track): TrackFeatures {
    const history = track.history
    if (history.length < 2) {
      return this.initializeFeatures()
    }

    // Stability (cents std deviation from mean frequency)
    const meanFreq = history.reduce((sum, h) => sum + h.freqHz, 0) / history.length
    const centsDiffs = history.map(h => hzToCents(h.freqHz, meanFreq))
    const stabilityCentsStd = standardDeviation(centsDiffs)

    // Q statistics
    const qValues = history.map(h => h.qEstimate)
    const meanQ = qValues.reduce((sum, q) => sum + q, 0) / qValues.length
    const minQ = Math.min(...qValues)

    // Velocity statistics
    const velocities: number[] = []
    for (let i = 1; i < history.length; i++) {
      const dt = (history[i].time - history[i - 1].time) / 1000
      if (dt > 0.01) {
        const dDb = history[i].ampDb - history[i - 1].ampDb
        velocities.push(dDb / dt)
      }
    }

    const meanVelocityDbPerSec = velocities.length > 0
      ? velocities.reduce((sum, v) => sum + v, 0) / velocities.length
      : 0
    const maxVelocityDbPerSec = velocities.length > 0
      ? Math.max(...velocities.map(Math.abs))
      : 0

    // Persistence
    const persistenceMs = track.lastUpdateTime - track.onsetTime

    // Harmonicity score (look for coherent harmonic structure)
    const harmonicityScore = this.computeHarmonicityScore(track)

    // Modulation score (vibrato detection via autocorrelation)
    const modulationScore = this.computeModulationScore(track)

    // Sideband noise score (placeholder - would need spectrum access)
    const noiseSidebandScore = 0

    return {
      stabilityCentsStd,
      meanQ,
      minQ,
      meanVelocityDbPerSec,
      maxVelocityDbPerSec,
      persistenceMs,
      harmonicityScore,
      modulationScore,
      noiseSidebandScore,
    }
  }

  private computeHarmonicityScore(track: Track): number {
    // Track is a detected overtone of a known root → strong harmonic content
    if (track.harmonicOfHz !== null) {
      return 0.8
    }

    // Track is the fundamental of a harmonic series already active → also harmonic content
    if (track.isSubHarmonicRoot) {
      return 0.75
    }

    // Check if other active tracks have registered this track's frequency as their harmonic root
    let harmonicCount = 0
    for (const other of this.tracks.values()) {
      if (other.id === track.id || !other.isActive) continue
      if (other.harmonicOfHz !== null) {
        const cents = Math.abs(hzToCents(other.harmonicOfHz, track.trueFrequencyHz))
        if (cents < HARMONIC_ROOT_TOLERANCE_CENTS) {
          harmonicCount++
        }
      }
    }

    // More confirmed partials → higher score (cap at 1.0)
    return Math.min(harmonicCount / MAX_HARMONICS_FOR_SCORE, 1)
  }

  private computeModulationScore(track: Track): number {
    // Detect vibrato (3-10 Hz modulation) via frequency variation autocorrelation
    const history = track.history
    if (history.length < 20) return 0

    // Extract frequency deviations from mean
    const meanFreq = history.reduce((sum, h) => sum + h.freqHz, 0) / history.length
    const deviations = history.map(h => h.freqHz - meanFreq)

    // Calculate average time step
    const totalTime = history[history.length - 1].time - history[0].time
    const avgStepMs = totalTime / (history.length - 1)

    // Look for autocorrelation peaks at 3-10 Hz (100-333ms period)
    const minLag = Math.floor(100 / avgStepMs)
    const maxLag = Math.ceil(333 / avgStepMs)

    let maxAutocorr = 0
    for (let lag = minLag; lag <= maxLag && lag < history.length / 2; lag++) {
      const ac = autocorrelation(deviations, lag)
      if (ac > maxAutocorr) {
        maxAutocorr = ac
      }
    }

    // Also check that there's enough frequency variation to be vibrato
    const freqStd = standardDeviation(deviations)
    const hasEnoughVariation = freqStd > 2 // At least 2 Hz variation

    return hasEnoughVariation ? maxAutocorr : 0
  }

  private findNearestTrack(frequencyHz: number): Track | null {
    let nearest: Track | null = null
    let minCents = Infinity

    for (const track of this.tracks.values()) {
      if (!track.isActive) continue

      const cents = Math.abs(hzToCents(frequencyHz, track.trueFrequencyHz))
      if (cents < minCents) {
        minCents = cents
        nearest = track
      }
    }

    return nearest
  }
}
