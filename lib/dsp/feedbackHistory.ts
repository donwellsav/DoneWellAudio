/**
 * Feedback History Logger
 * Tracks which frequencies repeatedly cause problems in a venue/session
 * 
 * Features:
 * - Records all detected feedback events
 * - Groups by frequency (within tolerance)
 * - Tracks repeat offenders
 * - Persists to IndexedDB for session continuity (localStorage fallback on pagehide)
 * - Exports to CSV/JSON for post-show analysis
 */

import { hzToCents } from '@/lib/utils/pitchUtils'
import { HOTSPOT_COOLDOWN_MS, HOTSPOT_COOLDOWN_BY_MODE, POST_CUT_COOLDOWN_MS } from '@/lib/dsp/constants'
import {
  loadStoredFeedbackHistory,
  saveStoredFeedbackHistory,
  clearStoredFeedbackHistory,
  savePendingFeedbackHistory,
  type StoredFeedbackHistory,
} from '@/lib/dsp/feedbackHistoryStorage'

// ============================================================================
// TYPES
// ============================================================================

export interface FeedbackEvent {
  id: string
  timestamp: number
  frequencyHz: number
  amplitudeDb: number
  prominenceDb: number
  qEstimate: number
  severity: string
  confidence: number
  modalOverlapFactor?: number
  cumulativeGrowthDb?: number
  frequencyBand?: 'LOW' | 'MID' | 'HIGH'
  wasActedOn: boolean // Did the engineer apply a cut?
  cutAppliedDb?: number // How much cut was applied
  label: string
  // EQ recommendations (captured at detection time for export)
  geqBandHz?: number // Nearest GEQ band center frequency
  geqSuggestedDb?: number // GEQ cut recommendation (negative = cut)
  peqQ?: number // PEQ Q factor
  peqGainDb?: number // PEQ gain recommendation (negative = cut)
  /** Cut applied by Companion module (closed-loop tracking) */
  cutAppliedByCompanion?: {
    gainDb: number
    bandIndex: number
    at: number
    /** True if no recurrence within VERIFICATION_WINDOW_MS, false if feedback re-triggered */
    worked?: boolean
  }
}

export interface FrequencyHotspot {
  centerFrequencyHz: number
  occurrences: number
  events: FeedbackEvent[]
  firstSeen: number
  lastSeen: number
  maxAmplitudeDb: number
  avgAmplitudeDb: number
  avgConfidence: number
  suggestedCutDb: number
  isRepeatOffender: boolean // 3+ occurrences
  lastEventTime: number // Timestamp of last event (for cooldown)
  /** Average "working" cut depth for this hotspot (learned over time) */
  learnedCutDb?: number
  /** Number of successful Companion cuts recorded against this hotspot */
  successfulCutCount?: number
}

export interface SessionSummary {
  sessionId: string
  startTime: number
  endTime: number
  totalEvents: number
  hotspots: FrequencyHotspot[]
  repeatOffenders: FrequencyHotspot[]
  mostProblematicFrequency: FrequencyHotspot | null
  frequencyBandBreakdown: {
    LOW: number
    MID: number
    HIGH: number
  }
}

// ============================================================================
// CONSTANTS
// ============================================================================

const FREQUENCY_GROUPING_CENTS = 100 // Group frequencies within 100 cents (match track association tolerance)
const REPEAT_OFFENDER_THRESHOLD = 3 // 3+ occurrences = repeat offender
const MAX_EVENTS_PER_SESSION = 500 // Limit memory usage
const MAX_EVENTS_PER_HOTSPOT = 50 // Rolling window for per-hotspot stats

/** How long we monitor for feedback recurrence after a Companion cut (ms) */
export const COMPANION_VERIFICATION_WINDOW_MS = 2000
/** Wait this long after VERIFICATION_WINDOW to declare a cut "worked" (ms) */
export const COMPANION_SUCCESS_WINDOW_MS = 5000
/** Max consecutive retry cuts per frequency before marking as persistent */
export const COMPANION_MAX_RETRIES = 3
/** How much deeper to cut on each retry (dB) */
export const COMPANION_RETRY_STEP_DB = 3

// ============================================================================
// FEEDBACK HISTORY CLASS
// ============================================================================

export class FeedbackHistory {
  private sessionId: string
  private startTime: number
  private events: FeedbackEvent[] = []
  private hotspots: Map<string, FrequencyHotspot> = new Map()
  /** Cents-based spatial index for O(1) hotspot lookups by frequency */
  private hotspotBucketIndex: Map<number, Set<string>> = new Map()
  private _mode: string = 'speech'
  /** Per-hotspot post-cut cooldown override expiry timestamps (keyed by hotspot map key) */
  private _postCutCooldowns: Map<string, number> = new Map()
  /**
   * Open Companion cuts awaiting verification.
   * Key: hotspot key. Value: { appliedAt, gainDb, bandIndex, retryCount, advisoryId }
   */
  private _companionPendingCuts: Map<string, {
    appliedAt: number
    gainDb: number
    bandIndex: number
    retryCount: number
    advisoryId: string
  }> = new Map()
  private readonly _readyPromise: Promise<void>
  /** True once loadFromStorage() resolves — guards against event loss during hydration */
  private _hydrated = false
  /** Events queued during async hydration — flushed once loadFromStorage completes */
  private _pendingEvents: Array<Omit<FeedbackEvent, 'id'>> = []
  /** Number of events in this.events at the time of the last successful IDB flush.
   *  Pagehide writes only events[_lastFlushedEventCount:] as the delta. */
  private _lastFlushedEventCount = 0

  constructor() {
    this.sessionId = this.generateSessionId()
    this.startTime = Date.now()
    this._readyPromise = this.loadFromStorage()
  }

  /**
   * Await initial IndexedDB hydration. Resolves immediately after first load.
   * Callers that need data before interacting (e.g. export) should await this.
   */
  whenReady(): Promise<void> {
    return this._readyPromise
  }

  /**
   * Set the current operation mode (e.g. 'speech', 'liveMusic', 'monitors').
   * Affects per-mode hotspot cooldown duration via HOTSPOT_COOLDOWN_BY_MODE.
   */
  setMode(mode: string): void {
    this._mode = mode
  }

  /**
   * Get the current operation mode.
   */
  getMode(): string {
    return this._mode
  }

  /**
   * Get the effective cooldown duration (ms) for the current mode.
   * Returns the per-mode value from HOTSPOT_COOLDOWN_BY_MODE, falling back
   * to the global HOTSPOT_COOLDOWN_MS if the mode is not mapped.
   */
  getEffectiveCooldown(): number {
    return HOTSPOT_COOLDOWN_BY_MODE[this._mode] ?? HOTSPOT_COOLDOWN_MS
  }

  /**
   * Mark that an EQ cut was applied at a given frequency.
   * Sets a short post-cut cooldown (POST_CUT_COOLDOWN_MS) for the matching
   * hotspot so the system can quickly re-detect if the cut was insufficient.
   *
   * @param frequencyHz - Center frequency of the applied cut
   * @param timestampMs - Event timestamp of the cut (default: Date.now()).
   *   Uses event time rather than wall clock so cooldown comparisons in
   *   recordEvent() stay on the same clock source.
   */
  markCutApplied(frequencyHz: number, timestampMs: number = Date.now()): void {
    const hotspotKey = this.findHotspotKey(frequencyHz)
    if (hotspotKey) {
      // Store expiry time on the same clock as event.timestamp
      this._postCutCooldowns.set(hotspotKey, timestampMs + POST_CUT_COOLDOWN_MS)
    }
  }

  /**
   * Mark that the Companion module applied a cut at a given frequency.
   * Starts the verification window — if feedback re-triggers at this frequency
   * within COMPANION_VERIFICATION_WINDOW_MS, the cut is considered insufficient
   * and `shouldRetryCompanionCut()` will return true.
   *
   * Also attaches cut metadata to the most recent event for this frequency so
   * exports can show what the module did.
   */
  markCompanionApplied(
    args: { frequencyHz: number; gainDb: number; bandIndex: number; advisoryId: string; at?: number },
  ): void {
    const { frequencyHz, gainDb, bandIndex, advisoryId } = args
    const appliedAt = args.at ?? Date.now()
    const hotspotKey = this.findHotspotKey(frequencyHz)
    if (!hotspotKey) return

    const existing = this._companionPendingCuts.get(hotspotKey)
    this._companionPendingCuts.set(hotspotKey, {
      appliedAt,
      gainDb,
      bandIndex,
      retryCount: existing?.retryCount ?? 0,
      advisoryId,
    })

    // Also attach to the most recent matching event (for export/history)
    for (let i = this.events.length - 1; i >= 0; i--) {
      const event = this.events[i]
      const cents = Math.abs(hzToCents(event.frequencyHz, frequencyHz))
      if (cents <= FREQUENCY_GROUPING_CENTS) {
        event.cutAppliedByCompanion = { gainDb, bandIndex, at: appliedAt }
        event.wasActedOn = true
        event.cutAppliedDb = gainDb
        break
      }
    }
    // Persist
    this.saveToStorage()
  }

  /**
   * Check whether a new detection at this frequency indicates the last Companion
   * cut failed and a deeper retry is warranted.
   *
   * Returns an object describing the retry if conditions are met, else null.
   * Conditions:
   *   - Pending cut exists within VERIFICATION_WINDOW_MS
   *   - Retry count is below COMPANION_MAX_RETRIES
   *   - Calculated deeper cut does not exceed -12dB safety clamp
   */
  shouldRetryCompanionCut(frequencyHz: number, now: number = Date.now()): {
    nextGainDb: number
    retryCount: number
    advisoryId: string
    bandIndex: number
  } | null {
    const hotspotKey = this.findHotspotKey(frequencyHz)
    if (!hotspotKey) return null

    const pending = this._companionPendingCuts.get(hotspotKey)
    if (!pending) return null

    const elapsed = now - pending.appliedAt
    // Outside verification window — cut is either "working" or too old to chain a retry
    if (elapsed > COMPANION_VERIFICATION_WINDOW_MS) return null

    // Already retried max times — stop the loop
    if (pending.retryCount >= COMPANION_MAX_RETRIES) return null

    // Deeper cut — clamp to safety floor
    const nextGainDb = Math.max(pending.gainDb - COMPANION_RETRY_STEP_DB, -12)
    if (nextGainDb >= pending.gainDb) return null // no room to go deeper

    // Record that we're initiating a retry
    this._companionPendingCuts.set(hotspotKey, {
      ...pending,
      retryCount: pending.retryCount + 1,
      gainDb: nextGainDb,
      appliedAt: now,
    })

    return {
      nextGainDb,
      retryCount: pending.retryCount + 1,
      advisoryId: pending.advisoryId,
      bandIndex: pending.bandIndex,
    }
  }

  /**
   * Promote pending cuts to "worked" state once the success window expires.
   * Updates the hotspot's learnedCutDb as a rolling average over successful cuts.
   * Call periodically (e.g. from a ticker hook).
   */
  reapCompanionCuts(now: number = Date.now()): void {
    for (const [key, pending] of this._companionPendingCuts) {
      if (now - pending.appliedAt < COMPANION_SUCCESS_WINDOW_MS) continue

      // The cut survived the success window — mark as "worked"
      const hotspot = this.hotspots.get(key)
      if (hotspot) {
        const prevCount = hotspot.successfulCutCount ?? 0
        const prevLearned = hotspot.learnedCutDb ?? pending.gainDb
        // Rolling average: blend the new cut with the existing learned depth
        hotspot.learnedCutDb = (prevLearned * prevCount + pending.gainDb) / (prevCount + 1)
        hotspot.successfulCutCount = prevCount + 1

        // Mark the most recent event for this hotspot as worked
        for (let i = hotspot.events.length - 1; i >= 0; i--) {
          const e = hotspot.events[i]
          if (e.cutAppliedByCompanion && e.cutAppliedByCompanion.worked === undefined) {
            e.cutAppliedByCompanion.worked = true
            break
          }
        }
      }
      this._companionPendingCuts.delete(key)
    }
  }

  /**
   * Record a new feedback event.
   * If IndexedDB hydration hasn't completed yet, the event is queued and
   * replayed once loadFromStorage() resolves — preventing data loss when
   * analysis starts before persisted state is loaded.
   */
  recordEvent(event: Omit<FeedbackEvent, 'id'>): FeedbackEvent {
    // Queue events until hydration completes to avoid overwriting loaded state
    if (!this._hydrated) {
      this._pendingEvents.push(event)
      // Return a stub event — the real one is created during flush
      return { id: `evt_pending_${this._pendingEvents.length}`, ...event }
    }

    const id = `evt_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
    const fullEvent: FeedbackEvent = { id, ...event }

    // Add to events array
    this.events.push(fullEvent)
    
    // Limit total events — adjust watermark so delta stays correct
    if (this.events.length > MAX_EVENTS_PER_SESSION) {
      const dropped = this.events.length - MAX_EVENTS_PER_SESSION
      this.events = this.events.slice(-MAX_EVENTS_PER_SESSION)
      this._lastFlushedEventCount = Math.max(0, this._lastFlushedEventCount - dropped)
    }
    
    // Update hotspots
    this.updateHotspot(fullEvent)
    
    // Persist to storage
    this.saveToStorage()
    
    return fullEvent
  }

  /**
   * Mark an event as acted on (engineer applied a cut)
   */
  markActedOn(eventId: string, cutAppliedDb?: number): void {
    const event = this.events.find(e => e.id === eventId)
    if (event) {
      event.wasActedOn = true
      event.cutAppliedDb = cutAppliedDb
      this.saveToStorage()
    }
  }

  /**
   * Get all hotspots sorted by occurrence count
   */
  getHotspots(): FrequencyHotspot[] {
    return Array.from(this.hotspots.values())
      .sort((a, b) => b.occurrences - a.occurrences)
  }

  /**
   * Get repeat offender frequencies (3+ occurrences)
   */
  getRepeatOffenders(): FrequencyHotspot[] {
    return this.getHotspots().filter(h => h.isRepeatOffender)
  }

  /**
   * Check if a frequency is a known repeat offender
   */
  isRepeatOffender(frequencyHz: number): boolean {
    const hotspot = this.findHotspotForFrequency(frequencyHz)
    return hotspot?.isRepeatOffender ?? false
  }

  /**
   * Get occurrence count for a frequency
   */
  getOccurrenceCount(frequencyHz: number): number {
    const hotspot = this.findHotspotForFrequency(frequencyHz)
    return hotspot?.occurrences ?? 0
  }

  /**
   * Get occurrence counts for a batch of frequencies.
   * Uses the bucket index so callers can avoid repeated hotspot scans.
   */
  getOccurrenceCounts(frequenciesHz: readonly number[]): Map<number, number> {
    const counts = new Map<number, number>()
    for (const frequencyHz of frequenciesHz) {
      counts.set(frequencyHz, this.getOccurrenceCount(frequencyHz))
    }
    return counts
  }

  /**
   * Get session summary
   */
  getSessionSummary(): SessionSummary {
    const hotspots = this.getHotspots()
    const repeatOffenders = this.getRepeatOffenders()
    
    const frequencyBandBreakdown = {
      LOW: this.events.filter(e => e.frequencyBand === 'LOW').length,
      MID: this.events.filter(e => e.frequencyBand === 'MID').length,
      HIGH: this.events.filter(e => e.frequencyBand === 'HIGH').length,
    }
    
    return {
      sessionId: this.sessionId,
      startTime: this.startTime,
      endTime: Date.now(),
      totalEvents: this.events.length,
      hotspots,
      repeatOffenders,
      mostProblematicFrequency: hotspots[0] ?? null,
      frequencyBandBreakdown,
    }
  }

  /**
   * Export to CSV format
   */
  exportToCSV(): string {
    const headers = [
      'Timestamp',
      'Frequency (Hz)',
      'Amplitude (dB)',
      'Prominence (dB)',
      'Q Factor',
      'Severity',
      'Confidence',
      'Modal Overlap',
      'Cumulative Growth (dB)',
      'Frequency Band',
      'Label',
      'GEQ Band (Hz)',
      'GEQ Cut (dB)',
      'PEQ Q',
      'PEQ Gain (dB)',
      'Was Acted On',
      'Cut Applied (dB)',
    ].join(',')

    const rows = this.events.map(e => [
      new Date(e.timestamp).toISOString(),
      e.frequencyHz.toFixed(1),
      e.amplitudeDb.toFixed(1),
      e.prominenceDb.toFixed(1),
      e.qEstimate.toFixed(1),
      e.severity,
      (e.confidence * 100).toFixed(0) + '%',
      e.modalOverlapFactor?.toFixed(2) ?? '',
      e.cumulativeGrowthDb?.toFixed(1) ?? '',
      e.frequencyBand ?? '',
      e.label,
      e.geqBandHz?.toFixed(0) ?? '',
      e.geqSuggestedDb?.toFixed(1) ?? '',
      e.peqQ?.toFixed(1) ?? '',
      e.peqGainDb?.toFixed(1) ?? '',
      e.wasActedOn ? 'Yes' : 'No',
      e.cutAppliedDb?.toFixed(1) ?? '',
    ].join(','))
    
    return [headers, ...rows].join('\n')
  }

  /**
   * Export to JSON format
   */
  exportToJSON(): string {
    return JSON.stringify({
      summary: this.getSessionSummary(),
      events: this.events,
      hotspots: this.getHotspots(),
    }, null, 2)
  }

  /**
   * Clear all history
   */
  clear(): void {
    this.events = []
    this.hotspots.clear()
    this.hotspotBucketIndex.clear()
    this._postCutCooldowns.clear()
    this._companionPendingCuts.clear()
    this.sessionId = this.generateSessionId()
    this.startTime = Date.now()
    this._lastFlushedEventCount = 0 // Reset watermark — new session has nothing in IDB
    clearStoredFeedbackHistory().catch(() => { /* handled internally */ })
  }

  /**
   * Start a new session (preserves hotspot knowledge)
   */
  startNewSession(): void {
    this.sessionId = this.generateSessionId()
    this.startTime = Date.now()
    // Keep hotspots but clear events for new session
    this.events = []
    this._lastFlushedEventCount = 0 // Reset watermark — new session has nothing in IDB
    this.saveToStorage()
  }

  // ==================== PRIVATE METHODS ====================

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  }

  // ── Bucket index helpers ──────────────────────────────────────────────
  // Cents-based spatial hashing: each bucket covers FREQUENCY_GROUPING_CENTS
  // (100 cents). Lookups check ±1 neighbor bucket for O(1) amortized access
  // instead of scanning every hotspot.

  private getFrequencyBucket(frequencyHz: number): number {
    return Math.floor((1200 * Math.log2(frequencyHz)) / FREQUENCY_GROUPING_CENTS)
  }

  private addHotspotToIndex(hotspotKey: string, centerFrequencyHz: number): void {
    const bucket = this.getFrequencyBucket(centerFrequencyHz)
    const entries = this.hotspotBucketIndex.get(bucket)
    if (entries) {
      entries.add(hotspotKey)
    } else {
      this.hotspotBucketIndex.set(bucket, new Set([hotspotKey]))
    }
  }

  private removeHotspotFromIndex(hotspotKey: string, centerFrequencyHz: number): void {
    const bucket = this.getFrequencyBucket(centerFrequencyHz)
    const entries = this.hotspotBucketIndex.get(bucket)
    if (!entries) return
    entries.delete(hotspotKey)
    if (entries.size === 0) {
      this.hotspotBucketIndex.delete(bucket)
    }
  }

  private updateHotspotIndex(hotspotKey: string, previousCenterHz: number, nextCenterHz: number): void {
    const prevBucket = this.getFrequencyBucket(previousCenterHz)
    const nextBucket = this.getFrequencyBucket(nextCenterHz)
    if (prevBucket === nextBucket) return
    this.removeHotspotFromIndex(hotspotKey, previousCenterHz)
    this.addHotspotToIndex(hotspotKey, nextCenterHz)
  }

  private rebuildHotspotIndex(): void {
    this.hotspotBucketIndex.clear()
    for (const [key, hotspot] of this.hotspots.entries()) {
      this.addHotspotToIndex(key, hotspot.centerFrequencyHz)
    }
  }

  // ── Indexed lookups ─────────────────────────────────────────────────

  private findHotspotForFrequency(frequencyHz: number): FrequencyHotspot | undefined {
    const key = this.findHotspotKey(frequencyHz)
    return key ? this.hotspots.get(key) : undefined
  }

  /**
   * Find the Map key for the hotspot matching a frequency.
   * Uses bucket index with ±1 neighbor search for O(1) amortized lookup.
   */
  private findHotspotKey(frequencyHz: number): string | undefined {
    const bucket = this.getFrequencyBucket(frequencyHz)
    let bestMatch: { key: string; cents: number } | null = null

    for (const candidateBucket of [bucket - 1, bucket, bucket + 1]) {
      const candidateKeys = this.hotspotBucketIndex.get(candidateBucket)
      if (!candidateKeys) continue

      for (const key of candidateKeys) {
        const hotspot = this.hotspots.get(key)
        if (!hotspot) continue

        const cents = Math.abs(hzToCents(frequencyHz, hotspot.centerFrequencyHz))
        if (cents > FREQUENCY_GROUPING_CENTS) continue

        if (!bestMatch || cents < bestMatch.cents) {
          bestMatch = { key, cents }
        }
      }
    }

    return bestMatch?.key
  }

  private updateHotspot(event: FeedbackEvent): void {
    // Find existing hotspot or create new one
    let hotspotKey = this.findHotspotKey(event.frequencyHz)
    let hotspot = hotspotKey ? this.hotspots.get(hotspotKey) : undefined

    if (!hotspot) {
      // Create new hotspot
      hotspot = {
        centerFrequencyHz: event.frequencyHz,
        occurrences: 0,
        events: [],
        firstSeen: event.timestamp,
        lastSeen: event.timestamp,
        maxAmplitudeDb: event.amplitudeDb,
        avgAmplitudeDb: event.amplitudeDb,
        avgConfidence: event.confidence,
        suggestedCutDb: Math.min(event.prominenceDb * 1.5, 12), // 1.5x prominence, max 12dB
        isRepeatOffender: false,
        lastEventTime: 0,
      }
      // Use unique ID as key to avoid collision when centerFrequencyHz drifts across 10Hz boundaries
      hotspotKey = `hs_${event.timestamp}_${Math.round(event.frequencyHz)}`
      this.hotspots.set(hotspotKey, hotspot)
      this.addHotspotToIndex(hotspotKey, hotspot.centerFrequencyHz)
    }

    // After this point both hotspot and hotspotKey are guaranteed defined
    // (either found or just created). Guard satisfies TypeScript narrowing.
    if (!hotspotKey) return

    // Cooldown — skip if same hotspot fired too recently (prevents inflated counts).
    // Uses per-mode cooldown from HOTSPOT_COOLDOWN_BY_MODE, with a shorter
    // POST_CUT_COOLDOWN_MS override when a cut was recently applied.
    if (hotspot.lastEventTime > 0) {
      const postCutExpiry = this._postCutCooldowns.get(hotspotKey)
      const cooldown = (postCutExpiry !== undefined && event.timestamp < postCutExpiry)
        ? POST_CUT_COOLDOWN_MS
        : this.getEffectiveCooldown()
      if ((event.timestamp - hotspot.lastEventTime) < cooldown) {
        return
      }
      // Clean up expired post-cut cooldown
      if (postCutExpiry !== undefined && event.timestamp >= postCutExpiry) {
        this._postCutCooldowns.delete(hotspotKey)
      }
    }

    // Update hotspot statistics
    const previousCenterHz = hotspot.centerFrequencyHz
    hotspot.occurrences++
    hotspot.lastEventTime = event.timestamp
    hotspot.events.push(event)
    // Cap events per hotspot to prevent unbounded growth
    if (hotspot.events.length > MAX_EVENTS_PER_HOTSPOT) {
      hotspot.events = hotspot.events.slice(-MAX_EVENTS_PER_HOTSPOT)
    }
    hotspot.lastSeen = event.timestamp
    hotspot.maxAmplitudeDb = Math.max(hotspot.maxAmplitudeDb, event.amplitudeDb)
    hotspot.isRepeatOffender = hotspot.occurrences >= REPEAT_OFFENDER_THRESHOLD
    this.recomputeHotspotStats(hotspot)
    // Center frequency may have drifted — update bucket index if needed
    this.updateHotspotIndex(hotspotKey, previousCenterHz, hotspot.centerFrequencyHz)
  }

  /**
   * Single-pass recomputation of hotspot averages and suggested cut.
   * Replaces scattered .map().reduce() chains with one loop.
   */
  private recomputeHotspotStats(hotspot: FrequencyHotspot): void {
    let amplitudeSum = 0
    let confidenceSum = 0
    let frequencySum = 0
    let maxProminence = 0

    for (const e of hotspot.events) {
      amplitudeSum += e.amplitudeDb
      confidenceSum += e.confidence
      frequencySum += e.frequencyHz
      if (e.prominenceDb > maxProminence) maxProminence = e.prominenceDb
    }

    const count = hotspot.events.length
    hotspot.avgAmplitudeDb = amplitudeSum / count
    hotspot.avgConfidence = confidenceSum / count
    // Update center frequency (weighted average) — key is stable (ID-based), no re-keying needed
    hotspot.centerFrequencyHz = frequencySum / count
    hotspot.suggestedCutDb = Math.min(maxProminence * 1.5 + (hotspot.occurrences - 1) * 0.5, 12)
  }

  private _saveTimer: ReturnType<typeof setTimeout> | null = null

  private _pagehideHandler: (() => void) | null = null

  private saveToStorage(): void {
    if (typeof window === 'undefined') return
    // Debounce writes — batch to once per second instead of every detection
    if (this._saveTimer) return
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null
      this._flushToStorageAsync().catch(() => { /* handled internally */ })
    }, 1000)

    // Register pagehide flush once — ensures pending data survives tab close/reload.
    // Uses synchronous localStorage write because async IDB transactions may be
    // killed by the browser on unload (especially Safari).
    if (!this._pagehideHandler) {
      this._pagehideHandler = () => {
        if (this._saveTimer) {
          clearTimeout(this._saveTimer)
          this._saveTimer = null
        }
        this._flushToStorageSync()
      }
      window.addEventListener('pagehide', this._pagehideHandler)
    }
  }

  /** Serialize current state for storage. */
  private _getStorageData(): StoredFeedbackHistory {
    return {
      sessionId: this.sessionId,
      startTime: this.startTime,
      events: this.events,
      hotspots: Array.from(this.hotspots.entries()),
    }
  }

  /** Async write to IndexedDB — used during normal operation. */
  private async _flushToStorageAsync(): Promise<void> {
    try {
      const data = this._getStorageData()
      await saveStoredFeedbackHistory(data)
      // Record watermark — pagehide only needs events after this point
      this._lastFlushedEventCount = this.events.length
    } catch (e) {
      console.warn('[FeedbackHistory] Failed to save to IndexedDB:', e)
    }
  }

  /**
   * Synchronous delta write to localStorage — used ONLY in pagehide handler.
   * Writes only events since the last IDB flush (no hotspots — those are
   * already persisted in the IDB snapshot). Next load merges the delta.
   */
  private _flushToStorageSync(): void {
    savePendingFeedbackHistory(this._getStorageData(), this._lastFlushedEventCount)
  }

  /**
   * Force an immediate async write to IndexedDB.
   * Cancels any pending debounced save. Use in endSession where we
   * need to ensure data is persisted before archiving the session.
   */
  async flush(): Promise<void> {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer)
      this._saveTimer = null
    }
    await this._flushToStorageAsync()
  }

  /**
   * Force an immediate synchronous write to localStorage.
   * Use only in contexts where async is not possible (pagehide, beforeunload).
   */
  flushSync(): void {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer)
      this._saveTimer = null
    }
    this._flushToStorageSync()
  }

  /**
   * Load persisted session data from IndexedDB (primary) with localStorage
   * pending fallback merge. Handles one-time migration from legacy localStorage.
   */
  private async loadFromStorage(): Promise<void> {
    if (typeof window === 'undefined') {
      // SSR / test environment — no storage, mark hydrated immediately
      this._hydrated = true
      return
    }

    try {
      const result = await loadStoredFeedbackHistory()
      if (!result) return

      const { data, durableEventCount, hotspotCoveredCount } = result
      if (typeof data.sessionId === 'string') this.sessionId = data.sessionId
      if (typeof data.startTime === 'number') this.startTime = data.startTime
      if (Array.isArray(data.events)) this.events = data.events
      if (Array.isArray(data.hotspots)) {
        this.hotspots = new Map(data.hotspots)
        this.rebuildHotspotIndex()
      }

      // Replay events not covered by the stored hotspot snapshot.
      // hotspotCoveredCount tracks how many events the IDB hotspots
      // account for (pre-merge count). Events beyond that — whether
      // from a delta merge or a promoted session — need hotspot replay
      // so repeat-offender counts, cut-learning, etc. stay correct.
      let hotspotsRebuilt = false
      if (hotspotCoveredCount < this.events.length) {
        for (let i = hotspotCoveredCount; i < this.events.length; i++) {
          this.updateHotspot(this.events[i])
        }
        hotspotsRebuilt = true
      }

      // Set watermark to the durable count — NOT events.length.
      // If the delta merge didn't persist to IDB, the next pagehide
      // must re-write those events so they aren't lost.
      this._lastFlushedEventCount = durableEventCount

      // If we rebuilt hotspots, immediately persist the corrected snapshot
      // so a second reload sees consistent hotspot state (not stale).
      if (hotspotsRebuilt) {
        this._flushToStorageAsync().catch(() => { /* handled internally */ })
      }
    } catch (e) {
      // Invalid/corrupt data — start fresh
      console.warn('[FeedbackHistory] Failed to load from storage, starting fresh:', e)
    } finally {
      // Mark hydrated and replay any events that arrived during async load
      this._hydrated = true
      if (this._pendingEvents.length > 0) {
        const queued = this._pendingEvents
        this._pendingEvents = []
        for (const event of queued) {
          this.recordEvent(event)
        }
      }
    }
  }

  /**
   * Remove the pagehide listener and clear timers.
   * Call in test teardown to prevent listener accumulation across instances.
   */
  dispose(): void {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer)
      this._saveTimer = null
    }
    if (this._pagehideHandler && typeof window !== 'undefined') {
      window.removeEventListener('pagehide', this._pagehideHandler)
      this._pagehideHandler = null
    }
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let instance: FeedbackHistory | null = null

export function getFeedbackHistory(): FeedbackHistory {
  if (!instance) {
    instance = new FeedbackHistory()
  }
  return instance
}

/**
 * Await the singleton's initial IndexedDB hydration.
 * Callers that need persisted data before interacting (e.g. export, history panel)
 * should `await whenFeedbackHistoryReady()` first.
 *
 * Safe to call multiple times — resolves immediately after the first load completes.
 */
export function whenFeedbackHistoryReady(): Promise<void> {
  return getFeedbackHistory().whenReady()
}

/**
 * Record a feedback event from an Advisory
 */
export function recordFeedbackFromAdvisory(advisory: {
  trueFrequencyHz: number
  trueAmplitudeDb: number
  prominenceDb: number
  qEstimate: number
  severity: string
  confidence: number
  modalOverlapFactor?: number
  cumulativeGrowthDb?: number
  frequencyBand?: 'LOW' | 'MID' | 'HIGH'
  label: string
  advisory?: {
    geq?: { bandHz?: number; suggestedDb?: number }
    peq?: { q?: number; gainDb?: number }
  }
}): FeedbackEvent {
  return getFeedbackHistory().recordEvent({
    timestamp: Date.now(),
    frequencyHz: advisory.trueFrequencyHz,
    amplitudeDb: advisory.trueAmplitudeDb,
    prominenceDb: advisory.prominenceDb,
    qEstimate: advisory.qEstimate,
    severity: advisory.severity,
    confidence: advisory.confidence,
    modalOverlapFactor: advisory.modalOverlapFactor,
    cumulativeGrowthDb: advisory.cumulativeGrowthDb,
    frequencyBand: advisory.frequencyBand,
    label: advisory.label,
    wasActedOn: false,
    // Capture EQ recommendations at detection time
    geqBandHz: advisory.advisory?.geq?.bandHz,
    geqSuggestedDb: advisory.advisory?.geq?.suggestedDb,
    peqQ: advisory.advisory?.peq?.q,
    peqGainDb: advisory.advisory?.peq?.gainDb,
  })
}
