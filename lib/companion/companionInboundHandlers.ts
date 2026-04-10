/**
 * Pure dispatch logic for module → app messages.
 *
 * Kept out of React so it can be unit-tested without a renderer.
 * Callers wire each handler to their domain (advisory state, engine, UI, etc.).
 */

import type { ModuleToAppMessage } from '@/types/companion'

/** Advisory-related state updates triggered by module responses. */
export interface CompanionInboundAdvisoryHandlers {
  onAck?: (advisoryId: string, timestamp: number) => void
  onApplied?: (args: {
    advisoryId: string
    bandIndex: number
    appliedGainDb: number
    frequencyHz: number
    slotIndex: number
    timestamp: number
  }) => void
  onApplyFailed?: (advisoryId: string, reason: string, timestamp: number) => void
  onCleared?: (advisoryId: string, slotIndex: number, timestamp: number) => void
}

/** Commands from Stream Deck buttons. */
export interface CompanionInboundCommandHandlers {
  onStart?: () => void
  onStop?: () => void
  onClearAll?: () => void
  onFreeze?: () => void
  onUnfreeze?: () => void
  onRingoutStart?: () => void
  onRingoutStop?: () => void
  onModeChange?: (mode: string) => void
}

export interface CompanionInboundHandlers
  extends CompanionInboundAdvisoryHandlers,
    CompanionInboundCommandHandlers {
  onPong?: (requestId: string, slotsUsed: number, slotsTotal: number) => void
}

/**
 * Dispatch a single inbound message to the appropriate handler.
 * Unknown message types are silently ignored (forward-compat).
 */
export function dispatchCompanionMessage(
  message: ModuleToAppMessage,
  handlers: CompanionInboundHandlers,
): void {
  switch (message.type) {
    case 'ack':
      handlers.onAck?.(message.advisoryId, message.timestamp)
      return

    case 'applied':
      handlers.onApplied?.({
        advisoryId: message.advisoryId,
        bandIndex: message.bandIndex,
        appliedGainDb: message.appliedGainDb,
        frequencyHz: message.frequencyHz,
        slotIndex: message.slotIndex,
        timestamp: message.timestamp,
      })
      return

    case 'apply_failed':
      handlers.onApplyFailed?.(message.advisoryId, message.reason, message.timestamp)
      return

    case 'cleared':
      handlers.onCleared?.(message.advisoryId, message.slotIndex, message.timestamp)
      return

    case 'command':
      dispatchCommand(message.action, handlers)
      return

    case 'pong':
      handlers.onPong?.(message.requestId, message.slotsUsed, message.slotsTotal)
      return
  }
}

/**
 * Dispatch a batch of messages. Errors in one handler do not prevent others
 * from running.
 */
export function dispatchCompanionMessages(
  messages: ModuleToAppMessage[],
  handlers: CompanionInboundHandlers,
): void {
  for (const message of messages) {
    try {
      dispatchCompanionMessage(message, handlers)
    } catch (err) {
      console.warn('[CompanionInbound] dispatch error:', err)
    }
  }
}

function dispatchCommand(action: string, handlers: CompanionInboundCommandHandlers): void {
  if (action.startsWith('mode:')) {
    handlers.onModeChange?.(action.slice(5))
    return
  }
  switch (action) {
    case 'start':
      handlers.onStart?.()
      return
    case 'stop':
      handlers.onStop?.()
      return
    case 'clear_all':
      handlers.onClearAll?.()
      return
    case 'freeze':
      handlers.onFreeze?.()
      return
    case 'unfreeze':
      handlers.onUnfreeze?.()
      return
    case 'ringout_start':
      handlers.onRingoutStart?.()
      return
    case 'ringout_stop':
      handlers.onRingoutStop?.()
      return
  }
}
