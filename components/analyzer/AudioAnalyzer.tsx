'use client'

import { useEffect, useState, useCallback, useRef, useMemo, memo, lazy, Suspense } from 'react'
import { useAdvisoryLogging } from '@/hooks/useAdvisoryLogging'
import { useFpsMonitor } from '@/hooks/useFpsMonitor'
import { useCalibrationSession } from '@/hooks/useCalibrationSession'
import { HeaderBar } from './HeaderBar'
import { MobileLayout } from './MobileLayout'
import { DesktopLayout } from './DesktopLayout'
import { PortalContainerProvider } from '@/contexts/PortalContainerContext'

const LazyOnboardingOverlay = lazy(() => import('./OnboardingOverlay').then(m => ({ default: m.OnboardingOverlay })))
const LazyKeyboardShortcutsModal = lazy(() => import('./KeyboardShortcutsModal').then(m => ({ default: m.KeyboardShortcutsModal })))
import { DataConsentDialog } from './DataConsentDialog'
import { useDataCollection } from '@/hooks/useDataCollection'
import { useIsMobile } from '@/hooks/use-mobile'
import { AudioAnalyzerProvider } from '@/contexts/AudioAnalyzerContext'
import { useEngine } from '@/contexts/EngineContext'
import { useSettings } from '@/contexts/SettingsContext'
import { useMetering } from '@/contexts/MeteringContext'
import { useDetection } from '@/contexts/DetectionContext'
import { AdvisoryProvider } from '@/contexts/AdvisoryContext'
import { UIProvider, useUI } from '@/contexts/UIContext'
import { usePanelRef } from '@/components/ui/resizable'
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

// ── Shell: sets up AudioAnalyzerProvider + root div ─────────────────────────

export const AudioAnalyzer = memo(function AudioAnalyzerComponent() {
  // Data collection: consent + uploader + worker wiring
  const dataCollection = useDataCollection()

  // Ref that bridges data collection ↔ AudioAnalyzerProvider (breaks circular dep)
  const snapshotBatchRef = useRef<((batch: import('@/types/data').SnapshotBatch) => void) | null>(null)
  snapshotBatchRef.current = dataCollection.handleSnapshotBatch

  // Shared frozen ref — synced by UIProvider, read by useAdvisoryMap to buffer cards
  const frozenRef = useRef(false)

  // Fullscreen + portal container
  // Callback ref syncs both: rootRef (for useFullscreen imperative API) + rootEl state (for render-time portal)
  const rootRef = useRef<HTMLDivElement>(null)
  const [rootEl, setRootEl] = useState<HTMLDivElement | null>(null)
  const rootCallbackRef = useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node
    setRootEl(node)
  }, [])

  return (
    <div ref={rootCallbackRef} className="flex flex-col h-screen bg-background">
      <AudioAnalyzerProvider onSnapshotBatchRef={snapshotBatchRef} frozenRef={frozenRef}>
        <AudioAnalyzerInner
          dataCollection={dataCollection}
          rootRef={rootRef}
          rootEl={rootEl}
          frozenRef={frozenRef}
        />
      </AudioAnalyzerProvider>

      <Suspense fallback={null}>
        <LazyOnboardingOverlay />
      </Suspense>

      {/* Consent dialog removed — collection is opt-out via Settings → Advanced */}
    </div>
  )
})

// ── FrozenSync: bridges UIContext.isFrozen → shared frozenRef for advisory buffering
function FrozenSync({ frozenRef }: { frozenRef: React.RefObject<boolean> }) {
  const { isFrozen } = useUI()
  frozenRef.current = isFrozen
  return null
}

// ── Inner: consumes AudioAnalyzerContext, renders remaining providers + UI ───

interface AudioAnalyzerInnerProps {
  dataCollection: import('@/hooks/useDataCollection').DataCollectionHandle
  rootRef: React.RefObject<HTMLDivElement | null>
  rootEl: HTMLDivElement | null
  frozenRef: React.RefObject<boolean>
}

const AudioAnalyzerInner = memo(function AudioAnalyzerInner({
  dataCollection,
  rootRef,
  rootEl,
  frozenRef,
}: AudioAnalyzerInnerProps) {
  const { isRunning, error, workerError, start, stop, dspWorker } = useEngine()
  const { settings, resetSettings, handleModeChange, setMicProfile } = useSettings()
  const { spectrumRef, spectrumStatus, noiseFloorDb, sampleRate, fftSize } = useMetering()
  const { advisories } = useDetection()

  // Wire the DSP worker handle into data collection (breaks circular dep)
  dataCollection.workerRef.current = dspWorker

  const { actualFps, droppedPercent } = useFpsMonitor(isRunning, settings.canvasTargetFps)
  const calibration = useCalibrationSession(spectrumRef, isRunning, settings)

  // Ring-out wizard state
  const [isWizardActive, setIsWizardActive] = useState(false)
  const startWizard = useCallback(() => setIsWizardActive(true), [])
  const finishWizard = useCallback(() => setIsWizardActive(false), [])

  const handleStartRingOut = useCallback(() => {
    handleModeChange('ringOut')
    start()
    setIsWizardActive(true)
  }, [handleModeChange, start])

  // ── Desktop panel state (imperative ref-based, stays as local state) ─────

  const [activeSidebarTab, setActiveSidebarTab] = useState<'issues' | 'controls'>('controls')
  const [issuesPanelOpen, setIssuesPanelOpen] = useState(true)
  const issuesPanelRef = usePanelRef()

  // Error dismiss state — resets whenever error value changes
  const [isErrorDismissed, setIsErrorDismissed] = useState(false)
  useEffect(() => { setIsErrorDismissed(false) }, [error])

  const handleRetry = useCallback(() => {
    setIsErrorDismissed(false)
    start()
  }, [start])

  // ── Trigger data collection consent prompt when audio starts ────────────

  useEffect(() => {
    if (isRunning) {
      dataCollection.promptIfNeeded(fftSize, sampleRate)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only trigger on isRunning transition
  }, [isRunning])

  // ── Keyboard shortcuts ──────────────────────────────────────────────────
  // Note: toggleFreeze comes from UIProvider below, so we use a ref to avoid
  // needing context before UIProvider renders. Freeze toggle is wired via the
  // Orchestrator component below.

  // ── Advisory logging + calibration forwarding ───────────────────────────

  useAdvisoryLogging(advisories)

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

  // ── False positive feedback (always available, not just during calibration) ──
  // Tracks flagged advisory IDs for UI state + sends feedback to worker for
  // snapshot enrichment (ML training data).

  const [fpIds, setFpIds] = useState<Set<string>>(new Set())
  const [confirmedIds, setConfirmedIds] = useState<Set<string>>(new Set())

  // Refs for stable callback identity — avoids re-creation on every
  // advisories/fpIds/confirmedIds change (advisories updates at ~50fps).
  const fpIdsRef = useRef(fpIds)
  fpIdsRef.current = fpIds
  const confirmedIdsRef = useRef(confirmedIds)
  confirmedIdsRef.current = confirmedIds
  const advisoriesRef2 = useRef(advisories)
  advisoriesRef2.current = advisories
  const calibrationRef = useRef(calibration)
  calibrationRef.current = calibration

  const handleFalsePositive = useCallback((advisoryId: string) => {
    // Read current state via ref (avoids stale closure)
    const isFlagging = !fpIdsRef.current.has(advisoryId)

    // Toggle the flag
    setFpIds(prev => {
      const next = new Set(prev)
      if (next.has(advisoryId)) {
        next.delete(advisoryId)
      } else {
        next.add(advisoryId)
      }
      return next
    })

    // Find the advisory to get its frequency
    const advisory = advisoriesRef2.current.find(a => a.id === advisoryId)
    if (advisory) {
      dspWorker.sendUserFeedback(
        advisory.trueFrequencyHz,
        isFlagging ? 'false_positive' : 'correct'
      )
    }

    // Remove from confirmed set if it was confirmed (mutually exclusive)
    setConfirmedIds(prev => {
      if (!prev.has(advisoryId)) return prev
      const next = new Set(prev)
      next.delete(advisoryId)
      return next
    })

    // Chain to calibration handler if active
    if (calibrationRef.current.calibrationEnabled) {
      calibrationRef.current.onFalsePositive(advisoryId)
    }
  }, [dspWorker])

  // ── Confirm Feedback (positive label for ML training) ──────────────────
  // Symmetric to FALSE+: marks an advisory as confirmed real feedback.
  // CONFIRM and FALSE+ are mutually exclusive toggles.

  const handleConfirmFeedback = useCallback((advisoryId: string) => {
    // Read current state via ref (avoids stale closure)
    const isConfirming = !confirmedIdsRef.current.has(advisoryId)

    // Toggle confirmed state
    setConfirmedIds(prev => {
      const next = new Set(prev)
      if (next.has(advisoryId)) {
        next.delete(advisoryId)
      } else {
        next.add(advisoryId)
      }
      return next
    })

    // Remove from FP set if it was flagged (mutually exclusive)
    setFpIds(prev => {
      if (!prev.has(advisoryId)) return prev
      const next = new Set(prev)
      next.delete(advisoryId)
      return next
    })

    // Send confirmed_feedback to worker for snapshot labeling
    const advisory = advisoriesRef2.current.find(a => a.id === advisoryId)
    if (advisory) {
      dspWorker.sendUserFeedback(
        advisory.trueFrequencyHz,
        isConfirming ? 'confirmed_feedback' : 'correct'
      )
    }
  }, [dspWorker])

  // Merge calibration FP IDs with standalone FP IDs
  const mergedFpIds = useMemo<ReadonlySet<string>>(() => {
    if (!calibration.calibrationEnabled) return fpIds
    const merged = new Set(fpIds)
    calibration.falsePositiveIds.forEach(id => merged.add(id))
    return merged
  }, [fpIds, calibration.calibrationEnabled, calibration.falsePositiveIds])

  // ── Calibration bridge — notify calibration session of settings changes (debounced diff)
  const prevSettingsRef = useRef(settings)
  useEffect(() => {
    const timer = setTimeout(() => {
      const delta: Partial<typeof settings> = {}
      let hasDelta = false
      for (const key of Object.keys(settings) as (keyof typeof settings)[]) {
        if (settings[key] !== prevSettingsRef.current[key]) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ;(delta as Record<string, unknown>)[key] = settings[key]
          hasDelta = true
        }
      }
      if (hasDelta) {
        calibrationRef.current.onSettingsChange(delta)
      }
      prevSettingsRef.current = settings
    }, 100)
    return () => clearTimeout(timer)
  }, [settings])

  // ── Auto-apply smartphone MEMS mic calibration on mobile devices ───────

  const isMobile = useIsMobile()
  const mobileCalAppliedRef = useRef(false)

  useEffect(() => {
    if (isMobile && !mobileCalAppliedRef.current && settings.micCalibrationProfile === 'none') {
      mobileCalAppliedRef.current = true
      setMicProfile('smartphone')
    }
  }, [isMobile, settings.micCalibrationProfile, setMicProfile])

  // ── Panel management ────────────────────────────────────────────────────

  const openIssuesPanel = useCallback(() => {
    setIssuesPanelOpen(true)
    if (activeSidebarTab === 'issues') setActiveSidebarTab('controls')
    requestAnimationFrame(() => issuesPanelRef.current?.resize("25%"))
  }, [activeSidebarTab])

  const closeIssuesPanel = useCallback(() => {
    issuesPanelRef.current?.collapse()
  }, [])

  /** Close split view and focus the Issues list in the left sidebar */
  const closeIssuesPanelToIssues = useCallback(() => {
    setActiveSidebarTab('issues')
    issuesPanelRef.current?.collapse()
  }, [])

  // ── Calibration + data collection tab props ─────────────────────────────

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
    setMicProfile,
  }), [calibration, spectrumRef, handleCalibrationExport, setMicProfile])

  const dataCollectionTabProps = useMemo(() => ({
    consentStatus: dataCollection.consentStatus,
    isCollecting: dataCollection.isCollecting,
    onEnableCollection: dataCollection.handleReEnable,
    onDisableCollection: dataCollection.handleRevoke,
  }), [dataCollection.consentStatus, dataCollection.isCollecting, dataCollection.handleReEnable, dataCollection.handleRevoke])

  // ── Render provider tree + UI ───────────────────────────────────────────

  return (
    <AdvisoryProvider
      onFalsePositive={handleFalsePositive}
      falsePositiveIds={mergedFpIds}
      onConfirmFeedback={handleConfirmFeedback}
      confirmedIds={confirmedIds}
    >
      <UIProvider rootRef={rootRef}>
        <FrozenSync frozenRef={frozenRef} />
        <FullscreenPortalGate rootEl={rootEl}>
          <KeyboardShortcuts />
          <Suspense fallback={null}>
            <LazyKeyboardShortcutsModal />
          </Suspense>

          <DataConsentDialog
            visible={dataCollection.showConsentDialog}
            onAccept={dataCollection.handleAccept}
            onDecline={dataCollection.handleDecline}
            isEU={dataCollection.isEU}
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
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-sm font-mono font-medium bg-destructive/15 text-destructive hover:bg-destructive/25 transition-colors cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-destructive/50"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Try Again
                  </button>
                  <button
                    onClick={() => setIsErrorDismissed(true)}
                    className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-card/40 transition-colors cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
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
                  className="ml-auto text-sm font-mono text-amber-400 hover:text-amber-300 underline underline-offset-2 flex-shrink-0 transition-colors cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-amber-500/50"
                >
                  Restart
                </button>
              </div>
            </div>
          )}

          <HeaderBar />
          <MobileLayout
            calibration={calibrationTabProps}
            dataCollection={dataCollectionTabProps}
            isWizardActive={isWizardActive}
            onStartWizard={startWizard}
            onFinishWizard={finishWizard}
            onStartRingOut={handleStartRingOut}
          />

          <DesktopLayout
            issuesPanelOpen={issuesPanelOpen}
            issuesPanelRef={issuesPanelRef}
            activeSidebarTab={activeSidebarTab}
            setActiveSidebarTab={setActiveSidebarTab}
            openIssuesPanel={openIssuesPanel}
            closeIssuesPanel={closeIssuesPanel}
            closeIssuesPanelToIssues={closeIssuesPanelToIssues}
            setIssuesPanelOpen={setIssuesPanelOpen}
            actualFps={actualFps}
            droppedPercent={droppedPercent}
            calibration={calibrationTabProps}
            dataCollection={dataCollectionTabProps}
            isWizardActive={isWizardActive}
            onStartWizard={startWizard}
            onFinishWizard={finishWizard}
            onStartRingOut={handleStartRingOut}
          />
        </FullscreenPortalGate>
      </UIProvider>
    </AdvisoryProvider>
  )
})

// ── FullscreenPortalGate: provides portal mount point based on fullscreen state ──

function FullscreenPortalGate({ rootEl, children }: { rootEl: HTMLDivElement | null; children: React.ReactNode }) {
  const { isFullscreen } = useUI()
  return (
    <PortalContainerProvider value={isFullscreen ? rootEl : null}>
      {children}
    </PortalContainerProvider>
  )
}

// ── Keyboard shortcuts (needs engine + UI) ──────────────────────────────────

function KeyboardShortcuts() {
  const { isRunning, start, stop } = useEngine()
  const { toggleFreeze } = useUI()

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      switch (e.key) {
        case ' ':
          e.preventDefault()
          if (isRunning) stop(); else start()
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
  }, [isRunning, toggleFreeze, start, stop])

  return null
}
