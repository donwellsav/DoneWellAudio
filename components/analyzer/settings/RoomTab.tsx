'use client'

import { memo } from 'react'
import type { DetectorSettings } from '@/types/advisory'
import type { EnvironmentSelection, RoomTemplateId } from '@/types/settings'
import { useRoomTabState } from '@/hooks/useRoomTabState'
import { AutoDetectRoomSection } from './room/AutoDetectRoomSection'
import { MeasurementInterpretationSection } from './room/MeasurementInterpretationSection'
import { RoomPhysicsSection } from './room/RoomPhysicsSection'

interface RoomTabProps {
  settings: DetectorSettings
  setEnvironment: (env: Partial<EnvironmentSelection> & { templateId?: RoomTemplateId | string }) => void
}

export const RoomTab = memo(function RoomTab({
  settings,
  setEnvironment,
}: RoomTabProps) {
  const {
    setRoomPreset,
    setDisplayUnit,
    updateDimension,
    setTreatment,
    applyMeasuredEstimate,
  } = useRoomTabState({
    settings,
    setEnvironment,
  })

  return (
    <div className="mt-4 space-y-4">
      <RoomPhysicsSection
        settings={settings}
        setRoomPreset={setRoomPreset}
        setDisplayUnit={setDisplayUnit}
        updateDimension={updateDimension}
        setTreatment={setTreatment}
      />

      <AutoDetectRoomSection
        showTooltips={settings.showTooltips}
        unit={settings.roomDimensionsUnit ?? 'feet'}
        onApplyEstimate={applyMeasuredEstimate}
      />

      <MeasurementInterpretationSection settings={settings} />
    </div>
  )
})
