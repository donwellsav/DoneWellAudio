/**
 * Feedback History Logger
 * Tracks which frequencies repeatedly cause problems in a venue/session
 * 
 * Features:
 * - Records all detected feedback events
 * - Groups by frequency (within tolerance)
 * - Tracks repeat offenders
 * - Persists to localStorage for session continuity
 * - Exports to CSV/JSON for post-show analysis
 */

import { hzToCents } from '@/lib/utils/pitchUtils'
import { HOTSPOT_COOLDOWN_MS, HOTSPOT_COOLDOWN_BY_MODE, POST_CUT_COOLDOWN_MS } from '@/lib/dsp/constants'

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

const STORAGE_KEY = 'doneWellAudio_feedbackHistory'
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
  private _mode: string = 'speech'
  /** Per-hotspot post-cut cooldown override expiry timestamps (keyed by hotspot map key) */
  private _postCutCooldowns: Map<string, number> = new Map()

  constructor() {
    this.sessionId = this.generateSessionId()
    this.startTime = Date.now()
    this.loadFromStorage()
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
    for (const [key, hotspot] of this.hotspots.entries()) {
      const cents = Math.abs(hzToCents(frequencyHz, hotspot.centerFrequencyHz))
      if (cents <= FREQUENCY_GROUPING_CENTS) {
        // Store expiry time on the same clock as event.timestamp
        this._postCutCooldowns.set(key, timestampMs + POST_CUT_COOLDOWN_MS)
        return
      }
    }
  }

  /**
   * Record a new feedback event
   */
  recordEvent(event: Omit<FeedbackEvent, 'id'>): FeedbackEvent {
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
    this._postCutCooldowns.clear()
    this.sessionId = this.generateSessionId()
    this.startTime = Date.now()
    this.saveToStorage()
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

  private findHotspotForFrequency(frequencyHz: number): FrequencyHotspot | undefined {
    for (const hotspot of this.hotspots.values()) {
      const cents = Math.abs(hzToCents(frequencyHz, hotspot.centerFrequencyHz))
      if (cents <= FREQUENCY_GROUPING_CENTS) {
        return hotspot
      }
    }
    return undefined
  }

  /**
   * Find the Map key for the hotspot matching a frequency.
   * Used internally for post-cut cooldown lookups.
   */
  private findHotspotKey(frequencyHz: number): string | undefined {
    for (const [key, hotspot] of this.hotspots.entries()) {
      const cents = Math.abs(hzToCents(frequencyHz, hotspot.centerFrequencyHz))
      if (cents <= FREQUENCY_GROUPING_CENTS) {
        return key
      }
    }
    return undefined
  }

  private updateHotspot(event: FeedbackEvent): void {
    // Find existing hotspot or create new one
    let hotspot = this.findHotspotForFrequency(event.frequencyHz)

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
      const key = `hs_${event.timestamp}_${Math.round(event.frequencyHz)}`
      this.hotspots.set(key, hotspot)
    }

    // Cooldown — skip if same hotspot fired too recently (prevents inflated counts).
    // Uses per-mode cooldown from HOTSPOT_COOLDOWN_BY_MODE, with a shorter
    // POST_CUT_COOLDOWN_MS override when a cut was recently applied.
    if (hotspot.lastEventTime > 0) {
      const hotspotKey = this.findHotspotKey(event.frequencyHz)
      const postCutExpiry = hotspotKey ? this._postCutCooldowns.get(hotspotKey) : undefined
      const cooldown = (postCutExpiry !== undefined && event.timestamp < postCutExpiry)
        ? POST_CUT_COOLDOWN_MS
        : this.getEffectiveCooldown()
      if ((event.timestamp - hotspot.lastEventTime) < cooldown) {
        return
      }
      // Clean up expired post-cut cooldown
      if (hotspotKey && postCutExpiry !== undefined && event.timestamp >= postCutExpiry) {
        this._postCutCooldowns.delete(hotspotKey)
      }
    }

    // Update hotspot statistics
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
    
    // Recalculate averages
    const allAmps = hotspot.events.map(e => e.amplitudeDb)
    hotspot.avgAmplitudeDb = allAmps.reduce((a, b) => a + b, 0) / allAmps.length
    
    const allConf = hotspot.events.map(e => e.confidence)
    hotspot.avgConfidence = allConf.reduce((a, b) => a + b, 0) / allConf.length
    
    // Update center frequency (weighted average) — key is stable (ID-based), no re-keying needed
    const allFreqs = hotspot.events.map(e => e.frequencyHz)
    hotspot.centerFrequencyHz = allFreqs.reduce((a, b) => a + b, 0) / allFreqs.length
    
    // Update suggested cut based on history
    const allProminence = hotspot.events.map(e => e.prominenceDb)
    const maxProminence = Math.max(...allProminence)
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
      this._flushToStorage()
    }, 1000)

    // Register pagehide flush once — ensures pending data survives tab close/reload
    if (!this._pagehideHandler) {
      this._pagehideHandler = () => {
        if (this._saveTimer) {
          clearTimeout(this._saveTimer)
          this._saveTimer = null
        }
        this._flushToStorage()
      }
      window.addEventListener('pagehide', this._pagehideHandler)
    }
  }

  private _flushToStorage(): void {
    try {
      const data = {
        sessionId: this.sessionId,
        startTime: this.startTime,
        events: this.events,
        hotspots: Array.from(this.hotspots.entries()),
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch (e) {
      // QuotaExceeded — prune oldest 50% of events and recompute hotspots
      if (e instanceof DOMException && e.name === 'QuotaExceededError') {
        const half = Math.floor(this.events.length / 2)
        if (half > 0) {
          this.events = this.events.slice(half)
          // Recompute hotspots from retained events so they stay consistent
          this.hotspots.clear()
          for (const event of this.events) {
            this.updateHotspot(event)
          }
          try {
            const data = {
              sessionId: this.sessionId,
              startTime: this.startTime,
              events: this.events,
              hotspots: Array.from(this.hotspots.entries()),
            }
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
            return
          } catch (retryErr) {
            console.warn('[FeedbackHistory] Retry after prune also failed:', retryErr)
          }
        }
      }
      console.warn('[FeedbackHistory] Failed to save to localStorage:', e)
    }
  }

  /**
   * Force an immediate synchronous write to localStorage.
   * Cancels any pending debounced save. Use in endSession / beforeunload
   * where we cannot rely on the 1s debounce completing.
   */
  flush(): void {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer)
      this._saveTimer = null
    }
    this._flushToStorage()
  }

  private loadFromStorage(): void {
    if (typeof window === 'undefined') return

    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const data = JSON.parse(stored)
        // Validate structure before trusting parsed data
        if (typeof data !== 'object' || data === null) return
        if (typeof data.sessionId === 'string') this.sessionId = data.sessionId
        if (typeof data.startTime === 'number') this.startTime = data.startTime
        // Validate events array — check first element has expected shape
        if (Array.isArray(data.events)) {
          if (data.events.length === 0 || (typeof data.events[0].frequencyHz === 'number' && typeof data.events[0].timestamp === 'number')) {
            this.events = data.events
          }
        }
        // Reconstruct hotspots Map — validate it's array of [key, value] pairs
        if (Array.isArray(data.hotspots) && (data.hotspots.length === 0 || (Array.isArray(data.hotspots[0]) && data.hotspots[0].length === 2))) {
          this.hotspots = new Map(data.hotspots)
        }
      }
    } catch (e) {
      // Invalid/corrupt data — start fresh, remove bad entry
      console.warn('[FeedbackHistory] Corrupt localStorage data, starting fresh:', e)
      try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
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
