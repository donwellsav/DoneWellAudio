'use client'

import { memo, useMemo, useState } from 'react'
import { InputMeterSlider } from '@/components/analyzer/InputMeterSlider'
import { haptic } from '@/components/analyzer/MobileLayoutCommon'
import {
  MobileBottomNav,
  MobileFullscreenOverlay,
  MobileIssuesContent,
  MobileLandscapeLayout,
  MobilePortraitLayout,
} from '@/components/analyzer/MobileLayoutSections'
import { MobileSidecarFader } from '@/components/analyzer/MobileSidecarFader'
import { SettingsPanel, type DataCollectionTabProps } from '@/components/analyzer/settings/SettingsPanel'
import type { CalibrationTabProps } from '@/components/analyzer/settings/CalibrationTab'
import { useUI } from '@/contexts/UIContext'
import { useAnalyzerLayoutState } from '@/hooks/useAnalyzerLayoutState'
import { useMobileFaderState } from '@/hooks/useMobileFaderState'
import { useMobileGraphState } from '@/hooks/useMobileGraphState'
import { useMobileTabNavigation } from '@/hooks/useMobileTabNavigation'
import { MOBILE_MAX_DISPLAYED_ISSUES } from '@/lib/dsp/constants'

interface MobileLayoutProps {
  calibration?: Omit<CalibrationTabProps, 'settings'>
  dataCollection?: DataCollectionTabProps
  isWizardActive?: boolean
  onStartWizard?: () => void
  onFinishWizard?: () => void
  onStartRingOut?: () => void
}

export const MobileLayout = memo(function MobileLayout({
  calibration,
  dataCollection,
  isWizardActive,
  onFinishWizard,
  onStartRingOut,
}: MobileLayoutProps) {
  const {
    isRunning,
    settings,
    handleFreqRangeChange,
    setInputGain,
    setAutoGain,
    spectrumRef,
    inputLevel,
    isAutoGain,
    autoGainDb,
    autoGainLocked,
    noiseFloorDb,
    handleThresholdChange,
    roomModes,
    spectrumDisplay,
    spectrumRange,
    spectrumLifecycle,
    spectrumLifecycleWithStart,
    issuesListBaseProps,
    advisories,
    activeAdvisoryCount,
    earlyWarning,
    onClearAll,
    onClearResolved,
    rtaClearedIds,
    geqClearedIds,
    hasActiveRTAMarkers,
    hasActiveGEQBars,
    onClearRTA,
    onClearGEQ,
  } = useAnalyzerLayoutState()

  const {
    isFrozen,
    toggleFreeze,
    mobileTab,
    setMobileTab,
    rtaContainerRef,
    isRtaFullscreen,
    toggleRtaFullscreen,
  } = useUI()

  const [landscapePanel, setLandscapePanel] = useState<'issues' | 'settings'>('issues')

  const {
    mobileFaderMode,
    mobileFaderValue,
    mobileGuidance,
    mobileFaderOnChange,
    toggleMobileFaderMode,
  } = useMobileFaderState({
    settings,
    isRunning,
    inputLevel,
    activeAdvisoryCount,
    isAutoGain,
    handleThresholdChange,
    setInputGain,
    setAutoGain,
  })

  const {
    inlineGraphMode,
    graphHeightVh,
    setInlineGraphMode,
    onGraphTouchStart,
    onGraphTouchEnd,
    onResizeStart,
    onResizeMove,
    onResizeEnd,
    nudgeGraphHeight,
  } = useMobileGraphState()

  const {
    tabIndex,
    tabRefs,
    handleTabKeyDown,
    onTouchStart,
    onTouchEnd,
  } = useMobileTabNavigation({
    mobileTab,
    setMobileTab,
  })

  const mobileAdvisories = useMemo(
    () => advisories.slice(0, MOBILE_MAX_DISPLAYED_ISSUES),
    [advisories],
  )

  const sharedSpectrumProps = useMemo(
    () => ({
      spectrumRef,
      advisories: mobileAdvisories,
      earlyWarning,
      isFrozen,
      roomModes,
      display: spectrumDisplay,
      range: spectrumRange,
      onFreqRangeChange: handleFreqRangeChange,
      onThresholdChange: handleThresholdChange,
    }),
    [
      earlyWarning,
      handleFreqRangeChange,
      handleThresholdChange,
      isFrozen,
      mobileAdvisories,
      roomModes,
      spectrumDisplay,
      spectrumRange,
      spectrumRef,
    ],
  )

  const portraitRtaProps = useMemo(
    () => ({
      ...sharedSpectrumProps,
      lifecycle: spectrumLifecycle,
      clearedIds: rtaClearedIds,
    }),
    [rtaClearedIds, sharedSpectrumProps, spectrumLifecycle],
  )

  const landscapeRtaProps = useMemo(
    () => ({
      ...sharedSpectrumProps,
      lifecycle: spectrumLifecycleWithStart,
      clearedIds: rtaClearedIds,
    }),
    [rtaClearedIds, sharedSpectrumProps, spectrumLifecycleWithStart],
  )

  const geqProps = useMemo(
    () => ({
      advisories: mobileAdvisories,
      graphFontSize: settings.graphFontSize,
      clearedIds: geqClearedIds,
      isRunning,
    }),
    [geqClearedIds, isRunning, mobileAdvisories, settings.graphFontSize],
  )

  const issuesContent = useMemo(
    () => (
      <MobileIssuesContent
        advisories={advisories}
        mobileAdvisories={mobileAdvisories}
        earlyWarning={earlyWarning}
        isRunning={isRunning}
        isWizardActive={isWizardActive}
        issuesListBaseProps={issuesListBaseProps}
        onClearAll={onClearAll}
        onClearResolved={onClearResolved}
        onFinishWizard={onFinishWizard}
        onStartRingOut={onStartRingOut}
        roomModes={roomModes}
      />
    ),
    [
      advisories,
      earlyWarning,
      isRunning,
      isWizardActive,
      issuesListBaseProps,
      mobileAdvisories,
      onClearAll,
      onClearResolved,
      onFinishWizard,
      onStartRingOut,
      roomModes,
    ],
  )

  const portraitSettingsContent = useMemo(
    () => (
      <>
        <section className="rounded-lg border border-border/40 bg-card/30 p-3">
          <h3 className="section-label mb-2">Input Gain</h3>
          <InputMeterSlider
            value={settings.inputGainDb}
            onChange={(value) => setInputGain(value)}
            level={inputLevel}
            fullWidth
            autoGainEnabled={isAutoGain}
            autoGainDb={autoGainDb}
            autoGainLocked={autoGainLocked}
            onAutoGainToggle={(enabled) => setAutoGain(enabled)}
          />
        </section>
        <div className="rounded-lg border border-border/40 bg-card/30 p-3">
          <SettingsPanel
            settings={settings}
            calibration={calibration}
            dataCollection={dataCollection}
          />
        </div>
      </>
    ),
    [
      autoGainDb,
      autoGainLocked,
      calibration,
      dataCollection,
      inputLevel,
      isAutoGain,
      setAutoGain,
      setInputGain,
      settings,
    ],
  )

  const landscapeSettingsContent = useMemo(
    () => (
      <div className="space-y-2">
        <section className="rounded border border-border/40 bg-card/30 p-2">
          <h3 className="section-label mb-1 text-dwa-sm">Input Gain</h3>
          <InputMeterSlider
            value={settings.inputGainDb}
            onChange={(value) => setInputGain(value)}
            level={inputLevel}
            fullWidth
            compact
            autoGainEnabled={isAutoGain}
            autoGainDb={autoGainDb}
            autoGainLocked={autoGainLocked}
            onAutoGainToggle={(enabled) => setAutoGain(enabled)}
          />
        </section>
        <div className="rounded border border-border/40 bg-card/30 p-2">
          <SettingsPanel
            settings={settings}
            calibration={calibration}
            dataCollection={dataCollection}
          />
        </div>
      </div>
    ),
    [
      autoGainDb,
      autoGainLocked,
      calibration,
      dataCollection,
      inputLevel,
      isAutoGain,
      setAutoGain,
      setInputGain,
      settings,
    ],
  )

  const portraitSidecarFader = useMemo(
    () => (
      <MobileSidecarFader
        mobileFaderMode={mobileFaderMode}
        mobileFaderValue={mobileFaderValue}
        mobileFaderOnChange={mobileFaderOnChange}
        toggleMobileFaderMode={() => {
          haptic()
          toggleMobileFaderMode()
        }}
        inputLevel={inputLevel}
        isAutoGain={isAutoGain}
        autoGainDb={autoGainDb}
        autoGainLocked={autoGainLocked}
        setAutoGain={setAutoGain}
        noiseFloorDb={noiseFloorDb}
        mobileGuidance={mobileGuidance}
      />
    ),
    [
      autoGainDb,
      autoGainLocked,
      inputLevel,
      isAutoGain,
      mobileFaderMode,
      mobileFaderOnChange,
      mobileFaderValue,
      mobileGuidance,
      noiseFloorDb,
      setAutoGain,
      toggleMobileFaderMode,
    ],
  )

  const landscapeSidecarFader = useMemo(
    () => (
      <MobileSidecarFader
        mobileFaderMode={mobileFaderMode}
        mobileFaderValue={mobileFaderValue}
        mobileFaderOnChange={mobileFaderOnChange}
        toggleMobileFaderMode={() => {
          haptic()
          toggleMobileFaderMode()
        }}
        inputLevel={inputLevel}
        isAutoGain={isAutoGain}
        autoGainDb={autoGainDb}
        autoGainLocked={autoGainLocked}
        setAutoGain={setAutoGain}
        noiseFloorDb={noiseFloorDb}
        mobileGuidance={mobileGuidance}
        compact
      />
    ),
    [
      autoGainDb,
      autoGainLocked,
      inputLevel,
      isAutoGain,
      mobileFaderMode,
      mobileFaderOnChange,
      mobileFaderValue,
      mobileGuidance,
      noiseFloorDb,
      setAutoGain,
      toggleMobileFaderMode,
    ],
  )

  return (
    <>
      <MobilePortraitLayout
        graphHeightVh={graphHeightVh}
        geqProps={geqProps}
        inlineGraphMode={inlineGraphMode}
        issuesContent={issuesContent}
        mobileTab={mobileTab}
        onGraphTouchEnd={onGraphTouchEnd}
        onGraphTouchStart={onGraphTouchStart}
        onResizeEnd={onResizeEnd}
        onResizeMove={onResizeMove}
        onResizeStart={onResizeStart}
        onTouchEnd={onTouchEnd}
        onTouchStart={onTouchStart}
        portraitRtaProps={portraitRtaProps}
        rtaContainerRef={rtaContainerRef}
        settingsContent={portraitSettingsContent}
        settingsRtaProps={portraitRtaProps}
        setInlineGraphMode={setInlineGraphMode}
        sidecarFader={portraitSidecarFader}
        tabIndex={tabIndex}
        toggleRtaFullscreen={toggleRtaFullscreen}
        nudgeGraphHeight={nudgeGraphHeight}
      />

      {isRtaFullscreen ? (
        <MobileFullscreenOverlay
          fullscreenRtaProps={portraitRtaProps}
          geqProps={geqProps}
          toggleRtaFullscreen={toggleRtaFullscreen}
        />
      ) : null}

      <MobileLandscapeLayout
        activeAdvisoryCount={activeAdvisoryCount}
        geqProps={geqProps}
        hasActiveGEQBars={hasActiveGEQBars}
        hasActiveRTAMarkers={hasActiveRTAMarkers}
        inlineGraphMode={inlineGraphMode}
        isFrozen={isFrozen}
        isRtaFullscreen={isRtaFullscreen}
        isRunning={isRunning}
        issuesContent={issuesContent}
        landscapePanel={landscapePanel}
        landscapeRtaProps={landscapeRtaProps}
        onClearGEQ={onClearGEQ}
        onClearRTA={onClearRTA}
        rtaContainerRef={rtaContainerRef}
        setInlineGraphMode={setInlineGraphMode}
        setLandscapePanel={setLandscapePanel}
        settingsContent={landscapeSettingsContent}
        sidecarFader={landscapeSidecarFader}
        toggleFreeze={toggleFreeze}
        toggleRtaFullscreen={toggleRtaFullscreen}
      />

      <MobileBottomNav
        activeAdvisoryCount={activeAdvisoryCount}
        handleTabKeyDown={handleTabKeyDown}
        mobileTab={mobileTab}
        setMobileTab={setMobileTab}
        tabIndex={tabIndex}
        tabRefs={tabRefs}
      />
    </>
  )
})
