'use client'

import { useMemo, useState, useCallback, memo } from 'react'
import { formatFrequency, formatFrequencyRange, formatPitch } from '@/lib/utils/pitchUtils'
import { getSeverityColor } from '@/lib/dsp/eqAdvisor'
import { confidenceColor, RUNAWAY_COLOR } from '@/lib/canvas/canvasTokens'
import { getSeverityText } from '@/lib/dsp/classifier'
import { AlertTriangle, TrendingUp, Zap, ArrowUpRight, Radio, CircleDot, Music, Waves } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { Advisory } from '@/types/advisory'
import { useSwipeGesture } from '@/hooks/useSwipeGesture'
import { IssueCardActions } from './IssueCardActions'

// ── Constants ────────────────────────────────────────────────────────

/** Velocity thresholds for runaway prediction */
const RUNAWAY_VELOCITY_THRESHOLD = 15 // dB/s
const WARNING_VELOCITY_THRESHOLD = 10 // dB/s

/** Severity-graded card entrance animation — RUNAWAY = instant, all others = slow 5s fade */
const SEVERITY_ENTER_CLASS: Record<string, string> = {
  RUNAWAY: '',
  GROWING: 'animate-issue-enter-slow',
  RESONANCE: 'animate-issue-enter-slow',
  POSSIBLE_RING: 'animate-issue-enter-slow',
  WHISTLE: 'animate-issue-enter-slow',
  INSTRUMENT: 'animate-issue-enter-slow',
}

/** Severity → icon: distinct shapes that communicate type at a glance */
export const SEVERITY_ICON: Record<string, typeof Zap> = {
  RUNAWAY: Zap,           // ⚡ lightning — immediate danger
  GROWING: ArrowUpRight,  // ↗ rising — building toward feedback
  RESONANCE: Radio,       // 📡 resonance — sustained ring
  POSSIBLE_RING: CircleDot, // ◎ ring — possible feedback
  WHISTLE: Waves,         // 〰 waves — tonal whistle
  INSTRUMENT: Music,      // ♪ music — harmonic content (not feedback)
}

/** Matching strip flash speed per severity — RUNAWAY instant, all others 5s */
const SEVERITY_STRIP_CLASS: Record<string, string> = {
  RUNAWAY: '',
  GROWING: 'animate-strip-flash-slow',
  RESONANCE: 'animate-strip-flash-slow',
  POSSIBLE_RING: 'animate-strip-flash-slow',
  WHISTLE: 'animate-strip-flash-slow',
  INSTRUMENT: 'animate-strip-flash-slow',
}

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
  // All advisory-derived data in one memo — recalculates only when advisory changes,
  // not on theme toggle. severityColor is the only theme-dependent value (separate memo).
  const {
    pitchStr, exactFreqStr, isClustered,
    velocity, isRunaway, isWarning, isResolved, timeToClipStr,
    detailParts, peqNotchSvgPath,
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

    // Detail tooltip parts
    const _detailParts: string[] = []
    if (advisory.modalOverlapFactor != null && advisory.modalOverlapFactor < 0.3)
      _detailParts.push(`Modal overlap: ${advisory.modalOverlapFactor.toFixed(2)} (isolated)`)
    if (advisory.cumulativeGrowthDb != null && advisory.cumulativeGrowthDb > 3)
      _detailParts.push(`Buildup: +${advisory.cumulativeGrowthDb.toFixed(1)}dB`)
    if (advisory.frequencyBand)
      _detailParts.push(`Band: ${advisory.frequencyBand}`)

    // PEQ notch SVG path — bell curve dip on a log-scale frequency axis
    let _peqNotchSvgPath: string | null = null
    const peq = advisory.advisory?.peq
    if (peq) {
      const logMin = Math.log10(20)
      const logMax = Math.log10(20000)
      const cx = ((Math.log10(Math.max(20, peq.hz)) - logMin) / (logMax - logMin)) * 40
      const depth = Math.min(10, (Math.abs(peq.gainDb) / 12) * 10)
      const hw = Math.max(2, Math.min(14, 20 / peq.q))
      const x1 = Math.max(0, cx - hw)
      const x2 = Math.min(40, cx + hw)
      const bl = 5
      _peqNotchSvgPath = `M 0 ${bl} L ${x1.toFixed(1)} ${bl} Q ${cx.toFixed(1)} ${(bl + depth).toFixed(1)} ${x2.toFixed(1)} ${bl} L 40 ${bl}`
    }

    return {
      pitchStr: _pitchStr, exactFreqStr: _exactFreqStr,
      velocity: _velocity, isRunaway: _isRunaway, isWarning: _isWarning,
      isResolved: _isResolved, timeToClipStr: _timeToClipStr, isClustered: _isClustered,
      detailParts: _detailParts, peqNotchSvgPath: _peqNotchSvgPath,
    }
  }, [advisory])

  // Theme-dependent color — separate memo so theme toggle doesn't recompute advisory data
  const severityColor = useMemo(() => getSeverityColor(advisory.severity, isDark), [advisory.severity, isDark])

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
  const handleSendToMixer = useMemo(
    () => onSendToMixer ? () => onSendToMixer(advisory) : undefined,
    [onSendToMixer, advisory],
  )

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div
      className={`relative flex flex-col rounded glass-card ${SEVERITY_ENTER_CLASS[advisory.severity] ?? 'animate-issue-enter'} overflow-hidden ${
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
        className={`absolute left-0 top-0 bottom-0 ${SEVERITY_STRIP_CLASS[advisory.severity] ?? 'animate-strip-flash'} ${isRunaway ? 'severity-accent-strip-runaway' : 'severity-accent-strip'}`}
        style={{
          backgroundColor: isResolved ? 'hsl(var(--muted))' : severityColor,
          boxShadow: isResolved ? 'none' : isRunaway
            ? `3px 0 12px -1px ${severityColor}70, 0 0 6px -1px ${severityColor}50`
            : `2px 0 8px -2px ${severityColor}50, 0 0 4px -1px ${severityColor}30`,
        }}
      />

      <div
        className="flex flex-col gap-1 relative z-10 @container pl-3 pr-1.5 py-1.5"
        style={swipeLabeling && swiping ? {
          transform: `translateX(${swipeX}px)`,
          transition: swiping ? 'none' : 'transform 200ms ease-out',
        } : undefined}
      >

        {/* ── Row 1: Severity icon + Frequency hero + Pitch + Age + Badges ── */}
        <div className="flex items-center gap-2">
          {/* Severity icon — type at a glance, left of frequency */}
          {(() => {
            const Icon = SEVERITY_ICON[advisory.severity]
            return Icon ? (
              <span
                className="flex-shrink-0 inline-flex items-center justify-center rounded"
                style={{ color: severityColor }}
                title={getSeverityText(advisory.severity)}
              >
                <Icon className={`${isRunaway ? 'w-5 h-5' : 'w-4 h-4'}`} />
              </span>
            ) : null
          })()}

          {/* Frequency hero */}
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className={`font-mono font-bold leading-none tracking-wide cursor-default ${
                  isRunaway ? 'text-2xl' : 'text-xl'
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

          {/* Pitch + age — inline after frequency */}
          {pitchStr && (
            <span className="text-xs font-mono text-muted-foreground/70 leading-none">{pitchStr}</span>
          )}
          {!isResolved && (
            <span className="text-xs text-muted-foreground/50 leading-none font-mono">{ageStr}</span>
          )}

          {/* Right-aligned badges */}
          <div className="ml-auto flex items-center gap-1 flex-shrink-0">
            {occurrenceCount >= 3 && (
              <span
                className="inline-flex items-center gap-0.5 text-[10px] text-amber-400 bg-amber-500/15 px-1 py-0.5 rounded-sm leading-none border border-amber-500/25"
                aria-label={`Repeat offender: detected ${occurrenceCount} times`}
                title={`Repeat offender: detected ${occurrenceCount} times`}
              >
                <TrendingUp className="w-2 h-2" />
                {occurrenceCount}×
              </span>
            )}
            {isClustered && (
              <span
                className="inline-flex items-center text-[10px] text-sky-400 bg-sky-500/15 px-1 py-0.5 rounded-sm leading-none border border-sky-500/25"
                title={`Merged cluster — Q widened. Center: ${advisory.trueFrequencyHz != null ? formatFrequency(advisory.trueFrequencyHz) : '---'}`}
              >
                {advisory.clusterCount}pk
              </span>
            )}
            {advisory.confidence != null && (
              <span
                className="inline-flex items-center gap-0.5 text-[10px] font-mono leading-none"
                title={`${Math.round(advisory.confidence * 100)}% confidence`}
              >
                <svg width="14" height="14" viewBox="0 0 18 18" className="flex-shrink-0" aria-hidden>
                  <circle cx="9" cy="9" r="7" fill="none" stroke="currentColor" strokeWidth="1.5" opacity={0.08} />
                  <circle cx="9" cy="9" r="7" fill="none"
                    stroke={confidenceColor(advisory.confidence ?? 0)}
                    strokeWidth="2" strokeLinecap="round"
                    strokeDasharray={`${advisory.confidence * 44} 44`}
                    transform="rotate(-90 9 9)"
                  />
                </svg>
                <span className={`${
                  advisory.confidence >= 0.85 ? 'text-emerald-400'
                  : advisory.confidence >= 0.70 ? 'text-blue-400'
                  : advisory.confidence >= 0.45 ? 'text-amber-400'
                  : 'text-muted-foreground/60'
                }`}>{Math.round(advisory.confidence * 100)}%</span>
              </span>
            )}
          </div>
        </div>

        {/* ── Row 2: EQ recommendation (the actionable info) + velocity ── */}
        {(advisory.advisory?.peq || (velocity > 0 && !isResolved)) && (
          <div className="flex items-center gap-2 text-[11px] font-mono leading-none">
            {/* PEQ cut recommendation — the most important actionable info */}
            {advisory.advisory?.peq && (
              <span className="text-muted-foreground/70">
                <span style={{ color: severityColor }}>{advisory.advisory.peq.gainDb}dB</span>
                {' '}Q:{advisory.advisory.peq.q.toFixed(1)} @ {advisory.advisory.peq.hz.toFixed(0)}Hz
              </span>
            )}
            {/* Velocity indicator */}
            {velocity > 0 && !isResolved && (
              <span className={`ml-auto flex items-center gap-0.5 ${
                isRunaway ? 'text-red-400' : isWarning ? 'text-amber-400' : 'text-muted-foreground/50'
              }`}>
                {(isRunaway || isWarning) && <AlertTriangle className={`w-2.5 h-2.5 flex-shrink-0 ${isRunaway ? 'motion-safe:animate-pulse' : ''}`} />}
                <span>+{velocity.toFixed(0)} dB/s</span>
                {timeToClipStr && <span className="opacity-70">{timeToClipStr}</span>}
              </span>
            )}
          </div>
        )}

        {/* ── Row 3: Actions (desktop) — aligned as a clean row ── */}
        {(actionsLayout === 'desktop' || actionsLayout === 'copy-only') && (
          <div className="flex items-center justify-end -mr-0.5">
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
          </div>
        )}

        {/* ── Debug rows (opt-in via Display settings) ── */}
        {showAlgorithmScores && advisory.algorithmScores && (
          <div className="text-[9px] font-mono text-muted-foreground/40 tracking-wide leading-none">
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
        {showPeqDetails && advisory.advisory?.peq && peqNotchSvgPath && (
          <div className="flex items-center gap-1.5">
            <svg width="40" height="14" viewBox="0 0 40 14" aria-hidden className="flex-shrink-0">
              <path d={peqNotchSvgPath} fill="none" stroke={severityColor} strokeWidth="1.2" strokeOpacity="0.5" />
            </svg>
            <span className="text-[9px] font-mono text-muted-foreground/40 tracking-wide leading-none">
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
                backgroundColor: RUNAWAY_COLOR,
                opacity: Math.min(0.55, ((ageSec - 20) / 40) * 0.55),
              }}
            />
          )}
        </div>
      )}
    </div>
  )
})
