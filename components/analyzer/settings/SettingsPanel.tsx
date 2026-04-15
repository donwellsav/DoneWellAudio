'use client'

import { memo } from 'react'
import { Zap, Wrench, Monitor, FlaskConical, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as SettingsTab)}
        className="@container gap-1.5"
      >
        {!controlledTab && (
          <TabsList
            aria-label="Settings tabs"
            className="mb-2 grid h-auto w-full grid-cols-4 gap-1 border-0 bg-transparent p-0"
          >
            {SETTINGS_TABS.map(({ id, label, shortLabel, Icon }) => (
              <TabsTrigger
                key={id}
                value={id}
                className="min-h-9 gap-1 rounded border border-transparent py-2 text-[10px] uppercase tracking-wider text-muted-foreground shadow-none hover:text-foreground data-[state=active]:border-[rgba(var(--tint-r),var(--tint-g),var(--tint-b),0.30)] data-[state=active]:bg-[rgba(var(--tint-r),var(--tint-g),var(--tint-b),0.15)] data-[state=active]:text-[var(--console-amber)]"
              >
                <Icon className="h-3 w-3" />
                {shortLabel ?? label}
                {id === 'advanced' && hasCustomGates && (
                  <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[var(--console-amber)]" />
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        )}

        <TabsContent value="live" className="tab-content-fade mt-0">
          <LiveTab settings={settings} />
        </TabsContent>

        <TabsContent value="setup" className="tab-content-fade mt-0">
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
        </TabsContent>

        <TabsContent value="display" className="tab-content-fade mt-0">
          <DisplayTab settings={settings} updateDisplay={updateDisplay} />
        </TabsContent>

        <TabsContent value="advanced" className="tab-content-fade mt-0">
          <AdvancedTab
            settings={settings}
            {...(dataCollection ?? {})}
          />
        </TabsContent>

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
      </Tabs>
    </TooltipProvider>
  )
})

export { type DataCollectionTabProps as UnifiedControlsDataCollectionTabProps }
export type { SettingsTab }
