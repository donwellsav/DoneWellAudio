'use client'

import { useMemo, useState, useCallback, useRef, useEffect, memo } from 'react'
import { formatFrequency, formatPitch } from '@/lib/utils/pitchUtils'
import { getSeverityColor } from '@/lib/dsp/eqAdvisor'
import { getSeverityText } from '@/lib/dsp/classifier'
import { getFeedbackHistory } from '@/lib/dsp/feedbackHistory'
import { AlertTriangle, CheckCircle2, TrendingUp, Copy, Check } from 'lucide-react'
import { KtrLogo } from './KtrLogo'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { Advisory } from '@/types/advisory'

// Velocity thresholds for runaway prediction
const RUNAWAY_VELOCITY_THRESHOLD = 15 // dB/s
const WARNING_VELOCITY_THRESHOLD = 10 // dB/s

/** Minimum time (ms) issue cards stay in place before the list re-sorts */
const MIN_DISPLAY_MS = 3000

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
}

export const IssuesList = memo(function IssuesList({ advisories, maxIssues = 10, dismissedIds, onClearAll, onClearResolved, touchFriendly, isRunning, onStart, onFalsePositive, falsePositiveIds, onConfirmFeedback, confirmedIds, isLowSignal, swipeLabeling, showAlgorithmScores }: IssuesListProps) {
  // Filter dismissed, sort repeat offenders to top by hit count, then slice to max.
  // We attach occurrenceCount here so IssueCard doesn't need to re-query feedbackHistory.
  const latestSorted = useMemo(() => {
    const history = getFeedbackHistory()
    return [...advisories]
      .filter((a) => !dismissedIds?.has(a.id))
      .map((a) => ({ advisory: a, occurrenceCount: history.getOccurrenceCount(a.trueFrequencyHz) }))
      .sort((a, b) => {
        // 1. Active before resolved
        if (a.advisory.resolved !== b.advisory.resolved) return a.advisory.resolved ? 1 : -1
        // 2. Repeat offenders (3+) float to top, sorted by count desc
        const aRepeat = a.occurrenceCount >= 3
        const bRepeat = b.occurrenceCount >= 3
        if (aRepeat !== bRepeat) return aRepeat ? -1 : 1
        if (aRepeat && bRepeat) return b.occurrenceCount - a.occurrenceCount
        // 3. Non-repeaters: frequency ascending
        return (a.advisory.trueFrequencyHz ?? 0) - (b.advisory.trueFrequencyHz ?? 0)
      })
      .slice(0, maxIssues)
  }, [advisories, dismissedIds, maxIssues])

  // Stabilize displayed list — hold card order for at least MIN_DISPLAY_MS so
  // engineers can read them before they shuffle. Advisory data (severity, age,
  // velocity) still updates in-place via IssueCard's own memos.
  const stableRef = useRef(latestSorted)
  const lastUpdateRef = useRef(Date.now())
  const [sorted, setSorted] = useState(latestSorted)
  const pendingRef = useRef(false)

  useEffect(() => {
    const elapsed = Date.now() - lastUpdateRef.current

    // Check if list identity changed (different IDs or different order)
    const prevIds = stableRef.current.map(s => s.advisory.id).join(',')
    const nextIds = latestSorted.map(s => s.advisory.id).join(',')
    const orderChanged = prevIds !== nextIds

    if (!orderChanged) {
      // Same cards in same order — update advisory data in-place (no visual jump)
      stableRef.current = latestSorted
      setSorted(latestSorted)
      return
    }

    if (elapsed >= MIN_DISPLAY_MS) {
      // Enough time has passed — apply new order immediately
      stableRef.current = latestSorted
      lastUpdateRef.current = Date.now()
      pendingRef.current = false
      setSorted(latestSorted)
    } else {
      // Too soon — schedule deferred update
      pendingRef.current = true
      const remaining = MIN_DISPLAY_MS - elapsed
      const timer = setTimeout(() => {
        pendingRef.current = false
        lastUpdateRef.current = Date.now()
        // Use latest value at time of flush
        stableRef.current = latestSorted
        setSorted(latestSorted)
      }, remaining)
      return () => clearTimeout(timer)
    }
  }, [latestSorted])

  const hasResolved = sorted.some(s => s.advisory.resolved)

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
              <KtrLogo className="w-36 h-36 text-foreground drop-shadow-[0_0_12px_rgba(75,146,255,0.5)]" />
              <div className="flex items-baseline gap-1.5">
                <span className="font-mono text-sm font-black tracking-[0.15em] text-foreground/90">KILL THE</span>
                <span className="font-mono text-base font-black tracking-[0.15em] text-primary drop-shadow-[0_0_10px_rgba(75,146,255,0.4)]">RING</span>
              </div>
              <span className="font-mono text-sm font-bold tracking-[0.2em] uppercase text-muted-foreground group-hover:text-foreground transition-colors">
                Press Here To Start Analysis
              </span>
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center flex-1 min-h-[120px] text-muted-foreground py-8">
            <CheckCircle2 className="w-5 h-5 text-primary/30 mb-2" />
            <div className="font-mono text-sm font-bold tracking-[0.15em] uppercase">Standby</div>
            <div className="font-mono text-sm mt-1 text-muted-foreground tracking-wide">Monitoring</div>
            {isLowSignal && (
              <div className="flex flex-col items-center gap-1 mt-3 motion-safe:animate-pulse">
                <span className="text-primary/50 text-lg leading-none">▲</span>
                <span className="font-mono text-xs text-primary/40 tracking-wide">Increase gain</span>
              </div>
            )}
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
          {sorted.map(({ advisory, occurrenceCount }) => (
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
            />
          ))}
        </>
      )}
    </div>
  )
})

/** Minimum horizontal distance (px) to trigger a swipe action */
const SWIPE_THRESHOLD = 60
/** Maximum vertical distance (px) before we consider it a scroll, not a swipe */
const SWIPE_VERTICAL_LIMIT = 40

interface IssueCardProps {
  advisory: Advisory
  occurrenceCount: number
  touchFriendly?: boolean
  onFalsePositive?: (advisoryId: string) => void
  isFalsePositive?: boolean
  onConfirmFeedback?: (advisoryId: string) => void
  isConfirmed?: boolean
  swipeLabeling?: boolean
  showAlgorithmScores?: boolean
}

const IssueCard = memo(function IssueCard({ advisory, occurrenceCount, touchFriendly, onFalsePositive, isFalsePositive, onConfirmFeedback, isConfirmed, swipeLabeling, showAlgorithmScores }: IssueCardProps) {
  // Memoize derived values that only change when the advisory object changes
  const {
    severityColor, pitchStr, exactFreqStr,
    velocity, isRunaway, isWarning, isResolved, timeToClipStr,
  } = useMemo(() => {
    const _severityColor = getSeverityColor(advisory.severity)
    const _pitchStr = advisory.advisory?.pitch ? formatPitch(advisory.advisory.pitch) : null
    const _exactFreqStr = advisory.trueFrequencyHz != null ? formatFrequency(advisory.trueFrequencyHz) : '---'
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
      isResolved: _isResolved, timeToClipStr: _timeToClipStr,
    }
  }, [advisory])

  // Age display — refreshes naturally on advisory updates (~10Hz)
  // eslint-disable-next-line react-hooks/purity -- benign: Date.now() in render is intentional for live age display
  const ageSec = Math.max(0, Math.round((Date.now() - advisory.timestamp) / 1000))
  const ageStr = ageSec < 5 ? 'just now' : ageSec < 60 ? `${ageSec}s` : `${Math.floor(ageSec / 60)}m`

  // Copy-to-clipboard state
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

  // Build tooltip detail string for niche metadata
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

  // ── Swipe-to-label gesture handling ─────────────────────────────────
  const [swipeX, setSwipeX] = useState(0)
  const [swiping, setSwiping] = useState(false)
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const swipeLocked = useRef(false) // true once we commit to horizontal swipe

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (!swipeLabeling) return
    const t = e.touches[0]
    touchStart.current = { x: t.clientX, y: t.clientY }
    swipeLocked.current = false
    setSwiping(false)
  }, [swipeLabeling])

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!swipeLabeling || !touchStart.current) return
    const t = e.touches[0]
    const dx = t.clientX - touchStart.current.x
    const dy = t.clientY - touchStart.current.y

    // If vertical movement dominates, bail — let the list scroll
    if (!swipeLocked.current) {
      if (Math.abs(dy) > SWIPE_VERTICAL_LIMIT) {
        touchStart.current = null
        setSwipeX(0)
        setSwiping(false)
        return
      }
      // Lock to horizontal once we've moved enough
      if (Math.abs(dx) > 10) swipeLocked.current = true
    }

    if (swipeLocked.current) {
      e.preventDefault() // prevent scroll while swiping horizontally
      setSwipeX(dx)
      setSwiping(true)
    }
  }, [swipeLabeling])

  const onTouchEnd = useCallback(() => {
    if (!swipeLabeling || !touchStart.current) return
    if (swipeX < -SWIPE_THRESHOLD && onFalsePositive) {
      onFalsePositive(advisory.id)
    } else if (swipeX > SWIPE_THRESHOLD && onConfirmFeedback) {
      onConfirmFeedback(advisory.id)
    }
    touchStart.current = null
    setSwipeX(0)
    setSwiping(false)
    swipeLocked.current = false
  }, [swipeLabeling, swipeX, onFalsePositive, onConfirmFeedback, advisory.id])

  // Swipe progress ratio for visual feedback (clamped 0-1)
  const swipeProgress = Math.min(Math.abs(swipeX) / SWIPE_THRESHOLD, 1)
  const swipeDirection = swipeX < 0 ? 'left' : swipeX > 0 ? 'right' : null

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
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Swipe reveal backgrounds — red (left=false+) / green (right=confirm) */}
      {swipeLabeling && swiping && (
        <div className="absolute inset-0 flex items-center z-0" aria-hidden>
          {swipeDirection === 'left' && (
            <div
              className="absolute inset-0 flex items-center justify-end pr-4 rounded"
              style={{ backgroundColor: `rgba(239, 68, 68, ${swipeProgress * 0.3})` }}
            >
              <span className="text-xs font-mono font-bold text-red-300 uppercase tracking-wider"
                style={{ opacity: swipeProgress }}>
                FALSE+
              </span>
            </div>
          )}
          {swipeDirection === 'right' && (
            <div
              className="absolute inset-0 flex items-center justify-start pl-4 rounded"
              style={{ backgroundColor: `rgba(16, 185, 129, ${swipeProgress * 0.3})` }}
            >
              <span className="text-xs font-mono font-bold text-emerald-300 uppercase tracking-wider"
                style={{ opacity: swipeProgress }}>
                CONFIRM
              </span>
            </div>
          )}
        </div>
      )}

      {/* Left severity accent */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1.5 rounded-r-sm"
        style={{ backgroundColor: isResolved ? 'hsl(var(--muted))' : severityColor }}
      />

      <div
        className="pl-3 pr-1.5 py-1.5 flex flex-col gap-1 relative z-10"
        style={swipeLabeling && swiping ? {
          transform: `translateX(${swipeX}px)`,
          transition: swiping ? 'none' : 'transform 200ms ease-out',
        } : undefined}
      >

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

          {/* RIGHT: Copy / FALSE+ top row, CONFIRM beneath */}
          <div className="flex flex-col items-end flex-shrink-0 self-center">
            <div className="flex items-center gap-0">
              <button
                  onClick={handleCopy}
                  aria-label={`Copy ${exactFreqStr} frequency info`}
                  className={`rounded btn-glow flex items-center justify-center cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${
                    copied
                      ? 'text-emerald-400'
                      : 'text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/60'
                  } ${touchFriendly ? 'w-8 h-8' : 'w-7 h-7'}`}
                >
                  {copied
                    ? <Check className={touchFriendly ? 'w-5 h-5' : 'w-3.5 h-3.5'} />
                    : <Copy className={touchFriendly ? 'w-5 h-5' : 'w-3.5 h-3.5'} />
                  }
                </button>
              {copied && (
                <span className="sr-only" role="status">Frequency info copied</span>
              )}
              {onFalsePositive && !swipeLabeling && (
                <button
                  onClick={() => onFalsePositive(advisory.id)}
                  aria-label={`${isFalsePositive ? 'Unflag' : 'Flag'} ${exactFreqStr} as false positive`}
                  className={`rounded text-xs font-mono font-bold tracking-wider transition-colors flex items-center justify-center px-1 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${
                    isFalsePositive
                      ? 'text-red-400 bg-red-500/20 border border-red-500/40'
                      : 'text-muted-foreground/50 hover:text-red-400 hover:bg-red-500/10 border border-transparent'
                  } ${touchFriendly ? 'h-7 min-w-[36px]' : 'h-6 min-w-[36px]'}`}
                >
                  FALSE+
                </button>
              )}
            </div>
            {onConfirmFeedback && !swipeLabeling && (
              <button
                onClick={() => onConfirmFeedback(advisory.id)}
                aria-label={`${isConfirmed ? 'Unconfirm' : 'Confirm'} ${exactFreqStr} as real feedback`}
                className={`rounded text-xs font-mono font-bold tracking-wider transition-colors flex items-center justify-center px-1 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring/50 self-end ${
                  isConfirmed
                    ? 'text-emerald-400 bg-emerald-500/20 border border-emerald-500/40'
                    : 'text-muted-foreground/50 hover:text-emerald-400 hover:bg-emerald-500/10 border border-transparent'
                } ${touchFriendly ? 'h-7 min-w-[36px]' : 'h-6 min-w-[36px]'}`}
              >
                CONFIRM
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
          <div className="text-[10px] font-mono text-muted-foreground/60 tracking-wide leading-tight mt-0.5">
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
      </div>
    </div>
  )
})
