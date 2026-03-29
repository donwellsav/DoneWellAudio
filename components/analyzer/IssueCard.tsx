'use client'

import { useMemo, useState, useCallback, memo } from 'react'
import { formatFrequency, formatFrequencyRange, formatPitch } from '@/lib/utils/pitchUtils'
import { getSeverityColor } from '@/lib/dsp/eqAdvisor'
import { getSeverityText } from '@/lib/dsp/classifier'
import { AlertTriangle, TrendingUp } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { Advisory } from '@/types/advisory'
import { useSwipeGesture } from '@/hooks/useSwipeGesture'
import { IssueCardActions } from './IssueCardActions'

// ── Constants ────────────────────────────────────────────────────────

/** Velocity thresholds for runaway prediction */
const RUNAWAY_VELOCITY_THRESHOLD = 15 // dB/s
const WARNING_VELOCITY_THRESHOLD = 10 // dB/s

// ── Types ────────────────────────────────────────────────────────────

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
  onSendToPA2?: () => Promise<void>
  pa2Connected?: boolean
}

// ── Component ────────────────────────────────────────────────────────

export const IssueCard = memo(function IssueCard({
  advisory, occurrenceCount, touchFriendly,
  onFalsePositive, isFalsePositive,
  onConfirmFeedback, isConfirmed,
  swipeLabeling, showAlgorithmScores, showPeqDetails,
  onDismiss, onSendToMixer, onSendToPA2, pa2Connected,
}: IssueCardProps) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme !== 'light'

  // ── Derived values ───────────────────────────────────────────────
  const {
    severityColor, pitchStr, exactFreqStr, isClustered,
    velocity, isRunaway, isWarning, isResolved, timeToClipStr,
  } = useMemo(() => {
    const _severityColor = getSeverityColor(advisory.severity, isDark)
    const _pitchStr = advisory.advisory?.pitch ? formatPitch(advisory.advisory.pitch) : null
    const _isClustered = (advisory.clusterCount ?? 1) > 1 && advisory.clusterMinHz != null && advisory.clusterMaxHz != null
    const _exactFreqStr = advisory.trueFrequencyHz != null
      ? (_isClustered ? formatFrequencyRange(advisory.clusterMinHz!, advisory.clusterMaxHz!) : formatFrequency(advisory.trueFrequencyHz))
      : '---'
    const _velocity = advisory.velocityDbPerSec ?? 0
    const _isRunaway = _velocity >= RUNAWAY_VELOCITY_THRESHOLD || advisory.isRunaway
    const _isWarning = _velocity >= WARNING_VELOCITY_THRESHOLD && !_isRunaway
    const _isResolved = advisory.resolved === true
    const _timeToClipMs = advisory.predictedTimeToClipMs ?? (
      _velocity > 0 && advisory.trueAmplitudeDb < 0
        ? ((0 - advisory.trueAmplitudeDb) / _velocity) * 1000
        : null
    )
    const _timeToClipStr = _timeToClipMs != null && _timeToClipMs < 5000
      ? `~${(_timeToClipMs / 1000).toFixed(1)}s`
      : null
    return {
      severityColor: _severityColor, pitchStr: _pitchStr, exactFreqStr: _exactFreqStr,
      velocity: _velocity, isRunaway: _isRunaway, isWarning: _isWarning,
      isResolved: _isResolved, timeToClipStr: _timeToClipStr, isClustered: _isClustered,
    }
  }, [advisory, isDark])

  // Age display — refreshes naturally on advisory updates (~10Hz)
  // eslint-disable-next-line react-hooks/purity -- benign: Date.now() in render is intentional for live age display
  const ageSec = Math.max(0, Math.round((Date.now() - advisory.timestamp) / 1000))
  const ageStr = ageSec < 5 ? 'just now' : ageSec < 60 ? `${ageSec}s` : `${Math.floor(ageSec / 60)}m`

  // ── Copy-to-clipboard ────────────────────────────────────────────
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    const parts: string[] = [exactFreqStr]
    if (pitchStr) parts.push(`(${pitchStr})`)
    navigator.clipboard.writeText(parts.join(' ')).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }).catch(() => {
      // Clipboard API not available (insecure context, etc.)
    })
  }, [exactFreqStr, pitchStr])

  // ── Detail tooltip ───────────────────────────────────────────────
  const detailParts = useMemo(() => {
    const parts: string[] = []
    if (advisory.modalOverlapFactor != null && advisory.modalOverlapFactor < 0.3)
      parts.push(`Modal overlap: ${advisory.modalOverlapFactor.toFixed(2)} (isolated)`)
    if (advisory.cumulativeGrowthDb != null && advisory.cumulativeGrowthDb > 3)
      parts.push(`Buildup: +${advisory.cumulativeGrowthDb.toFixed(1)}dB`)
    if (advisory.frequencyBand)
      parts.push(`Band: ${advisory.frequencyBand}`)
    return parts
  }, [advisory.modalOverlapFactor, advisory.cumulativeGrowthDb, advisory.frequencyBand])

  // ── Swipe gesture ────────────────────────────────────────────────
  const { swipeX, swiping, swipeProgress, swipeDirection, handlers } = useSwipeGesture({
    enabled: !!swipeLabeling,
    onSwipeLeft: onDismiss ? () => onDismiss(advisory.id) : undefined,
    onSwipeRight: onConfirmFeedback ? () => onConfirmFeedback(advisory.id) : undefined,
    onLongPress: onFalsePositive ? () => onFalsePositive(advisory.id) : undefined,
  })

  // ── Actions layout mode ──────────────────────────────────────────
  // Determine which action button layout to render (or none for swipe-on-mobile)
  const actionsLayout: 'desktop' | 'mobile' | 'copy-only' | null =
    !touchFriendly && !swipeLabeling ? 'desktop'
    : !touchFriendly && swipeLabeling ? 'copy-only'
    : touchFriendly && !swipeLabeling ? 'mobile'
    : null // touchFriendly && swipeLabeling — swipe gestures handle it

  // Bridge: IssueCard receives (advisory: Advisory) => void, actions expects () => void
  const handleSendToMixer = onSendToMixer ? () => onSendToMixer(advisory) : undefined

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div
      className={`relative flex flex-col rounded glass-card animate-issue-enter overflow-hidden ${
        isFalsePositive
          ? 'border-red-500/30 opacity-50'
          : isResolved
            ? 'border-border/50'
            : isRunaway
                ? 'border-red-500/70 animate-emergency-glow'
                : isWarning
                  ? 'border-amber-500/60 shadow-[0_0_8px_rgba(245,158,11,0.3)] ring-1 ring-amber-500/15'
                  : 'border-border/40 hover:border-primary/30'
      }`}
      onTouchStart={handlers.onTouchStart}
      onTouchMove={handlers.onTouchMove}
      onTouchEnd={handlers.onTouchEnd}
    >
      {/* Swipe reveal: left=dismiss (gray), right=confirm (amber) */}
      {swipeLabeling && swiping && (
        <div className="absolute inset-0 flex items-center z-0" aria-hidden>
          {swipeDirection === 'left' && (
            <div
              className="absolute inset-0 flex items-center justify-end pr-4 rounded"
              style={{ backgroundColor: `rgba(120, 120, 130, ${swipeProgress * 0.25})` }}
            >
              <span className="text-xs font-mono font-bold text-muted-foreground uppercase tracking-wider"
                style={{ opacity: swipeProgress }}>
                DISMISS
              </span>
            </div>
          )}
          {swipeDirection === 'right' && (
            <div
              className="absolute inset-0 flex items-center justify-start pl-4 rounded"
              style={{ backgroundColor: `rgba(245, 158, 11, ${swipeProgress * 0.25})` }}
            >
              <span className="text-xs font-mono font-bold text-[var(--console-amber)] uppercase tracking-wider"
                style={{ opacity: swipeProgress }}>
                CONFIRM
              </span>
            </div>
          )}
        </div>
      )}

      {/* Left severity accent — glowing strip */}
      <div
        className="absolute left-0 top-0 bottom-0 severity-accent-strip"
        style={{
          backgroundColor: isResolved ? 'hsl(var(--muted))' : severityColor,
          boxShadow: isResolved ? 'none' : `2px 0 8px -2px ${severityColor}50, 0 0 4px -1px ${severityColor}30`,
        }}
      />

      <div
        className="flex flex-col relative z-10 @container"
        style={swipeLabeling && swiping ? {
          transform: `translateX(${swipeX}px)`,
          transition: swiping ? 'none' : 'transform 200ms ease-out',
        } : undefined}
      >

        {/* Top section: frequency + badges + desktop actions */}
        <div className="flex items-start justify-between gap-2">
          {/* LEFT: Frequency hero + pitch/band */}
          <div className="flex flex-col min-w-0">
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className={`font-mono text-2xl font-bold leading-none tracking-wide cursor-default ${
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

              {isClustered && (
                <TooltipProvider delayDuration={300}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex items-center text-sm text-sky-400 bg-sky-500/20 px-1.5 py-0.5 rounded-sm leading-none border border-sky-500/30">
                        {advisory.clusterCount} peaks
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-sm">
                      Merged cluster — Q widened to cover range.
                      Center: {advisory.trueFrequencyHz != null ? formatFrequency(advisory.trueFrequencyHz) : '---'}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}

            </div>

            {/* Row 2: classification — severity, confidence */}
            <div className="flex items-center gap-1 justify-end">
              <span
                className="severity-pill"
                style={{ backgroundColor: `${severityColor}20`, color: severityColor, border: `1px solid ${severityColor}40` }}
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

          {/* RIGHT: Desktop action buttons (or copy-only when swipe labeling) */}
          {(actionsLayout === 'desktop' || actionsLayout === 'copy-only') && (
            <IssueCardActions
              advisoryId={advisory.id}
              advisory={advisory}
              exactFreqStr={exactFreqStr}
              onFalsePositive={onFalsePositive}
              isFalsePositive={isFalsePositive}
              onConfirmFeedback={onConfirmFeedback}
              isConfirmed={isConfirmed}
              onDismiss={onDismiss}
              onCopy={handleCopy}
              copied={copied}
              onSendToMixer={handleSendToMixer}
              onSendToPA2={onSendToPA2}
              pa2Connected={pa2Connected}
              layout={actionsLayout}
            />
          )}
        </div>

        {/* Velocity + age — full-width below */}
        {velocity > 0 && !isResolved && (
          <div className={`flex items-center gap-1 text-sm font-bold uppercase tracking-wide ${
            isRunaway ? 'text-red-400' : isWarning ? 'text-amber-400' : 'text-muted-foreground'
          }`}>
            {(isRunaway || isWarning) ? (
              <>
                <AlertTriangle className={`w-2.5 h-2.5 flex-shrink-0 ${isRunaway ? 'motion-safe:animate-pulse' : ''}`} />
                <span>{isRunaway ? 'Runaway feedback' : 'Growing — act now'}</span>
                {timeToClipStr && <span className="font-mono opacity-80 ml-0.5">{timeToClipStr}</span>}
              </>
            ) : (
              <span className="font-normal normal-case tracking-normal">↑ building</span>
            )}
            <span className="font-mono ml-auto opacity-60">+{velocity.toFixed(0)} dB/s</span>
          </div>
        )}
        {/* Algorithm scores debug row */}
        {showAlgorithmScores && advisory.algorithmScores && (
          <div className="text-[10px] font-mono text-muted-foreground/60 tracking-wide leading-none -mt-1">
            {[
              advisory.algorithmScores.msd != null && `MSD:${advisory.algorithmScores.msd.toFixed(2)}`,
              advisory.algorithmScores.phase != null && `PH:${advisory.algorithmScores.phase.toFixed(2)}`,
              advisory.algorithmScores.spectral != null && `SP:${advisory.algorithmScores.spectral.toFixed(2)}`,
              advisory.algorithmScores.comb != null && `CM:${advisory.algorithmScores.comb.toFixed(2)}`,
              advisory.algorithmScores.ihr != null && `IH:${advisory.algorithmScores.ihr.toFixed(2)}`,
              advisory.algorithmScores.ptmr != null && `PT:${advisory.algorithmScores.ptmr.toFixed(2)}`,
              advisory.algorithmScores.ml != null && `ML:${advisory.algorithmScores.ml.toFixed(2)}`,
            ].filter(Boolean).join('  ')}
            {' → '}{advisory.algorithmScores.fusedProbability.toFixed(2)}
          </div>
        )}
        {/* PEQ recommendation row */}
        {showPeqDetails && advisory.advisory?.peq && (
          <div className="text-[10px] font-mono text-muted-foreground/60 tracking-wide leading-none -mt-1">
            PEQ: {advisory.advisory.peq.type} @ {advisory.advisory.peq.hz.toFixed(0)}Hz | Q:{advisory.advisory.peq.q.toFixed(1)} | {advisory.advisory.peq.gainDb}dB
            {advisory.advisory.peq.bandwidthHz != null && ` | BW:${advisory.advisory.peq.bandwidthHz.toFixed(0)}Hz`}
          </div>
        )}

        {/* Mobile bottom action toolbar */}
        {actionsLayout === 'mobile' && (
          <IssueCardActions
            advisoryId={advisory.id}
            advisory={advisory}
            exactFreqStr={exactFreqStr}
            onFalsePositive={onFalsePositive}
            isFalsePositive={isFalsePositive}
            onConfirmFeedback={onConfirmFeedback}
            isConfirmed={isConfirmed}
            onDismiss={onDismiss}
            onCopy={handleCopy}
            copied={copied}
            layout="mobile"
          />
        )}
      </div>

      {/* Freshness indicator bar — decays from full to empty over 60s */}
      {!isResolved && (
        <div className="h-[2px] w-full" aria-hidden>
          <div
            className="h-full rounded-full transition-[width] duration-500 ease-linear"
            style={{
              width: `${Math.max(0, (1 - ageSec / 60)) * 100}%`,
              backgroundColor: `${severityColor}50`,
            }}
          />
        </div>
      )}
    </div>
  )
})
