'use client'

import { memo } from 'react'
import { PA2BridgeAutomationControls } from '@/components/analyzer/settings/PA2BridgeAutomationControls'
import { PA2BridgeConnectionFields } from '@/components/analyzer/settings/PA2BridgeConnectionFields'
import { PA2BridgeStatus } from '@/components/analyzer/settings/PA2BridgeStatus'
import { ChannelSection } from '@/components/ui/channel-section'
import { usePA2 } from '@/contexts/PA2Context'
import { usePA2BridgeSectionState } from '@/hooks/usePA2BridgeSectionState'

export const PA2BridgeSection = memo(function PA2BridgeSection() {
  const pa2 = usePA2()
  const {
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
  } = usePA2BridgeSectionState(pa2)

  return (
    <ChannelSection title="PA2 Bridge">
      <div className="space-y-3">
        <PA2BridgeConnectionFields
          settings={pa2.settings}
          onEnabledChange={handleEnabledChange}
          onCompanionIpChange={handleCompanionIpChange}
          onCompanionPortChange={handleCompanionPortChange}
          onInstanceLabelChange={handleInstanceLabelChange}
          onApplyQuickTarget={applyQuickTarget}
        />

        <PA2BridgeStatus
          autoSend={pa2.settings.autoSend}
          autoSendSummary={autoSendSummary}
          baseUrl={pa2.settings.baseUrl}
          enabled={pa2.settings.enabled}
          status={pa2.status}
          statusSummary={statusSummary}
          onTestNotch={handleTestNotch}
        />

        <PA2BridgeAutomationControls
          effectiveConfidence={pa2.effectiveConfidence}
          onAutoSendChange={handleAutoSendChange}
          onToggleSetting={handleToggleSetting}
          settings={pa2.settings}
          updateSettings={pa2.updateSettings}
        />
      </div>
    </ChannelSection>
  )
})
