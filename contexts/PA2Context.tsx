'use client'

import { createContext, useContext, useCallback, useState, useMemo, type ReactNode } from 'react'
import { usePA2Bridge } from '@/hooks/usePA2Bridge'
import type { UsePA2BridgeReturn } from '@/hooks/usePA2Bridge'
import type { PA2Settings } from '@/types/pa2'
import { DEFAULT_PA2_SETTINGS } from '@/types/pa2'
import { pa2Storage } from '@/lib/pa2/pa2Storage'
import type { Advisory } from '@/types/advisory'

// ── Context Value ──────────────────────────────────────────────────────────

export interface PA2ContextValue extends UsePA2BridgeReturn {
  /** Current PA2 settings */
  settings: PA2Settings
  /** Update PA2 settings (partial merge, auto-persists) */
  updateSettings(partial: Partial<PA2Settings>): void
}

const PA2Ctx = createContext<PA2ContextValue | null>(null)

// ── Hook ───────────────────────────────────────────────────────────────────

const NOOP_ASYNC = async () => {}
const NOOP_BRIDGE: PA2ContextValue = {
  status: 'disconnected',
  pa2Connected: false,
  lastPollTimestamp: 0,
  rta: [],
  geq: null,
  meters: null,
  mutes: null,
  error: null,
  notchSlotsUsed: 0,
  notchSlotsAvailable: 0,
  lastAutoSendResult: null,
  lastAutoSendError: null,
  autoSendDiag: null,
  effectiveConfidence: 0,
  sendCorrections: NOOP_ASYNC,
  sendDetections: NOOP_ASYNC,
  flattenGEQ: NOOP_ASYNC,
  autoEQ: NOOP_ASYNC,
  sendAction: NOOP_ASYNC,
  clearNotches: NOOP_ASYNC,
  client: null,
  settings: DEFAULT_PA2_SETTINGS,
  updateSettings: () => {},
}

export function usePA2(): PA2ContextValue {
  const ctx = useContext(PA2Ctx)
  return ctx ?? NOOP_BRIDGE
}

// ── Provider ───────────────────────────────────────────────────────────────

interface PA2ProviderProps {
  advisories: readonly Advisory[]
  children: ReactNode
}

export function PA2Provider({ advisories, children }: PA2ProviderProps) {
  const [settings, setSettings] = useState<PA2Settings>(() => pa2Storage.load())

  const updateSettings = useCallback((partial: Partial<PA2Settings>) => {
    setSettings(prev => {
      const next = { ...prev, ...partial }
      pa2Storage.save(next)
      return next
    })
  }, [])

  const isActive = settings.enabled && !!settings.baseUrl

  const bridge = usePA2Bridge({
    baseUrl: settings.baseUrl,
    apiKey: settings.apiKey,
    pollIntervalMs: settings.pollIntervalMs,
    advisories: isActive ? advisories : [],
    autoSend: isActive ? settings.autoSend : 'off',
    autoSendMinConfidence: settings.autoSendMinConfidence,
    enabled: isActive,
    panicMuteEnabled: settings.panicMuteEnabled,
  })

  const value = useMemo<PA2ContextValue>(() => ({
    ...bridge,
    settings,
    updateSettings,
  }), [bridge, settings, updateSettings])

  return (
    <PA2Ctx.Provider value={value}>
      {children}
    </PA2Ctx.Provider>
  )
}

export { PA2Ctx as PA2Context }
