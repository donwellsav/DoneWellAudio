'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Advisory } from '@/types/advisory'
import type { EarlyWarning } from '@/hooks/audioAnalyzerTypes'
import { useDetection } from '@/contexts/DetectionContext'
import { useAdvisoryClearState } from '@/hooks/useAdvisoryClearState'
import { useCompanion } from '@/hooks/useCompanion'
import { getFeedbackHistory } from '@/lib/dsp/feedbackHistory'

// Re-export for consumers that want to import CompanionAdvisoryState from here

/** Module → app feedback state for a single advisory. */
export interface CompanionAdvisoryState {
  /** Module received the advisory. */
  ack?: { at: number }
  /** EQ cut was successfully sent to mixer. */
  applied?: { at: number; gainDb: number; slotIndex: number }
  /** Apply failed — mixer error, slots full, etc. */
  failed?: { at: number; reason: string }
}

export interface AdvisoryContextValue {
  advisories: Advisory[]
  activeAdvisoryCount: number
  earlyWarning: EarlyWarning | null
  dismissedIds: Set<string>
  rtaClearedIds: Set<string>
  geqClearedIds: Set<string>
  hasActiveRTAMarkers: boolean
  hasActiveGEQBars: boolean
  falsePositiveIds: ReadonlySet<string> | undefined
  confirmedIds: ReadonlySet<string> | undefined
  /** Per-advisory Companion ack/applied/failed state (module → app feedback). */
  companionState: ReadonlyMap<string, CompanionAdvisoryState>
  /** Setter: patch Companion state for a specific advisory (called by CompanionCommandBridge). */
  patchCompanionState: (advisoryId: string, patch: Partial<CompanionAdvisoryState>) => void
  /** Setter: clear Companion state for an advisory. */
  clearCompanionStateForAdvisory: (advisoryId: string) => void
  onDismiss: (id: string) => void
  onClearAll: () => void
  onClearResolved: () => void
  onClearRTA: () => void
  onClearGEQ: () => void
  onFalsePositive: ((advisoryId: string) => void) | undefined
  onConfirmFeedback: ((advisoryId: string) => void) | undefined
}

const AdvisoryContext = createContext<AdvisoryContextValue | null>(null)

interface AdvisoryProviderProps {
  onFalsePositive: ((advisoryId: string) => void) | undefined
  falsePositiveIds: ReadonlySet<string> | undefined
  onConfirmFeedback: ((advisoryId: string) => void) | undefined
  confirmedIds: ReadonlySet<string> | undefined
  children: ReactNode
}

export function AdvisoryProvider({
  onFalsePositive,
  falsePositiveIds,
  onConfirmFeedback,
  confirmedIds,
  children,
}: AdvisoryProviderProps) {
  const { advisories, earlyWarning } = useDetection()
  const {
    clearState,
    activeAdvisoryCount,
    hasActiveGEQBars,
    hasActiveRTAMarkers,
    onDismiss,
    onClearAll,
    onClearResolved,
    onClearGEQ,
    onClearRTA,
  } = useAdvisoryClearState(advisories)

  // ── Companion bidirectional state ─────────────────────────────────
  // State lives here so IssueCard can subscribe via useAdvisories(). The actual
  // relay polling + dispatch lives in <CompanionCommandBridge> which must be
  // mounted inside UIProvider so it can also handle Stream Deck commands.
  const { settings: companionSettings } = useCompanion()
  const [companionState, setCompanionState] = useState<Map<string, CompanionAdvisoryState>>(() => new Map())

  const patchCompanionState = useCallback(
    (advisoryId: string, patch: Partial<CompanionAdvisoryState>) => {
      setCompanionState((prev) => {
        const next = new Map(prev)
        const existing = prev.get(advisoryId) ?? {}
        next.set(advisoryId, { ...existing, ...patch })
        return next
      })
    },
    [],
  )

  const clearCompanionStateForAdvisory = useCallback((advisoryId: string) => {
    setCompanionState((prev) => {
      const next = new Map(prev)
      next.delete(advisoryId)
      return next
    })
  }, [])

  // Periodically reap expired Companion pending cuts → hotspot learning
  useEffect(() => {
    if (!companionSettings.enabled) return
    const history = getFeedbackHistory()
    const timerId = setInterval(() => {
      history.reapCompanionCuts()
    }, 1000)
    return () => clearInterval(timerId)
  }, [companionSettings.enabled])

  const value = useMemo<AdvisoryContextValue>(
    () => ({
      advisories,
      activeAdvisoryCount,
      earlyWarning,
      dismissedIds: clearState.dismissed,
      rtaClearedIds: clearState.rtaCleared,
      geqClearedIds: clearState.geqCleared,
      hasActiveRTAMarkers,
      hasActiveGEQBars,
      falsePositiveIds,
      confirmedIds,
      companionState,
      patchCompanionState,
      clearCompanionStateForAdvisory,
      onDismiss,
      onClearAll,
      onClearResolved,
      onClearRTA,
      onClearGEQ,
      onFalsePositive,
      onConfirmFeedback,
    }),
    [
      advisories,
      activeAdvisoryCount,
      earlyWarning,
      clearState.dismissed,
      clearState.rtaCleared,
      clearState.geqCleared,
      hasActiveRTAMarkers,
      hasActiveGEQBars,
      falsePositiveIds,
      confirmedIds,
      companionState,
      patchCompanionState,
      clearCompanionStateForAdvisory,
      onDismiss,
      onClearAll,
      onClearResolved,
      onClearRTA,
      onClearGEQ,
      onFalsePositive,
      onConfirmFeedback,
    ],
  )

  return (
    <AdvisoryContext.Provider value={value}>
      {children}
    </AdvisoryContext.Provider>
  )
}

export function useAdvisories(): AdvisoryContextValue {
  const ctx = useContext(AdvisoryContext)
  if (!ctx) {
    throw new Error('useAdvisories must be used within <AdvisoryProvider>')
  }
  return ctx
}
