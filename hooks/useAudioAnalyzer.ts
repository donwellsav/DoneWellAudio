// KillTheRing2 React Hook - Manages audio analyzer lifecycle
// DSP post-processing (classification, EQ advisory) runs in a Web Worker via useDSPWorker.

import { useState, useEffect, useCallback, useRef } from 'react'
import { AudioAnalyzer, createAudioAnalyzer } from '@/lib/audio/createAudioAnalyzer'
import { useDSPWorker, type DSPWorkerCallbacks } from './useDSPWorker'
import { getSeverityUrgency } from '@/lib/dsp/classifier'
import type { 
  Advisory, 
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

export interface UseAudioAnalyzerState {
  isRunning: boolean
  hasPermission: boolean
  error: string | null
  noiseFloorDb: number | null
  sampleRate: number
  fftSize: number
  spectrum: SpectrumData | null
  tracks: TrackedPeak[]
  advisories: Advisory[]
  /** Early warning predictions for upcoming feedback frequencies */
  earlyWarning: EarlyWarning | null
}

export interface UseAudioAnalyzerReturn extends UseAudioAnalyzerState {
  start: () => Promise<void>
  stop: () => void
  updateSettings: (settings: Partial<DetectorSettings>) => void
  resetSettings: () => void
  settings: DetectorSettings
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
    noiseFloorDb: null,
    sampleRate: 48000,
    fftSize: settings.fftSize,
    spectrum: null,
    tracks: [],
    advisories: [],
    earlyWarning: null,
  })

  const analyzerRef = useRef<AudioAnalyzer | null>(null)
  const settingsRef = useRef(settings)
  
  // Keep settings ref in sync
  useEffect(() => {
    settingsRef.current = settings
  }, [settings])

  // ── DSP Worker callbacks — stable refs, never change identity ───────────────
  // These refs forward to the latest closure values without causing re-renders
  const onAdvisoryRef = useRef<(a: Advisory) => void>(() => {})
  const onTracksUpdateRef = useRef<(t: TrackedPeak[]) => void>(() => {})

  onAdvisoryRef.current = (advisory) => {
    setState(prev => {
      const next = [...prev.advisories]

      // Match by ID first (same track updating)
      const byId = next.findIndex(a => a.id === advisory.id)
      if (byId >= 0) {
        next[byId] = advisory
      } else {
        // Frequency-proximity dedup (200 cents = 2 semitones, matches worker)
        // Prevents duplicate cards when a peak is cleared then re-detected
        // with a new track/advisory ID at the same frequency.
        const byFreq = next.findIndex(a => {
          const cents = Math.abs(1200 * Math.log2(advisory.trueFrequencyHz / a.trueFrequencyHz))
          return cents <= 200
        })
        if (byFreq >= 0) {
          next[byFreq] = advisory // Replace the old card
        } else {
          next.push(advisory)
        }
      }

      return {
        ...prev,
        advisories: next
          .sort((a, b) => {
            const urgencyA = getSeverityUrgency(a.severity)
            const urgencyB = getSeverityUrgency(b.severity)
            if (urgencyA !== urgencyB) return urgencyB - urgencyA
            return b.trueAmplitudeDb - a.trueAmplitudeDb
          })
          .slice(0, settingsRef.current.maxDisplayedIssues),
      }
    })
  }

  onTracksUpdateRef.current = (tracks) => {
    setState(prev => ({ ...prev, tracks }))
  }

  // Stable callbacks object — created once, never triggers re-renders
  const stableCallbacks = useRef<DSPWorkerCallbacks>({
    onAdvisory: (advisory) => onAdvisoryRef.current(advisory),
    onAdvisoryCleared: () => { /* Keep cards visible until next start */ },
    onTracksUpdate: (tracks) => onTracksUpdateRef.current(tracks),
    onReady: () => { /* Worker ready */ },
  }).current

  // ── DSP Worker ──────────────────────────────────────────────────────────────
  const dspWorker = useDSPWorker(stableCallbacks)

  // ── Analyzer ────────────────────────────────────────────────────────────────
  // Initialize analyzer
  useEffect(() => {
    const analyzer = createAudioAnalyzer(settings, {
      onSpectrum: (data) => {
        setState(prev => ({ 
          ...prev, 
          spectrum: data,
          noiseFloorDb: data.noiseFloorDb,
        }))
      },
      // Route raw peaks to the DSP worker (includes time-domain for phase coherence)
      onPeakDetected: (peak, spectrum, sampleRate, fftSize, timeDomain) => {
        dspWorker.processPeak(peak, spectrum, sampleRate, fftSize, timeDomain)
      },
      onPeakCleared: (peak) => {
        dspWorker.clearPeak(peak.binIndex, peak.frequencyHz, peak.timestamp)
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

  const start = useCallback(async () => {
    if (!analyzerRef.current) return
    
    try {
      // Clear previous advisories + worker state when starting fresh analysis
      setState(prev => ({ ...prev, advisories: [], tracks: [], earlyWarning: null }))
      dspWorkerRef.current.reset()
      
      await analyzerRef.current.start()
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
    setState(prev => ({
      ...prev,
      isRunning: false,
      tracks: [],
    }))
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
    updateSettings,
    resetSettings,
  }
}


