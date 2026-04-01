// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

async function loadUseCompanion() {
  vi.resetModules()
  return import('../useCompanion')
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
})
