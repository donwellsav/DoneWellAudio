interface AdvisoryApplyShape {
  id: string
  peq: { hz: number; gainDb: number }
  geq: { bandIndex: number; bandHz: number; suggestedDb: number }
}

interface ApplyResultShape {
  peqSlot: { band: number } | null
  geqApplied: boolean
  failReason: string | null
}

type OutputMode = 'peq' | 'geq' | 'both'

export type ApplyResultMessage =
  | {
      type: 'applied'
      advisoryId: string
      bandIndex: number
      appliedGainDb: number
      maxCutDb?: number
      frequencyHz: number
      slotIndex?: number
      timestamp: number
    }
  | {
      type: 'partial_apply'
      advisoryId: string
      peqApplied: boolean
      geqApplied: boolean
      bandIndex?: number
      appliedGainDb?: number
      maxCutDb?: number
      frequencyHz?: number
      slotIndex?: number
      failReason: string
      timestamp: number
    }
  | { type: 'apply_failed'; advisoryId: string; reason: string; timestamp: number }

export function reconcilePendingAdvisoriesAfterApply<T extends { id: string }>(
  pendingAdvisories: readonly T[],
  message: ApplyResultMessage,
): T[] {
  if (message.type !== 'applied') {
    return [...pendingAdvisories]
  }

  return pendingAdvisories.filter((advisory) => advisory.id !== message.advisoryId)
}

export function reconcilePendingAdvisoriesAfterClear<T extends { id: string }>(
  pendingAdvisories: readonly T[],
  advisoryId: string,
  fullyCleared: boolean,
): T[] {
  if (!fullyCleared) {
    return [...pendingAdvisories]
  }

  return pendingAdvisories.filter((advisory) => advisory.id !== advisoryId)
}

export function buildApplyResultMessage(args: {
  advisory: AdvisoryApplyShape
  result: ApplyResultShape
  outputMode: OutputMode
  maxCutDb: number
  timestamp: number
}): ApplyResultMessage {
  const { advisory, result, outputMode, maxCutDb, timestamp } = args
  const anythingSucceeded = result.peqSlot !== null || result.geqApplied
  const everythingSucceeded = !result.failReason

  if (anythingSucceeded && everythingSucceeded) {
    return {
      type: 'applied',
      advisoryId: advisory.id,
      bandIndex: advisory.geq.bandIndex,
      appliedGainDb: result.peqSlot ? advisory.peq.gainDb : advisory.geq.suggestedDb,
      maxCutDb,
      frequencyHz: result.peqSlot ? advisory.peq.hz : advisory.geq.bandHz,
      ...(result.peqSlot ? { slotIndex: result.peqSlot.band } : {}),
      timestamp,
    }
  }

  if (anythingSucceeded && outputMode === 'both') {
    return {
      type: 'partial_apply',
      advisoryId: advisory.id,
      peqApplied: result.peqSlot !== null,
      geqApplied: result.geqApplied,
      bandIndex: advisory.geq.bandIndex,
      appliedGainDb: result.peqSlot ? advisory.peq.gainDb : advisory.geq.suggestedDb,
      maxCutDb,
      frequencyHz: result.peqSlot ? advisory.peq.hz : advisory.geq.bandHz,
      ...(result.peqSlot ? { slotIndex: result.peqSlot.band } : {}),
      failReason: result.failReason ?? 'Apply partially failed',
      timestamp,
    }
  }

  if (anythingSucceeded) {
    return {
      type: 'applied',
      advisoryId: advisory.id,
      bandIndex: advisory.geq.bandIndex,
      appliedGainDb: result.peqSlot ? advisory.peq.gainDb : advisory.geq.suggestedDb,
      maxCutDb,
      frequencyHz: result.peqSlot ? advisory.peq.hz : advisory.geq.bandHz,
      ...(result.peqSlot ? { slotIndex: result.peqSlot.band } : {}),
      timestamp,
    }
  }

  return {
    type: 'apply_failed',
    advisoryId: advisory.id,
    reason: result.failReason || 'Apply failed',
    timestamp,
  }
}
