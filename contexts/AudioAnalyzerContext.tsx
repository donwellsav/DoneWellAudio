'use client'

import {
  useCallback,
  useMemo,
  type ReactNode,
  type MutableRefObject,
} from 'react'
import { useAudioAnalyzer } from '@/hooks/useAudioAnalyzer'
import { useAudioDevices } from '@/hooks/useAudioDevices'
import type { OperationMode } from '@/types/advisory'
import type { SnapshotBatch } from '@/types/data'

// ── Sub-contexts ────────────────────────────────────────────────────────────

import { EngineContext, useEngine } from '@/contexts/EngineContext'
import type { EngineContextValue } from '@/contexts/EngineContext'
import { SettingsContext, useSettings } from '@/contexts/SettingsContext'
import type { SettingsContextValue } from '@/contexts/SettingsContext'
import { MeteringContext, useMetering } from '@/contexts/MeteringContext'
import type { MeteringContextValue } from '@/contexts/MeteringContext'
import { DetectionContext, useDetection } from '@/contexts/DetectionContext'
import type { DetectionContextValue } from '@/contexts/DetectionContext'

// Re-export hooks for convenience and backward compatibility
export { useEngine, useSettings, useMetering, useDetection }

// Re-export types consumers may need
export type { EngineContextValue, SettingsContextValue, MeteringContextValue, DetectionContextValue }

/**
 * @deprecated Use `EngineContextValue`, `SettingsContextValue`, `MeteringContextValue`,
 * or `DetectionContextValue` instead.
 */
export type AudioAnalyzerContextValue =
  EngineContextValue & SettingsContextValue & MeteringContextValue & DetectionContextValue

// ── Provider props ──────────────────────────────────────────────────────────

interface AudioAnalyzerProviderProps {
  /** Ref to data collection snapshot handler — breaks circular dep with useDataCollection */
  onSnapshotBatchRef: MutableRefObject<((batch: SnapshotBatch) => void) | null>
  children: ReactNode
}

// ── Compound Provider ───────────────────────────────────────────────────────

export function AudioAnalyzerProvider({
  onSnapshotBatchRef,
  children,
}: AudioAnalyzerProviderProps) {
  // ── Core audio analyzer ───────────────────────────────────────────────

  const {
    isRunning,
    isStarting,
    error,
    workerError,
    noiseFloorDb,
    spectrumStatus,
    spectrumRef,
    tracksRef,
    advisories,
    earlyWarning,
    sampleRate,
    fftSize,
    settings,
    start,
    stop,
    switchDevice,
    updateSettings,
    resetSettings,
    dspWorker,
    roomEstimate,
    roomMeasuring,
    roomProgress,
    startRoomMeasurement,
    stopRoomMeasurement,
    clearRoomEstimate,
    layeredSession,
    layeredDisplay,
    layered,
  } = useAudioAnalyzer({}, {
    onSnapshotBatch: (batch: SnapshotBatch) => onSnapshotBatchRef.current?.(batch),
  })

  // ── Devices ───────────────────────────────────────────────────────────

  const { devices, selectedDeviceId, setSelectedDeviceId } = useAudioDevices()

  // ── Wrapped start (always passes persisted device preference) ─────────

  const startWithDevice = useCallback(async () => {
    await start({ deviceId: selectedDeviceId || undefined })
  }, [start, selectedDeviceId])

  // ── Derived metering values ───────────────────────────────────────────

  const inputLevel = spectrumStatus?.peak ?? -60
  const autoGainDb = spectrumStatus?.autoGainDb
  const isAutoGain = spectrumStatus?.autoGainEnabled ?? settings.autoGainEnabled
  const autoGainLocked = spectrumStatus?.autoGainLocked ?? false

  // ── Pure convenience callbacks ────────────────────────────────────────

  // Mode change: legacy shim detects 'mode' key and calls setMode() internally,
  // which applies the full baseline and resets live overrides (except gain).
  const handleModeChange = useCallback((mode: OperationMode) => {
    updateSettings({ mode })
  }, [updateSettings])

  const handleFreqRangeChange = useCallback((min: number, max: number) => {
    updateSettings({ minFrequency: min, maxFrequency: max })
  }, [updateSettings])

  const handleDeviceChange = useCallback((deviceId: string) => {
    setSelectedDeviceId(deviceId)
    switchDevice(deviceId)
  }, [setSelectedDeviceId, switchDevice])

  // ── Memoized context values (4 independent useMemo) ───────────────────

  const engineValue = useMemo<EngineContextValue>(() => ({
    isRunning,
    isStarting,
    error,
    workerError,
    start: startWithDevice,
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

  const settingsValue = useMemo<SettingsContextValue>(() => ({
    settings,
    updateSettings,
    resetSettings,
    handleModeChange,
    handleFreqRangeChange,
    session: layeredSession,
    displayPrefs: layeredDisplay,
    // Semantic actions (Phase 5+)
    setMode: layered.setMode,
    setEnvironment: layered.setEnvironment,
    setSensitivityOffset: layered.setSensitivityOffset,
    setInputGain: layered.setInputGain,
    setAutoGain: layered.setAutoGain,
    setFocusRange: layered.setFocusRange,
    setEqStyle: layered.setEqStyle,
    setMicProfile: layered.setMicProfile,
    updateDisplay: layered.updateDisplay,
    updateDiagnostics: layered.updateDiagnostics,
    updateLiveOverrides: layered.updateLiveOverrides,
  }), [
    settings,
    updateSettings,
    resetSettings,
    handleModeChange,
    handleFreqRangeChange,
    layeredSession,
    layeredDisplay,
    layered.setMode,
    layered.setEnvironment,
    layered.setSensitivityOffset,
    layered.setInputGain,
    layered.setAutoGain,
    layered.setFocusRange,
    layered.setEqStyle,
    layered.setMicProfile,
    layered.updateDisplay,
    layered.updateDiagnostics,
    layered.updateLiveOverrides,
  ])

  const meteringValue = useMemo<MeteringContextValue>(() => ({
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

  const detectionValue = useMemo<DetectionContextValue>(() => ({
    advisories,
    earlyWarning,
  }), [
    advisories,
    earlyWarning,
  ])

  // Nest providers: outermost = least frequent updates, innermost = most frequent
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

// ── Legacy hook (deprecated) ────────────────────────────────────────────────

/**
 * @deprecated Use `useEngine()`, `useSettings()`, `useMetering()`, or `useDetection()` instead.
 * This hook reads all 4 contexts and re-renders on ANY context change — no re-render savings.
 */
export function useAudio(): AudioAnalyzerContextValue {
  const engine = useEngine()
  const settingsCtx = useSettings()
  const metering = useMetering()
  const detection = useDetection()
  return { ...engine, ...settingsCtx, ...metering, ...detection }
}
