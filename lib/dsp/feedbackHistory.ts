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
  private readonly _readyPromise: Promise<void>
  /** True once loadFromStorage() resolves — guards against event loss during hydration */
  private _hydrated = false
  /** Events queued during async hydration — flushed once loadFromStorage completes */
  private _pendingEvents: Array<Omit<FeedbackEvent, 'id'>> = []

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
    
    // Limit total events
    if (this.events.length > MAX_EVENTS_PER_SESSION) {
      this.events = this.events.slice(-MAX_EVENTS_PER_SESSION)
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
    this.sessionId = this.generateSessionId()
    this.startTime = Date.now()
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
      await saveStoredFeedbackHistory(this._getStorageData())
    } catch (e) {
      console.warn('[FeedbackHistory] Failed to save to IndexedDB:', e)
    }
  }

  /**
   * Synchronous write to localStorage — used ONLY in pagehide handler.
   * Next load will merge this pending data into IndexedDB.
   */
  private _flushToStorageSync(): void {
    savePendingFeedbackHistory(this._getStorageData())
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
      const data = await loadStoredFeedbackHistory()
      if (!data) return

      if (typeof data.sessionId === 'string') this.sessionId = data.sessionId
      if (typeof data.startTime === 'number') this.startTime = data.startTime
      if (Array.isArray(data.events)) this.events = data.events
      if (Array.isArray(data.hotspots)) {
        this.hotspots = new Map(data.hotspots)
        this.rebuildHotspotIndex()
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
