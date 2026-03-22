'use client'

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
  type ReactNode,
} from 'react'
import type { Advisory } from '@/types/advisory'
import type { EarlyWarning } from '@/hooks/useAudioAnalyzer'
import { useDetection } from '@/contexts/DetectionContext'

// ── Context value ───────────────────────────────────────────────────────────

export interface AdvisoryContextValue {
  // State
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

  // Actions
  onDismiss: (id: string) => void
  onClearAll: () => void
  onClearResolved: () => void
  onClearRTA: () => void
  onClearGEQ: () => void
  onFalsePositive: ((advisoryId: string) => void) | undefined
  onConfirmFeedback: ((advisoryId: string) => void) | undefined
}

const AdvisoryContext = createContext<AdvisoryContextValue | null>(null)

// ── Provider props ──────────────────────────────────────────────────────────

interface AdvisoryProviderProps {
  onFalsePositive: ((advisoryId: string) => void) | undefined
  falsePositiveIds: ReadonlySet<string> | undefined
  onConfirmFeedback: ((advisoryId: string) => void) | undefined
  confirmedIds: ReadonlySet<string> | undefined
  children: ReactNode
}

// ── Consolidated clear state ─────────────────────────────────────────────

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

// ── Provider ────────────────────────────────────────────────────────────────

export function AdvisoryProvider({
  onFalsePositive,
  falsePositiveIds,
  onConfirmFeedback,
  confirmedIds,
  children,
}: AdvisoryProviderProps) {
  // ── Source-of-truth from audio context ─────────────────────────────────

  const { advisories, earlyWarning } = useDetection()

  // ── Derived state ───────────────────────────────────────────────────────

  const activeAdvisoryCount = useMemo(
    () => advisories.filter(a => !a.resolved).length,
    [advisories],
  )

  // ── Unified cleared-ID state ──────────────────────────────────────────

  const [clearState, setClearState] = useState<ClearState>(EMPTY_CLEAR_STATE)

  // Ref for stable callback identity — avoids recreating callbacks on every advisory change
  const advisoriesRef = useRef(advisories)
  advisoriesRef.current = advisories

  const onDismiss = useCallback((id: string) => {
    setClearState(prev => ({ ...prev, dismissed: new Set(prev.dismissed).add(id) }))
  }, [])

  const onClearAll = useCallback(() => {
    setClearState(prev => ({ ...prev, dismissed: new Set(advisoriesRef.current.map(a => a.id)) }))
  }, [])

  const onClearResolved = useCallback(() => {
    setClearState(prev => {
      const next = new Set(prev.dismissed)
      advisoriesRef.current.forEach(a => { if (a.resolved) next.add(a.id) })
      return { ...prev, dismissed: next }
    })
  }, [])

  const onClearGEQ = useCallback(() => {
    setClearState(prev => ({ ...prev, geqCleared: new Set(advisoriesRef.current.map(a => a.id)) }))
  }, [])

  const onClearRTA = useCallback(() => {
    setClearState(prev => ({ ...prev, rtaCleared: new Set(advisoriesRef.current.map(a => a.id)) }))
  }, [])

  // ── Derived booleans ──────────────────────────────────────────────────

  const hasActiveGEQBars = useMemo(
    () => advisories.some(a => !clearState.geqCleared.has(a.id) && a.advisory?.geq),
    [advisories, clearState.geqCleared],
  )

  const hasActiveRTAMarkers = useMemo(
    () => advisories.some(a => !clearState.rtaCleared.has(a.id)),
    [advisories, clearState.rtaCleared],
  )

  // ── Auto-expire stale IDs when advisories leave the live list ───────────

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: prune stale IDs when advisories change
    setClearState(prev => {
      if (prev.dismissed.size === 0 && prev.geqCleared.size === 0 && prev.rtaCleared.size === 0) return prev
      const liveIds = new Set(advisories.map(a => a.id))
      const prune = (s: Set<string>) => {
        const next = new Set<string>()
        s.forEach(id => { if (liveIds.has(id)) next.add(id) })
        return next.size === s.size ? s : next
      }
      const dismissed = prune(prev.dismissed)
      const geqCleared = prune(prev.geqCleared)
      const rtaCleared = prune(prev.rtaCleared)
      if (dismissed === prev.dismissed && geqCleared === prev.geqCleared && rtaCleared === prev.rtaCleared) return prev
      return { dismissed, geqCleared, rtaCleared }
    })
  }, [advisories])

  // ── Memoized value ──────────────────────────────────────────────────────

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

// ── Hook ────────────────────────────────────────────────────────────────────

export function useAdvisories(): AdvisoryContextValue {
  const ctx = useContext(AdvisoryContext)
  if (!ctx) throw new Error('useAdvisories must be used within <AdvisoryProvider>')
  return ctx
}
