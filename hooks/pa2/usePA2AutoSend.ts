'use client'

import { useCallback, useEffect } from 'react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { Advisory } from '@/types/advisory'
import type { PA2AutoSendMode, PA2BridgeState } from '@/types/pa2'
import type { PA2Client } from '@/lib/pa2/pa2Client'
import {
  advisoriesToDetectPayload,
  advisoriesToGEQCorrections,
  advisoriesToHybridActions,
  mergeGEQCorrections,
} from '@/lib/pa2/advisoryBridge'
import { runClosedLoopCycle } from '@/lib/pa2/closedLoopEQ'
import { filterNewOrWorsened, markPEQSent } from '@/lib/pa2/pa2Utils'
import {
  buildAutoSendDiag,
  crossValidateAdvisories,
  dedupeGEQCorrections,
  getEffectiveConfidenceThreshold,
  shouldSkipAutoSendForSilence,
  splitHybridActions,
} from '@/lib/pa2/pa2BridgeAutoSend'

interface UsePA2AutoSendParams {
  advisories: readonly Advisory[]
  autoSend: PA2AutoSendMode
  autoSendMinConfidence: number
  autoSendIntervalMs: number
  panicMuteEnabled: boolean
  pollIntervalMs: number
  state: PA2BridgeState
  clientRef: MutableRefObject<PA2Client | null>
  mountedRef: MutableRefObject<boolean>
  companionThresholdRef: MutableRefObject<number>
  appliedGEQRef: MutableRefObject<Record<string, number>>
  sentPEQRef: MutableRefObject<Record<string, number>>
  lastAutoSendRef: MutableRefObject<number>
  setState: Dispatch<SetStateAction<PA2BridgeState>>
}

export function usePA2AutoSend({
  advisories,
  autoSend,
  autoSendMinConfidence,
  autoSendIntervalMs,
  panicMuteEnabled,
  pollIntervalMs,
  state,
  clientRef,
  mountedRef,
  companionThresholdRef,
  appliedGEQRef,
  sentPEQRef,
  lastAutoSendRef,
  setState,
}: UsePA2AutoSendParams) {
  const recordAutoSendSuccess = useCallback((type: 'geq' | 'peq' | 'both', count: number) => {
    if (!mountedRef.current) return

    setState((current) => ({
      ...current,
      lastAutoSendResult: { timestamp: Date.now(), type, count },
      lastAutoSendError: null,
    }))
  }, [mountedRef, setState])

  const recordAutoSendError = useCallback((error: unknown) => {
    if (!mountedRef.current) return

    const message = error instanceof Error ? error.message : 'Unknown error'
    setState((current) => ({
      ...current,
      lastAutoSendError: message,
    }))
  }, [mountedRef, setState])

  useEffect(() => {
    if (autoSend === 'off' || state.status !== 'connected' || !state.pa2Connected) return

    const client = clientRef.current
    if (!client) return

    const effectiveThreshold = getEffectiveConfidenceThreshold(
      autoSendMinConfidence,
      companionThresholdRef.current,
    )
    const diagnostics = buildAutoSendDiag(advisories, effectiveThreshold)

    if (diagnostics.total === 0) {
      setState((current) => current.autoSendDiag === null ? current : { ...current, autoSendDiag: null })
      return
    }

    setState((current) => {
      const previous = current.autoSendDiag
      if (
        previous &&
        previous.total === diagnostics.total &&
        previous.active === diagnostics.active &&
        previous.aboveThreshold === diagnostics.aboveThreshold
      ) {
        return current
      }

      return {
        ...current,
        autoSendDiag: diagnostics,
      }
    })

    if (diagnostics.aboveThreshold === 0) return

    const now = Date.now()
    if (now - lastAutoSendRef.current < autoSendIntervalMs) return
    lastAutoSendRef.current = now

    if (panicMuteEnabled) {
      const hasRunaway = advisories.some((advisory) => !advisory.resolved && advisory.severity === 'RUNAWAY')
      if (hasRunaway) {
        void client.sendAction('panic_mute').catch(recordAutoSendError)
      }
    }

    if (shouldSkipAutoSendForSilence(state.meters)) return

    const crossValidatedAdvisories = crossValidateAdvisories(advisories, state.rta)
    const geqFresh =
      state.lastPollTimestamp > 0 &&
      now - state.lastPollTimestamp < pollIntervalMs * 2

    if (autoSend === 'geq' && state.geq && geqFresh) {
      const corrections = advisoriesToGEQCorrections(crossValidatedAdvisories, effectiveThreshold)
      const nextCorrections = dedupeGEQCorrections(appliedGEQRef.current, corrections)
      if (Object.keys(nextCorrections).length === 0) return

      const merged = mergeGEQCorrections(state.geq.bands, nextCorrections)
      void client.setGEQBands(merged)
        .then(async () => {
          Object.assign(appliedGEQRef.current, nextCorrections)
          recordAutoSendSuccess('geq', Object.keys(nextCorrections).length)

          try {
            const bridgeClient = clientRef.current
            if (!bridgeClient) return

            const { deepened } = await runClosedLoopCycle(bridgeClient, nextCorrections, 2000)
            if (Object.keys(deepened).length === 0) return

            const latestGeq = await bridgeClient.getGEQ().catch(() => state.geq)
            const deepMerged = mergeGEQCorrections(latestGeq?.bands ?? {}, deepened)
            await bridgeClient.setGEQBands(deepMerged)
            Object.assign(appliedGEQRef.current, deepened)
          } catch {
            // Closed-loop follow-up is best effort.
          }
        })
        .catch(recordAutoSendError)
      return
    }

    if (autoSend === 'peq') {
      const payload = filterNewOrWorsened(
        advisoriesToDetectPayload(crossValidatedAdvisories, effectiveThreshold),
        sentPEQRef.current,
      )
      if (payload.length === 0) return

      void client.detect({ frequencies: payload, source: 'donewellaudio' })
        .then((response) => {
          if (!mountedRef.current) return

          markPEQSent(payload, sentPEQRef.current)
          setState((current) => ({
            ...current,
            notchSlotsUsed: response.slots_used,
            notchSlotsAvailable: response.slots_available,
            lastAutoSendResult: { timestamp: Date.now(), type: 'peq', count: payload.length },
            lastAutoSendError: null,
          }))
        })
        .catch(recordAutoSendError)
      return
    }

    if (autoSend === 'hybrid') {
      const actions = advisoriesToHybridActions(crossValidatedAdvisories, effectiveThreshold)
      const { geqCorrections, peqPayloadRaw } = splitHybridActions(actions)
      const peqPayload = filterNewOrWorsened(peqPayloadRaw, sentPEQRef.current)
      const nextGEQ = dedupeGEQCorrections(appliedGEQRef.current, geqCorrections)
      const totalCount = Object.keys(nextGEQ).length + peqPayload.length

      if (Object.keys(nextGEQ).length > 0 && state.geq && geqFresh) {
        const merged = mergeGEQCorrections(state.geq.bands, nextGEQ)
        void client.setGEQBands(merged)
          .then(() => {
            Object.assign(appliedGEQRef.current, nextGEQ)
            recordAutoSendSuccess('both', totalCount)
          })
          .catch(recordAutoSendError)
      }

      if (peqPayload.length > 0) {
        void client.detect({ frequencies: peqPayload, source: 'donewellaudio' })
          .then(() => {
            markPEQSent(peqPayload, sentPEQRef.current)
          })
          .catch(recordAutoSendError)
      }
      return
    }

    if (autoSend === 'both') {
      const actions = advisoriesToHybridActions(crossValidatedAdvisories, effectiveThreshold)
      const { geqCorrections, peqPayloadRaw } = splitHybridActions(actions)
      const peqPayload = filterNewOrWorsened(peqPayloadRaw, sentPEQRef.current)
      const nextGEQ = dedupeGEQCorrections(appliedGEQRef.current, geqCorrections)

      let geqCount = 0
      if (Object.keys(nextGEQ).length > 0 && state.geq && geqFresh) {
        const merged = mergeGEQCorrections(state.geq.bands, nextGEQ)
        geqCount = Object.keys(nextGEQ).length
        void client.setGEQBands(merged)
          .then(() => {
            Object.assign(appliedGEQRef.current, nextGEQ)
          })
          .catch(recordAutoSendError)
      }

      if (peqPayload.length > 0) {
        void client.detect({ frequencies: peqPayload, source: 'donewellaudio' })
          .then((response) => {
            if (!mountedRef.current) return

            markPEQSent(peqPayload, sentPEQRef.current)
            const placed = response.actions?.filter((action) => action.type === 'notch_placed').length ?? 0
            const skipped = response.actions?.filter((action) => action.type.startsWith('skipped')).length ?? 0

            if (placed > 0) {
              setState((current) => ({
                ...current,
                notchSlotsUsed: response.slots_used,
                notchSlotsAvailable: response.slots_available,
                lastAutoSendResult: { timestamp: Date.now(), type: 'both', count: placed + geqCount },
                lastAutoSendError: null,
              }))
            } else if (skipped > 0) {
              setState((current) => ({
                ...current,
                lastAutoSendError: `Companion skipped ${skipped} detection${skipped !== 1 ? 's' : ''} - lower confidence threshold in Companion module config`,
              }))
            } else {
              recordAutoSendSuccess('both', geqCount + peqPayload.length)
            }
          })
          .catch(recordAutoSendError)
      } else if (geqCount > 0) {
        recordAutoSendSuccess('geq', geqCount)
      }
    }
  }, [
    advisories,
    appliedGEQRef,
    autoSend,
    autoSendIntervalMs,
    autoSendMinConfidence,
    clientRef,
    companionThresholdRef,
    lastAutoSendRef,
    mountedRef,
    panicMuteEnabled,
    pollIntervalMs,
    recordAutoSendError,
    recordAutoSendSuccess,
    sentPEQRef,
    setState,
    state,
  ])
}
