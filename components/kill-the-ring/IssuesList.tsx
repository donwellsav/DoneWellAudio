'use client'

import { useMemo } from 'react'
import { formatFrequency, formatPitch } from '@/lib/utils/pitchUtils'
import { getSeverityColor } from '@/lib/dsp/eqAdvisor'
import { getSeverityText } from '@/lib/dsp/classifier'
import { getFeedbackHistory } from '@/lib/dsp/feedbackHistory'
import { AlertTriangle, CheckCircle2, Circle, X, TrendingUp } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { Advisory } from '@/types/advisory'

// Velocity thresholds for runaway prediction
const RUNAWAY_VELOCITY_THRESHOLD = 15 // dB/s
const WARNING_VELOCITY_THRESHOLD = 10 // dB/s

interface IssuesListProps {
  advisories: Advisory[]
  maxIssues?: number
  appliedIds?: Set<string>
  dismissedIds?: Set<string>
  onApply?: (advisory: Advisory) => void
  onDismiss?: (id: string) => void
}

export function IssuesList({ advisories, maxIssues = 10, appliedIds, dismissedIds, onApply, onDismiss }: IssuesListProps) {
  // Filter dismissed, sort by frequency (low -> high), then slice to max
  const sorted = useMemo(() =>
    [...advisories]
      .filter((a) => !dismissedIds?.has(a.id))
      .sort((a, b) => (a.trueFrequencyHz ?? 0) - (b.trueFrequencyHz ?? 0))
      .slice(0, maxIssues),
    [advisories, dismissedIds, maxIssues]
  )

  return (
    <div className="flex flex-col gap-2">
      {sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 min-h-[120px] text-muted-foreground py-8">
          <div className="text-sm">No issues detected</div>
          <div className="text-xs mt-1">Monitoring for feedback...</div>
        </div>
      ) : (
        sorted.map((advisory, index) => (
          <IssueCard
            key={advisory.id}
            advisory={advisory}
            rank={index + 1}
            isApplied={appliedIds?.has(advisory.id) ?? false}
            onApply={onApply}
            onDismiss={onDismiss}
          />
        ))
      )}
    </div>
  )
}

interface IssueCardProps {
  advisory: Advisory
  rank: number
  isApplied: boolean
  onApply?: (advisory: Advisory) => void
  onDismiss?: (id: string) => void
}

function IssueCard({ advisory, rank, isApplied, onApply, onDismiss }: IssueCardProps) {
  const severityColor = getSeverityColor(advisory.severity)
  const pitchStr = advisory.advisory?.pitch ? formatPitch(advisory.advisory.pitch) : null
  const freqStr = advisory.trueFrequencyHz != null ? formatFrequency(advisory.trueFrequencyHz) : '---'

  const geq = advisory.advisory?.geq
  const peq = advisory.advisory?.peq

  const velocity = advisory.velocityDbPerSec ?? 0
  const isRunaway = velocity >= RUNAWAY_VELOCITY_THRESHOLD || advisory.isRunaway
  const isWarning = velocity >= WARNING_VELOCITY_THRESHOLD && !isRunaway

  const timeToClipMs = advisory.predictedTimeToClipMs ?? (
    velocity > 0 && advisory.trueAmplitudeDb < 0
      ? ((0 - advisory.trueAmplitudeDb) / velocity) * 1000
      : null
  )
  const timeToClipStr = timeToClipMs != null && timeToClipMs < 5000
    ? `~${(timeToClipMs / 1000).toFixed(1)}s`
    : null

  const hasEq = !!(geq && peq)

  return (
    <div
      className={`relative flex flex-col rounded-md border bg-card transition-all overflow-hidden ${
        isApplied
          ? 'border-primary/30 opacity-60'
          : isRunaway
            ? 'border-red-500/70 shadow-[0_0_8px_rgba(239,68,68,0.35)] animate-pulse'
            : isWarning
              ? 'border-amber-500/60 shadow-[0_0_4px_rgba(245,158,11,0.25)]'
              : 'border-border'
      }`}
    >
      {/* Left severity bar */}
      <div
        className="absolute left-0 top-0 bottom-0 w-0.5"
        style={{ backgroundColor: isApplied ? 'transparent' : severityColor }}
      />

      {/* Card body */}
      <div className="pl-3 pr-2 pt-2 pb-2 flex flex-col gap-1.5">

        {/* Row 1: frequency + pitch + repeat offender + dismiss */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-baseline gap-1.5 min-w-0">
            <span className="font-mono text-sm font-semibold text-foreground leading-none">
              {freqStr}<span className="text-[10px] font-normal text-muted-foreground ml-0.5">Hz</span>
            </span>
            {pitchStr && (
              <span className="text-[10px] font-mono text-muted-foreground leading-none">{pitchStr}</span>
            )}
            {/* Cluster count badge — shows when multiple peaks merged into this advisory */}
            {(advisory.clusterCount ?? 1) > 1 && (
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex items-center text-[9px] text-sky-400 bg-sky-500/20 px-1 py-0.5 rounded-sm border border-sky-500/30">
                      +{(advisory.clusterCount ?? 1) - 1}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    {advisory.clusterCount} peaks merged in this frequency band
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {/* Repeat offender indicator */}
            {(() => {
              const occurrences = getFeedbackHistory().getOccurrenceCount(advisory.trueFrequencyHz)
              if (occurrences >= 3) {
                return (
                  <TooltipProvider delayDuration={300}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex items-center gap-0.5 text-[9px] text-amber-400 bg-amber-500/20 px-1 py-0.5 rounded-sm border border-amber-500/30">
                          <TrendingUp className="w-2.5 h-2.5" />
                          {occurrences}x
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">
                        Repeat offender: detected {occurrences} times this session
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )
              }
              return null
            })()}
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            {/* Confidence badge */}
            {advisory.confidence != null && (
              <span
                className={`text-[9px] font-mono px-1 py-0.5 rounded-sm leading-none ${
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
            
            {/* Severity badge */}
            <span
              className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm leading-none"
              style={{ backgroundColor: `${severityColor}22`, color: severityColor, border: `1px solid ${severityColor}44` }}
            >
              {getSeverityText(advisory.severity)}
            </span>

            {/* Dismiss X */}
            {onDismiss && (
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => onDismiss(advisory.id)}
                      aria-label={`Dismiss ${freqStr}Hz issue`}
                      className="w-4 h-4 flex items-center justify-center rounded text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/60 transition-colors"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="left" className="text-xs">
                    Dismiss (re-shows if re-detected)
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </div>

        {/* Row 2: runaway / warning alert */}
        {(isRunaway || isWarning) && !isApplied && (
          <div className={`flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide ${
            isRunaway ? 'text-red-400' : 'text-amber-400'
          }`}>
            <AlertTriangle className={`w-2.5 h-2.5 flex-shrink-0 ${isRunaway ? 'animate-pulse' : ''}`} />
            <span>{isRunaway ? 'Runaway feedback' : 'Growing — act now'}</span>
            {timeToClipStr && <span className="font-mono opacity-80 ml-0.5">{timeToClipStr}</span>}
            <span className="font-mono ml-auto opacity-60">+{velocity.toFixed(0)} dB/s</span>
          </div>
        )}

        {/* Row 2b: Modal overlap and cumulative growth indicators */}
        {(advisory.modalOverlapFactor != null || advisory.cumulativeGrowthDb != null) && !isApplied && (
          <div className="flex items-center gap-2 text-[9px] text-muted-foreground">
            {advisory.modalOverlapFactor != null && advisory.modalOverlapFactor < 0.3 && (
              <span className="text-amber-400" title="Isolated mode - high feedback risk">
                M={advisory.modalOverlapFactor.toFixed(2)} isolated
              </span>
            )}
            {advisory.cumulativeGrowthDb != null && advisory.cumulativeGrowthDb > 3 && (
              <span className="text-amber-400" title={`Total growth since onset: +${advisory.cumulativeGrowthDb.toFixed(1)}dB`}>
                +{advisory.cumulativeGrowthDb.toFixed(1)}dB buildup
              </span>
            )}
            {advisory.frequencyBand && (
              <span className="text-muted-foreground/60" title={`Frequency band: ${advisory.frequencyBand}`}>
                [{advisory.frequencyBand}]
              </span>
            )}
          </div>
        )}

        {/* Row 3: EQ suggestion + send button */}
        {hasEq && (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground">
              <span>
                GEQ <span className="text-foreground">{geq?.suggestedDb}dB</span>
                {' @ '}{geq?.bandHz}
              </span>
              <span className="text-border">|</span>
              <span>
                PEQ Q{(peq?.q ?? 1).toFixed(0)} <span className="text-foreground">{peq?.gainDb ?? 0}dB</span>
              </span>
            </div>

            {onApply && (
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => onApply(advisory)}
                      disabled={isApplied}
                      aria-label={isApplied ? 'Cut sent to EQ Notepad' : `Send cut to EQ Notepad (${freqStr}Hz)`}
                      className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                        isApplied
                          ? 'text-primary cursor-default'
                          : 'text-muted-foreground hover:text-primary hover:bg-primary/10'
                      }`}
                    >
                      {isApplied
                        ? <><CheckCircle2 className="w-3 h-3" /><span>Sent</span></>
                        : <><Circle className="w-3 h-3" /><span>Notepad</span></>
                      }
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="left" className="text-xs">
                    {isApplied ? 'Sent to EQ Notepad' : 'Send to EQ Notepad'}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
