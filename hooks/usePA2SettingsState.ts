'use client'

import { useCallback, useMemo, useState } from 'react'
import { pa2Storage } from '@/lib/pa2/pa2Storage'
import type { Advisory } from '@/types/advisory'
import type { PA2Settings } from '@/types/pa2'
import type { UsePA2BridgeConfig } from '@/hooks/usePA2Bridge'

export interface PA2SettingsState {
  settings: PA2Settings
  updateSettings: (partial: Partial<PA2Settings>) => void
  isActive: boolean
  bridgeConfig: UsePA2BridgeConfig
}

export function createPA2BridgeConfig(
  settings: PA2Settings,
  advisories: readonly Advisory[],
): { isActive: boolean; bridgeConfig: UsePA2BridgeConfig } {
  const isActive = settings.enabled && settings.baseUrl.length > 0

  return {
    isActive,
    bridgeConfig: {
      baseUrl: settings.baseUrl,
      apiKey: settings.apiKey,
      pollIntervalMs: settings.pollIntervalMs,
      advisories: isActive ? advisories : [],
      autoSend: isActive ? settings.autoSend : 'off',
      autoSendMinConfidence: settings.autoSendMinConfidence,
      enabled: isActive,
      panicMuteEnabled: settings.panicMuteEnabled,
    },
  }
}

export function usePA2SettingsState(
  advisories: readonly Advisory[],
): PA2SettingsState {
  const [settings, setSettings] = useState<PA2Settings>(() => pa2Storage.load())

  const updateSettings = useCallback((partial: Partial<PA2Settings>) => {
    setSettings((previous) => {
      const next = { ...previous, ...partial }
      pa2Storage.save(next)
      return next
    })
  }, [])

  const { isActive, bridgeConfig } = useMemo(
    () => createPA2BridgeConfig(settings, advisories),
    [settings, advisories],
  )

  return {
    settings,
    updateSettings,
    isActive,
    bridgeConfig,
  }
}
