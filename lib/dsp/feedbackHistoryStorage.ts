/**
 * FeedbackHistory Storage Adapter
 *
 * Async persistence layer for FeedbackHistory using IndexedDB as primary store
 * with a synchronous localStorage fallback for pagehide unload safety.
 *
 * Normal operation: write to IndexedDB asynchronously (non-blocking).
 * pagehide: write to localStorage synchronously (small "pending" blob).
 * Next load: merge any pending localStorage data into IndexedDB, then clear it.
 *
 * This hybrid approach handles Safari's aggressive IDB transaction killing on
 * unload while keeping main-thread writes non-blocking during analysis.
 */

import { getIndexedValue, setIndexedValue, deleteIndexedValue } from '@/lib/storage/indexedDb'
import type { FeedbackEvent, FrequencyHotspot } from './feedbackHistory'

// ── Constants ────────────────────────────────────────────────────────────────

const IDB_NAME = 'dwa-feedback-history'
const IDB_KEY = 'current-session'
const PENDING_KEY = 'dwa-feedback-history-pending'
/** Legacy localStorage key — checked once for migration, then deleted */
const LEGACY_KEY = 'doneWellAudio_feedbackHistory'

// ── Types ────────────────────────────────────────────────────────────────────

export interface StoredFeedbackHistory {
  sessionId: string
  startTime: number
  events: FeedbackEvent[]
  hotspots: Array<[string, FrequencyHotspot]>
}

// ── IndexedDB (primary, async) ───────────────────────────────────────────────

/** Load session data from IndexedDB, merging any pending localStorage fallback. */
export async function loadStoredFeedbackHistory(): Promise<StoredFeedbackHistory | null> {
  // 1. Check for pending pagehide fallback data (most recent — takes priority)
  const pending = readPendingFeedbackHistory()
  if (pending) {
    // Persist to IDB, then clear localStorage. Clear ONLY after successful write
    // so data isn't lost if IDB is unavailable (e.g. incognito Safari).
    try {
      await setIndexedValue(IDB_NAME, IDB_KEY, pending)
      clearPendingFeedbackHistory()
    } catch { /* keep pending in localStorage for next attempt */ }
    // Also clean up legacy key if present (migration complete)
    clearLegacyLocalStorage()
    return pending
  }

  // 2. Check for legacy localStorage data (one-time migration)
  const legacy = readLegacyLocalStorage()
  if (legacy) {
    try {
      await setIndexedValue(IDB_NAME, IDB_KEY, legacy)
      clearLegacyLocalStorage()
    } catch { /* keep legacy in localStorage for next attempt */ }
    return legacy
  }

  // 3. Load from IndexedDB (primary store)
  return getIndexedValue<StoredFeedbackHistory | null>(IDB_NAME, IDB_KEY, null)
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
 * Synchronous write to localStorage — used ONLY in pagehide handler where
 * async IDB transactions may be killed by the browser (especially Safari).
 */
export function savePendingFeedbackHistory(data: StoredFeedbackHistory): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(PENDING_KEY, JSON.stringify(data))
  } catch {
    // Best-effort unload fallback only — quota or unavailable
  }
}

function readPendingFeedbackHistory(): StoredFeedbackHistory | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(PENDING_KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    if (isValidStoredHistory(data)) return data
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
