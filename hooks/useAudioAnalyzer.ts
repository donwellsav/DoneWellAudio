// DoneWell Audio React Hook - Manages audio analyzer lifecycle
// DSP post-processing (classification, EQ advisory) runs in a Web Worker via useDSPWorker.
// Advisory state management (Map, sorting, dedup) delegated to useAdvisoryMap.

import { useState, useEffect, useCallback, useRef } from 'react'
import { AudioAnalyzer, createAudioAnalyzer } from '@/lib/audio/createAudioAnalyzer'
import { useDSPWorker, type DSPWorkerCallbacks, type DSPWorkerHandle } from './useDSPWorker'
import { useAdvisoryMap } from './useAdvisoryMap'
import type {
  Advisory,
  AlgorithmMode,
  ContentType,
  SpectrumData,
  TrackedPeak,
  DetectorSettings,
} from '@/types/advisory'
import type { RoomDimensionEstimate } from '@/types/calibration'
import { DEFAULT_SETTINGS, ROOM_ESTIMATION } from '@/lib/dsp/constants'
import { customDefaultsStorage } from '@/lib/storage/dwaStorage'

/** Early warning for predicted feedback frequencies based on comb pattern detection */
export interface EarlyWarning {
  /** Predicted frequencies that may develop feedback (Hz) */
  predictedFrequencies: number[]
  /** Detected fundamental spacing (Hz) */
  fundamentalSpacing: number | null
  /** Estimated acoustic path length (meters) */
  estimatedPathLength: number | null
  /** Confidence in prediction (0-1) */
  confidence: number
  /** Timestamp of detection */
  timestamp: number
}

/** Throttled scalar fields from SpectrumData for DOM consumers.
 *  noiseFloorDb lives at UseAudioAnalyzerState top-level (single source of truth). */
const STATUS_THROTTLE_MS = 250 // ~4fps React state updates for DOM consumers

export interface SpectrumStatus {
  peak: number
  autoGainDb?: number
  autoGainEnabled?: boolean
  autoGainLocked?: boolean
  algorithmMode?: AlgorithmMode
  contentType?: ContentType
  msdFrameCount?: number
  isCompressed?: boolean
  compressionRatio?: number
  isSignalPresent?: boolean
  rawPeakDb?: number
}

export interface UseAudioAnalyzerState {
  isRunning: boolean
  /** True between clicking Start and mic stream acquisition (covers permission prompt) */
  isStarting: boolean
  hasPermission: boolean
  error: string | null
  /** Non-fatal worker error (crash/recovery in progress) — shown as amber warning */
  workerError: string | null
  noiseFloorDb: number | null
  sampleRate: number
  fftSize: number
  spectrumStatus: SpectrumStatus | null
  advisories: Advisory[]
  /** Early warning predictions for upcoming feedback frequencies */
  earlyWarning: EarlyWarning | null
}

export interface UseAudioAnalyzerReturn extends UseAudioAnalyzerState {
  start: (options?: { deviceId?: string }) => Promise<void>
  stop: () => void
  switchDevice: (deviceId: string) => Promise<void>
  updateSettings: (settings: Partial<DetectorSettings>) => void
  resetSettings: () => void
  settings: DetectorSettings
  /** Direct ref to latest SpectrumData — canvas reads this imperatively each frame */
  spectrumRef: React.RefObject<SpectrumData | null>
  /** Direct ref to latest tracked peaks — canvas reads this imperatively */
  tracksRef: React.RefObject<TrackedPeak[]>
  /** DSP worker handle — used by useDataCollection to enable/disable snapshot collection */
  dspWorker: DSPWorkerHandle
  // ── Room dimension estimation ──────────────────────────────────────────
  /** Latest room dimension estimate from inverse solver */
  roomEstimate: RoomDimensionEstimate | null
  /** Whether room measurement is in progress */
  roomMeasuring: boolean
  /** Room measurement progress */
  roomProgress: { elapsedMs: number; stablePeaks: number }
  /** Start room dimension measurement */
  startRoomMeasurement: () => void
  /** Stop room dimension measurement */
  stopRoomMeasurement: () => void
  /** Clear the current room estimate */
  clearRoomEstimate: () => void
}

/** Internal state — advisories owned by useAdvisoryMap */
type InternalAnalyzerState = Omit<UseAudioAnalyzerState, 'advisories'>

export function useAudioAnalyzer(
  initialSettings: Partial<DetectorSettings> = {},
  externalCallbacks?: { onSnapshotBatch?: (batch: import('@/types/data').SnapshotBatch) => void }
): UseAudioAnalyzerReturn {
  const [settings, setSettings] = useState<DetectorSettings>(() => {
    const saved = customDefaultsStorage.load()
    return {
      ...DEFAULT_SETTINGS,
      ...(saved ?? {}),
      ...initialSettings,
    }
  })

  const settingsRef = useRef(settings)

  // Auto-persist settings to localStorage on every change
  useEffect(() => {
    customDefaultsStorage.save(settings)
  }, [settings])

  // Keep settings ref in sync
  useEffect(() => {
    settingsRef.current = settings
  }, [settings])

  // ── Advisory state (Map, sorting, dedup) — extracted hook ──────────────────
  const { advisories, onAdvisory, onAdvisoryCleared, clearMap } = useAdvisoryMap(settingsRef)

  // ── Internal state (everything except advisories) ─────────────────────────
  const [state, setState] = useState<InternalAnalyzerState>({
    isRunning: false,
    isStarting: false,
    hasPermission: false,
    error: null,
    workerError: null,
    noiseFloorDb: null,
    sampleRate: 48000,
    fftSize: settings.fftSize,
    spectrumStatus: null,
    earlyWarning: null,
  })

  const analyzerRef = useRef<AudioAnalyzer | null>(null)

  // Hot-path refs: written every frame, read imperatively by canvas
  const spectrumRef = useRef<SpectrumData | null>(null)
  const tracksRef = useRef<TrackedPeak[]>([])
  // Throttle timestamp for React state updates (~4fps)
  const lastStatusUpdateRef = useRef(0)

  // ── Room estimation state ───────────────────────────────────────────────────
  const [roomEstimate, setRoomEstimate] = useState<RoomDimensionEstimate | null>(null)
  const [roomMeasuring, setRoomMeasuring] = useState(false)
  const [roomProgress, setRoomProgress] = useState({ elapsedMs: 0, stablePeaks: 0 })
  const roomAutoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── DSP Worker callbacks — stable refs, never change identity ───────────────

  // Worker-derived status (contentType, algorithmMode, etc.) — updated on tracksUpdate
  const workerStatusRef = useRef<{ contentType?: ContentType; algorithmMode?: AlgorithmMode; isCompressed?: boolean; compressionRatio?: number }>({})

  // Keep external callbacks ref in sync
  const externalCallbacksRef = useRef(externalCallbacks)
  useEffect(() => { externalCallbacksRef.current = externalCallbacks }, [externalCallbacks])

  // Stable callbacks object — created once, never triggers re-renders
  const stableCallbacks = useRef<DSPWorkerCallbacks>({
    onAdvisory,
    onAdvisoryCleared,
    onTracksUpdate: (tracks, status) => {
      tracksRef.current = tracks
      if (status) workerStatusRef.current = status
    },
    onReady: () => {
      // Worker (re)started successfully — clear any crash warning
      setState(prev => prev.workerError ? { ...prev, workerError: null } : prev)
    },
    onError: (message) => {
      // Surface worker errors as non-fatal amber warning (not the red error banner)
      setState(prev => ({ ...prev, workerError: message }))
    },
    onSnapshotBatch: (batch) => {
      externalCallbacksRef.current?.onSnapshotBatch?.(batch)
    },
    onRoomEstimate: (estimate) => {
      setRoomEstimate(estimate)
    },
    onRoomMeasurementProgress: (elapsedMs, stablePeaks) => {
      setRoomProgress({ elapsedMs, stablePeaks })
      if (elapsedMs >= ROOM_ESTIMATION.ACCUMULATION_WINDOW_MS) {
        setRoomMeasuring(false)
      }
    },
  }).current

  // ── DSP Worker ──────────────────────────────────────────────────────────────
  const dspWorker = useDSPWorker(stableCallbacks)

  // ── Analyzer ────────────────────────────────────────────────────────────────
  // Initialize analyzer
  useEffect(() => {
    const analyzer = createAudioAnalyzer(settings, {
      onSpectrum: (data) => {
        // Hot path: write to ref every frame (canvas reads this directly)
        spectrumRef.current = data

        // Throttled path: update React state at ~4fps for DOM consumers
        const now = performance.now()
        if (now - lastStatusUpdateRef.current > STATUS_THROTTLE_MS) {
          lastStatusUpdateRef.current = now
          const nextStatus: SpectrumStatus = {
            peak: data.peak,
            autoGainDb: data.autoGainDb,
            autoGainEnabled: data.autoGainEnabled,
            autoGainLocked: data.autoGainLocked,
            algorithmMode: workerStatusRef.current.algorithmMode ?? data.algorithmMode,
            // Main thread contentType runs every ~500ms regardless of peaks.
            // Worker only classifies when peaks arrive. Main thread is the authority.
            contentType: data.contentType ?? workerStatusRef.current.contentType,
            msdFrameCount: data.msdFrameCount,
            isCompressed: workerStatusRef.current.isCompressed ?? data.isCompressed,
            compressionRatio: workerStatusRef.current.compressionRatio ?? data.compressionRatio,
            isSignalPresent: data.isSignalPresent,
            rawPeakDb: data.rawPeakDb,
          }
          const nextNoiseFloor = data.noiseFloorDb
          setState(prev => {
            // Skip re-render if all scalar fields are unchanged (reference stability)
            const ps = prev.spectrumStatus
            if (
              ps &&
              ps.peak === nextStatus.peak &&
              ps.autoGainDb === nextStatus.autoGainDb &&
              ps.autoGainEnabled === nextStatus.autoGainEnabled &&
              ps.autoGainLocked === nextStatus.autoGainLocked &&
              ps.algorithmMode === nextStatus.algorithmMode &&
              ps.contentType === nextStatus.contentType &&
              ps.msdFrameCount === nextStatus.msdFrameCount &&
              ps.isCompressed === nextStatus.isCompressed &&
              ps.isSignalPresent === nextStatus.isSignalPresent &&
              prev.noiseFloorDb === nextNoiseFloor
            ) {
              return prev
            }
            return { ...prev, spectrumStatus: nextStatus, noiseFloorDb: nextNoiseFloor }
          })
        }
      },
      // Route raw peaks to the DSP worker (includes time-domain for phase coherence)
      onPeakDetected: (peak, spectrum, sampleRate, fftSize, timeDomain, contentType) => {
        dspWorkerRef.current.processPeak(peak, spectrum, sampleRate, fftSize, timeDomain, contentType)
      },
      onPeakCleared: (peak) => {
        dspWorkerRef.current.clearPeak(peak.binIndex, peak.frequencyHz, peak.timestamp)
      },
      // Early warning: comb filter pattern detected with predicted frequencies
      onCombPatternDetected: (pattern) => {
        if (pattern.hasPattern && pattern.predictedFrequencies.length > 0) {
          setState(prev => ({
            ...prev,
            earlyWarning: {
              predictedFrequencies: pattern.predictedFrequencies,
              fundamentalSpacing: pattern.fundamentalSpacing,
              estimatedPathLength: pattern.estimatedPathLength,
              confidence: pattern.confidence,
              timestamp: Date.now(),
            },
          }))
        } else {
          // Clear early warning when pattern is no longer detected
          setState(prev => prev.earlyWarning ? { ...prev, earlyWarning: null } : prev)
        }
      },
      onError: (error) => {
        setState(prev => ({
          ...prev,
          error: error.message,
          isRunning: false,
        }))
      },
      onStateChange: (isRunning) => {
        setState(prev => ({ ...prev, isRunning }))
      },
    })

    analyzerRef.current = analyzer

    return () => {
      analyzer.stop({ releaseMic: true })
      if (roomAutoStopRef.current) clearTimeout(roomAutoStopRef.current)
    }
  }, []) // Only create once

  const dspWorkerRef = useRef(dspWorker)
  dspWorkerRef.current = dspWorker

  // Update analyzer + worker when settings change
  useEffect(() => {
    if (analyzerRef.current) {
      analyzerRef.current.updateSettings(settings)
      setState(prev => ({ ...prev, fftSize: settings.fftSize }))
    }
    dspWorkerRef.current.updateSettings(settings)
  }, [settings]) // dspWorker is stable — access via ref

  const deviceIdRef = useRef<string>('')

  const start = useCallback(async (options: { deviceId?: string } = {}) => {
    if (!analyzerRef.current) return
    const deviceId = options.deviceId ?? deviceIdRef.current

    try {
      // Clear previous advisories + worker state when starting fresh analysis
      tracksRef.current = []
      clearMap()
      setState(prev => ({ ...prev, isStarting: true, earlyWarning: null }))
      dspWorkerRef.current.reset()

      await analyzerRef.current.start({ deviceId: deviceId || undefined })
      const analyzerState = analyzerRef.current.getState()

      // Init worker with current settings + audio context params
      dspWorkerRef.current.init(settingsRef.current, analyzerState.sampleRate, analyzerState.fftSize)

      setState(prev => ({
        ...prev,
        isStarting: false,
        isRunning: true,
        hasPermission: analyzerState.hasPermission,
        error: null,
        noiseFloorDb: analyzerState.noiseFloorDb,
        sampleRate: analyzerState.sampleRate,
        fftSize: analyzerState.fftSize,
      }))
    } catch (err) {
      setState(prev => ({
        ...prev,
        isStarting: false,
        error: err instanceof Error ? err.message : 'Failed to start',
        isRunning: false,
        hasPermission: false,
      }))
    }
  }, [clearMap]) // clearMap is stable (useCallback with [] deps)

  const stop = useCallback(() => {
    if (!analyzerRef.current) return
    analyzerRef.current.stop({ releaseMic: false })
    // Keep advisories visible until next start - only clear running state
    tracksRef.current = []
    setState(prev => ({
      ...prev,
      isRunning: false,
    }))
  }, [])

  const switchDevice = useCallback(async (deviceId: string) => {
    deviceIdRef.current = deviceId
    if (!analyzerRef.current) return
    // Hot-swap: release old mic, start with new device — read imperative state to avoid stale closure
    const wasRunning = analyzerRef.current.getState().isRunning
    if (wasRunning) {
      analyzerRef.current.stop({ releaseMic: true })
      await analyzerRef.current.start({ deviceId: deviceId || undefined })
      const analyzerState = analyzerRef.current.getState()
      dspWorkerRef.current.init(settingsRef.current, analyzerState.sampleRate, analyzerState.fftSize)
    }
  }, [])

  const updateSettings = useCallback((newSettings: Partial<DetectorSettings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }))
  }, [])

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS)
  }, [])

  // ── Room estimation controls ──────────────────────────────────────────────
  const startRoomMeasurement = useCallback(() => {
    setRoomMeasuring(true)
    setRoomEstimate(null)
    setRoomProgress({ elapsedMs: 0, stablePeaks: 0 })
    dspWorkerRef.current.startRoomMeasurement()
    if (roomAutoStopRef.current) clearTimeout(roomAutoStopRef.current)
    roomAutoStopRef.current = setTimeout(() => {
      setRoomMeasuring(false)
    }, ROOM_ESTIMATION.ACCUMULATION_WINDOW_MS + 500)
  }, [])

  const stopRoomMeasurement = useCallback(() => {
    setRoomMeasuring(false)
    dspWorkerRef.current.stopRoomMeasurement()
    if (roomAutoStopRef.current) {
      clearTimeout(roomAutoStopRef.current)
      roomAutoStopRef.current = null
    }
  }, [])

  const clearRoomEstimate = useCallback(() => {
    setRoomEstimate(null)
    setRoomProgress({ elapsedMs: 0, stablePeaks: 0 })
  }, [])

  return {
    ...state,
    advisories,
    settings,
    start,
    stop,
    switchDevice,
    updateSettings,
    resetSettings,
    spectrumRef,
    tracksRef,
    dspWorker,
    // Room estimation
    roomEstimate,
    roomMeasuring,
    roomProgress,
    startRoomMeasurement,
    stopRoomMeasurement,
    clearRoomEstimate,
  }
}
