'use client'

import { useCallback, useMemo } from 'react'
import type { PA2ContextValue } from '@/contexts/PA2Context'
import { buildCompanionSettingsUpdate, getPA2AutoSendSummary, getPA2StatusSummary, sanitizeCompanionIp } from '@/components/analyzer/settings/pa2BridgeSectionUtils'
import type { PA2AutoSendMode, PA2Settings } from '@/types/pa2'

type PA2BridgeSectionContext = Pick<
  PA2ContextValue,
  | 'settings'
  | 'status'
  | 'pa2Connected'
  | 'notchSlotsUsed'
  | 'notchSlotsAvailable'
  | 'error'
  | 'lastAutoSendError'
  | 'lastAutoSendResult'
  | 'autoSendDiag'
  | 'effectiveConfidence'
  | 'client'
  | 'updateSettings'
>

export function usePA2BridgeSectionState(pa2: PA2BridgeSectionContext) {
  const handleEnabledChange = useCallback((enabled: boolean) => {
    const update: Partial<PA2Settings> = { enabled }
    if (enabled && pa2.settings.autoSend === 'off') {
      update.autoSend = 'both'
    }
    pa2.updateSettings(update)
  }, [pa2])

  const updateCompanionSettings = useCallback(
    (partial: Partial<Pick<PA2Settings, 'companionIp' | 'companionPort' | 'instanceLabel'>>) => {
      pa2.updateSettings(
        buildCompanionSettingsUpdate(
          {
            companionIp: pa2.settings.companionIp,
            companionPort: pa2.settings.companionPort,
            instanceLabel: pa2.settings.instanceLabel,
          },
          partial,
        ),
      )
    },
    [pa2],
  )

  const handleCompanionIpChange = useCallback((raw: string) => {
    updateCompanionSettings({ companionIp: sanitizeCompanionIp(raw) })
  }, [updateCompanionSettings])

  const handleCompanionPortChange = useCallback((raw: string) => {
    const parsed = parseInt(raw, 10)
    const companionPort = Number.isFinite(parsed) && parsed > 0 ? parsed : 8000
    updateCompanionSettings({ companionPort })
  }, [updateCompanionSettings])

  const handleInstanceLabelChange = useCallback((instanceLabel: string) => {
    updateCompanionSettings({ instanceLabel })
  }, [updateCompanionSettings])

  const applyQuickTarget = useCallback((companionIp: string) => {
    pa2.updateSettings(
      buildCompanionSettingsUpdate(
        {
          companionIp,
          companionPort: 8000,
          instanceLabel: 'PA2',
        },
        {},
      ),
    )
  }, [pa2])

  const handleAutoSendChange = useCallback((autoSend: PA2AutoSendMode) => {
    pa2.updateSettings({ autoSend })
  }, [pa2])

  const handleToggleSetting = useCallback(
    <K extends 'ringOutAutoSend' | 'panicMuteEnabled' | 'modeSyncEnabled'>(key: K, value: PA2Settings[K]) => {
      pa2.updateSettings({ [key]: value })
    },
    [pa2],
  )

  const handleTestNotch = useCallback(async () => {
    try {
      await pa2.client?.detect({
        frequencies: [{ hz: 2500, confidence: 0.99, type: 'feedback', q: 10 }],
        source: 'donewellaudio-test',
      })
    } catch {
      // Status line already shows failures.
    }
  }, [pa2])

  const statusSummary = useMemo(
    () =>
      getPA2StatusSummary({
        status: pa2.status,
        pa2Connected: pa2.pa2Connected,
        notchSlotsUsed: pa2.notchSlotsUsed,
        notchSlotsAvailable: pa2.notchSlotsAvailable,
        error: pa2.error,
      }),
    [pa2.error, pa2.notchSlotsAvailable, pa2.notchSlotsUsed, pa2.pa2Connected, pa2.status],
  )

  const autoSendSummary = useMemo(
    () =>
      getPA2AutoSendSummary({
        pa2Connected: pa2.pa2Connected,
        lastAutoSendError: pa2.lastAutoSendError,
        lastAutoSendResult: pa2.lastAutoSendResult,
        autoSendDiag: pa2.autoSendDiag,
        effectiveConfidence: pa2.effectiveConfidence,
        configuredConfidence: pa2.settings.autoSendMinConfidence,
        now: Date.now(),
      }),
    [
      pa2.autoSendDiag,
      pa2.effectiveConfidence,
      pa2.lastAutoSendError,
      pa2.lastAutoSendResult,
      pa2.pa2Connected,
      pa2.settings.autoSendMinConfidence,
    ],
  )

  return {
    handleEnabledChange,
    handleCompanionIpChange,
    handleCompanionPortChange,
    handleInstanceLabelChange,
    applyQuickTarget,
    handleAutoSendChange,
    handleToggleSetting,
    handleTestNotch,
    statusSummary,
    autoSendSummary,
  }
}
