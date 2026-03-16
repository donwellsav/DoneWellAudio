'use client'

import { memo, useRef, useCallback, useMemo } from 'react'
import { IssuesList } from './IssuesList'
import { EarlyWarningPanel } from './EarlyWarningPanel'
import { SpectrumCanvas } from './SpectrumCanvas'
import { GEQBarView } from './GEQBarView'
import { DetectionControls } from './DetectionControls'
import { InputMeterSlider } from './InputMeterSlider'
import { VerticalGainFader } from './VerticalGainFader'
import { ResetConfirmDialog } from './ResetConfirmDialog'
import { useAudio } from '@/contexts/AudioAnalyzerContext'
import { useAdvisories } from '@/contexts/AdvisoryContext'
import { useUI } from '@/contexts/UIContext'
import { Button } from '@/components/ui/button'
import { RotateCcw, AlertTriangle, BarChart3, Settings2, Maximize2, Minimize2 } from 'lucide-react'
import type { DetectorSettings } from '@/types/advisory'
import { MOBILE_MAX_DISPLAYED_ISSUES } from '@/lib/dsp/constants'

const TAB_ORDER = ['issues', 'graph', 'settings'] as const

interface MobileLayoutProps {
  onSettingsChange: (s: Partial<DetectorSettings>) => void
}

export const MobileLayout = memo(function MobileLayout({
  onSettingsChange,
}: MobileLayoutProps) {
  const {
    isRunning, isStarting, error, start, stop,
    spectrumRef, settings, handleModeChange, resetSettings, handleFreqRangeChange,
    inputLevel, isAutoGain, autoGainDb, autoGainLocked,
    noiseFloorDb,
  } = useAudio()

  const { isFrozen, toggleFreeze, mobileTab, setMobileTab, rtaContainerRef, isRtaFullscreen, toggleRtaFullscreen } = useUI()

  const {
    advisories, activeAdvisoryCount, earlyWarning,
    dismissedIds, onDismiss, onClearAll, onClearResolved,
    rtaClearedIds, geqClearedIds,
    hasActiveRTAMarkers, hasActiveGEQBars,
    onClearRTA, onClearGEQ,
    onFalsePositive, falsePositiveIds,
  } = useAdvisories()

  // Limit advisories to top 5 most problematic on mobile (already sorted by urgency + amplitude)
  const mobileAdvisories = useMemo(
    () => advisories.slice(0, MOBILE_MAX_DISPLAYED_ISSUES),
    [advisories]
  )

  // ── Tab navigation ──────────────────────────────────────────
  const tabIndex = TAB_ORDER.indexOf(mobileTab)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([null, null, null])

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
      <div className="landscape:hidden flex-1 flex overflow-hidden">
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
          {/* Issues panel */}
          <div
            id="mobile-tabpanel-issues"
            className="w-full flex-shrink-0 h-full flex flex-col overflow-hidden bg-background"
            role="tabpanel"
            aria-labelledby="mobile-tab-issues"
            aria-hidden={mobileTab !== 'issues'}
            inert={mobileTab !== 'issues' || undefined}
          >
            <div className="border-b border-border p-2 flex-shrink-0 bg-card/50">
              <InputMeterSlider
                value={settings.inputGainDb}
                onChange={(v) => onSettingsChange({ inputGainDb: v })}
                level={inputLevel}
                compact
                autoGainEnabled={isAutoGain}
                autoGainDb={autoGainDb}
                autoGainLocked={autoGainLocked}
                onAutoGainToggle={(enabled) => onSettingsChange({ autoGainEnabled: enabled })}
              />
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <h2 className="section-label mb-2 flex items-center justify-between">
                <span>Active Issues</span>
                <span className="text-primary font-mono">{activeAdvisoryCount}</span>
              </h2>
              <IssuesList
                advisories={mobileAdvisories}
                maxIssues={MOBILE_MAX_DISPLAYED_ISSUES}
                dismissedIds={dismissedIds}
                onDismiss={onDismiss}
                onClearAll={onClearAll}
                onClearResolved={onClearResolved}
                touchFriendly
                isRunning={isRunning}
                onStart={start}
                onFalsePositive={onFalsePositive}
                falsePositiveIds={falsePositiveIds}
                isLowSignal={isRunning && inputLevel < -45}
              />
              <EarlyWarningPanel earlyWarning={earlyWarning} />
            </div>
          </div>

          {/* Graph panel — RTA on top, GEQ on bottom (50/50 split) */}
          <div
            id="mobile-tabpanel-graph"
            className="w-full flex-shrink-0 h-full flex flex-col gap-0.5 overflow-hidden p-0.5"
            role="tabpanel"
            aria-labelledby="mobile-tab-graph"
            aria-hidden={mobileTab !== 'graph'}
            inert={mobileTab !== 'graph' || undefined}
          >
            {/* RTA — top half */}
            <div ref={rtaContainerRef} className="flex-1 min-h-0 bg-card/40 rounded border border-border/40 overflow-hidden relative">
              <div className="absolute top-1 left-1.5 z-20 flex items-center gap-1">
                <span className="text-sm text-muted-foreground font-mono font-bold uppercase tracking-[0.2em]">RTA</span>
                <button
                  onClick={toggleRtaFullscreen}
                  className="min-h-[44px] min-w-[44px] rounded text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center"
                  aria-label={isRtaFullscreen ? 'Exit RTA fullscreen' : 'RTA fullscreen'}
                >
                  {isRtaFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
              </div>
              {isRunning && (
                <button
                  onClick={toggleFreeze}
                  className={`absolute top-1 z-20 px-2 py-0.5 min-h-[44px] min-w-[44px] rounded text-sm font-medium border transition-colors flex items-center justify-center ${
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
                  className="absolute top-1 right-1 z-20 px-2 py-0.5 min-h-[44px] min-w-[44px] rounded text-sm font-medium bg-card/80 text-muted-foreground border border-border hover:text-foreground transition-colors flex items-center justify-center"
                >
                  Clear
                </button>
              )}
              <SpectrumCanvas spectrumRef={spectrumRef} advisories={mobileAdvisories} isRunning={isRunning} isStarting={isStarting} error={error} graphFontSize={settings.graphFontSize} onStart={!isRunning && !isStarting ? start : undefined} earlyWarning={earlyWarning} rtaDbMin={settings.rtaDbMin} rtaDbMax={settings.rtaDbMax} spectrumLineWidth={settings.spectrumLineWidth} clearedIds={rtaClearedIds} minFrequency={settings.minFrequency} maxFrequency={settings.maxFrequency} onFreqRangeChange={handleFreqRangeChange} showThresholdLine={settings.showThresholdLine} feedbackThresholdDb={settings.feedbackThresholdDb} isFrozen={isFrozen} canvasTargetFps={settings.canvasTargetFps} />
            </div>
            {/* GEQ — bottom half */}
            <div className="flex-1 min-h-0 bg-card/40 rounded border border-border/40 overflow-hidden relative">
              <span className="absolute top-1 left-1.5 z-20 text-sm text-muted-foreground font-mono font-bold uppercase tracking-[0.2em] pointer-events-none">GEQ</span>
              {hasActiveGEQBars && (
                <button
                  onClick={onClearGEQ}
                  className="absolute top-1 right-1 z-20 px-2 py-0.5 min-h-[44px] min-w-[44px] rounded text-sm font-medium bg-card/80 text-muted-foreground border border-border hover:text-foreground transition-colors flex items-center justify-center"
                >
                  Clear
                </button>
              )}
              <GEQBarView advisories={mobileAdvisories} graphFontSize={settings.graphFontSize} clearedIds={geqClearedIds} />
            </div>
          </div>

          {/* Settings panel */}
          <div
            id="mobile-tabpanel-settings"
            className="w-full flex-shrink-0 h-full overflow-y-auto p-4 space-y-4 bg-background"
            role="tabpanel"
            aria-labelledby="mobile-tab-settings"
            aria-hidden={mobileTab !== 'settings'}
            inert={mobileTab !== 'settings' || undefined}
          >
            <section>
              <h3 className="section-label mb-2">Input Gain</h3>
              <InputMeterSlider
                value={settings.inputGainDb}
                onChange={(v) => onSettingsChange({ inputGainDb: v })}
                level={inputLevel}
                fullWidth
                autoGainEnabled={isAutoGain}
                autoGainDb={autoGainDb}
                autoGainLocked={autoGainLocked}
                onAutoGainToggle={(enabled) => onSettingsChange({ autoGainEnabled: enabled })}
              />
            </section>
            <div className="border-t border-border" />
            <section>
              <h3 className="section-label mb-2">Detection Controls</h3>
              <DetectionControls settings={settings} onModeChange={handleModeChange} onSettingsChange={onSettingsChange} />
            </section>
            <div className="border-t border-border" />
            <ResetConfirmDialog
              onConfirm={resetSettings}
              trigger={
                <Button variant="outline" className="w-full h-11 text-sm font-medium">
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Reset to Defaults
                </Button>
              }
            />
          </div>
        </div>
        </div>
        {/* Fader sidecar — persistent across all tabs */}
        <div className="flex-shrink-0 w-16 border-l border-border/50 channel-strip">
          <VerticalGainFader
            value={settings.inputGainDb}
            onChange={(v) => onSettingsChange({ inputGainDb: v })}
            level={inputLevel}
            autoGainEnabled={isAutoGain}
            autoGainDb={autoGainDb}
            autoGainLocked={autoGainLocked}
            onAutoGainToggle={(enabled) => onSettingsChange({ autoGainEnabled: enabled })}
            isRunning={isRunning}
            noiseFloorDb={noiseFloorDb}
            faderMode={settings.faderMode}
            onFaderModeChange={(mode) => onSettingsChange({ faderMode: mode })}
            sensitivityValue={settings.feedbackThresholdDb}
            onSensitivityChange={(db) => onSettingsChange({ feedbackThresholdDb: db })}
            activeAdvisoryCount={activeAdvisoryCount}
          />
        </div>
      </div>

      {/* ── Landscape mobile: 40% Issues / 55% Graphs / 5% fader sidecar (< md only) ── */}
      <div className="hidden landscape:flex md:landscape:hidden flex-1 overflow-hidden">
        {/* Issues — 40% */}
        <div className="w-[40%] flex flex-col overflow-hidden border-r border-border/50">
          <div className="flex-1 overflow-y-auto p-2">
            <h2 className="section-label mb-1 flex items-center justify-between">
              <span>Issues</span>
              <span className="text-primary font-mono">{activeAdvisoryCount}</span>
            </h2>
            <IssuesList
              advisories={mobileAdvisories}
              maxIssues={MOBILE_MAX_DISPLAYED_ISSUES}
              dismissedIds={dismissedIds}
              onDismiss={onDismiss}
              onClearAll={onClearAll}
              onClearResolved={onClearResolved}
              touchFriendly
              isRunning={isRunning}
              onStart={start}
              onFalsePositive={onFalsePositive}
              falsePositiveIds={falsePositiveIds}
              isLowSignal={isRunning && inputLevel < -45}
            />
            <EarlyWarningPanel earlyWarning={earlyWarning} />
          </div>
        </div>
        {/* Graphs — 55% */}
        <div className="w-[55%] flex flex-col gap-0.5 overflow-hidden p-0.5">
          {/* RTA — top half */}
          <div ref={rtaContainerRef} className="flex-1 min-h-0 bg-card/40 rounded border border-border/40 overflow-hidden relative">
            <div className="absolute top-1 left-1.5 z-20 flex items-center gap-1">
              <span className="text-sm text-muted-foreground font-mono font-bold uppercase tracking-[0.2em]">RTA</span>
              <button
                onClick={toggleRtaFullscreen}
                className="min-h-[44px] min-w-[44px] rounded text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center"
                aria-label={isRtaFullscreen ? 'Exit RTA fullscreen' : 'RTA fullscreen'}
              >
                {isRtaFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
            </div>
            {isRunning && (
              <button
                onClick={toggleFreeze}
                className={`absolute top-1 z-20 px-2 py-0.5 min-h-[44px] min-w-[44px] rounded text-sm font-medium border transition-colors flex items-center justify-center ${
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
                className="absolute top-1 right-1 z-20 px-2 py-0.5 min-h-[44px] min-w-[44px] rounded text-sm font-medium bg-card/80 text-muted-foreground border border-border hover:text-foreground transition-colors flex items-center justify-center"
              >
                Clear
              </button>
            )}
            <SpectrumCanvas spectrumRef={spectrumRef} advisories={mobileAdvisories} isRunning={isRunning} isStarting={isStarting} error={error} graphFontSize={settings.graphFontSize} onStart={!isRunning && !isStarting ? start : undefined} earlyWarning={earlyWarning} rtaDbMin={settings.rtaDbMin} rtaDbMax={settings.rtaDbMax} spectrumLineWidth={settings.spectrumLineWidth} clearedIds={rtaClearedIds} minFrequency={settings.minFrequency} maxFrequency={settings.maxFrequency} onFreqRangeChange={handleFreqRangeChange} showThresholdLine={settings.showThresholdLine} feedbackThresholdDb={settings.feedbackThresholdDb} isFrozen={isFrozen} canvasTargetFps={settings.canvasTargetFps} />
          </div>
          {/* GEQ — bottom half */}
          <div className="flex-1 min-h-0 bg-card/40 rounded border border-border/40 overflow-hidden relative">
            <span className="absolute top-1 left-1.5 z-20 text-sm text-muted-foreground font-mono font-bold uppercase tracking-[0.2em] pointer-events-none">GEQ</span>
            {hasActiveGEQBars && (
              <button
                onClick={onClearGEQ}
                className="absolute top-1 right-1 z-20 px-2 py-0.5 min-h-[44px] min-w-[44px] rounded text-sm font-medium bg-card/80 text-muted-foreground border border-border hover:text-foreground transition-colors flex items-center justify-center"
              >
                Clear
              </button>
            )}
            <GEQBarView advisories={mobileAdvisories} graphFontSize={settings.graphFontSize} clearedIds={geqClearedIds} />
          </div>
        </div>
        {/* Right fader sidecar — 5% */}
        <div className="w-[5%] min-w-[3rem] flex-shrink-0 border-l border-border/50 channel-strip">
          <VerticalGainFader
            value={settings.inputGainDb}
            onChange={(v) => onSettingsChange({ inputGainDb: v })}
            level={inputLevel}
            autoGainEnabled={isAutoGain}
            autoGainDb={autoGainDb}
            autoGainLocked={autoGainLocked}
            onAutoGainToggle={(enabled) => onSettingsChange({ autoGainEnabled: enabled })}
            isRunning={isRunning}
            noiseFloorDb={noiseFloorDb}
            faderMode={settings.faderMode}
            onFaderModeChange={(mode) => onSettingsChange({ faderMode: mode })}
            sensitivityValue={settings.feedbackThresholdDb}
            onSensitivityChange={(db) => onSettingsChange({ feedbackThresholdDb: db })}
            activeAdvisoryCount={activeAdvisoryCount}
          />
        </div>
      </div>

      {/* ── Page indicator dots (portrait only) ─────────────────── */}
      <div className="landscape:hidden flex items-center justify-center gap-1.5 py-1 bg-card/90" aria-hidden="true">
        {TAB_ORDER.map(id => (
          <div
            key={id}
            className={`h-1 rounded-full transition-all duration-200 ${
              mobileTab === id ? 'w-2 bg-primary' : 'w-1 bg-muted-foreground/25'
            }`}
          />
        ))}
      </div>

      {/* ── Mobile bottom tab bar (portrait only) ──────────────── */}
      <nav className="landscape:hidden flex-shrink-0 border-t border-border/60 bg-card/90 backdrop-blur-sm" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <div className="flex items-stretch" role="tablist" onKeyDown={handleTabKeyDown}>
          {([
            { id: 'issues' as const, label: 'Issues', Icon: AlertTriangle, badge: activeAdvisoryCount },
            { id: 'graph' as const, label: 'Graph', Icon: BarChart3, badge: 0 },
            { id: 'settings' as const, label: 'Settings', Icon: Settings2, badge: 0 },
          ]).map((tab, i) => (
            <button
              key={tab.id}
              ref={el => { tabRefs.current[i] = el }}
              onClick={() => setMobileTab(tab.id)}
              role="tab"
              id={`mobile-tab-${tab.id}`}
              aria-selected={mobileTab === tab.id}
              aria-controls={`mobile-tabpanel-${tab.id}`}
              tabIndex={mobileTab === tab.id ? 0 : -1}
              className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 min-h-[50px] transition-colors ${
                mobileTab === tab.id
                  ? 'text-primary'
                  : 'text-muted-foreground active:text-foreground'
              }`}
              aria-label={tab.label}
            >
              <div className="relative">
                <tab.Icon className="w-5 h-5" />
                {tab.badge > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 bg-primary text-primary-foreground text-xs rounded-full min-w-[16px] h-[16px] flex items-center justify-center font-bold leading-none px-0.5">
                    {tab.badge}
                  </span>
                )}
              </div>
              <span className="text-sm font-mono font-bold tracking-[0.15em] leading-none">{tab.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </>
  )
})
