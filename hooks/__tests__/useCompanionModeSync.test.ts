// @vitest-environment jsdom

import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OperationMode } from '@/types/advisory'

const mocks = vi.hoisted(() => {
  const state = {
    enabled: true,
    pairingCode: 'DWA-TEST',
  }

  return {
    state,
    sendModeChange: vi.fn(() => Promise.resolve(true)),
  }
})

vi.mock('@/hooks/useCompanion', () => ({
  useCompanion: () => ({
    settings: {
      enabled: mocks.state.enabled,
      pairingCode: mocks.state.pairingCode,
      autoSend: false,
      minConfidence: 0.7,
      ringOutAutoSend: false,
    },
    sendModeChange: mocks.sendModeChange,
  }),
}))

import { useCompanionModeSync } from '../useCompanionModeSync'

interface HookProps {
  mode: OperationMode
}

describe('useCompanionModeSync', () => {
  beforeEach(() => {
    mocks.state.enabled = true
    mocks.state.pairingCode = 'DWA-TEST'
    mocks.sendModeChange.mockClear()
  })

  it('syncs the initial mode and only re-sends when the mode or pairing changes', async () => {
    const { rerender } = renderHook(
      ({ mode }: HookProps) => useCompanionModeSync(mode),
      { initialProps: { mode: 'speech' } },
    )

    await waitFor(() => {
      expect(mocks.sendModeChange).toHaveBeenCalledWith('speech')
    })
    expect(mocks.sendModeChange).toHaveBeenCalledTimes(1)

    rerender({ mode: 'speech' })
    expect(mocks.sendModeChange).toHaveBeenCalledTimes(1)

    rerender({ mode: 'ringOut' })
    await waitFor(() => {
      expect(mocks.sendModeChange).toHaveBeenCalledWith('ringOut')
    })
    expect(mocks.sendModeChange).toHaveBeenCalledTimes(2)

    mocks.state.pairingCode = 'DWA-NEW'
    rerender({ mode: 'ringOut' })
    await waitFor(() => {
      expect(mocks.sendModeChange).toHaveBeenCalledTimes(3)
    })
  })

  it('resets dedupe when Companion is disabled', async () => {
    const { rerender } = renderHook(
      ({ mode }: HookProps) => useCompanionModeSync(mode),
      { initialProps: { mode: 'speech' } },
    )

    await waitFor(() => {
      expect(mocks.sendModeChange).toHaveBeenCalledTimes(1)
    })

    mocks.state.enabled = false
    rerender({ mode: 'speech' })
    expect(mocks.sendModeChange).toHaveBeenCalledTimes(1)

    mocks.state.enabled = true
    rerender({ mode: 'speech' })
    await waitFor(() => {
      expect(mocks.sendModeChange).toHaveBeenCalledTimes(2)
    })
  })
})
