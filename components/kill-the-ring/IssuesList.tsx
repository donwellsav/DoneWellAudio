'use client'

import { useMemo, memo } from 'react'
import { formatFrequency, formatPitch } from '@/lib/utils/pitchUtils'
import { getSeverityColor } from '@/lib/dsp/eqAdvisor'
import { getSeverityText } from '@/lib/dsp/classifier'
import { getFeedbackHistory } from '@/lib/dsp/feedbackHistory'
import { AlertTriangle, CheckCircle2, X, TrendingUp } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { Advisory } from '@/types/advisory'

// Velocity thresholds for runaway prediction
const RUNAWAY_VELOCITY_THRESHOLD = 15 // dB/s
const WARNING_VELOCITY_THRESHOLD = 10 // dB/s

interface IssuesListProps {
  advisories: Advisory[]
  maxIssues?: number
  dismissedIds?: Set<string>
  onDismiss?: (id: string) => void
  onClearAll?: () => void
  onClearResolved?: () => void
  touchFriendly?: boolean
}

export const IssuesList = memo(function IssuesList({ advisories, maxIssues = 10, dismissedIds, onDismiss, onClearAll, onClearResolved, touchFriendly }: IssuesListProps) {
  // Filter dismissed, sort repeat offenders to top by hit count, then slice to max
  const sorted = useMemo(() => {
    const history = getFeedbackHistory()
    return [...advisories]
      .filter((a) => !dismissedIds?.has(a.id))
      .sort((a, b) => {
        // 1. Active before resolved
        if (a.resolved !== b.resolved) return a.resolved ? 1 : -1
        // 2. Repeat offenders (3+) float to top, sorted by count desc
        const aCount = history.getOccurrenceCount(a.trueFrequencyHz)
        const bCount = history.getOccurrenceCount(b.trueFrequencyHz)
        const aRepeat = aCount >= 3
        const bRepeat = bCount >= 3
        if (aRepeat !== bRepeat) return aRepeat ? -1 : 1
        if (aRepeat && bRepeat) return bCount - aCount
        // 3. Non-repeaters: frequency ascending
        return (a.trueFrequencyHz ?? 0) - (b.trueFrequencyHz ?? 0)
      })
      .slice(0, maxIssues)
  }, [advisories, dismissedIds, maxIssues])

  const hasResolved = sorted.some(a => a.resolved)

  return (
    <div className="flex flex-col gap-1.5">
      {sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 min-h-[120px] text-muted-foreground py-8">
          <CheckCircle2 className="w-5 h-5 text-blue-500/40 mb-2" />
          <div className="text-sm font-medium">No issues detected</div>
          <div className="text-xs mt-1 text-muted-foreground/60">Monitoring for feedback...</div>
        </div>
      ) : (
        <>
          {sorted.length > 1 && (
            <div className="flex items-center justify-end gap-2">
              {onClearResolved && hasResolved && (
                <button
                  onClick={onClearResolved}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors uppercase tracking-wide"
                >
                  Clear Resolved
                </button>
              )}
              {onClearAll && (
                <button
                  onClick={onClearAll}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors uppercase tracking-wide"
                >
                  Clear All
                </button>
              )}
            </div>
          )}
          {sorted.map((advisory) => (
            <IssueCard
              key={advisory.id}
              advisory={advisory}
              onDismiss={onDismiss}
              touchFriendly={touchFriendly}
            />
          ))}
        </>
      )}
    </div>
  )
})

interface IssueCardProps {
  advisory: Advisory
  onDismiss?: (id: string) => void
  touchFriendly?: boolean
}

const IssueCard = memo(function IssueCard({ advisory, onDismiss, touchFriendly }: IssueCardProps) {
  const occurrenceCount = useMemo(
    () => getFeedbackHistory().getOccurrenceCount(advisory.trueFrequencyHz),
    [advisory.trueFrequencyHz]
  )
  const severityColor = getSeverityColor(advisory.severity)
  const pitchStr = advisory.advisory?.pitch ? formatPitch(advisory.advisory.pitch) : null
  const exactFreqStr = advisory.trueFrequencyHz != null ? formatFrequency(advisory.trueFrequencyHz) : '---'

  const geq = advisory.advisory?.geq
  const peq = advisory.advisory?.peq
  const bandHz = geq?.bandHz

  const velocity = advisory.velocityDbPerSec ?? 0
  const isRunaway = velocity >= RUNAWAY_VELOCITY_THRESHOLD || advisory.isRunaway
  const isWarning = velocity >= WARNING_VELOCITY_THRESHOLD && !isRunaway
  const isResolved = advisory.resolved === true
  const hasEq = !!(geq && peq)

  const timeToClipMs = advisory.predictedTimeToClipMs ?? (
    velocity > 0 && advisory.trueAmplitudeDb < 0
      ? ((0 - advisory.trueAmplitudeDb) / velocity) * 1000
      : null
  )
  const timeToClipStr = timeToClipMs != null && timeToClipMs < 5000
    ? `~${(timeToClipMs / 1000).toFixed(1)}s`
    : null

  // Build tooltip detail string for niche metadata
  const detailParts: string[] = []
  if (advisory.modalOverlapFactor != null && advisory.modalOverlapFactor < 0.3)
    detailParts.push(`Modal overlap: ${advisory.modalOverlapFactor.toFixed(2)} (isolated)`)
  if (advisory.cumulativeGrowthDb != null && advisory.cumulativeGrowthDb > 3)
    detailParts.push(`Buildup: +${advisory.cumulativeGrowthDb.toFixed(1)}dB`)
  if (advisory.frequencyBand)
    detailParts.push(`Band: ${advisory.frequencyBand}`)

  return (
    <div
      className={`relative flex flex-col rounded-md border bg-card transition-all overflow-hidden ${
        isResolved
          ? 'border-border/50'
          : isRunaway
              ? 'border-red-500/70 shadow-[0_0_8px_rgba(239,68,68,0.35)] animate-pulse'
              : isWarning
                ? 'border-amber-500/60 shadow-[0_0_4px_rgba(245,158,11,0.25)]'
                : 'border-border hover:border-border/80'
      }`}
    >
      {/* Left severity accent */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1 rounded-r-sm"
        style={{ backgroundColor: isResolved ? 'hsl(var(--muted))' : severityColor }}
      />

      <div className="pl-3 pr-1.5 py-1.5 flex flex-col gap-1">

        {/* Top section: 2-column — frequency LEFT, badges RIGHT */}
        <div className="flex items-start justify-between gap-2">
          {/* LEFT: Frequency hero + pitch/band */}
          <div className="flex flex-col min-w-0">
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="font-mono text-base font-bold text-foreground leading-none tracking-tight cursor-default">
                    {exactFreqStr}
                  </span>
                </TooltipTrigger>
                {detailParts.length > 0 && (
                  <TooltipContent side="top" className="text-xs space-y-0.5">
                    {detailParts.map((d, i) => <div key={i}>{d}</div>)}
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
            {(pitchStr || (bandHz != null && bandHz !== advisory.trueFrequencyHz)) && (
              <div className="flex items-baseline gap-1 mt-0.5">
                {pitchStr && (
                  <span className="text-xs font-mono text-muted-foreground leading-none">{pitchStr}</span>
                )}
                {bandHz != null && bandHz !== advisory.trueFrequencyHz && (
                  <span className="text-xs font-mono text-muted-foreground/50 leading-none">
                    → {formatFrequency(bandHz)}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* RIGHT: Badges + EQ + dismiss */}
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            {/* Badges row */}
            <div className="flex items-center gap-1 flex-wrap justify-end">
              <span
                className="inline-flex items-center text-xs font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm leading-none"
                style={{ backgroundColor: `${severityColor}22`, color: severityColor, border: `1px solid ${severityColor}44` }}
              >
                {getSeverityText(advisory.severity)}
              </span>

              {advisory.confidence != null && (
                <span
                  className={`inline-flex items-center text-xs font-mono px-1.5 py-0.5 rounded-sm leading-none ${
                    advisory.confidence >= 0.85
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : advisory.confidence >= 0.70
                        ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                        : advisory.confidence >= 0.45
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          : 'bg-muted text-muted-foreground border border-border'
                  }`}
                  title={`${Math.round(advisory.confidence * 100)}% confidence`}
                >
                  {Math.round(advisory.confidence * 100)}%
                </span>
              )}

              {occurrenceCount >= 3 && (
                <TooltipProvider delayDuration={300}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex items-center gap-0.5 text-xs text-amber-400 bg-amber-500/20 px-1.5 py-0.5 rounded-sm leading-none border border-amber-500/30">
                        <TrendingUp className="w-2.5 h-2.5" />
                        {occurrenceCount}×
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      Repeat offender: detected {occurrenceCount} times
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}

              {(advisory.clusterCount ?? 1) > 1 && (
                <TooltipProvider delayDuration={300}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex items-center text-xs text-sky-400 bg-sky-500/20 px-1.5 py-0.5 rounded-sm leading-none border border-sky-500/30">
                        +{(advisory.clusterCount ?? 1) - 1}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      {advisory.clusterCount} peaks merged
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}

              {isResolved && (
                <span className="inline-flex items-center text-xs font-medium uppercase tracking-wider px-1.5 py-0.5 rounded-sm leading-none bg-muted text-muted-foreground border border-border">
                  Resolved
                </span>
              )}

              {onDismiss && (
                <button
                  onClick={() => onDismiss(advisory.id)}
                  aria-label={`Dismiss ${exactFreqStr} issue`}
                  className={`flex-shrink-0 flex items-center justify-center rounded text-muted-foreground/30 hover:text-muted-foreground hover:bg-muted/60 transition-colors ${
                    touchFriendly ? 'w-9 h-9' : 'w-5 h-5'
                  }`}
                >
                  <X className={touchFriendly ? 'w-4 h-4' : 'w-3 h-3'} />
                </button>
              )}
            </div>

            {/* EQ recommendation — compact, right-aligned */}
            {hasEq && (
              <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
                <span>
                  GEQ <span className="text-foreground font-medium">{geq?.suggestedDb}dB</span>
                </span>
                <span>
                  PEQ <span className="text-foreground font-medium">Q{(peq?.q ?? 1).toFixed(0)} {peq?.gainDb ?? 0}dB</span>
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Runaway / warning alert — full-width below (rare, urgent) */}
        {(isRunaway || isWarning) && !isResolved && (
          <div className={`flex items-center gap-1 text-xs font-bold uppercase tracking-wide ${
            isRunaway ? 'text-red-400' : 'text-amber-400'
          }`}>
            <AlertTriangle className={`w-2.5 h-2.5 flex-shrink-0 ${isRunaway ? 'animate-pulse' : ''}`} />
            <span>{isRunaway ? 'Runaway feedback' : 'Growing — act now'}</span>
            {timeToClipStr && <span className="font-mono opacity-80 ml-0.5">{timeToClipStr}</span>}
            <span className="font-mono ml-auto opacity-60">+{velocity.toFixed(0)} dB/s</span>
          </div>
        )}
      </div>
    </div>
  )
})
