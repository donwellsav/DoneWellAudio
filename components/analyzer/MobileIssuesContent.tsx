'use client'

import { memo, type ComponentProps } from 'react'
import { EarlyWarningPanel } from '@/components/analyzer/EarlyWarningPanel'
import { ErrorBoundary } from '@/components/analyzer/ErrorBoundary'
import { IssuesList } from '@/components/analyzer/IssuesList'
import { RingOutWizard } from '@/components/analyzer/RingOutWizard'
import type { RoomMode } from '@/lib/dsp/acousticUtils'
import type { Advisory } from '@/types/advisory'

type IssuesListBaseProps = Pick<
  ComponentProps<typeof IssuesList>,
  | 'dismissedIds'
  | 'isRunning'
  | 'onStart'
  | 'onFalsePositive'
  | 'falsePositiveIds'
  | 'onConfirmFeedback'
  | 'confirmedIds'
  | 'isLowSignal'
  | 'swipeLabeling'
  | 'showAlgorithmScores'
  | 'showPeqDetails'
  | 'onDismiss'
>

interface MobileIssuesContentProps {
  advisories: Advisory[]
  mobileAdvisories: Advisory[]
  earlyWarning: ComponentProps<typeof EarlyWarningPanel>['earlyWarning']
  isRunning: boolean
  isWizardActive?: boolean
  issuesListBaseProps: IssuesListBaseProps
  onClearAll: () => void
  onClearResolved: () => void
  onFinishWizard?: () => void
  onStartRingOut?: () => void
  roomModes?: RoomMode[] | null
}

export const MobileIssuesContent = memo(function MobileIssuesContent({
  advisories,
  mobileAdvisories,
  earlyWarning,
  isRunning,
  isWizardActive,
  issuesListBaseProps,
  onClearAll,
  onClearResolved,
  onFinishWizard,
  onStartRingOut,
  roomModes,
}: MobileIssuesContentProps) {
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

  return (
    <>
      <ErrorBoundary>
        <IssuesList
          {...issuesListBaseProps}
          advisories={mobileAdvisories}
          maxIssues={mobileAdvisories.length}
          onClearAll={onClearAll}
          onClearResolved={onClearResolved}
          touchFriendly
          swipeLabeling
          onStartRingOut={onStartRingOut}
        />
      </ErrorBoundary>
      <EarlyWarningPanel earlyWarning={earlyWarning} />
    </>
  )
})
