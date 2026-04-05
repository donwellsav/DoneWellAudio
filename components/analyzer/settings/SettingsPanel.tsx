'use client'

import { memo } from 'react'
import { Zap, Wrench, Monitor, FlaskConical, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ResetConfirmDialog } from '../ResetConfirmDialog'
import { LiveTab } from './LiveTab'
import { SetupTab } from './SetupTab'
import { DisplayTab } from './DisplayTab'
import { AdvancedTab } from './AdvancedTab'
import { useSettingsPanelState } from '@/hooks/useSettingsPanelState'
import type { DetectorSettings } from '@/types/advisory'
import type { CalibrationTabProps } from './CalibrationTab'
import type { AdvancedTabProps } from './AdvancedTab'
import type { SettingsTab } from './settingsPanelTypes'

export type DataCollectionTabProps = Pick<AdvancedTabProps, 'consentStatus' | 'isCollecting' | 'onEnableCollection' | 'onDisableCollection'>

export interface SettingsPanelProps {
  settings: DetectorSettings
  calibration?: Omit<CalibrationTabProps, 'settings'>
  dataCollection?: DataCollectionTabProps
  activeTab?: SettingsTab
  onTabChange?: (tab: SettingsTab) => void
}

export const SETTINGS_TABS: { id: SettingsTab; label: string; shortLabel?: string; Icon: typeof Zap }[] = [
  { id: 'live', label: 'Live', Icon: Zap },
  { id: 'setup', label: 'Setup', Icon: Wrench },
  { id: 'display', label: 'Display', Icon: Monitor },
  { id: 'advanced', label: 'Advanced', shortLabel: 'Adv', Icon: FlaskConical },
]

export const SettingsPanel = memo(function SettingsPanel({
  settings,
  calibration,
  dataCollection,
  activeTab: controlledTab,
  onTabChange,
}: SettingsPanelProps) {
  const {
    activeTab,
    setActiveTab,
    customPresets,
    canSavePreset,
    showSaveInput,
    setShowSaveInput,
    presetName,
    setPresetName,
    handleSavePreset,
    handleDeletePreset,
    handleLoadPreset,
    hasCustomGates,
    updateDisplay,
    resetSettings,
  } = useSettingsPanelState({
    activeTab: controlledTab,
    onTabChange,
  })

  return (
    <TooltipProvider delayDuration={400}>
      <div className="@container space-y-1.5">
        {!controlledTab && (
          <div className="flex gap-1 mb-2" role="tablist" aria-label="Settings tabs">
            {SETTINGS_TABS.map(({ id, label, shortLabel, Icon }) => (
              <button
                key={id}
                role="tab"
                aria-selected={activeTab === id}
                onClick={() => setActiveTab(id)}
                className={`flex-1 flex items-center justify-center gap-1 py-2 rounded text-[10px] font-mono font-bold uppercase tracking-wider transition-colors cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 ${
                  activeTab === id
                    ? 'bg-[var(--console-amber)]/15 text-[var(--console-amber)] border border-[var(--console-amber)]/30'
                    : 'text-muted-foreground hover:text-foreground border border-transparent'
                }`}
              >
                <Icon className="w-3 h-3" />
                {shortLabel ?? label}
                {id === 'advanced' && hasCustomGates && (
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--console-amber)]" />
                )}
              </button>
            ))}
          </div>
        )}

        <div key={activeTab} className="tab-content-fade">
          {activeTab === 'live' && <LiveTab settings={settings} />}

          {activeTab === 'setup' && (
            <SetupTab
              settings={settings}
              calibration={calibration}
              customPresets={customPresets}
              canSavePreset={canSavePreset}
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
            <DisplayTab settings={settings} updateDisplay={updateDisplay} />
          )}

          {activeTab === 'advanced' && (
            <AdvancedTab
              settings={settings}
              {...(dataCollection ?? {})}
            />
          )}
        </div>

        <div className="panel-groove pt-2 mt-2">
          <ResetConfirmDialog
            onConfirm={resetSettings}
            trigger={(
              <Button variant="ghost" size="sm" className="w-full h-7 text-muted-foreground/50 hover:text-muted-foreground text-xs">
                <RotateCcw className="h-3 w-3 mr-1.5" />
                Reset Defaults
              </Button>
            )}
          />
        </div>
      </div>
    </TooltipProvider>
  )
})

export { type DataCollectionTabProps as UnifiedControlsDataCollectionTabProps }
export type { SettingsTab }
