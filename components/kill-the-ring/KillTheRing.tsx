'use client'

// BUILD v3.0 - Force Full Rebuild (Cache Buster)
// This version fixes: window.innerWidth SSR error, GRAPH_LABELS undefined, sidebarOpen JSX
// Guaranteed correct: GRAPH_CHIPS usage, CSS-only layout, no SSR window access
// Built: 2026-02-28

import { useEffect, useState, useCallback, useRef, memo } from 'react'
import { useAudioAnalyzer } from '@/hooks/useAudioAnalyzer'
import { useAdvisoryLogging } from '@/hooks/useAdvisoryLogging'
import { IssuesList } from './IssuesList'
import { EQNotepad, advisoryToPin, type PinnedCut } from './EQNotepad'
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
import { RotateCcw, LayoutGrid, AlertTriangle, BarChart3, Settings2 } from 'lucide-react'
import type { Advisory, OperationMode } from '@/types/advisory'
import { OPERATION_MODES } from '@/lib/dsp/constants'
import { getEventLogger } from '@/lib/logging/eventLogger'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable'

type GraphView = 'rta' | 'geq' | 'controls'

const GRAPH_CHIPS: { value: GraphView; label: string }[] = [
  { value: 'rta', label: 'RTA' },
  { value: 'geq', label: 'GEQ' },
  { value: 'controls', label: 'Controls' },
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
    spectrum,
    advisories,
    earlyWarning,
    settings,
    start,
    stop,
    updateSettings,
    resetSettings,
  } = useAudioAnalyzer()

  const [activeGraph, setActiveGraph] = useState<GraphView>('rta')
  const [bottomLeftGraph, setBottomLeftGraph] = useState<GraphView>('geq')
  const [bottomRightGraph, setBottomRightGraph] = useState<GraphView>('controls')
  const [mobileTab, setMobileTab] = useState<'issues' | 'graph' | 'settings'>('issues')
  const [activeSidebarTab, setActiveSidebarTab] = useState<'issues' | 'notepad'>('issues')
  const [layoutKey, setLayoutKey] = useState(0)

  // Applied cuts state (EQ Notepad)
  const [pinnedCuts, setPinnedCuts] = useState<PinnedCut[]>([])
  const appliedIdsRef = useRef<Set<string>>(new Set())

  // Dismissed advisory IDs — hidden until the advisory disappears and a new one is detected
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())

  const handleDismiss = useCallback((id: string) => {
    setDismissedIds((prev) => new Set(prev).add(id))
  }, [])

  // Auto-expire dismissed IDs once the advisory is no longer in the live list
  useEffect(() => {
    if (dismissedIds.size === 0) return
    const liveIds = new Set(advisories.map((a) => a.id))
    setDismissedIds((prev) => {
      const next = new Set<string>()
      prev.forEach((id) => { if (liveIds.has(id)) next.add(id) })
      return next.size === prev.size ? prev : next
    })
  }, [advisories, dismissedIds.size])

  const handleApply = useCallback((advisory: Advisory) => {
    if (appliedIdsRef.current.has(advisory.id)) return
    const pin = advisoryToPin(advisory)
    if (!pin) return
    appliedIdsRef.current.add(advisory.id)
    setPinnedCuts((prev) => [...prev, pin])
  }, [])

  const handleRemovePin = useCallback((id: string) => {
    appliedIdsRef.current.delete(id)
    setPinnedCuts((prev) => prev.filter((p) => p.id !== id))
  }, [])

  const handleClearPins = useCallback(() => {
    appliedIdsRef.current.clear()
    setPinnedCuts([])
  }, [])

  // Auto music-aware: watch spectrum.peak vs noise floor
  const autoMusicDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!settings.autoMusicAware || !isRunning) return
    const peak = spectrum?.peak ?? -100
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
  }, [spectrum?.peak, noiseFloorDb, settings.autoMusicAware, settings.musicAware, settings.autoMusicAwareHysteresisDb, isRunning, updateSettings])

  const loggerRef = useRef(getEventLogger())
  const logger = loggerRef.current
  const sessionIdRef = useRef<string | null>(null)
  const lastFlushedRef = useRef<number>(0)

  const flushEventsToDB = useCallback(async (sessionId: string) => {
    const allLogs = loggerRef.current.getLogs()
    const newLogs = allLogs.slice(lastFlushedRef.current)
    if (newLogs.length === 0) return
    lastFlushedRef.current = allLogs.length
    try {
      await fetch(`/api/sessions/${sessionId}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: newLogs }),
      })
    } catch {
      // Non-fatal: events remain in-memory
    }
  }, [])

  // Session start/stop effect - only depends on isRunning to prevent orphan sessions
  // Settings changes while running should NOT create new sessions
  useEffect(() => {
    if (isRunning) {
      logger.logAnalysisStarted({ mode: settings.mode, fftSize: settings.fftSize })
      const newId = crypto.randomUUID()
      lastFlushedRef.current = 0
      // Only register the session ID once the server confirms the session exists,
      // so flush and stop handlers never write events to a non-existent session.
      fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: newId, mode: settings.mode, fftSize: settings.fftSize }),
      })
        .then((res) => { if (res.ok) sessionIdRef.current = newId })
        .catch(() => {})
    } else {
      logger.logAnalysisStopped()
      const sid = sessionIdRef.current
      if (sid) {
        flushEventsToDB(sid).then(() => {
          fetch(`/api/sessions/${sid}`, { method: 'PATCH' }).catch(() => {})
        })
        sessionIdRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally only react to isRunning
  }, [isRunning])

  useEffect(() => {
    if (!isRunning) return
    const interval = setInterval(() => {
      if (sessionIdRef.current) flushEventsToDB(sessionIdRef.current)
    }, 30_000)
    return () => clearInterval(interval)
  }, [isRunning, flushEventsToDB])

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
      localStorage.removeItem('react-resizable-panels:ktr-layout-vertical')
      localStorage.removeItem('react-resizable-panels:ktr-layout-bottom')
      localStorage.removeItem(LAYOUT_PREFS_KEY)
    } catch {}
    setActiveGraph('rta')
    setBottomLeftGraph('geq')
    setBottomRightGraph('controls')
    setLayoutKey(k => k + 1)
  }, [])

  const handleModeChange = (mode: OperationMode) => {
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
    logger.logSettingsChanged({ mode, reason: 'mode_changed' })
  }

  const handleSettingsChange = useCallback((newSettings: Partial<typeof settings>) => {
    updateSettings(newSettings)
    loggerRef.current.logSettingsChanged(newSettings)
  }, [updateSettings])

  const inputLevel = spectrum?.peak ?? -60
  const autoGainDb = spectrum?.autoGainDb
  const isAutoGain = spectrum?.autoGainEnabled ?? settings.autoGainEnabled



  return (
    <div className="flex flex-col h-screen">
      {/* ─── KILL THE RING v2.1 ─────────────────────────────────────────────────
          Buildtime: 2026-02-28 | Bundler cache: invalidated
          Layout: Header + Mobile/Desktop content + Reset confirmation
          Graphs: GRAPH_CHIPS (RTA/GEQ/Controls) - NO window.innerWidth SSR access
          ──────────────────────────────────────────────────────────────────────── */}

      {/* ── Header ─────────────────────────────────────────────── */}
      {/* Mobile: two-row stacked layout with full-height circle button */}
      {/* Desktop (sm:): single-row layout, logo left, actions right    */}
      <header className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-border bg-card/80 backdrop-blur-sm sm:px-4 sm:py-2 sm:gap-4">

        {/* ── MOBILE Row 1: Logo wordmark (right-aligned, above icons) ── */}
        {/* ── DESKTOP: Logo + button group (left side) ───────────────── */}
        <div className="flex items-stretch justify-end pr-12 px-2 gap-2 h-10 sm:h-auto sm:justify-start sm:pr-0 sm:px-0 sm:gap-3 sm:flex-shrink-0">

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
                Don Wells AV
              </span>
            </div>
          </div>

          {/* Mobile-only: wordmark (button is the absolute circle) */}
          <div className="flex sm:hidden items-center gap-0">
            <div className="flex flex-col justify-center gap-0">
              <div className="flex items-baseline gap-1.5 leading-none">
                <span className="text-lg font-black tracking-tight text-foreground">KILL THE</span>
                <span className="text-xl font-black tracking-tight text-primary">RING</span>
              </div>
              <span className="text-[0.625rem] font-semibold tracking-wider text-muted-foreground uppercase leading-none">
                Don Wells AV
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
              onAutoGainToggle={(enabled) => handleSettingsChange({ autoGainEnabled: enabled })}
            />
          </div>
        </div>

        {/* ── MOBILE Row 2: Action icons ───────────────────────────── */}
        {/* ── DESKTOP: Action icons (right side) ──────────────────── */}
        <div className="flex items-center justify-end gap-1 sm:gap-2 px-2 sm:px-0 text-xs text-muted-foreground sm:flex-shrink-0">
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

          <FeedbackHistoryPanel />
          <HelpMenu />
          <SettingsPanel
            settings={settings}
            onSettingsChange={handleSettingsChange}
            onModeChange={handleModeChange}
            onReset={() => {
              resetSettings()
              logger.logSettingsChanged({ action: 'reset_to_defaults' })
            }}
          />

        </div>

        {/* Mobile-only: full-height circle button flush left */}
        <TooltipProvider delayDuration={400}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={isRunning ? stop : start}
                aria-label={isRunning ? 'Stop analysis' : 'Start analysis'}
                className="sm:hidden absolute left-1 top-0 bottom-0 aspect-square flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset rounded-full"
              >
                <div className={`absolute inset-[6px] rounded-full border-2 transition-colors duration-300 ${isRunning ? 'border-primary' : 'border-primary/50'}`} />
                {isRunning && (
                  <div className="absolute inset-[6px] rounded-full border-2 border-primary animate-ping opacity-30" />
                )}
                <svg
                  className={`w-5 h-5 relative z-10 transition-colors duration-300 ${isRunning ? 'text-primary' : 'text-primary/60 hover:text-primary'}`}
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.31-2.5-4.06v8.12c1.48-.75 2.5-2.29 2.5-4.06zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                </svg>
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {isRunning ? 'Stop analysis' : 'Start analysis'}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
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
                  onAutoGainToggle={(enabled) => handleSettingsChange({ autoGainEnabled: enabled })}
                />
              </div>
              <div className="flex-1 overflow-y-auto p-3">
                <h2 className="text-[0.625rem] text-muted-foreground uppercase tracking-wide mb-2 flex items-center justify-between">
                  <span>Active Issues</span>
                  <span className="text-primary font-mono">{advisories.length}</span>
                </h2>
                <IssuesList
                  advisories={advisories}
                  maxIssues={settings.maxDisplayedIssues}
                  appliedIds={appliedIdsRef.current}
                  dismissedIds={dismissedIds}
                  onApply={handleApply}
                  onDismiss={handleDismiss}
                />
              </div>
            </div>
          )}

          {/* Graph tab */}
          {mobileTab === 'graph' && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 min-h-0 p-1.5 pb-0.5">
                <div className="h-full bg-card/60 rounded-lg border border-border overflow-hidden flex flex-col">
                  <div className="relative flex-1 min-h-0">
                    <div className={`absolute inset-0 transition-opacity duration-200 ${activeGraph === 'rta' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
                      <SpectrumCanvas spectrum={spectrum} advisories={advisories} isRunning={isRunning} graphFontSize={settings.graphFontSize} onStart={!isRunning ? start : undefined} earlyWarning={earlyWarning} rtaDbMin={settings.rtaDbMin} rtaDbMax={settings.rtaDbMax} spectrumLineWidth={settings.spectrumLineWidth} />
                    </div>
                    <div className={`absolute inset-0 transition-opacity duration-200 ${activeGraph === 'geq' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
                      <GEQBarView advisories={advisories} graphFontSize={settings.graphFontSize} />
                    </div>
                    <div className={`absolute inset-0 transition-opacity duration-200 ${activeGraph === 'controls' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
                      <div className="h-full p-4 overflow-y-auto">
                        <DetectionControls settings={settings} onModeChange={handleModeChange} onSettingsChange={handleSettingsChange} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              {/* Graph type pills */}
              <div className="flex items-center gap-2 px-2 pb-1.5 pt-0.5 flex-shrink-0">
                {GRAPH_CHIPS.map((chip) => (
                  <button
                    key={chip.value}
                    onClick={() => setActiveGraph(chip.value)}
                    className={`flex-1 py-2.5 min-h-[44px] rounded-full text-[0.625rem] font-medium border transition-colors ${
                      activeGraph === chip.value
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-card/60 text-muted-foreground border-border hover:border-primary/50 hover:text-foreground'
                    }`}
                  >
                    {chip.label}
                  </button>
                ))}
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
                  logger.logSettingsChanged({ action: 'reset_to_defaults' })
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
          <ResizablePanelGroup key={layoutKey} direction="horizontal" autoSaveId="ktr-layout-main">
            {/* Sidebar panel */}
            <ResizablePanel defaultSize={15} minSize={8} maxSize={30} collapsible>
              <div className="flex flex-col h-full bg-card/50 overflow-hidden">
                {/* Algorithm status */}
                <div className="flex-shrink-0 border-b border-border p-2">
                  <AlgorithmStatusBar
                    algorithmMode={spectrum?.algorithmMode ?? settings.algorithmMode}
                    contentType={spectrum?.contentType}
                    msdFrameCount={spectrum?.msdFrameCount}
                    isCompressed={spectrum?.isCompressed}
                    compressionRatio={spectrum?.compressionRatio}
                    isRunning={isRunning}
                    showDetailed={settings.showAlgorithmScores}
                  />
                </div>
                {/* Issues / Notepad tab bar */}
                <div className="flex-shrink-0 flex border-b border-border">
                  <button
                    onClick={() => setActiveSidebarTab('issues')}
                    className={`flex-1 py-1.5 text-[0.625rem] font-medium uppercase tracking-wide transition-colors ${
                      activeSidebarTab === 'issues'
                        ? 'text-foreground border-b-2 border-primary'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Issues
                    {advisories.length > 0 && (
                      <span className="ml-1 font-mono text-primary">{advisories.length}</span>
                    )}
                  </button>
                  <button
                    onClick={() => setActiveSidebarTab('notepad')}
                    className={`flex-1 py-1.5 text-[0.625rem] font-medium uppercase tracking-wide transition-colors ${
                      activeSidebarTab === 'notepad'
                        ? 'text-foreground border-b-2 border-primary'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    EQ Notepad
                    {pinnedCuts.length > 0 && (
                      <span className="ml-1 font-mono text-primary">{pinnedCuts.length}</span>
                    )}
                  </button>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto p-3">
                  {activeSidebarTab === 'issues' ? (
                    <IssuesList
                      advisories={advisories}
                      maxIssues={settings.maxDisplayedIssues}
                      appliedIds={appliedIdsRef.current}
                      dismissedIds={dismissedIds}
                      onApply={handleApply}
                      onDismiss={handleDismiss}
                    />
                  ) : (
                    <EQNotepad
                      pins={pinnedCuts}
                      onRemove={handleRemovePin}
                      onClear={handleClearPins}
                    />
                  )}
                </div>
              </div>
            </ResizablePanel>

            <ResizableHandle withHandle />

            {/* Graph area panel */}
            <ResizablePanel defaultSize={85}>
              <ResizablePanelGroup direction="vertical" autoSaveId="ktr-layout-vertical">
                {/* Top graph */}
                <ResizablePanel defaultSize={60} minSize={20} collapsible>
                  <div className="h-full p-1.5 pb-0.5">
                    <div className="h-full bg-card/60 rounded-lg border border-border overflow-hidden flex flex-col">
                      <div className="flex-shrink-0 flex items-center justify-between px-2 py-1 border-b border-border bg-muted/20">
                        <GraphChipRow value={activeGraph} onChange={setActiveGraph} />
                        <span className="text-[0.625rem] text-muted-foreground font-mono whitespace-nowrap">
                          {isRunning && spectrum?.noiseFloorDb != null
                            ? `${spectrum.noiseFloorDb.toFixed(0)}dB`
                            : 'Ready'}
                        </span>
                      </div>
                      <div className="relative flex-1 min-h-0">
                        <div className={`absolute inset-0 transition-opacity duration-200 ${activeGraph === 'rta' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
                          <SpectrumCanvas spectrum={spectrum} advisories={advisories} isRunning={isRunning} graphFontSize={settings.graphFontSize} onStart={!isRunning ? start : undefined} earlyWarning={earlyWarning} rtaDbMin={settings.rtaDbMin} rtaDbMax={settings.rtaDbMax} spectrumLineWidth={settings.spectrumLineWidth} />
                        </div>
                        <div className={`absolute inset-0 transition-opacity duration-200 ${activeGraph === 'geq' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
                          <GEQBarView advisories={advisories} graphFontSize={settings.graphFontSize} />
                        </div>
                        <div className={`absolute inset-0 transition-opacity duration-200 ${activeGraph === 'controls' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
                          <div className="h-full p-4 overflow-y-auto">
                            <DetectionControls settings={settings} onModeChange={handleModeChange} onSettingsChange={handleSettingsChange} />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </ResizablePanel>

                <ResizableHandle withHandle />

                {/* Bottom row */}
                <ResizablePanel defaultSize={40} minSize={15} collapsible>
                  <ResizablePanelGroup direction="horizontal" autoSaveId="ktr-layout-bottom">
                    {/* Bottom-Left */}
                    <ResizablePanel defaultSize={50} minSize={20} collapsible>
                      <div className="h-full p-1.5 pt-0.5">
                        <div className="h-full bg-card/60 rounded-lg border border-border overflow-hidden flex flex-col min-w-0">
                          <div className="flex-shrink-0 flex items-center px-2 py-0.5 border-b border-border bg-muted/20">
                            <GraphChipRow value={bottomLeftGraph} onChange={setBottomLeftGraph} />
                          </div>
                          <div className="flex-1 min-h-0 pointer-events-none">
                            {bottomLeftGraph === 'rta' && <SpectrumCanvas spectrum={spectrum} advisories={advisories} isRunning={isRunning} graphFontSize={Math.max(10, settings.graphFontSize - 4)} earlyWarning={earlyWarning} rtaDbMin={settings.rtaDbMin} rtaDbMax={settings.rtaDbMax} spectrumLineWidth={settings.spectrumLineWidth} />}
                            {bottomLeftGraph === 'geq' && <GEQBarView advisories={advisories} graphFontSize={Math.max(10, settings.graphFontSize - 4)} />}
                            {bottomLeftGraph === 'controls' && (
                              <div className="h-full p-3 overflow-y-auto pointer-events-auto">
                                <DetectionControls settings={settings} onModeChange={handleModeChange} onSettingsChange={handleSettingsChange} />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </ResizablePanel>

                    <ResizableHandle withHandle />

                    {/* Bottom-Right */}
                    <ResizablePanel defaultSize={50} minSize={20} collapsible>
                      <div className="h-full p-1.5 pt-0.5">
                        <div className="h-full bg-card/60 rounded-lg border border-border overflow-hidden flex flex-col min-w-0">
                          <div className="flex-shrink-0 flex items-center px-2 py-0.5 border-b border-border bg-muted/20">
                            <GraphChipRow value={bottomRightGraph} onChange={setBottomRightGraph} />
                          </div>
                          <div className="flex-1 min-h-0 pointer-events-none">
                            {bottomRightGraph === 'rta' && <SpectrumCanvas spectrum={spectrum} advisories={advisories} isRunning={isRunning} graphFontSize={Math.max(10, settings.graphFontSize - 4)} earlyWarning={earlyWarning} rtaDbMin={settings.rtaDbMin} rtaDbMax={settings.rtaDbMax} spectrumLineWidth={settings.spectrumLineWidth} />}
                            {bottomRightGraph === 'geq' && <GEQBarView advisories={advisories} graphFontSize={Math.max(10, settings.graphFontSize - 4)} />}
                            {bottomRightGraph === 'controls' && (
                              <div className="h-full p-3 overflow-y-auto pointer-events-auto">
                                <DetectionControls settings={settings} onModeChange={handleModeChange} onSettingsChange={handleSettingsChange} />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </ResizablePanel>
                  </ResizablePanelGroup>
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
            { id: 'issues' as const, label: 'Issues', Icon: AlertTriangle, badge: advisories.length },
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
