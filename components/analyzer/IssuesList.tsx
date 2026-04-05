'use client'

import { useCallback, useEffect, useMemo, memo } from 'react'
import { useTheme } from 'next-themes'
import { ArrowLeft, ArrowRight, Timer } from 'lucide-react'
import { getSeverityText } from '@/lib/dsp/classifier'
import { getSeverityColor } from '@/lib/dsp/eqAdvisor'
import type { Advisory } from '@/types/advisory'
import { useCompanion } from '@/hooks/useCompanion'
import { useIssueAnnouncement } from '@/hooks/useIssueAnnouncement'
import {
  useIssuesListEntries,
  useStableIssueEntries,
} from '@/hooks/useIssuesListEntries'
import { useSwipeHintState } from '@/hooks/useSwipeHintState'
import { usePA2 } from '@/contexts/PA2Context'
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
    sendAdvisory,
    autoSendAdvisories,
  } = companion
  const pa2 = usePA2()

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

          {showSwipeHint && swipeLabeling && sortedEntries.length > 0 ? (
            <SwipeHint onDismiss={dismissSwipeHint} />
          ) : null}

          {sortedEntries.map(({ advisory, occurrenceCount }) => (
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
              onSendToMixer={companionSettings.enabled ? sendAdvisory : undefined}
              onSendToPA2={
                pa2.settings.enabled && pa2.status === 'connected'
                  ? pa2.sendDetections
                  : undefined
              }
              pa2Connected={pa2.settings.enabled && pa2.status === 'connected'}
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

const SWIPE_HINT_AUTO_DISMISS_MS = 8000

const SwipeHint = memo(function SwipeHint({ onDismiss }: { onDismiss: () => void }) {
  useEffect(() => {
    const timerId = setTimeout(onDismiss, SWIPE_HINT_AUTO_DISMISS_MS)
    return () => clearTimeout(timerId)
  }, [onDismiss])

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Escape') {
      event.preventDefault()
      onDismiss()
    }
  }, [onDismiss])

  return (
    <div
      className="flex items-center justify-center gap-4 px-3 py-2 rounded-md bg-primary/10 border border-primary/20 text-xs font-mono text-muted-foreground animate-issue-enter cursor-pointer"
      role="button"
      tabIndex={0}
      onClick={onDismiss}
      onKeyDown={handleKeyDown}
      aria-label="Swipe gesture guide. Press Enter to close."
    >
      <span className="flex items-center gap-1">
        <ArrowLeft className="w-3 h-3 text-muted-foreground" />
        Dismiss
      </span>
      <span className="flex items-center gap-1">
        <ArrowRight className="w-3 h-3 text-emerald-400" />
        Confirm
      </span>
      <span className="flex items-center gap-1">
        <Timer className="w-3 h-3 text-red-400" />
        False+
      </span>
    </div>
  )
})
