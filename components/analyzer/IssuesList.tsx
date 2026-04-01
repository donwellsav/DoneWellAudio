'use client'

import { useMemo, useState, useCallback, useRef, useEffect, memo } from 'react'
import { formatFrequency } from '@/lib/utils/pitchUtils'
import { getSeverityText } from '@/lib/dsp/classifier'
import { getFeedbackHistory } from '@/lib/dsp/feedbackHistory'
import { ArrowLeft, ArrowRight, Timer } from 'lucide-react'
import { DwaLogo } from './DwaLogo'
import { swipeHintStorage } from '@/lib/storage/dwaStorage'
import type { Advisory } from '@/types/advisory'
import { useCompanion } from '@/hooks/useCompanion'
import { usePA2 } from '@/contexts/PA2Context'
import { useSettings } from '@/contexts/SettingsContext'
import { IssueCard } from './IssueCard'

function formatFreqLabel(hz: number): string {
  if (hz >= 10000) return `${(hz / 1000).toFixed(0)}k`
  if (hz >= 1000) return `${(hz / 1000).toFixed(1)}k`
  return `${hz}`
}

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
  const companion = useCompanion()
  const pa2 = usePA2()
  const { settings } = useSettings()

  useEffect(() => {
    companion.autoSendAdvisories(advisories)
  }, [advisories, companion])

  // Auto-send new advisories to PA2 when enabled (handled by usePA2Bridge internally)
  // The hook's autoSend mode handles forwarding — no extra effect needed here

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

    // Fix 11 (AI Fight Club): Prune announcedIds to prevent unbounded growth over multi-hour sessions
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
          <div className="flex flex-col items-center justify-center flex-1 min-h-[120px] py-6 gap-3">
            {/* Standby status indicator */}
            <span className="flex items-center gap-1.5 font-mono text-[10px] font-bold tracking-[0.3em] uppercase text-[var(--console-amber)]/70 mb-1">
              <span className="inline-block w-1 h-1 rounded-full bg-[var(--console-amber)]/70 animate-led-pulse-amber flex-shrink-0" aria-hidden />
              Standby
            </span>
            <button
              onClick={onStart}
              aria-label="Start analysis"
              className="group relative flex flex-col items-center justify-center gap-3 w-full max-w-[220px] py-5 px-5 rounded-xl border border-primary/20 hover:border-primary/40 bg-primary/5 hover:bg-primary/10 transition-all duration-300 cursor-pointer animate-start-glow focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary"
              style={{ background: 'radial-gradient(ellipse 100% 80% at 50% 60%, rgba(75, 146, 255, 0.10) 0%, rgba(75, 146, 255, 0.03) 55%, transparent 100%)' }}
            >
              {/* Atmospheric radial pool behind logo */}
              <div className="absolute inset-0 rounded-xl overflow-hidden pointer-events-none" aria-hidden>
                <div className="absolute inset-0 rounded-xl" style={{ background: 'radial-gradient(ellipse 70% 60% at 50% 50%, rgba(75,146,255,0.07) 0%, transparent 70%)' }} />
              </div>
              <div className="relative flex items-center justify-center overflow-hidden rounded-full" style={{ width: 80, height: 80 }}>
                <div className="standby-glow-ring" />
                <div className="standby-glow-ring" style={{ animationDelay: '1.75s' }} />
                <div className="standby-sweep" aria-hidden />
                <DwaLogo className="relative z-10 w-20 h-20 text-foreground drop-shadow-[0_0_12px_rgba(37,99,235,0.3)] dark:drop-shadow-[0_0_14px_rgba(75,146,255,0.45)]" />
              </div>
              <div className="flex flex-col items-center gap-0.5">
                <span className="font-mono text-xs font-bold tracking-[0.15em] uppercase text-muted-foreground group-hover:text-foreground transition-colors">
                  Press to Start
                </span>
                <span className="font-mono text-[10px] font-bold tracking-[0.15em] uppercase text-muted-foreground/60 group-hover:text-muted-foreground transition-colors">
                  Analysis
                </span>
              </div>
            </button>

            {onStartRingOut && (
              <>
                <div className="flex items-center gap-2 w-full max-w-[220px]">
                  <div className="flex-1 h-px panel-groove-subtle" />
                  <span className="font-mono text-[9px] text-[var(--console-amber)]/40 uppercase tracking-widest">— OR —</span>
                  <div className="flex-1 h-px panel-groove-subtle" />
                </div>

                <button
                  onClick={onStartRingOut}
                  aria-label="Start ring-out wizard"
                  className="group relative flex flex-col items-center justify-center gap-1 w-full max-w-[220px] py-3 px-4 rounded-xl border border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/10 transition-all duration-300 cursor-pointer btn-glow-amber focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-amber-500"
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
            {/* System status readout — gives the panel substance while idle */}
            <div className="flex flex-col items-center gap-1 mt-3 max-w-[220px]">
              <div className="flex items-center gap-2 font-mono text-[9px] tracking-[0.12em] uppercase text-muted-foreground/45">
                <span>{settings.mode}</span>
                <span className="text-muted-foreground/25">·</span>
                <span>{settings.fftSize} FFT</span>
                <span className="text-muted-foreground/25">·</span>
                <span>{formatFreqLabel(settings.minFrequency)}–{formatFreqLabel(settings.maxFrequency)}</span>
              </div>
              <p className="text-[10px] font-mono text-muted-foreground/40 text-center">
                Adjust sensitivity with the fader or drag the threshold line on the spectrum
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center flex-1 min-h-[80px] py-6 gap-2">
            {isLowSignal ? (
              <>
                {/* Low signal: blue — system/scope state, not a detection */}
                <div className="relative flex items-center justify-center flex-shrink-0" style={{ width: 44, height: 44 }}>
                  <div className="radar-ring" />
                  <div className="radar-ring" style={{ animationDelay: '1.4s' }} />
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0 bg-[var(--console-blue)]/50" />
                </div>
                <div className="font-mono text-[10px] font-bold tracking-[0.25em] uppercase text-[var(--console-blue)]/70">
                  Low Signal
                </div>
                <div className="flex items-center gap-1.5 motion-safe:animate-pulse">
                  <span className="text-[var(--console-blue)]/60 text-xs leading-none">▲</span>
                  <span className="font-mono text-[9px] text-[var(--console-blue)]/50 tracking-wider uppercase">Increase gain</span>
                </div>
              </>
            ) : (
              <>
                {/* All-clear: green — no feedback detected */}
                <div className="relative flex items-center justify-center flex-shrink-0" style={{ width: 56, height: 56 }}>
                  <div className="radar-ring-green" />
                  <div className="radar-ring-green" style={{ animationDelay: '1.75s' }} />
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0 bg-emerald-500/60"
                    style={{ boxShadow: '0 0 10px rgba(16, 185, 129, 0.55)' }}
                  />
                </div>
                <div className="font-mono text-[11px] font-bold tracking-[0.2em] uppercase text-emerald-500/80">
                  No Feedback
                </div>
                <div className="font-mono text-[9px] tracking-[0.18em] uppercase text-emerald-500/50">
                  Detected
                </div>
              </>
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
              onSendToMixer={companion.settings.enabled ? companion.sendAdvisory : undefined}
              onSendToPA2={pa2.settings.enabled && pa2.status === 'connected' ? pa2.sendDetections : undefined}
              pa2Connected={pa2.settings.enabled && pa2.status === 'connected'}
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
