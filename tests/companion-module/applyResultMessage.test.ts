import { describe, expect, it } from 'vitest'
import {
  buildApplyResultMessage,
  reconcilePendingAdvisoriesAfterApply,
  reconcilePendingAdvisoriesAfterClear,
} from '../../companion-module/src/applyResultMessage'

const advisory = {
  id: 'adv-1',
  peq: { hz: 1250, gainDb: -9 },
  geq: { bandIndex: 12, bandHz: 1250, suggestedDb: -6 },
}

describe('buildApplyResultMessage', () => {
  it('builds an applied message for a manual PEQ apply', () => {
    const message = buildApplyResultMessage({
      advisory,
      result: {
        peqSlot: { band: 3 },
        geqApplied: false,
        failReason: null,
      },
      outputMode: 'peq',
      maxCutDb: -12,
      timestamp: 1234,
    })

    expect(message).toEqual({
      type: 'applied',
      advisoryId: 'adv-1',
      bandIndex: 12,
      appliedGainDb: -9,
      maxCutDb: -12,
      frequencyHz: 1250,
      slotIndex: 3,
      timestamp: 1234,
    })
  })

  it('builds a partial_apply message for mixed success in both mode', () => {
    const message = buildApplyResultMessage({
      advisory,
      result: {
        peqSlot: null,
        geqApplied: true,
        failReason: 'PEQ slot full',
      },
      outputMode: 'both',
      maxCutDb: -12,
      timestamp: 2222,
    })

    expect(message).toEqual({
      type: 'partial_apply',
      advisoryId: 'adv-1',
      peqApplied: false,
      geqApplied: true,
      bandIndex: 12,
      appliedGainDb: -6,
      maxCutDb: -12,
      frequencyHz: 1250,
      failReason: 'PEQ slot full',
      timestamp: 2222,
    })
  })

  it('builds an apply_failed message when nothing lands', () => {
    const message = buildApplyResultMessage({
      advisory,
      result: {
        peqSlot: null,
        geqApplied: false,
        failReason: 'No mixer host configured',
      },
      outputMode: 'peq',
      maxCutDb: -12,
      timestamp: 3333,
    })

    expect(message).toEqual({
      type: 'apply_failed',
      advisoryId: 'adv-1',
      reason: 'No mixer host configured',
      timestamp: 3333,
    })
  })

  it('removes fully applied advisories from the pending queue', () => {
    const pending = [{ id: 'adv-1' }, { id: 'adv-2' }]

    const next = reconcilePendingAdvisoriesAfterApply(pending, {
      type: 'applied',
      advisoryId: 'adv-1',
      bandIndex: 12,
      appliedGainDb: -9,
      frequencyHz: 1250,
      timestamp: 1234,
    })

    expect(next).toEqual([{ id: 'adv-2' }])
  })

  it('keeps partial applies in the pending queue', () => {
    const pending = [{ id: 'adv-1' }, { id: 'adv-2' }]

    const next = reconcilePendingAdvisoriesAfterApply(pending, {
      type: 'partial_apply',
      advisoryId: 'adv-1',
      peqApplied: false,
      geqApplied: true,
      failReason: 'PEQ slot full',
      timestamp: 2222,
    })

    expect(next).toEqual(pending)
  })

  it('keeps partially cleared advisories in the pending queue', () => {
    const pending = [{ id: 'adv-1' }, { id: 'adv-2' }]

    const next = reconcilePendingAdvisoriesAfterClear(pending, 'adv-1', false)

    expect(next).toEqual(pending)
  })

  it('removes fully cleared advisories from the pending queue', () => {
    const pending = [{ id: 'adv-1' }, { id: 'adv-2' }]

    const next = reconcilePendingAdvisoriesAfterClear(pending, 'adv-1', true)

    expect(next).toEqual([{ id: 'adv-2' }])
  })
})
