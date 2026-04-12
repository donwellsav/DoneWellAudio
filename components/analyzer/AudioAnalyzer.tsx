'use client'

import { useState, useCallback, useRef, memo, lazy, Suspense, useLayoutEffect } from 'react'
import type { DataCollectionHandle } from '@/hooks/useDataCollection'
import { AnalyzerKeyboardShortcuts } from './AnalyzerKeyboardShortcuts'
import { AudioAnalyzerAlerts } from './AudioAnalyzerAlerts'
import { AudioAnalyzerFooter } from './AudioAnalyzerFooter'
import { HeaderBar } from './HeaderBar'
import { MobileLayout } from './MobileLayout'
import { DesktopLayout } from './DesktopLayout'
import { PortalContainerProvider } from '@/contexts/PortalContainerContext'
import { useAudioAnalyzerViewState } from '@/hooks/useAudioAnalyzerViewState'

const LazyOnboardingOverlay = lazy(() => import('./OnboardingOverlay').then(m => ({ default: m.OnboardingOverlay })))
const LazyKeyboardShortcutsModal = lazy(() => import('./KeyboardShortcutsModal').then(m => ({ default: m.KeyboardShortcutsModal })))
import { DataConsentDialog } from './DataConsentDialog'
import { useDataCollection } from '@/hooks/useDataCollection'
import { AudioAnalyzerProvider } from '@/contexts/AudioAnalyzerContext'
import { AdvisoryProvider } from '@/contexts/AdvisoryContext'
import { UIProvider, useUI } from '@/contexts/UIContext'
import { CompanionCommandBridge } from '@/components/analyzer/CompanionCommandBridge'
import { useServiceWorkerUpdate } from '@/hooks/useServiceWorkerUpdate'

export const AudioAnalyzer = memo(function AudioAnalyzerComponent() {
  const dataCollection = useDataCollection()
  const frozenRef = useRef(false)
  const { updateAvailable, applyUpdate } = useServiceWorkerUpdate()

  const rootRef = useRef<HTMLDivElement>(null)
  const [rootEl, setRootEl] = useState<HTMLDivElement | null>(null)
  const rootCallbackRef = useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node
    setRootEl(node)
  }, [])

  return (
    <div id="main" ref={rootCallbackRef} className="flex flex-col h-screen bg-background">
      <AudioAnalyzerProvider dataCollection={dataCollection} frozenRef={frozenRef}>
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

      {/* Footer moved inside AudioAnalyzerInner for context access */}

      {updateAvailable ? (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2.5 rounded-lg glass-card border border-primary/30 shadow-lg animate-issue-enter">
          <span className="text-sm font-mono text-foreground">New version available</span>
          <button
            onClick={applyUpdate}
            className="px-3 py-1 text-xs font-mono font-bold uppercase tracking-wider rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Update
          </button>
        </div>
      ) : null}
    </div>
  )
})

function FrozenSync({ frozenRef }: { frozenRef: React.RefObject<boolean> }) {
  const { isFrozen } = useUI()
  useLayoutEffect(() => {
    frozenRef.current = isFrozen
  })
  return null
}

interface AudioAnalyzerInnerProps {
  dataCollection: DataCollectionHandle
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
  const {
    isRunning,
    error,
    workerError,
    isWorkerPermanentlyDead,
    actualFps,
    droppedPercent,
    shellState,
    ringOutFlow,
    advisoryFeedback,
    calibrationTabProps,
    dataCollectionTabProps,
  } = useAudioAnalyzerViewState(dataCollection)

  return (
    <AdvisoryProvider
      onFalsePositive={advisoryFeedback.handleFalsePositive}
      falsePositiveIds={advisoryFeedback.falsePositiveIds}
      onConfirmFeedback={advisoryFeedback.handleConfirmFeedback}
      confirmedIds={advisoryFeedback.confirmedIds}
    >
      <UIProvider rootRef={rootRef}>
        <FrozenSync frozenRef={frozenRef} />
        <CompanionCommandBridge />
        <FullscreenPortalGate rootEl={rootEl}>
          <AnalyzerKeyboardShortcuts />
          <Suspense fallback={null}>
            <LazyKeyboardShortcutsModal />
          </Suspense>

          <DataConsentDialog
            visible={dataCollection.showConsentDialog}
            onAccept={dataCollection.handleAccept}
            onDecline={dataCollection.handleDecline}
            isEU={dataCollection.isEU}
          />

          <AudioAnalyzerAlerts
            error={error}
            workerError={workerError}
            isErrorDismissed={shellState.isErrorDismissed}
            isWorkerPermanentlyDead={isWorkerPermanentlyDead}
            onDismissError={() => shellState.setIsErrorDismissed(true)}
            onRetry={shellState.handleRetry}
          />

          <HeaderBar />
          <MobileLayout
            calibration={calibrationTabProps}
            dataCollection={dataCollectionTabProps}
            isWizardActive={ringOutFlow.isWizardActive}
            onStartWizard={ringOutFlow.startWizard}
            onFinishWizard={ringOutFlow.finishWizard}
            onStartRingOut={ringOutFlow.startRingOut}
          />

          <DesktopLayout
            issuesPanelOpen={shellState.issuesPanelOpen}
            issuesPanelRef={shellState.issuesPanelRef}
            activeSidebarTab={shellState.activeSidebarTab}
            setActiveSidebarTab={shellState.setActiveSidebarTab}
            openIssuesPanel={shellState.openIssuesPanel}
            closeIssuesPanel={shellState.closeIssuesPanel}
            closeIssuesPanelToIssues={shellState.closeIssuesPanelToIssues}
            setIssuesPanelOpen={shellState.setIssuesPanelOpen}
            actualFps={actualFps}
            droppedPercent={droppedPercent}
            calibration={calibrationTabProps}
            dataCollection={dataCollectionTabProps}
            isWizardActive={ringOutFlow.isWizardActive}
            onStartWizard={ringOutFlow.startWizard}
            onFinishWizard={ringOutFlow.finishWizard}
            onStartRingOut={ringOutFlow.startRingOut}
          />
        </FullscreenPortalGate>
        <AudioAnalyzerFooter />
      </UIProvider>
    </AdvisoryProvider>
  )
})

function FullscreenPortalGate({ rootEl, children }: { rootEl: HTMLDivElement | null; children: React.ReactNode }) {
  const { isFullscreen } = useUI()
  return (
    <PortalContainerProvider value={isFullscreen ? rootEl : null}>
      {children}
    </PortalContainerProvider>
  )
}
