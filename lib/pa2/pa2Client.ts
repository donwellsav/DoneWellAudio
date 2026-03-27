/**
 * HTTP client for the dbx DriveRack PA2 Companion Module bridge.
 *
 * Communicates with the Companion module's HTTP API to:
 * - Poll live state (RTA, GEQ, meters, mutes)
 * - Send GEQ corrections (burst mode, <1ms on PA2)
 * - Submit feedback detections for auto-notching
 * - Trigger auto-EQ from RTA
 *
 * All methods are stateless — the hook (usePA2Bridge) manages state and polling.
 *
 * @example
 * ```ts
 * const client = createPA2Client({ baseUrl: 'http://localhost:8000/instance/pa2' })
 * const loop = await client.getLoop()
 * if (loop.connected) {
 *   await client.setGEQBands({ 12: -4, 18: -2 })
 * }
 * ```
 */

import type {
  PA2ConnectionConfig,
  PA2PingResponse,
  PA2LoopResponse,
  PA2RTAResponse,
  PA2GEQState,
  PA2MetersResponse,
  PA2TopologyResponse,
  PA2CommandResponse,
  PA2AutoEQRequest,
  PA2AutoEQResponse,
  PA2DetectRequest,
  PA2DetectResponse,
  PA2RecommendationsResponse,
} from '@/types/pa2'

// ═══ Internal Helpers ═══

interface FetchOptions {
  method?: string
  body?: string
  signal?: AbortSignal
}

// ═══ Client Interface ═══

export interface PA2Client {
  /** Health check — is the module running and connected to the PA2? */
  ping(): Promise<PA2PingResponse>

  /** Single-call loop — RTA + GEQ + meters + mutes + AFS. Main polling endpoint. */
  getLoop(signal?: AbortSignal): Promise<PA2LoopResponse>

  /** Live 31-band RTA spectrum from PA2 measurement mic */
  getRTA(signal?: AbortSignal): Promise<PA2RTAResponse>

  /** Current GEQ state (enabled, mode, all bands) */
  getGEQ(signal?: AbortSignal): Promise<PA2GEQState>

  /** All live level meters */
  getMeters(signal?: AbortSignal): Promise<PA2MetersResponse>

  /** Discovered module topology */
  getTopology(): Promise<PA2TopologyResponse>

  /** Set specific GEQ bands. Burst mode (<1ms). */
  setGEQBands(bands: Record<string, number>): Promise<PA2CommandResponse>

  /** Set all 31 GEQ bands from array. Burst mode. */
  setGEQArray(bands: readonly number[]): Promise<PA2CommandResponse>

  /** Flatten all GEQ bands to 0dB */
  flattenGEQ(): Promise<PA2CommandResponse>

  /** Auto-EQ: read RTA, compute inverse corrections, apply to GEQ */
  autoEQ(params?: PA2AutoEQRequest): Promise<PA2AutoEQResponse>

  /** Apply a complete target GEQ curve */
  applyCurve(curve: Record<string, number>): Promise<PA2CommandResponse>

  /** Send any action by name (same IDs as Stream Deck) */
  sendAction(action: string, params?: Record<string, unknown>): Promise<PA2CommandResponse>

  /** Submit feedback detection results for auto-notching */
  detect(request: PA2DetectRequest): Promise<PA2DetectResponse>

  /** Get pending notch recommendations + active notches */
  getRecommendations(): Promise<PA2RecommendationsResponse>

  /** Approve/reject pending notch recommendations */
  approve(approve: number[], reject: number[]): Promise<PA2CommandResponse>

  /** Clear all auto-placed notch filters */
  clearNotches(): Promise<PA2CommandResponse>
}

// ═══ Client Factory ═══

/**
 * Creates a PA2 HTTP client instance.
 *
 * @param config - Connection configuration
 * @returns Stateless client with methods for each API endpoint
 *
 * @remarks
 * All methods throw on network errors or non-200 responses.
 * Use AbortSignal for cancellation (e.g., when component unmounts during poll).
 * The client does NOT manage polling — that's the hook's job.
 */
export function createPA2Client(config: PA2ConnectionConfig): PA2Client {
  const { baseUrl, apiKey, timeoutMs = 2000 } = config

  async function request<T>(path: string, options?: FetchOptions): Promise<T> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
    const signal = options?.signal
      ? mergeAbortSignals(options.signal, controller.signal)
      : controller.signal

    // Strip trailing slash from baseUrl to avoid double-slash
    const cleanBase = baseUrl.replace(/\/+$/, '')

    // Use text/plain to prevent Companion from auto-parsing JSON body
    const headers: Record<string, string> = { 'Content-Type': 'text/plain' }
    if (apiKey) headers['X-Api-Key'] = apiKey

    try {
      const response = await fetch(`${cleanBase}/${path}`, {
        method: options?.method ?? 'GET',
        headers,
        body: options?.body,
        signal,
      })

      if (!response.ok) {
        const text = await response.text().catch(() => '')
        throw new PA2ClientError(
          `PA2 API ${path}: HTTP ${response.status}`,
          response.status,
          text,
        )
      }

      return (await response.json()) as T
    } finally {
      clearTimeout(timeoutId)
    }
  }

  function post<T>(path: string, body: unknown): Promise<T> {
    return request<T>(path, { method: 'POST', body: JSON.stringify(body) })
  }

  function del<T>(path: string): Promise<T> {
    return request<T>(path, { method: 'DELETE' })
  }

  return {
    ping: () => request<PA2PingResponse>('ping'),

    getLoop: (signal) => request<PA2LoopResponse>('loop', { signal }),

    getRTA: (signal) => request<PA2RTAResponse>('rta', { signal }),

    getGEQ: (signal) => request<PA2GEQState>('geq', { signal }),

    getMeters: (signal) => request<PA2MetersResponse>('meters', { signal }),

    getTopology: () => request<PA2TopologyResponse>('topology'),

    setGEQBands: (bands) => post<PA2CommandResponse>('geq', { bands }),

    setGEQArray: (bands) => post<PA2CommandResponse>('geq', { bands }),

    flattenGEQ: () => post<PA2CommandResponse>('geq', { flat: true }),

    autoEQ: (params) => post<PA2AutoEQResponse>('eq/auto', params ?? {}),

    applyCurve: (curve) => post<PA2CommandResponse>('eq/curve', { curve }),

    sendAction: (action, params) =>
      post<PA2CommandResponse>('command', { action, params: params ?? {} }),

    detect: (request) => post<PA2DetectResponse>('detect', request),

    getRecommendations: () => request<PA2RecommendationsResponse>('recommendations'),

    approve: (approve, reject) =>
      post<PA2CommandResponse>('approve', { approve, reject }),

    clearNotches: () => del<PA2CommandResponse>('notches'),
  }
}

// ═══ Error Class ═══

export class PA2ClientError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly responseBody: string,
  ) {
    super(message)
    this.name = 'PA2ClientError'
  }
}

// ═══ Abort Signal Merge ═══

/**
 * Merges two AbortSignals — the combined signal aborts when either input aborts.
 * Used to combine the caller's signal (component unmount) with the timeout signal.
 */
function mergeAbortSignals(a: AbortSignal, b: AbortSignal): AbortSignal {
  if (a.aborted) return a
  if (b.aborted) return b

  const controller = new AbortController()
  const onAbort = () => controller.abort()

  a.addEventListener('abort', onAbort, { once: true })
  b.addEventListener('abort', onAbort, { once: true })

  return controller.signal
}
