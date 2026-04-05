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
import { SettingsPanel, type DataCollectionTabProps } from './settings/SettingsPanel'
import type { DetectorSettings } from '@/types/advisory'
import type { CalibrationTabProps } from './settings/CalibrationTab'

interface LandscapeSettingsSheetProps {
  settings: DetectorSettings
  calibration?: Omit<CalibrationTabProps, 'settings'>
  dataCollection?: DataCollectionTabProps
}

export const LandscapeSettingsSheet = memo(function LandscapeSettingsSheet({
  settings,
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
      <SheetContent side="bottom" className="max-h-[70vh] overflow-y-auto channel-strip amber-sidecar" style={{ paddingBottom: 'max(1.5rem, var(--safe-bottom))' }}>
        <SheetTitle className="sr-only">Settings</SheetTitle>
        <SettingsPanel
          settings={settings}
          calibration={calibration}
          dataCollection={dataCollection}
        />
      </SheetContent>
    </Sheet>
  )
})
