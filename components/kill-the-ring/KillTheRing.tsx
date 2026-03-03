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
import { WaterfallCanvas } from './WaterfallCanvas'
import { SettingsPanel } from './SettingsPanel'
import { DetectionControls } from './DetectionControls'
import { HelpMenu } from './HelpMenu'
import { InputMeterSlider } from './InputMeterSlider'
import { ResetConfirmDialog } from './ResetConfirmDialog'
import { FeedbackHistoryPanel } from './FeedbackHistoryPanel'
import { AlgorithmStatusBar } from './AlgorithmStatusBar'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Menu, X, RotateCcw } from 'lucide-react'
import Link from 'next/link'
import type { Advisory, OperationMode } from '@/types/advisory'
import { OPERATION_MODES } from '@/lib/dsp/constants'
import { getEventLogger } from '@/lib/logging/eventLogger'

type GraphView = 'rta' | 'geq' | 'waterfall'

const GRAPH_CHIPS: { value: GraphView; label: string }[] = [
  { value: 'rta', label: 'RTA' },
  { value: 'geq', label: 'GEQ' },
  { value: 'waterfall', label: 'WTF' },
]

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
    settings,
    start,
    stop,
    updateSettings,
    resetSettings,
  } = useAudioAnalyzer()

  const [activeGraph, setActiveGraph] = useState<GraphView>('rta')
  const [bottomLeftGraph, setBottomLeftGraph] = useState<GraphView>('geq')
  const [bottomRightGraph, setBottomRightGraph] = useState<GraphView>('waterfall')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [mobileShowGraph, setMobileShowGraph] = useState(false)
  const [activeSidebarTab, setActiveSidebarTab] = useState<'issues' | 'notepad'>('issues')

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

  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [mobileMenuOpen])

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

  const handleModeChange = (mode: OperationMode) => {
    const modeSettings = OPERATION_MODES[mode]
    updateSettings({
      mode,
      feedbackThresholdDb: modeSettings.feedbackThreshold,
      ringThresholdDb: modeSettings.ringThreshold,
      growthRateThreshold: modeSettings.growthRateThreshold,
      musicAware: modeSettings.musicAware,
    })
    logger.logSettingsChanged({ mode, reason: 'mode_changed' })
  }

  const handleSettingsChange = useCallback((newSettings: Partial<typeof settings>) => {
    updateSettings(newSettings)
    loggerRef.current.logSettingsChanged(newSettings)
  }, [updateSettings])

  const inputLevel = spectrum?.peak ?? -60



  return (
    <div className="flex flex-col h-screen">
      {/* ─── KILL THE RING v2.1 ─────────────────────────────────────────────────
          Buildtime: 2026-02-28 | Bundler cache: invalidated
          Layout: Header + Mobile/Desktop content + Reset confirmation
          Graphs: GRAPH_CHIPS (RTA/GEQ/Waterfall) - NO window.innerWidth SSR access
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
                {!isRunning && (
                  <div 
                    className="absolute bottom-0 left-1/2 transform -translate-x-1/2"
                    style={{ transform: 'translateY(calc(100% + 12px))' }}
                  >
                    <span className="font-black whitespace-nowrap text-white leading-none" style={{ fontSize: '13px' }}>
                      START
                    </span>
                  </div>
                )}
              </button>
            </div>

            <div className="flex flex-col justify-center gap-[3px]">
              <div className="flex items-baseline gap-1.5 leading-none">
                <span className="text-lg font-black tracking-tight text-foreground">KILL THE</span>
                <span className="text-xl font-black tracking-tight text-primary">RING</span>
              </div>
              <span className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase leading-none">
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
              <span className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase leading-none">
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
            />
          </div>
        </div>

        {/* ── MOBILE Row 2: Action icons ───────────────────────────── */}
        {/* ── DESKTOP: Action icons (right side) ──────────────────── */}
        <div className="flex items-center justify-end gap-1 sm:gap-2 px-2 sm:px-0 pb-1 sm:pb-0 text-xs text-muted-foreground sm:flex-shrink-0">
          {noiseFloorDb !== null && (
            <span className="font-mono text-[9px] sm:text-[10px] hidden landscape:inline mr-auto sm:mr-0">
              Floor: {noiseFloorDb.toFixed(0)}dB
            </span>
          )}

          <FeedbackHistoryPanel />
          <HelpMenu />
          <SettingsPanel
            settings={settings}
            onSettingsChange={handleSettingsChange}
            onReset={() => {
              resetSettings()
              logger.logSettingsChanged({ action: 'reset_to_defaults' })
            }}
          />

          {/* Mobile: toggle graph vs controls */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setMobileShowGraph(!mobileShowGraph)}
            className="landscape:hidden h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            aria-label={mobileShowGraph ? 'Show controls' : 'Show graph'}
            title={mobileShowGraph ? 'Show controls' : 'Show graph'}
          >
            {mobileShowGraph ? (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              </svg>
            ) : (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="12 3 20 7.46 20 16.91 12 21 4 16.55 4 7"/>
                <polyline points="12 12.46 20 7.46"/>
                <polyline points="12 12.46 12 21"/>
                <polyline points="12 12.46 4 7.46"/>
              </svg>
            )}
          </Button>

          {/* Mobile hamburger */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setMobileMenuOpen(true)}
            className="landscape:hidden h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            aria-label="Open menu"
            aria-expanded={mobileMenuOpen}
          >
            <Menu className="w-5 h-5" />
          </Button>
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

      {/* ── Mobile full-screen overlay ─────────────────────────── */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-50 bg-background flex flex-col landscape:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Controls menu"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/80 backdrop-blur-sm flex-shrink-0">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-primary" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.31-2.5-4.06v8.12c1.48-.75 2.5-2.29 2.5-4.06zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
              </svg>
              <span className="text-sm font-semibold text-foreground">Controls</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMobileMenuOpen(false)}
              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
              aria-label="Close menu"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            <section>
              <h3 className="text-[10px] text-muted-foreground uppercase tracking-wide mb-3">Input Gain</h3>
              <InputMeterSlider
                value={settings.inputGainDb}
                onChange={(v) => handleSettingsChange({ inputGainDb: v })}
                level={inputLevel}
                fullWidth
              />
            </section>
            <div className="border-t border-border" />
            <section>
              <DetectionControls settings={settings} onModeChange={handleModeChange} onSettingsChange={handleSettingsChange} />
            </section>
            <div className="border-t border-border" />
            <section>
              <h2 className="text-[10px] text-muted-foreground uppercase tracking-wide mb-2 flex items-center justify-between">
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
            </section>
          </div>

          <div className="flex-shrink-0 border-t border-border p-4 space-y-2">
            <ResetConfirmDialog
              onConfirm={() => {
                resetSettings()
                logger.logSettingsChanged({ action: 'reset_to_defaults' })
                setMobileMenuOpen(false)
              }}
              trigger={
                <Button variant="outline" className="w-full h-10 text-sm font-medium">
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Reset to Defaults
                </Button>
              }
            />
            <Button
              variant="outline"
              className="w-full h-10 text-sm font-medium"
              onClick={() => setMobileMenuOpen(false)}
            >
              Done
            </Button>
          </div>
        </div>
      )}

      {/* ── Algorithm Status Bar (when enabled) ─────────────────── */}
      {settings.showAlgorithmScores && (
        <div className="border-b border-border bg-card/50 backdrop-blur-sm">
          <AlgorithmStatusBar
            algorithmMode={spectrum?.algorithmMode ?? settings.algorithmMode}
            contentType={spectrum?.contentType}
            msdFrameCount={spectrum?.msdFrameCount}
            isCompressed={spectrum?.isCompressed}
            compressionRatio={spectrum?.compressionRatio}
            isRunning={isRunning}
            showDetailed
          />
        </div>
      )}

      {/* ── Error banner ───────────────────────────────────────── */}
      {error && (
        <div className="px-4 py-1.5 bg-destructive/10 border-b border-destructive/20">
          <span className="text-xs text-destructive">{error}</span>
        </div>
      )}

      {/* ── Main Content ───────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Mobile: Controls + Issues panel (hidden when viewing graph) */}
        {!mobileShowGraph && (
          <div className="landscape:hidden flex-1 flex flex-col overflow-hidden bg-background">
            <div className="border-b border-border p-2 flex-shrink-0 bg-card/50">
              <InputMeterSlider
                value={settings.inputGainDb}
                onChange={(v) => handleSettingsChange({ inputGainDb: v })}
                level={inputLevel}
                compact
              />
            </div>
            <div className="border-b border-border p-3 flex-shrink-0 bg-card/50 overflow-y-auto max-h-48">
              <DetectionControls settings={settings} onModeChange={handleModeChange} onSettingsChange={handleSettingsChange} />
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <h2 className="text-[10px] text-muted-foreground uppercase tracking-wide mb-2 flex items-center justify-between">
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

        {/* Desktop: Always-visible left sidebar */}
        <aside className="hidden landscape:flex w-56 xl:w-64 2xl:w-72 flex-shrink-0 border-r border-border bg-card/50 flex-col overflow-hidden">
          <div className="flex-shrink-0 border-b border-border p-3">
            <DetectionControls settings={settings} onModeChange={handleModeChange} onSettingsChange={handleSettingsChange} />
          </div>
          {/* Issues / Notepad tab bar */}
          <div className="flex-shrink-0 flex border-b border-border">
            <button
              onClick={() => setActiveSidebarTab('issues')}
              className={`flex-1 py-1.5 text-[10px] font-medium uppercase tracking-wide transition-colors ${
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
              className={`flex-1 py-1.5 text-[10px] font-medium uppercase tracking-wide transition-colors ${
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
        </aside>

        {/* Graph area — full width on mobile (when mobileShowGraph), right panel on desktop */}
        <main className={`flex-1 flex flex-col overflow-hidden min-w-0 ${mobileShowGraph ? 'flex' : 'hidden landscape:flex'}`}>

          {/* Top: Large active graph (~60% height) */}
          <div className="flex-[3] min-h-0 p-1.5 sm:p-2 md:p-3 pb-0.5 sm:pb-1">
            <div className="h-full bg-card/60 rounded-lg border border-border overflow-hidden flex flex-col">
              <div className="flex-shrink-0 flex items-center justify-between px-2 py-1 border-b border-border bg-muted/20 gap-2">
                <div className="flex items-center gap-1">
                  {GRAPH_CHIPS.map((chip) => (
                    <button
                      key={chip.value}
                      onClick={() => setActiveGraph(chip.value)}
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-medium border transition-colors ${
                        activeGraph === chip.value
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-transparent text-muted-foreground border-border hover:border-primary/50 hover:text-foreground'
                      }`}
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
                <span className="text-[9px] sm:text-[10px] text-muted-foreground font-mono whitespace-nowrap flex-shrink-0">
                  {isRunning && spectrum?.noiseFloorDb != null
                    ? `${spectrum.noiseFloorDb.toFixed(0)}dB`
                    : 'Ready'}
                </span>
              </div>
              <div className="relative flex-1 min-h-0">
                <div className={`absolute inset-0 transition-opacity duration-200 ${activeGraph === 'rta' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
                  <SpectrumCanvas spectrum={spectrum} advisories={advisories} isRunning={isRunning} graphFontSize={settings.graphFontSize} />
                </div>
                <div className={`absolute inset-0 transition-opacity duration-200 ${activeGraph === 'geq' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
                  <GEQBarView advisories={advisories} graphFontSize={settings.graphFontSize} />
                </div>
                <div className={`absolute inset-0 transition-opacity duration-200 ${activeGraph === 'waterfall' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
                  <WaterfallCanvas spectrum={spectrum} isRunning={isRunning} graphFontSize={settings.graphFontSize} />
                </div>
              </div>
            </div>
          </div>

          {/* Mobile graph pill switcher */}
          <div className="flex landscape:hidden items-center gap-2 px-2 pb-1.5 pt-0.5 flex-shrink-0">
            {GRAPH_CHIPS.map((chip) => (
              <button
                key={chip.value}
                onClick={() => setActiveGraph(chip.value)}
                className={`flex-1 py-1.5 rounded-full text-[10px] font-medium border transition-colors ${
                  activeGraph === chip.value
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-card/60 text-muted-foreground border-border hover:border-primary/50 hover:text-foreground'
                }`}
              >
                {chip.label}
              </button>
            ))}
          </div>

          {/* Bottom row: GEQ + Waterfall always visible (~40% height), tablet and up */}
          <div className="hidden landscape:flex flex-[2] min-h-0 gap-1.5 landscape:gap-2 p-1.5 landscape:p-3 pt-0.5 landscape:pt-1">
            {/* Bottom-Left Graph */}
            <div className="flex-1 bg-card/60 rounded-lg border border-border overflow-hidden flex flex-col min-w-0">
              <div className="flex-shrink-0 px-2 py-1 border-b border-border bg-muted/20 flex items-center gap-1">
                <div className="flex items-center gap-1 flex-wrap">
                  {GRAPH_CHIPS.map((chip) => (
                    <button
                      key={`bottom-left-${chip.value}`}
                      onClick={() => setBottomLeftGraph(chip.value)}
                      className={`px-2 py-0.5 rounded-full text-[9px] font-medium border transition-colors whitespace-nowrap ${
                        bottomLeftGraph === chip.value
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-transparent text-muted-foreground border-border hover:border-primary/50 hover:text-foreground'
                      }`}
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex-1 min-h-0 pointer-events-none">
                {bottomLeftGraph === 'rta' && <SpectrumCanvas spectrum={spectrum} advisories={advisories} isRunning={isRunning} graphFontSize={Math.max(10, settings.graphFontSize - 4)} />}
                {bottomLeftGraph === 'geq' && <GEQBarView advisories={advisories} graphFontSize={Math.max(10, settings.graphFontSize - 4)} />}
                {bottomLeftGraph === 'waterfall' && <WaterfallCanvas spectrum={spectrum} isRunning={isRunning} graphFontSize={Math.max(10, settings.graphFontSize - 4)} />}
              </div>
            </div>
            {/* Bottom-Right Graph */}
            <div className="flex-1 bg-card/60 rounded-lg border border-border overflow-hidden flex flex-col min-w-0">
              <div className="flex-shrink-0 px-2 py-1 border-b border-border bg-muted/20 flex items-center gap-1">
                <div className="flex items-center gap-1 flex-wrap">
                  {GRAPH_CHIPS.map((chip) => (
                    <button
                      key={`bottom-right-${chip.value}`}
                      onClick={() => setBottomRightGraph(chip.value)}
                      className={`px-2 py-0.5 rounded-full text-[9px] font-medium border transition-colors whitespace-nowrap ${
                        bottomRightGraph === chip.value
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-transparent text-muted-foreground border-border hover:border-primary/50 hover:text-foreground'
                      }`}
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex-1 min-h-0 pointer-events-none">
                {bottomRightGraph === 'rta' && <SpectrumCanvas spectrum={spectrum} advisories={advisories} isRunning={isRunning} graphFontSize={Math.max(10, settings.graphFontSize - 4)} />}
                {bottomRightGraph === 'geq' && <GEQBarView advisories={advisories} graphFontSize={Math.max(10, settings.graphFontSize - 4)} />}
                {bottomRightGraph === 'waterfall' && <WaterfallCanvas spectrum={spectrum} isRunning={isRunning} graphFontSize={Math.max(10, settings.graphFontSize - 4)} />}
              </div>
            </div>
          </div>

        </main>
      </div>
    </div>
  )
})
