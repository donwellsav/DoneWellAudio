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
  /** True if the worker crashed and needs re-initialization */
  isCrashed: boolean
  /** Send initial config to the worker */
  init: (settings: DetectorSettings, sampleRate: number, fftSize: number) => void
  /** Push updated settings to the worker */
  updateSettings: (settings: Partial<DetectorSettings>) => void
  /** Send a detected peak + current spectrum + time-domain waveform for classification */
  processPeak: (peak: DetectedPeak, spectrum: Float32Array, sampleRate: number, fftSize: number, timeDomain?: Float32Array) => void
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
  const busyRef = useRef(false)     // Backpressure: true while worker processes a peak batch
  const crashedRef = useRef(false)  // Set on unrecoverable worker error
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
          busyRef.current = false  // Clear backpressure — worker finished processing
          callbacksRef.current.onTracksUpdate?.(msg.tracks)
          break
        case 'error':
          busyRef.current = false  // Clear backpressure — worker recovered from error
          callbacksRef.current.onError?.(msg.message)
          break
      }
    }

    worker.onerror = (err) => {
      crashedRef.current = true
      isReadyRef.current = false
      busyRef.current = false
      callbacksRef.current.onError?.(err.message ?? 'DSP worker crashed')
      worker.terminate()
      workerRef.current = null
    }

    workerRef.current = worker

    return () => {
      worker.terminate()
      workerRef.current = null
      isReadyRef.current = false
    }
  }, []) // Create once

  const postMessage = useCallback((msg: WorkerInboundMessage) => {
    if (crashedRef.current) return  // Worker is dead — drop messages
    // Allow init/reset through before worker is ready; gate everything else
    if (!isReadyRef.current && msg.type !== 'init' && msg.type !== 'reset') return
    workerRef.current?.postMessage(msg)
  }, [])

  const init = useCallback(
    (settings: DetectorSettings, sampleRate: number, fftSize: number) => {
      isReadyRef.current = false
      busyRef.current = false
      crashedRef.current = false
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
    (peak: DetectedPeak, spectrum: Float32Array, sampleRate: number, fftSize: number, timeDomain?: Float32Array) => {
      // Backpressure: skip if worker hasn't finished the previous batch
      if (busyRef.current || crashedRef.current || !isReadyRef.current) return

      // Transfer arrays directly to worker (zero-copy). The source Float32Arrays
      // become detached after postMessage, but they're re-created from
      // getFloatFrequencyData() / getFloatTimeDomainData() next frame anyway.
      const transferList: ArrayBuffer[] = [spectrum.buffer as ArrayBuffer]
      if (timeDomain) {
        transferList.push(timeDomain.buffer as ArrayBuffer)
      }

      busyRef.current = true
      workerRef.current?.postMessage(
        { type: 'processPeak', peak, spectrum, sampleRate, fftSize, timeDomain } as WorkerInboundMessage,
        transferList
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
    busyRef.current = false
    postMessage({ type: 'reset' })
  }, [postMessage])

  const terminate = useCallback(() => {
    workerRef.current?.terminate()
    workerRef.current = null
    isReadyRef.current = false
    busyRef.current = false
  }, [])

  return {
    get isReady() { return isReadyRef.current },
    get isCrashed() { return crashedRef.current },
    init,
    updateSettings,
    processPeak,
    clearPeak,
    reset,
    terminate,
  }
}
