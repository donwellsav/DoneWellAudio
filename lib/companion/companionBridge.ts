/**
 * CompanionBridge — HTTP client for sending EQ advisories to Bitfocus Companion.
 *
 * Tries direct browser fetch first (works when Companion returns CORS headers).
 * Falls back to server-side proxy at /api/companion/proxy (works when running
 * the app locally but not from cloud deployments like Vercel).
 *
 * @see companion-module/src/main.ts for the receiving end
 * @see app/api/companion/proxy/route.ts for the server-side proxy
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

/**
 * Try direct fetch first, fall back to server-side proxy.
 * Direct works when Companion passes through CORS headers from our module.
 * Proxy works when running the app locally (same network as Companion).
 */
async function fetchWithFallback(
  targetUrl: string,
  options: RequestInit,
): Promise<Response> {
  // Try direct fetch first
  try {
    const response = await fetch(targetUrl, {
      ...options,
      signal: AbortSignal.timeout(3000),
    })
    return response
  } catch {
    // Direct fetch failed (likely CORS) — try proxy
  }

  // Fall back to server-side proxy
  const method = options.method ?? 'GET'
  let body: unknown = undefined
  if (options.body && typeof options.body === 'string') {
    try { body = JSON.parse(options.body) } catch { body = undefined }
  }

  return fetch('/api/companion/proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: targetUrl, method, body }),
    signal: AbortSignal.timeout(4000),
  })
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

  /** Build the Companion endpoint URL for this module instance */
  private endpoint(path: string): string {
    return `${this.baseUrl}/instance/${this.instanceName}${path}`
  }

  /** Send an advisory to Companion */
  async sendAdvisory(advisory: Advisory): Promise<SendResult> {
    const payload = toPayload(advisory)

    try {
      const response = await fetchWithFallback(this.endpoint('/advisory'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        this._connected = false
        this._lastError = `HTTP ${response.status}: ${(data as Record<string, string>).error ?? 'Unknown error'}`
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

  /** Check if Companion module is reachable */
  async checkStatus(): Promise<CompanionStatusResponse | null> {
    try {
      const response = await fetchWithFallback(this.endpoint('/status'), {
        method: 'GET',
      })

      if (!response.ok) {
        this._connected = false
        this._lastError = `HTTP ${response.status}`
        return null
      }

      const data = (await response.json()) as CompanionStatusResponse
      this._connected = data.ok === true
      this._lastError = this._connected ? null : 'Module not responding'
      return data
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
