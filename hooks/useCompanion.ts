'use client'

/**
 * useCompanion — manages Companion module connection, pairing, and advisory relay.
 *
 * Handles WebSocket bridge lifecycle, relay polling, auto-send of new advisories,
 * pairing code generation, and settings persistence. Companion modules are external
 * hardware/software (e.g., Wing OSC, dbx DriveRack PA2) that receive EQ recommendations.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Advisory } from '@/types/advisory'
import type { CompanionSettings } from '@/types/companion'
import { DEFAULT_COMPANION_SETTINGS } from '@/types/companion'
import { companionStorage } from '@/lib/companion/companionStorage'
import { CompanionBridge, generatePairingCode } from '@/lib/companion/companionBridge'

interface UseCompanionReturn {
  /** Current companion settings */
  settings: CompanionSettings
  /** Update settings (partial merge, auto-persists) */
  updateSettings: (partial: Partial<CompanionSettings>) => void
  /** Whether relay is reachable (always true — same origin) */
  connected: boolean
  /** Last error message, or null */
  lastError: string | null
  /** Send a single advisory to the relay. Returns true if accepted. */
  sendAdvisory: (advisory: Advisory) => Promise<boolean>
  /** Check relay connection */
  checkConnection: () => Promise<boolean>
  /** Generate a new pairing code */
  regenerateCode: () => void
}

export function useCompanion(): UseCompanionReturn {
  const [settings, setSettings] = useState<CompanionSettings>(() => {
    const saved = companionStorage.load()
    // Generate a pairing code on first use
    if (!saved.pairingCode) {
      saved.pairingCode = generatePairingCode()
      companionStorage.save(saved)
    }
    return saved
  })
  const [connected, setConnected] = useState(false)
  const [lastError, setLastError] = useState<string | null>(null)

  const bridgeRef = useRef<CompanionBridge | null>(null)

  const bridge = useMemo(() => {
    if (!bridgeRef.current) {
      bridgeRef.current = new CompanionBridge(settings.pairingCode)
    } else {
      bridgeRef.current.configure(settings.pairingCode)
    }
    return bridgeRef.current
  }, [settings.pairingCode])

  const updateSettings = useCallback((partial: Partial<CompanionSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial }
      companionStorage.save(next)
      return next
    })
  }, [])

  const checkConnection = useCallback(async (): Promise<boolean> => {
    const status = await bridge.checkStatus()
    const ok = status !== null
    setConnected(ok)
    setLastError(ok ? null : bridge.lastError)
    return ok
  }, [bridge])

  const sendAdvisory = useCallback(
    async (advisory: Advisory): Promise<boolean> => {
      if (!settings.enabled) return false
      if (advisory.confidence < settings.minConfidence) return false

      const result = await bridge.sendAdvisory(advisory)
      setConnected(bridge.connected)
      setLastError(bridge.lastError)
      return result.accepted
    },
    [bridge, settings.enabled, settings.minConfidence],
  )

  const regenerateCode = useCallback(() => {
    const newCode = generatePairingCode()
    updateSettings({ pairingCode: newCode })
  }, [updateSettings])

  // Check connection on enable
  useEffect(() => {
    if (settings.enabled) {
      checkConnection()
    } else {
      setConnected(false)
      setLastError(null)
    }
  }, [settings.enabled, checkConnection])

  return {
    settings,
    updateSettings,
    connected,
    lastError,
    sendAdvisory,
    checkConnection,
    regenerateCode,
  }
}

export { DEFAULT_COMPANION_SETTINGS }
