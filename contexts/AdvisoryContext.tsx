'use client'

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useEffect,
  type ReactNode,
} from 'react'
import type { Advisory } from '@/types/advisory'
import type { EarlyWarning } from '@/hooks/useAudioAnalyzer'
import { useDetection } from '@/contexts/DetectionContext'

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

interface ClearState {
  dismissed: Set<string>
  geqCleared: Set<string>
  rtaCleared: Set<string>
}

const EMPTY_CLEAR_STATE: ClearState = {
  dismissed: new Set(),
  geqCleared: new Set(),
  rtaCleared: new Set(),
}

export function AdvisoryProvider({
  onFalsePositive,
  falsePositiveIds,
  onConfirmFeedback,
  confirmedIds,
  children,
}: AdvisoryProviderProps) {
  const { advisories, earlyWarning } = useDetection()
  const [clearState, setClearState] = useState<ClearState>(EMPTY_CLEAR_STATE)

  const activeAdvisoryCount = useMemo(
    () => advisories.filter(a => !a.resolved && !clearState.dismissed.has(a.id)).length,
    [advisories, clearState.dismissed],
  )

  const onDismiss = useCallback((id: string) => {
    setClearState(prev => ({ ...prev, dismissed: new Set(prev.dismissed).add(id) }))
  }, [])

  const onClearAll = useCallback(() => {
    setClearState(prev => ({ ...prev, dismissed: new Set(advisories.map(a => a.id)) }))
  }, [advisories])

  const onClearResolved = useCallback(() => {
    setClearState(prev => {
      const next = new Set(prev.dismissed)
      advisories.forEach(a => {
        if (a.resolved) next.add(a.id)
      })
      return { ...prev, dismissed: next }
    })
  }, [advisories])

  const onClearGEQ = useCallback(() => {
    setClearState(prev => ({ ...prev, geqCleared: new Set(advisories.map(a => a.id)) }))
  }, [advisories])

  const onClearRTA = useCallback(() => {
    setClearState(prev => ({ ...prev, rtaCleared: new Set(advisories.map(a => a.id)) }))
  }, [advisories])

  const hasActiveGEQBars = useMemo(
    () => advisories.some(a => !clearState.geqCleared.has(a.id) && a.advisory?.geq),
    [advisories, clearState.geqCleared],
  )

  const hasActiveRTAMarkers = useMemo(
    () => advisories.some(a => !clearState.rtaCleared.has(a.id)),
    [advisories, clearState.rtaCleared],
  )

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- stale cleared ids must be pruned after advisories change
    setClearState(prev => {
      if (prev.dismissed.size === 0 && prev.geqCleared.size === 0 && prev.rtaCleared.size === 0) {
        return prev
      }

      const liveIds = new Set(advisories.map(a => a.id))
      const prune = (ids: Set<string>) => {
        const next = new Set<string>()
        ids.forEach(id => {
          if (liveIds.has(id)) next.add(id)
        })
        return next.size === ids.size ? ids : next
      }

      const dismissed = prune(prev.dismissed)
      const geqCleared = prune(prev.geqCleared)
      const rtaCleared = prune(prev.rtaCleared)

      if (
        dismissed === prev.dismissed &&
        geqCleared === prev.geqCleared &&
        rtaCleared === prev.rtaCleared
      ) {
        return prev
      }

      return { dismissed, geqCleared, rtaCleared }
    })
  }, [advisories])

  const value = useMemo<AdvisoryContextValue>(() => ({
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
    onDismiss,
    onClearAll,
    onClearResolved,
    onClearRTA,
    onClearGEQ,
    onFalsePositive,
    onConfirmFeedback,
  }), [
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
    onDismiss,
    onClearAll,
    onClearResolved,
    onClearRTA,
    onClearGEQ,
    onFalsePositive,
    onConfirmFeedback,
  ])

  return (
    <AdvisoryContext.Provider value={value}>
      {children}
    </AdvisoryContext.Provider>
  )
}

export function useAdvisories(): AdvisoryContextValue {
  const ctx = useContext(AdvisoryContext)
  if (!ctx) throw new Error('useAdvisories must be used within <AdvisoryProvider>')
  return ctx
}
