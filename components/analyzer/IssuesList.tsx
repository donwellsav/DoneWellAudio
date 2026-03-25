'use client'

import { useMemo, useState, useCallback, useRef, useEffect, memo } from 'react'
import { formatFrequency, formatFrequencyRange, formatPitch } from '@/lib/utils/pitchUtils'
import { getSeverityColor } from '@/lib/dsp/eqAdvisor'
import { getSeverityText } from '@/lib/dsp/classifier'
import { getFeedbackHistory } from '@/lib/dsp/feedbackHistory'
import { AlertTriangle, CheckCircle2, TrendingUp, Copy, Check, X, ArrowLeft, ArrowRight, Timer } from 'lucide-react'
import { useTheme } from 'next-themes'
import { DwaLogo } from './DwaLogo'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { swipeHintStorage } from '@/lib/storage/dwaStorage'
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
  showPeqDetails?: boolean
  onStartRingOut?: () => void
  onDismiss?: (id: string) => void
}

export const IssuesList = memo(function IssuesList({ advisories, maxIssues = 10, dismissedIds, onClearAll, onClearResolved, touchFriendly, isRunning, onStart, onFalsePositive, falsePositiveIds, onConfirmFeedback, confirmedIds, isLowSignal, swipeLabeling, showAlgorithmScores, showPeqDetails, onStartRingOut, onDismiss }: IssuesListProps) {
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

  // ── Swipe gesture onboarding hint (shown once per install) ──
  const [showSwipeHint, setShowSwipeHint] = useState(() => {
    if (!swipeLabeling) return false
    return !swipeHintStorage.isSet()
  })
  const dismissSwipeHint = useCallback(() => {
    setShowSwipeHint(false)
    swipeHintStorage.set()
  }, [])

  // ── Accessibility: aria-live announcements for new advisories ──
  const [liveAnnouncement, setLiveAnnouncement] = useState('')
  const announcedIds = useRef(new Set<string>())
  const lastAnnounceTime = useRef(0)

  useEffect(() => {
    const now = Date.now()
    // Throttle to 1 announcement every 3 seconds
    if (now - lastAnnounceTime.current < 3000) return

    // Prune announcedIds to prevent unbounded growth in long sessions (Fight Club Fix #11)
    if (announcedIds.current.size > 200) {
      const entries = [...announcedIds.current]
      announcedIds.current = new Set(entries.slice(-100))
    }

    for (const { advisory: a } of sorted) {
      if (!announcedIds.current.has(a.id) && !a.resolved) {
        announcedIds.current.add(a.id)
        lastAnnounceTime.current = now
        const freq = a.trueFrequencyHz != null ? formatFrequency(a.trueFrequencyHz) : 'unknown'
        const sev = getSeverityText(a.severity)
        const cut = a.advisory?.peq ? `cut ${Math.abs(a.advisory.peq.gainDb).toFixed(0)} dB at Q ${a.advisory.peq.q.toFixed(0)}` : ''
        setLiveAnnouncement(`Feedback detected at ${freq}, severity ${sev}${cut ? `, ${cut}` : ''}`)
        break // One announcement at a time
      }
    }
  }, [sorted])

  return (
    <div className="flex flex-col gap-1.5">
      {/* Screen reader live region for feedback announcements */}
      <div className="sr-only" aria-live="polite" aria-atomic="true" role="status">
        {liveAnnouncement}
      </div>

      {sorted.length === 0 ? (
        !isRunning && onStart ? (
          <div className="flex flex-col items-center justify-center flex-1 min-h-[120px] py-4 gap-2">
            <button
              onClick={onStart}
              aria-label="Start analysis"
              className="group relative flex flex-col items-center justify-center gap-2 w-full max-w-[200px] py-4 px-4 rounded-lg border border-primary/30 bg-primary/5 hover:bg-primary/10 transition-all duration-300 cursor-pointer animate-start-glow focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary"
            >
              <DwaLogo className="w-20 h-20 text-foreground drop-shadow-[0_0_10px_rgba(37,99,235,0.3)] dark:drop-shadow-[0_0_10px_rgba(75,146,255,0.4)]" />
              <div className="flex flex-col items-center">
                <span className="font-mono text-xs font-bold tracking-[0.15em] uppercase text-muted-foreground group-hover:text-foreground transition-colors">
                  Press to Start
                </span>
                <span className="font-mono text-xs font-bold tracking-[0.15em] uppercase text-muted-foreground group-hover:text-foreground transition-colors">
                  Analysis
                </span>
              </div>
            </button>

            {onStartRingOut && (
              <>
                <div className="flex items-center gap-2 w-full max-w-[200px]">
                  <div className="flex-1 h-px bg-border" />
                  <span className="font-mono text-[9px] text-muted-foreground/50 uppercase tracking-widest">or</span>
                  <div className="flex-1 h-px bg-border" />
                </div>

                <button
                  onClick={onStartRingOut}
                  aria-label="Start ring-out wizard"
                  className="group relative flex flex-col items-center justify-center gap-1 w-full max-w-[200px] py-3 px-4 rounded-lg border border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10 transition-all duration-300 cursor-pointer focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-amber-500"
                >
                  <span className="font-mono text-sm font-black tracking-[0.15em] text-amber-500 dark:text-amber-400">
                    RING OUT ROOM
                  </span>
                  <span className="font-mono text-[9px] font-bold tracking-[0.12em] uppercase text-muted-foreground/60 group-hover:text-muted-foreground transition-colors">
                    Guided Calibration
                  </span>
                </button>
              </>
            )}
            <p className="text-[10px] font-mono text-muted-foreground/40 text-center mt-3 max-w-[220px]">
              Adjust sensitivity with the fader or drag the threshold line on the spectrum
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center flex-1 min-h-[80px] text-muted-foreground py-4">
            {/* Scanning indicator — horizontal sweep line */}
            <div className="w-full max-w-[180px] h-[2px] bg-primary/10 rounded-full overflow-hidden mb-3">
              <div className="h-full w-1/3 bg-primary/40 rounded-full animate-[scan_2s_ease-in-out_infinite]" />
            </div>
            <div className="font-mono text-xs font-bold tracking-[0.15em] uppercase text-muted-foreground/60">Monitoring</div>
            {isLowSignal && (
              <div className="flex items-center gap-1.5 mt-2 motion-safe:animate-pulse">
                <span className="text-primary/50 text-sm leading-none">▲</span>
                <span className="font-mono text-[10px] text-primary/40 tracking-wide">Increase gain</span>
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
          {/* Swipe gesture onboarding hint (first encounter on mobile) */}
          {showSwipeHint && swipeLabeling && sorted.length > 0 && (
            <SwipeHint onDismiss={dismissSwipeHint} />
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
              showPeqDetails={showPeqDetails}
              onDismiss={onDismiss}
            />
          ))}
        </>
      )}
    </div>
  )
})

// ── Swipe gesture onboarding tooltip (shown once on first advisory encounter) ──
const SWIPE_HINT_AUTO_DISMISS_MS = 8000

const SwipeHint = memo(function SwipeHint({ onDismiss }: { onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, SWIPE_HINT_AUTO_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [onDismiss])

  return (
    <div
      className="flex items-center justify-center gap-4 px-3 py-2 rounded-md bg-primary/10 border border-primary/20 text-xs font-mono text-muted-foreground animate-issue-enter"
      role="status"
      onClick={onDismiss}
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
  showPeqDetails?: boolean
  onDismiss?: (advisoryId: string) => void
}

const IssueCard = memo(function IssueCard({ advisory, occurrenceCount, touchFriendly, onFalsePositive, isFalsePositive, onConfirmFeedback, isConfirmed, swipeLabeling, showAlgorithmScores, showPeqDetails, onDismiss }: IssueCardProps) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme !== 'light'

  // Memoize derived values that only change when the advisory object changes
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

  // ── Swipe & long-press gesture handling ─────────────────────────────
  // Swipe left = dismiss, swipe right = confirm, long-press = false positive
  const [swipeX, setSwipeX] = useState(0)
  const [swiping, setSwiping] = useState(false)
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const swipeLocked = useRef(false)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [longPressed, setLongPressed] = useState(false)
  const hapticFired = useRef(false)

  const clearLongPress = useCallback(() => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null }
  }, [])

  // Clean up long-press timer on unmount to prevent stale callback firing
  useEffect(() => clearLongPress, [clearLongPress])

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (!swipeLabeling) return
    const t = e.touches[0]
    touchStart.current = { x: t.clientX, y: t.clientY }
    swipeLocked.current = false
    hapticFired.current = false
    setSwiping(false)
    setLongPressed(false)
    // Start long-press timer (500ms)
    clearLongPress()
    longPressTimer.current = setTimeout(() => {
      if (onFalsePositive) {
        onFalsePositive(advisory.id)
        setLongPressed(true)
        navigator.vibrate?.(30) // Haptic feedback for false-positive long-press
      }
      touchStart.current = null
    }, 500)
  }, [swipeLabeling, clearLongPress, onFalsePositive, advisory.id])

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!swipeLabeling || !touchStart.current) return
    const t = e.touches[0]
    const dx = t.clientX - touchStart.current.x
    const dy = t.clientY - touchStart.current.y

    // Any movement cancels long-press
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) clearLongPress()

    // If vertical movement dominates, bail — let the list scroll
    if (!swipeLocked.current) {
      if (Math.abs(dy) > SWIPE_VERTICAL_LIMIT) {
        touchStart.current = null
        setSwipeX(0)
        setSwiping(false)
        return
      }
      if (Math.abs(dx) > 10) swipeLocked.current = true
    }

    if (swipeLocked.current) {
      e.preventDefault()
      setSwipeX(dx)
      setSwiping(true)
      // Haptic feedback when crossing swipe threshold (fire once per gesture)
      if (!hapticFired.current && Math.abs(dx) >= SWIPE_THRESHOLD) {
        hapticFired.current = true
        navigator.vibrate?.(10)
      }
    }
  }, [swipeLabeling, clearLongPress])

  const onTouchEnd = useCallback(() => {
    clearLongPress()
    if (!swipeLabeling || !touchStart.current || longPressed) {
      touchStart.current = null
      setSwipeX(0)
      setSwiping(false)
      swipeLocked.current = false
      setLongPressed(false)
      return
    }
    // Swipe left = dismiss, swipe right = confirm
    if (swipeX < -SWIPE_THRESHOLD && onDismiss) {
      onDismiss(advisory.id)
    } else if (swipeX > SWIPE_THRESHOLD && onConfirmFeedback) {
      onConfirmFeedback(advisory.id)
    }
    touchStart.current = null
    setSwipeX(0)
    setSwiping(false)
    swipeLocked.current = false
  }, [swipeLabeling, swipeX, onDismiss, onConfirmFeedback, advisory.id, clearLongPress, longPressed])

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
      {/* Swipe reveal: left=dismiss (gray), right=confirm (green) */}
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
        className="flex flex-col relative z-10 @container"
        style={swipeLabeling && swiping ? {
          transform: `translateX(${swipeX}px)`,
          transition: swiping ? 'none' : 'transform 200ms ease-out',
        } : undefined}
      >

        {/* Top section: frequency + badges (actions move to bottom row on narrow cards) */}
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

          {/* RIGHT: Action buttons 2×2 grid (desktop only) */}
          {/* Layout: FALSE+ | X  /  CONFIRM | COPY */}
          {!touchFriendly && !swipeLabeling && (
            <div className="flex flex-col items-end flex-shrink-0 self-center">
              {/* Row 1: FALSE+ | X */}
              <div className="flex items-center">
                {onFalsePositive && (
                  <button
                    onClick={() => onFalsePositive(advisory.id)}
                    aria-label={`${isFalsePositive ? 'Unflag' : 'Flag'} ${exactFreqStr} as false positive`}
                    className={`rounded text-xs font-mono font-bold tracking-wider transition-colors flex items-center justify-center px-1.5 cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 h-8 min-w-[44px] ${
                      isFalsePositive ? 'text-red-400 bg-red-500/20 border border-red-500/40' : 'text-muted-foreground/50 hover:text-red-400 hover:bg-red-500/10 border border-transparent'
                    }`}
                  >
                    FALSE+
                  </button>
                )}
                {onDismiss && (
                  <button
                    onClick={() => onDismiss(advisory.id)}
                    aria-label={`Dismiss ${exactFreqStr}`}
                    className="rounded flex items-center justify-center cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 text-muted-foreground/30 hover:text-muted-foreground hover:bg-muted/60 transition-colors min-h-[44px] min-w-[44px]"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              {/* Row 2: CONFIRM | Copy */}
              <div className="flex items-center">
                {onConfirmFeedback && (
                  <button
                    onClick={() => onConfirmFeedback(advisory.id)}
                    aria-label={`${isConfirmed ? 'Unconfirm' : 'Confirm'} ${exactFreqStr} as real feedback`}
                    className={`rounded text-xs font-mono font-bold tracking-wider transition-colors flex items-center justify-center px-1.5 cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 h-8 min-w-[44px] ${
                      isConfirmed ? 'text-emerald-400 bg-emerald-500/20 border border-emerald-500/40' : 'text-muted-foreground/50 hover:text-emerald-400 hover:bg-emerald-500/10 border border-transparent'
                    }`}
                  >
                    CONFIRM
                  </button>
                )}
                <button
                  onClick={handleCopy}
                  aria-label={`Copy ${exactFreqStr} frequency info`}
                  className={`rounded btn-glow flex items-center justify-center cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 h-8 w-8 ${
                    copied ? 'text-emerald-400' : 'text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/60'
                  }`}
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              {copied && <span className="sr-only" role="status">Frequency info copied</span>}
            </div>
          )}
          {/* Desktop: copy-only when swipe labeling is on (no FALSE+/CONFIRM/X) */}
          {!touchFriendly && swipeLabeling && (
            <button
              onClick={handleCopy}
              aria-label={`Copy ${exactFreqStr} frequency info`}
              className={`rounded btn-glow flex items-center justify-center cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 w-8 h-8 flex-shrink-0 self-center ${
                copied ? 'text-emerald-400' : 'text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/60'
              }`}
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </button>
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

        {/* Mobile bottom action toolbar: FALSE+ | X / CONFIRM | COPY */}
        {touchFriendly && !swipeLabeling && (
          <div className="flex flex-col items-end">
            {/* Row 1: FALSE+ | X */}
            <div className="flex items-center">
              {onFalsePositive && (
                <button
                  onClick={() => onFalsePositive(advisory.id)}
                  aria-label={`${isFalsePositive ? 'Unflag' : 'Flag'} false positive`}
                  className={`rounded text-xs font-mono font-bold tracking-wider transition-colors flex items-center justify-center px-2 cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 h-8 min-w-[44px] ${
                    isFalsePositive ? 'text-red-400 bg-red-500/20 border border-red-500/40' : 'text-muted-foreground/50 hover:text-red-400 hover:bg-red-500/10 border border-transparent'
                  }`}
                >
                  FALSE+
                </button>
              )}
              {onDismiss && (
                <button
                  onClick={() => onDismiss(advisory.id)}
                  aria-label={`Dismiss ${exactFreqStr}`}
                  className="rounded flex items-center justify-center cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 text-muted-foreground/30 hover:text-muted-foreground hover:bg-muted/60 transition-colors min-h-[44px] min-w-[44px]"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            {/* Row 2: CONFIRM | Copy */}
            <div className="flex items-center">
              {onConfirmFeedback && (
                <button
                  onClick={() => onConfirmFeedback(advisory.id)}
                  aria-label={`${isConfirmed ? 'Unconfirm' : 'Confirm'} feedback`}
                  className={`rounded text-xs font-mono font-bold tracking-wider transition-colors flex items-center justify-center px-2 cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 h-8 min-w-[44px] ${
                    isConfirmed ? 'text-emerald-400 bg-emerald-500/20 border border-emerald-500/40' : 'text-muted-foreground/50 hover:text-emerald-400 hover:bg-emerald-500/10 border border-transparent'
                  }`}
                >
                  CONFIRM
                </button>
              )}
              <button
                onClick={handleCopy}
                aria-label={`Copy ${exactFreqStr}`}
                className={`rounded btn-glow flex items-center justify-center cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 w-9 h-8 ${
                  copied ? 'text-emerald-400' : 'text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/60'
                }`}
              >
                {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
              </button>
            </div>
            {copied && <span className="sr-only" role="status">Frequency info copied</span>}
          </div>
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
