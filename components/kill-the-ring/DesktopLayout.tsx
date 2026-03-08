'use client'

import { memo } from 'react'
import { IssuesList } from './IssuesList'
import { SpectrumCanvas } from './SpectrumCanvas'
import { GEQBarView } from './GEQBarView'
import { DetectionControls } from './DetectionControls'
import { AlgorithmStatusBar } from './AlgorithmStatusBar'
import { VerticalGainFader } from './VerticalGainFader'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { AlertTriangle, PanelLeftClose, Columns2 } from 'lucide-react'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable'
import type { ImperativePanelHandle } from 'react-resizable-panels'
import type { Advisory, DetectorSettings, OperationMode, SpectrumData } from '@/types/advisory'
import type { SpectrumStatus, EarlyWarning } from '@/hooks/useAudioAnalyzer'

interface DesktopLayoutProps {
  layoutKey: number
  isRunning: boolean
  start: () => void
  stop: () => void
  isFrozen: boolean
  toggleFreeze: () => void
  advisories: Advisory[]
  activeAdvisoryCount: number
  settings: DetectorSettings
  onSettingsChange: (s: Partial<DetectorSettings>) => void
  onModeChange: (mode: OperationMode) => void
  spectrumRef: React.RefObject<SpectrumData | null>
  spectrumStatus: SpectrumStatus | null
  earlyWarning: EarlyWarning | null
  noiseFloorDb: number | null
  dismissedIds: Set<string>
  onDismiss: (id: string) => void
  onClearAll: () => void
  issuesPanelOpen: boolean
  issuesPanelRef: React.RefObject<ImperativePanelHandle | null>
  activeSidebarTab: 'issues' | 'controls'
  setActiveSidebarTab: (tab: 'issues' | 'controls') => void
  openIssuesPanel: () => void
  closeIssuesPanel: () => void
  setIssuesPanelOpen: (open: boolean) => void
  rtaClearedIds: Set<string>
  geqClearedIds: Set<string>
  hasActiveRTAMarkers: boolean
  hasActiveGEQBars: boolean
  onClearRTA: () => void
  onClearGEQ: () => void
  onFreqRangeChange: (min: number, max: number) => void
  inputLevel: number
  isAutoGain: boolean
  autoGainDb: number | undefined
  autoGainLocked: boolean
}

export const DesktopLayout = memo(function DesktopLayout({
  layoutKey, isRunning, start, stop, isFrozen, toggleFreeze,
  advisories, activeAdvisoryCount,
  settings, onSettingsChange, onModeChange,
  spectrumRef, spectrumStatus, earlyWarning, noiseFloorDb,
  dismissedIds, onDismiss, onClearAll,
  issuesPanelOpen, issuesPanelRef,
  activeSidebarTab, setActiveSidebarTab,
  openIssuesPanel, closeIssuesPanel, setIssuesPanelOpen,
  rtaClearedIds, geqClearedIds,
  hasActiveRTAMarkers, hasActiveGEQBars,
  onClearRTA, onClearGEQ, onFreqRangeChange,
  inputLevel, isAutoGain, autoGainDb, autoGainLocked,
}: DesktopLayoutProps) {
  return (
    <div className="hidden landscape:flex flex-1 overflow-hidden">
      <ResizablePanelGroup key={layoutKey} direction="horizontal" autoSaveId="ktr-layout-main-v4">
        {/* Sidebar panel */}
        <ResizablePanel defaultSize={20} minSize={8} maxSize={30} collapsible>
          <div className="flex flex-col h-full bg-card/50 overflow-hidden">
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
              />
            </div>
            {/* Sidebar tab bar */}
            <div className="flex-shrink-0 flex border-b border-border">
              {!issuesPanelOpen && (
                <button
                  onClick={() => setActiveSidebarTab('issues')}
                  className={`flex-1 py-1.5 text-[0.625rem] font-medium uppercase tracking-wide transition-colors ${
                    activeSidebarTab === 'issues'
                      ? 'text-foreground border-b-2 border-primary'
                      : 'text-muted-foreground hover:text-foreground'
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
                className={`flex-1 py-1.5 text-[0.625rem] font-medium uppercase tracking-wide transition-colors ${
                  activeSidebarTab === 'controls'
                    ? 'text-foreground border-b-2 border-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Controls
              </button>
              {/* Split-view toggle */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={issuesPanelOpen ? closeIssuesPanel : openIssuesPanel}
                    className={`flex-shrink-0 px-2 py-1.5 transition-colors ${
                      issuesPanelOpen
                        ? 'text-primary'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                    aria-label={issuesPanelOpen ? 'Close issues sidecar' : 'Open issues sidecar'}
                  >
                    <Columns2 className="w-3.5 h-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  {issuesPanelOpen ? 'Close split view' : 'Split: Issues'}
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto p-3">
                {activeSidebarTab === 'issues' && !issuesPanelOpen && (
                  <IssuesList
                    advisories={advisories}
                    maxIssues={settings.maxDisplayedIssues}
                    dismissedIds={dismissedIds}
                    onDismiss={onDismiss}
                    onClearAll={onClearAll}
                  />
                )}
                {activeSidebarTab === 'controls' && (
                  <DetectionControls settings={settings} onModeChange={onModeChange} onSettingsChange={onSettingsChange} />
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
          <div className="flex flex-col h-full bg-card/50 overflow-hidden">
            <div className="flex-shrink-0 flex items-center justify-between px-3 py-1.5 border-b border-border bg-muted/20">
              <h2 className="text-[0.625rem] text-muted-foreground uppercase tracking-wide font-medium flex items-center gap-1.5">
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
              />
            </div>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Graph area panel */}
        <ResizablePanel defaultSize={50}>
          <ResizablePanelGroup direction="vertical" autoSaveId="ktr-layout-vertical">
            {/* Top graph */}
            <ResizablePanel defaultSize={60} minSize={20} collapsible>
              <div className="h-full p-1.5 pb-0.5">
                <div className="h-full bg-card/60 rounded-lg border border-border overflow-hidden flex flex-col">
                  <div className="flex-shrink-0 flex items-center justify-between px-2 py-1 border-b border-border bg-muted/20">
                    <div className="flex items-center gap-1">
                      <span className="text-[0.5rem] font-medium text-primary">RTA</span>
                      {isRunning && (
                        <button onClick={toggleFreeze} className={`px-1.5 py-0.5 rounded text-[0.5rem] font-medium transition-colors ${isFrozen ? 'text-blue-400' : 'text-muted-foreground hover:text-foreground'}`}>
                          {isFrozen ? 'Live' : 'Freeze'}
                        </button>
                      )}
                      {hasActiveRTAMarkers && (
                        <button onClick={onClearRTA} className="px-1.5 py-0.5 rounded text-[0.5rem] font-medium text-muted-foreground hover:text-foreground transition-colors">
                          Clear
                        </button>
                      )}
                    </div>
                    <span className="text-[0.625rem] text-muted-foreground font-mono whitespace-nowrap">
                      {isRunning && noiseFloorDb != null
                        ? `${noiseFloorDb.toFixed(0)}dB`
                        : 'Ready'}
                    </span>
                  </div>
                  <div className="flex-1 min-h-0">
                    <SpectrumCanvas spectrumRef={spectrumRef} advisories={advisories} isRunning={isRunning} graphFontSize={settings.graphFontSize} onStart={!isRunning ? start : undefined} earlyWarning={earlyWarning} rtaDbMin={settings.rtaDbMin} rtaDbMax={settings.rtaDbMax} spectrumLineWidth={settings.spectrumLineWidth} clearedIds={rtaClearedIds} minFrequency={settings.minFrequency} maxFrequency={settings.maxFrequency} onFreqRangeChange={onFreqRangeChange} showThresholdLine={settings.showThresholdLine} feedbackThresholdDb={settings.feedbackThresholdDb} isFrozen={isFrozen} canvasTargetFps={settings.canvasTargetFps} />
                  </div>
                </div>
              </div>
            </ResizablePanel>

            <ResizableHandle withHandle />

            {/* Bottom row */}
            <ResizablePanel defaultSize={40} minSize={15} collapsible>
              <div className="h-full p-1.5 pt-0.5">
                <div className="h-full bg-card/60 rounded-lg border border-border overflow-hidden flex flex-col min-w-0">
                  <div className="flex-shrink-0 flex items-center px-2 py-0.5 border-b border-border bg-muted/20">
                    <div className="flex items-center gap-1">
                      <span className="text-[0.5rem] font-medium text-primary">GEQ</span>
                      {hasActiveGEQBars && (
                        <button onClick={onClearGEQ} className="px-1.5 py-0.5 rounded text-[0.5rem] font-medium text-muted-foreground hover:text-foreground transition-colors">
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
      <div className="flex-shrink-0 w-16 border-l border-border bg-card/50">
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
        />
      </div>
    </div>
  )
})
