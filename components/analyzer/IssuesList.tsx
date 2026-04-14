'use client'

import { useEffect, useMemo, memo } from 'react'
import { useTheme } from 'next-themes'
import { getSeverityText, getSeverityColor } from '@/lib/utils/advisoryDisplay'
import type { Advisory } from '@/types/advisory'
import { useCompanion } from '@/hooks/useCompanion'
import { useAdvisories } from '@/contexts/AdvisoryContext'
import { useIssueAnnouncement } from '@/hooks/useIssueAnnouncement'
import {
  useIssuesListEntries,
  useStableIssueEntries,
} from '@/hooks/useIssuesListEntries'
import { useSwipeHintState } from '@/hooks/useSwipeHintState'
import { IssueCard } from './IssueCard'
import { IssuesEmptyState } from './IssuesEmptyState'
import { SEVERITY_ICON } from '@/components/analyzer/issueCardConfig'

interface IssuesListProps {
  advisories: Advisory[]
  maxIssues?: number
  dismissedIds?: Set<string>
  onClearAll?: () => void
  onClearResolved?: () => void
  touchFriendly?: boolean
  isRunning?: boolean
  onStart?: () => void
  onFalsePositive?: (advisoryId: string) => void
  falsePositiveIds?: ReadonlySet<string>
  onConfirmFeedback?: (advisoryId: string) => void
  confirmedIds?: ReadonlySet<string>
  isLowSignal?: boolean
  swipeLabeling?: boolean
  showAlgorithmScores?: boolean
  showPeqDetails?: boolean
  onStartRingOut?: () => void
  onDismiss?: (id: string) => void
}

export const IssuesList = memo(function IssuesList({
  advisories,
  maxIssues = 10,
  dismissedIds,
  onClearAll,
  onClearResolved,
  touchFriendly,
  isRunning,
  onStart,
  onFalsePositive,
  falsePositiveIds,
  onConfirmFeedback,
  confirmedIds,
  isLowSignal,
  swipeLabeling,
  showAlgorithmScores,
  showPeqDetails,
  onStartRingOut,
  onDismiss,
}: IssuesListProps) {
  const companion = useCompanion()
  const {
    settings: companionSettings,
    sendExplicitAdvisory,
    autoSendAdvisories,
  } = companion
  const { companionState } = useAdvisories()

  useEffect(() => {
    autoSendAdvisories(advisories)
  }, [
    advisories,
    autoSendAdvisories,
    companionSettings.enabled,
    companionSettings.autoSend,
    companionSettings.minConfidence,
    companionSettings.pairingCode,
  ])

  const latestEntries = useIssuesListEntries(advisories, dismissedIds, maxIssues)
  const sortedEntries = useStableIssueEntries(latestEntries)
  const liveAnnouncement = useIssueAnnouncement(sortedEntries)
  const { showSwipeHint, dismissSwipeHint } = useSwipeHintState(!!swipeLabeling)

  // Auto-dismiss swipe peek after animation completes (0.6s delay + 1.2s animation ≈ 2s)
  useEffect(() => {
    if (!showSwipeHint || !swipeLabeling || sortedEntries.length === 0) return
    const timerId = setTimeout(dismissSwipeHint, 2000)
    return () => clearTimeout(timerId)
  }, [showSwipeHint, swipeLabeling, sortedEntries.length, dismissSwipeHint])

  const hasResolved = useMemo(
    () => sortedEntries.some((entry) => entry.advisory.resolved),
    [sortedEntries],
  )

  return (
    <div className="flex flex-col gap-1.5">
      <div className="sr-only" aria-live="polite" aria-atomic="true" role="status">
        {liveAnnouncement}
      </div>

      {sortedEntries.length === 0 ? (
        <IssuesEmptyState
          isRunning={isRunning}
          isLowSignal={isLowSignal}
          onStart={onStart}
          onStartRingOut={onStartRingOut}
        />
      ) : (
        <>
          {sortedEntries.length > 1 ? (
            <div className="flex items-center justify-end gap-2">
              {onClearResolved && hasResolved ? (
                <button
                  onClick={onClearResolved}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors uppercase tracking-wide"
                >
                  Clear Done
                </button>
              ) : null}
              {onClearAll ? (
                <button
                  onClick={onClearAll}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors uppercase tracking-wide"
                >
                  Clear All
                </button>
              ) : null}
            </div>
          ) : null}

          {sortedEntries.map(({ advisory, occurrenceCount }, index) => (
            <IssueCard
              key={advisory.id}
              advisory={advisory}
              occurrenceCount={occurrenceCount}
              touchFriendly={touchFriendly}
              onFalsePositive={onFalsePositive}
              isFalsePositive={falsePositiveIds?.has(advisory.id) ?? false}
              onConfirmFeedback={onConfirmFeedback}
              isConfirmed={confirmedIds?.has(advisory.id) ?? false}
              swipeLabeling={swipeLabeling}
              showAlgorithmScores={showAlgorithmScores}
              showPeqDetails={showPeqDetails}
              onDismiss={onDismiss}
              onSendToMixer={
                companionSettings.enabled &&
                (advisory.label === 'ACOUSTIC_FEEDBACK' || advisory.label === 'POSSIBLE_RING')
                  ? sendExplicitAdvisory
                  : undefined
              }
              companionState={companionState.get(advisory.id)}
              peekSwipe={index === 0 && showSwipeHint && !!swipeLabeling}
            />
          ))}

          <SeverityLegend />
        </>
      )}
    </div>
  )
})

const LEGEND_SEVERITIES = [
  'RUNAWAY',
  'GROWING',
  'RESONANCE',
  'POSSIBLE_RING',
  'WHISTLE',
  'INSTRUMENT',
] as const

const SeverityLegend = memo(function SeverityLegend() {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme !== 'light'

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 pb-0.5 border-t border-border/30 mt-1">
      {LEGEND_SEVERITIES.map((severity) => {
        const Icon = SEVERITY_ICON[severity]
        const color = getSeverityColor(severity, isDark)
        if (!Icon) return null

        return (
          <span
            key={severity}
            className="inline-flex items-center gap-1 text-[10px] font-mono tracking-wide leading-none"
            style={{ color }}
          >
            <Icon className="w-2.5 h-2.5" />
            {getSeverityText(severity)}
          </span>
        )
      })}
    </div>
  )
})

