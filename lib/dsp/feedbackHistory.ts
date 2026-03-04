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

const STORAGE_KEY = 'killTheRing_feedbackHistory'
const FREQUENCY_GROUPING_CENTS = 50 // Group frequencies within 50 cents
const REPEAT_OFFENDER_THRESHOLD = 3 // 3+ occurrences = repeat offender
const MAX_EVENTS_PER_SESSION = 500 // Limit memory usage

// ============================================================================
// FEEDBACK HISTORY CLASS
// ============================================================================

export class FeedbackHistory {
  private sessionId: string
  private startTime: number
  private events: FeedbackEvent[] = []
  private hotspots: Map<number, FrequencyHotspot> = new Map()
  
  constructor() {
    this.sessionId = this.generateSessionId()
    this.startTime = Date.now()
    this.loadFromStorage()
  }

  /**
   * Record a new feedback event
   */
  recordEvent(event: Omit<FeedbackEvent, 'id'>): FeedbackEvent {
    const id = `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
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
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
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
      }
      // Use rounded frequency as key for grouping
      const key = Math.round(event.frequencyHz / 10) * 10
      this.hotspots.set(key, hotspot)
    }
    
    // Update hotspot statistics
    hotspot.occurrences++
    hotspot.events.push(event)
    hotspot.lastSeen = event.timestamp
    hotspot.maxAmplitudeDb = Math.max(hotspot.maxAmplitudeDb, event.amplitudeDb)
    hotspot.isRepeatOffender = hotspot.occurrences >= REPEAT_OFFENDER_THRESHOLD
    
    // Recalculate averages
    const allAmps = hotspot.events.map(e => e.amplitudeDb)
    hotspot.avgAmplitudeDb = allAmps.reduce((a, b) => a + b, 0) / allAmps.length
    
    const allConf = hotspot.events.map(e => e.confidence)
    hotspot.avgConfidence = allConf.reduce((a, b) => a + b, 0) / allConf.length
    
    // Update center frequency (weighted average) and fix Map key if it drifts
    const oldKey = Math.round(hotspot.centerFrequencyHz / 10) * 10
    const allFreqs = hotspot.events.map(e => e.frequencyHz)
    hotspot.centerFrequencyHz = allFreqs.reduce((a, b) => a + b, 0) / allFreqs.length
    const newKey = Math.round(hotspot.centerFrequencyHz / 10) * 10
    if (newKey !== oldKey) {
      this.hotspots.delete(oldKey)
      this.hotspots.set(newKey, hotspot)
    }
    
    // Update suggested cut based on history
    const allProminence = hotspot.events.map(e => e.prominenceDb)
    const maxProminence = Math.max(...allProminence)
    hotspot.suggestedCutDb = Math.min(maxProminence * 1.5 + (hotspot.occurrences - 1) * 0.5, 12)
  }

  private saveToStorage(): void {
    if (typeof window === 'undefined') return
    
    try {
      const data = {
        sessionId: this.sessionId,
        startTime: this.startTime,
        events: this.events,
        hotspots: Array.from(this.hotspots.entries()),
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch (e) {
      // Storage full or unavailable - silently fail
      console.warn('[FeedbackHistory] Failed to save to localStorage:', e)
    }
  }

  private loadFromStorage(): void {
    if (typeof window === 'undefined') return
    
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const data = JSON.parse(stored)
        this.sessionId = data.sessionId ?? this.sessionId
        this.startTime = data.startTime ?? this.startTime
        this.events = data.events ?? []
        
        // Reconstruct hotspots Map
        if (Array.isArray(data.hotspots)) {
          this.hotspots = new Map(data.hotspots)
        }
      }
    } catch (e) {
      // Invalid data - start fresh
      console.warn('[FeedbackHistory] Failed to load from localStorage:', e)
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
  })
}
