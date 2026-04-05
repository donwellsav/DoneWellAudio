'use client'

import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from 'react'
import type { Advisory } from '@/types/advisory'
import type { EarlyWarning } from '@/hooks/audioAnalyzerTypes'
import { useDetection } from '@/contexts/DetectionContext'
import { useAdvisoryClearState } from '@/hooks/useAdvisoryClearState'

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
