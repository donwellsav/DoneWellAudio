/**
 * useRoomEstimation — thin hook for room dimension estimation from detected resonances.
 *
 * Wraps the DSP worker's room measurement messages into a clean React API.
 * The heavy lifting happens in the worker (peak accumulation) and acousticUtils
 * (inverse eigenvalue solver). This hook just manages state and exposes controls.
 *
 * @see acousticUtils.ts — estimateRoomDimensions() (inverse solver)
 * @see dspWorker.ts — RoomAnalysisAccumulator (peak collection)
 */

'use client'

import { useState, useCallback, useRef } from 'react'
import type { RoomDimensionEstimate } from '@/types/calibration'
import { ROOM_ESTIMATION } from '@/lib/dsp/constants'

export interface RoomEstimationState {
  /** Whether the worker is actively accumulating peaks */
  isListening: boolean
  /** Latest room dimension estimate (null if none yet) */
  estimate: RoomDimensionEstimate | null
  /** Elapsed time in the current measurement (ms) */
  elapsedMs: number
  /** Number of stable peaks detected so far */
  stablePeaks: number
  /** Start a measurement session */
  startMeasurement: () => void
  /** Stop the current measurement early */
  stopMeasurement: () => void
  /** Clear the current estimate */
  clearEstimate: () => void
}

/**
 * Hook for room dimension estimation. Call startMeasurement() to begin
 * accumulating stable low-frequency peaks, then read the estimate when ready.
 *
 * @param workerStartFn - The worker's startRoomMeasurement function
 * @param workerStopFn - The worker's stopRoomMeasurement function
 * @returns RoomEstimationState with current status and controls
 */
export function useRoomEstimation(
  workerStartFn: () => void,
  workerStopFn: () => void
): RoomEstimationState {
  const [isListening, setIsListening] = useState(false)
  const [estimate, setEstimate] = useState<RoomDimensionEstimate | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [stablePeaks, setStablePeaks] = useState(0)
  const autoStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const startMeasurement = useCallback(() => {
    setIsListening(true)
    setEstimate(null)
    setElapsedMs(0)
    setStablePeaks(0)
    workerStartFn()

    // Auto-stop after accumulation window (safety net — worker also auto-stops)
    if (autoStopTimerRef.current) clearTimeout(autoStopTimerRef.current)
    autoStopTimerRef.current = setTimeout(() => {
      setIsListening(false)
    }, ROOM_ESTIMATION.ACCUMULATION_WINDOW_MS + 500) // +500ms grace
  }, [workerStartFn])

  const stopMeasurement = useCallback(() => {
    setIsListening(false)
    workerStopFn()
    if (autoStopTimerRef.current) {
      clearTimeout(autoStopTimerRef.current)
      autoStopTimerRef.current = null
    }
  }, [workerStopFn])

  const clearEstimate = useCallback(() => {
    setEstimate(null)
    setElapsedMs(0)
    setStablePeaks(0)
  }, [])

  /** Call this from the worker's onRoomEstimate callback */
  const handleEstimate = useCallback((est: RoomDimensionEstimate) => {
    setEstimate(est)
  }, [])

  /** Call this from the worker's onRoomMeasurementProgress callback */
  const handleProgress = useCallback((elapsed: number, peaks: number) => {
    setElapsedMs(elapsed)
    setStablePeaks(peaks)
    // Auto-stop when worker finishes
    if (elapsed >= ROOM_ESTIMATION.ACCUMULATION_WINDOW_MS) {
      setIsListening(false)
    }
  }, [])

  // Expose handlers as properties so the parent can wire them to worker callbacks
  const state = {
    isListening,
    estimate,
    elapsedMs,
    stablePeaks,
    startMeasurement,
    stopMeasurement,
    clearEstimate,
  } as RoomEstimationState & {
    handleEstimate: (est: RoomDimensionEstimate) => void
    handleProgress: (elapsed: number, peaks: number) => void
  }

  state.handleEstimate = handleEstimate
  state.handleProgress = handleProgress

  return state
}
