/**
 * CompanionBridge — HTTP client for sending EQ advisories to Bitfocus Companion.
 *
 * DoneWell Audio detects feedback and calculates EQ recommendations.
 * This bridge sends those recommendations to a Companion module instance,
 * which exposes them as variables for wiring to any mixer module.
 *
 * @see companion-module/src/main.ts for the receiving end
 */
import type { Advisory } from '@/types/advisory'

/** Subset of advisory data sent to Companion (no raw audio, no internal state) */
interface CompanionAdvisoryPayload {
  id: string
  trueFrequencyHz: number
  severity: string
  confidence: number
  peq: { type: string; hz: number; q: number; gainDb: number }
  geq: { bandHz: number; bandIndex: number; suggestedDb: number }
  pitch: { note: string; octave: number; cents: number; midi: number }
}

interface CompanionStatusResponse {
  ok: boolean
  pendingCount: number
}

interface SendResult {
  accepted: boolean
  reason?: string
  pendingCount?: number
  error?: string
}

/** Extract the minimal payload Companion needs from a full Advisory */
function toPayload(advisory: Advisory): CompanionAdvisoryPayload {
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

export class CompanionBridge {
  private baseUrl: string
  private instanceName: string
  private _connected = false
  private _lastError: string | null = null

  constructor(url: string, instanceName: string) {
    this.baseUrl = url.replace(/\/$/, '')
    this.instanceName = instanceName
  }

  get connected(): boolean {
    return this._connected
  }

  get lastError(): string | null {
    return this._lastError
  }

  /** Update connection parameters without creating a new instance */
  configure(url: string, instanceName: string): void {
    this.baseUrl = url.replace(/\/$/, '')
    this.instanceName = instanceName
    this._connected = false
    this._lastError = null
  }

  /** Build the endpoint URL for this module instance */
  private endpoint(path: string): string {
    return `${this.baseUrl}/instance/${this.instanceName}${path}`
  }

  /** Send an advisory to Companion */
  async sendAdvisory(advisory: Advisory): Promise<SendResult> {
    const payload = toPayload(advisory)

    try {
      const response = await fetch(this.endpoint('/advisory'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(2000),
      })

      this._connected = true
      this._lastError = null

      if (!response.ok) {
        const text = await response.text().catch(() => 'Unknown error')
        this._lastError = `HTTP ${response.status}: ${text}`
        return { accepted: false, error: this._lastError }
      }

      return (await response.json()) as SendResult
    } catch (err) {
      this._connected = false
      this._lastError =
        err instanceof Error ? err.message : 'Connection failed'
      return { accepted: false, error: this._lastError }
    }
  }

  /** Check if Companion module is reachable */
  async checkStatus(): Promise<CompanionStatusResponse | null> {
    try {
      const response = await fetch(this.endpoint('/status'), {
        signal: AbortSignal.timeout(2000),
      })

      if (!response.ok) {
        this._connected = false
        return null
      }

      this._connected = true
      this._lastError = null
      return (await response.json()) as CompanionStatusResponse
    } catch {
      this._connected = false
      this._lastError = 'Companion not reachable'
      return null
    }
  }
}

/** Singleton bridge instance — configured via settings */
let bridgeInstance: CompanionBridge | null = null

export function getCompanionBridge(
  url = 'http://localhost:8000',
  instanceName = 'donewell-audio',
): CompanionBridge {
  if (!bridgeInstance) {
    bridgeInstance = new CompanionBridge(url, instanceName)
  } else {
    bridgeInstance.configure(url, instanceName)
  }
  return bridgeInstance
}
