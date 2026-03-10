'use client'

import { useMemo, useState, useCallback, memo } from 'react'
import { formatFrequency, formatPitch } from '@/lib/utils/pitchUtils'
import { getSeverityColor } from '@/lib/dsp/eqAdvisor'
import { getSeverityText } from '@/lib/dsp/classifier'
import { getFeedbackHistory } from '@/lib/dsp/feedbackHistory'
import { AlertTriangle, CheckCircle2, X, TrendingUp, Copy, Check } from 'lucide-react'
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
  isRunning?: boolean
  onStart?: () => void
  onFalsePositive?: (advisoryId: string) => void
  falsePositiveIds?: ReadonlySet<string>
}

export const IssuesList = memo(function IssuesList({ advisories, maxIssues = 10, dismissedIds, onDismiss, onClearAll, onClearResolved, touchFriendly, isRunning, onStart, onFalsePositive, falsePositiveIds }: IssuesListProps) {
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
        !isRunning && onStart ? (
          <div className="flex flex-col items-center justify-center flex-1 min-h-[180px] py-6 gap-4">
            <button
              onClick={onStart}
              aria-label="Start analysis"
              className="group relative flex flex-col items-center justify-center gap-3 w-full max-w-[240px] py-6 px-6 rounded-lg border border-primary/30 bg-primary/5 hover:bg-primary/10 transition-all duration-300 cursor-pointer animate-start-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <div className="relative w-16 h-16 flex items-center justify-center rounded-full border-2 border-primary/50 group-hover:border-primary transition-colors duration-300">
                <svg
                  className="w-8 h-8 text-primary drop-shadow-[0_0_6px_rgba(75,146,255,0.4)]"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.31-2.5-4.06v8.12c1.48-.75 2.5-2.29 2.5-4.06zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                </svg>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="font-mono text-sm font-black tracking-[0.15em] text-foreground/90">KILL THE</span>
                <span className="font-mono text-base font-black tracking-[0.15em] text-primary drop-shadow-[0_0_10px_rgba(75,146,255,0.4)]">RING</span>
              </div>
              <span className="font-mono text-sm font-bold tracking-[0.2em] uppercase text-muted-foreground group-hover:text-foreground transition-colors">
                Start Analysis
              </span>
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center flex-1 min-h-[120px] text-muted-foreground py-8">
            <CheckCircle2 className="w-5 h-5 text-primary/30 mb-2" />
            <div className="font-mono text-sm font-bold tracking-[0.15em] uppercase">Standby</div>
            <div className="font-mono text-sm mt-1 text-muted-foreground tracking-wide">Monitoring</div>
          </div>
        )
      ) : (
        <>
          {sorted.length > 1 && (
            <div className="flex items-center justify-end gap-2">
              {onClearResolved && hasResolved && (
                <button
                  onClick={onClearResolved}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors uppercase tracking-wide"
                >
                  Clear Resolved
                </button>
              )}
              {onClearAll && (
                <button
                  onClick={onClearAll}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors uppercase tracking-wide"
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
              onFalsePositive={onFalsePositive}
              isFalsePositive={falsePositiveIds?.has(advisory.id) ?? false}
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
  onFalsePositive?: (advisoryId: string) => void
  isFalsePositive?: boolean
}

const IssueCard = memo(function IssueCard({ advisory, onDismiss, touchFriendly, onFalsePositive, isFalsePositive }: IssueCardProps) {
  const occurrenceCount = useMemo(
    () => getFeedbackHistory().getOccurrenceCount(advisory.trueFrequencyHz),
    [advisory.trueFrequencyHz]
  )
  const severityColor = getSeverityColor(advisory.severity)
  const pitchStr = advisory.advisory?.pitch ? formatPitch(advisory.advisory.pitch) : null
  const exactFreqStr = advisory.trueFrequencyHz != null ? formatFrequency(advisory.trueFrequencyHz) : '---'

  // Issue age: how long this advisory has been active
  const ageSec = Math.max(0, Math.round((Date.now() - advisory.timestamp) / 1000))
  const ageStr = ageSec < 5 ? 'just now' : ageSec < 60 ? `${ageSec}s` : `${Math.floor(ageSec / 60)}m`

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

  // Copy-to-clipboard state
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    const parts: string[] = [exactFreqStr]
    if (pitchStr) parts.push(`(${pitchStr})`)
    if (hasEq) {
      parts.push('—')
      if (geq) parts.push(`GEQ: ${formatFrequency(geq.bandHz)} ${geq.suggestedDb}dB`)
      if (geq && peq) parts.push('|')
      if (peq) parts.push(`PEQ: Q${(peq.q ?? 1).toFixed(0)} ${peq.gainDb ?? 0}dB`)
    }
    navigator.clipboard.writeText(parts.join(' ')).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }).catch(() => {
      // Clipboard API not available (insecure context, etc.)
    })
  }, [exactFreqStr, pitchStr, hasEq, geq, peq])

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
      className={`relative flex flex-col rounded border bg-card/80 transition-all overflow-hidden animate-in fade-in-0 slide-in-from-left-2 duration-200 ${
        isFalsePositive
          ? 'border-red-500/30 opacity-50'
          : isResolved
            ? 'border-border/50'
            : isRunaway
                ? 'border-red-500/70 animate-emergency-glow'
                : isWarning
                  ? 'border-amber-500/60 shadow-[0_0_8px_rgba(245,158,11,0.3)] ring-1 ring-amber-500/15'
                  : 'border-border hover:border-border/80'
      }`}
    >
      {/* Left severity accent */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1.5 rounded-r-sm"
        style={{ backgroundColor: isResolved ? 'hsl(var(--muted))' : severityColor }}
      />

      <div className="pl-3 pr-1.5 py-1.5 flex flex-col gap-1">

        {/* Top section: 3-column — frequency LEFT, badges MIDDLE, dismiss RIGHT */}
        <div className="flex items-start justify-between gap-2">
          {/* LEFT: Frequency hero + pitch/band */}
          <div className="flex flex-col min-w-0">
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className={`font-mono text-lg font-bold leading-none tracking-wide cursor-default ${
                    isFalsePositive ? 'text-red-400/60 line-through' : 'text-foreground'
                  }`}>
                    {exactFreqStr}
                  </span>
                </TooltipTrigger>
                {detailParts.length > 0 && (
                  <TooltipContent side="top" className="text-sm space-y-0.5">
                    {detailParts.map((d, i) => <div key={i}>{d}</div>)}
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
            <div className="flex items-baseline gap-x-2 gap-y-0.5 flex-wrap mt-0.5">
              {pitchStr && (
                <span className="text-sm font-mono text-muted-foreground leading-none">{pitchStr}</span>
              )}
              {bandHz != null && bandHz !== advisory.trueFrequencyHz && (
                <span className="text-sm font-mono text-muted-foreground leading-none">
                  → {formatFrequency(bandHz)}
                </span>
              )}
              {hasEq && (
                <span className="text-sm font-mono text-muted-foreground leading-none">
                  GEQ <span className="text-foreground font-medium">{geq?.suggestedDb}dB</span>
                  {' '}PEQ <span className="text-foreground font-medium">Q{(peq?.q ?? 1).toFixed(0)} {peq?.gainDb ?? 0}dB</span>
                </span>
              )}
              {!isResolved && (
                <span className="text-sm text-muted-foreground leading-none font-mono">{ageStr}</span>
              )}
            </div>
          </div>

          {/* MIDDLE: Badges in 2 rows */}
          <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
            {/* Row 1: status — repeat, cluster, resolved */}
            <div className="flex items-center gap-1 justify-end">
              {occurrenceCount >= 3 && (
                <TooltipProvider delayDuration={300}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex items-center gap-0.5 text-sm text-amber-400 bg-amber-500/20 px-1.5 py-0.5 rounded-sm leading-none border border-amber-500/30">
                        <TrendingUp className="w-2.5 h-2.5" />
                        {occurrenceCount}×
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-sm">
                      Repeat offender: detected {occurrenceCount} times
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}

              {(advisory.clusterCount ?? 1) > 1 && (
                <TooltipProvider delayDuration={300}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex items-center text-sm text-sky-400 bg-sky-500/20 px-1.5 py-0.5 rounded-sm leading-none border border-sky-500/30">
                        +{(advisory.clusterCount ?? 1) - 1}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-sm">
                      {advisory.clusterCount} peaks merged
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}

              {isResolved && (
                <span className="inline-flex items-center text-sm font-medium uppercase tracking-wider px-1.5 py-0.5 rounded-sm leading-none bg-muted text-muted-foreground border border-border">
                  Resolved
                </span>
              )}
            </div>

            {/* Row 2: classification — severity, confidence */}
            <div className="flex items-center gap-1 justify-end">
              <span
                className="inline-flex items-center text-sm font-mono font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm leading-none"
                style={{ backgroundColor: `${severityColor}30`, color: severityColor, border: `1px solid ${severityColor}55`, boxShadow: `0 0 6px ${severityColor}20` }}
              >
                {getSeverityText(advisory.severity)}
              </span>

              {advisory.confidence != null && (
                <span
                  className={`inline-flex items-center text-sm font-mono px-1.5 py-0.5 rounded-sm leading-none ${
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
            </div>
          </div>

          {/* RIGHT: FALSE+ / Copy / Dismiss */}
          <div className="flex items-center gap-0.5 flex-shrink-0 self-center">
            {onFalsePositive && (
              <button
                onClick={() => onFalsePositive(advisory.id)}
                aria-label={`${isFalsePositive ? 'Unflag' : 'Flag'} ${exactFreqStr} as false positive`}
                className={`rounded text-xs font-mono font-bold tracking-wider transition-colors flex items-center justify-center px-1.5 ${
                  isFalsePositive
                    ? 'text-red-400 bg-red-500/20 border border-red-500/40'
                    : 'text-muted-foreground/50 hover:text-red-400 hover:bg-red-500/10 border border-transparent'
                } ${touchFriendly ? 'h-11 min-w-[44px]' : 'h-5'}`}
              >
                FALSE+
              </button>
            )}
            {hasEq && (
              <button
                onClick={handleCopy}
                aria-label={`Copy ${exactFreqStr} EQ recommendation`}
                className={`rounded transition-colors flex items-center justify-center ${
                  copied
                    ? 'text-emerald-400'
                    : 'text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/60'
                } ${touchFriendly ? 'w-11 h-11' : 'w-5 h-5'}`}
              >
                {copied
                  ? <Check className={touchFriendly ? 'w-4 h-4' : 'w-3 h-3'} />
                  : <Copy className={touchFriendly ? 'w-4 h-4' : 'w-3 h-3'} />
                }
              </button>
            )}
            {copied && (
              <span className="sr-only" role="status">EQ recommendation copied</span>
            )}
            {onDismiss && (
              <button
                onClick={() => onDismiss(advisory.id)}
                aria-label={`Dismiss ${exactFreqStr} issue`}
                className={`rounded text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/60 transition-colors flex items-center justify-center ${
                  touchFriendly ? 'w-11 h-11' : 'w-5 h-5'
                }`}
              >
                <X className={touchFriendly ? 'w-4 h-4' : 'w-3 h-3'} />
              </button>
            )}
          </div>
        </div>

        {/* Velocity + age — full-width below */}
        {velocity > 0 && !isResolved && (
          <div className={`flex items-center gap-1 text-sm font-bold uppercase tracking-wide ${
            isRunaway ? 'text-red-400' : isWarning ? 'text-amber-400' : 'text-muted-foreground'
          }`}>
            {(isRunaway || isWarning) ? (
              <>
                <AlertTriangle className={`w-2.5 h-2.5 flex-shrink-0 ${isRunaway ? 'animate-pulse' : ''}`} />
                <span>{isRunaway ? 'Runaway feedback' : 'Growing — act now'}</span>
                {timeToClipStr && <span className="font-mono opacity-80 ml-0.5">{timeToClipStr}</span>}
              </>
            ) : (
              <span className="font-normal normal-case tracking-normal">↑ building</span>
            )}
            <span className="font-mono ml-auto opacity-60">+{velocity.toFixed(0)} dB/s</span>
          </div>
        )}
      </div>
    </div>
  )
})
