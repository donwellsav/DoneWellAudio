// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Advisory } from '@/types/advisory'

const { feedbackHistoryMock, getFeedbackHistoryMock } = vi.hoisted(() => ({
  feedbackHistoryMock: {
    peekRetryCompanionCut: vi.fn(),
    consumeRetryCompanionCut: vi.fn(),
  },
  getFeedbackHistoryMock: vi.fn(),
}))

vi.mock('@/lib/dsp/feedbackHistory', () => ({
  getFeedbackHistory: getFeedbackHistoryMock,
}))

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
    feedbackHistoryMock.peekRetryCompanionCut.mockReset()
    feedbackHistoryMock.consumeRetryCompanionCut.mockReset()
    feedbackHistoryMock.peekRetryCompanionCut.mockReturnValue(null)
    feedbackHistoryMock.consumeRetryCompanionCut.mockReturnValue(null)
    getFeedbackHistoryMock.mockReset()
    getFeedbackHistoryMock.mockReturnValue(feedbackHistoryMock)
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

  it('ignores stale connection checks after Companion is disabled', async () => {
    let resolveFetch: ((value: { ok: boolean; json: () => Promise<{ ok: boolean; pendingCount: number }> }) => void) | null = null
    const fetchMock = vi.fn().mockImplementation(() => new Promise((resolve) => {
      resolveFetch = resolve
    }))
    vi.stubGlobal('fetch', fetchMock)

    const { useCompanion } = await loadUseCompanion()
    const { result } = renderHook(() => useCompanion())

    act(() => {
      result.current.updateSettings({ enabled: true })
    })

    act(() => {
      result.current.updateSettings({ enabled: false })
    })

    await act(async () => {
      resolveFetch?.({
        ok: true,
        json: async () => ({ ok: true, pendingCount: 0 }),
      })
      await Promise.resolve()
    })

    expect(result.current.settings.enabled).toBe(false)
    expect(result.current.connected).toBe(false)
    expect(result.current.lastError).toBeNull()
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

  it('allows a deeper retry on the same advisory id after the initial send', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, pendingCount: 0 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ accepted: true, pendingCount: 1 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ accepted: true, pendingCount: 2 }),
      })
    vi.stubGlobal('fetch', fetchMock)

    const { useCompanion } = await loadUseCompanion()
    const { result } = renderHook(() => useCompanion())

    act(() => {
      result.current.updateSettings({
        enabled: true,
        autoSend: true,
        minConfidence: 0.8,
      })
    })

    await waitFor(() => {
      expect(result.current.connected).toBe(true)
    })

    const advisory = makeAdvisory()

    act(() => {
      result.current.autoSendAdvisories([advisory])
    })

    await waitFor(() => {
      const postCalls = fetchMock.mock.calls.filter(([, init]) => init && (init as RequestInit).method === 'POST')
      expect(postCalls).toHaveLength(1)
    })

    feedbackHistoryMock.peekRetryCompanionCut.mockReturnValue({
      nextGainDb: -9,
      retryCount: 1,
      advisoryId: advisory.id,
      bandIndex: 15,
    })

    act(() => {
      result.current.autoSendAdvisories([advisory])
    })

    await waitFor(() => {
      const postCalls = fetchMock.mock.calls.filter(([, init]) => init && (init as RequestInit).method === 'POST')
      expect(postCalls).toHaveLength(2)
    })

    const postCalls = fetchMock.mock.calls.filter(([, init]) => init && (init as RequestInit).method === 'POST')
    const retryRequest = postCalls[1]?.[1] as RequestInit
    const retryPayload = JSON.parse(String(retryRequest.body))

    expect(retryPayload.id).toBe(advisory.id)
    expect(retryPayload.peq.gainDb).toBe(-9)
    expect(feedbackHistoryMock.consumeRetryCompanionCut).not.toHaveBeenCalled()
  })

  it('dedupes a retry step even when the hotspot is recreated under a new advisory id', async () => {
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

    feedbackHistoryMock.peekRetryCompanionCut.mockReturnValue({
      nextGainDb: -9,
      retryCount: 1,
      advisoryId: 'adv-1',
      bandIndex: 15,
    })

    const { useCompanion } = await loadUseCompanion()
    const { result } = renderHook(() => useCompanion())

    act(() => {
      result.current.updateSettings({
        enabled: true,
        autoSend: true,
        minConfidence: 0.8,
      })
    })

    await waitFor(() => {
      expect(result.current.connected).toBe(true)
    })

    act(() => {
      result.current.autoSendAdvisories([
        makeAdvisory({ id: 'adv-2' }),
      ])
      result.current.autoSendAdvisories([
        makeAdvisory({ id: 'adv-3' }),
      ])
    })

    await waitFor(() => {
      const postCalls = fetchMock.mock.calls.filter(([, init]) => init && (init as RequestInit).method === 'POST')
      expect(postCalls).toHaveLength(1)
    })
  })

  it('sends closed-loop retries even when autoSend is off', async () => {
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

    feedbackHistoryMock.peekRetryCompanionCut.mockReturnValue({
      nextGainDb: -9,
      retryCount: 1,
      advisoryId: 'adv-1',
      bandIndex: 15,
    })

    const { useCompanion } = await loadUseCompanion()
    const { result } = renderHook(() => useCompanion())

    act(() => {
      result.current.updateSettings({
        enabled: true,
        autoSend: false,
        minConfidence: 0.8,
      })
    })

    await waitFor(() => {
      expect(result.current.connected).toBe(true)
    })

    act(() => {
      result.current.autoSendAdvisories([
        makeAdvisory({ severity: 'RESONANCE' }),
      ])
    })

    await waitFor(() => {
      const postCalls = fetchMock.mock.calls.filter(([, init]) => init && (init as RequestInit).method === 'POST')
      expect(postCalls).toHaveLength(1)
    })

    expect(feedbackHistoryMock.consumeRetryCompanionCut).not.toHaveBeenCalled()
  })

  it('sends closed-loop retries even below minConfidence', async () => {
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

    feedbackHistoryMock.peekRetryCompanionCut.mockReturnValue({
      nextGainDb: -9,
      retryCount: 1,
      advisoryId: 'adv-1',
      bandIndex: 15,
    })

    const { useCompanion } = await loadUseCompanion()
    const { result } = renderHook(() => useCompanion())

    act(() => {
      result.current.updateSettings({
        enabled: true,
        autoSend: true,
        minConfidence: 0.8,
      })
    })

    await waitFor(() => {
      expect(result.current.connected).toBe(true)
    })

    act(() => {
      result.current.autoSendAdvisories([
        makeAdvisory({ confidence: 0.2, severity: 'RESONANCE' }),
      ])
    })

    await waitFor(() => {
      const postCalls = fetchMock.mock.calls.filter(([, init]) => init && (init as RequestInit).method === 'POST')
      expect(postCalls).toHaveLength(1)
    })

    expect(feedbackHistoryMock.consumeRetryCompanionCut).not.toHaveBeenCalled()
  })

  it('sends closed-loop retries for POSSIBLE_RING advisories after an explicit cut', async () => {
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

    feedbackHistoryMock.peekRetryCompanionCut.mockReturnValue({
      nextGainDb: -9,
      retryCount: 1,
      advisoryId: 'ring-1',
      bandIndex: 15,
    })

    const { useCompanion } = await loadUseCompanion()
    const { result } = renderHook(() => useCompanion())

    act(() => {
      result.current.updateSettings({
        enabled: true,
        autoSend: false,
        minConfidence: 0.95,
      })
    })

    await waitFor(() => {
      expect(result.current.connected).toBe(true)
    })

    act(() => {
      result.current.autoSendAdvisories([
        makeAdvisory({
          id: 'ring-1',
          label: 'POSSIBLE_RING',
          severity: 'POSSIBLE_RING',
          confidence: 0.2,
        }),
      ])
    })

    await waitFor(() => {
      const postCalls = fetchMock.mock.calls.filter(([, init]) => init && (init as RequestInit).method === 'POST')
      expect(postCalls).toHaveLength(1)
    })

    const postCalls = fetchMock.mock.calls.filter(([, init]) => init && (init as RequestInit).method === 'POST')
    const request = postCalls[0]?.[1] as RequestInit
    const payload = JSON.parse(String(request.body))

    expect(payload.type).toBe('auto_apply')
    expect(payload.peq.gainDb).toBe(-9)
    expect(feedbackHistoryMock.consumeRetryCompanionCut).not.toHaveBeenCalled()
  })

  it('does not auto-send whistle or instrument advisories', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, pendingCount: 0 }),
      })
    vi.stubGlobal('fetch', fetchMock)

    const { useCompanion } = await loadUseCompanion()
    const { result } = renderHook(() => useCompanion())

    act(() => {
      result.current.updateSettings({
        enabled: true,
        autoSend: true,
        minConfidence: 0.5,
      })
    })

    await waitFor(() => {
      expect(result.current.connected).toBe(true)
    })

    act(() => {
      result.current.autoSendAdvisories([
        makeAdvisory({ id: 'whistle', label: 'WHISTLE', severity: 'WHISTLE' }),
        makeAdvisory({ id: 'instrument', label: 'INSTRUMENT', severity: 'INSTRUMENT' }),
      ])
    })

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })
  })

  it('does not auto-send POSSIBLE_RING advisories', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, pendingCount: 0 }),
      })
    vi.stubGlobal('fetch', fetchMock)

    const { useCompanion } = await loadUseCompanion()
    const { result } = renderHook(() => useCompanion())

    act(() => {
      result.current.updateSettings({
        enabled: true,
        autoSend: true,
        minConfidence: 0.1,
      })
    })

    await waitFor(() => {
      expect(result.current.connected).toBe(true)
    })

    act(() => {
      result.current.autoSendAdvisories([
        makeAdvisory({
          id: 'ring-1',
          label: 'POSSIBLE_RING',
          severity: 'POSSIBLE_RING',
        }),
      ])
    })

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })
  })

  it('allows explicit low-confidence ring sends', async () => {
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
    const { result } = renderHook(() => useCompanion())

    act(() => {
      result.current.updateSettings({
        enabled: true,
        autoSend: false,
        minConfidence: 0.95,
      })
    })

    await waitFor(() => {
      expect(result.current.connected).toBe(true)
    })

    await act(async () => {
      const accepted = await result.current.sendExplicitAdvisory(
        makeAdvisory({
          id: 'ring-explicit',
          label: 'POSSIBLE_RING',
          severity: 'POSSIBLE_RING',
          confidence: 0.2,
        }),
      )
      expect(accepted).toBe(true)
    })

    const postCalls = fetchMock.mock.calls.filter(([, init]) => init && (init as RequestInit).method === 'POST')
    expect(postCalls).toHaveLength(1)
  })

  it('does not auto-send again after the same advisory was already sent explicitly', async () => {
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
    const { result } = renderHook(() => useCompanion())

    act(() => {
      result.current.updateSettings({
        enabled: true,
        autoSend: true,
        minConfidence: 0.5,
      })
    })

    await waitFor(() => {
      expect(result.current.connected).toBe(true)
    })

    await act(async () => {
      const accepted = await result.current.sendExplicitAdvisory(
        makeAdvisory({ id: 'adv-explicit' }),
      )
      expect(accepted).toBe(true)
    })

    act(() => {
      result.current.autoSendAdvisories([
        makeAdvisory({ id: 'adv-explicit' }),
      ])
    })

    const postCalls = fetchMock.mock.calls.filter(([, init]) => init && (init as RequestInit).method === 'POST')
    expect(postCalls).toHaveLength(1)
  })

  it('still allows a second explicit send for the same advisory payload', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, pendingCount: 0 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ accepted: true, pendingCount: 1 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ accepted: true, pendingCount: 1 }),
      })
    vi.stubGlobal('fetch', fetchMock)

    const { useCompanion } = await loadUseCompanion()
    const { result } = renderHook(() => useCompanion())

    act(() => {
      result.current.updateSettings({
        enabled: true,
        autoSend: false,
        minConfidence: 0.5,
      })
    })

    await waitFor(() => {
      expect(result.current.connected).toBe(true)
    })

    await act(async () => {
      expect(await result.current.sendExplicitAdvisory(makeAdvisory({ id: 'adv-explicit-repeat' }))).toBe(true)
      expect(await result.current.sendExplicitAdvisory(makeAdvisory({ id: 'adv-explicit-repeat' }))).toBe(true)
    })

    const postCalls = fetchMock.mock.calls.filter(([, init]) => init && (init as RequestInit).method === 'POST')
    expect(postCalls).toHaveLength(2)
  })

  it('sends mode changes through the relay and refreshes connection state on success', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, pendingCount: 0 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ accepted: true, pendingCount: 0 }),
      })
    vi.stubGlobal('fetch', fetchMock)

    const { useCompanion } = await loadUseCompanion()
    const { result } = renderHook(() => useCompanion())

    act(() => {
      result.current.updateSettings({
        enabled: true,
      })
    })

    await waitFor(() => {
      expect(result.current.connected).toBe(true)
    })

    await act(async () => {
      const accepted = await result.current.sendModeChange('ringOut')
      expect(accepted).toBe(true)
    })

    expect(result.current.connected).toBe(true)
    expect(result.current.lastError).toBeNull()

    const postCalls = fetchMock.mock.calls.filter(([, init]) => init && (init as RequestInit).method === 'POST')
    expect(postCalls).toHaveLength(1)
    expect(JSON.parse(String((postCalls[0]?.[1] as RequestInit).body))).toEqual({
      type: 'mode_change',
      mode: 'ringOut',
    })
  })

  it('re-sends when the same advisory id changes its effective EQ payload', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, pendingCount: 0 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ accepted: true, pendingCount: 1 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ accepted: true, pendingCount: 2 }),
      })
    vi.stubGlobal('fetch', fetchMock)

    const { useCompanion } = await loadUseCompanion()
    const { result } = renderHook(() => useCompanion())

    act(() => {
      result.current.updateSettings({
        enabled: true,
        autoSend: true,
        minConfidence: 0.5,
      })
    })

    await waitFor(() => {
      expect(result.current.connected).toBe(true)
    })

    act(() => {
      result.current.autoSendAdvisories([
        makeAdvisory({ id: 'adv-payload' }),
      ])
    })

    await waitFor(() => {
      const postCalls = fetchMock.mock.calls.filter(([, init]) => init && (init as RequestInit).method === 'POST')
      expect(postCalls).toHaveLength(1)
    })

    act(() => {
      result.current.autoSendAdvisories([
        makeAdvisory({
          id: 'adv-payload',
          advisory: {
            geq: { bandIndex: 15, bandHz: 1000, suggestedDb: -9 },
            peq: { type: 'bell', hz: 1000, q: 4, gainDb: -9 },
            shelves: [],
            pitch: { note: 'B', octave: 5, cents: 0, midi: 83 },
          },
        }),
      ])
    })

    await waitFor(() => {
      const postCalls = fetchMock.mock.calls.filter(([, init]) => init && (init as RequestInit).method === 'POST')
      expect(postCalls).toHaveLength(2)
    })
  })

  it('does not re-send when the same advisory id keeps the same EQ payload', async () => {
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
    const { result } = renderHook(() => useCompanion())

    act(() => {
      result.current.updateSettings({
        enabled: true,
        autoSend: true,
        minConfidence: 0.5,
      })
    })

    await waitFor(() => {
      expect(result.current.connected).toBe(true)
    })

    act(() => {
      result.current.autoSendAdvisories([
        makeAdvisory({ id: 'adv-stable' }),
      ])
      result.current.autoSendAdvisories([
        makeAdvisory({ id: 'adv-stable' }),
      ])
    })

    await waitFor(() => {
      const postCalls = fetchMock.mock.calls.filter(([, init]) => init && (init as RequestInit).method === 'POST')
      expect(postCalls).toHaveLength(1)
    })
  })

  it('re-sends after the same advisory id resolves and later recurs', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, pendingCount: 0 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ accepted: true, pendingCount: 1 }),
      })
      .mockResolvedValueOnce({
        ok: true,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ accepted: true, pendingCount: 1 }),
      })
    vi.stubGlobal('fetch', fetchMock)

    const { useCompanion } = await loadUseCompanion()
    const { result } = renderHook(() => useCompanion())

    act(() => {
      result.current.updateSettings({
        enabled: true,
        autoSend: true,
        minConfidence: 0.5,
      })
    })

    await waitFor(() => {
      expect(result.current.connected).toBe(true)
    })

    act(() => {
      result.current.autoSendAdvisories([
        makeAdvisory({ id: 'adv-recur' }),
      ])
    })

    await waitFor(() => {
      const postCalls = fetchMock.mock.calls.filter(([, init]) => init && (init as RequestInit).method === 'POST')
      expect(postCalls).toHaveLength(1)
    })

    await act(async () => {
      const accepted = await result.current.sendResolve('adv-recur')
      expect(accepted).toBe(true)
    })

    act(() => {
      result.current.autoSendAdvisories([
        makeAdvisory({ id: 'adv-recur' }),
      ])
    })

    await waitFor(() => {
      const postCalls = fetchMock.mock.calls.filter(([, init]) => init && (init as RequestInit).method === 'POST')
      expect(postCalls).toHaveLength(3)
    })
  })
})
