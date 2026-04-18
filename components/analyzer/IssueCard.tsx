'use client'

import { memo, useEffect, useState } from 'react'
import { AlertTriangle, Check, TrendingUp } from 'lucide-react'
import { confidenceColor, RUNAWAY_COLOR } from '@/lib/canvas/canvasTokens'
import { getSeverityText } from '@/lib/utils/advisoryDisplay'
import { getRecommendationStrategyLabel } from '@/lib/utils/recommendationDisplay'
import { badgeClass } from '@/lib/utils/badgeClasses'
import { IssueCardActions } from './IssueCardActions'
import {
  SEVERITY_ENTER_CLASS,
  SEVERITY_ICON,
  SEVERITY_STRIP_CLASS,
} from '@/components/analyzer/issueCardConfig'
import { useIssueCardState } from '@/hooks/useIssueCardState'
import type { Advisory } from '@/types/advisory'
import type { CompanionAdvisoryState } from '@/contexts/AdvisoryContext'

export interface IssueCardProps {
  advisory: Advisory
  occurrenceCount: number
  touchFriendly?: boolean
  onFalsePositive?: (advisoryId: string) => void
  isFalsePositive?: boolean
  onConfirmFeedback?: (advisoryId: string) => void
  isConfirmed?: boolean
  swipeLabeling?: boolean
  showAlgorithmScores?: boolean
  showPeqDetails?: boolean
  onDismiss?: (advisoryId: string) => void
  onSendToMixer?: (advisory: Advisory) => void
  /** Companion ack/applied/failed state for this advisory (module → app feedback). */
  companionState?: CompanionAdvisoryState
  /** When true, animate a brief peek revealing swipe overlays (first card only, one-time). */
  peekSwipe?: boolean
}

export const IssueCard = memo(function IssueCard({
  advisory,
  occurrenceCount,
  touchFriendly,
  onFalsePositive,
  isFalsePositive,
  onConfirmFeedback,
  isConfirmed,
  swipeLabeling,
  showAlgorithmScores,
  showPeqDetails,
  onDismiss,
  onSendToMixer,
  companionState,
  peekSwipe,
}: IssueCardProps) {
  const {
    pitchStr,
    exactFreqStr,
    isClustered,
    velocity,
    isRunaway,
    isWarning,
    isResolved,
    peqNotchSvgPath,
    severityColor,
    copied,
    handleCopy,
    swipeX,
    swiping,
    swipeProgress,
    swipeDirection,
    handlers,
    actionsLayout,
    handleSendToMixer,
  } = useIssueCardState({
    advisory,
    touchFriendly,
    swipeLabeling,
    onFalsePositive,
    onConfirmFeedback,
    onDismiss,
    onSendToMixer,
  })

  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    if (isResolved) return

    const intervalId = window.setInterval(() => {
      setNowMs(Date.now())
    }, 1000)

    return () => window.clearInterval(intervalId)
  }, [isResolved])

  const ageSec = Math.max(0, Math.round((nowMs - advisory.timestamp) / 1000))
  const ageStr = ageSec < 5 ? 'just now' : ageSec < 60 ? `${ageSec}s` : `${Math.floor(ageSec / 60)}m`
  const SeverityIconEl = SEVERITY_ICON[advisory.severity] ?? null
  const strategyLabel = getRecommendationStrategyLabel(advisory.advisory?.peq)
  const strategyReason = advisory.advisory?.peq?.reason
  const operatorNote =
    isClustered
      ? `Broader region: merged ${advisory.clusterCount} nearby peaks. If this keeps returning, recheck placement or broad EQ before stacking more narrow cuts.`
      : occurrenceCount >= 3
        ? 'Repeat band: if this keeps coming back, recheck mic and speaker geometry or broad EQ before stacking more cuts.'
        : null

  return (
    <div
      className={`group relative flex flex-col rounded glass-card ${SEVERITY_ENTER_CLASS[advisory.severity] ?? 'animate-issue-enter'} overflow-hidden ${
        isFalsePositive
          ? 'border-red-500/30 opacity-50'
          : isResolved
            ? 'border-border/50'
            : isRunaway
              ? 'border-red-500/70 animate-emergency-glow'
              : isWarning
                ? 'border-amber-500/60 shadow-[0_0_8px_rgba(var(--tint-r),var(--tint-g),var(--tint-b),0.3)] ring-1 ring-amber-500/15'
                : 'border-border/40 hover:border-primary/30'
      }`}
      onTouchStart={handlers.onTouchStart}
      onTouchMove={handlers.onTouchMove}
      onTouchEnd={handlers.onTouchEnd}
    >
      {/* Swipe peek: static dual overlay shown during one-time peek animation */}
      {swipeLabeling && peekSwipe && !swiping ? (
        <div className="absolute inset-0 flex items-center z-0 pointer-events-none" aria-hidden>
          <div
            className="absolute inset-0 flex items-center justify-end pr-4 rounded"
            style={{ backgroundColor: 'rgba(120, 120, 130, 0.12)' }}
          >
            <span className="text-xs font-mono font-bold text-muted-foreground uppercase tracking-wider opacity-60">
              DISMISS
            </span>
          </div>
          <div
            className="absolute inset-0 flex items-center justify-start pl-4 rounded"
            style={{ backgroundColor: 'rgba(245, 158, 11, 0.12)' }}
          >
            <span className="text-xs font-mono font-bold text-[var(--console-amber)] uppercase tracking-wider opacity-60">
              CONFIRM
            </span>
          </div>
        </div>
      ) : null}

      {/* Active swipe: dynamic overlay follows finger */}
      {swipeLabeling && swiping ? (
        <div className="absolute inset-0 flex items-center z-0" aria-hidden>
          {swipeDirection === 'left' ? (
            <div
              className="absolute inset-0 flex items-center justify-end pr-4 rounded"
              style={{ backgroundColor: `rgba(120, 120, 130, ${swipeProgress * 0.25})` }}
            >
              <span
                className="text-xs font-mono font-bold text-muted-foreground uppercase tracking-wider"
                style={{ opacity: swipeProgress }}
              >
                DISMISS
              </span>
            </div>
          ) : null}
          {swipeDirection === 'right' ? (
            <div
              className="absolute inset-0 flex items-center justify-start pl-4 rounded"
              style={{ backgroundColor: `rgba(245, 158, 11, ${swipeProgress * 0.25})` }}
            >
              <span
                className="text-xs font-mono font-bold text-[var(--console-amber)] uppercase tracking-wider"
                style={{ opacity: swipeProgress }}
              >
                CONFIRM
              </span>
            </div>
          ) : null}
        </div>
      ) : null}

      <div
        className={`absolute left-0 top-0 bottom-0 ${SEVERITY_STRIP_CLASS[advisory.severity] ?? 'animate-strip-flash'} ${
          isRunaway
            ? 'severity-accent-strip-runaway'
            : advisory.severity === 'GROWING'
              ? 'severity-accent-strip-growing'
              : 'severity-accent-strip'
        }`}
        style={{
          backgroundColor: isResolved ? 'hsl(var(--muted))' : severityColor,
          boxShadow: isResolved
            ? 'none'
            : isRunaway
              ? `3px 0 12px -1px ${severityColor}70, 0 0 6px -1px ${severityColor}50`
              : `2px 0 8px -2px ${severityColor}50, 0 0 4px -1px ${severityColor}30`,
        }}
      />

      <div
        className={`flex flex-col relative z-10 @container pl-3 pr-1 pt-0.5${swipeLabeling && peekSwipe && !swiping ? ' animate-swipe-peek' : ''}`}
        style={
          swipeLabeling && swiping
            ? {
                transform: `translateX(${swipeX}px)`,
                transition: swiping ? 'none' : 'transform 200ms ease-out',
              }
            : undefined
        }
      >
        <div className="flex items-baseline gap-1.5">
          {SeverityIconEl ? (
            <span
              className="flex-shrink-0 inline-flex items-center justify-center self-center"
              style={{ color: severityColor, opacity: 0.8 }}
              title={getSeverityText(advisory.severity)}
            >
              <SeverityIconEl className="w-3.5 h-3.5" />
            </span>
          ) : null}

          <span
            className={`font-mono font-black leading-none tracking-tight cursor-default ${
              isRunaway ? 'text-3xl @[320px]:text-4xl' : 'text-2xl @[320px]:text-3xl'
            } ${isFalsePositive ? 'line-through opacity-50' : ''}`}
            style={{
              fontVariantNumeric: 'tabular-nums slashed-zero',
              color: isFalsePositive ? undefined : isResolved ? 'hsl(var(--muted-foreground))' : severityColor,
              textShadow: isFalsePositive || isResolved
                ? 'none'
                : isRunaway
                  ? `0 0 24px ${severityColor}90, 0 0 10px ${severityColor}60, 0 0 3px ${severityColor}40`
                  : isWarning
                    ? `0 0 16px ${severityColor}70, 0 0 6px ${severityColor}40`
                    : `0 0 12px ${severityColor}50, 0 0 4px ${severityColor}30`,
              letterSpacing: '-0.02em',
            }}
          >
            {exactFreqStr}
          </span>

          {pitchStr ? (
            <span className="text-[11px] font-mono text-muted-foreground/70 leading-none self-end mb-0.5">
              {pitchStr}
            </span>
          ) : null}

          <div className="ml-auto flex items-center gap-1 flex-shrink-0 self-center">
            {companionState?.applied ? (
              <span
                className={badgeClass('success')}
                aria-label={`Applied by Companion: ${companionState.applied.gainDb}dB${companionState.applied.slotIndex !== undefined ? ` on slot ${companionState.applied.slotIndex}` : ''}`}
                title={`Applied by Companion: ${companionState.applied.gainDb}dB${companionState.applied.slotIndex !== undefined ? ` on slot ${companionState.applied.slotIndex}` : ''}`}
              >
                <Check className="w-2.5 h-2.5" />
                {companionState.applied.gainDb}dB
              </span>
            ) : null}
            {companionState?.partialApply ? (
              <span
                className={badgeClass('warning')}
                aria-label={`Partial apply: ${companionState.partialApply.peqApplied ? 'PEQ applied' : 'PEQ failed'}, ${companionState.partialApply.geqApplied ? 'GEQ applied' : 'GEQ failed'}${companionState.partialApply.failReason ? `; ${companionState.partialApply.failReason}` : ''}`}
                title={`Partial apply: ${companionState.partialApply.peqApplied ? 'PEQ applied' : 'PEQ failed'}, ${companionState.partialApply.geqApplied ? 'GEQ applied' : 'GEQ failed'}${companionState.partialApply.failReason ? `; ${companionState.partialApply.failReason}` : ''}`}
              >
                <AlertTriangle className="w-2.5 h-2.5" />
                PARTIAL
              </span>
            ) : null}
            {companionState?.partialClear ? (
              <span
                className={badgeClass('warning')}
                aria-label={`Partial clear: ${companionState.partialClear.peqCleared ? 'PEQ cleared' : 'PEQ failed'}, ${companionState.partialClear.geqCleared ? 'GEQ cleared' : 'GEQ failed'}${companionState.partialClear.failReason ? `; ${companionState.partialClear.failReason}` : ''}`}
                title={`Partial clear: ${companionState.partialClear.peqCleared ? 'PEQ cleared' : 'PEQ failed'}, ${companionState.partialClear.geqCleared ? 'GEQ cleared' : 'GEQ failed'}${companionState.partialClear.failReason ? `; ${companionState.partialClear.failReason}` : ''}`}
              >
                <AlertTriangle className="w-2.5 h-2.5" />
                CLR PART
              </span>
            ) : null}
            {companionState?.failed ? (
              <span
                className={badgeClass('error')}
                aria-label={`Apply failed: ${companionState.failed.reason}`}
                title={`Apply failed: ${companionState.failed.reason}`}
              >
                <AlertTriangle className="w-2.5 h-2.5" />
                FAIL
              </span>
            ) : null}
            {companionState?.clearFailed ? (
              <span
                className={badgeClass('error')}
                aria-label={`Clear failed: ${companionState.clearFailed.reason}`}
                title={`Clear failed: ${companionState.clearFailed.reason}`}
              >
                <AlertTriangle className="w-2.5 h-2.5" />
                CLR FAIL
              </span>
            ) : null}
            {occurrenceCount >= 3 ? (
              <span
                className={badgeClass('warning')}
                aria-label={`Repeat offender: detected ${occurrenceCount} times`}
                title={`Repeat offender: detected ${occurrenceCount} times`}
              >
                <TrendingUp className="w-2.5 h-2.5" />
                {occurrenceCount}×
              </span>
            ) : null}
            {isClustered ? (
              <span
                className={badgeClass('info', 'sm')}
                title={`Merged cluster - Q widened. Center: ${exactFreqStr}`}
              >
                {advisory.clusterCount}pk
              </span>
            ) : null}
            {advisory.confidence != null ? (
              <span
                className="inline-flex items-center gap-0.5 text-[9px] font-mono leading-none"
                role="img"
                aria-label={`${Math.round(advisory.confidence * 100)}% confidence`}
                title={`${Math.round(advisory.confidence * 100)}% confidence`}
              >
                <svg width="12" height="12" viewBox="0 0 18 18" className="flex-shrink-0" aria-hidden>
                  <circle cx="9" cy="9" r="7" fill="none" stroke="currentColor" strokeWidth="1.5" opacity={0.06} />
                  <circle
                    cx="9"
                    cy="9"
                    r="7"
                    fill="none"
                    stroke={confidenceColor(advisory.confidence ?? 0)}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeDasharray={`${advisory.confidence * 44} 44`}
                    transform="rotate(-90 9 9)"
                  />
                </svg>
                <span className={`${
                  advisory.confidence >= 0.85
                    ? 'text-emerald-400/70'
                    : advisory.confidence >= 0.70
                      ? 'text-blue-400/70'
                      : advisory.confidence >= 0.45
                        ? 'text-amber-400/70'
                        : 'text-muted-foreground/40'
                }`}
                >
                  {Math.round(advisory.confidence * 100)}%
                </span>
              </span>
            ) : null}
            {!isResolved ? (
              <span className="text-[9px] text-muted-foreground/70 font-mono leading-none">{ageStr}</span>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-sm font-mono leading-none">
          {advisory.advisory?.peq ? (
            <>
              <span style={{ color: severityColor, opacity: 0.8 }}>
                <span className="font-bold">{advisory.advisory.peq.gainDb}dB</span> Q:{Math.round(advisory.advisory.peq.q)}
              </span>
              {strategyLabel ? (
                <span className={`text-[9px] uppercase tracking-wide ${
                  advisory.advisory.peq.strategy === 'broad-region'
                    ? 'text-blue-300/70'
                    : 'text-muted-foreground/45'
                }`}>
                  {strategyLabel}
                </span>
              ) : null}
            </>
          ) : null}
          {velocity > 0 && !isResolved ? (
            <span className={`flex items-center gap-0.5 ${
              isRunaway ? 'text-red-400' : isWarning ? 'text-amber-400' : 'text-muted-foreground/40'
            }`}
            >
              {isRunaway || isWarning ? (
                <AlertTriangle className={`w-2 h-2 flex-shrink-0 ${isRunaway ? 'motion-safe:animate-pulse' : ''}`} />
              ) : null}
              <span>+{velocity.toFixed(0)}dB/s</span>
            </span>
          ) : null}
          {actionsLayout === 'desktop' || actionsLayout === 'copy-only' ? (
            <div className="ml-auto flex items-center opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150">
              <IssueCardActions
                advisoryId={advisory.id}
                exactFreqStr={exactFreqStr}
                onFalsePositive={onFalsePositive}
                isFalsePositive={isFalsePositive}
                onConfirmFeedback={onConfirmFeedback}
                isConfirmed={isConfirmed}
                onDismiss={onDismiss}
                onCopy={handleCopy}
                copied={copied}
                onSendToMixer={handleSendToMixer}
                layout={actionsLayout}
              />
            </div>
          ) : null}
        </div>

        {showAlgorithmScores && advisory.algorithmScores ? (
          <div className="text-[9px] font-mono text-muted-foreground/70 tracking-wide leading-none">
            {[
              advisory.algorithmScores.msd != null && `MSD:${advisory.algorithmScores.msd.toFixed(2)}`,
              advisory.algorithmScores.phase != null && `PH:${advisory.algorithmScores.phase.toFixed(2)}`,
              advisory.algorithmScores.spectral != null && `SP:${advisory.algorithmScores.spectral.toFixed(2)}`,
              advisory.algorithmScores.comb != null && `CM:${advisory.algorithmScores.comb.toFixed(2)}`,
              advisory.algorithmScores.ihr != null && `IH:${advisory.algorithmScores.ihr.toFixed(2)}`,
              advisory.algorithmScores.ptmr != null && `PT:${advisory.algorithmScores.ptmr.toFixed(2)}`,
              advisory.algorithmScores.ml != null && `ML:${advisory.algorithmScores.ml.toFixed(2)}`,
            ].filter(Boolean).join('  ')}
            {' -> '}{advisory.algorithmScores.fusedProbability.toFixed(2)}
          </div>
        ) : null}

        {showPeqDetails && advisory.advisory?.peq && peqNotchSvgPath ? (
          <div className="flex items-center gap-1.5">
            <svg width="40" height="14" viewBox="0 0 40 14" aria-hidden className="flex-shrink-0">
              <path d={peqNotchSvgPath} fill="none" stroke={severityColor} strokeWidth="1.2" strokeOpacity="0.5" />
            </svg>
            <span className="text-[9px] font-mono text-muted-foreground/40 tracking-wide leading-none">
              {advisory.advisory.peq.type} @ {advisory.advisory.peq.hz.toFixed(0)}Hz | Q:{advisory.advisory.peq.q.toFixed(1)} | {advisory.advisory.peq.gainDb}dB
              {advisory.advisory.peq.bandwidthHz != null ? ` | BW:${advisory.advisory.peq.bandwidthHz.toFixed(0)}Hz` : ''}
            </span>
          </div>
        ) : null}

        {strategyReason ? (
          <p className="text-[9px] font-mono text-blue-300/70 leading-relaxed">
            {strategyReason}
          </p>
        ) : null}

        {operatorNote ? (
          <p className="text-[9px] font-mono text-muted-foreground/55 leading-relaxed">
            {operatorNote}
          </p>
        ) : null}

        {actionsLayout === 'mobile' ? (
          <IssueCardActions
            advisoryId={advisory.id}
            exactFreqStr={exactFreqStr}
            onFalsePositive={onFalsePositive}
            isFalsePositive={isFalsePositive}
            onConfirmFeedback={onConfirmFeedback}
            isConfirmed={isConfirmed}
            onDismiss={onDismiss}
            onCopy={handleCopy}
            copied={copied}
            onSendToMixer={handleSendToMixer}
            layout="mobile"
          />
        ) : null}
      </div>

      {!isResolved ? (
        <div className="h-[3px] w-full relative" aria-hidden title={`Freshness: ${Math.max(0, 60 - ageSec)}s remaining`}>
          <div
            className="absolute inset-0 h-full rounded-full transition-[width,background-color] duration-500 ease-linear"
            style={{
              width: `${Math.max(0, (1 - ageSec / 60)) * 100}%`,
              backgroundColor: `${severityColor}b3`,
            }}
          />
          {ageSec > 20 ? (
            <div
              className="absolute inset-0 h-full rounded-full transition-[width,opacity] duration-500 ease-linear"
              style={{
                width: `${Math.max(0, (1 - ageSec / 60)) * 100}%`,
                backgroundColor: RUNAWAY_COLOR,
                opacity: Math.min(0.55, ((ageSec - 20) / 40) * 0.55),
              }}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  )
})
