'use client'

import { useState, useEffect, memo } from 'react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ResetConfirmDialog } from './ResetConfirmDialog'
import { Settings, RotateCcw, BarChart3, Monitor, Download, FileJson, Ruler, Cpu, Wrench, Crosshair } from 'lucide-react'
import { DetectionTab } from './settings/DetectionTab'
import { AlgorithmsTab } from './settings/AlgorithmsTab'
import { DisplayTab } from './settings/DisplayTab'
import { AdvancedTab } from './settings/AdvancedTab'
import { RoomTab } from './settings/RoomTab'
import { CalibrationTab } from './settings/CalibrationTab'
import type { DetectorSettings, Algorithm, OperationMode, SpectrumData } from '@/types/advisory'
import type { CalibrationTabProps } from './settings/CalibrationTab'

interface SettingsPanelProps {
  settings: DetectorSettings
  onSettingsChange: (settings: Partial<DetectorSettings>) => void
  onModeChange: (mode: OperationMode) => void
  onReset: () => void
  calibration?: Omit<CalibrationTabProps, 'settings'>
}

export const SettingsPanel = memo(function SettingsPanel({
  settings,
  onSettingsChange,
  onModeChange,
  onReset,
  calibration,
}: SettingsPanelProps) {
  const [hasSavedDefaults, setHasSavedDefaults] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('ktr-custom-defaults')
    setHasSavedDefaults(!!saved)
  }, [])

  const handleSaveAsDefaults = () => {
    localStorage.setItem('ktr-custom-defaults', JSON.stringify(settings))
    setHasSavedDefaults(true)
  }

  const handleLoadDefaults = () => {
    const saved = localStorage.getItem('ktr-custom-defaults')
    if (saved) {
      try {
        const defaults = JSON.parse(saved)
        // Backward compat: strip removed fields, add new ones
        delete defaults.roomModesEnabled
        if (!defaults.roomTreatment) defaults.roomTreatment = 'typical'
        if (!defaults.roomPreset) defaults.roomPreset = 'none'
        // Migrate legacy algorithm modes to custom + enabledAlgorithms
        if (defaults.algorithmMode && defaults.algorithmMode !== 'auto' && defaults.algorithmMode !== 'custom') {
          const allAlgos: Algorithm[] = ['msd', 'phase', 'spectral', 'comb', 'ihr', 'ptmr']
          const modeMap: Record<string, Algorithm[]> = {
            msd: ['msd'],
            phase: ['phase'],
            combined: allAlgos,
            all: allAlgos,
          }
          defaults.enabledAlgorithms = modeMap[defaults.algorithmMode] ?? allAlgos
          defaults.algorithmMode = 'custom'
        }
        onSettingsChange(defaults)
      } catch {
        console.error('Failed to load saved defaults from localStorage')
      }
    }
  }

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9 sm:h-10 sm:w-10 text-muted-foreground hover:text-foreground" aria-label="Settings">
          <Settings className="size-5 sm:size-6" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="sm:max-w-7xl overflow-y-auto channel-strip">
        <SheetHeader>
          <SheetTitle className="text-lg flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Settings
          </SheetTitle>
          <SheetDescription className="text-sm">
            Detection, algorithms, display, room acoustics, and advanced tuning.
          </SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="detection" className="mt-4">
          <TabsList className={`grid w-full ${calibration ? 'grid-cols-6' : 'grid-cols-5'}`}>
            <TabsTrigger value="detection" className="flex-col gap-0.5 text-xs py-2">
              <BarChart3 className="w-4 h-4" />
              Detection
            </TabsTrigger>
            <TabsTrigger value="algorithms" className="flex-col gap-0.5 text-xs py-2">
              <Cpu className="w-4 h-4" />
              Algorithms
            </TabsTrigger>
            <TabsTrigger value="display" className="flex-col gap-0.5 text-xs py-2">
              <Monitor className="w-4 h-4" />
              Display
            </TabsTrigger>
            <TabsTrigger value="room" className="flex-col gap-0.5 text-xs py-2">
              <Ruler className="w-4 h-4" />
              Room
            </TabsTrigger>
            <TabsTrigger value="advanced" className="flex-col gap-0.5 text-xs py-2">
              <Wrench className="w-4 h-4" />
              Advanced
            </TabsTrigger>
            {calibration && (
              <TabsTrigger value="calibrate" className="flex-col gap-0.5 text-xs py-2">
                <Crosshair className="w-4 h-4" />
                Calibrate
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="detection">
            <DetectionTab settings={settings} onSettingsChange={onSettingsChange} onModeChange={onModeChange} />
          </TabsContent>

          <TabsContent value="algorithms">
            <AlgorithmsTab settings={settings} onSettingsChange={onSettingsChange} />
          </TabsContent>

          <TabsContent value="display">
            <DisplayTab settings={settings} onSettingsChange={onSettingsChange} />
          </TabsContent>

          <TabsContent value="room">
            <RoomTab settings={settings} onSettingsChange={onSettingsChange} />
          </TabsContent>

          <TabsContent value="advanced">
            <AdvancedTab settings={settings} onSettingsChange={onSettingsChange} />
          </TabsContent>

          {calibration && (
            <TabsContent value="calibrate">
              <CalibrationTab settings={settings} {...calibration} />
            </TabsContent>
          )}
        </Tabs>

        <div className="pt-3 mt-2 border-t border-border/40 panel-groove space-y-2">
          <ResetConfirmDialog
            onConfirm={onReset}
            trigger={
              <Button variant="outline" size="sm" className="w-full">
                <RotateCcw className="h-3.5 w-3.5 mr-2" />
                Reset to PA Defaults
              </Button>
            }
          />
          <p className="text-sm text-muted-foreground text-center font-mono">
            Restores Speech mode defaults for corporate/conference PA
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" className="flex-1" onClick={handleSaveAsDefaults}>
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Save as Default
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="flex-1"
              onClick={handleLoadDefaults}
              disabled={!hasSavedDefaults}
              title={hasSavedDefaults ? 'Load your saved defaults' : 'No saved defaults yet'}
            >
              <FileJson className="h-3.5 w-3.5 mr-1.5" />
              Load Saved
            </Button>
          </div>
          <p className="text-sm text-muted-foreground text-center font-mono">
            {hasSavedDefaults ? 'Saved defaults available' : 'Save current settings to reuse later'}
          </p>
        </div>
      </SheetContent>
    </Sheet>
  )
})
