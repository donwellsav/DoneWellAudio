/**
 * React hook for the DoneWellAudio ↔ PA2 Companion Module bridge.
 *
 * Manages the polling loop, state synchronization, and advisory forwarding
 * between DoneWellAudio's real-time analysis and the PA2's processing chain.
 *
 * Architecture:
 * ```
 * DoneWellAudio (browser)
 *   ├─ useAudioAnalyzer() → advisories (50fps DSP)
 *   └─ usePA2Bridge() → polls Companion (5Hz)
 *        ├─ GET /loop → RTA + GEQ + meters
 *        ├─ POST /geq → send corrections (burst, <1ms)
 *        └─ POST /detect → send feedback detections (PEQ notch)
 * ```
 *
 * @example
 * ```tsx
 * function PA2Panel() {
 *   const { status, rta, geq, meters, sendCorrections } = usePA2Bridge({
 *     baseUrl: 'http://localhost:8000/instance/pa2',
 *     advisories,
 *     autoSend: false,
 *   })
 *   return <div>PA2: {status} | Peak: {rta.peak}Hz</div>
 * }
 * ```
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Advisory } from '@/types/advisory'
import type {
  PA2ConnectionConfig,
  PA2BridgeState,
  PA2LoopResponse,
  PA2MetersResponse,
} from '@/types/pa2'
import { createPA2Client, PA2ClientError } from '@/lib/pa2/pa2Client'
import type { PA2Client } from '@/lib/pa2/pa2Client'
import {
  advisoriesToGEQCorrections,
  advisoriesToDetectPayload,
  mergeGEQCorrections,
  advisoriesToHybridActions,
} from '@/lib/pa2/advisoryBridge'

// ═══ Hook Config ═══

export interface UsePA2BridgeConfig extends PA2ConnectionConfig {
  /** Live advisories from DoneWellAudio's detection pipeline */
  readonly advisories?: readonly Advisory[]

  /**
   * Auto-send mode:
   * - 'off' — Manual only. Call sendCorrections() yourself.
   * - 'both' — GEQ for broad curve + PEQ for surgical notches (recommended).
   * - 'geq' — Auto-forward advisories as GEQ corrections only.
   * - 'peq' — Auto-forward advisories as PEQ detect payloads only.
   * - 'hybrid' — Use GEQ for broad issues, PEQ for narrow feedback (per advisory).
   *
   * Default: 'off'
   */
  readonly autoSend?: 'off' | 'geq' | 'peq' | 'hybrid' | 'both'

  /** Minimum confidence to auto-send (default: 0.7) */
  readonly autoSendMinConfidence?: number

  /** Minimum interval between auto-sends in ms (default: 1000) */
  readonly autoSendIntervalMs?: number

  /** Enable bridge (default: true). Set false to disable without unmounting. */
  readonly enabled?: boolean
}

// ═══ Hook Return ═══

export interface UsePA2BridgeReturn extends PA2BridgeState {
  /** Send GEQ corrections derived from current advisories */
  sendCorrections(): Promise<void>

  /** Send advisories as PEQ detect payloads */
  sendDetections(): Promise<void>

  /** Flatten all GEQ bands to 0dB */
  flattenGEQ(): Promise<void>

  /** Trigger auto-EQ from PA2's own RTA mic */
  autoEQ(target?: number): Promise<void>

  /** Send any action to PA2 */
  sendAction(action: string, params?: Record<string, unknown>): Promise<void>

  /** Clear all auto-placed notch filters */
  clearNotches(): Promise<void>

  /** The PA2 client instance (for advanced use) */
  client: PA2Client | null
}

// ═══ Initial State ═══

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
}

// ═══ Hook ═══

export function usePA2Bridge(config: UsePA2BridgeConfig): UsePA2BridgeReturn {
  const {
    baseUrl,
    apiKey,
    pollIntervalMs = 200,
    timeoutMs = 2000,
    advisories = [],
    autoSend = 'off',
    autoSendMinConfidence = 0.7,
    autoSendIntervalMs = 1000,
    enabled = true,
  } = config

  const [state, setState] = useState<PA2BridgeState>(INITIAL_STATE)
  const clientRef = useRef<PA2Client | null>(null)
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastAutoSendRef = useRef<number>(0)
  const mountedRef = useRef(true)

  // ── Client lifecycle ──

  useEffect(() => {
    if (!enabled || !baseUrl) {
      clientRef.current = null
      setState(INITIAL_STATE)
      return
    }

    clientRef.current = createPA2Client({ baseUrl, apiKey, timeoutMs })
    setState((s) => ({ ...s, status: 'connecting' }))

    return () => {
      clientRef.current = null
    }
  }, [baseUrl, apiKey, timeoutMs, enabled])

  // ── Polling loop ──

  useEffect(() => {
    mountedRef.current = true

    if (!clientRef.current || !enabled) return

    const client = clientRef.current
    let abortController: AbortController | null = null

    async function poll() {
      if (!mountedRef.current || !client) return

      abortController = new AbortController()
      try {
        const loop = await client.getLoop(abortController.signal)
        if (!mountedRef.current) return

        const rtaArray = loopRTAToArray(loop)

        setState((s) => ({
          status: 'connected',
          pa2Connected: loop.connected,
          lastPollTimestamp: loop.timestamp,
          rta: rtaArray,
          geq: loop.geq,
          meters: loopMetersToFull(loop),
          mutes: loop.mutes,
          error: null,
          notchSlotsUsed: s.notchSlotsUsed,
          notchSlotsAvailable: s.notchSlotsAvailable,
        }))
      } catch (err) {
        if (!mountedRef.current) return
        // Only ignore aborts from component unmount, not from timeouts
        if (err instanceof DOMException && err.name === 'AbortError' && !mountedRef.current) return

        let message = err instanceof PA2ClientError
          ? `HTTP ${err.statusCode}: ${err.message}`
          : err instanceof Error ? err.message : 'Unknown error'

        // Detect mixed content (HTTPS page → HTTP companion)
        if (
          message === 'Failed to fetch' &&
          typeof window !== 'undefined' &&
          window.location.protocol === 'https:' &&
          baseUrl.startsWith('http://')
        ) {
          message = 'Mixed content blocked — HTTPS sites cannot reach HTTP Companion. Use localhost or enable HTTPS on Companion.'
        }

        setState((s) => ({
          ...s,
          status: 'error',
          error: message,
        }))
      }
    }

    // Initial poll
    poll()

    // Start interval
    pollTimerRef.current = setInterval(poll, pollIntervalMs)

    return () => {
      mountedRef.current = false
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
      if (abortController) abortController.abort()
    }
  }, [enabled, pollIntervalMs, baseUrl, apiKey, timeoutMs])

  // ── Auto-send advisory forwarding ──

  useEffect(() => {
    if (autoSend === 'off' || !clientRef.current || state.status !== 'connected') return
    if (advisories.length === 0) return

    const now = Date.now()
    if (now - lastAutoSendRef.current < autoSendIntervalMs) return
    lastAutoSendRef.current = now

    const client = clientRef.current

    if (autoSend === 'geq' && state.geq) {
      const corrections = advisoriesToGEQCorrections(advisories, autoSendMinConfidence)
      if (Object.keys(corrections).length > 0) {
        const merged = mergeGEQCorrections(state.geq.bands, corrections)
        client.setGEQBands(merged).catch(console.error)
      }
    } else if (autoSend === 'peq') {
      const payload = advisoriesToDetectPayload(advisories, autoSendMinConfidence)
      if (payload.length > 0) {
        client.detect({ frequencies: payload, source: 'donewellaudio' })
          .then((res) => {
            if (mountedRef.current) {
              setState((s) => ({
                ...s,
                notchSlotsUsed: res.slots_used,
                notchSlotsAvailable: res.slots_available,
              }))
            }
          })
          .catch(console.error)
      }
    } else if (autoSend === 'hybrid') {
      const actions = advisoriesToHybridActions(advisories, autoSendMinConfidence)
      const geqCorrections: Record<string, number> = {}
      const peqPayload: { hz: number; magnitude?: number; confidence: number; type: 'feedback' | 'resonance' }[] = []

      for (const action of actions) {
        if (action.type === 'geq') {
          const band = String(action.bandOrFreq)
          const existing = geqCorrections[band]
          if (existing === undefined || action.gain < existing) {
            geqCorrections[band] = action.gain
          }
        } else {
          peqPayload.push({
            hz: action.bandOrFreq,
            confidence: 0.9,
            type: 'feedback',
          })
        }
      }

      if (Object.keys(geqCorrections).length > 0 && state.geq) {
        const merged = mergeGEQCorrections(state.geq.bands, geqCorrections)
        client.setGEQBands(merged).catch(console.error)
      }
      if (peqPayload.length > 0) {
        client.detect({ frequencies: peqPayload, source: 'donewellaudio' }).catch(console.error)
      }
    } else if (autoSend === 'both') {
      // GEQ for the broad room curve
      if (state.geq) {
        const corrections = advisoriesToGEQCorrections(advisories, autoSendMinConfidence)
        if (Object.keys(corrections).length > 0) {
          const merged = mergeGEQCorrections(state.geq.bands, corrections)
          client.setGEQBands(merged).catch(console.error)
        }
      }
      // PEQ for surgical feedback notches
      const payload = advisoriesToDetectPayload(advisories, autoSendMinConfidence)
      if (payload.length > 0) {
        client.detect({ frequencies: payload, source: 'donewellaudio' })
          .then((res) => {
            if (mountedRef.current) {
              setState((s) => ({
                ...s,
                notchSlotsUsed: res.slots_used,
                notchSlotsAvailable: res.slots_available,
              }))
            }
          })
          .catch(console.error)
      }
    }
  }, [advisories, autoSend, autoSendMinConfidence, autoSendIntervalMs, state.status, state.geq])

  // ── Imperative methods ──

  const sendCorrections = useCallback(async () => {
    const client = clientRef.current
    if (!client || !state.geq) return

    const corrections = advisoriesToGEQCorrections(advisories, autoSendMinConfidence)
    if (Object.keys(corrections).length === 0) return

    const merged = mergeGEQCorrections(state.geq.bands, corrections)
    await client.setGEQBands(merged)
  }, [advisories, autoSendMinConfidence, state.geq])

  const sendDetections = useCallback(async () => {
    const client = clientRef.current
    if (!client) return

    const payload = advisoriesToDetectPayload(advisories, autoSendMinConfidence)
    if (payload.length === 0) return

    const res = await client.detect({ frequencies: payload, source: 'donewellaudio' })
    setState((s) => ({
      ...s,
      notchSlotsUsed: res.slots_used,
      notchSlotsAvailable: res.slots_available,
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
    setState((s) => ({ ...s, notchSlotsUsed: 0, notchSlotsAvailable: 8 }))
  }, [])

  return {
    ...state,
    sendCorrections,
    sendDetections,
    flattenGEQ,
    autoEQ,
    sendAction,
    clearNotches,
    client: clientRef.current,
  }
}

// ═══ Helpers ═══

/** Convert /loop RTA object (freq keys) to sorted array of 31 values */
function loopRTAToArray(loop: PA2LoopResponse): number[] {
  const arr = new Array(31).fill(-90)
  const freqs = [20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000, 20000]
  for (let i = 0; i < freqs.length; i++) {
    const val = loop.rta[String(freqs[i])]
    if (val !== undefined) arr[i] = val
  }
  return arr
}

/** Reshape /loop meters to full PA2MetersResponse format */
function loopMetersToFull(loop: PA2LoopResponse): PA2MetersResponse {
  return {
    input: loop.meters.input,
    output: loop.meters.output,
    compressor: { input: 0, gr: loop.meters.comp_gr },
    limiter: { input: 0, gr: loop.meters.lim_gr },
    timestamp: loop.timestamp,
  }
}
