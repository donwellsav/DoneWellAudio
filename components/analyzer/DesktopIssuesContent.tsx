'use client'

import { memo, type ComponentProps } from 'react'
import { EarlyWarningPanel } from './EarlyWarningPanel'
import { ErrorBoundary } from './ErrorBoundary'
import { IssuesList } from './IssuesList'
import { RingOutWizard } from './RingOutWizard'
import type { RoomMode } from '@/lib/dsp/acousticUtils'
import type { EarlyWarning } from '@/hooks/audioAnalyzerTypes'
import type { Advisory } from '@/types/advisory'

interface DesktopIssuesContentProps {
  advisories: Advisory[]
  issuesListProps: ComponentProps<typeof IssuesList>
  earlyWarning: EarlyWarning | null
  isRunning: boolean
  roomModes: RoomMode[] | null
  isWizardActive?: boolean
  onFinishWizard?: () => void
  showStartWizardButton?: boolean
  onStartWizard?: () => void
  withErrorBoundary?: boolean
}

export const DesktopIssuesContent = memo(function DesktopIssuesContent({
  advisories,
  issuesListProps,
  earlyWarning,
  isRunning,
  roomModes,
  isWizardActive = false,
  onFinishWizard,
  showStartWizardButton = false,
  onStartWizard,
  withErrorBoundary = false,
}: DesktopIssuesContentProps) {
  if (isWizardActive) {
    return (
      <RingOutWizard
        advisories={advisories}
        onFinish={() => onFinishWizard?.()}
        isRunning={isRunning}
        roomModes={roomModes}
      />
    )
  }

  const issuesList = <IssuesList {...issuesListProps} />

  return (
    <>
      {withErrorBoundary ? <ErrorBoundary>{issuesList}</ErrorBoundary> : issuesList}
      {showStartWizardButton && onStartWizard ? (
        <button
          onClick={onStartWizard}
          className="w-full mt-2 py-2 rounded font-mono text-xs font-bold tracking-[0.15em] uppercase bg-[rgba(var(--tint-r),var(--tint-g),var(--tint-b),0.10)] border border-[rgba(var(--tint-r),var(--tint-g),var(--tint-b),0.30)] text-[var(--console-amber)] hover:bg-[rgba(var(--tint-r),var(--tint-g),var(--tint-b),0.18)] transition-colors cursor-pointer"
        >
          Start Ring-Out Wizard
        </button>
      ) : null}
      <EarlyWarningPanel earlyWarning={earlyWarning} />
    </>
  )
})
