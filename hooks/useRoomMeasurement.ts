'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ROOM_ESTIMATION } from '@/lib/dsp/constants'
import type { RoomDimensionEstimate } from '@/types/calibration'

export function useRoomMeasurement() {
  const [roomEstimate, setRoomEstimate] = useState<RoomDimensionEstimate | null>(null)
  const [roomMeasuring, setRoomMeasuring] = useState(false)
  const [roomProgress, setRoomProgress] = useState({ elapsedMs: 0, stablePeaks: 0 })
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearAutoStop = useCallback(() => {
    if (!autoStopRef.current) return
    clearTimeout(autoStopRef.current)
    autoStopRef.current = null
  }, [])

  useEffect(() => clearAutoStop, [clearAutoStop])

  const handleRoomEstimate = useCallback((estimate: RoomDimensionEstimate) => {
    setRoomEstimate(estimate)
  }, [])

  const handleRoomProgress = useCallback((elapsedMs: number, stablePeaks: number) => {
    setRoomProgress({ elapsedMs, stablePeaks })
    if (elapsedMs >= ROOM_ESTIMATION.ACCUMULATION_WINDOW_MS) {
      setRoomMeasuring(false)
      clearAutoStop()
    }
  }, [clearAutoStop])

  const startMeasurement = useCallback((startWorkerMeasurement: () => void) => {
    setRoomMeasuring(true)
    setRoomEstimate(null)
    setRoomProgress({ elapsedMs: 0, stablePeaks: 0 })
    startWorkerMeasurement()
    clearAutoStop()
    autoStopRef.current = setTimeout(() => {
      setRoomMeasuring(false)
      autoStopRef.current = null
    }, ROOM_ESTIMATION.ACCUMULATION_WINDOW_MS + 500)
  }, [clearAutoStop])

  const stopMeasurement = useCallback((stopWorkerMeasurement: () => void) => {
    setRoomMeasuring(false)
    stopWorkerMeasurement()
    clearAutoStop()
  }, [clearAutoStop])

  const clearEstimate = useCallback(() => {
    setRoomEstimate(null)
    setRoomProgress({ elapsedMs: 0, stablePeaks: 0 })
  }, [])

  return {
    roomEstimate,
    roomMeasuring,
    roomProgress,
    handleRoomEstimate,
    handleRoomProgress,
    startMeasurement,
    stopMeasurement,
    clearEstimate,
  }
}
