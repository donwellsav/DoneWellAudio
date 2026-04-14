// @vitest-environment jsdom

import { act, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CompanionInboundHandlers } from '@/lib/companion/companionInboundHandlers'

const mocks = vi.hoisted(() => {
  let inboundHandlers: CompanionInboundHandlers | undefined

  return {
    patchCompanionState: vi.fn(),
    clearCompanionStateForAdvisory: vi.fn(),
    restoreDismissedAdvisory: vi.fn(),
    retryCompanionLifecycle: vi.fn(),
    clearCompanionLifecycle: vi.fn(),
    markCompanionApplied: vi.fn(),
    clearCompanionPendingCut: vi.fn(),
    syncFeedbackHistory: vi.fn(),
    getFeedbackHotspotSummaries: vi.fn(() => []),
    onClearAll: vi.fn(),
    useCompanionInboundMock: vi.fn((args: {
      enabled: boolean
      pairingCode: string
      handlers: CompanionInboundHandlers
    }) => {
      inboundHandlers = args.handlers
    }),
    getInboundHandlers: () => inboundHandlers,
    resetInboundHandlers: () => {
      inboundHandlers = undefined
    },
    onRingoutStart: vi.fn(),
    onRingoutStop: vi.fn(),
  }
})

vi.mock('@/hooks/useCompanion', () => ({
  useCompanion: () => ({
    settings: {
      enabled: true,
      pairingCode: 'DWA-TEST',
      autoSend: false,
      minConfidence: 0.7,
      ringOutAutoSend: false,
    },
  }),
}))

vi.mock('@/hooks/useCompanionInbound', () => ({
  useCompanionInbound: mocks.useCompanionInboundMock,
}))

vi.mock('@/contexts/EngineContext', () => ({
  useEngine: () => ({
    start: vi.fn(async () => undefined),
    stop: vi.fn(),
    dspWorker: {
      syncFeedbackHistory: mocks.syncFeedbackHistory,
    },
  }),
}))

vi.mock('@/contexts/SettingsContext', () => ({
  useSettings: () => ({
    setMode: vi.fn(),
  }),
}))

vi.mock('@/contexts/UIContext', () => ({
  useUI: () => ({
    isFrozen: false,
    toggleFreeze: vi.fn(),
  }),
}))

vi.mock('@/contexts/AdvisoryContext', () => ({
  useAdvisoryActions: () => ({
    onClearAll: mocks.onClearAll,
    patchCompanionState: mocks.patchCompanionState,
    clearCompanionStateForAdvisory: mocks.clearCompanionStateForAdvisory,
    restoreDismissedAdvisory: mocks.restoreDismissedAdvisory,
    retryCompanionLifecycle: mocks.retryCompanionLifecycle,
    clearCompanionLifecycle: mocks.clearCompanionLifecycle,
  }),
}))

vi.mock('@/lib/dsp/feedbackHistory', () => ({
  getFeedbackHistory: () => ({
    markCompanionApplied: mocks.markCompanionApplied,
    clearCompanionPendingCut: mocks.clearCompanionPendingCut,
  }),
  getFeedbackHotspotSummaries: mocks.getFeedbackHotspotSummaries,
}))

import { CompanionCommandBridge } from '../CompanionCommandBridge'

describe('CompanionCommandBridge', () => {
  beforeEach(() => {
    mocks.patchCompanionState.mockReset()
    mocks.clearCompanionStateForAdvisory.mockReset()
    mocks.restoreDismissedAdvisory.mockReset()
    mocks.retryCompanionLifecycle.mockReset()
    mocks.clearCompanionLifecycle.mockReset()
    mocks.markCompanionApplied.mockReset()
    mocks.clearCompanionPendingCut.mockReset()
    mocks.syncFeedbackHistory.mockReset()
    mocks.getFeedbackHotspotSummaries.mockClear()
    mocks.onClearAll.mockReset()
    mocks.useCompanionInboundMock.mockClear()
    mocks.resetInboundHandlers()
  })

  it('records applied-cut metadata from partial_apply messages', () => {
    render(<CompanionCommandBridge />)

    const handlers = mocks.getInboundHandlers()
    expect(handlers?.onPartialApply).toBeTypeOf('function')

    act(() => {
      handlers?.onPartialApply?.({
        advisoryId: 'adv-1',
        peqApplied: true,
        geqApplied: false,
        bandIndex: 12,
        appliedGainDb: -9,
        maxCutDb: -12,
        frequencyHz: 1250,
        slotIndex: 3,
        failReason: 'GEQ failed',
        timestamp: 1234,
      })
    })

    expect(mocks.patchCompanionState).toHaveBeenCalledWith('adv-1', {
      partialApply: {
        at: 1234,
        peqApplied: true,
        geqApplied: false,
        failReason: 'GEQ failed',
      },
      applied: {
        at: 1234,
        gainDb: -9,
        slotIndex: 3,
      },
    })
    expect(mocks.markCompanionApplied).toHaveBeenCalledWith({
      advisoryId: 'adv-1',
      at: 1234,
      bandIndex: 12,
      frequencyHz: 1250,
      gainDb: -9,
      maxCutDb: -12,
    })
    expect(mocks.syncFeedbackHistory).toHaveBeenCalled()
  })

  it('records GEQ-only applied messages without inventing a PEQ slot', () => {
    render(<CompanionCommandBridge />)

    const handlers = mocks.getInboundHandlers()
    expect(handlers?.onApplied).toBeTypeOf('function')

    act(() => {
      handlers?.onApplied?.({
        advisoryId: 'adv-geq-full',
        bandIndex: 14,
        appliedGainDb: -6,
        maxCutDb: -12,
        frequencyHz: 1600,
        timestamp: 1777,
      })
    })

    expect(mocks.patchCompanionState).toHaveBeenCalledWith('adv-geq-full', {
      applied: {
        at: 1777,
        gainDb: -6,
      },
    })
    expect(mocks.markCompanionApplied).toHaveBeenCalledWith({
      advisoryId: 'adv-geq-full',
      at: 1777,
      bandIndex: 14,
      frequencyHz: 1600,
      gainDb: -6,
      maxCutDb: -12,
    })
    expect(mocks.syncFeedbackHistory).toHaveBeenCalled()
  })

  it('does not invent a PEQ slot for GEQ-only partial_apply messages', () => {
    render(<CompanionCommandBridge />)

    const handlers = mocks.getInboundHandlers()
    expect(handlers?.onPartialApply).toBeTypeOf('function')

    act(() => {
      handlers?.onPartialApply?.({
        advisoryId: 'adv-geq',
        peqApplied: false,
        geqApplied: true,
        bandIndex: 18,
        appliedGainDb: -6,
        maxCutDb: -12,
        frequencyHz: 1600,
        failReason: 'PEQ slot full',
        timestamp: 2222,
      })
    })

    expect(mocks.patchCompanionState).toHaveBeenCalledWith('adv-geq', {
      partialApply: {
        at: 2222,
        peqApplied: false,
        geqApplied: true,
        failReason: 'PEQ slot full',
      },
    })
    expect(mocks.markCompanionApplied).toHaveBeenCalledWith({
      advisoryId: 'adv-geq',
      at: 2222,
      bandIndex: 18,
      frequencyHz: 1600,
      gainDb: -6,
      maxCutDb: -12,
    })
    expect(mocks.syncFeedbackHistory).toHaveBeenCalled()
  })

  it('wires remote ring-out commands to the live ring-out callbacks', () => {
    render(
      <CompanionCommandBridge
        onRingoutStart={mocks.onRingoutStart}
        onRingoutStop={mocks.onRingoutStop}
      />,
    )

    const handlers = mocks.getInboundHandlers()
    expect(handlers?.onRingoutStart).toBeTypeOf('function')
    expect(handlers?.onRingoutStop).toBeTypeOf('function')

    act(() => {
      handlers?.onRingoutStart?.()
      handlers?.onRingoutStop?.()
    })

    expect(mocks.onRingoutStart).toHaveBeenCalledTimes(1)
    expect(mocks.onRingoutStop).toHaveBeenCalledTimes(1)
  })

  it('cancels pending cut verification when the module reports a clear', () => {
    render(<CompanionCommandBridge />)

    const handlers = mocks.getInboundHandlers()
    expect(handlers?.onCleared).toBeTypeOf('function')

    act(() => {
      handlers?.onCleared?.('adv-cleared', 2, 4444)
    })

    expect(mocks.clearCompanionStateForAdvisory).toHaveBeenCalledWith('adv-cleared')
    expect(mocks.clearCompanionPendingCut).toHaveBeenCalledWith('adv-cleared')
    expect(mocks.clearCompanionLifecycle).toHaveBeenCalledWith('adv-cleared')
  })

  it('restores a dismissed advisory when the module reports a partial clear', () => {
    render(<CompanionCommandBridge />)

    const handlers = mocks.getInboundHandlers()
    expect(handlers?.onPartialClear).toBeTypeOf('function')

    act(() => {
      handlers?.onPartialClear?.({
        advisoryId: 'adv-partial-clear',
        peqCleared: true,
        geqCleared: false,
        failReason: 'GEQ failed',
        timestamp: 5000,
      })
    })

    expect(mocks.restoreDismissedAdvisory).toHaveBeenCalledWith('adv-partial-clear')
    expect(mocks.retryCompanionLifecycle).toHaveBeenCalledWith('adv-partial-clear')
    expect(mocks.patchCompanionState).toHaveBeenCalledWith('adv-partial-clear', {
      partialClear: {
        at: 5000,
        peqCleared: true,
        geqCleared: false,
        failReason: 'GEQ failed',
      },
      clearFailed: undefined,
      applied: undefined,
    })
  })

  it('restores a dismissed advisory when the module reports a clear failure', () => {
    render(<CompanionCommandBridge />)

    const handlers = mocks.getInboundHandlers()
    expect(handlers?.onClearFailed).toBeTypeOf('function')

    act(() => {
      handlers?.onClearFailed?.('adv-clear-failed', 'No outputs cleared', 6000)
    })

    expect(mocks.restoreDismissedAdvisory).toHaveBeenCalledWith('adv-clear-failed')
    expect(mocks.retryCompanionLifecycle).toHaveBeenCalledWith('adv-clear-failed')
    expect(mocks.patchCompanionState).toHaveBeenCalledWith('adv-clear-failed', {
      clearFailed: {
        at: 6000,
        reason: 'No outputs cleared',
      },
      partialClear: undefined,
    })
  })
})
