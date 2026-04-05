// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Advisory } from '@/types/advisory'
import { GEQ_BAND_LABELS } from '@/lib/canvas/geqBarViewShared'
import { useGEQBarViewState } from '../useGEQBarViewState'

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
      geq: { bandHz: 1000, bandIndex: 10, suggestedDb: -3 },
      peq: { hz: 1000, q: 15, gainDb: -6, type: 'bell' },
      shelves: [],
      pitch: { note: 'B', octave: 5, cents: -14, midi: 83 },
    },
    ...overrides,
  } as Advisory
}

describe('useGEQBarViewState', () => {
  it('keeps the deepest cut per band and accumulates cluster counts', () => {
    const container = document.createElement('div')
    Object.defineProperty(container, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 400, height: 200 }),
    })
    const containerRef = { current: container }

    const advisories = [
      makeAdvisory({
        id: 'a1',
        clusterCount: 2,
        trueFrequencyHz: 950,
        advisory: {
          geq: { bandHz: 200, bandIndex: 10, suggestedDb: -3 },
          peq: { hz: 950, q: 10, gainDb: -4, type: 'bell' },
          shelves: [],
          pitch: { note: 'A#', octave: 5, cents: 0, midi: 82 },
        },
      }),
      makeAdvisory({
        id: 'a2',
        clusterCount: 1,
        trueFrequencyHz: 1005,
        advisory: {
          geq: { bandHz: 200, bandIndex: 10, suggestedDb: -6 },
          peq: { hz: 1005, q: 12, gainDb: -6, type: 'bell' },
          shelves: [],
          pitch: { note: 'B', octave: 5, cents: 0, midi: 83 },
        },
      }),
    ]

    const { result } = renderHook(() =>
      useGEQBarViewState({
        advisories,
        isDark: true,
        containerRef,
      }),
    )

    expect(result.current.hasRecommendations).toBe(true)
    expect(result.current.bandRecommendations.get(10)).toMatchObject({
      suggestedDb: -6,
      clusterCount: 3,
      freq: 1005,
    })
    expect(result.current.geqAriaLabel).toContain('1 active cuts')
    expect(result.current.geqAriaLabel).toContain('200 Hz -6dB')
  })

  it('maps pointer position to the hovered band', () => {
    const container = document.createElement('div')
    Object.defineProperty(container, 'getBoundingClientRect', {
      value: () => ({ left: 100, top: 50, width: 400, height: 200 }),
    })
    const containerRef = { current: container }

    const advisories = [
      makeAdvisory({
        advisory: {
          geq: { bandHz: 63, bandIndex: 5, suggestedDb: -4 },
          peq: { hz: 63, q: 9, gainDb: -4, type: 'bell' },
          shelves: [],
          pitch: { note: 'B', octave: 1, cents: 0, midi: 35 },
        },
      }),
    ]

    const { result } = renderHook(() =>
      useGEQBarViewState({
        advisories,
        isDark: true,
        containerRef,
      }),
    )

    act(() => {
      result.current.layoutRef.current = {
        paddingLeft: 10,
        barSpacing: 20,
        numBands: GEQ_BAND_LABELS.length,
      }
      result.current.handleMouseMove(100 + 10 + 20 * 5 + 3, 70)
    })

    expect(result.current.hoverBand).toBe(5)
    expect(result.current.hoverLabel).toBe('63')
    expect(result.current.hoverRec?.suggestedDb).toBe(-4)

    act(() => {
      result.current.handleMouseLeave()
    })

    expect(result.current.hoverBand).toBeNull()
    expect(result.current.hoverRec).toBeNull()
  })
})
