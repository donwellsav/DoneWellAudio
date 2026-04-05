'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Advisory } from '@/types/advisory'

export interface AdvisoryClearState {
  dismissed: Set<string>
  geqCleared: Set<string>
  rtaCleared: Set<string>
}

export interface AdvisoryClearStateHandle {
  clearState: AdvisoryClearState
  activeAdvisoryCount: number
  hasActiveGEQBars: boolean
  hasActiveRTAMarkers: boolean
  onDismiss: (id: string) => void
  onClearAll: () => void
  onClearResolved: () => void
  onClearGEQ: () => void
  onClearRTA: () => void
}

function createEmptyClearState(): AdvisoryClearState {
  return {
    dismissed: new Set(),
    geqCleared: new Set(),
    rtaCleared: new Set(),
  }
}

function copyWithAddedId(ids: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(ids)
  next.add(id)
  return next
}

function makeAdvisoryIdSet(advisories: readonly Advisory[]): Set<string> {
  return new Set(advisories.map((advisory) => advisory.id))
}

function pruneIds(ids: ReadonlySet<string>, liveIds: ReadonlySet<string>): Set<string> {
  const next = new Set<string>()
  ids.forEach((id) => {
    if (liveIds.has(id)) {
      next.add(id)
    }
  })
  return next
}

export function useAdvisoryClearState(
  advisories: readonly Advisory[],
): AdvisoryClearStateHandle {
  const [clearState, setClearState] = useState<AdvisoryClearState>(createEmptyClearState)

  const activeAdvisoryCount = useMemo(
    () =>
      advisories.filter(
        (advisory) =>
          !advisory.resolved && !clearState.dismissed.has(advisory.id),
      ).length,
    [advisories, clearState.dismissed],
  )

  const hasActiveGEQBars = useMemo(
    () =>
      advisories.some(
        (advisory) =>
          !clearState.geqCleared.has(advisory.id) && Boolean(advisory.advisory?.geq),
      ),
    [advisories, clearState.geqCleared],
  )

  const hasActiveRTAMarkers = useMemo(
    () => advisories.some((advisory) => !clearState.rtaCleared.has(advisory.id)),
    [advisories, clearState.rtaCleared],
  )

  const onDismiss = useCallback((id: string) => {
    setClearState((prev) => ({
      ...prev,
      dismissed: copyWithAddedId(prev.dismissed, id),
    }))
  }, [])

  const onClearAll = useCallback(() => {
    setClearState((prev) => ({
      ...prev,
      dismissed: makeAdvisoryIdSet(advisories),
    }))
  }, [advisories])

  const onClearResolved = useCallback(() => {
    setClearState((prev) => {
      const dismissed = new Set(prev.dismissed)
      advisories.forEach((advisory) => {
        if (advisory.resolved) {
          dismissed.add(advisory.id)
        }
      })
      return { ...prev, dismissed }
    })
  }, [advisories])

  const onClearGEQ = useCallback(() => {
    setClearState((prev) => ({
      ...prev,
      geqCleared: makeAdvisoryIdSet(advisories),
    }))
  }, [advisories])

  const onClearRTA = useCallback(() => {
    setClearState((prev) => ({
      ...prev,
      rtaCleared: makeAdvisoryIdSet(advisories),
    }))
  }, [advisories])

  useEffect(() => {
    setClearState((prev) => {
      if (
        prev.dismissed.size === 0 &&
        prev.geqCleared.size === 0 &&
        prev.rtaCleared.size === 0
      ) {
        return prev
      }

      const liveIds = makeAdvisoryIdSet(advisories)
      const dismissed = pruneIds(prev.dismissed, liveIds)
      const geqCleared = pruneIds(prev.geqCleared, liveIds)
      const rtaCleared = pruneIds(prev.rtaCleared, liveIds)

      if (
        dismissed.size === prev.dismissed.size &&
        geqCleared.size === prev.geqCleared.size &&
        rtaCleared.size === prev.rtaCleared.size
      ) {
        return prev
      }

      return { dismissed, geqCleared, rtaCleared }
    })
  }, [advisories])

  return {
    clearState,
    activeAdvisoryCount,
    hasActiveGEQBars,
    hasActiveRTAMarkers,
    onDismiss,
    onClearAll,
    onClearResolved,
    onClearGEQ,
    onClearRTA,
  }
}
