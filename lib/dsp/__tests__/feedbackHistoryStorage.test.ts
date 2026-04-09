// @vitest-environment jsdom
/**
 * Tests for feedbackHistoryStorage.ts — async/sync hybrid persistence adapter.
 *
 * Mocks the indexedDb.ts module to isolate localStorage logic.
 * Uses real localStorage via jsdom environment.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { StoredFeedbackHistory } from '../feedbackHistoryStorage'

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

function makeStoredHistory(overrides: Partial<StoredFeedbackHistory> = {}): StoredFeedbackHistory {
  return {
    sessionId: 'session_test_123',
    startTime: 1000,
    events: [{
      id: 'evt_1',
      timestamp: 1000,
      frequencyHz: 1000,
      amplitudeDb: -20,
      prominenceDb: 8,
      qEstimate: 10,
      severity: 'moderate',
      confidence: 0.8,
      wasActedOn: false,
      label: 'Test',
    }],
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

describe('savePendingFeedbackHistory', () => {
  it('writes to localStorage under pending key', () => {
    const data = makeStoredHistory()
    savePendingFeedbackHistory(data)
    const raw = localStorage.getItem(PENDING_KEY)
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw!)
    expect(parsed.sessionId).toBe('session_test_123')
    expect(parsed.events).toHaveLength(1)
  })
})

describe('clearPendingFeedbackHistory', () => {
  it('removes pending key from localStorage', () => {
    savePendingFeedbackHistory(makeStoredHistory())
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

  it('loads from pending localStorage and merges to IDB', async () => {
    const data = makeStoredHistory({ sessionId: 'pending-session' })
    savePendingFeedbackHistory(data)

    const result = await loadStoredFeedbackHistory()

    expect(result).not.toBeNull()
    expect(result!.sessionId).toBe('pending-session')
    // Should have written to IDB
    expect(setIndexedValue).toHaveBeenCalledWith(
      'dwa-feedback-history',
      'current-session',
      expect.objectContaining({ sessionId: 'pending-session' }),
    )
    // Should have cleared pending
    expect(localStorage.getItem(PENDING_KEY)).toBeNull()
  })

  it('loads from legacy localStorage and migrates to IDB', async () => {
    const data = makeStoredHistory({ sessionId: 'legacy-session' })
    localStorage.setItem(LEGACY_KEY, JSON.stringify(data))

    const result = await loadStoredFeedbackHistory()

    expect(result).not.toBeNull()
    expect(result!.sessionId).toBe('legacy-session')
    // Should have written to IDB
    expect(setIndexedValue).toHaveBeenCalled()
    // Should have cleared legacy key
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull()
  })

  it('prefers pending over IDB data', async () => {
    const pending = makeStoredHistory({ sessionId: 'pending' })
    savePendingFeedbackHistory(pending)

    const idbData = makeStoredHistory({ sessionId: 'from-idb' })
    vi.mocked(getIndexedValue).mockResolvedValue(idbData)

    const result = await loadStoredFeedbackHistory()
    // Pending takes priority — short-circuits before IDB read
    expect(result!.sessionId).toBe('pending')
  })

  it('falls back to IDB when no localStorage data exists', async () => {
    const idbData = makeStoredHistory({ sessionId: 'from-idb' })
    vi.mocked(getIndexedValue).mockResolvedValue(idbData)

    const result = await loadStoredFeedbackHistory()
    expect(result!.sessionId).toBe('from-idb')
  })

  it('keeps pending in localStorage if IDB write fails', async () => {
    const data = makeStoredHistory({ sessionId: 'keep-me' })
    savePendingFeedbackHistory(data)
    vi.mocked(setIndexedValue).mockRejectedValueOnce(new Error('IDB write failed'))

    const result = await loadStoredFeedbackHistory()
    expect(result!.sessionId).toBe('keep-me')
    // Pending should NOT be cleared since IDB write failed
    expect(localStorage.getItem(PENDING_KEY)).not.toBeNull()
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
    savePendingFeedbackHistory(makeStoredHistory())
    await clearStoredFeedbackHistory()

    expect(deleteIndexedValue).toHaveBeenCalledWith('dwa-feedback-history', 'current-session')
    expect(localStorage.getItem(PENDING_KEY)).toBeNull()
  })
})
