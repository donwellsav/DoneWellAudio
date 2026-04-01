// @vitest-environment jsdom

import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PA2_RTA_FREQS } from '@/lib/pa2/pa2Utils'
import type { PA2Client } from '@/lib/pa2/pa2Client'
import type { PA2LoopResponse } from '@/types/pa2'
import type { Advisory } from '@/types/advisory'

const { createPA2ClientMock } = vi.hoisted(() => ({
  createPA2ClientMock: vi.fn(),
}))

vi.mock('@/lib/pa2/pa2Client', () => ({
  createPA2Client: createPA2ClientMock,
  PA2ClientError: class PA2ClientError extends Error {
    constructor(
      message: string,
      readonly statusCode: number,
      readonly responseBody: string,
    ) {
      super(message)
      this.name = 'PA2ClientError'
    }
  },
}))

import { usePA2Bridge } from '../usePA2Bridge'

function makeLoop(notchConfidenceThreshold = 0.5): PA2LoopResponse {
  const rta = Object.fromEntries(PA2_RTA_FREQS.map((frequency) => [String(frequency), -80])) as Record<string, number>
  return {
    connected: true,
    rta,
    geq: {
      enabled: true,
      mode: 'manual',
      bands: {},
      topology: 'stereo',
    },
    meters: {
      input: { l: -18, r: -18 },
      output: { hl: -12, hr: -12 },
      comp_gr: 0,
      lim_gr: 0,
    },
    afs: {
      enabled: true,
      mode: 'live',
    },
    mutes: {
      HighLeft: false,
      HighRight: false,
      MidLeft: false,
      MidRight: false,
      LowLeft: false,
      LowRight: false,
    },
    timestamp: 1234567890,
    notchConfidenceThreshold,
  }
}

function makeClient(loop: PA2LoopResponse): PA2Client {
  return {
    ping: vi.fn().mockResolvedValue({ ok: true, connected: true, host: 'localhost' }),
    getLoop: vi.fn().mockResolvedValue(loop),
    getRTA: vi.fn().mockResolvedValue({
      bands: loop.rta,
      peak: { freq: 1000, db: -12 },
      timestamp: loop.timestamp,
    }),
    getGEQ: vi.fn().mockResolvedValue(loop.geq),
    getMeters: vi.fn().mockResolvedValue({
      input: loop.meters.input,
      output: loop.meters.output,
      compressor: { input: 0, gr: loop.meters.comp_gr },
      limiter: { input: 0, gr: loop.meters.lim_gr },
      timestamp: loop.timestamp,
    }),
    getTopology: vi.fn().mockResolvedValue({
      modules: [],
      stereoGeq: true,
      leftGeq: false,
      rightGeq: false,
      hasHigh: true,
      hasMid: true,
      hasLow: true,
      hasAfs: true,
      hasCompressor: true,
      hasSubharmonic: false,
      hasCrossover: true,
    }),
    setGEQBands: vi.fn().mockResolvedValue({ ok: true }),
    setGEQArray: vi.fn().mockResolvedValue({ ok: true }),
    flattenGEQ: vi.fn().mockResolvedValue({ ok: true }),
    autoEQ: vi.fn().mockResolvedValue({
      ok: true,
      corrections: {},
      commands: 0,
      timestamp: loop.timestamp,
    }),
    applyCurve: vi.fn().mockResolvedValue({ ok: true }),
    sendAction: vi.fn().mockResolvedValue({ ok: true }),
    detect: vi.fn().mockResolvedValue({
      actions: [],
      slots_used: 0,
      slots_available: 8,
    }),
    getRecommendations: vi.fn().mockResolvedValue({
      pending: [],
      active_notches: [],
    }),
    approve: vi.fn().mockResolvedValue({ ok: true }),
    releaseNotch: vi.fn().mockResolvedValue({ ok: true }),
    clearNotches: vi.fn().mockResolvedValue({ ok: true }),
  }
}

function makeAdvisory(overrides: Partial<Advisory> = {}): Advisory {
  return {
    id: 'adv-1',
    trackId: 'track-1',
    timestamp: Date.now(),
    label: 'ACOUSTIC_FEEDBACK',
    severity: 'GROWING',
    confidence: 0.8,
    why: ['test'],
    trueFrequencyHz: 1000,
    trueAmplitudeDb: -20,
    prominenceDb: 12,
    qEstimate: 4,
    bandwidthHz: 250,
    velocityDbPerSec: 1,
    stabilityCentsStd: 0,
    harmonicityScore: 0,
    modulationScore: 0,
    advisory: {
      geq: { bandHz: 1000, bandIndex: 15, suggestedDb: -6 },
      peq: { type: 'bell', hz: 1000, q: 4, gainDb: -6 },
      shelves: [],
      pitch: { note: 'B', octave: 5, cents: 0, midi: 83 },
    },
    ...overrides,
  }
}

describe('usePA2Bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('updates effectiveConfidence when autoSendMinConfidence changes without recreating the client', async () => {
    const loop = makeLoop(0.5)
    const client = makeClient(loop)
    createPA2ClientMock.mockReturnValue(client)

    const { result, rerender } = renderHook(
      ({ autoSendMinConfidence }) => usePA2Bridge({
        baseUrl: 'http://localhost:8000/instance/pa2',
        enabled: true,
        autoSend: 'off',
        autoSendMinConfidence,
        pollIntervalMs: 20,
      }),
      {
        initialProps: { autoSendMinConfidence: 0.6 },
      },
    )

    await waitFor(() => {
      expect(result.current.status).toBe('connected')
    })
    expect(result.current.effectiveConfidence).toBe(0.6)

    rerender({ autoSendMinConfidence: 0.9 })

    await waitFor(() => {
      expect(result.current.effectiveConfidence).toBe(0.9)
    })
    expect(createPA2ClientMock).toHaveBeenCalledTimes(1)
  })

  it('uses the stronger companion confidence floor when sending GEQ corrections manually', async () => {
    const loop = { ...makeLoop(0.9), timestamp: Date.now() }
    const client = makeClient(loop)
    createPA2ClientMock.mockReturnValue(client)

    const advisories = [makeAdvisory()]
    const { result } = renderHook(() => usePA2Bridge({
      baseUrl: 'http://localhost:8000/instance/pa2',
      enabled: true,
      advisories,
      autoSend: 'off',
      autoSendMinConfidence: 0.6,
      pollIntervalMs: 20,
    }))

    await waitFor(() => {
      expect(result.current.status).toBe('connected')
    })

    await result.current.sendCorrections()

    expect(client.setGEQBands).toHaveBeenCalledTimes(1)
    const sentBands = vi.mocked(client.setGEQBands).mock.calls[0][0]
    expect(Object.values(sentBands)).toContain(-2)
    expect(Object.values(sentBands)).not.toContain(-6)
  })
})
