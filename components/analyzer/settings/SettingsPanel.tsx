'use client'

import React, { memo, useCallback, useState, useEffect } from 'react'
import { BarChart3, Monitor, RotateCcw, Download, FileJson } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ResetConfirmDialog } from '../ResetConfirmDialog'
import { SoundTab } from './SoundTab'
import { DisplayTab } from './DisplayTab'
import type { DetectorSettings, OperationMode } from '@/types/advisory'
import type { CalibrationTabProps } from './CalibrationTab'
import type { AdvancedTabProps } from './AdvancedTab'
import { presetStorage, customDefaultsStorage } from '@/lib/storage/dwaStorage'

// ── Types ────────────────────────────────────────────────────────────────────

/** Data collection props forwarded to SoundTab > Advanced section */
export type DataCollectionTabProps = Pick<AdvancedTabProps, 'consentStatus' | 'isCollecting' | 'onEnableCollection' | 'onDisableCollection'>

type SettingsTab = 'sound' | 'display'

export interface SettingsPanelProps {
  settings: DetectorSettings
  onModeChange: (mode: OperationMode) => void
  onSettingsChange: (settings: Partial<DetectorSettings>) => void
  onReset: () => void
  calibration?: Omit<CalibrationTabProps, 'settings' | 'onSettingsChange'>
  dataCollection?: DataCollectionTabProps
}

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_CUSTOM_PRESETS = 5

/**
 * Keys captured by custom presets — excludes display/graph/room/canvas settings.
 */
const PRESET_KEYS = [
  'feedbackThresholdDb', 'ringThresholdDb', 'growthRateThreshold',
  'sustainMs', 'clearMs', 'holdTimeMs', 'confidenceThreshold',
  'minFrequency', 'maxFrequency', 'eqPreset', 'aWeightingEnabled',
  'harmonicFilterEnabled', 'musicAware', 'autoMusicAware',
  'algorithmMode', 'enabledAlgorithms', 'prominenceDb',
] as const satisfies readonly (keyof DetectorSettings)[]

const TABS: { id: SettingsTab; label: string; Icon: typeof BarChart3 }[] = [
  { id: 'sound', label: 'Sound', Icon: BarChart3 },
  { id: 'display', label: 'Display', Icon: Monitor },
]

// ── SettingsPanel ────────────────────────────────────────────────────────────

export const SettingsPanel = memo(function SettingsPanel({
  settings,
  onModeChange,
  onSettingsChange,
  onReset,
  calibration,
  dataCollection,
}: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('sound')

  // ── Custom preset state ──────────────────────────────────────────────
  const [customPresets, setCustomPresets] = useState(() => {
    try { return presetStorage.load() } catch { return [] }
  })
  const [presetName, setPresetName] = useState('')
  const [showSaveInput, setShowSaveInput] = useState(false)

  const handleSavePreset = useCallback(() => {
    const name = presetName.trim()
    if (!name) return
    const snap = Object.fromEntries(
      PRESET_KEYS.map(key => [key, settings[key]])
    ) as Partial<DetectorSettings>
    const updated = [...customPresets.filter(p => p.name !== name), { name, settings: snap }].slice(-MAX_CUSTOM_PRESETS)
    setCustomPresets(updated)
    try { presetStorage.save(updated) } catch { /* quota exceeded */ }
    setPresetName('')
    setShowSaveInput(false)
  }, [presetName, settings, customPresets])

  const handleDeletePreset = useCallback((name: string) => {
    const updated = customPresets.filter(p => p.name !== name)
    setCustomPresets(updated)
    try { presetStorage.save(updated) } catch { /* quota exceeded */ }
  }, [customPresets])

  const handleLoadPreset = useCallback((preset: { name: string; settings: Partial<DetectorSettings> }) => {
    onSettingsChange(preset.settings)
  }, [onSettingsChange])

  // ── Save/Load defaults ────────────────────────────────────────────────
  const [hasSavedDefaults, setHasSavedDefaults] = useState(false)

  useEffect(() => {
    const saved = customDefaultsStorage.load()
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time init from localStorage
    setHasSavedDefaults(saved !== null)
  }, [])

  const handleSaveAsDefaults = useCallback(() => {
    customDefaultsStorage.save(settings)
    setHasSavedDefaults(true)
  }, [settings])

  const handleLoadDefaults = useCallback(() => {
    const defaults = customDefaultsStorage.load()
    if (defaults) {
      // Backward compat: strip removed fields
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = defaults as any
      delete d.roomModesEnabled
      if (d.micCalibrationEnabled !== undefined) {
        d.micCalibrationProfile = d.micCalibrationEnabled ? 'ecm8000' : 'none'
        delete d.micCalibrationEnabled
      }
      if (!defaults.roomTreatment) defaults.roomTreatment = 'typical'
      if (!defaults.roomPreset) defaults.roomPreset = 'none'
      if (defaults.algorithmMode && defaults.algorithmMode !== 'auto' && defaults.algorithmMode !== 'custom') {
        const allAlgos = ['msd', 'phase', 'spectral', 'comb', 'ihr', 'ptmr'] as const
        const modeMap: Record<string, typeof allAlgos[number][]> = {
          msd: ['msd'], phase: ['phase'], combined: [...allAlgos], all: [...allAlgos],
        }
        defaults.enabledAlgorithms = modeMap[defaults.algorithmMode] ?? [...allAlgos]
        defaults.algorithmMode = 'custom'
      }
      onSettingsChange(defaults)
    }
  }, [onSettingsChange])

  return (
    <TooltipProvider delayDuration={400}>
      <div className="@container space-y-1.5">

        {/* ── 2-tab strip ────────────────────────────────────────── */}
        <div className="flex justify-center gap-0 border-b border-border -mx-1">
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              aria-label={label}
              className={`flex-1 min-h-12 flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-[0.08em] transition-all duration-200 border-b-2 cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 ${
                activeTab === id
                  ? 'text-[var(--console-amber)] border-[var(--console-amber)] bg-[var(--console-amber)]/5'
                  : 'text-muted-foreground border-transparent hover:text-foreground hover:bg-muted/30'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {/* ── Content ─────────────────────────────────────────────── */}

        {activeTab === 'sound' && (
          <SoundTab
            settings={settings}
            onSettingsChange={onSettingsChange}
            onModeChange={onModeChange}
            calibration={calibration}
            dataCollection={dataCollection}
            customPresets={customPresets}
            showSaveInput={showSaveInput}
            setShowSaveInput={setShowSaveInput}
            presetName={presetName}
            setPresetName={setPresetName}
            handleSavePreset={handleSavePreset}
            handleDeletePreset={handleDeletePreset}
            handleLoadPreset={handleLoadPreset}
          />
        )}

        {activeTab === 'display' && (
          <DisplayTab settings={settings} onSettingsChange={onSettingsChange} />
        )}

        {/* ── Footer: Reset / Save / Load ─────────────────────────── */}
        <div className="border-t border-border/40 pt-2 mt-2 space-y-1.5">
          <ResetConfirmDialog
            onConfirm={onReset}
            trigger={
              <Button variant="outline" size="sm" className="w-full h-8">
                <RotateCcw className="h-3 w-3 mr-1.5" />
                Reset Defaults
              </Button>
            }
          />
          <div className="flex gap-1.5">
            <Button variant="secondary" size="sm" className="flex-1 h-7 text-xs" onClick={handleSaveAsDefaults}>
              <Download className="h-3 w-3 mr-1" />
              Save
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="flex-1 h-7 text-xs"
              onClick={handleLoadDefaults}
              disabled={!hasSavedDefaults}
              title={hasSavedDefaults ? 'Load your saved defaults' : 'No saved defaults yet'}
            >
              <FileJson className="h-3 w-3 mr-1" />
              Load
            </Button>
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
})

// Re-export for backward compatibility
export { type DataCollectionTabProps as UnifiedControlsDataCollectionTabProps }
