'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Advisory } from '@/types/advisory'
import type { CompanionSettings } from '@/types/companion'
import { DEFAULT_COMPANION_SETTINGS } from '@/types/companion'
import { companionStorage } from '@/lib/companion/companionStorage'
import { CompanionBridge } from '@/lib/companion/companionBridge'

interface UseCompanionReturn {
  /** Current companion settings */
  settings: CompanionSettings
  /** Update settings (partial merge, auto-persists) */
  updateSettings: (partial: Partial<CompanionSettings>) => void
  /** Whether Companion module is currently reachable */
  connected: boolean
  /** Last error message, or null */
  lastError: string | null
  /** Send a single advisory to Companion. Returns true if accepted. */
  sendAdvisory: (advisory: Advisory) => Promise<boolean>
  /** Check Companion connection (called automatically on enable) */
  checkConnection: () => Promise<boolean>
}

export function useCompanion(): UseCompanionReturn {
  const [settings, setSettings] = useState<CompanionSettings>(() =>
    companionStorage.load(),
  )
  const [connected, setConnected] = useState(false)
  const [lastError, setLastError] = useState<string | null>(null)

  const bridgeRef = useRef<CompanionBridge | null>(null)

  // Create/update bridge when settings change
  const bridge = useMemo(() => {
    if (!bridgeRef.current) {
      bridgeRef.current = new CompanionBridge(settings.url, settings.instanceName)
    } else {
      bridgeRef.current.configure(settings.url, settings.instanceName)
    }
    return bridgeRef.current
  }, [settings.url, settings.instanceName])

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
  }
}

export { DEFAULT_COMPANION_SETTINGS }
