'use client'

import { memo, useRef, useCallback, useEffect, useMemo, useState } from 'react'
import { IssuesList } from './IssuesList'
import { RingOutWizard } from './RingOutWizard'
import { EarlyWarningPanel } from './EarlyWarningPanel'
import { SpectrumCanvas } from './SpectrumCanvas'
import { GEQBarView } from './GEQBarView'
import { SettingsPanel, type DataCollectionTabProps } from './settings/SettingsPanel'
import { LandscapeSettingsSheet } from './LandscapeSettingsSheet'
import { ErrorBoundary } from './ErrorBoundary'
import { InputMeterSlider } from './InputMeterSlider'
import { SingleFader } from './SingleFader'
import type { FaderGuidance } from './SingleFader'
import { useEngine } from '@/contexts/EngineContext'
import { useSettings } from '@/contexts/SettingsContext'
import { useMetering } from '@/contexts/MeteringContext'
import { useAdvisories } from '@/contexts/AdvisoryContext'
import { useUI } from '@/contexts/UIContext'
import { AlertTriangle, Settings2, Expand, Shrink } from 'lucide-react'
import type { DetectorSettings } from '@/types/advisory'
import type { CalibrationTabProps } from './settings/CalibrationTab'
import { MOBILE_MAX_DISPLAYED_ISSUES } from '@/lib/dsp/constants'
import { useThresholdChange } from '@/hooks/useThresholdChange'
import { useLowSignal } from '@/hooks/useLowSignal'
import { useRoomModes } from '@/hooks/useRoomModes'

const TAB_ORDER = ['issues', 'settings'] as const

/** Light haptic tap — silently no-ops on unsupported devices */
function haptic(ms = 10) {
  try { navigator?.vibrate?.(ms) } catch { /* unsupported */ }
}

interface MobileLayoutProps {
  calibration?: Omit<CalibrationTabProps, 'settings' | 'onSettingsChange'>
  dataCollection?: DataCollectionTabProps
  isWizardActive?: boolean
  onStartWizard?: () => void
  onFinishWizard?: () => void
  onStartRingOut?: () => void
}

export const MobileLayout = memo(function MobileLayout({
  calibration,
  dataCollection,
  isWizardActive, onStartWizard, onFinishWizard, onStartRingOut,
}: MobileLayoutProps) {
  const { isRunning, isStarting, error, start, stop } = useEngine()
  const { settings, handleModeChange, resetSettings, handleFreqRangeChange, setInputGain, setAutoGain, updateDisplay, setSensitivityOffset, session } = useSettings()
  const { spectrumRef, inputLevel, isAutoGain, autoGainDb, autoGainLocked, noiseFloorDb } = useMetering()
  const isLowSignal = useLowSignal(isRunning, inputLevel)

  const { isFrozen, toggleFreeze, mobileTab, setMobileTab, rtaContainerRef, isRtaFullscreen, toggleRtaFullscreen } = useUI()


  const handleThresholdChange = useThresholdChange(session, setSensitivityOffset)

  // ── Mobile fader: local mode toggle (gain ↔ sensitivity) ──────────────────
  const [mobileFaderMode, setMobileFaderMode] = useState<'gain' | 'sensitivity'>('sensitivity')
  const mobileFaderValue = mobileFaderMode === 'sensitivity' ? settings.feedbackThresholdDb : settings.inputGainDb
  const mobileFaderOnChange = useCallback((db: number) => {
    if (mobileFaderMode === 'sensitivity') {
      handleThresholdChange(db)
    } else {
      if (isAutoGain) setAutoGain(false)
      setInputGain(db)
    }
  }, [mobileFaderMode, handleThresholdChange, isAutoGain, setAutoGain, setInputGain])

  const roomModes = useRoomModes(settings)

  // Memoized config objects for SpectrumCanvas — avoids creating new objects on every render
  const spectrumDisplay = useMemo(() => ({
    graphFontSize: settings.graphFontSize, rtaDbMin: settings.rtaDbMin, rtaDbMax: settings.rtaDbMax,
    spectrumLineWidth: settings.spectrumLineWidth, canvasTargetFps: settings.canvasTargetFps,
    showFreqZones: settings.showFreqZones, showRoomModeLines: settings.showRoomModeLines,
    showThresholdLine: settings.showThresholdLine, spectrumWarmMode: settings.spectrumWarmMode,
  }), [settings.graphFontSize, settings.rtaDbMin, settings.rtaDbMax, settings.spectrumLineWidth, settings.canvasTargetFps, settings.showFreqZones, settings.showRoomModeLines, settings.showThresholdLine, settings.spectrumWarmMode])

  const spectrumRange = useMemo(() => ({
    minFrequency: settings.minFrequency, maxFrequency: settings.maxFrequency,
    feedbackThresholdDb: settings.feedbackThresholdDb,
  }), [settings.minFrequency, settings.maxFrequency, settings.feedbackThresholdDb])

  const spectrumLifecycle = useMemo(() => ({
    isRunning, isStarting, error,
  }), [isRunning, isStarting, error])

  const spectrumLifecycleWithStart = useMemo(() => ({
    isRunning, isStarting, error,
    onStart: !isRunning && !isStarting ? start : undefined,
  }), [isRunning, isStarting, error, start])

  const {
    advisories, activeAdvisoryCount, earlyWarning,
    dismissedIds, onDismiss, onClearAll, onClearResolved,
    rtaClearedIds, geqClearedIds,
    hasActiveRTAMarkers, hasActiveGEQBars,
    onClearRTA, onClearGEQ,
    onFalsePositive, falsePositiveIds,
    onConfirmFeedback, confirmedIds,
  } = useAdvisories()

  // Sensitivity guidance for mobile fader
  const mobileNoDetectionSecsRef = useRef(0)
  const [mobileProlongedSilence, setMobileProlongedSilence] = useState(false)
  useEffect(() => {
    if (!isRunning || mobileFaderMode !== 'sensitivity') {
      mobileNoDetectionSecsRef.current = 0
      setMobileProlongedSilence(false)
      return
    }
    const id = setInterval(() => {
      if (activeAdvisoryCount > 0 || inputLevel < -45) {
        mobileNoDetectionSecsRef.current = 0
        if (mobileProlongedSilence) setMobileProlongedSilence(false)
      } else {
        mobileNoDetectionSecsRef.current++
        if (mobileNoDetectionSecsRef.current >= 2 && !mobileProlongedSilence) setMobileProlongedSilence(true)
      }
    }, 1000)
    return () => clearInterval(id)
  }, [isRunning, mobileFaderMode, activeAdvisoryCount, inputLevel, mobileProlongedSilence])

  const mobileGuidance: FaderGuidance = useMemo(() => {
    if (mobileFaderMode !== 'sensitivity' || !isRunning) return { direction: 'none', urgency: 'none' }
    if (activeAdvisoryCount >= 3) return { direction: 'down', urgency: 'warning' }
    if (mobileProlongedSilence && settings.feedbackThresholdDb > 20) return { direction: 'up', urgency: 'hint' }
    if (settings.feedbackThresholdDb > 35) return { direction: 'up', urgency: settings.feedbackThresholdDb >= 42 ? 'warning' : 'hint' }
    if (settings.feedbackThresholdDb < 10) return { direction: 'down', urgency: settings.feedbackThresholdDb <= 5 ? 'warning' : 'hint' }
    return { direction: 'none', urgency: 'none' }
  }, [mobileFaderMode, isRunning, activeAdvisoryCount, mobileProlongedSilence, settings.feedbackThresholdDb])

  // Inline graph — mode and resizable height
  const [inlineGraphMode, setInlineGraphMode] = useState<'rta' | 'geq'>('rta')
  const [graphHeightVh, setGraphHeightVh] = useState(28)
  const resizeDragRef = useRef<{ startY: number; startH: number } | null>(null)
  const graphTouchStart = useRef<{ x: number; y: number } | null>(null)

  const onGraphTouchStart = useCallback((e: React.TouchEvent) => {
    graphTouchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }, [])

  const onGraphTouchEnd = useCallback((e: React.TouchEvent) => {
    const start = graphTouchStart.current
    if (!start) return
    graphTouchStart.current = null
    const dx = e.changedTouches[0].clientX - start.x
    const dy = e.changedTouches[0].clientY - start.y
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return
    setInlineGraphMode(dx < 0 ? 'geq' : 'rta')
  }, [])

  // Resize handle for inline graph height
  const onResizeStart = useCallback((e: React.TouchEvent) => {
    resizeDragRef.current = { startY: e.touches[0].clientY, startH: graphHeightVh }
  }, [graphHeightVh])

  const onResizeMove = useCallback((e: React.TouchEvent) => {
    if (!resizeDragRef.current) return
    // touch-none on the handle element prevents scrolling; no preventDefault() needed
    const deltaY = e.touches[0].clientY - resizeDragRef.current.startY
    const deltaVh = (deltaY / window.innerHeight) * 100
    const newH = Math.min(40, Math.max(8, resizeDragRef.current.startH + deltaVh))
    setGraphHeightVh(newH)
  }, [])

  const onResizeEnd = useCallback(() => {
    resizeDragRef.current = null
  }, [])

  // Limit advisories to top 5 most problematic on mobile (already sorted by urgency + amplitude)
  const mobileAdvisories = useMemo(
    () => advisories.slice(0, MOBILE_MAX_DISPLAYED_ISSUES),
    [advisories]
  )

  // ── Tab navigation ──────────────────────────────────────────
  const tabIndex = TAB_ORDER.indexOf(mobileTab)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([null, null])

  const handleTabKeyDown = useCallback((e: React.KeyboardEvent) => {
    const currentIndex = TAB_ORDER.indexOf(mobileTab)
    let newIndex = currentIndex

    switch (e.key) {
      case 'ArrowLeft':
        newIndex = currentIndex > 0 ? currentIndex - 1 : TAB_ORDER.length - 1
        break
      case 'ArrowRight':
        newIndex = currentIndex < TAB_ORDER.length - 1 ? currentIndex + 1 : 0
        break
      case 'Home':
        newIndex = 0
        break
      case 'End':
        newIndex = TAB_ORDER.length - 1
        break
      default:
        return
    }

    e.preventDefault()
    setMobileTab(TAB_ORDER[newIndex])
    tabRefs.current[newIndex]?.focus()
  }, [mobileTab, setMobileTab])

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0]
    touchStartRef.current = { x: touch.clientX, y: touch.clientY }
  }, [])

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    const startPos = touchStartRef.current
    if (!startPos) return
    touchStartRef.current = null

    // Disable tab swipe on Issues tab — conflicts with card swipe-to-label
    if (mobileTab === 'issues') return

    const touch = e.changedTouches[0]
    const deltaX = touch.clientX - startPos.x
    const deltaY = touch.clientY - startPos.y

    // Only trigger if horizontal swipe is dominant and exceeds threshold
    if (Math.abs(deltaX) < 50 || Math.abs(deltaX) < Math.abs(deltaY)) return

    const currentIndex = TAB_ORDER.indexOf(mobileTab)
    if (deltaX < 0 && currentIndex < TAB_ORDER.length - 1) {
      // Swipe left → next tab
      setMobileTab(TAB_ORDER[currentIndex + 1])
    } else if (deltaX > 0 && currentIndex > 0) {
      // Swipe right → previous tab
      setMobileTab(TAB_ORDER[currentIndex - 1])
    }
  }, [mobileTab, setMobileTab])

  return (
    <>
      {/* ── Mobile: 3-tab sliding content area + fader sidecar (portrait only) ───── */}
      <div className="landscape:hidden lg:hidden flex-1 flex overflow-hidden">
        {/* Sliding tab area — takes remaining width */}
        <div
          className="flex-1 flex flex-col overflow-hidden min-w-0"
          style={{ touchAction: 'pan-y' }}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
        <div
          className="flex-1 min-h-0 flex transition-transform duration-200 ease-out will-change-transform"
          style={{ transform: `translateX(-${tabIndex * 100}%)` }}
        >
          {/* Issues panel — inline graph on top, cards below */}
          <div
            id="mobile-tabpanel-issues"
            className="w-full flex-shrink-0 h-full flex flex-col overflow-hidden bg-background"
            role="tabpanel"
            aria-labelledby="mobile-tab-issues"
            aria-hidden={mobileTab !== 'issues'}
            inert={mobileTab !== 'issues' || undefined}
          >
            {/* ── Inline graph area (resizable) — swipeable RTA ↔ GEQ ─── */}
            <div
              className="flex-shrink-0 relative bg-card/40 rounded-sm border-b border-border/40 overflow-hidden"
              style={{ height: `${graphHeightVh}vh` }}
              onTouchStart={onGraphTouchStart}
              onTouchEnd={onGraphTouchEnd}
            >
              {/* Graph mode toggle — tappable segmented pill (swipe gesture preserved) */}
              <div className="absolute top-0.5 left-0.5 z-20 flex rounded-full bg-background/60 backdrop-blur-sm border border-border/40 overflow-hidden">
                <button
                  onClick={() => setInlineGraphMode('rta')}
                  className={`px-2.5 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                    inlineGraphMode === 'rta' ? 'bg-primary/20 text-primary' : 'text-muted-foreground/50'
                  }`}
                  aria-label="Show Real-Time Analyzer"
                >
                  RTA
                </button>
                <button
                  onClick={() => setInlineGraphMode('geq')}
                  className={`px-2.5 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                    inlineGraphMode === 'geq' ? 'bg-primary/20 text-primary' : 'text-muted-foreground/50'
                  }`}
                  aria-label="Show Graphic Equalizer"
                >
                  GEQ
                </button>
              </div>

              {/* Fullscreen icon */}
              <button
                onClick={toggleRtaFullscreen}
                className="absolute top-0.5 right-0.5 z-20 p-1 rounded text-muted-foreground/60 hover:text-foreground transition-colors cursor-pointer"
                aria-label="Expand RTA"
              >
                <Expand className="w-3.5 h-3.5" />
              </button>

              {inlineGraphMode === 'rta' ? (
                <div ref={rtaContainerRef} className="w-full h-full">
                  <ErrorBoundary>
                    <SpectrumCanvas spectrumRef={spectrumRef} advisories={mobileAdvisories} lifecycle={spectrumLifecycle} earlyWarning={earlyWarning} clearedIds={rtaClearedIds} isFrozen={isFrozen} roomModes={roomModes} display={spectrumDisplay} range={spectrumRange} onFreqRangeChange={handleFreqRangeChange} onThresholdChange={handleThresholdChange} />
                  </ErrorBoundary>
                </div>
              ) : (
                <GEQBarView advisories={mobileAdvisories} graphFontSize={settings.graphFontSize} clearedIds={geqClearedIds} isRunning={isRunning} />
              )}
            </div>

            {/* ── Drag handle to resize graph ─────────────────────── */}
            <div
              className="flex-shrink-0 flex items-center justify-center min-h-[44px] cursor-row-resize touch-none active:bg-muted/30 transition-colors"
              onTouchStart={onResizeStart}
              onTouchMove={onResizeMove}
              onTouchEnd={onResizeEnd}
              aria-label="Drag to resize graph"
            >
              <div className="flex flex-col items-center gap-[3px]">
                <div className="w-8 h-[2px] rounded-full bg-muted-foreground/30" />
                <div className="w-8 h-[2px] rounded-full bg-muted-foreground/30" />
              </div>
            </div>

            {/* ── Issue cards (scrollable) ─────────────────────────── */}
            <div className="flex-1 overflow-y-auto p-2">
              {isWizardActive ? (
                <RingOutWizard
                  advisories={advisories}
                  onFinish={() => onFinishWizard?.()}
                  isRunning={isRunning}
                  roomModes={roomModes}
                />
              ) : (
                <>
                  <ErrorBoundary>
                    <IssuesList
                      advisories={mobileAdvisories}
                      maxIssues={MOBILE_MAX_DISPLAYED_ISSUES}
                      dismissedIds={dismissedIds}
                      onClearAll={onClearAll}
                      onClearResolved={onClearResolved}
                      touchFriendly
                      isRunning={isRunning}
                      onStart={start}
                      onFalsePositive={onFalsePositive}
                      falsePositiveIds={falsePositiveIds}
                      onConfirmFeedback={onConfirmFeedback}
                      confirmedIds={confirmedIds}
                      isLowSignal={isLowSignal}
                      swipeLabeling
                      showAlgorithmScores={settings.showAlgorithmScores}
                      showPeqDetails={settings.showPeqDetails}
                      onStartRingOut={onStartRingOut}
                      onDismiss={onDismiss}
                    />
                  </ErrorBoundary>
                  <EarlyWarningPanel earlyWarning={earlyWarning} />
                </>
              )}
            </div>
          </div>

          {/* Settings panel — graph on top for live visual feedback while adjusting */}
          <div
            id="mobile-tabpanel-settings"
            className="w-full flex-shrink-0 h-full flex flex-col overflow-hidden bg-background"
            role="tabpanel"
            aria-labelledby="mobile-tab-settings"
            aria-hidden={mobileTab !== 'settings'}
            inert={mobileTab !== 'settings' || undefined}
          >
            {/* Compact RTA preview — see the effect of settings changes in real-time */}
            <div className="flex-shrink-0 h-[18vh] min-h-[80px] bg-card/40 border-b border-border/40 overflow-hidden">
              <SpectrumCanvas spectrumRef={spectrumRef} advisories={mobileAdvisories} lifecycle={spectrumLifecycle} earlyWarning={earlyWarning} clearedIds={rtaClearedIds} isFrozen={isFrozen} roomModes={roomModes} display={spectrumDisplay} range={spectrumRange} onFreqRangeChange={handleFreqRangeChange} onThresholdChange={handleThresholdChange} />
            </div>
            {/* Scrollable settings */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3 scroll-fade-bottom">
              <section className="rounded-lg border border-border/40 bg-card/30 p-3">
                <h3 className="section-label mb-2">Input Gain</h3>
                <InputMeterSlider
                  value={settings.inputGainDb}
                  onChange={(v) => setInputGain(v)}
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
                  onModeChange={handleModeChange}
                  onReset={resetSettings}
                  calibration={calibration}
                  dataCollection={dataCollection}
                />
              </div>
            </div>
          </div>
        </div>
        </div>
        {/* Fader sidecar — persistent across all tabs, with local mode toggle */}
        <div className="flex-shrink-0 w-14 min-[375px]:w-16 border-l border-border bg-card/30 channel-strip flex flex-col overflow-hidden">
          {/* Mode toggle button */}
          <button
            onClick={() => { haptic(); setMobileFaderMode(m => m === 'gain' ? 'sensitivity' : 'gain') }}
            className={`flex-shrink-0 py-1 text-[11px] font-bold uppercase tracking-wider text-center cursor-pointer transition-colors ${
              mobileFaderMode === 'sensitivity' ? 'text-blue-400' : 'text-[var(--console-amber)]'
            }`}
            title={`Switch to ${mobileFaderMode === 'gain' ? 'sensitivity' : 'gain'} fader`}
          >
            {mobileFaderMode === 'sensitivity' ? 'Sens' : 'Gain'}
          </button>
          <div className="flex-1 min-h-0">
            <SingleFader
              mode={mobileFaderMode}
              value={mobileFaderValue}
              onChange={mobileFaderOnChange}
              level={inputLevel}
              min={mobileFaderMode === 'sensitivity' ? 2 : -40}
              max={mobileFaderMode === 'sensitivity' ? 50 : 40}
              label=""
              autoGainEnabled={mobileFaderMode === 'gain' ? isAutoGain : false}
              autoGainDb={autoGainDb}
              autoGainLocked={autoGainLocked}
              onAutoGainToggle={mobileFaderMode === 'gain' ? (enabled) => setAutoGain(enabled) : undefined}
              noiseFloorDb={mobileFaderMode === 'gain' ? noiseFloorDb : null}
              guidance={mobileFaderMode === 'sensitivity' ? mobileGuidance : undefined}
              width={48}
            />
          </div>
        </div>
      </div>

      {/* ── Fullscreen graph overlay (both RTA + GEQ stacked) ─────── */}
      {isRtaFullscreen && (
        <div className="landscape:hidden lg:hidden fixed inset-0 z-50 bg-background flex flex-col">
          <div className="flex items-center justify-between px-2 py-1 border-b border-border bg-card/90">
            <span className="text-xs font-mono font-bold tracking-[0.15em] uppercase text-muted-foreground">Real-Time Analyzer + Graphic Equalizer</span>
            <button
              onClick={toggleRtaFullscreen}
              className="p-1.5 rounded text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              aria-label="Collapse RTA"
            >
              <Shrink className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 min-h-0 flex flex-col gap-0.5 p-0.5">
            <div className="flex-1 min-h-0 bg-card/40 rounded border border-border/40 overflow-hidden">
              <SpectrumCanvas spectrumRef={spectrumRef} advisories={mobileAdvisories} lifecycle={spectrumLifecycle} earlyWarning={earlyWarning} clearedIds={rtaClearedIds} isFrozen={isFrozen} roomModes={roomModes} display={spectrumDisplay} range={spectrumRange} onFreqRangeChange={handleFreqRangeChange} onThresholdChange={handleThresholdChange} />
            </div>
            <div className="flex-1 min-h-0 bg-card/40 rounded border border-border/40 overflow-hidden">
              <GEQBarView advisories={mobileAdvisories} graphFontSize={settings.graphFontSize} clearedIds={geqClearedIds} isRunning={isRunning} />
            </div>
          </div>
        </div>
      )}

      {/* ── Landscape mobile: 40% Issues / 55% Graphs / 5% fader sidecar (< md only) ── */}
      <div className="hidden landscape:flex md:landscape:hidden flex-1 overflow-hidden">
        {/* Issues — 40% */}
        <div className="w-[40%] flex flex-col overflow-hidden border-r border-border/50">
          <div className="flex-1 overflow-y-auto p-2">
            <h2 className="section-label mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                Issues
                <span className="text-[var(--console-amber)] font-mono">{activeAdvisoryCount}</span>
              </span>
              <LandscapeSettingsSheet
                settings={settings}
                
                onModeChange={handleModeChange}
                onReset={resetSettings}
                calibration={calibration}
                dataCollection={dataCollection}
              />
            </h2>
            {isWizardActive ? (
              <RingOutWizard
                advisories={advisories}
                onFinish={() => onFinishWizard?.()}
                isRunning={isRunning}
                roomModes={roomModes}
              />
            ) : (
              <IssuesList
                advisories={mobileAdvisories}
                maxIssues={MOBILE_MAX_DISPLAYED_ISSUES}
                dismissedIds={dismissedIds}
                onClearAll={onClearAll}
                onClearResolved={onClearResolved}
                touchFriendly
                isRunning={isRunning}
                onStart={start}
                onFalsePositive={onFalsePositive}
                falsePositiveIds={falsePositiveIds}
                onConfirmFeedback={onConfirmFeedback}
                confirmedIds={confirmedIds}
                isLowSignal={isLowSignal}
                swipeLabeling
                showAlgorithmScores={settings.showAlgorithmScores}
                showPeqDetails={settings.showPeqDetails}
                onStartRingOut={onStartRingOut}
                    onDismiss={onDismiss}
              />
            )}
            <EarlyWarningPanel earlyWarning={earlyWarning} />
          </div>
        </div>
        {/* Graphs — 54% */}
        <div className="w-[54%] flex flex-col gap-0.5 overflow-hidden p-0.5">
          {/* RTA — top half */}
          <div ref={rtaContainerRef} className="flex-1 min-h-0 bg-card/40 rounded border border-border/40 overflow-hidden relative">
            <div className="absolute top-1 left-1.5 z-20 flex items-center gap-1">
              <span className="text-sm text-muted-foreground font-mono font-bold uppercase tracking-[0.2em]">RTA</span>
              <button
                onClick={toggleRtaFullscreen}
                className="cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 min-h-[44px] min-w-[44px] rounded text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center"
                aria-label={isRtaFullscreen ? 'Collapse RTA' : 'Expand RTA'}
              >
                {isRtaFullscreen ? <Shrink className="w-4 h-4" /> : <Expand className="w-4 h-4" />}
              </button>
            </div>
            {isRunning && (
              <button
                onClick={toggleFreeze}
                className={`cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 absolute top-1 z-20 px-2 py-0.5 min-h-[44px] min-w-[44px] rounded text-sm font-medium border transition-colors flex items-center justify-center ${
                  isFrozen
                    ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                    : 'bg-card/80 text-muted-foreground border-border hover:text-foreground'
                }`}
                style={{ right: hasActiveRTAMarkers ? '3.5rem' : '0.25rem' }}
              >
                {isFrozen ? 'Live' : 'Freeze'}
              </button>
            )}
            {hasActiveRTAMarkers && (
              <button
                onClick={onClearRTA}
                className="cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 absolute top-1 right-1 z-20 px-2 py-0.5 min-h-[44px] min-w-[44px] rounded text-sm font-medium bg-card/80 text-muted-foreground border border-border hover:text-foreground transition-colors flex items-center justify-center"
              >
                Clear
              </button>
            )}
            <SpectrumCanvas spectrumRef={spectrumRef} advisories={mobileAdvisories} lifecycle={spectrumLifecycleWithStart} earlyWarning={earlyWarning} clearedIds={rtaClearedIds} isFrozen={isFrozen} roomModes={roomModes} display={spectrumDisplay} range={spectrumRange} onFreqRangeChange={handleFreqRangeChange} onThresholdChange={handleThresholdChange} />
          </div>
          {/* GEQ — bottom half */}
          <div className="flex-1 min-h-0 bg-card/40 rounded border border-border/40 overflow-hidden relative">
            <span className="absolute top-1 left-1.5 z-20 text-sm text-muted-foreground font-mono font-bold uppercase tracking-[0.2em] pointer-events-none">GEQ</span>
            {hasActiveGEQBars && (
              <button
                onClick={onClearGEQ}
                className="cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 absolute top-1 right-1 z-20 px-2 py-0.5 min-h-[44px] min-w-[44px] rounded text-sm font-medium bg-card/80 text-muted-foreground border border-border hover:text-foreground transition-colors flex items-center justify-center"
              >
                Clear
              </button>
            )}
            <GEQBarView advisories={mobileAdvisories} graphFontSize={settings.graphFontSize} clearedIds={geqClearedIds} isRunning={isRunning} />
          </div>
        </div>
        {/* Right fader sidecar — 6% */}
        <div className="w-[6%] min-w-[3.5rem] flex-shrink-0 border-l border-border bg-card/30 channel-strip flex flex-col">
          <button
            onClick={() => { haptic(); setMobileFaderMode(m => m === 'gain' ? 'sensitivity' : 'gain') }}
            className={`flex-shrink-0 py-0.5 text-[10px] font-bold uppercase tracking-wider text-center cursor-pointer transition-colors ${
              mobileFaderMode === 'sensitivity' ? 'text-blue-400' : 'text-[var(--console-amber)]'
            }`}
          >
            {mobileFaderMode === 'sensitivity' ? 'Sens' : 'Gain'}
          </button>
          <div className="flex-1 min-h-0">
            <SingleFader
              mode={mobileFaderMode}
              value={mobileFaderValue}
              onChange={mobileFaderOnChange}
              level={inputLevel}
              min={mobileFaderMode === 'sensitivity' ? 2 : -40}
              max={mobileFaderMode === 'sensitivity' ? 50 : 40}
              label=""
              autoGainEnabled={mobileFaderMode === 'gain' ? isAutoGain : false}
              autoGainDb={autoGainDb}
              autoGainLocked={autoGainLocked}
              onAutoGainToggle={mobileFaderMode === 'gain' ? (enabled) => setAutoGain(enabled) : undefined}
              noiseFloorDb={mobileFaderMode === 'gain' ? noiseFloorDb : null}
              guidance={mobileFaderMode === 'sensitivity' ? mobileGuidance : undefined}
              width={48}
            />
          </div>
        </div>
      </div>

      {/* ── Mobile bottom tab bar (portrait only) ──────────────── */}
      <nav className="landscape:hidden lg:hidden flex-shrink-0 border-t border-border/60 bg-card/90 backdrop-blur-sm" style={{ paddingBottom: 'var(--safe-bottom)' }}>
        <div className="flex items-stretch relative" role="tablist" onKeyDown={handleTabKeyDown}>
          {/* #20 Sliding amber indicator bar */}
          <div
            className="absolute top-0 h-[2px] bg-[var(--console-amber)] rounded-full transition-[left,width] duration-200 ease-out"
            style={{ left: `${tabIndex * 50 + 10}%`, width: '30%' }}
            aria-hidden
          />
          {([
            { id: 'issues' as const, label: 'Issues', Icon: AlertTriangle, badge: activeAdvisoryCount },
            { id: 'settings' as const, label: 'Settings', Icon: Settings2, badge: 0 },
          ]).map((tab, i) => (
            <button
              key={tab.id}
              ref={el => { tabRefs.current[i] = el }}
              onClick={() => { haptic(); setMobileTab(tab.id) }}
              role="tab"
              id={`mobile-tab-${tab.id}`}
              aria-selected={mobileTab === tab.id}
              aria-controls={`mobile-tabpanel-${tab.id}`}
              tabIndex={mobileTab === tab.id ? 0 : -1}
              className={`cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 flex-1 flex flex-col items-center justify-center py-2 gap-0.5 min-h-[50px] transition-colors relative ${
                mobileTab === tab.id
                  ? 'text-[var(--console-amber)] bg-[var(--console-amber)]/5'
                  : 'text-muted-foreground active:text-foreground'
              }`}
              aria-label={tab.label}
            >
              <div className="relative">
                {/* #19 Bounce animation on active icon */}
                <tab.Icon className={mobileTab === tab.id ? 'w-[22px] h-[22px] motion-safe:animate-tab-bounce' : 'w-5 h-5'} />
                {tab.badge > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 bg-[var(--console-amber)] text-background text-xs rounded-full min-w-[16px] h-[16px] flex items-center justify-center font-bold leading-none px-0.5">
                    {tab.badge}
                  </span>
                )}
              </div>
              <span className="text-sm font-mono font-bold tracking-[0.15em] leading-none">{tab.label}</span>
            </button>
          ))}
        </div>
        {/* Version info integrated into tab bar */}
        <div className="flex items-center justify-center py-0.5" aria-hidden>
          <span className="font-mono text-[8px] tracking-[0.15em] text-muted-foreground/25 uppercase">DoneWell Audio · v{process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0'}</span>
        </div>
      </nav>
    </>
  )
})
