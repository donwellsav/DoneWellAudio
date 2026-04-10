/**
 * CompanionBridge — posts EQ advisories to a cloud relay.
 *
 * DoneWell posts to /api/companion/relay/[code] (same origin, no CORS).
 * The Companion module polls the same endpoint from the user's network.
 * Paired via a short code — no IP addresses or port config needed.
 *
 * @see app/api/companion/relay/[code]/route.ts for the relay endpoint
 * @see companion-module/src/main.ts for the polling side
 */
import type { Advisory } from '@/types/advisory'
import type { ModuleToAppMessage } from '@/types/companion'

interface SendResult {
  accepted: boolean
  pendingCount?: number
  error?: string
}

/** Extract the minimal payload Companion needs from a full Advisory */
function toPayload(advisory: Advisory) {
  return {
    id: advisory.id,
    trueFrequencyHz: advisory.trueFrequencyHz,
    severity: advisory.severity,
    confidence: advisory.confidence,
    peq: {
      type: advisory.advisory.peq.type,
      hz: advisory.advisory.peq.hz,
      q: advisory.advisory.peq.q,
      gainDb: advisory.advisory.peq.gainDb,
    },
    geq: {
      bandHz: advisory.advisory.geq.bandHz,
      bandIndex: advisory.advisory.geq.bandIndex,
      suggestedDb: advisory.advisory.geq.suggestedDb,
    },
    pitch: {
      note: advisory.advisory.pitch.note,
      octave: advisory.advisory.pitch.octave,
      cents: advisory.advisory.pitch.cents,
      midi: advisory.advisory.pitch.midi,
    },
  }
}

/** Generate a crypto-secure pairing code like "DWA-A1B2C3" (6 chars, ~1B combos) */
export function generatePairingCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no 0/O/1/I confusion
  // chars.length = 32 = 2^5, so % 32 has zero modulo bias with Uint32
  const randomValues = new Uint32Array(6)
  crypto.getRandomValues(randomValues)
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars[randomValues[i] % chars.length]
  }
  return `DWA-${code}`
}

export class CompanionBridge {
  private _pairingCode: string
  private _connected = false
  private _lastError: string | null = null

  constructor(pairingCode: string) {
    this._pairingCode = pairingCode
  }

  get pairingCode(): string {
    return this._pairingCode
  }

  get connected(): boolean {
    return this._connected
  }

  get lastError(): string | null {
    return this._lastError
  }

  /** Update pairing code */
  configure(pairingCode: string): void {
    this._pairingCode = pairingCode
    this._connected = false
    this._lastError = null
  }

  /** Relay endpoint URL (same origin — no CORS) */
  private relayUrl(): string {
    return `/api/companion/relay/${this._pairingCode}`
  }

  /** Send an advisory to the relay */
  async sendAdvisory(advisory: Advisory): Promise<SendResult> {
    const payload = toPayload(advisory)

    try {
      const response = await fetch(this.relayUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(3000),
      })

      if (!response.ok) {
        this._connected = false
        this._lastError = `HTTP ${response.status}`
        return { accepted: false, error: this._lastError }
      }

      this._connected = true
      this._lastError = null
      return (await response.json()) as SendResult
    } catch (err) {
      this._connected = false
      this._lastError =
        err instanceof Error ? err.message : 'Connection failed'
      return { accepted: false, error: this._lastError }
    }
  }

  /** Notify relay that an advisory was resolved (feedback stopped) */
  async sendResolve(advisoryId: string): Promise<boolean> {
    try {
      await fetch(this.relayUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'resolve', advisoryId }),
        signal: AbortSignal.timeout(3000),
      })
      return true
    } catch (err) {
      this._connected = false
      this._lastError = err instanceof Error ? err.message : 'Resolve failed'
      return false
    }
  }

  /** Notify relay that an advisory was dismissed by the user */
  async sendDismiss(advisoryId: string): Promise<boolean> {
    try {
      await fetch(this.relayUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'dismiss', advisoryId }),
        signal: AbortSignal.timeout(3000),
      })
      return true
    } catch (err) {
      this._connected = false
      this._lastError = err instanceof Error ? err.message : 'Dismiss failed'
      return false
    }
  }

  /** Notify relay of a mode change so Companion can reconfigure the mixer */
  async sendModeChange(mode: string): Promise<boolean> {
    try {
      await fetch(this.relayUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'mode_change', mode }),
        signal: AbortSignal.timeout(3000),
      })
      return true
    } catch (err) {
      this._connected = false
      this._lastError = err instanceof Error ? err.message : 'Mode change failed'
      return false
    }
  }

  /**
   * Send an auto-apply directive for a RUNAWAY advisory.
   * The module will apply the EQ cut immediately, regardless of its autoApply config.
   */
  async sendAutoApply(advisory: Advisory): Promise<SendResult> {
    const payload = { type: 'auto_apply' as const, ...toPayload(advisory) }

    try {
      const response = await fetch(this.relayUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(3000),
      })

      if (!response.ok) {
        this._connected = false
        this._lastError = `HTTP ${response.status}`
        return { accepted: false, error: this._lastError }
      }

      this._connected = true
      this._lastError = null
      return (await response.json()) as SendResult
    } catch (err) {
      this._connected = false
      this._lastError = err instanceof Error ? err.message : 'Auto-apply failed'
      return { accepted: false, error: this._lastError }
    }
  }

  /**
   * Drain the module → app queue. Called by useCompanionInbound on a polling loop.
   * Returns an empty array on error (caller decides retry cadence).
   */
  async pollInbound(): Promise<ModuleToAppMessage[]> {
    try {
      const response = await fetch(`${this.relayUrl()}?direction=app`, {
        signal: AbortSignal.timeout(3000),
      })

      if (!response.ok) {
        this._connected = false
        this._lastError = `HTTP ${response.status}`
        return []
      }

      this._connected = true
      this._lastError = null
      const data = await response.json() as { ok: boolean; messages: ModuleToAppMessage[]; pendingCount: number }
      return Array.isArray(data.messages) ? data.messages : []
    } catch (err) {
      this._connected = false
      this._lastError = err instanceof Error ? err.message : 'Poll failed'
      return []
    }
  }

  /**
   * Check if the relay is reachable without draining any queue.
   * Uses HEAD request so no advisory data is consumed.
   */
  async checkStatus(): Promise<{ ok: boolean } | null> {
    try {
      const response = await fetch(this.relayUrl(), {
        method: 'HEAD',
        signal: AbortSignal.timeout(3000),
      })

      if (!response.ok) {
        this._connected = false
        this._lastError = `HTTP ${response.status}`
        return null
      }

      this._connected = true
      this._lastError = null
      return { ok: true }
    } catch {
      this._connected = false
      this._lastError = 'Relay not reachable'
      return null
    }
  }
}

/** Bridge instances cached by pairing code — prevents cross-code message routing */
const bridgeCache = new Map<string, CompanionBridge>()

export function getCompanionBridge(pairingCode: string): CompanionBridge {
  let bridge = bridgeCache.get(pairingCode)
  if (!bridge) {
    bridge = new CompanionBridge(pairingCode)
    bridgeCache.set(pairingCode, bridge)
  }
  return bridge
}
