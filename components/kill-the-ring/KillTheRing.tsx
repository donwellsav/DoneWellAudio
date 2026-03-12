'use client'

import { useEffect, useState, useCallback, useRef, useMemo, memo, lazy, Suspense } from 'react'
import { useAudioAnalyzer } from '@/hooks/useAudioAnalyzer'
import { useAudioDevices } from '@/hooks/useAudioDevices'
import { useAdvisoryLogging } from '@/hooks/useAdvisoryLogging'
import { useFullscreen } from '@/hooks/useFullscreen'
import { useFpsMonitor } from '@/hooks/useFpsMonitor'
import { useCalibrationSession } from '@/hooks/useCalibrationSession'
import { HeaderBar } from './HeaderBar'
import { MobileLayout } from './MobileLayout'
import { DesktopLayout } from './DesktopLayout'
import { PortalContainerProvider } from '@/contexts/PortalContainerContext'

const LazyOnboardingOverlay = lazy(() => import('./OnboardingOverlay').then(m => ({ default: m.OnboardingOverlay })))
import { AudioStateProvider } from '@/contexts/AudioStateContext'
import { DetectionProvider } from '@/contexts/DetectionContext'
import type { OperationMode } from '@/types/advisory'
import { OPERATION_MODES } from '@/lib/dsp/constants'
import type { ImperativePanelHandle } from 'react-resizable-panels'
import { AlertTriangle, RotateCcw, X } from 'lucide-react'

// ── Error guidance ──────────────────────────────────────────────────────────────

function getErrorGuidance(error: string): string {
  // HTTPS required for getUserMedia (except localhost)
  if (typeof location !== 'undefined' && location.protocol !== 'https:' && location.hostname !== 'localhost')
    return 'Microphone requires a secure (HTTPS) connection. Ask your admin to enable HTTPS.'
  const lower = error.toLowerCase()
  if (lower.includes('permission') || lower.includes('not allowed'))
    return 'Click the mic icon in your browser\'s address bar to allow access, or check Settings → Privacy → Microphone.'
  if (lower.includes('abort'))
    return 'Microphone request was cancelled. Click Start to try again.'
  if (lower.includes('not found') || lower.includes('no microphone'))
    return 'No microphone detected. Connect one and try again.'
  if (lower.includes('in use') || lower.includes('not readable'))
    return 'Another app is using your microphone. Close it, then try again.'
  if (lower.includes('overconstrained'))
    return 'Your mic may not support the requested audio format. Try a different device.'
  if (lower.includes('suspend') || lower.includes('resume'))
    return 'Audio was interrupted (tab backgrounded?). Click Start to resume.'
  return 'Check your microphone connection and browser permissions.'
}

export const KillTheRing = memo(function KillTheRingComponent() {
  const {
    isRunning,
    isStarting,
    error,
    workerError,
    noiseFloorDb,
    spectrumStatus,
    spectrumRef,
    advisories,
    earlyWarning,
    settings,
    start,
    stop,
    switchDevice,
    updateSettings,
    resetSettings,
  } = useAudioAnalyzer()

  const { devices, selectedDeviceId, setSelectedDeviceId } = useAudioDevices()
  const { actualFps, droppedPercent } = useFpsMonitor(isRunning, settings.canvasTargetFps)
  const calibration = useCalibrationSession(spectrumRef, isRunning, settings)

  const [mobileTab, setMobileTab] = useState<'issues' | 'graph' | 'settings'>('issues')
  const [activeSidebarTab, setActiveSidebarTab] = useState<'issues' | 'controls'>('controls')
  const [layoutKey, setLayoutKey] = useState(0)
  const [issuesPanelOpen, setIssuesPanelOpen] = useState(true)
  const [isFrozen, setIsFrozen] = useState(false)
  const toggleFreeze = useCallback(() => setIsFrozen(prev => !prev), [])
  const issuesPanelRef = useRef<ImperativePanelHandle>(null)

  // Error dismiss state — resets whenever error value changes
  const [isErrorDismissed, setIsErrorDismissed] = useState(false)
  useEffect(() => { setIsErrorDismissed(false) }, [error])

  // Fullscreen + portal container
  // Callback ref syncs both: rootRef (for useFullscreen imperative API) + rootEl state (for render-time portal)
  const rootRef = useRef<HTMLDivElement>(null)
  const [rootEl, setRootEl] = useState<HTMLDivElement | null>(null)
  const rootCallbackRef = useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node
    setRootEl(node)
  }, [])
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen(rootRef)

  // Wrap start to always pass the persisted device preference
  const startWithDevice = useCallback(() => {
    start({ deviceId: selectedDeviceId || undefined })
  }, [start, selectedDeviceId])

  const handleRetry = useCallback(() => {
    setIsErrorDismissed(false)
    startWithDevice()
  }, [startWithDevice])

  // Auto-unfreeze when stopping analysis
  useEffect(() => {
    if (!isRunning) setIsFrozen(false)
  }, [isRunning])

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      switch (e.key) {
        case ' ':
          e.preventDefault()
          if (isRunning) stop(); else startWithDevice()
          break
        case 'p': case 'P':
          if (!isRunning) return
          e.preventDefault()
          toggleFreeze()
          break
        // 'f'/'F' fullscreen toggle is handled by useFullscreen hook — do not duplicate here
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isRunning, toggleFreeze, startWithDevice, stop])

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

  // Forward new advisories to calibration session
  const prevAdvisoryIdsRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (!calibration.calibrationEnabled) return
    const prevIds = prevAdvisoryIdsRef.current
    for (const advisory of advisories) {
      if (!prevIds.has(advisory.id)) {
        calibration.onDetection(advisory, spectrumRef.current)
      }
    }
    prevAdvisoryIdsRef.current = new Set(advisories.map(a => a.id))
  }, [advisories, calibration, spectrumRef])

  const resetLayout = useCallback(() => {
    try {
      localStorage.removeItem('react-resizable-panels:ktr-layout-main')
      localStorage.removeItem('react-resizable-panels:ktr-layout-main-v2')
      localStorage.removeItem('react-resizable-panels:ktr-layout-main-v3')
      localStorage.removeItem('react-resizable-panels:ktr-layout-main-v4')
      localStorage.removeItem('react-resizable-panels:ktr-layout-vertical')
      localStorage.removeItem('react-resizable-panels:ktr-layout-bottom')
    } catch {}
    setIssuesPanelOpen(true)
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
      eqPreset: preset.eqPreset,
      aWeightingEnabled: preset.aWeightingEnabled,
      inputGainDb: preset.inputGainDb,
      ignoreWhistle: preset.ignoreWhistle,
    })
  }, [updateSettings])

  const handleSettingsChange = useCallback((newSettings: Partial<typeof settings>) => {
    updateSettings(newSettings)
    calibration.onSettingsChange(newSettings)
  }, [updateSettings, calibration])

  const handleFreqRangeChange = useCallback((min: number, max: number) => {
    updateSettings({ minFrequency: min, maxFrequency: max })
  }, [updateSettings])

  const handleDeviceChange = useCallback((deviceId: string) => {
    setSelectedDeviceId(deviceId)
    switchDevice(deviceId)
  }, [setSelectedDeviceId, switchDevice])

  const inputLevel = spectrumStatus?.peak ?? -60
  const autoGainDb = spectrumStatus?.autoGainDb
  const isAutoGain = spectrumStatus?.autoGainEnabled ?? settings.autoGainEnabled
  const isAutoGainLocked = spectrumStatus?.autoGainLocked ?? false

  const appVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0'
  const handleCalibrationExport = useCallback(() => {
    calibration.exportSession(settings, appVersion)
  }, [calibration, settings, appVersion])

  const calibrationTabProps = useMemo(() => ({
    room: calibration.room,
    updateRoom: calibration.updateRoom,
    clearRoom: calibration.clearRoom,
    calibrationEnabled: calibration.calibrationEnabled,
    setCalibrationEnabled: calibration.setCalibrationEnabled,
    isRecording: calibration.isRecording,
    ambientCapture: calibration.ambientCapture,
    captureAmbient: calibration.captureAmbient,
    isCapturingAmbient: calibration.isCapturingAmbient,
    spectrumRef,
    stats: calibration.stats,
    onExport: handleCalibrationExport,
  }), [calibration, spectrumRef, handleCalibrationExport])

  return (
    <div ref={rootCallbackRef} className="flex flex-col h-screen bg-background">
      <PortalContainerProvider value={isFullscreen ? rootEl : null}>
      <HeaderBar
        isRunning={isRunning}
        start={startWithDevice}
        stop={stop}
        settings={settings}
        onSettingsChange={handleSettingsChange}
        onModeChange={handleModeChange}
        onReset={resetSettings}
        resetLayout={resetLayout}
        isFullscreen={isFullscreen}
        toggleFullscreen={toggleFullscreen}
        isFrozen={isFrozen}
        toggleFreeze={toggleFreeze}
        devices={devices}
        selectedDeviceId={selectedDeviceId}
        onDeviceChange={handleDeviceChange}
        calibration={calibrationTabProps}
      />

      {error && !isErrorDismissed && (
        <div role="alert" className="px-3 py-2 sm:px-4 sm:py-2.5 bg-destructive/10 border-b border-destructive/20 max-h-[40vh] overflow-y-auto">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0 space-y-1">
              <p className="text-sm font-mono font-medium text-destructive">{error}</p>
              <p className="text-sm text-muted-foreground font-mono leading-snug">
                {getErrorGuidance(error)}
              </p>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                onClick={handleRetry}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-sm font-mono font-medium bg-destructive/15 text-destructive hover:bg-destructive/25 transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                Try Again
              </button>
              <button
                onClick={() => setIsErrorDismissed(true)}
                className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-card/40 transition-colors"
                aria-label="Dismiss error"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {workerError && (
        <div role="alert" className="px-3 py-1.5 sm:px-4 sm:py-2 bg-amber-500/5 border-b border-amber-500/20">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
            <p className="text-sm font-mono text-amber-600 dark:text-amber-400">
              DSP worker error — analysis may be degraded. Auto-recovering…
            </p>
            <button
              onClick={handleRetry}
              className="ml-auto text-sm font-mono text-amber-400 hover:text-amber-300 underline underline-offset-2 flex-shrink-0 transition-colors"
            >
              Restart
            </button>
          </div>
        </div>
      )}

      <AudioStateProvider
        isRunning={isRunning}
        isStarting={isStarting}
        error={error}
        inputLevel={inputLevel}
        isAutoGain={isAutoGain}
        autoGainDb={autoGainDb}
        autoGainLocked={isAutoGainLocked}
        spectrumRef={spectrumRef}
        isFrozen={isFrozen}
        toggleFreeze={toggleFreeze}
        start={startWithDevice}
        stop={stop}
      >
        <DetectionProvider
          advisories={advisories}
          earlyWarning={earlyWarning}
          onFalsePositive={calibration.calibrationEnabled ? calibration.onFalsePositive : undefined}
          falsePositiveIds={calibration.calibrationEnabled ? calibration.falsePositiveIds : undefined}
        >
          <MobileLayout
            mobileTab={mobileTab}
            setMobileTab={setMobileTab}
            settings={settings}
            onSettingsChange={handleSettingsChange}
            onModeChange={handleModeChange}
            onReset={resetSettings}
            onFreqRangeChange={handleFreqRangeChange}
            noiseFloorDb={noiseFloorDb}
          />

          <DesktopLayout
            layoutKey={layoutKey}
            settings={settings}
            onSettingsChange={handleSettingsChange}
            onModeChange={handleModeChange}
            spectrumStatus={spectrumStatus}
            noiseFloorDb={noiseFloorDb}
            issuesPanelOpen={issuesPanelOpen}
            issuesPanelRef={issuesPanelRef}
            activeSidebarTab={activeSidebarTab}
            setActiveSidebarTab={setActiveSidebarTab}
            openIssuesPanel={openIssuesPanel}
            closeIssuesPanel={closeIssuesPanel}
            setIssuesPanelOpen={setIssuesPanelOpen}
            onFreqRangeChange={handleFreqRangeChange}
            actualFps={actualFps}
            droppedPercent={droppedPercent}
          />
        </DetectionProvider>
      </AudioStateProvider>

      <Suspense fallback={null}>
        <LazyOnboardingOverlay />
      </Suspense>
      </PortalContainerProvider>
    </div>
  )
})
