'use client'

import { memo } from 'react'
import { IssuesList } from './IssuesList'
import { EarlyWarningPanel } from './EarlyWarningPanel'
import { SpectrumCanvas } from './SpectrumCanvas'
import { GEQBarView } from './GEQBarView'
import { DetectionControls } from './DetectionControls'
import { AlgorithmStatusBar } from './AlgorithmStatusBar'
import { VerticalGainFader } from './VerticalGainFader'
import { useAudio } from '@/contexts/AudioAnalyzerContext'
import { useAdvisories } from '@/contexts/AdvisoryContext'
import { useUI } from '@/contexts/UIContext'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { AlertTriangle, PanelLeftClose, Columns2 } from 'lucide-react'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable'
import type { ImperativePanelHandle } from 'react-resizable-panels'
import type { DetectorSettings } from '@/types/advisory'

interface DesktopLayoutProps {
  onSettingsChange: (s: Partial<DetectorSettings>) => void
  issuesPanelOpen: boolean
  issuesPanelRef: React.RefObject<ImperativePanelHandle | null>
  activeSidebarTab: 'issues' | 'controls'
  setActiveSidebarTab: (tab: 'issues' | 'controls') => void
  openIssuesPanel: () => void
  closeIssuesPanel: () => void
  setIssuesPanelOpen: (open: boolean) => void
  actualFps?: number
  droppedPercent?: number
}

export const DesktopLayout = memo(function DesktopLayout({
  onSettingsChange,
  issuesPanelOpen, issuesPanelRef,
  activeSidebarTab, setActiveSidebarTab,
  openIssuesPanel, closeIssuesPanel, setIssuesPanelOpen,
  actualFps, droppedPercent,
}: DesktopLayoutProps) {
  const {
    isRunning, isStarting, error, start, stop,
    spectrumRef, settings, handleModeChange, handleFreqRangeChange,
    spectrumStatus, noiseFloorDb,
    inputLevel, isAutoGain, autoGainDb, autoGainLocked,
  } = useAudio()

  const { isFrozen, toggleFreeze, layoutKey } = useUI()

  const {
    advisories, activeAdvisoryCount, earlyWarning,
    dismissedIds, onDismiss, onClearAll,
    rtaClearedIds, geqClearedIds,
    hasActiveRTAMarkers, hasActiveGEQBars,
    onClearRTA, onClearGEQ,
    onFalsePositive, falsePositiveIds,
  } = useAdvisories()

  return (
    <div className="hidden landscape:flex flex-1 overflow-hidden">
      <ResizablePanelGroup key={layoutKey} direction="horizontal" autoSaveId="ktr-layout-main-v4">
        {/* Sidebar panel */}
        <ResizablePanel defaultSize={20} minSize={8} maxSize={30} collapsible>
          <div className="flex flex-col h-full bg-card/40 channel-strip overflow-hidden">
            {/* Algorithm status */}
            <div className="flex-shrink-0 border-b border-border p-2">
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
            {/* Sidebar tab bar */}
            <div className="flex-shrink-0 flex border-b border-border">
              {!issuesPanelOpen && (
                <button
                  onClick={() => setActiveSidebarTab('issues')}
                  className={`flex-1 py-1 text-sm font-mono font-bold uppercase tracking-[0.2em] transition-all duration-200 border-b-2 ${
                    activeSidebarTab === 'issues'
                      ? 'text-foreground border-primary bg-primary/5'
                      : 'text-muted-foreground border-transparent hover:text-foreground'
                  }`}
                >
                  Issues
                  {activeAdvisoryCount > 0 && (
                    <span className="ml-1 font-mono text-primary">{activeAdvisoryCount}</span>
                  )}
                </button>
              )}
              <button
                onClick={() => setActiveSidebarTab('controls')}
                className={`flex-1 py-1 text-sm font-mono font-bold uppercase tracking-[0.2em] transition-all duration-200 border-b-2 ${
                  activeSidebarTab === 'controls'
                    ? 'text-foreground border-primary bg-primary/5'
                    : 'text-muted-foreground border-transparent hover:text-foreground'
                }`}
              >
                Controls
              </button>
              {/* Split-view toggle */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={issuesPanelOpen ? closeIssuesPanel : openIssuesPanel}
                    className={`flex-shrink-0 px-2 py-1 rounded transition-colors ${
                      issuesPanelOpen
                        ? 'text-primary'
                        : 'text-muted-foreground hover:text-foreground hover:bg-primary/10 ring-1 ring-primary/20'
                    }`}
                    aria-label={issuesPanelOpen ? 'Close issues sidecar' : 'Open issues sidecar'}
                  >
                    <Columns2 className="w-4 h-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-sm">
                  {issuesPanelOpen ? 'Close split view' : 'Split: Issues'}
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto p-3">
                {activeSidebarTab === 'issues' && !issuesPanelOpen && (
                  <div className="animate-in fade-in-0 duration-150">
                    <IssuesList
                      advisories={advisories}
                      maxIssues={settings.maxDisplayedIssues}
                      dismissedIds={dismissedIds}
                      onDismiss={onDismiss}
                      onClearAll={onClearAll}
                      isRunning={isRunning}
                      onStart={start}
                      onFalsePositive={onFalsePositive}
                      falsePositiveIds={falsePositiveIds}
                      isLowSignal={isRunning && inputLevel < -45}
                    />
                    <EarlyWarningPanel earlyWarning={earlyWarning} />
                  </div>
                )}
                {activeSidebarTab === 'controls' && (
                  <div className="animate-in fade-in-0 duration-150">
                    <DetectionControls settings={settings} onModeChange={handleModeChange} onSettingsChange={onSettingsChange} />
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
          <div className="flex flex-col h-full bg-card/40 channel-strip overflow-hidden">
            <div className="flex-shrink-0 flex items-center justify-between px-3 py-1 border-b border-border bg-card/60 panel-groove">
              <h2 className="section-label flex items-center gap-1.5">
                <AlertTriangle className="w-3 h-3" />
                Issues
                {activeAdvisoryCount > 0 && (
                  <span className="font-mono text-primary">{activeAdvisoryCount}</span>
                )}
              </h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={closeIssuesPanel}
                className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground"
                aria-label="Close issues panel"
              >
                <PanelLeftClose className="w-3.5 h-3.5" />
              </Button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-3">
              <IssuesList
                advisories={advisories}
                maxIssues={settings.maxDisplayedIssues}
                dismissedIds={dismissedIds}
                onDismiss={onDismiss}
                onClearAll={onClearAll}
                isRunning={isRunning}
                onStart={start}
                onFalsePositive={onFalsePositive}
                falsePositiveIds={falsePositiveIds}
                isLowSignal={isRunning && inputLevel < -45}
              />
              <EarlyWarningPanel earlyWarning={earlyWarning} />
            </div>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Graph area panel */}
        <ResizablePanel defaultSize={50}>
          <ResizablePanelGroup direction="vertical" autoSaveId="ktr-layout-vertical">
            {/* Top graph */}
            <ResizablePanel defaultSize={60} minSize={20} collapsible>
              <div className="h-full p-1 pb-0.5">
                <div className="h-full bg-card/40 rounded border border-border/40 overflow-hidden flex flex-col panel-recessed hover:border-border/60 transition-colors duration-300">
                  <div className="flex-shrink-0 flex items-center justify-between px-2 py-0.5 border-b border-border bg-card/60 panel-groove">
                    <div className="flex items-center gap-1">
                      <span className="text-sm font-mono font-bold tracking-[0.15em] text-primary">RTA</span>
                      {isRunning && (
                        <button onClick={toggleFreeze} className={`px-1.5 py-0.5 rounded text-sm font-medium transition-colors ${isFrozen ? 'text-blue-400' : 'text-muted-foreground hover:text-foreground'}`}>
                          {isFrozen ? 'Live' : 'Freeze'}
                        </button>
                      )}
                      {hasActiveRTAMarkers && (
                        <button onClick={onClearRTA} className="px-1.5 py-0.5 rounded text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                          Clear
                        </button>
                      )}
                    </div>
                    <span className="text-sm text-muted-foreground font-mono whitespace-nowrap">
                      {isRunning && noiseFloorDb != null
                        ? `${noiseFloorDb.toFixed(0)}dB`
                        : 'Ready'}
                    </span>
                  </div>
                  <div className="flex-1 min-h-0">
                    <SpectrumCanvas spectrumRef={spectrumRef} advisories={advisories} isRunning={isRunning} isStarting={isStarting} error={error} graphFontSize={settings.graphFontSize} onStart={!isRunning && !isStarting ? start : undefined} earlyWarning={earlyWarning} rtaDbMin={settings.rtaDbMin} rtaDbMax={settings.rtaDbMax} spectrumLineWidth={settings.spectrumLineWidth} clearedIds={rtaClearedIds} minFrequency={settings.minFrequency} maxFrequency={settings.maxFrequency} onFreqRangeChange={handleFreqRangeChange} showThresholdLine={settings.showThresholdLine} feedbackThresholdDb={settings.feedbackThresholdDb} isFrozen={isFrozen} canvasTargetFps={settings.canvasTargetFps} />
                  </div>
                </div>
              </div>
            </ResizablePanel>

            <ResizableHandle withHandle />

            {/* Bottom row */}
            <ResizablePanel defaultSize={40} minSize={15} collapsible>
              <div className="h-full p-1 pt-0.5">
                <div className="h-full bg-card/40 rounded border border-border/40 overflow-hidden flex flex-col min-w-0 panel-recessed hover:border-border/60 transition-colors duration-300">
                  <div className="flex-shrink-0 flex items-center px-2 py-0.5 border-b border-border bg-card/60 panel-groove">
                    <div className="flex items-center gap-1">
                      <span className="text-sm font-mono font-bold tracking-[0.15em] text-primary">GEQ</span>
                      {hasActiveGEQBars && (
                        <button onClick={onClearGEQ} className="px-1.5 py-0.5 rounded text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
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
      <div className="flex-shrink-0 w-16 border-l border-border/50 channel-strip">
        <VerticalGainFader
          value={settings.inputGainDb}
          onChange={(v) => onSettingsChange({ inputGainDb: v })}
          level={inputLevel}
          autoGainEnabled={isAutoGain}
          autoGainDb={autoGainDb}
          autoGainLocked={autoGainLocked}
          onAutoGainToggle={(enabled) => onSettingsChange({ autoGainEnabled: enabled })}
          autoGainTargetDb={settings.autoGainTargetDb}
          onAutoGainTargetChange={(db) => onSettingsChange({ autoGainTargetDb: db, autoGainEnabled: true })}
          isRunning={isRunning}
          onToggle={isRunning ? stop : start}
          noiseFloorDb={noiseFloorDb}
          faderMode={settings.faderMode}
          onFaderModeChange={(mode) => onSettingsChange({ faderMode: mode })}
          sensitivityValue={settings.feedbackThresholdDb}
          onSensitivityChange={(db) => onSettingsChange({ feedbackThresholdDb: db })}
        />
      </div>
    </div>
  )
})
