'use client'

import { useCallback, useMemo, useState } from 'react'
import { useSettings } from '@/contexts/SettingsContext'
import { useRigPresets } from '@/hooks/useRigPresets'
import { hasCustomGateOverrides } from '@/hooks/useAnalyzerLayoutState'
import type { SettingsTab } from '@/components/analyzer/settings/settingsPanelTypes'

interface UseSettingsPanelStateParams {
  activeTab?: SettingsTab
  onTabChange?: (tab: SettingsTab) => void
}

interface PresetOption {
  id: string
  name: string
}

interface UseSettingsPanelStateReturn {
  activeTab: SettingsTab
  setActiveTab: (tab: SettingsTab) => void
  customPresets: PresetOption[]
  canSavePreset: boolean
  showSaveInput: boolean
  setShowSaveInput: (value: boolean) => void
  presetName: string
  setPresetName: (value: string) => void
  handleSavePreset: () => void
  handleDeletePreset: (id: string) => void
  handleLoadPreset: (id: string) => void
  hasCustomGates: boolean
  updateDisplay: ReturnType<typeof useSettings>['updateDisplay']
  resetSettings: ReturnType<typeof useSettings>['resetSettings']
}

export function useSettingsPanelState({
  activeTab: controlledTab,
  onTabChange,
}: UseSettingsPanelStateParams): UseSettingsPanelStateReturn {
  const ctx = useSettings()

  const [internalTab, setInternalTab] = useState<SettingsTab>('live')
  const activeTab = controlledTab ?? internalTab
  const setActiveTab = useCallback((tab: SettingsTab) => {
    if (onTabChange) {
      onTabChange(tab)
      return
    }
    setInternalTab(tab)
  }, [onTabChange])

  const rigPresets = useRigPresets(ctx.session, {
    setMode: ctx.setMode,
    setEnvironment: ctx.setEnvironment,
    updateLiveOverrides: ctx.updateLiveOverrides,
    updateDiagnostics: ctx.updateDiagnostics,
  })

  const customPresets = useMemo<PresetOption[]>(() => (
    rigPresets.presets.map((preset) => ({
      id: preset.id,
      name: preset.name,
    }))
  ), [rigPresets.presets])

  const [presetName, setPresetName] = useState('')
  const [showSaveInput, setShowSaveInput] = useState(false)

  const handleSavePreset = useCallback(() => {
    const name = presetName.trim()
    if (!name) return

    rigPresets.savePreset(name)
    setPresetName('')
    setShowSaveInput(false)
  }, [presetName, rigPresets])

  const handleDeletePreset = useCallback((id: string) => {
    rigPresets.deletePreset(id)
  }, [rigPresets])

  const handleLoadPreset = useCallback((id: string) => {
    rigPresets.loadPreset(id)
  }, [rigPresets])

  return {
    activeTab,
    setActiveTab,
    customPresets,
    canSavePreset: rigPresets.canSave,
    showSaveInput,
    setShowSaveInput,
    presetName,
    setPresetName,
    handleSavePreset,
    handleDeletePreset,
    handleLoadPreset,
    hasCustomGates: hasCustomGateOverrides(ctx.session),
    updateDisplay: ctx.updateDisplay,
    resetSettings: ctx.resetSettings,
  }
}
