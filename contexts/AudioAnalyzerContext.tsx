'use client'

import { useMemo, type ReactNode } from 'react'
import { useAnalyzerContextState } from '@/hooks/useAnalyzerContextState'
import type { DataCollectionHandle } from '@/hooks/useDataCollection'

import { EngineContext, useEngine } from '@/contexts/EngineContext'
import type { EngineContextValue } from '@/contexts/EngineContext'
import { SettingsContext, useSettings } from '@/contexts/SettingsContext'
import type { SettingsContextValue } from '@/contexts/SettingsContext'
import { MeteringContext, useMetering } from '@/contexts/MeteringContext'
import type { MeteringContextValue } from '@/contexts/MeteringContext'
import { DetectionContext, useDetection } from '@/contexts/DetectionContext'
import type { DetectionContextValue } from '@/contexts/DetectionContext'
import {
  createDetectionContextValue,
  createEngineContextValue,
  createMeteringContextValue,
  createSettingsContextValue,
} from '@/contexts/audioAnalyzerContextValues'

export { useEngine, useSettings, useMetering, useDetection }

export type {
  EngineContextValue,
  SettingsContextValue,
  MeteringContextValue,
  DetectionContextValue,
}


interface AudioAnalyzerProviderProps {
  dataCollection: DataCollectionHandle
  frozenRef?: React.RefObject<boolean>
  children: ReactNode
}

export function AudioAnalyzerProvider({
  dataCollection,
  frozenRef,
  children,
}: AudioAnalyzerProviderProps) {
  const state = useAnalyzerContextState({ dataCollection, frozenRef })
  const {
    isRunning,
    isStarting,
    error,
    workerError,
    startWithDevice,
    stop,
    switchDevice,
    devices,
    selectedDeviceId,
    handleDeviceChange,
    dspWorker,
    roomEstimate,
    roomMeasuring,
    roomProgress,
    startRoomMeasurement,
    stopRoomMeasurement,
    clearRoomEstimate,
    settings,
    resetSettings,
    layeredSession,
    layeredDisplay,
    layered,
    spectrumRef,
    tracksRef,
    spectrumStatus,
    noiseFloorDb,
    sampleRate,
    fftSize,
    inputLevel,
    isAutoGain,
    autoGainDb,
    autoGainLocked,
    advisories,
    earlyWarning,
  } = state
  const {
    setMode,
    setEnvironment,
    setSensitivityOffset,
    setInputGain,
    setAutoGain,
    setFocusRange,
    setEqStyle,
    updateDisplay,
    updateDiagnostics,
    updateLiveOverrides,
  } = layered

  const engineValue = useMemo(() => createEngineContextValue({
    isRunning,
    isStarting,
    error,
    workerError,
    startWithDevice,
    stop,
    switchDevice,
    devices,
    selectedDeviceId,
    handleDeviceChange,
    dspWorker,
    roomEstimate,
    roomMeasuring,
    roomProgress,
    startRoomMeasurement,
    stopRoomMeasurement,
    clearRoomEstimate,
  }), [
    isRunning,
    isStarting,
    error,
    workerError,
    startWithDevice,
    stop,
    switchDevice,
    devices,
    selectedDeviceId,
    handleDeviceChange,
    dspWorker,
    roomEstimate,
    roomMeasuring,
    roomProgress,
    startRoomMeasurement,
    stopRoomMeasurement,
    clearRoomEstimate,
  ])

  const settingsValue = useMemo(() => createSettingsContextValue({
    settings,
    resetSettings,
    layeredSession,
    layeredDisplay,
    layered: {
      setMode,
      setEnvironment,
      setSensitivityOffset,
      setInputGain,
      setAutoGain,
      setFocusRange,
      setEqStyle,
      updateDisplay,
      updateDiagnostics,
      updateLiveOverrides,
    },
  }), [
    settings,
    resetSettings,
    layeredSession,
    layeredDisplay,
    setMode,
    setEnvironment,
    setSensitivityOffset,
    setInputGain,
    setAutoGain,
    setFocusRange,
    setEqStyle,
    updateDisplay,
    updateDiagnostics,
    updateLiveOverrides,
  ])

  const meteringValue = useMemo(() => createMeteringContextValue({
    spectrumRef,
    tracksRef,
    spectrumStatus,
    noiseFloorDb,
    sampleRate,
    fftSize,
    inputLevel,
    isAutoGain,
    autoGainDb,
    autoGainLocked,
  }), [
    spectrumRef,
    tracksRef,
    spectrumStatus,
    noiseFloorDb,
    sampleRate,
    fftSize,
    inputLevel,
    isAutoGain,
    autoGainDb,
    autoGainLocked,
  ])

  const detectionValue = useMemo(() => createDetectionContextValue({
    advisories,
    earlyWarning,
  }), [
    advisories,
    earlyWarning,
  ])

  return (
    <EngineContext.Provider value={engineValue}>
      <SettingsContext.Provider value={settingsValue}>
        <DetectionContext.Provider value={detectionValue}>
          <MeteringContext.Provider value={meteringValue}>
            {children}
          </MeteringContext.Provider>
        </DetectionContext.Provider>
      </SettingsContext.Provider>
    </EngineContext.Provider>
  )
}

