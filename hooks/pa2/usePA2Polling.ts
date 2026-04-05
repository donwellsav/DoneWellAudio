'use client'

import { useEffect } from 'react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { PA2BridgeState } from '@/types/pa2'
import type { PA2Client } from '@/lib/pa2/pa2Client'
import { PA2ClientError } from '@/lib/pa2/pa2Client'
import { loopMetersToFull, loopRTAToArray } from '@/lib/pa2/pa2Utils'
import { getEffectiveConfidenceThreshold } from '@/lib/pa2/pa2BridgeAutoSend'

interface UsePA2PollingParams {
  clientRef: MutableRefObject<PA2Client | null>
  enabled: boolean
  baseUrl: string
  pollIntervalMs: number
  autoSendMinConfidence: number
  companionThresholdRef: MutableRefObject<number>
  mountedRef: MutableRefObject<boolean>
  setState: Dispatch<SetStateAction<PA2BridgeState>>
}

export function usePA2Polling({
  clientRef,
  enabled,
  baseUrl,
  pollIntervalMs,
  autoSendMinConfidence,
  companionThresholdRef,
  mountedRef,
  setState,
}: UsePA2PollingParams) {
  useEffect(() => {
    mountedRef.current = true

    if (!clientRef.current || !enabled) return

    const client = clientRef.current
    let abortController: AbortController | null = null
    let pollTimerId: ReturnType<typeof setInterval> | null = null

    async function poll() {
      if (!mountedRef.current) return

      abortController = new AbortController()

      try {
        const loop = await client.getLoop(abortController.signal)
        if (!mountedRef.current) return

        if (loop.notchConfidenceThreshold !== undefined) {
          companionThresholdRef.current = loop.notchConfidenceThreshold
        }

        setState((current) => ({
          status: 'connected',
          pa2Connected: loop.connected,
          lastPollTimestamp: loop.timestamp,
          rta: loopRTAToArray(loop),
          geq: loop.geq,
          meters: loopMetersToFull(loop),
          mutes: loop.mutes,
          error: null,
          notchSlotsUsed: current.notchSlotsUsed,
          notchSlotsAvailable: current.notchSlotsAvailable,
          lastAutoSendResult: current.lastAutoSendResult,
          lastAutoSendError: current.lastAutoSendError,
          autoSendDiag: current.autoSendDiag,
          effectiveConfidence: getEffectiveConfidenceThreshold(
            autoSendMinConfidence,
            companionThresholdRef.current,
          ),
        }))
      } catch (error) {
        if (!mountedRef.current) return
        if (error instanceof DOMException && error.name === 'AbortError' && !mountedRef.current) return

        let message = error instanceof PA2ClientError
          ? `HTTP ${error.statusCode}: ${error.message}`
          : error instanceof Error
            ? error.message
            : 'Unknown error'

        if (
          message === 'Failed to fetch' &&
          typeof window !== 'undefined' &&
          window.location.protocol === 'https:' &&
          baseUrl.startsWith('http://')
        ) {
          message = 'Mixed content blocked - HTTPS sites cannot reach HTTP Companion. Use localhost or enable HTTPS on Companion.'
        }

        setState((current) => ({
          ...current,
          status: 'error',
          error: message,
        }))
      }
    }

    void poll()
    pollTimerId = setInterval(() => {
      void poll()
    }, pollIntervalMs)

    return () => {
      mountedRef.current = false
      if (pollTimerId) clearInterval(pollTimerId)
      if (abortController) abortController.abort()
    }
  }, [
    autoSendMinConfidence,
    baseUrl,
    clientRef,
    companionThresholdRef,
    enabled,
    mountedRef,
    pollIntervalMs,
    setState,
  ])
}
