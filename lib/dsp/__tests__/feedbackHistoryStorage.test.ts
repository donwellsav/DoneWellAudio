// @vitest-environment jsdom
/**
 * Tests for feedbackHistoryStorage.ts — async/sync hybrid persistence adapter.
 *
 * Mocks the indexedDb.ts module to isolate localStorage logic.
 * Uses real localStorage via jsdom environment.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { StoredFeedbackHistory, PendingDelta, LoadResult } from '../feedbackHistoryStorage'

// Mock IndexedDB layer — isolate localStorage-only paths
vi.mock('@/lib/storage/indexedDb', () => ({
  getIndexedValue: vi.fn().mockResolvedValue(null),
  setIndexedValue: vi.fn().mockResolvedValue(undefined),
  deleteIndexedValue: vi.fn().mockResolvedValue(undefined),
}))

import {
  loadStoredFeedbackHistory,
  saveStoredFeedbackHistory,
  clearStoredFeedbackHistory,
  savePendingFeedbackHistory,
  clearPendingFeedbackHistory,
} from '../feedbackHistoryStorage'

import { getIndexedValue, setIndexedValue, deleteIndexedValue } from '@/lib/storage/indexedDb'

// ── Constants (must match feedbackHistoryStorage.ts) ─────────────────────────

const PENDING_KEY = 'dwa-feedback-history-pending'
const LEGACY_KEY = 'doneWellAudio_feedbackHistory'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeEvent(id: string, freqHz = 1000, timestamp = 1000) {
  return {
    id,
    timestamp,
    frequencyHz: freqHz,
    amplitudeDb: -20,
    prominenceDb: 8,
    qEstimate: 10,
    severity: 'moderate',
    confidence: 0.8,
    wasActedOn: false,
    label: 'Test',
  }
}

function makeStoredHistory(overrides: Partial<StoredFeedbackHistory> = {}): StoredFeedbackHistory {
  return {
    sessionId: 'session_test_123',
    startTime: 1000,
    events: [makeEvent('evt_1')],
    hotspots: [['hs_1000_1000', {
      centerFrequencyHz: 1000,
      occurrences: 1,
      events: [],
      firstSeen: 1000,
      lastSeen: 1000,
      maxAmplitudeDb: -20,
      avgAmplitudeDb: -20,
      avgConfidence: 0.8,
      suggestedCutDb: 6,
      isRepeatOffender: false,
      lastEventTime: 1000,
    }]],
    ...overrides,
  }
}

// ── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  // Default: IDB returns null (empty)
  vi.mocked(getIndexedValue).mockResolvedValue(null)
})

// ── Tests ────────────────────────────────────────────────────────────────────

describe('savePendingFeedbackHistory (delta-based)', () => {
  it('writes only delta events to localStorage', () => {
    const data = makeStoredHistory({
      events: [makeEvent('evt_1'), makeEvent('evt_2'), makeEvent('evt_3')],
    })
    // Simulate: first 2 events already flushed to IDB
    savePendingFeedbackHistory(data, 2)
    const raw = localStorage.getItem(PENDING_KEY)
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw!) as PendingDelta
    expect(parsed.sessionId).toBe('session_test_123')
    expect(parsed.deltaEvents).toHaveLength(1)
    expect(parsed.deltaEvents[0].id).toBe('evt_3')
    // Should NOT contain hotspots
    expect((parsed as unknown as Record<string, unknown>).hotspots).toBeUndefined()
    expect((parsed as unknown as Record<string, unknown>).events).toBeUndefined()
  })

  it('writes rollover marker even when no delta events exist', () => {
    const data = makeStoredHistory({ events: [makeEvent('evt_1')] })
    savePendingFeedbackHistory(data, 1) // all flushed — zero delta
    const raw = localStorage.getItem(PENDING_KEY)
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw!) as PendingDelta
    expect(parsed.deltaEvents).toHaveLength(0)
    expect(parsed.sessionId).toBe('session_test_123')
  })

  it('caps delta events at MAX_PENDING_DELTA_EVENTS (500, matches session cap)', () => {
    const events = Array.from({ length: 600 }, (_, i) => makeEvent(`evt_${i}`, 1000, 1000 + i))
    const data = makeStoredHistory({ events })
    savePendingFeedbackHistory(data, 0) // nothing flushed — degraded path
    const raw = localStorage.getItem(PENDING_KEY)
    const parsed = JSON.parse(raw!) as PendingDelta
    expect(parsed.deltaEvents).toHaveLength(500)
    // Should keep the most recent 500
    expect(parsed.deltaEvents[0].id).toBe('evt_100')
    expect(parsed.deltaEvents[499].id).toBe('evt_599')
  })

  it('preserves all delta events under the cap (no truncation)', () => {
    const events = Array.from({ length: 300 }, (_, i) => makeEvent(`evt_${i}`, 1000, 1000 + i))
    const data = makeStoredHistory({ events })
    savePendingFeedbackHistory(data, 0)
    const raw = localStorage.getItem(PENDING_KEY)
    const parsed = JSON.parse(raw!) as PendingDelta
    expect(parsed.deltaEvents).toHaveLength(300) // all 300 preserved, no truncation
  })

  it('writes all events as delta when flushedEventCount is 0', () => {
    const data = makeStoredHistory({
      events: [makeEvent('evt_1'), makeEvent('evt_2')],
    })
    savePendingFeedbackHistory(data, 0)
    const raw = localStorage.getItem(PENDING_KEY)
    const parsed = JSON.parse(raw!) as PendingDelta
    expect(parsed.deltaEvents).toHaveLength(2)
  })
})

describe('clearPendingFeedbackHistory', () => {
  it('removes pending key from localStorage', () => {
    const data = makeStoredHistory()
    savePendingFeedbackHistory(data, 0)
    expect(localStorage.getItem(PENDING_KEY)).not.toBeNull()
    clearPendingFeedbackHistory()
    expect(localStorage.getItem(PENDING_KEY)).toBeNull()
  })
})

describe('loadStoredFeedbackHistory', () => {
  it('returns null when no data exists anywhere', async () => {
    const result = await loadStoredFeedbackHistory()
    expect(result).toBeNull()
  })

  it('merges pending delta into IDB data (same session)', async () => {
    // IDB has 2 events
    const idbData = makeStoredHistory({
      sessionId: 'session_A',
      events: [makeEvent('evt_1'), makeEvent('evt_2')],
    })
    vi.mocked(getIndexedValue).mockResolvedValue(idbData)

    // Pending delta has 1 new event
    const delta: PendingDelta = {
      sessionId: 'session_A',
      startTime: 1000,
      deltaEvents: [makeEvent('evt_3', 2000, 2000)],
    }
    localStorage.setItem(PENDING_KEY, JSON.stringify(delta))

    const result = await loadStoredFeedbackHistory()

    expect(result).not.toBeNull()
    expect(result!.data.sessionId).toBe('session_A')
    // Should have merged: 2 from IDB + 1 delta = 3
    expect(result!.data.events).toHaveLength(3)
    expect(result!.data.events[2].id).toBe('evt_3')
    // All events durable after successful IDB write
    expect(result!.durableEventCount).toBe(3)
    // Hotspots only cover pre-merge IDB events — delta needs replay
    expect(result!.hotspotCoveredCount).toBe(2)
    // Should have persisted merged result to IDB
    expect(setIndexedValue).toHaveBeenCalled()
    // Should have cleared pending
    expect(localStorage.getItem(PENDING_KEY)).toBeNull()
  })

  it('deduplicates delta events already in IDB', async () => {
    const idbData = makeStoredHistory({
      sessionId: 'session_A',
      events: [makeEvent('evt_1'), makeEvent('evt_2')],
    })
    vi.mocked(getIndexedValue).mockResolvedValue(idbData)

    // Delta contains evt_2 (already in IDB) and evt_3 (new)
    const delta: PendingDelta = {
      sessionId: 'session_A',
      startTime: 1000,
      deltaEvents: [makeEvent('evt_2'), makeEvent('evt_3')],
    }
    localStorage.setItem(PENDING_KEY, JSON.stringify(delta))

    const result = await loadStoredFeedbackHistory()

    // Should have 3, not 4 — evt_2 is deduplicated
    expect(result!.data.events).toHaveLength(3)
    expect(result!.data.events.map(e => e.id)).toEqual(['evt_1', 'evt_2', 'evt_3'])
  })

  it('promotes delta to minimal session when IDB is empty', async () => {
    const delta: PendingDelta = {
      sessionId: 'session_B',
      startTime: 2000,
      deltaEvents: [makeEvent('evt_1')],
    }
    localStorage.setItem(PENDING_KEY, JSON.stringify(delta))

    const result = await loadStoredFeedbackHistory()

    expect(result).not.toBeNull()
    expect(result!.data.sessionId).toBe('session_B')
    expect(result!.data.events).toHaveLength(1)
    expect(result!.data.hotspots).toEqual([])
    // All events durable after successful IDB write
    expect(result!.durableEventCount).toBe(1)
    // Hotspots empty — all events need replay
    expect(result!.hotspotCoveredCount).toBe(0)
    // Should persist to IDB
    expect(setIndexedValue).toHaveBeenCalled()
    // Should clear pending
    expect(localStorage.getItem(PENDING_KEY)).toBeNull()
  })

  it('discards stale delta from different session', async () => {
    const idbData = makeStoredHistory({
      sessionId: 'session_A',
      events: [makeEvent('evt_1')],
    })
    vi.mocked(getIndexedValue).mockResolvedValue(idbData)

    const delta: PendingDelta = {
      sessionId: 'session_OLD',
      startTime: 500,
      deltaEvents: [makeEvent('evt_old')],
    }
    localStorage.setItem(PENDING_KEY, JSON.stringify(delta))

    const result = await loadStoredFeedbackHistory()

    expect(result!.data.sessionId).toBe('session_A')
    expect(result!.data.events).toHaveLength(1) // stale delta discarded
    expect(localStorage.getItem(PENDING_KEY)).toBeNull()
  })

  it('handles legacy StoredFeedbackHistory format in pending key', async () => {
    // Old format: full snapshot with events[] and hotspots[]
    const legacyPending = makeStoredHistory({ sessionId: 'legacy-pending' })
    localStorage.setItem(PENDING_KEY, JSON.stringify(legacyPending))

    // No IDB data — legacy pending promotes to session
    const result = await loadStoredFeedbackHistory()

    expect(result).not.toBeNull()
    expect(result!.data.sessionId).toBe('legacy-pending')
    expect(result!.data.events).toHaveLength(1)
  })

  it('loads from legacy localStorage key and migrates to IDB', async () => {
    const data = makeStoredHistory({ sessionId: 'legacy-session' })
    localStorage.setItem(LEGACY_KEY, JSON.stringify(data))

    const result = await loadStoredFeedbackHistory()

    expect(result).not.toBeNull()
    expect(result!.data.sessionId).toBe('legacy-session')
    expect(result!.durableEventCount).toBe(1)
    expect(setIndexedValue).toHaveBeenCalled()
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull()
  })

  it('falls back to IDB when no localStorage data exists', async () => {
    const idbData = makeStoredHistory({ sessionId: 'from-idb' })
    vi.mocked(getIndexedValue).mockResolvedValue(idbData)

    const result = await loadStoredFeedbackHistory()
    expect(result!.data.sessionId).toBe('from-idb')
    expect(result!.durableEventCount).toBe(1)
  })

  it('rejects invalid pending data shape', async () => {
    localStorage.setItem(PENDING_KEY, JSON.stringify({ garbage: true }))

    const result = await loadStoredFeedbackHistory()
    expect(result).toBeNull()
  })

  it('rejects corrupt JSON in pending', async () => {
    localStorage.setItem(PENDING_KEY, '{not valid json')

    const result = await loadStoredFeedbackHistory()
    expect(result).toBeNull()
  })
})

describe('long-session reload survival', () => {
  it('preserves all events across simulated pagehide + reload cycle', async () => {
    // Simulate: 200-event session, IDB flush happened at event 180
    const allEvents = Array.from({ length: 200 }, (_, i) =>
      makeEvent(`evt_${i}`, 1000 + (i % 31) * 100, 1000 + i * 100),
    )
    const fullData = makeStoredHistory({
      sessionId: 'long-session',
      events: allEvents,
    })

    // 1. IDB has first 180 events (last successful flush)
    const idbSnapshot = makeStoredHistory({
      sessionId: 'long-session',
      events: allEvents.slice(0, 180),
    })
    vi.mocked(getIndexedValue).mockResolvedValue(idbSnapshot)

    // 2. Pagehide writes delta (events 180-199)
    savePendingFeedbackHistory(fullData, 180)

    // Verify delta is small
    const raw = localStorage.getItem(PENDING_KEY)
    const delta = JSON.parse(raw!) as PendingDelta
    expect(delta.deltaEvents).toHaveLength(20)
    expect((delta as unknown as Record<string, unknown>).hotspots).toBeUndefined()

    // 3. Reload — load merges IDB + delta
    const result = await loadStoredFeedbackHistory()

    expect(result).not.toBeNull()
    expect(result!.data.events).toHaveLength(200) // ALL events preserved
    expect(result!.data.events[0].id).toBe('evt_0')
    expect(result!.data.events[199].id).toBe('evt_199')
    expect(result!.durableEventCount).toBe(200) // all persisted to IDB
  })

  it('preserves all events in degraded path (IDB never flushed, under cap)', async () => {
    // 500 events, no IDB flush ever happened (flushedCount=0)
    const allEvents = Array.from({ length: 500 }, (_, i) =>
      makeEvent(`evt_${i}`, 1000, 1000 + i),
    )
    const fullData = makeStoredHistory({
      sessionId: 'no-flush-session',
      events: allEvents,
    })

    savePendingFeedbackHistory(fullData, 0)

    const raw = localStorage.getItem(PENDING_KEY)
    const delta = JSON.parse(raw!) as PendingDelta
    // All 500 preserved (cap matches MAX_EVENTS_PER_SESSION)
    expect(delta.deltaEvents).toHaveLength(500)
    // Payload size check — ~100KB is acceptable for unload fallback
    expect(raw!.length).toBeLessThan(200_000)
  })

  it('retains pending delta in localStorage when IDB merge write fails', async () => {
    // IDB has 2 events
    const idbData = makeStoredHistory({
      sessionId: 'session_A',
      events: [makeEvent('evt_1'), makeEvent('evt_2')],
    })
    vi.mocked(getIndexedValue).mockResolvedValue(idbData)
    // IDB write will fail
    vi.mocked(setIndexedValue).mockRejectedValueOnce(new Error('IDB write failed'))

    // Pending delta has 1 new event
    const delta: PendingDelta = {
      sessionId: 'session_A',
      startTime: 1000,
      deltaEvents: [makeEvent('evt_3', 2000, 2000)],
    }
    localStorage.setItem(PENDING_KEY, JSON.stringify(delta))

    const result = await loadStoredFeedbackHistory()

    // In-memory result should still have merged events
    expect(result!.data.events).toHaveLength(3)
    // But pending should NOT be cleared since IDB write failed
    expect(localStorage.getItem(PENDING_KEY)).not.toBeNull()
    // Watermark should reflect only IDB-durable events (2), not all 3
    expect(result!.durableEventCount).toBe(2)
  })

  it('IDB-failure → continue session → pagehide preserves all data (end-to-end)', async () => {
    // Scenario: IDB is broken across multiple reloads.
    // 1. First session: IDB has 5 events, delta has 3 new events
    const idbData = makeStoredHistory({
      sessionId: 'session_X',
      events: Array.from({ length: 5 }, (_, i) => makeEvent(`evt_${i}`, 1000, 1000 + i * 100)),
    })
    vi.mocked(getIndexedValue).mockResolvedValue(idbData)
    vi.mocked(setIndexedValue).mockRejectedValueOnce(new Error('IDB permanently broken'))

    const delta: PendingDelta = {
      sessionId: 'session_X',
      startTime: 1000,
      deltaEvents: Array.from({ length: 3 }, (_, i) => makeEvent(`evt_${5 + i}`, 2000, 2000 + i * 100)),
    }
    localStorage.setItem(PENDING_KEY, JSON.stringify(delta))

    // 2. Load — merge succeeds in memory, IDB write fails
    const result = await loadStoredFeedbackHistory()
    expect(result!.data.events).toHaveLength(8)
    expect(result!.durableEventCount).toBe(5) // only original IDB events are durable

    // 3. Simulate: user continues session, adds 2 more events in memory
    result!.data.events.push(
      makeEvent('evt_8', 3000, 3000),
      makeEvent('evt_9', 3100, 3100),
    )

    // 4. Pagehide — writes delta from watermark (5) onward = 5 events
    savePendingFeedbackHistory(result!.data, result!.durableEventCount)

    const raw = localStorage.getItem(PENDING_KEY)
    const savedDelta = JSON.parse(raw!) as PendingDelta
    // All 5 undurable events preserved (evt_5..evt_9)
    expect(savedDelta.deltaEvents).toHaveLength(5)
    expect(savedDelta.deltaEvents.map(e => e.id)).toEqual([
      'evt_5', 'evt_6', 'evt_7', 'evt_8', 'evt_9',
    ])
  })

  it('promoted delta with IDB failure reports durableEventCount=0', async () => {
    vi.mocked(setIndexedValue).mockRejectedValueOnce(new Error('IDB broken'))

    const delta: PendingDelta = {
      sessionId: 'session_new',
      startTime: 5000,
      deltaEvents: [makeEvent('evt_1'), makeEvent('evt_2')],
    }
    localStorage.setItem(PENDING_KEY, JSON.stringify(delta))

    const result = await loadStoredFeedbackHistory()

    expect(result!.data.events).toHaveLength(2)
    expect(result!.durableEventCount).toBe(0) // nothing reached IDB
    // Pending retained for retry
    expect(localStorage.getItem(PENDING_KEY)).not.toBeNull()
  })
})

describe('saveStoredFeedbackHistory', () => {
  it('delegates to setIndexedValue', async () => {
    const data = makeStoredHistory()
    await saveStoredFeedbackHistory(data)
    expect(setIndexedValue).toHaveBeenCalledWith(
      'dwa-feedback-history',
      'current-session',
      data,
    )
  })
})

describe('clearStoredFeedbackHistory', () => {
  it('deletes from IDB and clears pending localStorage', async () => {
    const data = makeStoredHistory()
    savePendingFeedbackHistory(data, 0)
    await clearStoredFeedbackHistory()

    expect(deleteIndexedValue).toHaveBeenCalledWith('dwa-feedback-history', 'current-session')
    expect(localStorage.getItem(PENDING_KEY)).toBeNull()
  })
})

describe('session rollover edge cases', () => {
  it('newer pending session wins over stale IDB after clear/restart', async () => {
    // IDB has old session (startTime=1000)
    const oldIdb = makeStoredHistory({
      sessionId: 'old-session',
      startTime: 1000,
      events: [makeEvent('old_evt', 500, 1000)],
    })
    vi.mocked(getIndexedValue).mockResolvedValue(oldIdb)

    // Pending has newer session after clear() (startTime=5000)
    const delta: PendingDelta = {
      sessionId: 'new-session',
      startTime: 5000,
      deltaEvents: [makeEvent('new_evt', 2000, 5100)],
    }
    localStorage.setItem(PENDING_KEY, JSON.stringify(delta))

    const result = await loadStoredFeedbackHistory()

    // Newer pending wins — old IDB is replaced
    expect(result!.data.sessionId).toBe('new-session')
    expect(result!.data.events).toHaveLength(1)
    expect(result!.data.events[0].id).toBe('new_evt')
    // Hotspots empty — all events need replay
    expect(result!.hotspotCoveredCount).toBe(0)
    // Should have written new session to IDB
    expect(setIndexedValue).toHaveBeenCalled()
  })

  it('older pending session is discarded when IDB has newer data', async () => {
    // IDB has newer session (startTime=5000)
    const newIdb = makeStoredHistory({
      sessionId: 'new-session',
      startTime: 5000,
      events: [makeEvent('new_evt', 2000, 5100)],
    })
    vi.mocked(getIndexedValue).mockResolvedValue(newIdb)

    // Pending has older session (startTime=1000)
    const delta: PendingDelta = {
      sessionId: 'old-session',
      startTime: 1000,
      deltaEvents: [makeEvent('old_evt', 500, 1000)],
    }
    localStorage.setItem(PENDING_KEY, JSON.stringify(delta))

    const result = await loadStoredFeedbackHistory()

    // IDB wins — stale pending is discarded
    expect(result!.data.sessionId).toBe('new-session')
    expect(result!.data.events).toHaveLength(1)
    expect(localStorage.getItem(PENDING_KEY)).toBeNull()
  })

  it('successful delta merge still reports hotspotCoveredCount < total for replay', async () => {
    // IDB has 3 events with hotspots
    const idbData = makeStoredHistory({
      sessionId: 'session_A',
      events: [makeEvent('evt_1', 1000, 100), makeEvent('evt_2', 1000, 200), makeEvent('evt_3', 1000, 300)],
    })
    vi.mocked(getIndexedValue).mockResolvedValue(idbData)

    // Delta has 2 new events
    const delta: PendingDelta = {
      sessionId: 'session_A',
      startTime: 1000,
      deltaEvents: [makeEvent('evt_4', 1000, 400), makeEvent('evt_5', 1000, 500)],
    }
    localStorage.setItem(PENDING_KEY, JSON.stringify(delta))

    const result = await loadStoredFeedbackHistory()

    // All 5 events present and durable
    expect(result!.data.events).toHaveLength(5)
    expect(result!.durableEventCount).toBe(5)
    // But hotspots only cover pre-merge 3 — delta 2 need replay
    expect(result!.hotspotCoveredCount).toBe(3)
  })

  it('zero-event rollover marker prevents old session resurrection', async () => {
    // IDB has old session
    const oldIdb = makeStoredHistory({
      sessionId: 'old-session',
      startTime: 1000,
      events: [makeEvent('old_evt_1'), makeEvent('old_evt_2')],
    })
    vi.mocked(getIndexedValue).mockResolvedValue(oldIdb)

    // Pending is a zero-event rollover marker (clear() then immediate pagehide)
    const delta: PendingDelta = {
      sessionId: 'fresh-session',
      startTime: 5000,
      deltaEvents: [],
    }
    localStorage.setItem(PENDING_KEY, JSON.stringify(delta))

    const result = await loadStoredFeedbackHistory()

    // Fresh session wins — old events are gone
    expect(result!.data.sessionId).toBe('fresh-session')
    expect(result!.data.events).toHaveLength(0)
    expect(result!.data.hotspots).toEqual([])
    // Pending cleared
    expect(localStorage.getItem(PENDING_KEY)).toBeNull()
  })

  it('zero-event marker for same session is a no-op (does not wipe events)', async () => {
    // IDB has current session with events
    const idbData = makeStoredHistory({
      sessionId: 'session_A',
      startTime: 1000,
      events: [makeEvent('evt_1'), makeEvent('evt_2')],
    })
    vi.mocked(getIndexedValue).mockResolvedValue(idbData)

    // Pending is same session, zero events (all flushed before pagehide)
    const delta: PendingDelta = {
      sessionId: 'session_A',
      startTime: 1000,
      deltaEvents: [],
    }
    localStorage.setItem(PENDING_KEY, JSON.stringify(delta))

    const result = await loadStoredFeedbackHistory()

    // Same session — existing events preserved
    expect(result!.data.sessionId).toBe('session_A')
    expect(result!.data.events).toHaveLength(2)
    expect(localStorage.getItem(PENDING_KEY)).toBeNull()
  })
})
