'use client'

import { memo, useMemo, useState } from 'react'
import { IssuesList } from './IssuesList'
import { RingOutWizard } from './RingOutWizard'
import { EarlyWarningPanel } from './EarlyWarningPanel'
import { SpectrumCanvas } from './SpectrumCanvas'
import { GEQBarView } from './GEQBarView'
import { SettingsPanel, SETTINGS_TABS, type DataCollectionTabProps, type SettingsTab } from './settings/SettingsPanel'
import { AlgorithmStatusBar } from './AlgorithmStatusBar'
import { VerticalGainFader } from './VerticalGainFader'
import { useEngine } from '@/contexts/EngineContext'
import { useSettings } from '@/contexts/SettingsContext'
import { useMetering } from '@/contexts/MeteringContext'
import { useAdvisories } from '@/contexts/AdvisoryContext'
import { useUI } from '@/contexts/UIContext'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { AlertTriangle, PanelLeftClose, Columns2, Expand, Shrink } from 'lucide-react'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable'
import type { ImperativePanelHandle } from 'react-resizable-panels'
import type { DetectorSettings } from '@/types/advisory'
import type { CalibrationTabProps } from './settings/CalibrationTab'
import { MODE_BASELINES } from '@/lib/settings/modeBaselines'
import { calculateRoomModes, calculateSchroederFrequency } from '@/lib/dsp/acousticUtils'

interface DesktopLayoutProps {
  issuesPanelOpen: boolean
  issuesPanelRef: React.RefObject<ImperativePanelHandle | null>
  activeSidebarTab: 'issues' | 'controls'
  setActiveSidebarTab: (tab: 'issues' | 'controls') => void
  openIssuesPanel: () => void
  closeIssuesPanel: () => void
  closeIssuesPanelToIssues: () => void
  setIssuesPanelOpen: (open: boolean) => void
  actualFps?: number
  droppedPercent?: number
  calibration?: Omit<CalibrationTabProps, 'settings' | 'onSettingsChange'>
  dataCollection?: DataCollectionTabProps
  isWizardActive?: boolean
  onStartWizard?: () => void
  onFinishWizard?: () => void
  onStartRingOut?: () => void
}

export const DesktopLayout = memo(function DesktopLayout({
  issuesPanelOpen, issuesPanelRef,
  activeSidebarTab, setActiveSidebarTab,
  openIssuesPanel, closeIssuesPanel, closeIssuesPanelToIssues, setIssuesPanelOpen,
  actualFps, droppedPercent,
  calibration, dataCollection,
  isWizardActive, onStartWizard, onFinishWizard, onStartRingOut,
}: DesktopLayoutProps) {
  const { isRunning, isStarting, error, start, stop } = useEngine()
  const { settings, handleModeChange, handleFreqRangeChange, resetSettings, setInputGain, setAutoGain, updateDisplay, setSensitivityOffset, session } = useSettings()

  // Controls sub-tab state — owned here so the tab bar can be a flex-shrink-0 header
  const [controlsTab, setControlsTab] = useState<SettingsTab>('live')
  const hasCustomGates = !!(session?.diagnostics && (
    session.diagnostics.formantGateOverride !== undefined ||
    session.diagnostics.chromaticGateOverride !== undefined ||
    session.diagnostics.combSweepOverride !== undefined ||
    session.diagnostics.ihrGateOverride !== undefined ||
    session.diagnostics.ptmrGateOverride !== undefined ||
    session.diagnostics.mainsHumGateOverride !== undefined
  ))
  const { spectrumRef, spectrumStatus, noiseFloorDb, inputLevel, isAutoGain, autoGainDb, autoGainLocked } = useMetering()

  const { isFrozen, toggleFreeze, layoutKey, rtaContainerRef, isRtaFullscreen, toggleRtaFullscreen } = useUI()

  // Compute axial room modes for RTA overlay (memoized — only recomputes when dimensions/unit change)
  const roomModes = useMemo(() => {
    if (settings.roomPreset === 'none' || !settings.roomLengthM || !settings.roomWidthM || !settings.roomHeightM) return null
    const toM = settings.roomDimensionsUnit === 'feet' ? 0.3048 : 1
    const lM = settings.roomLengthM * toM
    const wM = settings.roomWidthM * toM
    const hM = settings.roomHeightM * toM
    const schroeder = calculateSchroederFrequency(settings.roomRT60, lM * wM * hM)
    const maxHz = Math.min(schroeder, 300)
    return calculateRoomModes(lM, wM, hM, maxHz).axial
  }, [settings.roomPreset, settings.roomLengthM, settings.roomWidthM, settings.roomHeightM, settings.roomDimensionsUnit, settings.roomRT60])

  const {
    advisories, activeAdvisoryCount, earlyWarning,
    dismissedIds, onDismiss, onClearAll,
    rtaClearedIds, geqClearedIds,
    hasActiveRTAMarkers, hasActiveGEQBars,
    onClearRTA, onClearGEQ,
    onFalsePositive, falsePositiveIds,
    onConfirmFeedback, confirmedIds,
  } = useAdvisories()

  return (
    <div className="hidden lg:flex lg:landscape:hidden md:landscape:flex flex-1 overflow-hidden">
      <ResizablePanelGroup key={layoutKey} direction="horizontal" autoSaveId="dwa-layout-main-v4">
        {/* Sidebar panel */}
        <ResizablePanel defaultSize={20} minSize={8} maxSize={30} collapsible>
          <div className="flex flex-col h-full amber-sidecar overflow-hidden">
            {/* Algorithm status */}
            <div className="flex-shrink-0 amber-panel-header p-2">
              <AlgorithmStatusBar
                algorithmMode={spectrumStatus?.algorithmMode ?? settings.algorithmMode}
                contentType={spectrumStatus?.contentType}
                msdFrameCount={spectrumStatus?.msdFrameCount}
                isCompressed={spectrumStatus?.isCompressed}
                compressionRatio={spectrumStatus?.compressionRatio}
                isRunning={isRunning}
                showDetailed={settings.showAlgorithmScores}
                actualFps={actualFps}
                droppedPercent={droppedPercent}
              />
            </div>
            {/* Sidebar tab bar — segmented control */}
            <div className="flex-shrink-0 flex items-center gap-1.5 px-2 py-1.5 amber-panel-header">
              <div className="flex flex-1 tab-track">
              {!issuesPanelOpen && (
                <button
                  onClick={() => setActiveSidebarTab('issues')}
                  data-active={activeSidebarTab === 'issues' ? 'true' : 'false'}
                  className={`tab-track-item flex-1 py-0.5 text-[11px] font-mono font-bold uppercase tracking-[0.2em] cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 ${
                    activeSidebarTab === 'issues'
                      ? 'text-[var(--console-amber)]'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Issues
                  {activeAdvisoryCount > 0 && (
                    <span className="ml-1 font-mono text-[var(--console-amber)]">{activeAdvisoryCount}</span>
                  )}
                </button>
              )}
              <button
                onClick={() => setActiveSidebarTab('controls')}
                data-active={activeSidebarTab === 'controls' ? 'true' : 'false'}
                className={`tab-track-item flex-1 py-0.5 text-[11px] font-mono font-bold uppercase tracking-[0.2em] cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 ${
                  activeSidebarTab === 'controls'
                    ? 'text-[var(--console-amber)]'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Controls
              </button>
              </div>
              {/* Split-view toggle */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={issuesPanelOpen ? closeIssuesPanel : openIssuesPanel}
                    className={`flex-shrink-0 px-2 py-1 rounded transition-colors cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 ${
                      issuesPanelOpen
                        ? 'text-[var(--console-amber)]'
                        : 'text-muted-foreground hover:text-foreground hover:bg-[rgba(245,158,11,0.08)] ring-1 ring-[rgba(245,158,11,0.20)]'
                    }`}
                    aria-label={issuesPanelOpen ? 'Show Controls only' : 'Open split view'}
                  >
                    <Columns2 className="w-4 h-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-sm">
                  {issuesPanelOpen ? 'Show Controls only' : 'Split: Issues'}
                </TooltipContent>
              </Tooltip>
            </div>
            {/* Settings sub-tab bar — flex-shrink-0 sibling, zero gap, solid background */}
            {activeSidebarTab === 'controls' && (
              <div className="flex-shrink-0 flex gap-0 bg-[#070c12] border-b border-[rgba(245,158,11,0.14)]">
                {SETTINGS_TABS.map(({ id, label, shortLabel, Icon }) => (
                  <button
                    key={id}
                    onClick={() => setControlsTab(id)}
                    aria-label={label}
                    data-active={controlsTab === id}
                    className={`tab-track-item relative flex-1 min-h-[30px] flex items-center justify-center gap-1 text-[10px] font-bold uppercase tracking-[0.08em] cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 ${
                      controlsTab === id
                        ? 'bg-[rgba(245,158,11,0.08)] text-[var(--console-amber)]'
                        : 'text-muted-foreground hover:text-foreground hover:bg-[rgba(245,158,11,0.04)]'
                    }`}
                  >
                    <Icon className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">{shortLabel ?? label}</span>
                    {id === 'advanced' && hasCustomGates && (
                      <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-amber-500" title="Custom gate overrides active" />
                    )}
                  </button>
                ))}
              </div>
            )}

            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto p-3">
                {activeSidebarTab === 'issues' && !issuesPanelOpen && (
                  <div className="animate-in fade-in-0 duration-150">
                    {isWizardActive ? (
                      <RingOutWizard
                        advisories={advisories}
                        onFinish={() => onFinishWizard?.()}
                        isRunning={isRunning}
                        roomModes={roomModes}
                      />
                    ) : (
                      <>
                        <IssuesList
                          advisories={advisories}
                          maxIssues={settings.maxDisplayedIssues}
                          dismissedIds={dismissedIds}

                          onClearAll={onClearAll}
                          isRunning={isRunning}
                          onStart={start}
                          onFalsePositive={onFalsePositive}
                          falsePositiveIds={falsePositiveIds}
                          onConfirmFeedback={onConfirmFeedback}
                          confirmedIds={confirmedIds}
                          isLowSignal={isRunning && inputLevel < -45}
                          swipeLabeling={settings.swipeLabeling}
                          showAlgorithmScores={settings.showAlgorithmScores}
                          showPeqDetails={settings.showPeqDetails}
                          onStartRingOut={onStartRingOut}
                          onDismiss={onDismiss}
                        />
                        {settings.mode === 'ringOut' && isRunning && onStartWizard && (
                          <button
                            onClick={onStartWizard}
                            className="w-full mt-2 py-2 rounded font-mono text-xs font-bold tracking-[0.15em] uppercase bg-[rgba(245,158,11,0.10)] border border-[rgba(245,158,11,0.30)] text-[var(--console-amber)] hover:bg-[rgba(245,158,11,0.18)] transition-colors cursor-pointer"
                          >
                            Start Ring-Out Wizard
                          </button>
                        )}
                        <EarlyWarningPanel earlyWarning={earlyWarning} />
                      </>
                    )}
                  </div>
                )}
                {activeSidebarTab === 'controls' && (
                  <div className="animate-in fade-in-0 duration-150">
                    <SettingsPanel settings={settings} onModeChange={handleModeChange} onReset={resetSettings} calibration={calibration} dataCollection={dataCollection} activeTab={controlsTab} onTabChange={setControlsTab} />
                  </div>
                )}
              </div>
            </div>
          </div>
        </ResizablePanel>

        {/* Only show handle when issues panel is open */}
        {issuesPanelOpen && <ResizableHandle withHandle />}

        {/* Issues side-panel (collapsible) */}
        <ResizablePanel
          ref={issuesPanelRef}
          defaultSize={25}
          collapsedSize={0}
          minSize={10}
          maxSize={35}
          collapsible
          onCollapse={() => setIssuesPanelOpen(false)}
          onExpand={() => setIssuesPanelOpen(true)}
        >
          <div className="flex flex-col h-full amber-sidecar overflow-hidden">
            <div className="flex-shrink-0 flex items-center justify-between px-3 py-1 amber-panel-header">
              <h2 className="section-label flex items-center gap-1.5 text-[var(--console-amber)]">
                <AlertTriangle className="w-3 h-3 text-[var(--console-amber)]" />
                Issues
                {activeAdvisoryCount > 0 && (
                  <span className="font-mono text-[var(--console-amber)]">{activeAdvisoryCount}</span>
                )}
              </h2>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={closeIssuesPanelToIssues}
                    className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground"
                    aria-label="Show Issues in sidebar"
                  >
                    <PanelLeftClose className="w-3.5 h-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-sm">
                  Show Issues only
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-3">
              {isWizardActive ? (
                <RingOutWizard
                  advisories={advisories}
                  onFinish={() => onFinishWizard?.()}
                  isRunning={isRunning}
                  roomModes={roomModes}
                />
              ) : (
                <>
                  <IssuesList
                    advisories={advisories}
                    maxIssues={settings.maxDisplayedIssues}
                    dismissedIds={dismissedIds}
                    onClearAll={onClearAll}
                    isRunning={isRunning}
                    onStart={start}
                    onFalsePositive={onFalsePositive}
                    falsePositiveIds={falsePositiveIds}
                    onConfirmFeedback={onConfirmFeedback}
                    confirmedIds={confirmedIds}
                    isLowSignal={isRunning && inputLevel < -45}
                    swipeLabeling={settings.swipeLabeling}
                    showAlgorithmScores={settings.showAlgorithmScores}
                    onStartRingOut={onStartRingOut}
                    onDismiss={onDismiss}
                  />
                  <EarlyWarningPanel earlyWarning={earlyWarning} />
                </>
              )}
            </div>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Graph area panel */}
        <ResizablePanel defaultSize={50}>
          <ResizablePanelGroup direction="vertical" autoSaveId="dwa-layout-vertical">
            {/* Top graph */}
            <ResizablePanel defaultSize={60} minSize={20} collapsible>
              <div className="h-full p-1 pb-0.5">
                <div ref={rtaContainerRef} className="h-full rounded overflow-hidden flex flex-col instrument-window instrument-window-amber noise-panel">
                  <div className="flex-shrink-0 flex items-center justify-between amber-panel-header panel-header">
                    <div className="flex items-center gap-2">
                      <div className={isRunning ? 'power-led' : 'power-led-off'} />
                      <span className="text-[11px] font-mono font-bold tracking-[0.2em] uppercase whitespace-nowrap" style={{ color: 'var(--console-amber)', opacity: 0.9 }}><span className="hidden lg:inline">Real-Time Analyzer</span><span className="lg:hidden">RTA</span></span>
                      {isRunning && (
                        <button onClick={toggleFreeze} className={`px-1.5 py-0.5 rounded text-sm font-medium transition-colors cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 ${isFrozen ? 'text-blue-400' : 'text-muted-foreground hover:text-foreground'}`}>
                          {isFrozen ? 'Live' : 'Freeze'}
                        </button>
                      )}
                      {hasActiveRTAMarkers && (
                        <button onClick={onClearRTA} className="px-1.5 py-0.5 rounded text-sm font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
                          Clear
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-sm font-mono whitespace-nowrap" style={{ color: 'var(--console-amber)', opacity: 0.6 }}>
                        {isRunning && noiseFloorDb != null
                          ? `${noiseFloorDb.toFixed(0)}dB`
                          : 'Ready'}
                      </span>
                      <button
                        onClick={toggleRtaFullscreen}
                        className="p-1.5 rounded text-muted-foreground hover:text-foreground transition-colors cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                        aria-label={isRtaFullscreen ? 'Collapse RTA' : 'Expand RTA'}
                      >
                        {isRtaFullscreen ? <Shrink className="w-5 h-5" /> : <Expand className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>
                  <div className="flex-1 min-h-0">
                    <SpectrumCanvas spectrumRef={spectrumRef} advisories={advisories} isRunning={isRunning} isStarting={isStarting} error={error} graphFontSize={settings.graphFontSize} onStart={!isRunning && !isStarting ? start : undefined} earlyWarning={earlyWarning} rtaDbMin={settings.rtaDbMin} rtaDbMax={settings.rtaDbMax} spectrumLineWidth={settings.spectrumLineWidth} clearedIds={rtaClearedIds} minFrequency={settings.minFrequency} maxFrequency={settings.maxFrequency} onFreqRangeChange={handleFreqRangeChange} showThresholdLine={settings.showThresholdLine} feedbackThresholdDb={settings.feedbackThresholdDb} isFrozen={isFrozen} canvasTargetFps={settings.canvasTargetFps} showFreqZones={settings.showFreqZones} showRoomModeLines={settings.showRoomModeLines} roomModes={roomModes} spectrumWarmMode={settings.spectrumWarmMode} onThresholdChange={(db) => { const bl = MODE_BASELINES[session.modeId]; const eo = session.environment.feedbackOffsetDb; const ce = bl.feedbackThresholdDb + eo + session.liveOverrides.sensitivityOffsetDb; const d = db - ce; if (d !== 0) setSensitivityOffset(session.liveOverrides.sensitivityOffsetDb + d) }} />
                  </div>
                </div>
              </div>
            </ResizablePanel>

            <ResizableHandle withHandle />

            {/* Bottom row */}
            <ResizablePanel defaultSize={40} minSize={15} collapsible>
              <div className="h-full p-1 pt-0.5">
                <div className="h-full rounded overflow-hidden flex flex-col min-w-0 instrument-window instrument-window-amber noise-panel">
                  <div className="flex-shrink-0 flex items-center amber-panel-header panel-header">
                    <div className="flex items-center gap-2">
                      <div className={isRunning ? 'power-led' : 'power-led-off'} />
                      <span className="text-[11px] font-mono font-bold tracking-[0.2em] uppercase whitespace-nowrap" style={{ color: 'var(--console-amber)', opacity: 0.9 }}><span className="hidden lg:inline">Graphic Equalizer</span><span className="lg:hidden">GEQ</span></span>
                      {hasActiveGEQBars && (
                        <button onClick={onClearGEQ} className="px-1.5 py-0.5 rounded text-sm font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex-1 min-h-0">
                    <GEQBarView advisories={advisories} graphFontSize={Math.max(10, settings.graphFontSize - 4)} clearedIds={geqClearedIds} />
                  </div>
                </div>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
      </ResizablePanelGroup>

      {/* Gain fader strip */}
      <div className="flex-shrink-0 w-16 border-l border-[rgba(245,158,11,0.18)] channel-strip amber-sidecar">
        <VerticalGainFader
          value={settings.inputGainDb}
          onChange={(v) => setInputGain(v)}
          level={inputLevel}
          autoGainEnabled={isAutoGain}
          autoGainDb={autoGainDb}
          autoGainLocked={autoGainLocked}
          onAutoGainToggle={(enabled) => setAutoGain(enabled)}
          isRunning={isRunning}
          noiseFloorDb={noiseFloorDb}
          faderMode={settings.faderMode}
          onFaderModeChange={(mode) => updateDisplay({ faderMode: mode })}
          sensitivityValue={settings.feedbackThresholdDb}
          onSensitivityChange={(db) => { const bl = MODE_BASELINES[session.modeId]; const eo = session.environment.feedbackOffsetDb; const ce = bl.feedbackThresholdDb + eo + session.liveOverrides.sensitivityOffsetDb; const d = db - ce; if (d !== 0) setSensitivityOffset(session.liveOverrides.sensitivityOffsetDb + d) }}
          activeAdvisoryCount={activeAdvisoryCount}
        />
      </div>
    </div>
  )
})
