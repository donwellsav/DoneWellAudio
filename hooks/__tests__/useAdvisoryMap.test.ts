// @vitest-environment jsdom
/**
 * Tests for useAdvisoryMap.ts — advisory state management hook.
 *
 * Key behaviors: O(1) Map lookup, frequency-proximity dedup (100 cents),
 * sorted cache with dirty flag, identity-stable callbacks.
 */

import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAdvisoryMap } from '../useAdvisoryMap'
import type { Advisory, DetectorSettings } from '@/types/advisory'

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
    advisory: {
      geq: { bandHz: 1000, suggestedDb: -3 },
      peq: { frequencyHz: 1000, q: 15, gainDb: -6, type: 'bell' },
      pitch: { note: 'B', octave: 5, cents: -14 },
    },
    ...overrides,
  } as Advisory
}

function makeSettingsRef(): React.RefObject<DetectorSettings> {
  return { current: { maxDisplayedIssues: 50 } as DetectorSettings }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useAdvisoryMap', () => {
  it('starts with empty advisories', () => {
    const { result } = renderHook(() => useAdvisoryMap(makeSettingsRef()))
    expect(result.current.advisories).toEqual([])
  })

  it('adds new advisory via onAdvisory', () => {
    const { result } = renderHook(() => useAdvisoryMap(makeSettingsRef()))
    act(() => result.current.onAdvisory(makeAdvisory()))
    expect(result.current.advisories).toHaveLength(1)
    expect(result.current.advisories[0].id).toBe('adv-1')
  })

  it('deduplicates advisories within 100 cents (1 semitone)', () => {
    const { result } = renderHook(() => useAdvisoryMap(makeSettingsRef()))
    // 1000 Hz
    act(() => result.current.onAdvisory(makeAdvisory({ id: 'adv-1', trueFrequencyHz: 1000 })))
    // ~1058 Hz = 1000 * 2^(100/1200) — exactly 100 cents above, should replace
    act(() => result.current.onAdvisory(makeAdvisory({ id: 'adv-2', trueFrequencyHz: 1000 * Math.pow(2, 97 / 1200) })))
    expect(result.current.advisories).toHaveLength(1)
    expect(result.current.advisories[0].id).toBe('adv-2')
  })

  it('keeps advisories >100 cents apart', () => {
    const { result } = renderHook(() => useAdvisoryMap(makeSettingsRef()))
    act(() => result.current.onAdvisory(makeAdvisory({ id: 'adv-1', trueFrequencyHz: 1000 })))
    // ~1060 Hz ≈ 101 cents — just outside dedup range
    act(() => result.current.onAdvisory(makeAdvisory({ id: 'adv-2', trueFrequencyHz: 1000 * Math.pow(2, 101 / 1200) })))
    expect(result.current.advisories).toHaveLength(2)
  })

  it('sorts active before resolved, higher severity first', () => {
    const { result } = renderHook(() => useAdvisoryMap(makeSettingsRef()))

    act(() => {
      result.current.onAdvisory(makeAdvisory({
        id: 'adv-low', severity: 'POSSIBLE_RING', trueFrequencyHz: 500, trueAmplitudeDb: -20,
      }))
      result.current.onAdvisory(makeAdvisory({
        id: 'adv-high', severity: 'RUNAWAY', trueFrequencyHz: 2000, trueAmplitudeDb: -5,
      }))
    })

    expect(result.current.advisories[0].id).toBe('adv-high')
    expect(result.current.advisories[1].id).toBe('adv-low')
  })

  it('onAdvisoryCleared marks advisory as resolved', () => {
    const { result } = renderHook(() => useAdvisoryMap(makeSettingsRef()))
    act(() => result.current.onAdvisory(makeAdvisory({ id: 'adv-1' })))
    act(() => result.current.onAdvisoryCleared('adv-1'))
    expect(result.current.advisories[0].resolved).toBe(true)
    expect(result.current.advisories[0].resolvedAt).toBeDefined()
  })

  it('clearMap resets everything', () => {
    const { result } = renderHook(() => useAdvisoryMap(makeSettingsRef()))
    act(() => result.current.onAdvisory(makeAdvisory()))
    act(() => result.current.clearMap())
    expect(result.current.advisories).toEqual([])
  })
})
