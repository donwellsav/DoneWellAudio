// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Advisory } from '@/types/advisory'

async function loadUseCompanion() {
  vi.resetModules()
  return import('../useCompanion')
}

function makeAdvisory(overrides: Partial<Advisory> = {}): Advisory {
  return {
    id: 'adv-1',
    trackId: 'track-1',
    timestamp: Date.now(),
    label: 'ACOUSTIC_FEEDBACK',
    severity: 'GROWING',
    confidence: 0.9,
    why: ['test'],
    trueFrequencyHz: 1000,
    trueAmplitudeDb: -20,
    prominenceDb: 10,
    qEstimate: 4,
    bandwidthHz: 250,
    velocityDbPerSec: 1,
    stabilityCentsStd: 0,
    harmonicityScore: 0,
    modulationScore: 0,
    advisory: {
      geq: { bandIndex: 15, bandHz: 1000, suggestedDb: -6 },
      peq: { type: 'bell', hz: 1000, q: 4, gainDb: -6 },
      shelves: [],
      pitch: { note: 'B', octave: 5, cents: 0, midi: 83 },
    },
    ...overrides,
  }
}

describe('useCompanion', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('shares settings updates across multiple hook consumers', async () => {
    const { useCompanion } = await loadUseCompanion()
    const first = renderHook(() => useCompanion())
    const second = renderHook(() => useCompanion())

    expect(first.result.current.settings.pairingCode).toMatch(/^DWA-/)
    expect(second.result.current.settings.pairingCode).toBe(first.result.current.settings.pairingCode)

    act(() => {
      first.result.current.updateSettings({
        autoSend: true,
        minConfidence: 0.85,
        ringOutAutoSend: true,
      })
    })

    expect(second.result.current.settings).toMatchObject({
      enabled: false,
      autoSend: true,
      minConfidence: 0.85,
      ringOutAutoSend: true,
    })
    expect(JSON.parse(localStorage.getItem('dwa-companion') ?? '{}')).toMatchObject({
      enabled: false,
      autoSend: true,
      minConfidence: 0.85,
      ringOutAutoSend: true,
    })
  })

  it('dedupes relay checks and synchronizes connection state across hook consumers', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, pendingCount: 0 }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { useCompanion } = await loadUseCompanion()
    const first = renderHook(() => useCompanion())
    const second = renderHook(() => useCompanion())

    act(() => {
      first.result.current.updateSettings({ enabled: true })
    })

    await waitFor(() => {
      expect(first.result.current.connected).toBe(true)
    })

    expect(second.result.current.connected).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const oldCode = first.result.current.settings.pairingCode
    act(() => {
      second.result.current.regenerateCode()
    })

    expect(first.result.current.settings.pairingCode).not.toBe(oldCode)
    expect(second.result.current.settings.pairingCode).toBe(first.result.current.settings.pairingCode)
    expect(first.result.current.connected).toBe(false)
    expect(second.result.current.connected).toBe(false)
    expect(first.result.current.lastError).toBeNull()
  })

  it('dedupes auto-send across multiple hook consumers', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, pendingCount: 0 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ accepted: true, pendingCount: 1 }),
      })
    vi.stubGlobal('fetch', fetchMock)

    const { useCompanion } = await loadUseCompanion()
    const first = renderHook(() => useCompanion())
    const second = renderHook(() => useCompanion())

    act(() => {
      first.result.current.updateSettings({
        enabled: true,
        autoSend: true,
        minConfidence: 0.8,
      })
    })

    await waitFor(() => {
      expect(first.result.current.connected).toBe(true)
    })

    const advisory = makeAdvisory()

    act(() => {
      first.result.current.autoSendAdvisories([advisory])
      second.result.current.autoSendAdvisories([advisory])
    })

    await waitFor(() => {
      const postCalls = fetchMock.mock.calls.filter(([, init]) => init && (init as RequestInit).method === 'POST')
      expect(postCalls).toHaveLength(1)
    })
  })
})
