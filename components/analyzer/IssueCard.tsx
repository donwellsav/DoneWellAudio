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
  // #15: Split memo — advisory-derived data recalculates only when advisory changes,
  // not on theme toggle. severityColor is the only theme-dependent value.
  const {
    pitchStr, exactFreqStr, isClustered,
    velocity, isRunaway, isWarning, isResolved, timeToClipStr,
  } = useMemo(() => {
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
      pitchStr: _pitchStr, exactFreqStr: _exactFreqStr,
      velocity: _velocity, isRunaway: _isRunaway, isWarning: _isWarning,
      isResolved: _isResolved, timeToClipStr: _timeToClipStr, isClustered: _isClustered,
    }
  }, [advisory])

  // Theme-dependent color — separate memo so theme toggle doesn't recompute advisory data
  const severityColor = useMemo(() => getSeverityColor(advisory.severity, isDark), [advisory.severity, isDark])

  // PEQ notch SVG path — bell curve dip on a log-scale frequency axis
  const peqNotchSvgPath = useMemo(() => {
    const peq = advisory.advisory?.peq
    if (!peq) return null
    const logMin = Math.log10(20)
    const logMax = Math.log10(20000)
    const cx = ((Math.log10(Math.max(20, peq.hz)) - logMin) / (logMax - logMin)) * 40
    const depth = Math.min(10, (Math.abs(peq.gainDb) / 12) * 10)
    const hw = Math.max(2, Math.min(14, 20 / peq.q))
    const x1 = Math.max(0, cx - hw)
    const x2 = Math.min(40, cx + hw)
    const bl = 5
    return `M 0 ${bl} L ${x1.toFixed(1)} ${bl} Q ${cx.toFixed(1)} ${(bl + depth).toFixed(1)} ${x2.toFixed(1)} ${bl} L 40 ${bl}`
  }, [advisory.advisory?.peq])

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
                  ? 'border-amber-500/60 shadow-[0_0_8px_rgba(var(--tint-r),var(--tint-g),var(--tint-b),0.3)] ring-1 ring-amber-500/15'
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

      {/* Left severity accent — glowing strip, wider + brighter for RUNAWAY */}
      <div
        className={`absolute left-0 top-0 bottom-0 animate-strip-flash ${isRunaway ? 'severity-accent-strip-runaway' : 'severity-accent-strip'}`}
        style={{
          backgroundColor: isResolved ? 'hsl(var(--muted))' : severityColor,
          boxShadow: isResolved ? 'none' : isRunaway
            ? `3px 0 12px -1px ${severityColor}70, 0 0 6px -1px ${severityColor}50`
            : `2px 0 8px -2px ${severityColor}50, 0 0 4px -1px ${severityColor}30`,
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
                  <span className={`font-mono font-bold leading-none tracking-wide cursor-default ${
                    isRunaway ? 'text-3xl' : 'text-2xl'
                  } ${
                    isFalsePositive ? 'text-red-400/60 line-through' : 'text-foreground'
                  }`}
                    style={{
                      fontVariantNumeric: 'tabular-nums slashed-zero',
                      textShadow: isFalsePositive || isResolved ? 'none' : isRunaway
                        ? `0 0 16px ${severityColor}80, 0 0 6px ${severityColor}40`
                        : isWarning
                          ? `0 0 10px ${severityColor}60, 0 0 4px ${severityColor}30`
                          : `0 0 8px ${severityColor}40`,
                    }}
                  >
                    {exactFreqStr}
                  </span>
                </TooltipTrigger>
                {detailParts.length > 0 && (
                  <TooltipContent side="top" className="text-sm space-y-0.5">
                    {detailParts.map((d) => <div key={d}>{d}</div>)}
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
                      <span
                        className="inline-flex items-center gap-0.5 text-sm text-amber-400 bg-amber-500/20 px-1.5 py-0.5 rounded-sm leading-none border border-amber-500/30"
                        aria-label={`Repeat offender: detected ${occurrenceCount} times`}
                      >
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
                  className="inline-flex items-center gap-0.5 text-sm font-mono leading-none"
                  title={`${Math.round(advisory.confidence * 100)}% confidence`}
                >
                  <svg width="18" height="18" viewBox="0 0 18 18" className="flex-shrink-0" aria-hidden>
                    <circle cx="9" cy="9" r="7" fill="none" stroke="currentColor" strokeWidth="1.5" opacity={0.1} />
                    <circle cx="9" cy="9" r="7" fill="none"
                      stroke={advisory.confidence >= 0.85 ? '#34d399' : advisory.confidence >= 0.70 ? '#60a5fa' : advisory.confidence >= 0.45 ? '#fbbf24' : '#6b7280'}
                      strokeWidth="1.5" strokeLinecap="round"
                      strokeDasharray={`${advisory.confidence * 44} 44`}
                      transform="rotate(-90 9 9)"
                    />
                  </svg>
                  <span className={
                    advisory.confidence >= 0.85 ? 'text-emerald-400'
                    : advisory.confidence >= 0.70 ? 'text-blue-400'
                    : advisory.confidence >= 0.45 ? 'text-amber-400'
                    : 'text-muted-foreground'
                  }>{Math.round(advisory.confidence * 100)}%</span>
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
        {/* PEQ recommendation row — mini notch SVG + params */}
        {showPeqDetails && advisory.advisory?.peq && peqNotchSvgPath && (
          <div className="flex items-center gap-1.5 -mt-1">
            <svg width="40" height="14" viewBox="0 0 40 14" aria-hidden className="flex-shrink-0">
              <path d={peqNotchSvgPath} fill="none" stroke={severityColor} strokeWidth="1.2" strokeOpacity="0.5" />
            </svg>
            <span className="text-[10px] font-mono text-muted-foreground/60 tracking-wide leading-none">
              {advisory.advisory.peq.type} @ {advisory.advisory.peq.hz.toFixed(0)}Hz | Q:{advisory.advisory.peq.q.toFixed(1)} | {advisory.advisory.peq.gainDb}dB
              {advisory.advisory.peq.bandwidthHz != null && ` | BW:${advisory.advisory.peq.bandwidthHz.toFixed(0)}Hz`}
            </span>
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

      {/* Freshness indicator bar — decays over 60s, shifts toward red with age */}
      {!isResolved && (
        <div className="h-[3px] w-full relative" aria-hidden title={`Freshness: ${Math.max(0, 60 - ageSec)}s remaining`}>
          <div
            className="absolute inset-0 h-full rounded-full transition-[width,background-color] duration-500 ease-linear"
            style={{
              width: `${Math.max(0, (1 - ageSec / 60)) * 100}%`,
              backgroundColor: `${severityColor}b3`,
            }}
          />
          {ageSec > 20 && (
            <div
              className="absolute inset-0 h-full rounded-full transition-[width,opacity] duration-500 ease-linear"
              style={{
                width: `${Math.max(0, (1 - ageSec / 60)) * 100}%`,
                backgroundColor: '#ef4444',
                opacity: Math.min(0.55, ((ageSec - 20) / 40) * 0.55),
              }}
            />
          )}
        </div>
      )}
    </div>
  )
})
