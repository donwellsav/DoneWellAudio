// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RoomMode } from '@/lib/dsp/acousticUtils'
import {
  buildRingOutExportLines,
  findAdjacentMode,
  useRingOutWizardState,
} from '@/hooks/useRingOutWizardState'
import type { Advisory } from '@/types/advisory'

const { useCompanionMock } = vi.hoisted(() => ({
  useCompanionMock: vi.fn(),
}))

vi.mock('@/hooks/useCompanion', () => ({
  useCompanion: useCompanionMock,
}))

function makeAdvisory(
  id: string,
  overrides: Partial<Advisory> = {},
): Advisory {
  return {
    id,
    trackId: `track-${id}`,
    timestamp: Date.now(),
    label: 'ACOUSTIC_FEEDBACK',
    severity: 'GROWING',
    confidence: 0.91,
    why: ['test'],
    trueFrequencyHz: 1000,
    trueAmplitudeDb: -18,
    prominenceDb: 12,
    qEstimate: 4,
    bandwidthHz: 250,
    velocityDbPerSec: 1,
    stabilityCentsStd: 0,
    harmonicityScore: 0,
    modulationScore: 0,
    advisory: {
      geq: { bandIndex: 15, bandHz: 1000, suggestedDb: -6 },
      peq: { type: 'bell', hz: 1000, q: 4, gainDb: -6 },
      shelves: [],
      pitch: { note: 'B', octave: 5, cents: 0, midi: 83 },
    },
    ...overrides,
  }
}

describe('useRingOutWizardState', () => {
  beforeEach(() => {
    useCompanionMock.mockReset()
    useCompanionMock.mockReturnValue({
      settings: {
        enabled: false,
        ringOutAutoSend: false,
      },
      sendAdvisory: vi.fn(),
      sendExplicitAdvisory: vi.fn(),
    })
  })

  it('promotes the highest-severity new advisory while listening', async () => {
    const instrument = makeAdvisory('inst', { severity: 'INSTRUMENT' })
    const runaway = makeAdvisory('runaway', { severity: 'RUNAWAY' })
    const resonance = makeAdvisory('resonance', { severity: 'RESONANCE' })

    const { result, rerender } = renderHook(
      ({ advisories }) =>
        useRingOutWizardState({
          advisories,
          isRunning: true,
          roomModes: null,
        }),
      {
        initialProps: {
          advisories: [] as Advisory[],
        },
      },
    )

    rerender({ advisories: [instrument, resonance, runaway] })

    await waitFor(() => {
      expect(result.current.phase).toBe('detected')
      expect(result.current.currentAdvisory?.id).toBe('runaway')
    })
  })

  it('records the notch and auto-sends during ring-out when enabled', async () => {
    const sendExplicitAdvisory = vi.fn()
    const advisory = makeAdvisory('adv-1')

    useCompanionMock.mockReturnValue({
      settings: {
        enabled: true,
        ringOutAutoSend: true,
      },
      sendAdvisory: vi.fn(),
      sendExplicitAdvisory,
    })

    const { result } = renderHook(() =>
      useRingOutWizardState({
        advisories: [advisory],
        isRunning: true,
        roomModes: null,
      }),
    )

    await waitFor(() => {
      expect(result.current.phase).toBe('detected')
    })

    act(() => {
      result.current.handleNext()
    })

    expect(result.current.phase).toBe('listening')
    expect(result.current.currentAdvisory).toBeNull()
    expect(result.current.notched).toHaveLength(1)
    expect(result.current.notched[0]).toMatchObject({
      frequencyHz: 1000,
      pitch: 'B5',
      gainDb: -6,
      q: 4,
    })
    expect(sendExplicitAdvisory).toHaveBeenCalledWith(advisory)
  })

  it('send all relays only accepted notches, not the current advisory list', async () => {
    const sendExplicitAdvisory = vi.fn()
    const accepted = makeAdvisory('accepted', { trueFrequencyHz: 1000 })
    const unrelated = makeAdvisory('unrelated', {
      severity: 'INSTRUMENT',
      trueFrequencyHz: 1800,
    })

    useCompanionMock.mockReturnValue({
      settings: {
        enabled: true,
        ringOutAutoSend: false,
      },
      sendAdvisory: vi.fn(),
      sendExplicitAdvisory,
    })

    const { result, rerender } = renderHook(
      ({ advisories }) =>
        useRingOutWizardState({
          advisories,
          isRunning: true,
          roomModes: null,
        }),
      {
        initialProps: {
          advisories: [accepted] as Advisory[],
        },
      },
    )

    await waitFor(() => {
      expect(result.current.phase).toBe('detected')
    })

    act(() => {
      result.current.handleNext()
    })

    rerender({ advisories: [unrelated] })

    act(() => {
      result.current.handleSendAll()
    })

    expect(sendExplicitAdvisory).toHaveBeenCalledTimes(1)
    expect(sendExplicitAdvisory).toHaveBeenCalledWith(accepted)
  })

  it('formats export lines and room-mode proximity through pure helpers', () => {
    const lines = buildRingOutExportLines(
      [
        {
          frequencyHz: 1000,
          pitch: 'B5',
          gainDb: -6,
          q: 4,
          severity: 'GROWING',
          timestamp: 0,
        },
      ],
      new Date('2026-04-04T12:00:00Z'),
    )
    const modes: RoomMode[] = [
      { frequency: 998, label: '1,0,0', type: 'axial' },
      { frequency: 1200, label: '0,1,0', type: 'axial' },
    ]

    expect(lines[0]).toBe('DoneWell Audio - Ring-Out Session Report')
    expect(lines).toContain('Frequencies notched: 1')
    expect(lines[lines.length - 1]).toContain('B5')
    expect(findAdjacentMode(1000, modes)?.label).toBe('1,0,0')
    expect(findAdjacentMode(1100, modes)).toBeNull()
  })
})
