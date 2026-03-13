'use client'

import {
  createContext,
  useContext,
  useCallback,
  useMemo,
  type ReactNode,
  type MutableRefObject,
} from 'react'
import { useAudioAnalyzer } from '@/hooks/useAudioAnalyzer'
import type {
  UseAudioAnalyzerReturn,
  SpectrumStatus,
  EarlyWarning,
} from '@/hooks/useAudioAnalyzer'
import { useAudioDevices } from '@/hooks/useAudioDevices'
import type { AudioDevice } from '@/hooks/useAudioDevices'
import type {
  Advisory,
  DetectorSettings,
  SpectrumData,
  TrackedPeak,
  OperationMode,
} from '@/types/advisory'
import type { SnapshotBatch } from '@/types/data'
import type { DSPWorkerHandle } from '@/hooks/useDSPWorker'
import { OPERATION_MODES } from '@/lib/dsp/constants'

// ── Context value ───────────────────────────────────────────────────────────

export interface AudioAnalyzerContextValue {
  // Engine state
  isRunning: boolean
  isStarting: boolean
  error: string | null
  workerError: string | null

  // Actions
  start: () => Promise<void>
  stop: () => void
  switchDevice: (deviceId: string) => Promise<void>

  // Settings (raw — no calibration wrapper)
  settings: DetectorSettings
  updateSettings: (s: Partial<DetectorSettings>) => void
  resetSettings: () => void
  handleModeChange: (mode: OperationMode) => void
  handleFreqRangeChange: (min: number, max: number) => void

  // Spectrum + metering
  spectrumRef: React.RefObject<SpectrumData | null>
  tracksRef: React.RefObject<TrackedPeak[]>
  spectrumStatus: SpectrumStatus | null
  noiseFloorDb: number | null
  sampleRate: number
  fftSize: number
  inputLevel: number
  isAutoGain: boolean
  autoGainDb: number | undefined
  autoGainLocked: boolean

  // Devices
  devices: AudioDevice[]
  selectedDeviceId: string
  handleDeviceChange: (deviceId: string) => void

  // Detection source-of-truth
  advisories: Advisory[]
  earlyWarning: EarlyWarning | null

  // Data collection wiring
  dspWorker: DSPWorkerHandle
}

const AudioAnalyzerContext = createContext<AudioAnalyzerContextValue | null>(null)

// ── Provider props ──────────────────────────────────────────────────────────

interface AudioAnalyzerProviderProps {
  /** Ref to data collection snapshot handler — breaks circular dep with useDataCollection */
  onSnapshotBatchRef: MutableRefObject<((batch: SnapshotBatch) => void) | null>
  children: ReactNode
}

// ── Provider ────────────────────────────────────────────────────────────────

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

  const handleModeChange = useCallback((mode: OperationMode) => {
    const preset = OPERATION_MODES[mode]
    if (!preset) return
    updateSettings({
      mode,
      feedbackThresholdDb: preset.feedbackThresholdDb,
      ringThresholdDb: preset.ringThresholdDb,
      growthRateThreshold: preset.growthRateThreshold,
      musicAware: preset.musicAware,
      autoMusicAware: preset.autoMusicAware,
      fftSize: preset.fftSize,
      minFrequency: preset.minFrequency,
      maxFrequency: preset.maxFrequency,
      sustainMs: preset.sustainMs,
      clearMs: preset.clearMs,
      holdTimeMs: preset.holdTimeMs,
      confidenceThreshold: preset.confidenceThreshold,
      prominenceDb: preset.prominenceDb,
      eqPreset: preset.eqPreset,
      aWeightingEnabled: preset.aWeightingEnabled,
      inputGainDb: preset.inputGainDb,
      ignoreWhistle: preset.ignoreWhistle,
    })
  }, [updateSettings])

  const handleFreqRangeChange = useCallback((min: number, max: number) => {
    updateSettings({ minFrequency: min, maxFrequency: max })
  }, [updateSettings])

  const handleDeviceChange = useCallback((deviceId: string) => {
    setSelectedDeviceId(deviceId)
    switchDevice(deviceId)
  }, [setSelectedDeviceId, switchDevice])

  // ── Memoized value ────────────────────────────────────────────────────

  const value = useMemo<AudioAnalyzerContextValue>(() => ({
    isRunning,
    isStarting,
    error,
    workerError,
    start: startWithDevice,
    stop,
    switchDevice,
    settings,
    updateSettings,
    resetSettings,
    handleModeChange,
    handleFreqRangeChange,
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
    devices,
    selectedDeviceId,
    handleDeviceChange,
    advisories,
    earlyWarning,
    dspWorker,
  }), [
    isRunning,
    isStarting,
    error,
    workerError,
    startWithDevice,
    stop,
    switchDevice,
    settings,
    updateSettings,
    resetSettings,
    handleModeChange,
    handleFreqRangeChange,
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
    devices,
    selectedDeviceId,
    handleDeviceChange,
    advisories,
    earlyWarning,
    dspWorker,
  ])

  return (
    <AudioAnalyzerContext.Provider value={value}>
      {children}
    </AudioAnalyzerContext.Provider>
  )
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useAudio(): AudioAnalyzerContextValue {
  const ctx = useContext(AudioAnalyzerContext)
  if (!ctx) throw new Error('useAudio must be used within <AudioAnalyzerProvider>')
  return ctx
}
