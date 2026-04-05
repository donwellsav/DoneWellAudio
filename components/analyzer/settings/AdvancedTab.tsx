'use client'

import { memo } from 'react'
import { SettingsGrid } from './SettingsShared'
import {
  AdvancedAlgorithmsSection,
  AdvancedCompanionSection,
  AdvancedDataCollectionSection,
  AdvancedDetectionPolicySection,
  AdvancedDspSection,
  AdvancedFaderLinkSection,
  AdvancedNoiseFloorSection,
  AdvancedPeakDetectionSection,
  AdvancedTimingSection,
  AdvancedTrackManagementSection,
} from './AdvancedTabSections'
import { useAdvancedTabState } from '@/hooks/useAdvancedTabState'
import type { DetectorSettings } from '@/types/advisory'
import type { ConsentStatus } from '@/types/data'

export interface AdvancedTabProps {
  settings: DetectorSettings
  consentStatus?: ConsentStatus
  isCollecting?: boolean
  onEnableCollection?: () => void
  onDisableCollection?: () => void
}

export const AdvancedTab = memo(function AdvancedTab({
  settings,
  consentStatus,
  isCollecting,
  onEnableCollection,
  onDisableCollection,
}: AdvancedTabProps) {
  const actions = useAdvancedTabState({
    settings,
    onEnableCollection,
    onDisableCollection,
  })

  return (
    <div className="space-y-1">
      <SettingsGrid>
        <AdvancedFaderLinkSection settings={settings} actions={actions} />
        <AdvancedDetectionPolicySection settings={settings} actions={actions} />
        <AdvancedTimingSection settings={settings} actions={actions} />
        <AdvancedAlgorithmsSection settings={settings} actions={actions} />
        <AdvancedNoiseFloorSection settings={settings} actions={actions} />
        <AdvancedPeakDetectionSection settings={settings} actions={actions} />
        <AdvancedTrackManagementSection settings={settings} actions={actions} />
        <AdvancedDspSection settings={settings} actions={actions} />
        {consentStatus !== undefined ? (
          <AdvancedDataCollectionSection
            consentStatus={consentStatus}
            isCollecting={isCollecting}
            showTooltips={settings.showTooltips}
            handleCollectionToggle={actions.handleCollectionToggle}
          />
        ) : null}
        <AdvancedCompanionSection showTooltips={settings.showTooltips} />
      </SettingsGrid>
    </div>
  )
})
