'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
  /** Clear failed — mixer state could not be removed. */
  clearFailed?: { at: number; reason: string }
  /** Partial clear — one of PEQ/GEQ cleared but the other remained. */
  partialClear?: { at: number; peqCleared: boolean; geqCleared: boolean; failReason: string }
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
  restoreDismissedAdvisory: (advisoryId: string) => void
  retryCompanionLifecycle: (advisoryId: string) => void
  clearCompanionLifecycle: (advisoryId: string) => void
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
const COMPANION_LIFECYCLE_RETRY_MS = 1000

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
    restoreDismissed,
    onClearAll,
    onClearResolved,
    onClearGEQ,
    onClearRTA,
  } = useAdvisoryClearState(advisories)

  // ── Companion bidirectional state ─────────────────────────────────
  // State lives here so IssueCard can subscribe via useAdvisories(). The actual
  // relay polling + dispatch lives in <CompanionCommandBridge> which must be
  // mounted inside UIProvider so it can also handle Stream Deck commands.
  const {
    settings: companionSettings,
    sendDismiss,
    sendResolve,
  } = useCompanion()
  const [companionState, setCompanionState] = useState<Map<string, CompanionAdvisoryState>>(() => new Map())
  const resolvedRelayedIdsRef = useRef<Set<string>>(new Set())
  const pendingLifecycleActionsRef = useRef<Map<string, 'resolve' | 'dismiss'>>(new Map())
  const lifecycleInFlightRef = useRef<Set<string>>(new Set())
  const lastLifecycleActionRef = useRef<Map<string, 'resolve' | 'dismiss'>>(new Map())

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

  const clearCompanionLifecycle = useCallback((advisoryId: string) => {
    pendingLifecycleActionsRef.current.delete(advisoryId)
    lifecycleInFlightRef.current.delete(advisoryId)
    lastLifecycleActionRef.current.delete(advisoryId)
  }, [])

  // Periodically reap expired Companion pending cuts → hotspot learning
  useEffect(() => {
    const history = getFeedbackHistory()
    const timerId = setInterval(() => {
      if (history.reapCompanionCuts()) {
        dspWorker.syncFeedbackHistory(getFeedbackHotspotSummaries())
      }
    }, 1000)
    return () => clearInterval(timerId)
  }, [dspWorker])

  const flushPendingLifecycleActions = useCallback(() => {
    if (!companionSettings.enabled || pendingLifecycleActionsRef.current.size === 0) {
      return
    }

    pendingLifecycleActionsRef.current.forEach((action, advisoryId) => {
      if (lifecycleInFlightRef.current.has(advisoryId)) {
        return
      }

      lifecycleInFlightRef.current.add(advisoryId)
      const send = action === 'dismiss' ? sendDismiss : sendResolve

      void send(advisoryId)
        .then((accepted) => {
          if (
            accepted &&
            pendingLifecycleActionsRef.current.get(advisoryId) === action
          ) {
            pendingLifecycleActionsRef.current.delete(advisoryId)
          }
        })
        .finally(() => {
          lifecycleInFlightRef.current.delete(advisoryId)
        })
    })
  }, [companionSettings.enabled, sendDismiss, sendResolve])

  const retryCompanionLifecycle = useCallback((advisoryId: string) => {
    if (!companionSettings.enabled) {
      return
    }

    const action = lastLifecycleActionRef.current.get(advisoryId)
    if (!action) {
      return
    }

    pendingLifecycleActionsRef.current.set(advisoryId, action)
    flushPendingLifecycleActions()
  }, [companionSettings.enabled, flushPendingLifecycleActions])

  useEffect(() => {
    if (!companionSettings.enabled) {
      resolvedRelayedIdsRef.current.clear()
      pendingLifecycleActionsRef.current.clear()
      lifecycleInFlightRef.current.clear()
      lastLifecycleActionRef.current.clear()
      return
    }

    const liveIds = new Set<string>()
    for (const advisory of advisories) {
      liveIds.add(advisory.id)
      if (!advisory.resolved || resolvedRelayedIdsRef.current.has(advisory.id)) {
        continue
      }

      resolvedRelayedIdsRef.current.add(advisory.id)
      if (pendingLifecycleActionsRef.current.get(advisory.id) !== 'dismiss') {
        pendingLifecycleActionsRef.current.set(advisory.id, 'resolve')
        lastLifecycleActionRef.current.set(advisory.id, 'resolve')
      }
    }

    for (const advisoryId of [...resolvedRelayedIdsRef.current]) {
      if (!liveIds.has(advisoryId) && !pendingLifecycleActionsRef.current.has(advisoryId)) {
        resolvedRelayedIdsRef.current.delete(advisoryId)
      }
    }
    flushPendingLifecycleActions()
  }, [advisories, companionSettings.enabled, flushPendingLifecycleActions])

  useEffect(() => {
    if (!companionSettings.enabled) {
      return
    }

    flushPendingLifecycleActions()
    const timerId = setInterval(flushPendingLifecycleActions, COMPANION_LIFECYCLE_RETRY_MS)
    return () => clearInterval(timerId)
  }, [companionSettings.enabled, flushPendingLifecycleActions])

  useEffect(() => {
    const liveIds = new Set(advisories.map((advisory) => advisory.id))

    setCompanionState((prev) => {
      if (prev.size === 0) return prev

      let changed = false
      const next = new Map<string, CompanionAdvisoryState>()
      prev.forEach((value, advisoryId) => {
        if (liveIds.has(advisoryId)) {
          next.set(advisoryId, value)
        } else {
          changed = true
        }
      })

      return changed ? next : prev
    })
  }, [advisories])

  const dismissCompanionAdvisories = useCallback((advisoryIds: readonly string[]) => {
    if (!companionSettings.enabled) {
      return
    }

    for (const advisoryId of advisoryIds) {
      pendingLifecycleActionsRef.current.set(advisoryId, 'dismiss')
      lastLifecycleActionRef.current.set(advisoryId, 'dismiss')
    }
    flushPendingLifecycleActions()
  }, [companionSettings.enabled, flushPendingLifecycleActions])

  const onDismissWithCompanion = useCallback((id: string) => {
    onDismiss(id)
    const advisory = advisories.find((entry) => entry.id === id)
    if (advisory && !advisory.resolved) {
      dismissCompanionAdvisories([id])
    }
  }, [advisories, dismissCompanionAdvisories, onDismiss])

  const onClearAllWithCompanion = useCallback(() => {
    onClearAll()
    dismissCompanionAdvisories(
      advisories
        .filter((advisory) => !advisory.resolved)
        .map((advisory) => advisory.id),
    )
  }, [advisories, dismissCompanionAdvisories, onClearAll])

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
      restoreDismissedAdvisory: restoreDismissed,
      retryCompanionLifecycle,
      clearCompanionLifecycle,
      onDismiss: onDismissWithCompanion,
      onClearAll: onClearAllWithCompanion,
      onClearResolved,
      onClearRTA,
      onClearGEQ,
      onFalsePositive,
      onConfirmFeedback,
    }),
    [
      patchCompanionState,
      clearCompanionStateForAdvisory,
      restoreDismissed,
      retryCompanionLifecycle,
      clearCompanionLifecycle,
      onDismissWithCompanion,
      onClearAllWithCompanion,
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
