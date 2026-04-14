/**
 * Tests for FeedbackHistory per-mode cooldown and post-cut cooldown override.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock the IndexedDB storage adapter so FeedbackHistory hydrates instantly
vi.mock('@/lib/dsp/feedbackHistoryStorage', () => ({
  loadStoredFeedbackHistory: vi.fn().mockResolvedValue(null),
  saveStoredFeedbackHistory: vi.fn().mockResolvedValue(undefined),
  clearStoredFeedbackHistory: vi.fn().mockResolvedValue(undefined),
  savePendingFeedbackHistory: vi.fn(),
  clearPendingFeedbackHistory: vi.fn(),
}))

import {
  FeedbackHistory,
  COMPANION_RETRY_MAX_CUT_DB,
  COMPANION_SUCCESS_WINDOW_MS,
} from '@/lib/dsp/feedbackHistory'
import type { FeedbackEvent } from '@/lib/dsp/feedbackHistory'
import {
  HOTSPOT_COOLDOWN_MS,
  HOTSPOT_COOLDOWN_BY_MODE,
  POST_CUT_COOLDOWN_MS,
} from '@/lib/dsp/constants'

// Stub localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value }),
    removeItem: vi.fn((key: string) => { delete store[key] }),
    clear: vi.fn(() => { store = {} }),
  }
})()

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock })

function makeEvent(
  frequencyHz: number,
  timestamp: number,
  overrides: Partial<Omit<FeedbackEvent, 'id'>> = {},
): Omit<FeedbackEvent, 'id'> {
  return {
    timestamp,
    frequencyHz,
    amplitudeDb: -30,
    prominenceDb: 8,
    qEstimate: 10,
    severity: 'moderate',
    confidence: 0.8,
    wasActedOn: false,
    label: 'Test',
    ...overrides,
  }
}

describe('FeedbackHistory — mode and cooldown', () => {
  let history: FeedbackHistory

  beforeEach(async () => {
    localStorageMock.clear()
    history = new FeedbackHistory()
    // Flush the async hydration — mock resolves as microtask
    await history.whenReady()
  })

  it('defaults to speech mode', () => {
    expect(history.getMode()).toBe('speech')
  })

  it('setMode updates the mode', () => {
    history.setMode('liveMusic')
    expect(history.getMode()).toBe('liveMusic')
  })

  it('returns per-mode cooldown for known modes', () => {
    for (const [mode, expected] of Object.entries(HOTSPOT_COOLDOWN_BY_MODE)) {
      history.setMode(mode)
      expect(history.getEffectiveCooldown()).toBe(expected)
    }
  })

  it('falls back to HOTSPOT_COOLDOWN_MS for unknown mode', () => {
    history.setMode('unknownMode')
    expect(history.getEffectiveCooldown()).toBe(HOTSPOT_COOLDOWN_MS)
  })

  it('respects per-mode cooldown in monitors mode (1000 ms)', () => {
    history.setMode('monitors')
    const base = 100_000

    history.recordEvent(makeEvent(1000, base))
    expect(history.getOccurrenceCount(1000)).toBe(1)

    // 500 ms later — within 1000 ms cooldown, skipped
    history.recordEvent(makeEvent(1000, base + 500))
    expect(history.getOccurrenceCount(1000)).toBe(1)

    // 1001 ms later — past cooldown, recorded
    history.recordEvent(makeEvent(1000, base + 1001))
    expect(history.getOccurrenceCount(1000)).toBe(2)
  })

  it('respects per-mode cooldown in liveMusic mode (5000 ms)', () => {
    history.setMode('liveMusic')
    const base = 100_000

    history.recordEvent(makeEvent(2000, base))
    expect(history.getOccurrenceCount(2000)).toBe(1)

    history.recordEvent(makeEvent(2000, base + 3000))
    expect(history.getOccurrenceCount(2000)).toBe(1)

    history.recordEvent(makeEvent(2000, base + 5001))
    expect(history.getOccurrenceCount(2000)).toBe(2)
  })

  it('markCutApplied shortens cooldown to POST_CUT_COOLDOWN_MS', () => {
    history.setMode('speech') // normal cooldown = 3000 ms
    const base = 100_000

    history.recordEvent(makeEvent(1000, base))
    expect(history.getOccurrenceCount(1000)).toBe(1)

    // Apply cut — expiry = base + 100 + POST_CUT_COOLDOWN_MS = base + 600
    const dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(base + 100)
    history.markCutApplied(1000)
    dateNowSpy.mockRestore()

    // Event at base + 501: within post-cut window (< base+600),
    // and elapsed since last event = 501 >= POST_CUT_COOLDOWN_MS (500), so accepted
    history.recordEvent(makeEvent(1000, base + POST_CUT_COOLDOWN_MS + 1))
    expect(history.getOccurrenceCount(1000)).toBe(2)
  })

  it('post-cut cooldown still blocks events within POST_CUT_COOLDOWN_MS', () => {
    history.setMode('speech')
    const base = 100_000

    history.recordEvent(makeEvent(1000, base))

    const dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(base + 50)
    history.markCutApplied(1000)
    dateNowSpy.mockRestore()

    // Event at base + 200: within post-cut window AND elapsed = 200 < 500, blocked
    history.recordEvent(makeEvent(1000, base + 200))
    expect(history.getOccurrenceCount(1000)).toBe(1)
  })

  it('post-cut cooldown expires and reverts to per-mode cooldown', () => {
    history.setMode('liveMusic') // normal cooldown = 5000 ms
    const base = 100_000

    history.recordEvent(makeEvent(1000, base))

    const dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(base + 10)
    history.markCutApplied(1000)
    dateNowSpy.mockRestore()

    // Post-cut expiry = base + 10 + 500 = base + 510
    // Event at base + 700: past expiry, reverts to 5000 ms mode cooldown
    // elapsed = 700 < 5000, blocked
    history.recordEvent(makeEvent(1000, base + 700))
    expect(history.getOccurrenceCount(1000)).toBe(1)
  })

  it('markCutApplied on unknown frequency is a no-op', () => {
    history.setMode('speech')
    const base = 100_000

    history.recordEvent(makeEvent(1000, base))

    const dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(base + 50)
    history.markCutApplied(5000)
    dateNowSpy.mockRestore()

    // Normal 3000 ms speech cooldown still applies
    history.recordEvent(makeEvent(1000, base + 1000))
    expect(history.getOccurrenceCount(1000)).toBe(1)
  })

  it('clear() removes post-cut cooldowns', () => {
    history.setMode('speech')
    const base = 100_000

    history.recordEvent(makeEvent(1000, base))

    const dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(base + 10)
    history.markCutApplied(1000)
    dateNowSpy.mockRestore()

    history.clear()

    history.recordEvent(makeEvent(1000, base + 100))
    expect(history.getOccurrenceCount(1000)).toBe(1)
  })

  it('peeks retry depth without mutating pending retry state', () => {
    const base = 100_000

    history.recordEvent(makeEvent(1000, base))
    history.markCompanionApplied({
      frequencyHz: 1000,
      gainDb: -6,
      bandIndex: 3,
      advisoryId: 'adv-1',
      at: base + 100,
    })

    const first = history.peekRetryCompanionCut(1000, base + 200)
    const second = history.peekRetryCompanionCut(1000, base + 200)

    expect(first).toEqual({
      nextGainDb: -9,
      retryCount: 1,
      advisoryId: 'adv-1',
      bandIndex: 3,
    })
    expect(second).toEqual(first)
  })

  it('clamps retry depth to the live Companion safety ceiling', () => {
    const base = 100_000

    history.recordEvent(makeEvent(1000, base))
    history.markCompanionApplied({
      frequencyHz: 1000,
      gainDb: COMPANION_RETRY_MAX_CUT_DB,
      bandIndex: 3,
      advisoryId: 'adv-1',
      at: base + 100,
    })

    expect(history.peekRetryCompanionCut(1000, base + 200)).toBeNull()
    expect(history.consumeRetryCompanionCut(1000, base + 200)).toBeNull()
  })

  it('uses the module-reported maxCutDb when calculating retries', () => {
    const base = 100_000

    history.recordEvent(makeEvent(1000, base))
    history.markCompanionApplied({
      frequencyHz: 1000,
      gainDb: -6,
      maxCutDb: -9,
      bandIndex: 3,
      advisoryId: 'adv-1',
      at: base + 100,
    })

    expect(history.peekRetryCompanionCut(1000, base + 200)).toEqual({
      nextGainDb: -9,
      retryCount: 1,
      advisoryId: 'adv-1',
      bandIndex: 3,
    })
    expect(history.consumeRetryCompanionCut(1000, base + 200)).toEqual({
      nextGainDb: -9,
      retryCount: 1,
      advisoryId: 'adv-1',
      bandIndex: 3,
    })
    expect(history.peekRetryCompanionCut(1000, base + 300)).toBeNull()
  })

  it('advances retry depth only after a deeper cut is actually applied', () => {
    const base = 100_000

    history.recordEvent(makeEvent(1000, base))
    history.markCompanionApplied({
      frequencyHz: 1000,
      gainDb: -6,
      bandIndex: 3,
      advisoryId: 'adv-1',
      at: base + 100,
    })

    expect(history.peekRetryCompanionCut(1000, base + 200)).toEqual({
      nextGainDb: -9,
      retryCount: 1,
      advisoryId: 'adv-1',
      bandIndex: 3,
    })

    history.markCompanionApplied({
      frequencyHz: 1000,
      gainDb: -9,
      bandIndex: 3,
      advisoryId: 'adv-1',
      at: base + 250,
    })

    expect(history.peekRetryCompanionCut(1000, base + 350)).toEqual({
      nextGainDb: -12,
      retryCount: 2,
      advisoryId: 'adv-1',
      bandIndex: 3,
    })
  })

  it('cancels pending retry verification once a Companion cut is cleared', () => {
    const base = 100_000

    history.recordEvent(makeEvent(1000, base))
    history.markCompanionApplied({
      frequencyHz: 1000,
      gainDb: -6,
      bandIndex: 3,
      advisoryId: 'adv-1',
      at: base + 100,
    })

    expect(history.peekRetryCompanionCut(1000, base + 200)).toEqual({
      nextGainDb: -9,
      retryCount: 1,
      advisoryId: 'adv-1',
      bandIndex: 3,
    })

    expect(history.clearCompanionPendingCut('adv-1')).toBe(true)
    expect(history.peekRetryCompanionCut(1000, base + 200)).toBeNull()
    expect(history.reapCompanionCuts(base + COMPANION_SUCCESS_WINDOW_MS + 200)).toBe(false)
    expect(history.getHotspots()[0]?.successfulCutCount).toBeUndefined()
  })
})
