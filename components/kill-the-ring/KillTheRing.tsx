'use client'

// BUILD v3.0 - Force Full Rebuild (Cache Buster)
// This version fixes: window.innerWidth SSR error, GRAPH_LABELS undefined, sidebarOpen JSX
// Guaranteed correct: GRAPH_CHIPS usage, CSS-only layout, no SSR window access
// Built: 2026-02-28

import { useEffect, useState, useCallback, useRef, useMemo, memo } from 'react'
import { useAudioAnalyzer } from '@/hooks/useAudioAnalyzer'
import { useAdvisoryLogging } from '@/hooks/useAdvisoryLogging'
import { IssuesList } from './IssuesList'
import { SpectrumCanvas } from './SpectrumCanvas'
import { GEQBarView } from './GEQBarView'
import { SettingsPanel } from './SettingsPanel'
import { DetectionControls } from './DetectionControls'
import { HelpMenu } from './HelpMenu'
import { InputMeterSlider } from './InputMeterSlider'
import { ResetConfirmDialog } from './ResetConfirmDialog'
import { FeedbackHistoryPanel } from './FeedbackHistoryPanel'
import { AlgorithmStatusBar } from './AlgorithmStatusBar'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useFullscreen } from '@/hooks/useFullscreen'
import { RotateCcw, LayoutGrid, AlertTriangle, BarChart3, Settings2, Maximize2, Minimize2, PanelLeftClose, Columns2 } from 'lucide-react'
import type { Advisory, OperationMode } from '@/types/advisory'
import { OPERATION_MODES } from '@/lib/dsp/constants'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable'
import type { ImperativePanelHandle } from 'react-resizable-panels'

type GraphView = 'rta' | 'geq' | 'controls'

const GRAPH_CHIPS: { value: GraphView; label: string }[] = [
  { value: 'rta', label: 'RTA' },
  { value: 'geq', label: 'GEQ' },
]

const LAYOUT_PREFS_KEY = 'ktr-layout-prefs'

function GraphChipRow({ value, onChange }: { value: GraphView; onChange: (v: GraphView) => void }) {
  return (
    <div className="flex items-center gap-1">
      {GRAPH_CHIPS.map((chip) => (
        <button
          key={chip.value}
          onClick={() => onChange(chip.value)}
          className={`px-1.5 py-0.5 rounded text-[0.5rem] font-medium transition-colors ${
            value === chip.value
              ? 'bg-primary/20 text-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {chip.label}
        </button>
      ))}
    </div>
  )
}

export const KillTheRing = memo(function KillTheRingComponent() {
  // v3.0 Build Component
  const {
    isRunning,
    error,
    noiseFloorDb,
    sampleRate,
    fftSize,
    spectrumStatus,
    spectrumRef,
    tracksRef,
    advisories,
    earlyWarning,
    settings,
    start,
    stop,
    updateSettings,
    resetSettings,
  } = useAudioAnalyzer()

  const activeAdvisoryCount = useMemo(
    () => advisories.filter(a => !a.resolved).length,
    [advisories]
  )

  const [activeGraph, setActiveGraph] = useState<GraphView>('rta')
  const [bottomLeftGraph, setBottomLeftGraph] = useState<GraphView>('geq')
  const [bottomRightGraph, setBottomRightGraph] = useState<GraphView>('controls')
  const [mobileTab, setMobileTab] = useState<'issues' | 'graph' | 'settings'>('issues')
  const [activeSidebarTab, setActiveSidebarTab] = useState<'issues' | 'controls'>('controls')
  const [layoutKey, setLayoutKey] = useState(0)
  const [issuesPanelOpen, setIssuesPanelOpen] = useState(true)
  const issuesPanelRef = useRef<ImperativePanelHandle>(null)

  // Force-collapse issues panel on mount to override localStorage-restored size
  useEffect(() => {
    requestAnimationFrame(() => issuesPanelRef.current?.collapse())
  }, [])

  // Fullscreen
  const rootRef = useRef<HTMLDivElement>(null)
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen(rootRef)


  // Dismissed advisory IDs — hidden until the advisory disappears and a new one is detected
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())

  const handleDismiss = useCallback((id: string) => {
    setDismissedIds((prev) => new Set(prev).add(id))
  }, [])

  const handleClearAllIssues = useCallback(() => {
    setDismissedIds(new Set(advisories.map(a => a.id)))
  }, [advisories])

  const handleClearResolvedIssues = useCallback(() => {
    setDismissedIds(prev => {
      const next = new Set(prev)
      advisories.forEach(a => { if (a.resolved) next.add(a.id) })
      return next
    })
  }, [advisories])

  // GEQ-specific cleared IDs — independent from issue card dismissals
  const [geqClearedIds, setGeqClearedIds] = useState<Set<string>>(new Set())

  const handleClearGEQ = useCallback(() => {
    setGeqClearedIds(new Set(advisories.map(a => a.id)))
  }, [advisories])

  // True when at least one advisory has a GEQ recommendation that hasn't been cleared
  const hasActiveGEQBars = useMemo(() =>
    advisories.some(a => !geqClearedIds.has(a.id) && a.advisory?.geq),
    [advisories, geqClearedIds]
  )

  // RTA-specific cleared IDs — independent from issue cards and GEQ
  const [rtaClearedIds, setRtaClearedIds] = useState<Set<string>>(new Set())

  const handleClearRTA = useCallback(() => {
    setRtaClearedIds(new Set(advisories.map(a => a.id)))
  }, [advisories])

  // True when at least one advisory hasn't been cleared from the RTA
  const hasActiveRTAMarkers = useMemo(() =>
    advisories.some(a => !rtaClearedIds.has(a.id)),
    [advisories, rtaClearedIds]
  )

  // Auto-expire dismissed/cleared IDs once the advisory is no longer in the live list
  useEffect(() => {
    if (dismissedIds.size === 0 && geqClearedIds.size === 0 && rtaClearedIds.size === 0) return
    const liveIds = new Set(advisories.map((a) => a.id))
    setDismissedIds((prev) => {
      const next = new Set<string>()
      prev.forEach((id) => { if (liveIds.has(id)) next.add(id) })
      return next.size === prev.size ? prev : next
    })
    setGeqClearedIds((prev) => {
      const next = new Set<string>()
      prev.forEach((id) => { if (liveIds.has(id)) next.add(id) })
      return next.size === prev.size ? prev : next
    })
    setRtaClearedIds((prev) => {
      const next = new Set<string>()
      prev.forEach((id) => { if (liveIds.has(id)) next.add(id) })
      return next.size === prev.size ? prev : next
    })
  }, [advisories, dismissedIds.size, geqClearedIds.size, rtaClearedIds.size])


  // Auto music-aware: watch spectrumStatus.peak vs noise floor
  const autoMusicDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!settings.autoMusicAware || !isRunning) return
    const peak = spectrumStatus?.peak ?? -100
    const floor = noiseFloorDb ?? -80
    const hysteresis = settings.autoMusicAwareHysteresisDb ?? 15
    const shouldBeMusic = peak > floor + hysteresis
    const isCurrentlyMusic = settings.musicAware

    if (shouldBeMusic === isCurrentlyMusic) return
    if (autoMusicDebounceRef.current) clearTimeout(autoMusicDebounceRef.current)
    autoMusicDebounceRef.current = setTimeout(() => {
      updateSettings({ musicAware: shouldBeMusic })
    }, 1000) // 1s debounce to avoid flapping

    return () => {
      if (autoMusicDebounceRef.current) clearTimeout(autoMusicDebounceRef.current)
    }
  }, [spectrumStatus?.peak, noiseFloorDb, settings.autoMusicAware, settings.musicAware, settings.autoMusicAwareHysteresisDb, isRunning, updateSettings])

  useAdvisoryLogging(advisories)

  // Load saved graph assignments from localStorage
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(LAYOUT_PREFS_KEY) ?? '{}')
      if (saved.activeGraph) setActiveGraph(saved.activeGraph)
      if (saved.bottomLeftGraph) setBottomLeftGraph(saved.bottomLeftGraph)
      if (saved.bottomRightGraph) setBottomRightGraph(saved.bottomRightGraph)
    } catch {}
  }, [])

  // Persist graph assignments on change
  useEffect(() => {
    try {
      localStorage.setItem(LAYOUT_PREFS_KEY, JSON.stringify({
        activeGraph, bottomLeftGraph, bottomRightGraph,
      }))
    } catch {}
  }, [activeGraph, bottomLeftGraph, bottomRightGraph])

  const resetLayout = useCallback(() => {
    try {
      localStorage.removeItem('react-resizable-panels:ktr-layout-main')
      localStorage.removeItem('react-resizable-panels:ktr-layout-main-v2')
      localStorage.removeItem('react-resizable-panels:ktr-layout-main-v3')
      localStorage.removeItem('react-resizable-panels:ktr-layout-vertical')
      localStorage.removeItem('react-resizable-panels:ktr-layout-bottom')
      localStorage.removeItem(LAYOUT_PREFS_KEY)
    } catch {}
    setActiveGraph('rta')
    setBottomLeftGraph('geq')
    setBottomRightGraph('controls')
    setIssuesPanelOpen(false)
    setLayoutKey(k => k + 1)
  }, [])

  const openIssuesPanel = useCallback(() => {
    setIssuesPanelOpen(true)
    if (activeSidebarTab === 'issues') setActiveSidebarTab('controls')
    requestAnimationFrame(() => issuesPanelRef.current?.resize(25))
  }, [activeSidebarTab])

  const closeIssuesPanel = useCallback(() => {
    issuesPanelRef.current?.collapse()
  }, [])

  const handleModeChange = useCallback((mode: OperationMode) => {
    const preset = OPERATION_MODES[mode]
    if (!preset) return
    updateSettings({
      mode,
      feedbackThresholdDb: preset.feedbackThresholdDb,
      ringThresholdDb: preset.ringThresholdDb,
      growthRateThreshold: preset.growthRateThreshold,
      musicAware: preset.musicAware,
      autoMusicAware: preset.autoMusicAware,
      fftSize: preset.fftSize,
      minFrequency: preset.minFrequency,
      maxFrequency: preset.maxFrequency,
      sustainMs: preset.sustainMs,
      clearMs: preset.clearMs,
      holdTimeMs: preset.holdTimeMs,
      confidenceThreshold: preset.confidenceThreshold,
      prominenceDb: preset.prominenceDb,
      relativeThresholdDb: preset.relativeThresholdDb,
      eqPreset: preset.eqPreset,
      aWeightingEnabled: preset.aWeightingEnabled,
      inputGainDb: preset.inputGainDb,
      ignoreWhistle: preset.ignoreWhistle,
    })
  }, [updateSettings])

  const handleSettingsChange = useCallback((newSettings: Partial<typeof settings>) => {
    updateSettings(newSettings)
  }, [updateSettings])

  const handleFreqRangeChange = useCallback((min: number, max: number) => {
    updateSettings({ minFrequency: min, maxFrequency: max })
  }, [updateSettings])

  const inputLevel = spectrumStatus?.peak ?? -60
  const autoGainDb = spectrumStatus?.autoGainDb
  const isAutoGain = spectrumStatus?.autoGainEnabled ?? settings.autoGainEnabled
  const isAutoGainLocked = spectrumStatus?.autoGainLocked ?? false



  return (
    <div ref={rootRef} className="flex flex-col h-screen bg-background">
      {/* ─── KILL THE RING v2.1 ─────────────────────────────────────────────────
          Buildtime: 2026-02-28 | Bundler cache: invalidated
          Layout: Header + Mobile/Desktop content + Reset confirmation
          Graphs: GRAPH_CHIPS (RTA/GEQ/Controls) - NO window.innerWidth SSR access
          ──────────────────────────────────────────────────────────────────────── */}

      {/* ── Header ─────────────────────────────────────────────── */}
      {/* Mobile: two-row stacked layout with full-height circle button */}
      {/* Desktop (sm:): single-row layout, logo left, actions right    */}
      <header className="relative flex items-center justify-between gap-2 px-3 py-3 border-b border-border bg-card/80 backdrop-blur-sm sm:px-4 sm:py-2 sm:gap-4">

        {/* ── MOBILE Row 1: Logo wordmark (right-aligned, above icons) ── */}
        {/* ── DESKTOP: Logo + button group (left side) ───────────────── */}
        <div className="flex items-center gap-1.5 sm:gap-3 sm:flex-shrink-0">

          {/* Desktop-only: button inside logo group */}
          <div className="hidden sm:flex items-center gap-2.5 flex-shrink-0">
            <div className="relative">
              <button
                onClick={isRunning ? stop : start}
                aria-label={isRunning ? 'Stop analysis' : 'Start analysis'}
                className="relative w-12 h-12 flex items-center justify-center flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-full"
              >
                <div className={`absolute inset-1 rounded-full border-2 transition-colors duration-300 ${isRunning ? 'border-primary' : 'border-primary/50'}`} />
                {isRunning && (
                  <div className="absolute inset-1 rounded-full border-2 border-primary animate-ping opacity-30" />
                )}
                <svg
                  className={`w-6 h-6 relative z-10 transition-colors duration-300 ${isRunning ? 'text-primary' : 'text-primary/60 hover:text-primary'}`}
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.31-2.5-4.06v8.12c1.48-.75 2.5-2.29 2.5-4.06zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                </svg>
              </button>

            </div>

            <div className="flex flex-col justify-center gap-[3px]">
              <div className="flex items-baseline gap-1.5 leading-none">
                <span className="text-lg font-black tracking-tight text-foreground">KILL THE</span>
                <span className="text-xl font-black tracking-tight text-primary">RING</span>
              </div>
              <span className="text-[0.625rem] font-semibold tracking-wider text-muted-foreground uppercase leading-none">
                Don Wells AV{' '}
                <span className="font-mono">v{process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0'}</span>
              </span>
            </div>
          </div>

          {/* Mobile-only: inline start button + wordmark */}
          <div className="flex sm:hidden items-center gap-3 min-w-0">
            <button
              onClick={isRunning ? stop : start}
              aria-label={isRunning ? 'Stop analysis' : 'Start analysis'}
              className="relative w-16 h-16 flex items-center justify-center flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-full"
            >
              <div className={`absolute inset-2.5 rounded-full border-2 transition-colors duration-300 ${isRunning ? 'border-primary' : 'border-primary/50'}`} />
              {isRunning && (
                <div className="absolute inset-2.5 rounded-full border-2 border-primary animate-ping opacity-30" />
              )}
              <svg
                className={`w-8 h-8 relative z-10 transition-colors duration-300 ${isRunning ? 'text-primary' : 'text-primary/60 hover:text-primary'}`}
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.31-2.5-4.06v8.12c1.48-.75 2.5-2.29 2.5-4.06zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
              </svg>
            </button>
            <div className="flex flex-col justify-center gap-0 min-w-0">
              <div className="flex items-baseline gap-1 leading-none">
                <span className="text-xl font-black tracking-tight text-foreground">KILL THE</span>
                <span className="text-2xl font-black tracking-tight text-primary">RING</span>
              </div>
              <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase leading-none">
                Don Wells AV{' '}
                <span className="font-mono">v{process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0'}</span>
              </span>
            </div>
          </div>
        </div>

        {/* Desktop center: Gain slider */}
        <div className="hidden landscape:sm:flex items-center flex-1 min-w-0">
          <div className="flex-1 flex flex-col gap-2 min-w-0">
            <InputMeterSlider
              value={settings.inputGainDb}
              onChange={(v) => handleSettingsChange({ inputGainDb: v })}
              level={inputLevel}
              fullWidth
              autoGainEnabled={isAutoGain}
              autoGainDb={autoGainDb}
              autoGainLocked={isAutoGainLocked}
              onAutoGainToggle={(enabled) => handleSettingsChange({ autoGainEnabled: enabled })}
            />
          </div>
        </div>

        {/* ── MOBILE Row 2: Action icons ───────────────────────────── */}
        {/* ── DESKTOP: Action icons (right side) ──────────────────── */}
        <div className="flex items-center justify-end gap-2 sm:gap-2 sm:px-0 text-xs text-muted-foreground sm:flex-shrink-0">
          {noiseFloorDb !== null && (
            <span className="font-mono text-[0.5625rem] sm:text-[0.625rem] hidden landscape:inline mr-auto sm:mr-0">
              Floor: {noiseFloorDb.toFixed(0)}dB
            </span>
          )}

          <TooltipProvider delayDuration={400}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetLayout}
                  className="hidden landscape:flex h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                  aria-label="Reset layout"
                >
                  <LayoutGrid className="w-3 h-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                Reset layout
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider delayDuration={400}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toggleFullscreen}
                  className="hidden landscape:flex h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                  aria-label="Toggle fullscreen"
                >
                  {isFullscreen ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                {isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <FeedbackHistoryPanel />
          <HelpMenu />
          <SettingsPanel
            settings={settings}
            onSettingsChange={handleSettingsChange}
            onModeChange={handleModeChange}
            onReset={() => {
              resetSettings()
            }}
          />

        </div>

      </header>

      {/* ── Error banner ───────────────────────────────────────── */}
      {error && (
        <div className="px-4 py-1.5 bg-destructive/10 border-b border-destructive/20">
          <span className="text-xs text-destructive">{error}</span>
        </div>
      )}

      {/* ── Main Content ───────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Mobile: 3-tab content area (portrait only) ────────── */}
        <div className="landscape:hidden flex-1 flex flex-col overflow-hidden">
          {/* Issues tab */}
          {mobileTab === 'issues' && (
            <div className="flex-1 flex flex-col overflow-hidden bg-background">
              <div className="border-b border-border p-2 flex-shrink-0 bg-card/50">
                <InputMeterSlider
                  value={settings.inputGainDb}
                  onChange={(v) => handleSettingsChange({ inputGainDb: v })}
                  level={inputLevel}
                  compact
                  autoGainEnabled={isAutoGain}
                  autoGainDb={autoGainDb}
                  autoGainLocked={isAutoGainLocked}
                  onAutoGainToggle={(enabled) => handleSettingsChange({ autoGainEnabled: enabled })}
                />
              </div>
              <div className="flex-1 overflow-y-auto p-3">
                <h2 className="text-[0.625rem] text-muted-foreground uppercase tracking-wide mb-2 flex items-center justify-between">
                  <span>Active Issues</span>
                  <span className="text-primary font-mono">{activeAdvisoryCount}</span>
                </h2>
                <IssuesList
                  advisories={advisories}
                  maxIssues={settings.maxDisplayedIssues}
                  dismissedIds={dismissedIds}
                  onDismiss={handleDismiss}
                  onClearAll={handleClearAllIssues}
                  onClearResolved={handleClearResolvedIssues}
                  touchFriendly
                />
              </div>
            </div>
          )}

          {/* Graph tab — RTA on top, GEQ on bottom (50/50 split) */}
          {mobileTab === 'graph' && (
            <div className="flex-1 flex flex-col gap-0.5 overflow-hidden p-0.5">
              {/* RTA — top half */}
              <div className="flex-1 min-h-0 bg-card/60 rounded-md border border-border overflow-hidden relative">
                <span className="absolute top-1 left-1.5 z-20 text-[0.5rem] text-muted-foreground/60 font-medium uppercase tracking-wide pointer-events-none">RTA</span>
                {hasActiveRTAMarkers && (
                  <button
                    onClick={handleClearRTA}
                    className="absolute top-1 right-1 z-20 px-2 py-0.5 rounded text-[0.5rem] font-medium bg-card/80 text-muted-foreground border border-border hover:text-foreground transition-colors"
                  >
                    Clear
                  </button>
                )}
                <SpectrumCanvas spectrumRef={spectrumRef} advisories={advisories} isRunning={isRunning} graphFontSize={settings.graphFontSize} onStart={!isRunning ? start : undefined} earlyWarning={earlyWarning} rtaDbMin={settings.rtaDbMin} rtaDbMax={settings.rtaDbMax} spectrumLineWidth={settings.spectrumLineWidth} clearedIds={rtaClearedIds} minFrequency={settings.minFrequency} maxFrequency={settings.maxFrequency} onFreqRangeChange={handleFreqRangeChange} showThresholdLine={settings.showThresholdLine} feedbackThresholdDb={settings.feedbackThresholdDb} />
              </div>
              {/* GEQ — bottom half */}
              <div className="flex-1 min-h-0 bg-card/60 rounded-md border border-border overflow-hidden relative">
                <span className="absolute top-1 left-1.5 z-20 text-[0.5rem] text-muted-foreground/60 font-medium uppercase tracking-wide pointer-events-none">GEQ</span>
                {hasActiveGEQBars && (
                  <button
                    onClick={handleClearGEQ}
                    className="absolute top-1 right-1 z-20 px-2 py-0.5 rounded text-[0.5rem] font-medium bg-card/80 text-muted-foreground border border-border hover:text-foreground transition-colors"
                  >
                    Clear
                  </button>
                )}
                <GEQBarView advisories={advisories} graphFontSize={settings.graphFontSize} clearedIds={geqClearedIds} />
              </div>
            </div>
          )}

          {/* Settings tab */}
          {mobileTab === 'settings' && (
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-background">
              <section>
                <h3 className="text-[0.625rem] text-muted-foreground uppercase tracking-wide mb-2">Input Gain</h3>
                <InputMeterSlider
                  value={settings.inputGainDb}
                  onChange={(v) => handleSettingsChange({ inputGainDb: v })}
                  level={inputLevel}
                  fullWidth
                  autoGainEnabled={isAutoGain}
                  autoGainDb={autoGainDb}
                  autoGainLocked={isAutoGainLocked}
                  onAutoGainToggle={(enabled) => handleSettingsChange({ autoGainEnabled: enabled })}
                />
              </section>
              <div className="border-t border-border" />
              <section>
                <h3 className="text-[0.625rem] text-muted-foreground uppercase tracking-wide mb-2">Detection Controls</h3>
                <DetectionControls settings={settings} onModeChange={handleModeChange} onSettingsChange={handleSettingsChange} />
              </section>
              <div className="border-t border-border" />
              <ResetConfirmDialog
                onConfirm={() => {
                  resetSettings()
                }}
                trigger={
                  <Button variant="outline" className="w-full h-11 text-sm font-medium">
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Reset to Defaults
                  </Button>
                }
              />
            </div>
          )}

        </div>

        {/* ── Desktop: Resizable panel layout (landscape only) ─── */}
        <div className="hidden landscape:flex flex-1 overflow-hidden">
          <ResizablePanelGroup key={layoutKey} direction="horizontal" autoSaveId="ktr-layout-main-v3">
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
                        onDismiss={handleDismiss}
                        onClearAll={handleClearAllIssues}
                      />
                    )}
                    {activeSidebarTab === 'controls' && (
                      <DetectionControls settings={settings} onModeChange={handleModeChange} onSettingsChange={handleSettingsChange} />
                    )}
                  </div>
                </div>
              </div>
            </ResizablePanel>

            {/* Only show handle when issues panel is open — prevents accidental drag-expand */}
            {issuesPanelOpen && <ResizableHandle withHandle />}

            {/* Issues side-panel (collapsible, between sidebar and graphs) */}
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
                {/* Header with close button */}
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
                {/* Issues list content */}
                <div className="flex-1 min-h-0 overflow-y-auto p-3">
                  <IssuesList
                    advisories={advisories}
                    maxIssues={settings.maxDisplayedIssues}
                    dismissedIds={dismissedIds}
                    onDismiss={handleDismiss}
                    onClearAll={handleClearAllIssues}
                  />
                </div>
              </div>
            </ResizablePanel>

            <ResizableHandle withHandle />

            {/* Graph area panel */}
            <ResizablePanel defaultSize={55}>
              <ResizablePanelGroup direction="vertical" autoSaveId="ktr-layout-vertical">
                {/* Top graph */}
                <ResizablePanel defaultSize={60} minSize={20} collapsible>
                  <div className="h-full p-1.5 pb-0.5">
                    <div className="h-full bg-card/60 rounded-lg border border-border overflow-hidden flex flex-col">
                      <div className="flex-shrink-0 flex items-center justify-between px-2 py-1 border-b border-border bg-muted/20">
                        <div className="flex items-center gap-1">
                          <GraphChipRow value={activeGraph} onChange={setActiveGraph} />
                          {activeGraph === 'rta' && hasActiveRTAMarkers && (
                            <button onClick={handleClearRTA} className="px-1.5 py-0.5 rounded text-[0.5rem] font-medium text-muted-foreground hover:text-foreground transition-colors">
                              Clear
                            </button>
                          )}
                          {activeGraph === 'geq' && hasActiveGEQBars && (
                            <button onClick={handleClearGEQ} className="px-1.5 py-0.5 rounded text-[0.5rem] font-medium text-muted-foreground hover:text-foreground transition-colors">
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
                      <div className="relative flex-1 min-h-0">
                        <div className={`absolute inset-0 transition-opacity duration-200 ${activeGraph === 'rta' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
                          <SpectrumCanvas spectrumRef={spectrumRef} advisories={advisories} isRunning={isRunning} graphFontSize={settings.graphFontSize} onStart={!isRunning ? start : undefined} earlyWarning={earlyWarning} rtaDbMin={settings.rtaDbMin} rtaDbMax={settings.rtaDbMax} spectrumLineWidth={settings.spectrumLineWidth} clearedIds={rtaClearedIds} minFrequency={settings.minFrequency} maxFrequency={settings.maxFrequency} onFreqRangeChange={handleFreqRangeChange} showThresholdLine={settings.showThresholdLine} feedbackThresholdDb={settings.feedbackThresholdDb} />
                        </div>
                        <div className={`absolute inset-0 transition-opacity duration-200 ${activeGraph === 'geq' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
                          <GEQBarView advisories={advisories} graphFontSize={settings.graphFontSize} clearedIds={geqClearedIds} />
                        </div>
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
                          <GraphChipRow value={bottomLeftGraph} onChange={setBottomLeftGraph} />
                          {bottomLeftGraph === 'rta' && hasActiveRTAMarkers && (
                            <button onClick={handleClearRTA} className="px-1.5 py-0.5 rounded text-[0.5rem] font-medium text-muted-foreground hover:text-foreground transition-colors">
                              Clear
                            </button>
                          )}
                          {bottomLeftGraph === 'geq' && hasActiveGEQBars && (
                            <button onClick={handleClearGEQ} className="px-1.5 py-0.5 rounded text-[0.5rem] font-medium text-muted-foreground hover:text-foreground transition-colors">
                              Clear
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="flex-1 min-h-0 pointer-events-none">
                        {bottomLeftGraph === 'rta' && <SpectrumCanvas spectrumRef={spectrumRef} advisories={advisories} isRunning={isRunning} graphFontSize={Math.max(10, settings.graphFontSize - 4)} earlyWarning={earlyWarning} rtaDbMin={settings.rtaDbMin} rtaDbMax={settings.rtaDbMax} spectrumLineWidth={settings.spectrumLineWidth} clearedIds={rtaClearedIds} minFrequency={settings.minFrequency} maxFrequency={settings.maxFrequency} onFreqRangeChange={handleFreqRangeChange} showThresholdLine={settings.showThresholdLine} feedbackThresholdDb={settings.feedbackThresholdDb} />}
                        {bottomLeftGraph === 'geq' && <GEQBarView advisories={advisories} graphFontSize={Math.max(10, settings.graphFontSize - 4)} clearedIds={geqClearedIds} />}
                      </div>
                    </div>
                  </div>
                </ResizablePanel>
              </ResizablePanelGroup>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>

      </div>

      {/* ── Mobile bottom tab bar (portrait only) ──────────────── */}
      <nav className="landscape:hidden flex-shrink-0 border-t border-border bg-card/80 backdrop-blur-sm" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <div className="flex items-stretch">
          {([
            { id: 'issues' as const, label: 'Issues', Icon: AlertTriangle, badge: activeAdvisoryCount },
            { id: 'graph' as const, label: 'Graph', Icon: BarChart3, badge: 0 },
            { id: 'settings' as const, label: 'Settings', Icon: Settings2, badge: 0 },
          ]).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setMobileTab(tab.id)}
              className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 min-h-[50px] transition-colors ${
                mobileTab === tab.id
                  ? 'text-primary'
                  : 'text-muted-foreground active:text-foreground'
              }`}
              aria-label={tab.label}
              aria-current={mobileTab === tab.id ? 'page' : undefined}
            >
              <div className="relative">
                <tab.Icon className="w-5 h-5" />
                {tab.badge > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 bg-primary text-primary-foreground text-[0.5rem] rounded-full min-w-[16px] h-[16px] flex items-center justify-center font-bold leading-none px-0.5">
                    {tab.badge}
                  </span>
                )}
              </div>
              <span className="text-[0.5625rem] font-medium leading-none">{tab.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
})
