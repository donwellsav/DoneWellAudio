'use client'

import { useCallback } from 'react'
import type { DetectorSettings } from '@/types/advisory'
import type { EnvironmentSelection, RoomTemplateId } from '@/types/settings'
import type { RoomPresetKey } from '@/lib/dsp/constants'

function metersToFeet(value: number) {
  return value * 3.28084
}

interface UseRoomTabStateParams {
  settings: DetectorSettings
  setEnvironment: (env: Partial<EnvironmentSelection> & { templateId?: RoomTemplateId | string }) => void
}

export function useRoomTabState({
  settings,
  setEnvironment,
}: UseRoomTabStateParams) {
  const applyEnvironment = useCallback((env: Partial<EnvironmentSelection> & { templateId?: RoomTemplateId | string }) => {
    setEnvironment(env)
  }, [setEnvironment])

  const setRoomPreset = useCallback((templateId: RoomPresetKey) => {
    applyEnvironment({ templateId })
  }, [applyEnvironment])

  const setDisplayUnit = useCallback((displayUnit: 'meters' | 'feet') => {
    applyEnvironment({ displayUnit })
  }, [applyEnvironment])

  const updateDimension = useCallback((dimension: 'length' | 'width' | 'height', rawValue: string) => {
    const nextValue = parseFloat(rawValue) || 1
    const dimensions = {
      length: settings.roomLengthM,
      width: settings.roomWidthM,
      height: settings.roomHeightM,
    }
    dimensions[dimension] = nextValue

    applyEnvironment({
      templateId: 'custom',
      provenance: 'manual',
      dimensionsM: dimensions,
    })
  }, [applyEnvironment, settings.roomHeightM, settings.roomLengthM, settings.roomWidthM])

  const setTreatment = useCallback((treatment: EnvironmentSelection['treatment']) => {
    applyEnvironment({
      treatment,
      templateId: 'custom',
      provenance: 'manual',
    })
  }, [applyEnvironment])

  const applyMeasuredEstimate = useCallback((dimensionsM: { length: number; width: number; height: number }) => {
    const useFeet = settings.roomDimensionsUnit === 'feet'
    const normalize = (value: number) => {
      const displayValue = useFeet ? metersToFeet(value) : value
      return Math.round(displayValue * 10) / 10
    }

    applyEnvironment({
      templateId: 'custom',
      provenance: 'measured',
      dimensionsM: {
        length: normalize(dimensionsM.length),
        width: normalize(dimensionsM.width),
        height: normalize(dimensionsM.height > 0 ? dimensionsM.height : 2.7),
      },
    })
  }, [applyEnvironment, settings.roomDimensionsUnit])

  return {
    setRoomPreset,
    setDisplayUnit,
    updateDimension,
    setTreatment,
    applyMeasuredEstimate,
  }
}
