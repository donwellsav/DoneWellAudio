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

import { useRef, useEffect, useCallback, useMemo } from 'react'
import * as Sentry from '@sentry/nextjs'
import type {
  Advisory,
  AlgorithmMode,
  ContentType,
  DetectorSettings,
  TrackedPeak,
  DetectedPeak,
} from '@/types/advisory'
import type { WorkerInboundMessage, WorkerOutboundMessage } from '@/lib/dsp/dspWorker'

import type { SnapshotBatch } from '@/types/data'
import type { RoomDimensionEstimate } from '@/types/calibration'

export interface DSPWorkerCallbacks {
  onAdvisory?: (advisory: Advisory) => void
  onAdvisoryCleared?: (advisoryId: string) => void
  onTracksUpdate?: (tracks: TrackedPeak[], status?: { contentType?: ContentType; algorithmMode?: AlgorithmMode; isCompressed?: boolean; compressionRatio?: number }) => void
  /** Called when the worker updates the authoritative content-type classification */
  onContentTypeUpdate?: (contentType: ContentType, isCompressed: boolean, compressionRatio: number) => void
  onReady?: () => void
  onError?: (message: string) => void
  /** Called when a snapshot batch is ready for upload (free tier only) */
  onSnapshotBatch?: (batch: SnapshotBatch) => void
  /** Called when the worker produces a room dimension estimate */
  onRoomEstimate?: (estimate: RoomDimensionEstimate) => void
  /** Called with room measurement progress updates */
  onRoomMeasurementProgress?: (elapsedMs: number, stablePeaks: number) => void
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
  /** Send periodic spectrum snapshot for content-type detection (bypasses backpressure) */
  sendSpectrumUpdate: (spectrum: Float32Array, crestFactor: number, sampleRate: number, fftSize: number) => void
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
  /** Send user feedback (false positive / correct / confirmed) to the worker for snapshot enrichment */
  sendUserFeedback: (frequencyHz: number, feedback: 'correct' | 'false_positive' | 'confirmed_feedback') => void
  /** Start room dimension measurement — accumulates stable low-frequency peaks */
  startRoomMeasurement: () => void
  /** Stop room dimension measurement — sends final estimate */
  stopRoomMeasurement: () => void
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
  /** One-frame buffer: holds the most recent peak when worker is busy, processed when worker frees up */
  const pendingPeakRef = useRef<{ peak: DetectedPeak; spectrum: Float32Array; sampleRate: number; fftSize: number; timeDomain?: Float32Array } | null>(null)
  const crashedRef = useRef(false)  // Set on unrecoverable worker error
  const droppedFramesRef = useRef(0) // Frames skipped due to backpressure
  const totalFramesRef = useRef(0)   // Total frames attempted
  const callbacksRef = useRef(callbacks)
  const restartCountRef = useRef(0)         // Auto-restart attempts (max 3)
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastInitRef = useRef<{ settings: DetectorSettings; sampleRate: number; fftSize: number } | null>(null)

  // Pending collection enable — queued if called before worker is ready
  const pendingCollectionRef = useRef<{ sessionId: string; fftSize: number; sampleRate: number } | null>(null)

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
          crashedRef.current = false
          restartCountRef.current = 0  // Healthy worker — reset restart budget
          Sentry.addBreadcrumb({ category: 'dsp', message: 'Worker ready', level: 'info' })
          // Replay any enableCollection that arrived before the worker was ready
          if (pendingCollectionRef.current) {
            const { sessionId, fftSize, sampleRate } = pendingCollectionRef.current
            pendingCollectionRef.current = null
            worker.postMessage({ type: 'enableCollection', sessionId, fftSize, sampleRate })
          }
          callbacksRef.current.onReady?.()
          break
        case 'advisory':
          callbacksRef.current.onAdvisory?.(msg.advisory)
          break
        case 'advisoryCleared':
          callbacksRef.current.onAdvisoryCleared?.(msg.advisoryId)
          break
        case 'tracksUpdate':
          busyRef.current = false  // Clear backpressure — worker finished processing
          callbacksRef.current.onTracksUpdate?.(msg.tracks, {
            contentType: msg.contentType,
            algorithmMode: msg.algorithmMode,
            isCompressed: msg.isCompressed,
            compressionRatio: msg.compressionRatio,
          })
          // Process buffered peak if one was saved during backpressure
          if (pendingPeakRef.current && !busyRef.current && workerRef.current) {
            const buffered = pendingPeakRef.current
            pendingPeakRef.current = null
            const transferList: ArrayBuffer[] = [buffered.spectrum.buffer as ArrayBuffer]
            if (buffered.timeDomain) transferList.push(buffered.timeDomain.buffer as ArrayBuffer)
            busyRef.current = true
            workerRef.current.postMessage(
              { type: 'processPeak', peak: buffered.peak, spectrum: buffered.spectrum, sampleRate: buffered.sampleRate, fftSize: buffered.fftSize, timeDomain: buffered.timeDomain } as WorkerInboundMessage,
              transferList
            )
          }
          break
        case 'contentTypeUpdate':
          callbacksRef.current.onContentTypeUpdate?.(msg.contentType, msg.isCompressed, msg.compressionRatio)
          break
        case 'returnBuffers':
          busyRef.current = false  // Also clears backpressure (fixes stall on early-break paths)
          // Fix 3 + 14 (AI Fight Club): Route buffers to the correct pool based on source,
          // and guard against wrong-size buffers from in-flight FFT size changes.
          if (msg.spectrum.buffer.byteLength > 0 && msg.spectrum.length === poolFftSizeRef.current) {
            if (msg.source === 'spectrumUpdate') {
              specUpdatePoolRef.current.push(msg.spectrum)
            } else {
              specPoolRef.current.push(msg.spectrum)
            }
          }
          if (msg.timeDomain && msg.timeDomain.buffer.byteLength > 0) tdPoolRef.current.push(msg.timeDomain)
          break
        case 'snapshotBatch':
          if (msg.batch) callbacksRef.current.onSnapshotBatch?.(msg.batch)
          break
        case 'collectionStats':
          // Stats available but no callback needed yet — could be used by a future UI
          break
        case 'roomEstimate':
          callbacksRef.current.onRoomEstimate?.(msg.estimate)
          break
        case 'roomMeasurementProgress':
          callbacksRef.current.onRoomMeasurementProgress?.(msg.elapsedMs, msg.stablePeaks)
          break
        case 'error':
          busyRef.current = false  // Unblock pipeline so analysis continues after soft error
          Sentry.captureMessage(`DSP worker soft error: ${msg.message}`, 'warning')
          callbacksRef.current.onError?.(msg.message)
          break
        default:
          if (process.env.NODE_ENV === 'development') {
            console.warn('[useDSPWorker] unhandled message type:', (msg as { type: string }).type)
          }
      }
    }

    worker.onerror = (err) => {
      const MAX_RESTARTS = 3
      const RESTART_DELAY_MS = 500

      crashedRef.current = true
      isReadyRef.current = false
      busyRef.current = false
      Sentry.addBreadcrumb({ category: 'dsp', message: `Worker crashed: ${err.message ?? 'unknown'}`, level: 'error' })

      const attempt = restartCountRef.current + 1
      const canRestart = attempt <= MAX_RESTARTS && lastInitRef.current !== null

      Sentry.captureMessage(
        `DSP worker crashed (attempt ${attempt}/${MAX_RESTARTS}): ${err.message ?? 'unknown'}` +
        (canRestart ? ' — auto-restarting' : ' — giving up'),
        canRestart ? 'warning' : 'error'
      )
      callbacksRef.current.onError?.(err.message ?? 'DSP worker crashed')

      // Terminate the dead worker
      worker.terminate()
      workerRef.current = null

      if (!canRestart) return

      // Debounced restart: 500ms delay to avoid rapid crash loops
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current)
      restartTimerRef.current = setTimeout(() => {
        restartTimerRef.current = null
        restartCountRef.current = attempt

        const newWorker = new Worker(
          new URL('../lib/dsp/dspWorker.ts', import.meta.url),
          { type: 'module' }
        )
        setupWorkerHandlers(newWorker)
        workerRef.current = newWorker
        crashedRef.current = false

        // Re-send init with last-known settings
        const { settings, sampleRate, fftSize } = lastInitRef.current!
        newWorker.postMessage({ type: 'init', settings, sampleRate, fftSize })
      }, RESTART_DELAY_MS)
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
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current)
      // Fix 2 (AI Fight Club): Terminate the CURRENT worker, not the closed-over original.
      // After crash-restart, workerRef.current is the replacement; the original is already dead.
      const current = workerRef.current
      if (current && current !== worker) {
        // Replacement worker exists — terminate both
        worker.terminate()
        current.terminate()
      } else {
        worker.terminate()
      }
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
      lastInitRef.current = { settings, sampleRate, fftSize }
      isReadyRef.current = false
      busyRef.current = false
      Sentry.addBreadcrumb({ category: 'dsp', message: `Worker init: mode=${settings.mode} fft=${fftSize} sr=${sampleRate}`, level: 'info' })
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
      // Fix 1 (AI Fight Club): Keep restart snapshot in sync with live settings.
      // Without this, a crash-restart replays stale settings from lastInitRef.
      if (lastInitRef.current) {
        lastInitRef.current = {
          ...lastInitRef.current,
          settings: { ...lastInitRef.current.settings, ...settings },
        }
      }
      postMessage({ type: 'updateSettings', settings })
    },
    [postMessage]
  )

  const processPeak = useCallback(
    (peak: DetectedPeak, spectrum: Float32Array, sampleRate: number, fftSize: number, timeDomain?: Float32Array) => {
      // Backpressure: if worker is busy, buffer ONE frame (most recent wins).
      // When worker finishes, the buffered frame will be processed via onmessage.
      totalFramesRef.current++
      if (busyRef.current || crashedRef.current || !isReadyRef.current) {
        if (!crashedRef.current && isReadyRef.current) {
          // Buffer this peak — overwrites previous buffered if any
          pendingPeakRef.current = { peak, spectrum: new Float32Array(spectrum), sampleRate, fftSize, timeDomain: timeDomain ? new Float32Array(timeDomain) : undefined }
        }
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

  // Separate pool for spectrumUpdate buffers (not subject to peak backpressure)
  const specUpdatePoolRef = useRef<Float32Array[]>([])

  const sendSpectrumUpdate = useCallback(
    (spectrum: Float32Array, crestFactor: number, sr: number, fft: number) => {
      if (crashedRef.current || !isReadyRef.current) return
      let buf = specUpdatePoolRef.current.pop()
      if (!buf || buf.length !== spectrum.length) {
        buf = new Float32Array(spectrum.length)
      }
      buf.set(spectrum)
      workerRef.current?.postMessage(
        { type: 'spectrumUpdate', spectrum: buf, crestFactor, sampleRate: sr, fftSize: fft } as WorkerInboundMessage,
        [buf.buffer as ArrayBuffer]
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
      if (!isReadyRef.current) {
        // Worker not ready yet — queue for replay on 'ready'
        pendingCollectionRef.current = { sessionId, fftSize: collectionFftSize, sampleRate: collectionSampleRate }
        return
      }
      postMessage({ type: 'enableCollection', sessionId, fftSize: collectionFftSize, sampleRate: collectionSampleRate })
    },
    [postMessage]
  )

  const disableCollection = useCallback(() => {
    postMessage({ type: 'disableCollection' })
  }, [postMessage])

  const sendUserFeedback = useCallback(
    (frequencyHz: number, feedback: 'correct' | 'false_positive' | 'confirmed_feedback') => {
      postMessage({ type: 'userFeedback', frequencyHz, feedback })
    },
    [postMessage]
  )

  const startRoomMeasurement = useCallback(() => {
    postMessage({ type: 'startRoomMeasurement' })
  }, [postMessage])

  const stopRoomMeasurement = useCallback(() => {
    postMessage({ type: 'stopRoomMeasurement' })
  }, [postMessage])

  const terminate = useCallback(() => {
    workerRef.current?.terminate()
    workerRef.current = null
    isReadyRef.current = false
    busyRef.current = false
  }, [])

  // Stable handle — all methods are useCallback, getters read from refs.
  // Without useMemo, EngineContext consumers re-render every frame.
  return useMemo(() => ({
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
    sendSpectrumUpdate,
    clearPeak,
    reset,
    terminate,
    enableCollection,
    disableCollection,
    sendUserFeedback,
    startRoomMeasurement,
    stopRoomMeasurement,
  }), [init, updateSettings, processPeak, sendSpectrumUpdate, clearPeak, reset, terminate, enableCollection, disableCollection, sendUserFeedback, startRoomMeasurement, stopRoomMeasurement])
}
