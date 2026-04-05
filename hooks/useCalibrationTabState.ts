'use client'

import { useCallback, useMemo } from 'react'
import type { RefObject } from 'react'
import type { RoomProfile, DimensionUnit, MicType } from '@/types/calibration'
import type { SpectrumData } from '@/types/advisory'

interface UseCalibrationTabStateParams {
  room: RoomProfile
  updateRoom: (partial: Partial<RoomProfile>) => void
  captureAmbient: (spectrumRef: RefObject<SpectrumData | null>) => void
  spectrumRef: RefObject<SpectrumData | null>
  elapsedMs: number
}

export function useCalibrationTabState({
  room,
  updateRoom,
  captureAmbient,
  spectrumRef,
  elapsedMs,
}: UseCalibrationTabStateParams) {
  const handleMicToggle = useCallback((mic: MicType) => {
    const nextMicTypes = room.micTypes.includes(mic)
      ? room.micTypes.filter((entry) => entry !== mic)
      : [...room.micTypes, mic]

    updateRoom({ micTypes: nextMicTypes })
  }, [room.micTypes, updateRoom])

  const handleDimension = useCallback((key: 'length' | 'width' | 'height', value: string) => {
    const nextValue = parseFloat(value) || 0
    updateRoom({
      dimensions: {
        ...room.dimensions,
        [key]: nextValue,
      },
    })
  }, [room.dimensions, updateRoom])

  const handleUnit = useCallback((unit: DimensionUnit) => {
    updateRoom({
      dimensions: {
        ...room.dimensions,
        unit,
      },
    })
  }, [room.dimensions, updateRoom])

  const handleCaptureAmbient = useCallback(() => {
    captureAmbient(spectrumRef)
  }, [captureAmbient, spectrumRef])

  const elapsed = useMemo(() => {
    if (elapsedMs <= 0) return '0s'
    if (elapsedMs < 60_000) return `${Math.round(elapsedMs / 1000)}s`
    return `${Math.floor(elapsedMs / 60_000)}m ${Math.round((elapsedMs % 60_000) / 1000)}s`
  }, [elapsedMs])

  return {
    handleMicToggle,
    handleDimension,
    handleUnit,
    handleCaptureAmbient,
    elapsed,
  }
}
