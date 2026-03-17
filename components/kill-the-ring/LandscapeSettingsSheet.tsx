'use client'

import { memo } from 'react'
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Settings } from 'lucide-react'
import { UnifiedControls, type DataCollectionTabProps } from './UnifiedControls'
import type { DetectorSettings, OperationMode } from '@/types/advisory'
import type { CalibrationTabProps } from './settings/CalibrationTab'

interface LandscapeSettingsSheetProps {
  settings: DetectorSettings
  onSettingsChange: (s: Partial<DetectorSettings>) => void
  onModeChange: (mode: OperationMode) => void
  onReset: () => void
  calibration?: Omit<CalibrationTabProps, 'settings' | 'onSettingsChange'>
  dataCollection?: DataCollectionTabProps
}

export const LandscapeSettingsSheet = memo(function LandscapeSettingsSheet({
  settings,
  onSettingsChange,
  onModeChange,
  onReset,
  calibration,
  dataCollection,
}: LandscapeSettingsSheetProps) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 text-muted-foreground hover:text-foreground"
          aria-label="Settings"
        >
          <Settings className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[70vh] overflow-y-auto channel-strip pb-6">
        <SheetTitle className="sr-only">Settings</SheetTitle>
        <UnifiedControls
          settings={settings}
          onSettingsChange={onSettingsChange}
          onModeChange={onModeChange}
          onReset={onReset}
          calibration={calibration}
          dataCollection={dataCollection}
        />
      </SheetContent>
    </Sheet>
  )
})
