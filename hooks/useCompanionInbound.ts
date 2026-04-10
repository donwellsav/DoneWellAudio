'use client'

/**
 * useCompanionInbound — polls the relay for module → app messages
 * and dispatches them to the provided handlers.
 *
 * Separate from useCompanion because the polling loop has different
 * lifetime concerns: we only poll when the bridge is enabled, and we
 * want the poll cadence to be independent of settings changes.
 */

import { useEffect, useRef } from 'react'
import { getCompanionBridge } from '@/lib/companion/companionBridge'
import {
  dispatchCompanionMessages,
  type CompanionInboundHandlers,
} from '@/lib/companion/companionInboundHandlers'

/** Inbound polling interval. Slower than module poll (500ms) since acks/commands are lower-rate. */
const INBOUND_POLL_INTERVAL_MS = 1000

interface UseCompanionInboundOptions {
  /** Whether to poll. Falsy → no polling. */
  enabled: boolean
  /** Pairing code — poller uses the matching bridge instance. */
  pairingCode: string
  /** Handlers for each message type. */
  handlers: CompanionInboundHandlers
}

export function useCompanionInbound({ enabled, pairingCode, handlers }: UseCompanionInboundOptions): void {
  // Keep handlers in a ref so the interval doesn't restart every time the
  // parent rebuilds the handler object (which happens on every render).
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  useEffect(() => {
    if (!enabled || !pairingCode) return

    let cancelled = false
    const bridge = getCompanionBridge(pairingCode)
    bridge.configure(pairingCode)

    const tick = async () => {
      if (cancelled) return
      const messages = await bridge.pollInbound()
      if (cancelled || messages.length === 0) return
      dispatchCompanionMessages(messages, handlersRef.current)
    }

    // Kick off immediately so users see state updates fast on first enable
    void tick()
    const timerId = setInterval(() => { void tick() }, INBOUND_POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      clearInterval(timerId)
    }
  }, [enabled, pairingCode])
}
