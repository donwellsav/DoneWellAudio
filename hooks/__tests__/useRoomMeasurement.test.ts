// @vitest-environment jsdom

import { renderHook, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ROOM_ESTIMATION } from '@/lib/dsp/constants'
import { useRoomMeasurement } from '@/hooks/useRoomMeasurement'
import type { RoomDimensionEstimate } from '@/types/calibration'

function makeEstimate(): RoomDimensionEstimate {
  return {
    dimensions: { length: 12, width: 8, height: 3 },
    confidence: 0.82,
    seriesFound: 3,
    residualError: 1.4,
    detectedSeries: [],
    totalPeaksAnalyzed: 9,
  }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useRoomMeasurement', () => {
  it('starts measurement, resets state, and auto-stops after the accumulation window', () => {
    const startWorkerMeasurement = vi.fn()
    const { result } = renderHook(() => useRoomMeasurement())

    act(() => {
      result.current.startMeasurement(startWorkerMeasurement)
    })

    expect(startWorkerMeasurement).toHaveBeenCalledTimes(1)
    expect(result.current.roomMeasuring).toBe(true)
    expect(result.current.roomEstimate).toBeNull()
    expect(result.current.roomProgress).toEqual({ elapsedMs: 0, stablePeaks: 0 })

    act(() => {
      vi.advanceTimersByTime(ROOM_ESTIMATION.ACCUMULATION_WINDOW_MS + 500)
    })

    expect(result.current.roomMeasuring).toBe(false)
  })

  it('stores worker progress and marks the session complete when the window is reached', () => {
    const { result } = renderHook(() => useRoomMeasurement())

    act(() => {
      result.current.startMeasurement(() => {})
      result.current.handleRoomProgress(ROOM_ESTIMATION.ACCUMULATION_WINDOW_MS, 6)
    })

    expect(result.current.roomProgress).toEqual({
      elapsedMs: ROOM_ESTIMATION.ACCUMULATION_WINDOW_MS,
      stablePeaks: 6,
    })
    expect(result.current.roomMeasuring).toBe(false)
  })

  it('stores estimates and clears them without touching measurement controls', () => {
    const stopWorkerMeasurement = vi.fn()
    const estimate = makeEstimate()
    const { result } = renderHook(() => useRoomMeasurement())

    act(() => {
      result.current.startMeasurement(() => {})
      result.current.handleRoomEstimate(estimate)
    })

    expect(result.current.roomEstimate).toEqual(estimate)

    act(() => {
      result.current.stopMeasurement(stopWorkerMeasurement)
    })

    expect(stopWorkerMeasurement).toHaveBeenCalledTimes(1)
    expect(result.current.roomMeasuring).toBe(false)

    act(() => {
      result.current.clearEstimate()
    })

    expect(result.current.roomEstimate).toBeNull()
    expect(result.current.roomProgress).toEqual({ elapsedMs: 0, stablePeaks: 0 })
  })
})
