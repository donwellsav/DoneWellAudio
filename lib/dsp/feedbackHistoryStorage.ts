/**
 * FeedbackHistory Storage Adapter
 *
 * Async persistence layer for FeedbackHistory using IndexedDB as primary store
 * with a synchronous localStorage fallback for pagehide unload safety.
 *
 * Normal operation: write full snapshot to IndexedDB asynchronously (non-blocking).
 * pagehide: write only the DELTA (events since last IDB flush) to localStorage.
 * Next load: load from IDB, then merge any pending delta events (deduplicated by ID).
 *
 * This hybrid approach handles Safari's aggressive IDB transaction killing on
 * unload while keeping main-thread writes non-blocking during analysis.
 *
 * The pending blob is bounded by construction: at most ~1s of new events (the
 * debounce interval) with no hotspots, so serialization cost is negligible.
 */

import { getIndexedValue, setIndexedValue, deleteIndexedValue } from '@/lib/storage/indexedDb'
import type { FeedbackEvent, FrequencyHotspot } from './feedbackHistory'

// ── Constants ────────────────────────────────────────────────────────────────

const IDB_NAME = 'dwa-feedback-history'
const IDB_KEY = 'current-session'
const PENDING_KEY = 'dwa-feedback-history-pending'
/** Legacy localStorage key — checked once for migration, then deleted */
const LEGACY_KEY = 'doneWellAudio_feedbackHistory'

/** Hard cap on total events in the pending blob — defense-in-depth.
 *  Matches MAX_EVENTS_PER_SESSION (500) so the delta can never exceed
 *  the session cap. Under normal operation (IDB flushing every 1s),
 *  the delta is <10 events. This cap only protects against the degraded
 *  path where IDB never accepts a write (private mode, quota exceeded). */
const MAX_PENDING_DELTA_EVENTS = 500

// ── Types ────────────────────────────────────────────────────────────────────

/** Full session snapshot — written to IndexedDB during normal operation. */
export interface StoredFeedbackHistory {
  sessionId: string
  startTime: number
  events: FeedbackEvent[]
  hotspots: Array<[string, FrequencyHotspot]>
}

/** Lightweight delta — written to localStorage on pagehide.
 *  Contains only events that arrived AFTER the last successful IDB flush.
 *  No hotspots — they're already in the IDB snapshot and will be reconstructed
 *  from the merged event list on the next load. */
export interface PendingDelta {
  sessionId: string
  startTime: number
  /** Events since the last IDB flush (bounded by MAX_PENDING_DELTA_EVENTS) */
  deltaEvents: FeedbackEvent[]
}

/** Result of loading session data — includes durability metadata. */
export interface LoadResult {
  data: StoredFeedbackHistory
  /** Number of events confirmed durable in IndexedDB. Events beyond this
   *  index were merged from a pending delta but may not have been persisted.
   *  Used by FeedbackHistory to set the pagehide flush watermark correctly. */
  durableEventCount: number
  /** Number of events whose hotspot aggregates are already computed in
   *  data.hotspots. Events beyond this index need hotspot replay.
   *  Typically equals the IDB snapshot's event count before delta merge. */
  hotspotCoveredCount: number
}

// ── IndexedDB (primary, async) ───────────────────────────────────────────────

/** Load session data from IndexedDB, merging any pending delta from localStorage.
 *  Returns durability metadata so callers know which events are actually in IDB. */
export async function loadStoredFeedbackHistory(): Promise<LoadResult | null> {
  // 1. Check for legacy localStorage data (one-time migration — takes priority)
  const legacy = readLegacyLocalStorage()
  if (legacy) {
    try {
      await setIndexedValue(IDB_NAME, IDB_KEY, legacy)
      clearLegacyLocalStorage()
    } catch { /* keep legacy in localStorage for next attempt */ }
    clearPendingFeedbackHistory() // stale delta from previous schema
    return { data: legacy, durableEventCount: legacy.events.length, hotspotCoveredCount: legacy.events.length }
  }

  // 2. Load from IndexedDB (primary store)
  const idbData = await getIndexedValue<StoredFeedbackHistory | null>(IDB_NAME, IDB_KEY, null)

  // 3. Check for pending delta from pagehide
  const pending = readPendingDelta()
  if (pending) {
    // Handle session rollover markers (zero-event pending after clear/restart).
    // Even with no delta events, the pending blob proves a session change happened.
    if (pending.deltaEvents.length === 0) {
      if (idbData && idbData.sessionId !== pending.sessionId && pending.startTime >= idbData.startTime) {
        // Rollover marker — newer session started but had no events yet.
        // Replace old IDB data with empty new session.
        const fresh: StoredFeedbackHistory = {
          sessionId: pending.sessionId,
          startTime: pending.startTime,
          events: [],
          hotspots: [],
        }
        try {
          await setIndexedValue(IDB_NAME, IDB_KEY, fresh)
          clearPendingFeedbackHistory()
          return { data: fresh, durableEventCount: 0, hotspotCoveredCount: 0 }
        } catch {
          return { data: fresh, durableEventCount: 0, hotspotCoveredCount: 0 }
        }
      }
      // Same session or older — nothing to merge, clean up
      clearPendingFeedbackHistory()
      if (!idbData) return null
      return { data: idbData, durableEventCount: idbData.events.length, hotspotCoveredCount: idbData.events.length }
    }

    if (idbData && idbData.sessionId === pending.sessionId) {
      // Same session — merge delta events into IDB snapshot (deduplicate by ID)
      const durableCount = idbData.events.length // before merge
      const existingIds = new Set(idbData.events.map(e => e.id))
      const newEvents = pending.deltaEvents.filter(e => !existingIds.has(e.id))
      if (newEvents.length > 0) {
        idbData.events.push(...newEvents)
        // Persist the merged result to IDB so delta is durable.
        // Only clear pending AFTER successful write — if IDB fails,
        // the delta stays in localStorage for retry on next load.
        try {
          await setIndexedValue(IDB_NAME, IDB_KEY, idbData)
          clearPendingFeedbackHistory()
          // Merge persisted — all events are now durable
          // Hotspots still only cover pre-merge events — delta needs replay
          return { data: idbData, durableEventCount: idbData.events.length, hotspotCoveredCount: durableCount }
        } catch {
          // IDB write failed — merged events are in memory but NOT durable.
          // Watermark stays at pre-merge count so next pagehide re-writes the delta.
          return { data: idbData, durableEventCount: durableCount, hotspotCoveredCount: durableCount }
        }
      } else {
        // No new events to merge — safe to clear stale pending
        clearPendingFeedbackHistory()
      }
      return { data: idbData, durableEventCount: idbData.events.length, hotspotCoveredCount: idbData.events.length }
    } else if (!idbData) {
      // No IDB data — promote delta to a minimal session (IDB was never flushed)
      const promoted: StoredFeedbackHistory = {
        sessionId: pending.sessionId,
        startTime: pending.startTime,
        events: pending.deltaEvents,
        hotspots: [],
      }
      try {
        await setIndexedValue(IDB_NAME, IDB_KEY, promoted)
        clearPendingFeedbackHistory()
        // Hotspots empty — all events need replay
        return { data: promoted, durableEventCount: promoted.events.length, hotspotCoveredCount: 0 }
      } catch {
        return { data: promoted, durableEventCount: 0, hotspotCoveredCount: 0 }
      }
    } else {
      // Different session IDs — resolve by freshness.
      // After clear()/startNewSession(), the pending blob may be the newest
      // state while IDB still holds the old session. Prefer the newer one.
      if (pending.startTime >= idbData.startTime) {
        // Pending is newer (post-clear/restart) — promote it, discard stale IDB
        const promoted: StoredFeedbackHistory = {
          sessionId: pending.sessionId,
          startTime: pending.startTime,
          events: pending.deltaEvents,
          hotspots: [],
        }
        try {
          await setIndexedValue(IDB_NAME, IDB_KEY, promoted)
          clearPendingFeedbackHistory()
          return { data: promoted, durableEventCount: promoted.events.length, hotspotCoveredCount: 0 }
        } catch {
          return { data: promoted, durableEventCount: 0, hotspotCoveredCount: 0 }
        }
      }
      // Pending is older — truly stale, discard it
      clearPendingFeedbackHistory()
      return { data: idbData, durableEventCount: idbData.events.length, hotspotCoveredCount: idbData.events.length }
    }
  }

  // No pending delta — return IDB data as-is
  if (!idbData) return null
  return { data: idbData, durableEventCount: idbData.events.length, hotspotCoveredCount: idbData.events.length }
}

/** Save session data to IndexedDB asynchronously. */
export async function saveStoredFeedbackHistory(data: StoredFeedbackHistory): Promise<void> {
  await setIndexedValue(IDB_NAME, IDB_KEY, data)
}

/** Delete session data from IndexedDB. */
export async function clearStoredFeedbackHistory(): Promise<void> {
  await deleteIndexedValue(IDB_NAME, IDB_KEY)
  clearPendingFeedbackHistory()
}

// ── localStorage fallback (sync, for pagehide) ──────────────────────────────

/**
 * Synchronous write of delta events to localStorage — used ONLY in pagehide
 * handler where async IDB transactions may be killed by the browser.
 *
 * Only writes events since the last IDB flush (identified by flushedEventCount).
 * No hotspots — they're already persisted in the IDB snapshot.
 * Bounded by MAX_PENDING_DELTA_EVENTS for defense-in-depth.
 */
export function savePendingFeedbackHistory(data: StoredFeedbackHistory, flushedEventCount: number): void {
  if (typeof window === 'undefined') return
  try {
    const deltaEvents = data.events.slice(flushedEventCount)

    // Always write the marker — even with zero delta events.
    // After clear()/startNewSession(), the pending blob's sessionId/startTime
    // is the only proof the rollover happened if the tab closes before the
    // debounced IDB write fires. Without this marker, the old IDB session
    // would resurrect on reload.
    const capped = deltaEvents.length > MAX_PENDING_DELTA_EVENTS
      ? deltaEvents.slice(-MAX_PENDING_DELTA_EVENTS)
      : deltaEvents

    const delta: PendingDelta = {
      sessionId: data.sessionId,
      startTime: data.startTime,
      deltaEvents: capped,
    }
    window.localStorage.setItem(PENDING_KEY, JSON.stringify(delta))
  } catch {
    // Best-effort unload fallback only — quota or unavailable
  }
}

function readPendingDelta(): PendingDelta | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(PENDING_KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    // Support both new PendingDelta schema and legacy StoredFeedbackHistory
    if (isValidPendingDelta(data)) return data
    if (isValidStoredHistory(data)) {
      // Legacy format — convert to delta (all events are "new")
      return {
        sessionId: data.sessionId,
        startTime: data.startTime,
        deltaEvents: data.events,
      }
    }
    return null
  } catch {
    return null
  }
}

export function clearPendingFeedbackHistory(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(PENDING_KEY)
  } catch {
    // Best-effort cleanup
  }
}

// ── Legacy migration ─────────────────────────────────────────────────────────

function readLegacyLocalStorage(): StoredFeedbackHistory | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(LEGACY_KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    if (isValidStoredHistory(data)) return data
    return null
  } catch {
    return null
  }
}

function clearLegacyLocalStorage(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(LEGACY_KEY)
  } catch {
    // Best-effort cleanup
  }
}

// ── Validation ───────────────────────────────────────────────────────────────

function isValidPendingDelta(data: unknown): data is PendingDelta {
  if (typeof data !== 'object' || data === null) return false
  const d = data as Record<string, unknown>
  if (typeof d.sessionId !== 'string') return false
  if (typeof d.startTime !== 'number') return false
  if (!Array.isArray(d.deltaEvents)) return false
  // Spot-check first event shape if present
  if (d.deltaEvents.length > 0) {
    const first = d.deltaEvents[0] as Record<string, unknown>
    if (typeof first.frequencyHz !== 'number' || typeof first.timestamp !== 'number') return false
  }
  return true
}

function isValidStoredHistory(data: unknown): data is StoredFeedbackHistory {
  if (typeof data !== 'object' || data === null) return false
  const d = data as Record<string, unknown>
  if (typeof d.sessionId !== 'string') return false
  if (typeof d.startTime !== 'number') return false
  if (!Array.isArray(d.events)) return false
  if (!Array.isArray(d.hotspots)) return false
  // Spot-check first event shape if present
  if (d.events.length > 0) {
    const first = d.events[0] as Record<string, unknown>
    if (typeof first.frequencyHz !== 'number' || typeof first.timestamp !== 'number') return false
  }
  // Spot-check hotspots shape (array of [key, value] pairs)
  if (d.hotspots.length > 0) {
    const first = d.hotspots[0]
    if (!Array.isArray(first) || first.length !== 2) return false
  }
  return true
}
