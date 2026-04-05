// DoneWell Audio React Hook - Manages audio analyzer lifecycle
// DSP post-processing (classification, EQ advisory) runs in a Web Worker via useDSPWorker.
// Advisory state management (Map, sorting, dedup) is delegated to useAdvisoryMap.

import { useState, useEffect, useCallback, useRef } from 'react'
import { AudioAnalyzer, createAudioAnalyzer } from '@/lib/audio/createAudioAnalyzer'
import { useDSPWorker, type DSPWorkerCallbacks, type DSPWorkerHandle } from './useDSPWorker'
import { useAdvisoryMap } from './useAdvisoryMap'
import type {
  Advisory,
  SpectrumData,
  TrackedPeak,
  DetectorSettings,
} from '@/types/advisory'
import type { RoomDimensionEstimate } from '@/types/calibration'
import { useLayeredSettings } from '@/hooks/useLayeredSettings'
import { useSessionHistory } from '@/hooks/useSessionHistory'
import { pickAudioRuntimeSettings, pickWorkerRuntimeSettings } from '@/lib/settings/runtimeSettings'
import type { EarlyWarning, SpectrumStatus } from '@/hooks/audioAnalyzerTypes'
import { useAnalyzerFrameState } from '@/hooks/useAnalyzerFrameState'
import { useRoomMeasurement } from '@/hooks/useRoomMeasurement'

export type { EarlyWarning, SpectrumStatus } from '@/hooks/audioAnalyzerTypes'

export interface UseAudioAnalyzerState {
  isRunning: boolean
  /** True between clicking Start and mic stream acquisition (covers permission prompt) */
  isStarting: boolean
  hasPermission: boolean
  error: string | null
  /** Non-fatal worker error (crash/recovery in progress) â€” shown as amber warning */
  workerError: string | null
  noiseFloorDb: number | null
  sampleRate: number
  fftSize: number
  spectrumStatus: SpectrumStatus | null
  advisories: Advisory[]
  earlyWarning: EarlyWarning | null
}

export interface UseAudioAnalyzerReturn extends UseAudioAnalyzerState {
  start: (options?: { deviceId?: string }) => Promise<void>
  stop: () => void
  switchDevice: (deviceId: string) => Promise<void>
  resetSettings: () => void
  settings: DetectorSettings
  spectrumRef: React.RefObject<SpectrumData | null>
  tracksRef: React.RefObject<TrackedPeak[]>
  dspWorker: DSPWorkerHandle
  roomEstimate: RoomDimensionEstimate | null
  roomMeasuring: boolean
  roomProgress: { elapsedMs: number; stablePeaks: number }
  startRoomMeasurement: () => void
  stopRoomMeasurement: () => void
  clearRoomEstimate: () => void
  layeredSession: import('@/types/settings').DwaSessionState
  layeredDisplay: import('@/types/settings').DisplayPrefs
  layered: import('@/hooks/useLayeredSettings').UseLayeredSettingsReturn
}

type InternalAnalyzerState = Omit<
  UseAudioAnalyzerState,
  'advisories' | 'noiseFloorDb' | 'spectrumStatus' | 'earlyWarning'
>

export function useAudioAnalyzer(
  initialSettings: Partial<DetectorSettings> = {},
  externalCallbacks?: { onSnapshotBatch?: (batch: import('@/types/data').SnapshotBatch) => void },
  frozenRef?: React.RefObject<boolean>,
): UseAudioAnalyzerReturn {
  const layered = useLayeredSettings(initialSettings)
  const settings = layered.derivedSettings
  const settingsRef = useRef(settings)

  useEffect(() => {
    settingsRef.current = settings
  }, [settings])

  const { advisories, onAdvisory, onAdvisoryCleared, clearMap } = useAdvisoryMap(
    settings.maxDisplayedIssues,
    frozenRef,
  )

  const [state, setState] = useState<InternalAnalyzerState>({
    isRunning: false,
    isStarting: false,
    hasPermission: false,
    error: null,
    workerError: null,
    sampleRate: 48000,
    fftSize: settings.fftSize,
  })

  const analyzerRef = useRef<AudioAnalyzer | null>(null)
  const {
    noiseFloorDb,
    spectrumStatus,
    earlyWarning,
    spectrumRef,
    tracksRef,
    handleSpectrum,
    handleTracksUpdate,
    handleContentTypeUpdate,
    handleCombPatternDetected,
    clearEarlyWarning,
  } = useAnalyzerFrameState()
  const {
    roomEstimate,
    roomMeasuring,
    roomProgress,
    handleRoomEstimate,
    handleRoomProgress,
    startMeasurement,
    stopMeasurement,
    clearEstimate,
  } = useRoomMeasurement()

  const { endSession, resetGuard, updateContext } = useSessionHistory({
    isRunning: state.isRunning,
  })

  useEffect(() => {
    updateContext({ mode: settings.mode })
  }, [settings.mode, updateContext])

  const externalCallbacksRef = useRef(externalCallbacks)
  useEffect(() => {
    externalCallbacksRef.current = externalCallbacks
  }, [externalCallbacks])

  const stableCallbacks = useRef<DSPWorkerCallbacks>({
    onAdvisory,
    onAdvisoryCleared,
    onTracksUpdate: handleTracksUpdate,
    onEarlyWarningUpdate: handleCombPatternDetected,
    onContentTypeUpdate: handleContentTypeUpdate,
    onReady: () => {
      setState((previous) => previous.workerError ? { ...previous, workerError: null } : previous)
    },
    onError: (message) => {
      setState((previous) => ({ ...previous, workerError: message }))
    },
    onSnapshotBatch: (batch) => {
      externalCallbacksRef.current?.onSnapshotBatch?.(batch)
    },
    onRoomEstimate: handleRoomEstimate,
    onRoomMeasurementProgress: handleRoomProgress,
  }).current

  const dspWorker = useDSPWorker(stableCallbacks)
  const dspWorkerRef = useRef(dspWorker)
  dspWorkerRef.current = dspWorker

  useEffect(() => {
    const analyzer = createAudioAnalyzer(pickAudioRuntimeSettings(settingsRef.current), {
      onSpectrum: handleSpectrum,
      onPeakDetected: (peak, spectrum, sampleRate, fftSize, timeDomain) => {
        dspWorkerRef.current.processPeak(peak, spectrum, sampleRate, fftSize, timeDomain)
      },
      onSpectrumUpdate: (spectrum, crestFactor, sampleRate, fftSize) => {
        dspWorkerRef.current.sendSpectrumUpdate(spectrum, crestFactor, sampleRate, fftSize)
      },
      onPeakCleared: (peak) => {
        dspWorkerRef.current.clearPeak(peak.binIndex, peak.frequencyHz, peak.timestamp)
      },
      onCombPatternDetected: handleCombPatternDetected,
      onError: (error) => {
        setState((previous) => ({
          ...previous,
          error: error.message,
          isRunning: false,
        }))
      },
      onStateChange: (isRunning) => {
        setState((previous) => ({ ...previous, isRunning }))
      },
    })

    analyzerRef.current = analyzer

    return () => {
      analyzer.stop({ releaseMic: true })
    }
  }, [handleCombPatternDetected, handleSpectrum])

  useEffect(() => {
    if (analyzerRef.current) {
      analyzerRef.current.updateSettings(pickAudioRuntimeSettings(settings))
      setState((previous) => ({ ...previous, fftSize: settings.fftSize }))
    }
    dspWorkerRef.current.updateSettings(pickWorkerRuntimeSettings(settings))
  }, [settings])

  const deviceIdRef = useRef<string>('')

  const start = useCallback(async (options: { deviceId?: string } = {}) => {
    if (!analyzerRef.current) return

    const deviceId = options.deviceId ?? deviceIdRef.current

    try {
      resetGuard()
      tracksRef.current = []
      clearMap()
      clearEarlyWarning()
      setState((previous) => ({ ...previous, isStarting: true }))
      dspWorkerRef.current.reset()

      await analyzerRef.current.start({ deviceId: deviceId || undefined })
      const analyzerState = analyzerRef.current.getState()

      dspWorkerRef.current.init(
        pickWorkerRuntimeSettings(settingsRef.current),
        analyzerState.sampleRate,
        analyzerState.fftSize,
      )

      setState((previous) => ({
        ...previous,
        isStarting: false,
        isRunning: true,
        hasPermission: analyzerState.hasPermission,
        error: null,
        sampleRate: analyzerState.sampleRate,
        fftSize: analyzerState.fftSize,
      }))
    } catch (error) {
      setState((previous) => ({
        ...previous,
        isStarting: false,
        error: error instanceof Error ? error.message : 'Failed to start',
        isRunning: false,
        hasPermission: false,
      }))
    }
  }, [clearEarlyWarning, clearMap, resetGuard, tracksRef])

  const stop = useCallback(() => {
    if (!analyzerRef.current) return

    endSession()
    analyzerRef.current.stop({ releaseMic: false })
    tracksRef.current = []
    setState((previous) => ({
      ...previous,
      isRunning: false,
    }))
  }, [endSession, tracksRef])

  const switchDevice = useCallback(async (deviceId: string) => {
    deviceIdRef.current = deviceId
    if (!analyzerRef.current) return

    const wasRunning = analyzerRef.current.getState().isRunning
    if (!wasRunning) return

    analyzerRef.current.stop({ releaseMic: true })
    await analyzerRef.current.start({ deviceId: deviceId || undefined })
    const analyzerState = analyzerRef.current.getState()
    dspWorkerRef.current.init(
      pickWorkerRuntimeSettings(settingsRef.current),
      analyzerState.sampleRate,
      analyzerState.fftSize,
    )
  }, [])

  const resetSettings = useCallback(() => {
    layered.resetAll()
  }, [layered])

  const startRoomMeasurement = useCallback(() => {
    startMeasurement(() => dspWorkerRef.current.startRoomMeasurement())
  }, [startMeasurement])

  const stopRoomMeasurement = useCallback(() => {
    stopMeasurement(() => dspWorkerRef.current.stopRoomMeasurement())
  }, [stopMeasurement])

  return {
    ...state,
    noiseFloorDb,
    spectrumStatus,
    advisories,
    earlyWarning,
    settings,
    start,
    stop,
    switchDevice,
    resetSettings,
    spectrumRef,
    tracksRef,
    dspWorker,
    roomEstimate,
    roomMeasuring,
    roomProgress,
    startRoomMeasurement,
    stopRoomMeasurement,
    clearRoomEstimate: clearEstimate,
    layeredSession: layered.session,
    layeredDisplay: layered.display,
    layered,
  }
}
