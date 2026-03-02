/**
 * useDSPWorker — manages the DSP Web Worker lifecycle
 *
 * Creates a worker via `new Worker(new URL(...))` which Webpack/Turbopack
 * bundles automatically. The worker runs TrackManager + classifier +
 * eqAdvisor off the main thread.
 *
 * The main thread still owns:
 *  - AudioContext + AnalyserNode (Web Audio API requirement)
 *  - getFloatFrequencyData() call (reads from AnalyserNode)
 *  - requestAnimationFrame loop
 *
 * The worker owns:
 *  - TrackManager state
 *  - Advisory map (dedup, harmonic suppression)
 *  - classifyTrack + generateEQAdvisory (CPU-heavy per-peak logic)
 */

'use client'

import { useRef, useEffect, useCallback } from 'react'
import type {
  Advisory,
  DetectorSettings,
  TrackedPeak,
  DetectedPeak,
} from '@/types/advisory'
import type { WorkerInboundMessage, WorkerOutboundMessage } from '@/lib/dsp/dspWorker'

export interface DSPWorkerCallbacks {
  onAdvisory?: (advisory: Advisory) => void
  onAdvisoryCleared?: (advisoryId: string) => void
  onAdvisoryReplaced?: (replacedId: string, advisory: Advisory) => void
  onTracksUpdate?: (tracks: TrackedPeak[]) => void
  onReady?: () => void
  onError?: (message: string) => void
}

export interface DSPWorkerHandle {
  /** True once the worker has posted its 'ready' message */
  isReady: boolean
  /** Send initial config to the worker */
  init: (settings: DetectorSettings, sampleRate: number, fftSize: number) => void
  /** Push updated settings to the worker */
  updateSettings: (settings: Partial<DetectorSettings>) => void
  /** Send a detected peak + current spectrum for classification */
  processPeak: (peak: DetectedPeak, spectrum: Float32Array, sampleRate: number, fftSize: number) => void
  /** Notify the worker a peak has been cleared */
  clearPeak: (binIndex: number, frequencyHz: number, timestamp: number) => void
  /** Clear all worker state (tracks, advisories) */
  reset: () => void
  /** Terminate the worker */
  terminate: () => void
}

/**
 * Creates and manages a DSP worker instance.
 *
 * @example
 * const worker = useDSPWorker({
 *   onAdvisory: (a) => setAdvisories(prev => [...prev, a]),
 *   onTracksUpdate: (t) => setTracks(t),
 * })
 */
export function useDSPWorker(callbacks: DSPWorkerCallbacks): DSPWorkerHandle {
  const workerRef = useRef<Worker | null>(null)
  const isReadyRef = useRef(false)
  const callbacksRef = useRef(callbacks)

  // Keep callbacks up to date without re-creating worker
  useEffect(() => {
    callbacksRef.current = callbacks
  }, [callbacks])

  // Instantiate worker once on mount
  useEffect(() => {
    // Next.js/Turbopack bundles the worker at the URL import site
    const worker = new Worker(
      new URL('../lib/dsp/dspWorker.ts', import.meta.url),
      { type: 'module' }
    )

    worker.onmessage = (event: MessageEvent<WorkerOutboundMessage>) => {
      const msg = event.data
      switch (msg.type) {
        case 'ready':
          isReadyRef.current = true
          callbacksRef.current.onReady?.()
          break
        case 'advisory':
          callbacksRef.current.onAdvisory?.(msg.advisory)
          break
        case 'advisoryReplaced':
          callbacksRef.current.onAdvisoryReplaced?.(msg.replacedId, msg.advisory)
          break
        case 'advisoryCleared':
          callbacksRef.current.onAdvisoryCleared?.(msg.advisoryId)
          break
        case 'tracksUpdate':
          callbacksRef.current.onTracksUpdate?.(msg.tracks)
          break
        case 'error':
          callbacksRef.current.onError?.(msg.message)
          break
      }
    }

    worker.onerror = (err) => {
      callbacksRef.current.onError?.(err.message ?? 'DSP worker error')
      worker.terminate()
      workerRef.current = null
      isReadyRef.current = false
    }

    workerRef.current = worker

    return () => {
      worker.terminate()
      workerRef.current = null
      isReadyRef.current = false
    }
  }, []) // Create once

  const postMessage = useCallback((msg: WorkerInboundMessage) => {
    workerRef.current?.postMessage(msg)
  }, [])

  const init = useCallback(
    (settings: DetectorSettings, sampleRate: number, fftSize: number) => {
      isReadyRef.current = false
      postMessage({ type: 'init', settings, sampleRate, fftSize })
    },
    [postMessage]
  )

  const updateSettings = useCallback(
    (settings: Partial<DetectorSettings>) => {
      postMessage({ type: 'updateSettings', settings })
    },
    [postMessage]
  )

  const processPeak = useCallback(
    (peak: DetectedPeak, spectrum: Float32Array, sampleRate: number, fftSize: number) => {
      // Transfer a zero-copy clone to the worker — avoids a 16KB heap allocation per peak
      const clone = spectrum.slice(0)
      workerRef.current?.postMessage(
        { type: 'processPeak', peak, spectrum: clone, sampleRate, fftSize },
        [clone.buffer]
      )
    },
    []
  )

  const clearPeak = useCallback(
    (binIndex: number, frequencyHz: number, timestamp: number) => {
      postMessage({ type: 'clearPeak', binIndex, frequencyHz, timestamp })
    },
    [postMessage]
  )

  const reset = useCallback(() => {
    postMessage({ type: 'reset' })
  }, [postMessage])

  const terminate = useCallback(() => {
    workerRef.current?.terminate()
    workerRef.current = null
    isReadyRef.current = false
  }, [])

  return {
    get isReady() { return isReadyRef.current },
    init,
    updateSettings,
    processPeak,
    clearPeak,
    reset,
    terminate,
  }
}
