// KillTheRing2 React Hook - Manages audio analyzer lifecycle
// DSP post-processing (classification, EQ advisory) runs in a Web Worker via useDSPWorker.

import { useState, useEffect, useCallback, useRef } from 'react'
import { AudioAnalyzer, createAudioAnalyzer } from '@/lib/audio/createAudioAnalyzer'
import { useDSPWorker, type DSPWorkerCallbacks } from './useDSPWorker'
import { getSeverityUrgency } from '@/lib/dsp/classifier'
import type {
  Advisory,
  AlgorithmMode,
  ContentType,
  SpectrumData,
  TrackedPeak,
  DetectorSettings,
} from '@/types/advisory'
import { DEFAULT_SETTINGS } from '@/lib/dsp/constants'

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
}

export function useAudioAnalyzer(
  initialSettings: Partial<DetectorSettings> = {}
): UseAudioAnalyzerReturn {
  const [settings, setSettings] = useState<DetectorSettings>(() => ({
    ...DEFAULT_SETTINGS,
    ...initialSettings,
  }))

  const [state, setState] = useState<UseAudioAnalyzerState>({
    isRunning: false,
    hasPermission: false,
    error: null,
    workerError: null,
    noiseFloorDb: null,
    sampleRate: 48000,
    fftSize: settings.fftSize,
    spectrumStatus: null,
    advisories: [],
    earlyWarning: null,
  })

  const analyzerRef = useRef<AudioAnalyzer | null>(null)
  const settingsRef = useRef(settings)

  // Hot-path refs: written every frame, read imperatively by canvas
  const spectrumRef = useRef<SpectrumData | null>(null)
  const tracksRef = useRef<TrackedPeak[]>([])
  // Throttle timestamp for React state updates (~4fps)
  const lastStatusUpdateRef = useRef(0)
  
  // Keep settings ref in sync
  useEffect(() => {
    settingsRef.current = settings
  }, [settings])

  // ── DSP Worker callbacks — stable refs, never change identity ───────────────
  // These refs forward to the latest closure values without causing re-renders

  // Advisory Map: O(1) ID lookup instead of findIndex scans per advisory update
  const advisoryMapRef = useRef<Map<string, Advisory>>(new Map())
  const advisorySortedCacheRef = useRef<Advisory[]>([])
  const advisoryDirtyRef = useRef(false)

  const buildSortedAdvisories = useCallback(() => {
    const maxIssues = settingsRef.current.maxDisplayedIssues
    const sorted = Array.from(advisoryMapRef.current.values())
      .sort((a, b) => {
        // Active cards always above resolved
        if (a.resolved !== b.resolved) return a.resolved ? 1 : -1
        const urgencyA = getSeverityUrgency(a.severity)
        const urgencyB = getSeverityUrgency(b.severity)
        if (urgencyA !== urgencyB) return urgencyB - urgencyA
        return b.trueAmplitudeDb - a.trueAmplitudeDb
      })
      .slice(0, maxIssues)
    advisorySortedCacheRef.current = sorted
    advisoryDirtyRef.current = false
    return sorted
  }, [])

  const onAdvisoryRef = useRef<(a: Advisory) => void>(() => {})

  onAdvisoryRef.current = (advisory) => {
    const map = advisoryMapRef.current

    if (map.has(advisory.id)) {
      // O(1) — same track updating
      map.set(advisory.id, advisory)
    } else {
      // Frequency-proximity dedup (100 cents = 1 semitone, matches worker)
      // Prevents duplicate cards when a peak is cleared then re-detected
      // with a new track/advisory ID at the same frequency.
      let replacedKey: string | null = null
      for (const [key, existing] of map) {
        const cents = Math.abs(1200 * Math.log2(advisory.trueFrequencyHz / existing.trueFrequencyHz))
        if (cents <= 100) {
          replacedKey = key
          break
        }
      }
      if (replacedKey) {
        map.delete(replacedKey)
      }
      map.set(advisory.id, advisory)
      advisoryDirtyRef.current = true // New entry — needs re-sort
    }

    // Only rebuild sorted array when structure changed; for updates, just refresh cache
    const sorted = advisoryDirtyRef.current
      ? buildSortedAdvisories()
      : advisorySortedCacheRef.current.map(a => a.id === advisory.id ? advisory : a)

    if (!advisoryDirtyRef.current) {
      advisorySortedCacheRef.current = sorted
    }

    setState(prev => ({ ...prev, advisories: sorted }))
  }

  // Stable callbacks object — created once, never triggers re-renders
  const stableCallbacks = useRef<DSPWorkerCallbacks>({
    onAdvisory: (advisory) => onAdvisoryRef.current(advisory),
    onAdvisoryCleared: (advisoryId) => {
      const map = advisoryMapRef.current
      const existing = map.get(advisoryId)
      if (!existing || existing.resolved) return
      const resolved = { ...existing, resolved: true, resolvedAt: Date.now() }
      map.set(advisoryId, resolved)
      advisoryDirtyRef.current = true // resolved status changes sort order
      const sorted = buildSortedAdvisories()
      setState(prev => ({ ...prev, advisories: sorted }))
    },
    onTracksUpdate: (tracks) => { tracksRef.current = tracks },
    onReady: () => {
      // Worker (re)started successfully — clear any crash warning
      setState(prev => prev.workerError ? { ...prev, workerError: null } : prev)
    },
    onError: (message) => {
      // Surface worker errors as non-fatal amber warning (not the red error banner)
      setState(prev => ({ ...prev, workerError: message }))
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
          setState(prev => ({
            ...prev,
            spectrumStatus: {
              peak: data.peak,
              autoGainDb: data.autoGainDb,
              autoGainEnabled: data.autoGainEnabled,
              autoGainLocked: data.autoGainLocked,
              algorithmMode: data.algorithmMode,
              contentType: data.contentType,
              msdFrameCount: data.msdFrameCount,
              isCompressed: data.isCompressed,
              compressionRatio: data.compressionRatio,
              isSignalPresent: data.isSignalPresent,
              rawPeakDb: data.rawPeakDb,
            },
            noiseFloorDb: data.noiseFloorDb,
          }))
        }
      },
      // Route raw peaks to the DSP worker (includes time-domain for phase coherence)
      onPeakDetected: (peak, spectrum, sampleRate, fftSize, timeDomain) => {
        dspWorkerRef.current.processPeak(peak, spectrum, sampleRate, fftSize, timeDomain)
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
      advisoryMapRef.current.clear()
      advisorySortedCacheRef.current = []
      advisoryDirtyRef.current = false
      setState(prev => ({ ...prev, advisories: [], earlyWarning: null }))
      dspWorkerRef.current.reset()

      await analyzerRef.current.start({ deviceId: deviceId || undefined })
      const analyzerState = analyzerRef.current.getState()

      // Init worker with current settings + audio context params
      dspWorkerRef.current.init(settingsRef.current, analyzerState.sampleRate, analyzerState.fftSize)

      setState(prev => ({
        ...prev,
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
        error: err instanceof Error ? err.message : 'Failed to start',
        isRunning: false,
        hasPermission: false,
      }))
    }
  }, []) // all deps accessed via stable refs

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

  return {
    ...state,
    settings,
    start,
    stop,
    switchDevice,
    updateSettings,
    resetSettings,
    spectrumRef,
    tracksRef,
  }
}
