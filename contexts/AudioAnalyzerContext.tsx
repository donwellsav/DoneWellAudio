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
import { PA2Provider, usePA2 } from '@/contexts/PA2Context'
import type { PA2ContextValue } from '@/contexts/PA2Context'
import {
  createDetectionContextValue,
  createEngineContextValue,
  createMeteringContextValue,
  createSettingsContextValue,
} from '@/contexts/audioAnalyzerContextValues'

export { useEngine, useSettings, useMetering, useDetection, usePA2 }

export type {
  EngineContextValue,
  SettingsContextValue,
  MeteringContextValue,
  DetectionContextValue,
  PA2ContextValue,
}

/**
 * @deprecated Use `EngineContextValue`, `SettingsContextValue`, `MeteringContextValue`,
 * or `DetectionContextValue` instead.
 */
export type AudioAnalyzerContextValue =
  EngineContextValue & SettingsContextValue & MeteringContextValue & DetectionContextValue

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
    setMicProfile,
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
      setMicProfile,
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
    setMicProfile,
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
            <PA2Provider advisories={advisories}>
              {children}
            </PA2Provider>
          </MeteringContext.Provider>
        </DetectionContext.Provider>
      </SettingsContext.Provider>
    </EngineContext.Provider>
  )
}

/**
 * @deprecated Use `useEngine()`, `useSettings()`, `useMetering()`, or `useDetection()` instead.
 * This hook reads all 4 contexts and re-renders on ANY context change.
 */
export function useAudio(): AudioAnalyzerContextValue {
  if (process.env.NODE_ENV === 'development') {
    // eslint-disable-next-line no-console
    console.warn('[DWA] useAudio() is deprecated â€” use useEngine(), useSettings(), useMetering(), or useDetection() for granular re-renders')
  }

  const engine = useEngine()
  const settingsCtx = useSettings()
  const metering = useMetering()
  const detection = useDetection()

  return { ...engine, ...settingsCtx, ...metering, ...detection }
}
