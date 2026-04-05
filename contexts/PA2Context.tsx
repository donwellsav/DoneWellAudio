'use client'

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { usePA2Bridge } from '@/hooks/usePA2Bridge'
import type { UsePA2BridgeReturn } from '@/hooks/usePA2Bridge'
import type { PA2Settings } from '@/types/pa2'
import type { Advisory } from '@/types/advisory'
import { usePA2SettingsState } from '@/hooks/usePA2SettingsState'
import { NOOP_PA2_CONTEXT } from '@/contexts/pa2ContextDefaults'

export interface PA2ContextValue extends UsePA2BridgeReturn {
  settings: PA2Settings
  updateSettings(partial: Partial<PA2Settings>): void
}

const PA2Ctx = createContext<PA2ContextValue | null>(null)

export function usePA2(): PA2ContextValue {
  const ctx = useContext(PA2Ctx)
  return ctx ?? NOOP_PA2_CONTEXT
}

interface PA2ProviderProps {
  advisories: readonly Advisory[]
  children: ReactNode
}

export function PA2Provider({ advisories, children }: PA2ProviderProps) {
  const { settings, updateSettings, bridgeConfig } = usePA2SettingsState(advisories)
  const bridge = usePA2Bridge(bridgeConfig)

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
