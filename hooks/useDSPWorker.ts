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

import type { SnapshotBatch } from '@/types/data'

export interface DSPWorkerCallbacks {
  onAdvisory?: (advisory: Advisory) => void
  onAdvisoryCleared?: (advisoryId: string) => void
  onAdvisoryReplaced?: (replacedId: string, advisory: Advisory) => void
  onTracksUpdate?: (tracks: TrackedPeak[]) => void
  onReady?: () => void
  onError?: (message: string) => void
  /** Called when a snapshot batch is ready for upload (free tier only) */
  onSnapshotBatch?: (batch: SnapshotBatch) => void
}

export interface DSPWorkerHandle {
  /** True once the worker has posted its 'ready' message */
  isReady: boolean
  /** True if the worker crashed and needs re-initialization */
  isCrashed: boolean
  /** Get frame drop stats from backpressure */
  getBackpressureStats: () => { dropped: number; total: number; ratio: number }
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
  /** Enable anonymous spectral snapshot collection (free tier only) */
  enableCollection: (sessionId: string, fftSize: number, sampleRate: number) => void
  /** Disable spectral snapshot collection */
  disableCollection: () => void
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
  const droppedFramesRef = useRef(0) // Frames skipped due to backpressure
  const totalFramesRef = useRef(0)   // Total frames attempted
  const callbacksRef = useRef(callbacks)

  // Buffer pool: reusable Float32Arrays for zero-allocation worker transfer
  const specPoolRef = useRef<Float32Array[]>([])
  const tdPoolRef = useRef<Float32Array[]>([])
  const poolFftSizeRef = useRef(0)

  // Keep callbacks up to date without re-creating worker
  useEffect(() => {
    callbacksRef.current = callbacks
  }, [callbacks])

  // Attach message + error handlers to a worker instance
  const setupWorkerHandlers = useCallback((worker: Worker) => {
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
        case 'returnBuffers':
          busyRef.current = false  // Also clears backpressure (fixes stall on early-break paths)
          if (msg.spectrum.buffer.byteLength > 0) specPoolRef.current.push(msg.spectrum)
          if (msg.timeDomain && msg.timeDomain.buffer.byteLength > 0) tdPoolRef.current.push(msg.timeDomain)
          break
        case 'snapshotBatch':
          if (msg.batch) callbacksRef.current.onSnapshotBatch?.(msg.batch)
          break
        case 'collectionStats':
          // Stats available but no callback needed yet — could be used by a future UI
          break
        case 'error':
          busyRef.current = false  // Unblock pipeline so analysis continues after soft error
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
  }, [])

  // Instantiate worker once on mount
  useEffect(() => {
    // Next.js/Turbopack bundles the worker at the URL import site
    const worker = new Worker(
      new URL('../lib/dsp/dspWorker.ts', import.meta.url),
      { type: 'module' }
    )
    setupWorkerHandlers(worker)
    workerRef.current = worker

    return () => {
      worker.terminate()
      workerRef.current = null
      isReadyRef.current = false
    }
  }, [setupWorkerHandlers])

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
      // Re-create worker if it died (onerror terminates + nulls workerRef)
      if (!workerRef.current) {
        const w = new Worker(
          new URL('../lib/dsp/dspWorker.ts', import.meta.url),
          { type: 'module' }
        )
        setupWorkerHandlers(w)
        workerRef.current = w
      }
      crashedRef.current = false
      postMessage({ type: 'init', settings, sampleRate, fftSize })
    },
    [postMessage, setupWorkerHandlers]
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
      totalFramesRef.current++
      if (busyRef.current || crashedRef.current || !isReadyRef.current) {
        droppedFramesRef.current++
        return
      }

      // Flush pool when FFT size changes (buffers are wrong length), then pre-allocate
      if (poolFftSizeRef.current !== fftSize) {
        const binCount = spectrum.length
        specPoolRef.current = Array.from({ length: 3 }, () => new Float32Array(binCount))
        tdPoolRef.current = timeDomain
          ? Array.from({ length: 3 }, () => new Float32Array(timeDomain.length))
          : []
        poolFftSizeRef.current = fftSize
      }

      // Reuse pooled buffer or allocate (only on first call / pool miss)
      let specBuf = specPoolRef.current.pop()
      if (!specBuf || specBuf.length !== spectrum.length) {
        specBuf = new Float32Array(spectrum.length)
      }
      specBuf.set(spectrum)
      const transferList: ArrayBuffer[] = [specBuf.buffer as ArrayBuffer]

      let tdBuf: Float32Array | undefined
      if (timeDomain) {
        tdBuf = tdPoolRef.current.pop()
        if (!tdBuf || tdBuf.length !== timeDomain.length) {
          tdBuf = new Float32Array(timeDomain.length)
        }
        tdBuf.set(timeDomain)
        transferList.push(tdBuf.buffer as ArrayBuffer)
      }

      busyRef.current = true
      workerRef.current?.postMessage(
        { type: 'processPeak', peak, spectrum: specBuf, sampleRate, fftSize, timeDomain: tdBuf } as WorkerInboundMessage,
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
    droppedFramesRef.current = 0
    totalFramesRef.current = 0
    postMessage({ type: 'reset' })
  }, [postMessage])

  const enableCollection = useCallback(
    (sessionId: string, collectionFftSize: number, collectionSampleRate: number) => {
      postMessage({ type: 'enableCollection', sessionId, fftSize: collectionFftSize, sampleRate: collectionSampleRate })
    },
    [postMessage]
  )

  const disableCollection = useCallback(() => {
    postMessage({ type: 'disableCollection' })
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
    getBackpressureStats: () => ({
      dropped: droppedFramesRef.current,
      total: totalFramesRef.current,
      ratio: totalFramesRef.current > 0 ? droppedFramesRef.current / totalFramesRef.current : 0,
    }),
    init,
    updateSettings,
    processPeak,
    clearPeak,
    reset,
    terminate,
    enableCollection,
    disableCollection,
  }
}
