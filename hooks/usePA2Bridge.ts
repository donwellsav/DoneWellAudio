'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Advisory } from '@/types/advisory'
import type { PA2AutoSendMode, PA2BridgeState, PA2ConnectionConfig } from '@/types/pa2'
import { createPA2Client } from '@/lib/pa2/pa2Client'
import type { PA2Client } from '@/lib/pa2/pa2Client'
import {
  advisoriesToDetectPayload,
  advisoriesToGEQCorrections,
  mergeGEQCorrections,
} from '@/lib/pa2/advisoryBridge'
import { getEffectiveConfidenceThreshold } from '@/lib/pa2/pa2BridgeAutoSend'
import { usePA2Polling } from '@/hooks/pa2/usePA2Polling'
import { usePA2AutoSend } from '@/hooks/pa2/usePA2AutoSend'
import { usePA2NotchMaintenance } from '@/hooks/pa2/usePA2NotchMaintenance'

export interface UsePA2BridgeConfig extends PA2ConnectionConfig {
  readonly advisories?: readonly Advisory[]
  readonly autoSend?: PA2AutoSendMode
  readonly autoSendMinConfidence?: number
  readonly autoSendIntervalMs?: number
  readonly enabled?: boolean
  readonly panicMuteEnabled?: boolean
}

export interface UsePA2BridgeReturn extends PA2BridgeState {
  sendCorrections(): Promise<void>
  sendDetections(): Promise<void>
  flattenGEQ(): Promise<void>
  autoEQ(target?: number): Promise<void>
  sendAction(action: string, params?: Record<string, unknown>): Promise<void>
  clearNotches(): Promise<void>
  client: PA2Client | null
}

const INITIAL_STATE: PA2BridgeState = {
  status: 'disconnected',
  pa2Connected: false,
  lastPollTimestamp: 0,
  rta: new Array(31).fill(-90),
  geq: null,
  meters: null,
  mutes: null,
  error: null,
  notchSlotsUsed: 0,
  notchSlotsAvailable: 8,
  lastAutoSendResult: null,
  lastAutoSendError: null,
  autoSendDiag: null,
  effectiveConfidence: 0,
}

export function usePA2Bridge(config: UsePA2BridgeConfig): UsePA2BridgeReturn {
  const {
    baseUrl,
    apiKey,
    pollIntervalMs = 200,
    timeoutMs = 2000,
    advisories = [],
    autoSend = 'off',
    autoSendMinConfidence = 0.7,
    autoSendIntervalMs = 250,
    enabled = true,
    panicMuteEnabled = false,
  } = config

  const [state, setState] = useState<PA2BridgeState>(INITIAL_STATE)
  const [client, setClient] = useState<PA2Client | null>(null)
  const clientRef = useRef<PA2Client | null>(null)
  const mountedRef = useRef(true)
  const lastAutoSendRef = useRef(0)
  const appliedGEQRef = useRef<Record<string, number>>({})
  const companionThresholdRef = useRef(0)
  const sentPEQRef = useRef<Record<string, number>>({})

  useEffect(() => {
    if (!enabled || !baseUrl) {
      clientRef.current = null
      setClient(null)
      setState(INITIAL_STATE)
      appliedGEQRef.current = {}
      companionThresholdRef.current = 0
      sentPEQRef.current = {}
      lastAutoSendRef.current = 0
      return
    }

    clientRef.current = createPA2Client({ baseUrl, apiKey, timeoutMs })
    setClient(clientRef.current)
    setState((current) => ({
      ...current,
      status: 'connecting',
    }))

    return () => {
      clientRef.current = null
      setClient(null)
    }
  }, [apiKey, baseUrl, enabled, timeoutMs])

  useEffect(() => () => {
    mountedRef.current = false
  }, [])

  usePA2Polling({
    clientRef,
    enabled,
    baseUrl,
    pollIntervalMs,
    autoSendMinConfidence,
    companionThresholdRef,
    mountedRef,
    setState,
  })

  usePA2AutoSend({
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
  })

  usePA2NotchMaintenance({
    advisories,
    autoSend,
    autoSendMinConfidence,
    state,
    clientRef,
  })

  const sendCorrections = useCallback(async () => {
    const bridgeClient = clientRef.current
    if (!bridgeClient || !state.geq) return

    const corrections = advisoriesToGEQCorrections(
      advisories,
      getEffectiveConfidenceThreshold(autoSendMinConfidence, companionThresholdRef.current),
    )
    if (Object.keys(corrections).length === 0) return

    const merged = mergeGEQCorrections(state.geq.bands, corrections)
    await bridgeClient.setGEQBands(merged)
  }, [advisories, autoSendMinConfidence, state.geq])

  const sendDetections = useCallback(async () => {
    const bridgeClient = clientRef.current
    if (!bridgeClient) return

    const payload = advisoriesToDetectPayload(
      advisories,
      getEffectiveConfidenceThreshold(autoSendMinConfidence, companionThresholdRef.current),
    )
    if (payload.length === 0) return

    const response = await bridgeClient.detect({
      frequencies: payload,
      source: 'donewellaudio',
    })
    setState((current) => ({
      ...current,
      notchSlotsUsed: response.slots_used,
      notchSlotsAvailable: response.slots_available,
    }))
  }, [advisories, autoSendMinConfidence])

  const flattenGEQ = useCallback(async () => {
    await clientRef.current?.flattenGEQ()
  }, [])

  const autoEQ = useCallback(async (target?: number) => {
    await clientRef.current?.autoEQ({ target: target ?? -50 })
  }, [])

  const sendAction = useCallback(async (action: string, params?: Record<string, unknown>) => {
    await clientRef.current?.sendAction(action, params)
  }, [])

  const clearNotches = useCallback(async () => {
    await clientRef.current?.clearNotches()
    setState((current) => ({
      ...current,
      notchSlotsUsed: 0,
      notchSlotsAvailable: 8,
    }))
  }, [])

  return {
    ...state,
    sendCorrections,
    sendDetections,
    flattenGEQ,
    autoEQ,
    sendAction,
    clearNotches,
    client,
  }
}
