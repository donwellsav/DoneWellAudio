// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildIssueListEntries,
  MIN_ISSUE_DISPLAY_MS,
  useStableIssueEntries,
  type IssueListEntry,
} from '@/hooks/useIssuesListEntries'
import type { Advisory } from '@/types/advisory'

function makeAdvisory(
  id: string,
  trueFrequencyHz: number,
  resolved = false,
): Advisory {
  return {
    id,
    trackId: `track-${id}`,
    timestamp: 1,
    label: 'ACOUSTIC_FEEDBACK',
    severity: 'RESONANCE',
    confidence: 0.9,
    why: ['test'],
    trueFrequencyHz,
    trueAmplitudeDb: -12,
    prominenceDb: 8,
    qEstimate: 8,
    bandwidthHz: 40,
    velocityDbPerSec: 2,
    stabilityCentsStd: 1,
    harmonicityScore: 0,
    modulationScore: 0,
    resolved,
    advisory: {
      geq: { bandHz: trueFrequencyHz, bandIndex: 10, suggestedDb: -3 },
      peq: { type: 'notch', hz: trueFrequencyHz, q: 8, gainDb: -6 },
      shelves: [],
      pitch: { note: 'B', octave: 5, cents: 0, midi: 83 },
    },
  }
}

function makeEntry(id: string, frequencyHz: number, occurrenceCount: number): IssueListEntry {
  return {
    advisory: makeAdvisory(id, frequencyHz),
    occurrenceCount,
  }
}

describe('useIssuesListEntries', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('sorts unresolved repeat offenders ahead of other entries', () => {
    const advisories = [
      makeAdvisory('resolved', 1600, true),
      makeAdvisory('repeat', 1000),
      makeAdvisory('normal', 800),
    ]

    const entries = buildIssueListEntries(
      advisories,
      undefined,
      10,
      {
        getOccurrenceCount: (frequencyHz) => frequencyHz === 1000 ? 3 : 1,
      },
    )

    expect(entries.map((entry) => entry.advisory.id)).toEqual(['repeat', 'normal', 'resolved'])
  })

  it('holds list order until the minimum display time passes', () => {
    const firstEntries = [
      makeEntry('a', 800, 1),
      makeEntry('b', 1000, 1),
    ]
    const reorderedEntries = [
      makeEntry('b', 1000, 3),
      makeEntry('a', 800, 1),
    ]

    const { result, rerender } = renderHook(
      ({ entries }) => useStableIssueEntries(entries),
      { initialProps: { entries: firstEntries } },
    )

    rerender({ entries: reorderedEntries })
    expect(result.current.map((entry) => entry.advisory.id)).toEqual(['a', 'b'])

    act(() => {
      vi.advanceTimersByTime(MIN_ISSUE_DISPLAY_MS)
    })

    expect(result.current.map((entry) => entry.advisory.id)).toEqual(['b', 'a'])
  })
})
