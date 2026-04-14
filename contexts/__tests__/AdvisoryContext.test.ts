// @vitest-environment jsdom
/**
 * Tests for AdvisoryContext.tsx — advisory state management context.
 *
 * Mocks useDetection() to supply test advisories, then validates:
 * dismiss, clearAll, clearResolved, clearGEQ, clearRTA, auto-prune,
 * and derived booleans (hasActiveGEQBars, activeAdvisoryCount).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'

import type { Advisory } from '@/types/advisory'

// ── Mock useDetection ─────────────────────────────────────────────────────────

let mockAdvisories: Advisory[] = []
const mockEarlyWarning = null
const { syncFeedbackHistoryMock, reapCompanionCutsMock } = vi.hoisted(() => ({
  syncFeedbackHistoryMock: vi.fn(),
  reapCompanionCutsMock: vi.fn(),
}))
const companionMocks = vi.hoisted(() => ({
  enabled: false,
  sendResolve: vi.fn(() => Promise.resolve(true)),
  sendDismiss: vi.fn(() => Promise.resolve(true)),
}))

vi.mock('@/contexts/DetectionContext', () => ({
  useDetection: () => ({
    advisories: mockAdvisories,
    earlyWarning: mockEarlyWarning,
  }),
}))

// The provider now consumes Engine/Settings/UI/Companion contexts and polls
// the relay. Mock all of them to isolate advisory logic under test.
vi.mock('@/contexts/EngineContext', () => ({
  useEngine: () => ({
    start: vi.fn(),
    stop: vi.fn(),
    dspWorker: { syncFeedbackHistory: syncFeedbackHistoryMock },
  }),
}))

vi.mock('@/contexts/SettingsContext', () => ({
  useSettings: () => ({ setMode: vi.fn() }),
}))

vi.mock('@/contexts/UIContext', () => ({
  useUI: () => ({ isFrozen: false, toggleFreeze: vi.fn() }),
}))

vi.mock('@/hooks/useCompanion', () => ({
  useCompanion: () => ({
    settings: { enabled: companionMocks.enabled, pairingCode: 'DWA-TEST01' },
    sendResolve: companionMocks.sendResolve,
    sendDismiss: companionMocks.sendDismiss,
  }),
}))

vi.mock('@/hooks/useCompanionInbound', () => ({
  useCompanionInbound: () => {},
}))

vi.mock('@/lib/dsp/feedbackHistory', () => ({
  getFeedbackHistory: () => ({
    markCompanionApplied: vi.fn(),
    reapCompanionCuts: reapCompanionCutsMock,
  }),
  getFeedbackHotspotSummaries: () => [],
}))

import { AdvisoryProvider, useAdvisories } from '../AdvisoryContext'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeAdvisory(overrides: Partial<Advisory> = {}): Advisory {
  return {
    id: 'adv-1',
    trackId: 'track-1',
    timestamp: Date.now(),
    label: 'ACOUSTIC_FEEDBACK',
    severity: 'GROWING',
    confidence: 0.8,
    why: ['test'],
    trueFrequencyHz: 1000,
    trueAmplitudeDb: -10,
    prominenceDb: 8,
    qEstimate: 15,
    bandwidthHz: 67,
    velocityDbPerSec: 2,
    stabilityCentsStd: 5,
    harmonicityScore: 0.1,
    modulationScore: 0.05,
    resolved: false,
    advisory: {
      geq: { bandHz: 1000, suggestedDb: -3 },
      peq: { frequencyHz: 1000, q: 15, gainDb: -6, type: 'bell' },
      pitch: { note: 'B', octave: 5, cents: -14 },
    },
    ...overrides,
  } as Advisory
}

function wrapper({ children }: { children: ReactNode }) {
  // eslint-disable-next-line react/no-children-prop
  return createElement(
    AdvisoryProvider,
    { onFalsePositive: undefined, falsePositiveIds: undefined, onConfirmFeedback: undefined, confirmedIds: undefined, children },
  )
}

beforeEach(() => {
  mockAdvisories = []
  syncFeedbackHistoryMock.mockReset()
  reapCompanionCutsMock.mockReset()
  reapCompanionCutsMock.mockReturnValue(false)
  companionMocks.enabled = false
  companionMocks.sendResolve.mockClear()
  companionMocks.sendDismiss.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AdvisoryContext', () => {
  it('provides advisories from useAudio', () => {
    mockAdvisories = [makeAdvisory()]
    const { result } = renderHook(() => useAdvisories(), { wrapper })
    expect(result.current.advisories).toHaveLength(1)
  })

  it('onDismiss adds ID to dismissedIds', () => {
    mockAdvisories = [makeAdvisory({ id: 'a1' })]
    const { result } = renderHook(() => useAdvisories(), { wrapper })
    act(() => result.current.onDismiss('a1'))
    expect(result.current.dismissedIds.has('a1')).toBe(true)
  })

  it('restoreDismissedAdvisory makes a dismissed advisory visible again', () => {
    mockAdvisories = [makeAdvisory({ id: 'a1' })]
    const { result } = renderHook(() => useAdvisories(), { wrapper })

    act(() => result.current.onDismiss('a1'))
    expect(result.current.dismissedIds.has('a1')).toBe(true)

    act(() => result.current.restoreDismissedAdvisory('a1'))
    expect(result.current.dismissedIds.has('a1')).toBe(false)
  })

  it('dismisses active advisories through Companion when the user clears a card', () => {
    companionMocks.enabled = true
    mockAdvisories = [makeAdvisory({ id: 'a1', resolved: false })]
    const { result } = renderHook(() => useAdvisories(), { wrapper })

    act(() => result.current.onDismiss('a1'))

    expect(companionMocks.sendDismiss).toHaveBeenCalledWith('a1')
  })

  it('onClearAll adds all advisory IDs to dismissedIds', () => {
    mockAdvisories = [makeAdvisory({ id: 'a1' }), makeAdvisory({ id: 'a2' })]
    const { result } = renderHook(() => useAdvisories(), { wrapper })
    act(() => result.current.onClearAll())
    expect(result.current.dismissedIds.has('a1')).toBe(true)
    expect(result.current.dismissedIds.has('a2')).toBe(true)
  })

  it('only dismisses active advisories through Companion on clear all', () => {
    companionMocks.enabled = true
    mockAdvisories = [
      makeAdvisory({ id: 'active', resolved: false }),
      makeAdvisory({ id: 'done', resolved: true }),
    ]
    const { result } = renderHook(() => useAdvisories(), { wrapper })

    act(() => result.current.onClearAll())

    expect(companionMocks.sendDismiss).toHaveBeenCalledTimes(1)
    expect(companionMocks.sendDismiss).toHaveBeenCalledWith('active')
  })

  it('onClearResolved only dismisses resolved advisories', () => {
    mockAdvisories = [
      makeAdvisory({ id: 'active', resolved: false }),
      makeAdvisory({ id: 'resolved', resolved: true }),
    ]
    const { result } = renderHook(() => useAdvisories(), { wrapper })
    act(() => result.current.onClearResolved())
    expect(result.current.dismissedIds.has('resolved')).toBe(true)
    expect(result.current.dismissedIds.has('active')).toBe(false)
  })

  it('sends resolve to Companion exactly once when a live advisory becomes resolved', async () => {
    companionMocks.enabled = true
    mockAdvisories = [makeAdvisory({ id: 'adv-resolve', resolved: false })]
    const { rerender } = renderHook(() => useAdvisories(), { wrapper })

    mockAdvisories = [makeAdvisory({ id: 'adv-resolve', resolved: true })]
    rerender()

    await act(async () => {
      await Promise.resolve()
    })

    expect(companionMocks.sendResolve).toHaveBeenCalledWith('adv-resolve')
    expect(companionMocks.sendResolve).toHaveBeenCalledTimes(1)

    rerender()
    expect(companionMocks.sendResolve).toHaveBeenCalledTimes(1)
  })

  it('retries resolve relay messages until Companion accepts them', async () => {
    vi.useFakeTimers()
    companionMocks.enabled = true
    companionMocks.sendResolve
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
    mockAdvisories = [makeAdvisory({ id: 'adv-retry', resolved: true })]

    renderHook(() => useAdvisories(), { wrapper })

    await act(async () => {
      await Promise.resolve()
    })

    expect(companionMocks.sendResolve).toHaveBeenCalledTimes(1)

    await act(async () => {
      vi.advanceTimersByTime(1000)
      await Promise.resolve()
    })

    expect(companionMocks.sendResolve).toHaveBeenCalledTimes(2)
  })

  it('does not resend resolve after a successful clear for the same live advisory', async () => {
    companionMocks.enabled = true
    mockAdvisories = [makeAdvisory({ id: 'adv-still-live', resolved: true })]
    const { result, rerender } = renderHook(() => useAdvisories(), { wrapper })

    await act(async () => {
      await Promise.resolve()
    })

    expect(companionMocks.sendResolve).toHaveBeenCalledTimes(1)

    act(() => {
      result.current.clearCompanionLifecycle('adv-still-live')
    })

    mockAdvisories = [makeAdvisory({ id: 'adv-still-live', resolved: true })]
    rerender()

    await act(async () => {
      await Promise.resolve()
    })

    expect(companionMocks.sendResolve).toHaveBeenCalledTimes(1)
  })

  it('keeps lifecycle retry intent after a resolved advisory disappears', async () => {
    companionMocks.enabled = true
    mockAdvisories = [makeAdvisory({ id: 'adv-gone', resolved: true })]
    const { result, rerender } = renderHook(() => useAdvisories(), { wrapper })

    await act(async () => {
      await Promise.resolve()
    })

    expect(companionMocks.sendResolve).toHaveBeenCalledTimes(1)

    mockAdvisories = []
    rerender()

    act(() => {
      result.current.retryCompanionLifecycle('adv-gone')
    })

    await act(async () => {
      await Promise.resolve()
    })

    expect(companionMocks.sendResolve).toHaveBeenCalledTimes(2)
  })

  it('onClearGEQ populates geqClearedIds', () => {
    mockAdvisories = [makeAdvisory({ id: 'a1' })]
    const { result } = renderHook(() => useAdvisories(), { wrapper })
    act(() => result.current.onClearGEQ())
    expect(result.current.geqClearedIds.has('a1')).toBe(true)
  })

  it('onClearRTA populates rtaClearedIds', () => {
    mockAdvisories = [makeAdvisory({ id: 'a1' })]
    const { result } = renderHook(() => useAdvisories(), { wrapper })
    act(() => result.current.onClearRTA())
    expect(result.current.rtaClearedIds.has('a1')).toBe(true)
  })

  it('hasActiveGEQBars is true when uncleared advisories have GEQ', () => {
    mockAdvisories = [makeAdvisory({ id: 'a1' })]
    const { result } = renderHook(() => useAdvisories(), { wrapper })
    expect(result.current.hasActiveGEQBars).toBe(true)
  })

  it('hasActiveGEQBars is false after clearing GEQ', () => {
    mockAdvisories = [makeAdvisory({ id: 'a1' })]
    const { result } = renderHook(() => useAdvisories(), { wrapper })
    act(() => result.current.onClearGEQ())
    expect(result.current.hasActiveGEQBars).toBe(false)
  })

  it('hasActiveRTAMarkers is false after clearing RTA', () => {
    mockAdvisories = [makeAdvisory({ id: 'a1' })]
    const { result } = renderHook(() => useAdvisories(), { wrapper })
    expect(result.current.hasActiveRTAMarkers).toBe(true)
    act(() => result.current.onClearRTA())
    expect(result.current.hasActiveRTAMarkers).toBe(false)
  })

  it('activeAdvisoryCount excludes resolved', () => {
    mockAdvisories = [
      makeAdvisory({ id: 'a1', resolved: false }),
      makeAdvisory({ id: 'a2', resolved: true }),
      makeAdvisory({ id: 'a3', resolved: false }),
    ]
    const { result } = renderHook(() => useAdvisories(), { wrapper })
    expect(result.current.activeAdvisoryCount).toBe(2)
  })

  it('activeAdvisoryCount excludes dismissed advisories', () => {
    mockAdvisories = [
      makeAdvisory({ id: 'a1', resolved: false }),
      makeAdvisory({ id: 'a2', resolved: false }),
    ]
    const { result } = renderHook(() => useAdvisories(), { wrapper })

    act(() => result.current.onDismiss('a2'))

    expect(result.current.activeAdvisoryCount).toBe(1)
  })

  it('reaps pending Companion cuts even when Companion is disabled', () => {
    vi.useFakeTimers()
    reapCompanionCutsMock.mockReturnValue(true)

    renderHook(() => useAdvisories(), { wrapper })

    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(reapCompanionCutsMock).toHaveBeenCalled()
    expect(syncFeedbackHistoryMock).toHaveBeenCalledTimes(1)
  })

  it('prunes stale Companion card state when the advisory disappears', () => {
    mockAdvisories = [makeAdvisory({ id: 'adv-1' })]
    const { result, rerender } = renderHook(() => useAdvisories(), { wrapper })

    act(() => {
      result.current.patchCompanionState('adv-1', {
        applied: { at: 1234, gainDb: -6, slotIndex: 2 },
      })
    })

    expect(result.current.companionState.get('adv-1')?.applied?.gainDb).toBe(-6)

    mockAdvisories = []
    rerender()

    expect(result.current.companionState.has('adv-1')).toBe(false)
  })
})
