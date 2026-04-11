/**
 * Tests for pure dispatch of module → app messages to domain handlers.
 */
import { describe, expect, it, vi } from 'vitest'
import {
  dispatchCompanionMessage,
  dispatchCompanionMessages,
  type CompanionInboundHandlers,
} from '../companionInboundHandlers'
import type { ModuleToAppMessage } from '@/types/companion'

function makeHandlers(): CompanionInboundHandlers & {
  _calls: Record<string, unknown[]>
} {
  const calls: Record<string, unknown[]> = {}
  const capture = (name: string) => vi.fn((...args: unknown[]) => {
    calls[name] = args
  })
  return {
    _calls: calls,
    onAck: capture('ack'),
    onApplied: capture('applied'),
    onApplyFailed: capture('applyFailed'),
    onCleared: capture('cleared'),
    onStart: capture('start'),
    onStop: capture('stop'),
    onClearAll: capture('clearAll'),
    onFreeze: capture('freeze'),
    onUnfreeze: capture('unfreeze'),
    onRingoutStart: capture('ringoutStart'),
    onRingoutStop: capture('ringoutStop'),
    onModeChange: capture('modeChange'),
    onPong: capture('pong'),
  }
}

describe('dispatchCompanionMessage', () => {
  it('dispatches ack to onAck', () => {
    const h = makeHandlers()
    dispatchCompanionMessage(
      { type: 'ack', advisoryId: 'adv-1', timestamp: 1000 },
      h,
    )
    expect(h._calls.ack).toEqual(['adv-1', 1000])
  })

  it('dispatches applied with structured payload', () => {
    const h = makeHandlers()
    dispatchCompanionMessage(
      {
        type: 'applied',
        advisoryId: 'adv-2',
        bandIndex: 5,
        appliedGainDb: -6,
        frequencyHz: 1247,
        slotIndex: 3,
        timestamp: 2000,
      },
      h,
    )
    expect(h._calls.applied).toEqual([{
      advisoryId: 'adv-2',
      bandIndex: 5,
      appliedGainDb: -6,
      frequencyHz: 1247,
      slotIndex: 3,
      timestamp: 2000,
    }])
  })

  it('dispatches apply_failed with reason', () => {
    const h = makeHandlers()
    dispatchCompanionMessage(
      { type: 'apply_failed', advisoryId: 'adv-3', reason: 'No slot', timestamp: 3000 },
      h,
    )
    expect(h._calls.applyFailed).toEqual(['adv-3', 'No slot', 3000])
  })

  it('dispatches cleared to onCleared', () => {
    const h = makeHandlers()
    dispatchCompanionMessage(
      { type: 'cleared', advisoryId: 'adv-4', slotIndex: 2, timestamp: 4000 },
      h,
    )
    expect(h._calls.cleared).toEqual(['adv-4', 2, 4000])
  })

  it('dispatches pong', () => {
    const h = makeHandlers()
    dispatchCompanionMessage(
      { type: 'pong', requestId: 'req-1', slotsUsed: 3, slotsTotal: 8, timestamp: 5000 },
      h,
    )
    expect(h._calls.pong).toEqual(['req-1', 3, 8])
  })

  describe('command dispatch', () => {
    const makeCommand = (action: string): ModuleToAppMessage => ({
      type: 'command',
      action: action as never,
      timestamp: 0,
    })

    it('routes start action', () => {
      const h = makeHandlers()
      dispatchCompanionMessage(makeCommand('start'), h)
      expect(h._calls.start).toEqual([])
    })

    it('routes stop action', () => {
      const h = makeHandlers()
      dispatchCompanionMessage(makeCommand('stop'), h)
      expect(h._calls.stop).toEqual([])
    })

    it('routes clear_all action', () => {
      const h = makeHandlers()
      dispatchCompanionMessage(makeCommand('clear_all'), h)
      expect(h._calls.clearAll).toEqual([])
    })

    it('routes freeze and unfreeze independently', () => {
      const h = makeHandlers()
      dispatchCompanionMessage(makeCommand('freeze'), h)
      expect(h._calls.freeze).toEqual([])
      dispatchCompanionMessage(makeCommand('unfreeze'), h)
      expect(h._calls.unfreeze).toEqual([])
    })

    it('routes ringout_start / ringout_stop', () => {
      const h = makeHandlers()
      dispatchCompanionMessage(makeCommand('ringout_start'), h)
      dispatchCompanionMessage(makeCommand('ringout_stop'), h)
      expect(h._calls.ringoutStart).toEqual([])
      expect(h._calls.ringoutStop).toEqual([])
    })

    it('routes mode:* action to onModeChange with mode name', () => {
      const h = makeHandlers()
      dispatchCompanionMessage(makeCommand('mode:speech'), h)
      expect(h._calls.modeChange).toEqual(['speech'])
      dispatchCompanionMessage(makeCommand('mode:liveMusic'), h)
      expect(h._calls.modeChange).toEqual(['liveMusic'])
    })

    it('ignores unknown commands silently (forward-compat)', () => {
      const h = makeHandlers()
      dispatchCompanionMessage(makeCommand('future_action'), h)
      // No handler should have been called
      expect(Object.keys(h._calls)).toEqual([])
    })
  })

  it('tolerates missing handlers (all optional)', () => {
    // No handlers at all
    expect(() =>
      dispatchCompanionMessage(
        { type: 'ack', advisoryId: 'adv-1', timestamp: 1 },
        {},
      ),
    ).not.toThrow()
  })
})

describe('dispatchCompanionMessages', () => {
  it('dispatches all messages in order', () => {
    const h = makeHandlers()
    dispatchCompanionMessages(
      [
        { type: 'ack', advisoryId: 'a', timestamp: 1 },
        { type: 'ack', advisoryId: 'b', timestamp: 2 },
      ],
      h,
    )
    // Last ack wins in our capture approach
    expect(h._calls.ack).toEqual(['b', 2])
    expect(h.onAck).toHaveBeenCalledTimes(2)
  })

  it('continues dispatching when a handler throws', () => {
    const h: CompanionInboundHandlers = {
      onAck: vi.fn(() => { throw new Error('boom') }),
      onApplied: vi.fn(),
    }
    dispatchCompanionMessages(
      [
        { type: 'ack', advisoryId: 'a', timestamp: 1 },
        {
          type: 'applied',
          advisoryId: 'b',
          bandIndex: 0,
          appliedGainDb: -3,
          frequencyHz: 440,
          slotIndex: 0,
          timestamp: 2,
        },
      ],
      h,
    )
    expect(h.onAck).toHaveBeenCalled()
    expect(h.onApplied).toHaveBeenCalled()
  })
})
