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
import { useEngine } from '@/contexts/EngineContext'
import { useAdvisoryClearState } from '@/hooks/useAdvisoryClearState'
import { useCompanion } from '@/hooks/useCompanion'
import {
  getFeedbackHistory,
  getFeedbackHotspotSummaries,
} from '@/lib/dsp/feedbackHistory'

// Re-export for consumers that want to import CompanionAdvisoryState from here

/** Module → app feedback state for a single advisory. */
export interface CompanionAdvisoryState {
  /** Module received the advisory. */
  ack?: { at: number }
  /** EQ cut was successfully sent to mixer. */
  applied?: { at: number; gainDb: number; slotIndex?: number }
  /** Apply failed — mixer error, slots full, etc. */
  failed?: { at: number; reason: string }
  /** Partial apply — one of PEQ/GEQ succeeded but the other failed (both mode). */
  partialApply?: { at: number; peqApplied: boolean; geqApplied: boolean; failReason: string }
}

/** High-frequency data — changes on every advisory update from the worker. */
export interface AdvisoryDataContextValue {
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
}

/** Low-frequency actions — stable callbacks, only change on user interaction. */
export interface AdvisoryActionsContextValue {
  patchCompanionState: (advisoryId: string, patch: Partial<CompanionAdvisoryState>) => void
  clearCompanionStateForAdvisory: (advisoryId: string) => void
  onDismiss: (id: string) => void
  onClearAll: () => void
  onClearResolved: () => void
  onClearRTA: () => void
  onClearGEQ: () => void
  onFalsePositive: ((advisoryId: string) => void) | undefined
  onConfirmFeedback: ((advisoryId: string) => void) | undefined
}

/** Combined type for consumers that need both (backward-compatible). */
export type AdvisoryContextValue = AdvisoryDataContextValue & AdvisoryActionsContextValue

const AdvisoryDataContext = createContext<AdvisoryDataContextValue | null>(null)
const AdvisoryActionsContext = createContext<AdvisoryActionsContextValue | null>(null)

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
  const { dspWorker } = useEngine()
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
      if (history.reapCompanionCuts()) {
        dspWorker.syncFeedbackHistory(getFeedbackHotspotSummaries())
      }
    }, 1000)
    return () => clearInterval(timerId)
  }, [companionSettings.enabled, dspWorker])

  // Split into two context values — data (high-frequency) vs actions (stable callbacks).
  // Components that only need actions (e.g. CompanionCommandBridge) skip re-renders
  // when advisories change (~50Hz during active detection).
  const dataValue = useMemo<AdvisoryDataContextValue>(
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
    ],
  )

  const actionsValue = useMemo<AdvisoryActionsContextValue>(
    () => ({
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
    <AdvisoryDataContext.Provider value={dataValue}>
      <AdvisoryActionsContext.Provider value={actionsValue}>
        {children}
      </AdvisoryActionsContext.Provider>
    </AdvisoryDataContext.Provider>
  )
}

/** Read advisory data + actions (backward-compatible). Triggers on ANY advisory change. */
export function useAdvisories(): AdvisoryContextValue {
  const data = useContext(AdvisoryDataContext)
  const actions = useContext(AdvisoryActionsContext)
  if (!data || !actions) {
    throw new Error('useAdvisories must be used within <AdvisoryProvider>')
  }
  return { ...data, ...actions }
}

/** Read ONLY actions (callbacks). Does NOT re-render on advisory data changes. */
export function useAdvisoryActions(): AdvisoryActionsContextValue {
  const ctx = useContext(AdvisoryActionsContext)
  if (!ctx) {
    throw new Error('useAdvisoryActions must be used within <AdvisoryProvider>')
  }
  return ctx
}

/** Read ONLY advisory data. Does NOT re-render on action changes. */
export function useAdvisoryData(): AdvisoryDataContextValue {
  const ctx = useContext(AdvisoryDataContext)
  if (!ctx) {
    throw new Error('useAdvisoryData must be used within <AdvisoryProvider>')
  }
  return ctx
}
