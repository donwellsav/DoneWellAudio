/**
 * Type definitions for the dbx DriveRack PA2 Companion Module HTTP API.
 *
 * These types mirror the JSON responses from the Companion module's HTTP bridge
 * running on port 8000 (default). The module maintains two TCP connections to
 * the PA2: port 19272 for control, port 19274 for DSP meters (RTA, levels, GR).
 *
 * @see docs/HTTP-API.md in companion-module-dbx-driverack-pa2
 */

// ═══ Connection & Config ═══

export interface PA2ConnectionConfig {
  /** Companion HTTP base URL, e.g. "http://192.168.0.100:8000/instance/pa2" */
  readonly baseUrl: string
  /** Optional API key for authenticated access */
  readonly apiKey?: string
  /** Polling interval in ms for GET /loop (default: 200) */
  readonly pollIntervalMs?: number
  /** Request timeout in ms (default: 2000) */
  readonly timeoutMs?: number
}

// ═══ API Responses ═══

export interface PA2PingResponse {
  readonly ok: boolean
  readonly connected: boolean
  readonly host: string
}

export interface PA2TopologyResponse {
  readonly modules: readonly string[]
  readonly stereoGeq: boolean
  readonly leftGeq: boolean
  readonly rightGeq: boolean
  readonly hasHigh: boolean
  readonly hasMid: boolean
  readonly hasLow: boolean
  readonly hasAfs: boolean
  readonly hasCompressor: boolean
  readonly hasSubharmonic: boolean
  readonly hasCrossover: boolean
}

/** 31-band RTA spectrum keyed by frequency in Hz */
export interface PA2RTAResponse {
  readonly bands: Readonly<Record<string, number>>
  readonly peak: { readonly freq: number; readonly db: number }
  readonly timestamp: number
}

export interface PA2MetersResponse {
  readonly input: { readonly l: number; readonly r: number }
  readonly output: { readonly hl: number; readonly hr: number }
  readonly compressor: { readonly input: number; readonly gr: number }
  readonly limiter: { readonly input: number; readonly gr: number }
  readonly timestamp: number
}

export interface PA2GEQState {
  readonly enabled: boolean
  readonly mode: string
  readonly bands: Readonly<Record<string, number>>
  readonly topology: 'stereo' | 'dual-mono'
}

export interface PA2MuteState {
  readonly HighLeft: boolean
  readonly HighRight: boolean
  readonly MidLeft: boolean
  readonly MidRight: boolean
  readonly LowLeft: boolean
  readonly LowRight: boolean
}

/** GET /loop — single-call response with everything needed for closed-loop control */
export interface PA2LoopResponse {
  readonly connected: boolean
  readonly rta: Readonly<Record<string, number>>
  readonly geq: PA2GEQState
  readonly meters: {
    readonly input: { readonly l: number; readonly r: number }
    readonly output: { readonly hl: number; readonly hr: number }
    readonly comp_gr: number
    readonly lim_gr: number
  }
  readonly afs: { readonly enabled: boolean; readonly mode: string }
  readonly mutes: PA2MuteState
  readonly timestamp: number
  /** Companion's notch confidence threshold — DWA should not send detections below this */
  readonly notchConfidenceThreshold?: number
}

// ═══ Command Types ═══

export interface PA2CommandResponse {
  readonly ok: boolean
  readonly commands?: number
  readonly error?: string
}

export interface PA2GEQSetRequest {
  readonly bands?: Readonly<Record<string, number>> | readonly number[]
  readonly flat?: boolean
}

export interface PA2AutoEQRequest {
  readonly target?: number
  readonly maxCut?: number
  readonly maxBoost?: number
}

export interface PA2AutoEQResponse {
  readonly ok: boolean
  readonly corrections: Readonly<Record<string, number>>
  readonly commands: number
  readonly timestamp: number
}

export interface PA2CurveRequest {
  readonly curve: Readonly<Record<string, number>>
}

// ═══ Detection / Notch Types ═══

export interface PA2DetectFrequency {
  readonly hz: number
  readonly magnitude?: number
  readonly confidence: number
  readonly type: 'feedback' | 'resonance'
  /** Q factor from DoneWell's peak analysis (clamped to PA2's 4-16 range) */
  readonly q?: number
  /** Advisory ID for notch tracking and release */
  readonly clientId?: string
}

export interface PA2DetectRequest {
  readonly frequencies: readonly PA2DetectFrequency[]
  readonly source?: string
  readonly session?: string
}

export interface PA2DetectAction {
  readonly type: 'notch_placed' | 'skipped_low_confidence' | 'skipped_not_feedback' | 'skipped_no_slots' | 'suggested' | 'pending_approval'
  readonly freq: number
  readonly output?: string
  readonly filter?: number
  readonly gain?: number
  readonly q?: number
  readonly confidence?: number
}

export interface PA2DetectResponse {
  readonly actions: readonly PA2DetectAction[]
  readonly slots_used: number
  readonly slots_available: number
}

export interface PA2Recommendation {
  readonly freq: number
  readonly suggestedGain: number
  readonly suggestedQ: number
  readonly confidence: number
}

export interface PA2ActiveNotch {
  readonly output: string
  readonly filter: number
  readonly freq: number
  readonly gain: number
  readonly q: number
  readonly placedAt: string
}

export interface PA2RecommendationsResponse {
  readonly pending: readonly PA2Recommendation[]
  readonly active_notches: readonly PA2ActiveNotch[]
}

// ═══ Bridge State ═══

export type PA2BridgeStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface PA2AutoSendResult {
  readonly timestamp: number
  readonly type: 'geq' | 'peq' | 'both'
  readonly count: number
}

export interface PA2BridgeState {
  readonly status: PA2BridgeStatus
  readonly pa2Connected: boolean
  readonly lastPollTimestamp: number
  readonly rta: readonly number[]
  readonly geq: PA2GEQState | null
  readonly meters: PA2MetersResponse | null
  readonly mutes: PA2MuteState | null
  readonly error: string | null
  readonly notchSlotsUsed: number
  readonly notchSlotsAvailable: number
  /** Last successful auto-send result (for activity display) */
  readonly lastAutoSendResult: PA2AutoSendResult | null
  /** Last auto-send error message (cleared on success) */
  readonly lastAutoSendError: string | null
  /** Diagnostic: how many advisories exist vs pass filters */
  readonly autoSendDiag: { total: number; aboveThreshold: number; active: number } | null
  /** Effective confidence threshold (max of local setting and Companion's server-side threshold) */
  readonly effectiveConfidence: number
}

// ═══ PA2 Settings ═══

export type PA2AutoSendMode = 'off' | 'geq' | 'peq' | 'hybrid' | 'both'

export interface PA2Settings {
  /** Whether the PA2 bridge is enabled */
  enabled: boolean
  /** Companion HTTP base URL (e.g. "http://localhost:8000/instance/pa2") */
  baseUrl: string
  /** Companion/mixer IP address */
  companionIp: string
  /** Companion HTTP port (default 8000) */
  companionPort: number
  /** Companion instance label (default "PA2") */
  instanceLabel: string
  /** Optional API key for authenticated Companion access */
  apiKey: string
  /** Auto-send mode: off (manual), geq, peq, or hybrid */
  autoSend: PA2AutoSendMode
  /** Minimum confidence to auto-send (0-1) */
  autoSendMinConfidence: number
  /** Polling interval in ms (default 200 for 5Hz) */
  pollIntervalMs: number
  /** Auto-send ring-out detections to PA2 */
  ringOutAutoSend: boolean
  /** Auto-mute PA2 on RUNAWAY detection */
  panicMuteEnabled: boolean
  /** Sync DoneWell mode changes to PA2 AFS/compressor settings */
  modeSyncEnabled: boolean
}

/** Build the full Companion URL from individual fields */
export function buildCompanionUrl(ip: string, port: number, label: string): string {
  if (!ip) return ''
  return `http://${ip}:${port}/instance/${label}`
}

export const DEFAULT_PA2_SETTINGS: PA2Settings = {
  enabled: false,
  baseUrl: '',
  companionIp: '',
  companionPort: 8000,
  instanceLabel: 'PA2',
  apiKey: '',
  autoSend: 'both',
  autoSendMinConfidence: 0.3,
  pollIntervalMs: 200,
  ringOutAutoSend: false,
  panicMuteEnabled: false,
  modeSyncEnabled: false,
}

// ═══ Constants ═══

/**
 * ISO 31-band GEQ center frequencies in Hz.
 * Index 0 = band 1 (20 Hz), index 30 = band 31 (20 kHz).
 * Matches the PA2's internal GEQ band numbering.
 */
export const PA2_GEQ_FREQUENCIES = [
  20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160,
  200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600,
  2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000, 20000,
] as const

/** Maps frequency (Hz) to PA2 band number (1-31) */
export const PA2_FREQ_TO_BAND: Readonly<Record<number, number>> = Object.fromEntries(
  PA2_GEQ_FREQUENCIES.map((f, i) => [f, i + 1]),
)
