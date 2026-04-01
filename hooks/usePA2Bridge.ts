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
} from '@/types/pa2'
import { createPA2Client, PA2ClientError } from '@/lib/pa2/pa2Client'
import type { PA2Client } from '@/lib/pa2/pa2Client'
import {
  advisoriesToGEQCorrections,
  advisoriesToDetectPayload,
  mergeGEQCorrections,
  advisoriesToHybridActions,
} from '@/lib/pa2/advisoryBridge'
import { runClosedLoopCycle } from '@/lib/pa2/closedLoopEQ'
import {
  loopRTAToArray,
  loopMetersToFull,
  crossValidateWithPA2RTA,
  filterNewOrWorsened,
  markPEQSent,
  PA2_RTA_FREQS,
} from '@/lib/pa2/pa2Utils'

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

  /** Trigger panic_mute on PA2 when a RUNAWAY advisory appears (default: false) */
  readonly panicMuteEnabled?: boolean
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
  lastAutoSendResult: null,
  lastAutoSendError: null,
  autoSendDiag: null,
  effectiveConfidence: 0,
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
    autoSendIntervalMs = 250,
    enabled = true,
    panicMuteEnabled = false,
  } = config

  const [state, setState] = useState<PA2BridgeState>(INITIAL_STATE)
  const clientRef = useRef<PA2Client | null>(null)
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastAutoSendRef = useRef<number>(0)
  const mountedRef = useRef(true)
  /** Track GEQ corrections already applied — prevents accumulation on repeated cycles */
  const appliedGEQRef = useRef<Record<string, number>>({})
  /** Companion's notch confidence threshold from /loop — used as floor for detect sends */
  const companionThresholdRef = useRef<number>(0)
  /** Track PEQ detections already sent — maps advisory ID to last-sent confidence.
   *  Re-send only if confidence increased by 10%+ (feedback worsening, needs deeper cut). */
  const sentPEQRef = useRef<Record<string, number>>({})

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

        // Capture Companion's confidence threshold so auto-send can pre-filter
        if (loop.notchConfidenceThreshold !== undefined) {
          companionThresholdRef.current = loop.notchConfidenceThreshold
        }

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
          lastAutoSendResult: s.lastAutoSendResult,
          lastAutoSendError: s.lastAutoSendError,
          autoSendDiag: s.autoSendDiag,
          effectiveConfidence: Math.max(autoSendMinConfidence, companionThresholdRef.current),
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
  }, [enabled, pollIntervalMs, baseUrl, apiKey, timeoutMs, autoSendMinConfidence])

  // ── Auto-send advisory forwarding ──

  // Helpers to track auto-send results in state
  const recordAutoSendSuccess = (type: 'geq' | 'peq' | 'both', count: number) => {
    if (!mountedRef.current) return
    setState((s) => ({ ...s, lastAutoSendResult: { timestamp: Date.now(), type, count }, lastAutoSendError: null }))
  }
  const recordAutoSendError = (err: unknown) => {
    if (!mountedRef.current) return
    const msg = err instanceof Error ? err.message : 'Unknown error'
    setState((s) => ({ ...s, lastAutoSendError: msg }))
  }

  useEffect(() => {
    if (autoSend === 'off' || !clientRef.current || state.status !== 'connected') return
    if (!state.pa2Connected) return // Don't send if PA2 hardware isn't connected

    // Compute diagnostics using the effective threshold (max of local + companion)
    const effectiveThreshold = Math.max(autoSendMinConfidence, companionThresholdRef.current)
    const total = advisories.length
    const active = advisories.filter(a => !a.resolved).length
    const aboveThreshold = advisories.filter(a => !a.resolved && a.confidence >= effectiveThreshold).length
    const diag = { total, aboveThreshold, active }

    if (total === 0) {
      setState(s => ({ ...s, autoSendDiag: null }))
      return
    }

    // Always update diagnostics
    setState(s => {
      const prev = s.autoSendDiag
      if (prev && prev.total === diag.total && prev.active === diag.active && prev.aboveThreshold === diag.aboveThreshold) return s
      return { ...s, autoSendDiag: diag }
    })

    if (aboveThreshold === 0) return

    const now = Date.now()
    if (now - lastAutoSendRef.current < autoSendIntervalMs) return
    lastAutoSendRef.current = now

    // Panic mute: if any advisory is RUNAWAY and panic is enabled, mute immediately
    if (panicMuteEnabled) {
      const hasRunaway = advisories.some(a => !a.resolved && a.severity === 'RUNAWAY')
      if (hasRunaway && clientRef.current) {
        clientRef.current.sendAction('panic_mute').catch(recordAutoSendError)
      }
    }

    // Content-aware gating: suppress auto-send during silence/very low input.
    // Prevents notching room noise or HVAC when no one is performing.
    if (state.meters) {
      const inputL = state.meters.input?.l ?? -120
      const inputR = state.meters.input?.r ?? -120
      const maxInput = Math.max(inputL, inputR)
      if (maxInput < -60) return // below -60dBFS = silence, don't auto-notch noise
    }

    // Dual-RTA cross-validation: adjust advisory confidence using PA2 RTA
    const xvAdvisories = advisories.map(adv => {
      if (adv.resolved) return adv
      const xvConf = crossValidateWithPA2RTA(adv.trueFrequencyHz, adv.confidence, state.rta)
      return xvConf !== adv.confidence ? { ...adv, confidence: xvConf } : adv
    })

    // Skip GEQ corrections if poll data is stale (older than 2 poll intervals)
    const geqFresh = state.lastPollTimestamp > 0 && (now - state.lastPollTimestamp) < pollIntervalMs * 2

    const client = clientRef.current

    if (autoSend === 'geq' && state.geq && geqFresh) {
      const corrections = advisoriesToGEQCorrections(xvAdvisories, autoSendMinConfidence)
      // Skip bands already applied at the same depth (prevents accumulation)
      const newCorrections: Record<string, number> = {}
      for (const [band, gain] of Object.entries(corrections)) {
        if (appliedGEQRef.current[band] !== gain) {
          newCorrections[band] = gain
        }
      }
      if (Object.keys(newCorrections).length > 0) {
        const merged = mergeGEQCorrections(state.geq.bands, newCorrections)
        client.setGEQBands(merged)
          .then(async () => {
            Object.assign(appliedGEQRef.current, newCorrections)
            recordAutoSendSuccess('geq', Object.keys(newCorrections).length)
            // Closed-loop verify: check if corrections were effective, deepen if not
            if (clientRef.current) {
              try {
                const { deepened } = await runClosedLoopCycle(clientRef.current, newCorrections, 2000)
                if (Object.keys(deepened).length > 0 && clientRef.current) {
                  const deepMerged = mergeGEQCorrections(state.geq?.bands ?? {}, deepened)
                  await clientRef.current.setGEQBands(deepMerged)
                  Object.assign(appliedGEQRef.current, deepened)
                }
              } catch { /* closed-loop is best-effort */ }
            }
          })
          .catch(recordAutoSendError)
      }
    } else if (autoSend === 'peq') {
      const effectiveThreshold = Math.max(autoSendMinConfidence, companionThresholdRef.current)
      const allPayload = advisoriesToDetectPayload(xvAdvisories, effectiveThreshold)
      const payload = filterNewOrWorsened(allPayload, sentPEQRef.current)
      if (payload.length > 0) {
        client.detect({ frequencies: payload, source: 'donewellaudio' })
          .then((res) => {
            if (mountedRef.current) {
              markPEQSent(payload, sentPEQRef.current)
              setState((s) => ({
                ...s,
                notchSlotsUsed: res.slots_used,
                notchSlotsAvailable: res.slots_available,
                lastAutoSendResult: { timestamp: Date.now(), type: 'peq', count: payload.length },
                lastAutoSendError: null,
              }))
            }
          })
          .catch(recordAutoSendError)
      }
    } else if (autoSend === 'hybrid') {
      const actions = advisoriesToHybridActions(xvAdvisories, Math.max(autoSendMinConfidence, companionThresholdRef.current))
      const geqCorrections: Record<string, number> = {}
      const peqPayloadRaw: { hz: number; confidence: number; type: 'feedback' | 'resonance'; q?: number; clientId?: string }[] = []

      for (const action of actions) {
        if (action.type === 'geq') {
          const band = String(action.bandOrFreq)
          const existing = geqCorrections[band]
          if (existing === undefined || action.gain < existing) {
            geqCorrections[band] = action.gain
          }
        } else {
          peqPayloadRaw.push({
            hz: action.bandOrFreq,
            confidence: action.confidence ?? 0.9,
            type: 'feedback',
            q: action.q,
            clientId: action.clientId,
          })
        }
      }
      const peqPayload = filterNewOrWorsened(peqPayloadRaw, sentPEQRef.current)

      const totalCount = Object.keys(geqCorrections).length + peqPayload.length
      if (Object.keys(geqCorrections).length > 0 && state.geq && geqFresh) {
        const merged = mergeGEQCorrections(state.geq.bands, geqCorrections)
        client.setGEQBands(merged)
          .then(() => recordAutoSendSuccess('both', totalCount))
          .catch(recordAutoSendError)
      }
      if (peqPayload.length > 0) {
        client.detect({ frequencies: peqPayload, source: 'donewellaudio' })
          .then(() => markPEQSent(peqPayload, sentPEQRef.current))
          .catch(recordAutoSendError)
      }
    } else if (autoSend === 'both') {
      // Partition advisories: narrow/urgent → PEQ only, broad → GEQ only.
      // This prevents double-cutting the same advisory via both paths.
      const actions = advisoriesToHybridActions(xvAdvisories, Math.max(autoSendMinConfidence, companionThresholdRef.current))
      const geqCorrections: Record<string, number> = {}
      const peqPayloadRaw: { hz: number; confidence: number; type: 'feedback' | 'resonance'; q?: number; clientId?: string }[] = []

      for (const action of actions) {
        if (action.type === 'geq') {
          const band = String(action.bandOrFreq)
          const existing = geqCorrections[band]
          if (existing === undefined || action.gain < existing) {
            geqCorrections[band] = action.gain
          }
        } else {
          peqPayloadRaw.push({
            hz: action.bandOrFreq,
            confidence: action.confidence ?? 0.9,
            type: 'feedback',
            q: action.q,
            clientId: action.clientId,
          })
        }
      }
      const peqPayload = filterNewOrWorsened(peqPayloadRaw, sentPEQRef.current)

      // Send GEQ corrections for broad advisories
      let geqCount = 0
      if (Object.keys(geqCorrections).length > 0 && state.geq) {
        const merged = mergeGEQCorrections(state.geq.bands, geqCorrections)
        geqCount = Object.keys(geqCorrections).length
        client.setGEQBands(merged).catch(recordAutoSendError)
      }
      // Send PEQ detections for narrow/urgent advisories
      if (peqPayload.length > 0) {
        client.detect({ frequencies: peqPayload, source: 'donewellaudio' })
          .then((res) => {
            if (!mountedRef.current) return
            markPEQSent(peqPayload, sentPEQRef.current)
            const placed = res.actions?.filter((a: { type: string }) => a.type === 'notch_placed').length ?? 0
            const skipped = res.actions?.filter((a: { type: string }) => a.type.startsWith('skipped')).length ?? 0
            if (placed > 0) {
              setState((s) => ({
                ...s,
                notchSlotsUsed: res.slots_used,
                notchSlotsAvailable: res.slots_available,
                lastAutoSendResult: { timestamp: Date.now(), type: 'both', count: placed + geqCount },
                lastAutoSendError: null,
              }))
            } else if (skipped > 0) {
              setState((s) => ({
                ...s,
                lastAutoSendError: `Companion skipped ${skipped} detection${skipped !== 1 ? 's' : ''} — lower confidence threshold in Companion module config`,
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
    autoSend,
    autoSendMinConfidence,
    autoSendIntervalMs,
    panicMuteEnabled,
    pollIntervalMs,
    state.status,
    state.geq,
    state.meters,
    state.pa2Connected,
    state.rta,
    state.lastPollTimestamp,
  ])

  // ── Auto-release notches when advisories resolve ──

  const releasedIdsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (autoSend === 'off' || !clientRef.current || state.status !== 'connected') return

    for (const adv of advisories) {
      if (adv.resolved && adv.id && !releasedIdsRef.current.has(adv.id)) {
        releasedIdsRef.current.add(adv.id)
        clientRef.current.releaseNotch(adv.id).catch(() => {
          // Best-effort — notch may not have been placed for this advisory
        })
      }
    }
  }, [advisories, autoSend, state.status])

  // ── PEQ notch effectiveness monitor ──
  // Check placed notches against PA2 RTA. If peak didn't drop after 3s, re-send with deeper cut.

  const notchVerifyTimersRef = useRef<Record<string, number>>({})

  useEffect(() => {
    if (autoSend === 'off' || !clientRef.current || state.status !== 'connected') return
    if (!state.rta || state.rta.length < 31) return

    const now = Date.now()
    for (const [clientId, placedAt] of Object.entries(notchVerifyTimersRef.current)) {
      if (now - placedAt < 3000) continue // wait 3s before verifying
      // Find the advisory for this clientId
      const adv = advisories.find(a => a.id === clientId && !a.resolved)
      if (!adv) { delete notchVerifyTimersRef.current[clientId]; continue }
      // Check PA2 RTA at this frequency
      const validated = crossValidateWithPA2RTA(adv.trueFrequencyHz, 1.0, state.rta)
      if (validated > 0.85) {
        // PA2 RTA still shows a peak — notch wasn't effective enough, re-send with boosted confidence
        const deeperPayload = [{
          hz: Math.round(adv.trueFrequencyHz),
          confidence: Math.min(1.0, adv.confidence + 0.2),
          type: 'feedback' as const,
          q: Math.min(16, Math.max(4, adv.qEstimate)),
          clientId: adv.id,
        }]
        clientRef.current?.detect({ frequencies: deeperPayload, source: 'donewellaudio-verify' }).catch(() => {})
      }
      delete notchVerifyTimersRef.current[clientId]
    }
  }, [advisories, autoSend, state.status, state.rta, state.lastPollTimestamp])

  // Track when notches are placed for verification timing
  useEffect(() => {
    if (state.lastAutoSendResult && state.lastAutoSendResult.type !== 'geq') {
      // After a PEQ send, mark all active advisory IDs for verification in 3s
      const now = Date.now()
      for (const adv of advisories) {
        if (!adv.resolved && adv.id && !notchVerifyTimersRef.current[adv.id] && adv.confidence >= autoSendMinConfidence) {
          notchVerifyTimersRef.current[adv.id] = now
        }
      }
    }
  }, [state.lastAutoSendResult, advisories, autoSendMinConfidence])

  // ── Predictive pre-notching: detect rising RTA bands before they become feedback ──

  const rtaHistoryRef = useRef<number[][]>([])
  const lastPreNotchRef = useRef<number>(0)

  useEffect(() => {
    if (autoSend === 'off' || !clientRef.current || state.status !== 'connected' || !state.pa2Connected) return
    if (!state.rta || state.rta.length < 31) return

    // Accumulate RTA snapshots (keep last 50 = ~10 seconds at 200ms polling)
    rtaHistoryRef.current.push([...state.rta])
    if (rtaHistoryRef.current.length > 50) rtaHistoryRef.current.shift()
    if (rtaHistoryRef.current.length < 10) return // need at least 2 seconds of data

    const now = Date.now()
    if (now - lastPreNotchRef.current < 5000) return // max one pre-notch every 5s

    // Check each band for rising trend (>2dB/10s = heading toward feedback)
    const history = rtaHistoryRef.current
    const oldest = history[0]
    const newest = history[history.length - 1]
    const GEQ_FREQS = PA2_RTA_FREQS

    for (let i = 0; i < 31; i++) {
      const rise = newest[i] - oldest[i]
      if (rise > 2 && newest[i] > -50) { // rising >2dB and above noise floor
        // Check this isn't already being handled by an active advisory
        const freqHz = GEQ_FREQS[i]
        const alreadyDetected = advisories.some(a =>
          !a.resolved && Math.abs(1200 * Math.log2(a.trueFrequencyHz / freqHz)) < 200
        )
        if (alreadyDetected) continue

        // Send preemptive shallow GEQ cut (-2dB) before it becomes real feedback
        if (state.geq) {
          const bandNum = String(i + 1)
          const current = state.geq.bands[bandNum] ?? 0
          if (current > -6) { // don't pre-notch if already cut
            clientRef.current.setGEQBands({ [bandNum]: Math.max(-12, current - 2) }).catch(() => {})
            lastPreNotchRef.current = now
            break // one pre-notch at a time
          }
        }
      }
    }
  }, [autoSend, state.status, state.pa2Connected, state.rta, state.geq, state.lastPollTimestamp, advisories])

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

    const payload = advisoriesToDetectPayload(advisories, Math.max(autoSendMinConfidence, companionThresholdRef.current))
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

