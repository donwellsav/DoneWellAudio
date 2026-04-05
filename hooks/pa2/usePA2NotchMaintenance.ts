'use client'

import { useEffect, useRef } from 'react'
import type { MutableRefObject } from 'react'
import type { Advisory } from '@/types/advisory'
import type { PA2AutoSendMode, PA2BridgeState } from '@/types/pa2'
import type { PA2Client } from '@/lib/pa2/pa2Client'
import { crossValidateWithPA2RTA, PA2_RTA_FREQS } from '@/lib/pa2/pa2Utils'

interface UsePA2NotchMaintenanceParams {
  advisories: readonly Advisory[]
  autoSend: PA2AutoSendMode
  autoSendMinConfidence: number
  state: PA2BridgeState
  clientRef: MutableRefObject<PA2Client | null>
}

export function usePA2NotchMaintenance({
  advisories,
  autoSend,
  autoSendMinConfidence,
  state,
  clientRef,
}: UsePA2NotchMaintenanceParams) {
  const releasedIdsRef = useRef<Set<string>>(new Set())
  const notchVerifyTimersRef = useRef<Record<string, number>>({})
  const rtaHistoryRef = useRef<number[][]>([])
  const lastPreNotchRef = useRef(0)
  const preNotchRollbackRef = useRef<Record<string, number>>({})

  useEffect(() => {
    if (autoSend === 'off' || !clientRef.current || state.status !== 'connected') return

    for (const advisory of advisories) {
      if (advisory.resolved && advisory.id && !releasedIdsRef.current.has(advisory.id)) {
        releasedIdsRef.current.add(advisory.id)
        void clientRef.current.releaseNotch(advisory.id).catch(() => {
          // Best effort. The notch may never have been placed.
        })
      }
    }
  }, [advisories, autoSend, clientRef, state.status])

  useEffect(() => {
    if (autoSend === 'off' || !clientRef.current || state.status !== 'connected') return
    if (!state.rta || state.rta.length < 31) return

    const now = Date.now()
    for (const [clientId, placedAt] of Object.entries(notchVerifyTimersRef.current)) {
      if (now - placedAt < 3000) continue

      const advisory = advisories.find((entry) => entry.id === clientId && !entry.resolved)
      if (!advisory) {
        delete notchVerifyTimersRef.current[clientId]
        continue
      }

      const validatedConfidence = crossValidateWithPA2RTA(
        advisory.trueFrequencyHz,
        advisory.confidence,
        state.rta,
      )
      if (validatedConfidence > advisory.confidence * 0.85) {
        const deeperPayload = [{
          hz: Math.round(advisory.trueFrequencyHz),
          confidence: Math.min(1.0, advisory.confidence + 0.2),
          type: 'feedback' as const,
          q: Math.min(16, Math.max(4, advisory.qEstimate)),
          clientId: advisory.id,
        }]
        void clientRef.current.detect({
          frequencies: deeperPayload,
          source: 'donewellaudio-verify',
        }).catch(() => {})
      }

      delete notchVerifyTimersRef.current[clientId]
    }
  }, [advisories, autoSend, clientRef, state.lastPollTimestamp, state.rta, state.status])

  useEffect(() => {
    if (!state.lastAutoSendResult || state.lastAutoSendResult.type === 'geq') return

    const now = Date.now()
    for (const advisory of advisories) {
      if (
        !advisory.resolved &&
        advisory.id &&
        !notchVerifyTimersRef.current[advisory.id] &&
        advisory.confidence >= autoSendMinConfidence
      ) {
        notchVerifyTimersRef.current[advisory.id] = now
      }
    }
  }, [advisories, autoSendMinConfidence, state.lastAutoSendResult])

  useEffect(() => {
    if (autoSend === 'off' || !clientRef.current || state.status !== 'connected' || !state.pa2Connected) return
    if (!state.rta || state.rta.length < 31) return

    rtaHistoryRef.current.push([...state.rta])
    if (rtaHistoryRef.current.length > 50) rtaHistoryRef.current.shift()
    if (rtaHistoryRef.current.length < 10) return

    const now = Date.now()
    if (now - lastPreNotchRef.current < 5000) return

    const history = rtaHistoryRef.current
    const oldest = history[0]
    const newest = history[history.length - 1]

    for (const [bandNumber, preCutValue] of Object.entries(preNotchRollbackRef.current)) {
      const index = parseInt(bandNumber, 10) - 1
      if (index < 0 || index >= 31) continue

      const rise = newest[index] - oldest[index]
      if (rise <= 0) {
        void clientRef.current.setGEQBands({ [bandNumber]: preCutValue }).catch(() => {})
        delete preNotchRollbackRef.current[bandNumber]
      }
    }

    for (let index = 0; index < 31; index++) {
      const rise = newest[index] - oldest[index]
      if (rise <= 2 || newest[index] <= -50) continue

      const frequencyHz = PA2_RTA_FREQS[index]
      const hasAdvisory = advisories.some((advisory) =>
        !advisory.resolved &&
        Math.abs(1200 * Math.log2(advisory.trueFrequencyHz / frequencyHz)) < 200,
      )
      if (!hasAdvisory || !state.geq) continue

      const bandNumber = String(index + 1)
      const currentValue = state.geq.bands[bandNumber] ?? 0
      if (currentValue <= -6 || preNotchRollbackRef.current[bandNumber] !== undefined) continue

      preNotchRollbackRef.current[bandNumber] = currentValue
      void clientRef.current.setGEQBands({
        [bandNumber]: Math.max(-12, currentValue - 2),
      }).catch(() => {})
      lastPreNotchRef.current = now
      break
    }
  }, [advisories, autoSend, clientRef, state.geq, state.lastPollTimestamp, state.pa2Connected, state.rta, state.status])
}
