// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useAdvisoryFeedback } from '@/hooks/useAdvisoryFeedback'
import type { Advisory } from '@/types/advisory'

function makeAdvisory(id: string, frequencyHz = 1000): Advisory {
  return {
    id,
    trackId: `track-${id}`,
    timestamp: 1,
    label: 'ACOUSTIC_FEEDBACK',
    severity: 'RESONANCE',
    confidence: 0.9,
    why: ['test'],
    trueFrequencyHz: frequencyHz,
    trueAmplitudeDb: -12,
    prominenceDb: 8,
    qEstimate: 10,
    bandwidthHz: 40,
    velocityDbPerSec: 2,
    stabilityCentsStd: 1,
    harmonicityScore: 0,
    modulationScore: 0,
    advisory: {
      geq: { bandHz: frequencyHz, bandIndex: 12, suggestedDb: -3 },
      peq: { type: 'notch', hz: frequencyHz, q: 10, gainDb: -6 },
      shelves: [],
      pitch: { note: 'B', octave: 5, cents: 0, midi: 83 },
    },
  } as Advisory
}

describe('useAdvisoryFeedback', () => {
  it('toggles false positive labels and sends matching worker feedback', () => {
    const sendUserFeedback = vi.fn()
    const onCalibrationFalsePositive = vi.fn()

    const { result } = renderHook(() =>
      useAdvisoryFeedback({
        advisories: [makeAdvisory('a1', 1234)],
        dspWorker: { sendUserFeedback },
        calibration: {
          calibrationEnabled: false,
          falsePositiveIds: new Set(),
          onFalsePositive: onCalibrationFalsePositive,
        },
      }),
    )

    act(() => {
      result.current.handleFalsePositive('a1')
    })

    expect(result.current.falsePositiveIds.has('a1')).toBe(true)
    expect(sendUserFeedback).toHaveBeenLastCalledWith(1234, 'false_positive')

    act(() => {
      result.current.handleFalsePositive('a1')
    })

    expect(result.current.falsePositiveIds.has('a1')).toBe(false)
    expect(sendUserFeedback).toHaveBeenLastCalledWith(1234, 'correct')
    expect(onCalibrationFalsePositive).not.toHaveBeenCalled()
  })

  it('treats calibration false positives as already flagged', () => {
    const sendUserFeedback = vi.fn()
    const onCalibrationFalsePositive = vi.fn()

    const { result } = renderHook(() =>
      useAdvisoryFeedback({
        advisories: [makeAdvisory('a1', 1600)],
        dspWorker: { sendUserFeedback },
        calibration: {
          calibrationEnabled: true,
          falsePositiveIds: new Set(['a1']),
          onFalsePositive: onCalibrationFalsePositive,
        },
      }),
    )

    expect(result.current.falsePositiveIds.has('a1')).toBe(true)

    act(() => {
      result.current.handleFalsePositive('a1')
    })

    expect(sendUserFeedback).toHaveBeenCalledWith(1600, 'correct')
    expect(onCalibrationFalsePositive).toHaveBeenCalledWith('a1')
  })

  it('clears calibration false positives when confirming feedback', () => {
    const sendUserFeedback = vi.fn()
    const onCalibrationFalsePositive = vi.fn()

    const { result } = renderHook(() =>
      useAdvisoryFeedback({
        advisories: [makeAdvisory('a1', 2000)],
        dspWorker: { sendUserFeedback },
        calibration: {
          calibrationEnabled: true,
          falsePositiveIds: new Set(['a1']),
          onFalsePositive: onCalibrationFalsePositive,
        },
      }),
    )

    act(() => {
      result.current.handleConfirmFeedback('a1')
    })

    expect(result.current.confirmedIds.has('a1')).toBe(true)
    expect(sendUserFeedback).toHaveBeenCalledWith(2000, 'confirmed_feedback')
    expect(onCalibrationFalsePositive).toHaveBeenCalledWith('a1')
  })
})
