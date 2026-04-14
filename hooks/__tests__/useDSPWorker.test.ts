// @vitest-environment jsdom

import { renderHook, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@sentry/nextjs', () => ({
  addBreadcrumb: vi.fn(),
  captureMessage: vi.fn(),
  setTag: vi.fn(),
  setContext: vi.fn(),
}))

import { useDSPWorker } from '../useDSPWorker'
import { DEFAULT_SETTINGS } from '@/lib/dsp/constants'
import type { DetectedPeak } from '@/types/advisory'
import type { WorkerOutboundMessage } from '@/lib/dsp/dspWorker'

class MockWorker {
  static instances: MockWorker[] = []

  onmessage: ((event: MessageEvent<WorkerOutboundMessage>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  readonly messages: unknown[] = []
  readonly postMessage = vi.fn((message: unknown) => {
    this.messages.push(message)
  })
  readonly terminate = vi.fn()

  constructor(
    readonly url: URL,
    readonly options?: WorkerOptions,
  ) {
    MockWorker.instances.push(this)
  }

  emitMessage(message: WorkerOutboundMessage) {
    this.onmessage?.({ data: message } as MessageEvent<WorkerOutboundMessage>)
  }

  emitError(message: string) {
    this.onerror?.({ message } as ErrorEvent)
  }
}

function makePeak(overrides: Partial<DetectedPeak> = {}): DetectedPeak {
  return {
    binIndex: 42,
    trueFrequencyHz: 1000,
    trueAmplitudeDb: -18,
    prominenceDb: 12,
    sustainedMs: 180,
    harmonicOfHz: null,
    timestamp: 1234567890,
    noiseFloorDb: -90,
    effectiveThresholdDb: -45,
    ...overrides,
  }
}

describe('useDSPWorker', () => {
  const OriginalWorker = globalThis.Worker

  beforeEach(() => {
    MockWorker.instances = []
    globalThis.Worker = MockWorker as unknown as typeof Worker
  })

  afterEach(() => {
    vi.useRealTimers()
    globalThis.Worker = OriginalWorker
  })

  it('queues collection requests until the worker is ready', () => {
    const onReady = vi.fn()
    const { result } = renderHook(() => useDSPWorker({ onReady }))

    const worker = MockWorker.instances[0]
    expect(worker).toBeDefined()

    act(() => {
      result.current.enableCollection('session-1', 8192, 48000)
    })
    expect(worker.messages).toEqual([])

    act(() => {
      result.current.init(DEFAULT_SETTINGS, 48000, 8192)
    })

    expect(worker.messages[0]).toMatchObject({
      type: 'init',
      sampleRate: 48000,
      fftSize: 8192,
    })

    act(() => {
      worker.emitMessage({ type: 'ready' })
    })

    expect(onReady).toHaveBeenCalledTimes(1)
    expect(result.current.isReady).toBe(true)
    expect(worker.messages[1]).toMatchObject({
      type: 'enableCollection',
      sessionId: 'session-1',
      fftSize: 8192,
      sampleRate: 48000,
    })
  })

  it('queues feedback history sync until the worker is ready', () => {
    const { result } = renderHook(() => useDSPWorker({}))
    const worker = MockWorker.instances[0]

    act(() => {
      result.current.syncFeedbackHistory([
        {
          centerFrequencyHz: 1000,
          occurrences: 3,
          learnedCutDb: -8,
          successfulCutCount: 2,
          lastSeen: 123,
        },
      ])
    })
    expect(worker.messages).toEqual([])

    act(() => {
      result.current.init(DEFAULT_SETTINGS, 48000, 8192)
      worker.emitMessage({ type: 'ready' })
    })

    expect(worker.messages[1]).toMatchObject({
      type: 'syncFeedbackHistory',
      hotspots: [
        expect.objectContaining({
          centerFrequencyHz: 1000,
          occurrences: 3,
          learnedCutDb: -8,
          successfulCutCount: 2,
        }),
      ],
    })
  })

  it('buffers the most recent peak during backpressure and flushes it on tracksUpdate', () => {
    const { result } = renderHook(() => useDSPWorker({}))
    const worker = MockWorker.instances[0]

    act(() => {
      result.current.init(DEFAULT_SETTINGS, 48000, 8192)
      worker.emitMessage({ type: 'ready' })
    })

    const spectrum = new Float32Array([1, 2, 3, 4])
    const timeDomain = new Float32Array([0.1, 0.2, 0.3, 0.4])

    act(() => {
      result.current.processPeak(makePeak({ binIndex: 1 }), spectrum, 48000, 8192, timeDomain)
      result.current.processPeak(makePeak({ binIndex: 2 }), spectrum, 48000, 8192, timeDomain)
      result.current.processPeak(makePeak({ binIndex: 3 }), spectrum, 48000, 8192, timeDomain)
    })

    const processPeakMessages = worker.messages.filter((message): message is { type: 'processPeak'; peak: DetectedPeak } =>
      typeof message === 'object' && message !== null && 'type' in message && message.type === 'processPeak'
    )

    expect(processPeakMessages).toHaveLength(1)
    expect(processPeakMessages[0].peak.binIndex).toBe(1)
    expect(result.current.getBackpressureStats()).toMatchObject({
      dropped: 2,
      total: 3,
    })

    act(() => {
      worker.emitMessage({ type: 'tracksUpdate', tracks: [] })
    })

    const flushedMessages = worker.messages.filter((message): message is { type: 'processPeak'; peak: DetectedPeak } =>
      typeof message === 'object' && message !== null && 'type' in message && message.type === 'processPeak'
    )

    expect(flushedMessages).toHaveLength(2)
    expect(flushedMessages[1].peak.binIndex).toBe(3)
  })

  it('restarts with the latest settings after a worker crash and cleans up the replacement worker', () => {
    vi.useFakeTimers()

    const onError = vi.fn()
    const { result, unmount } = renderHook(() => useDSPWorker({ onError }))
    const firstWorker = MockWorker.instances[0]

    act(() => {
      result.current.init(DEFAULT_SETTINGS, 48000, 8192)
      firstWorker.emitMessage({ type: 'ready' })
    })

    act(() => {
      result.current.updateSettings({
        mode: 'liveMusic',
        feedbackThresholdDb: 31,
      })
    })

    act(() => {
      firstWorker.emitError('worker exploded')
    })

    expect(onError).toHaveBeenCalledWith('worker exploded')
    expect(result.current.isCrashed).toBe(true)
    expect(firstWorker.terminate).toHaveBeenCalledTimes(1)

    act(() => {
      vi.advanceTimersByTime(500)
    })

    const restartedWorker = MockWorker.instances[1]
    expect(restartedWorker).toBeDefined()
    expect(restartedWorker.messages[0]).toMatchObject({
      type: 'init',
      sampleRate: 48000,
      fftSize: 8192,
      settings: expect.objectContaining({
        mode: 'liveMusic',
        feedbackThresholdDb: 31,
      }),
    })

    unmount()

    expect(restartedWorker.terminate).toHaveBeenCalledTimes(1)
  })
})
