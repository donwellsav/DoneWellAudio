'use client'

import type { MutableRefObject } from 'react'
import * as Sentry from '@sentry/nextjs'
import type { DetectedPeak } from '@/types/advisory'
import type { WorkerInboundMessage, WorkerOutboundMessage } from '@/lib/dsp/dspWorker'
import type {
  DSPWorkerCallbacks,
  PendingCollectionRequest,
  PendingPeakFrame,
  WorkerInitSnapshot,
} from './dspWorkerTypes'

const MAX_RESTARTS = 3
const RESTART_DELAY_MS = 500

interface PeakPoolRefs {
  specPoolRef: MutableRefObject<Float32Array[]>
  tdPoolRef: MutableRefObject<Float32Array[]>
  poolFftSizeRef: MutableRefObject<number>
}

export interface DSPWorkerHandlerRefs extends PeakPoolRefs {
  workerRef: MutableRefObject<Worker | null>
  callbacksRef: MutableRefObject<DSPWorkerCallbacks>
  isReadyRef: MutableRefObject<boolean>
  busyRef: MutableRefObject<boolean>
  pendingPeakRef: MutableRefObject<PendingPeakFrame | null>
  crashedRef: MutableRefObject<boolean>
  permanentlyDeadRef: MutableRefObject<boolean>
  restartCountRef: MutableRefObject<number>
  restartTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>
  lastInitRef: MutableRefObject<WorkerInitSnapshot | null>
  pendingCollectionRef: MutableRefObject<PendingCollectionRequest | null>
  specUpdatePoolRef: MutableRefObject<Float32Array[]>
}

export function createDSPWorker(): Worker {
  return new Worker(new URL('../lib/dsp/dspWorker.ts', import.meta.url), {
    type: 'module',
  })
}

export function clonePendingPeak(
  peak: DetectedPeak,
  spectrum: Float32Array,
  sampleRate: number,
  fftSize: number,
  timeDomain?: Float32Array,
): PendingPeakFrame {
  return {
    peak,
    spectrum: new Float32Array(spectrum),
    sampleRate,
    fftSize,
    timeDomain: timeDomain ? new Float32Array(timeDomain) : undefined,
  }
}

export function preparePeakTransfer(
  peak: DetectedPeak,
  spectrum: Float32Array,
  sampleRate: number,
  fftSize: number,
  pools: PeakPoolRefs,
  timeDomain?: Float32Array,
): {
  message: Extract<WorkerInboundMessage, { type: 'processPeak' }>
  transferList: ArrayBuffer[]
} {
  if (pools.poolFftSizeRef.current !== fftSize) {
    pools.specPoolRef.current = Array.from(
      { length: 3 },
      () => new Float32Array(spectrum.length),
    )
    pools.tdPoolRef.current = timeDomain
      ? Array.from({ length: 3 }, () => new Float32Array(timeDomain.length))
      : []
    pools.poolFftSizeRef.current = fftSize
  }

  let spectrumBuffer = pools.specPoolRef.current.pop()
  if (!spectrumBuffer || spectrumBuffer.length !== spectrum.length) {
    spectrumBuffer = new Float32Array(spectrum.length)
  }
  spectrumBuffer.set(spectrum)

  const transferList: ArrayBuffer[] = [spectrumBuffer.buffer as ArrayBuffer]

  let timeDomainBuffer: Float32Array | undefined
  if (timeDomain) {
    timeDomainBuffer = pools.tdPoolRef.current.pop()
    if (!timeDomainBuffer || timeDomainBuffer.length !== timeDomain.length) {
      timeDomainBuffer = new Float32Array(timeDomain.length)
    }
    timeDomainBuffer.set(timeDomain)
    transferList.push(timeDomainBuffer.buffer as ArrayBuffer)
  }

  return {
    message: {
      type: 'processPeak',
      peak,
      spectrum: spectrumBuffer,
      sampleRate,
      fftSize,
      timeDomain: timeDomainBuffer,
    },
    transferList,
  }
}

export function prepareSpectrumUpdateTransfer(
  spectrum: Float32Array,
  crestFactor: number,
  sampleRate: number,
  fftSize: number,
  specUpdatePoolRef: MutableRefObject<Float32Array[]>,
): {
  message: Extract<WorkerInboundMessage, { type: 'spectrumUpdate' }>
  transferList: ArrayBuffer[]
} {
  let spectrumBuffer = specUpdatePoolRef.current.pop()
  if (!spectrumBuffer || spectrumBuffer.length !== spectrum.length) {
    spectrumBuffer = new Float32Array(spectrum.length)
  }
  spectrumBuffer.set(spectrum)

  return {
    message: {
      type: 'spectrumUpdate',
      spectrum: spectrumBuffer,
      crestFactor,
      sampleRate,
      fftSize,
    },
    transferList: [spectrumBuffer.buffer as ArrayBuffer],
  }
}

function flushBufferedPeak(refs: DSPWorkerHandlerRefs) {
  if (refs.busyRef.current || !refs.pendingPeakRef.current || !refs.workerRef.current) {
    return
  }

  const buffered = refs.pendingPeakRef.current
  refs.pendingPeakRef.current = null
  refs.busyRef.current = true

  const transferList: ArrayBuffer[] = [buffered.spectrum.buffer as ArrayBuffer]
  if (buffered.timeDomain) {
    transferList.push(buffered.timeDomain.buffer as ArrayBuffer)
  }

  refs.workerRef.current.postMessage(
    {
      type: 'processPeak',
      peak: buffered.peak,
      spectrum: buffered.spectrum,
      sampleRate: buffered.sampleRate,
      fftSize: buffered.fftSize,
      timeDomain: buffered.timeDomain,
    } satisfies WorkerInboundMessage,
    transferList,
  )
}

function recycleReturnedBuffers(
  refs: DSPWorkerHandlerRefs,
  message: Extract<WorkerOutboundMessage, { type: 'returnBuffers' }>,
) {
  refs.busyRef.current = false

  if (
    message.spectrum.buffer.byteLength > 0 &&
    message.spectrum.length === refs.poolFftSizeRef.current
  ) {
    if (message.source === 'spectrumUpdate') {
      refs.specUpdatePoolRef.current.push(message.spectrum)
    } else {
      refs.specPoolRef.current.push(message.spectrum)
    }
  }

  if (message.timeDomain && message.timeDomain.buffer.byteLength > 0) {
    refs.tdPoolRef.current.push(message.timeDomain)
  }
}

function replayPendingCollection(worker: Worker, refs: DSPWorkerHandlerRefs) {
  if (!refs.pendingCollectionRef.current) {
    return
  }

  const { sessionId, fftSize, sampleRate } = refs.pendingCollectionRef.current
  refs.pendingCollectionRef.current = null
  worker.postMessage({ type: 'enableCollection', sessionId, fftSize, sampleRate })
}

export function createDSPWorkerMessageHandler(
  worker: Worker,
  refs: DSPWorkerHandlerRefs,
): (event: MessageEvent<WorkerOutboundMessage>) => void {
  return (event) => {
    const message = event.data

    switch (message.type) {
      case 'ready':
        refs.isReadyRef.current = true
        refs.crashedRef.current = false
        refs.permanentlyDeadRef.current = false
        refs.restartCountRef.current = 0
        Sentry.addBreadcrumb({
          category: 'dsp',
          message: 'Worker ready',
          level: 'info',
        })
        replayPendingCollection(worker, refs)
        refs.callbacksRef.current.onReady?.()
        break
      case 'advisory':
        refs.callbacksRef.current.onAdvisory?.(message.advisory)
        break
      case 'advisoryCleared':
        refs.callbacksRef.current.onAdvisoryCleared?.(message.advisoryId)
        break
      case 'tracksUpdate':
        refs.busyRef.current = false
        refs.callbacksRef.current.onTracksUpdate?.(message.tracks, {
          contentType: message.contentType,
          algorithmMode: message.algorithmMode,
          isCompressed: message.isCompressed,
          compressionRatio: message.compressionRatio,
        })
        flushBufferedPeak(refs)
        break
      case 'contentTypeUpdate':
        refs.callbacksRef.current.onContentTypeUpdate?.(
          message.contentType,
          message.isCompressed,
          message.compressionRatio,
        )
        break
      case 'combPatternUpdate':
        refs.callbacksRef.current.onEarlyWarningUpdate?.(message.pattern)
        break
      case 'returnBuffers':
        recycleReturnedBuffers(refs, message)
        break
      case 'snapshotBatch':
        if (message.batch) {
          refs.callbacksRef.current.onSnapshotBatch?.(message.batch)
        }
        break
      case 'collectionStats':
        break
      case 'roomEstimate':
        refs.callbacksRef.current.onRoomEstimate?.(message.estimate)
        break
      case 'roomMeasurementProgress':
        refs.callbacksRef.current.onRoomMeasurementProgress?.(
          message.elapsedMs,
          message.stablePeaks,
        )
        break
      case 'error':
        refs.busyRef.current = false
        Sentry.captureMessage(`DSP worker soft error: ${message.message}`, 'warning')
        refs.callbacksRef.current.onError?.(message.message)
        break
      default:
        if (process.env.NODE_ENV === 'development') {
          console.warn(
            '[useDSPWorker] unhandled message type:',
            (message as { type: string }).type,
          )
        }
    }
  }
}

export function createDSPWorkerErrorHandler(
  worker: Worker,
  refs: DSPWorkerHandlerRefs,
  respawnWorker: () => Worker,
): (event: ErrorEvent) => void {
  return (event) => {
    refs.crashedRef.current = true
    refs.isReadyRef.current = false
    refs.busyRef.current = false

    Sentry.addBreadcrumb({
      category: 'dsp',
      message: `Worker crashed: ${event.message ?? 'unknown'}`,
      level: 'error',
    })

    const attempt = refs.restartCountRef.current + 1
    const canRestart = attempt <= MAX_RESTARTS && refs.lastInitRef.current !== null

    Sentry.captureMessage(
      `DSP worker crashed (attempt ${attempt}/${MAX_RESTARTS}): ${event.message ?? 'unknown'}${
        canRestart ? ' - auto-restarting' : ' - giving up'
      }`,
      canRestart ? 'warning' : 'error',
    )

    refs.callbacksRef.current.onError?.(
      canRestart
        ? (event.message ?? 'DSP worker crashed')
        : 'Analysis engine stopped after repeated failures - tap Restart to try again',
    )

    worker.terminate()
    refs.workerRef.current = null

    if (!canRestart) {
      refs.permanentlyDeadRef.current = true
      return
    }

    if (refs.restartTimerRef.current) {
      clearTimeout(refs.restartTimerRef.current)
    }

    // Exponential backoff: 500ms → 1s → 2s (prevents rapid crash loop)
    const backoffMs = RESTART_DELAY_MS * (1 << (attempt - 1))
    refs.restartTimerRef.current = setTimeout(() => {
      refs.restartTimerRef.current = null
      refs.restartCountRef.current = attempt

      const nextWorker = respawnWorker()
      const lastInit = refs.lastInitRef.current
      if (!lastInit) {
        return
      }

      nextWorker.postMessage({
        type: 'init',
        settings: lastInit.settings,
        sampleRate: lastInit.sampleRate,
        fftSize: lastInit.fftSize,
      })
    }, backoffMs)
  }
}
