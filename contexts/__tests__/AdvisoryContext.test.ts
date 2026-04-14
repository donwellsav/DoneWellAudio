// @vitest-environment jsdom
/**
 * Tests for AdvisoryContext.tsx — advisory state management context.
 *
 * Mocks useDetection() to supply test advisories, then validates:
 * dismiss, clearAll, clearResolved, clearGEQ, clearRTA, auto-prune,
 * and derived booleans (hasActiveGEQBars, activeAdvisoryCount).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'

import type { Advisory } from '@/types/advisory'

// ── Mock useDetection ─────────────────────────────────────────────────────────

let mockAdvisories: Advisory[] = []
const mockEarlyWarning = null

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
    dspWorker: { syncFeedbackHistory: vi.fn() },
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
    settings: { enabled: false, pairingCode: 'DWA-TEST01' },
  }),
}))

vi.mock('@/hooks/useCompanionInbound', () => ({
  useCompanionInbound: () => {},
}))

vi.mock('@/lib/dsp/feedbackHistory', () => ({
  getFeedbackHistory: () => ({
    markCompanionApplied: vi.fn(),
    reapCompanionCuts: vi.fn(),
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

  it('onClearAll adds all advisory IDs to dismissedIds', () => {
    mockAdvisories = [makeAdvisory({ id: 'a1' }), makeAdvisory({ id: 'a2' })]
    const { result } = renderHook(() => useAdvisories(), { wrapper })
    act(() => result.current.onClearAll())
    expect(result.current.dismissedIds.has('a1')).toBe(true)
    expect(result.current.dismissedIds.has('a2')).toBe(true)
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
})
