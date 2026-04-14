import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { logDebug } from '@/lib/utils/logger'

/**
 * Cloud relay for Companion integration (bidirectional).
 *
 * DoneWell PWA posts advisories here (same origin — no CORS).
 * Companion module polls here from the user's local network.
 * Paired via a short code. No IP addresses or port numbers needed.
 *
 * Two queues per relay (backward compatible via ?direction= query param):
 *   - toModule: DWA posts advisories, module drains on GET
 *   - toApp:    module posts acks/commands, DWA drains on GET?direction=app
 *
 * GET    /relay/[code]                  — module polls toModule (default)
 * GET    /relay/[code]?direction=app    — DWA polls toApp
 * POST   /relay/[code]                  — DWA pushes to toModule (default)
 * POST   /relay/[code]?direction=app    — module pushes to toApp
 * DELETE /relay/[code]                  — Clear both queues (disconnect)
 *
 * HEAD   /relay/[code]                  — health check (no drain, no body)
 */

// ─── Relay store ─────────────────────────────────────────────────────────────

interface RelayEntry {
  /** DWA → module queue */
  toModule: unknown[]
  /** Module → DWA queue */
  toApp: unknown[]
  lastActivity: number
}

/**
 * In-memory relay store. Each code maps to two queues (bidirectional).
 *
 * Intentionally ephemeral — data is lost on cold start or redeploy.
 * This suits the relay use case (short-lived advisory forwarding between
 * paired sessions). Active relay sessions may lose queued advisories
 * during Vercel serverless function cold starts.
 */
const relays = new Map<string, RelayEntry>()

/** Max advisories per relay to prevent memory bloat */
const MAX_QUEUE = 20
/** Max POST body size in bytes (50 KB — advisories are typically <2 KB) */
const MAX_PAYLOAD_BYTES = 50_000
/** Relay expires after 30 minutes of inactivity (reduced from 2h to limit memory pressure) */
const EXPIRY_MS = 30 * 60 * 1000
/** Max concurrent relay codes to prevent memory exhaustion from code-flooding attacks */
const MAX_RELAYS = 500

/** Prune expired relays */
function prune() {
  const now = Date.now()
  for (const [code, relay] of relays) {
    if (now - relay.lastActivity > EXPIRY_MS) {
      relays.delete(code)
    }
  }
}

// ─── Rate limiting (per pairing code, not per IP) ────────────────────────────
// On localhost all pollers share one IP, so IP-based limiting throttles the
// module and app against each other. Per-code limiting gives each pairing
// session its own 600 req/min budget.

const codeRateMap = new Map<string, { count: number; windowStart: number }>()

function isCodeRateLimited(code: string): boolean {
  const now = Date.now()
  const entry = codeRateMap.get(code)

  // Prune expired entries periodically
  if (codeRateMap.size > 5000) {
    for (const [k, v] of codeRateMap) {
      if (now - v.windowStart > 60_000) codeRateMap.delete(k)
    }
  }

  if (!entry || now - entry.windowStart > 60_000) {
    codeRateMap.set(code, { count: 1, windowStart: now })
    return false
  }

  entry.count++
  return entry.count > 600
}

// ─── Payload validation ───────────────────────────────────────────────────────

/** Valid DWA → module control message types. */
const VALID_TO_MODULE_TYPES = new Set([
  'resolve', 'dismiss', 'mode_change', 'auto_apply', 'ping',
])

/** Valid module → DWA message types. */
const VALID_TO_APP_TYPES = new Set([
  'ack', 'applied', 'apply_failed', 'partial_apply', 'partial_clear', 'clear_failed', 'cleared', 'command', 'pong',
])

/** Max string field length to prevent oversized payloads */
const MAX_FIELD_LENGTH = 100

/**
 * Validates a DWA → module POST payload.
 * Accepts advisory objects (id + severity + confidence), auto_apply (same shape
 * with type field), and control messages (resolve, dismiss, mode_change, ping).
 */
function validateToModulePayload(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return 'Expected object'
  const p = payload as Record<string, unknown>

  // Typed messages
  if (typeof p.type === 'string') {
    if (!VALID_TO_MODULE_TYPES.has(p.type)) return `Unknown type: ${p.type.slice(0, 30)}`
    // auto_apply carries an advisory payload — validate id/severity/confidence
    if (p.type === 'auto_apply') {
      if (typeof p.id !== 'string' || p.id.length === 0 || p.id.length > MAX_FIELD_LENGTH) return 'Invalid id'
      if (typeof p.severity !== 'string' || p.severity.length > MAX_FIELD_LENGTH) return 'Invalid severity'
      if (typeof p.confidence !== 'number' || !Number.isFinite(p.confidence) || p.confidence < 0 || p.confidence > 1) {
        return 'Invalid confidence'
      }
    }
    return null
  }

  // Advisory payload (no type field)
  if (typeof p.id !== 'string' || p.id.length === 0 || p.id.length > MAX_FIELD_LENGTH) {
    return 'Invalid id'
  }
  if (typeof p.severity !== 'string' || p.severity.length === 0 || p.severity.length > MAX_FIELD_LENGTH) {
    return 'Invalid severity'
  }
  if (typeof p.confidence !== 'number' || !Number.isFinite(p.confidence) || p.confidence < 0 || p.confidence > 1) {
    return 'Invalid confidence'
  }

  return null
}

/**
 * Validates a module → DWA POST payload.
 * Must have a known type field (ack, applied, apply_failed, cleared, command, pong).
 */
function validateToAppPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return 'Expected object'
  const p = payload as Record<string, unknown>

  if (typeof p.type !== 'string') return 'Missing type field'
  if (!VALID_TO_APP_TYPES.has(p.type)) return `Unknown type: ${p.type.slice(0, 30)}`

  // Shallow validation — advisoryId/action length caps only
  if (typeof p.advisoryId === 'string' && p.advisoryId.length > MAX_FIELD_LENGTH) return 'advisoryId too long'
  if (typeof p.action === 'string' && p.action.length > MAX_FIELD_LENGTH) return 'action too long'
  if (typeof p.reason === 'string' && p.reason.length > 200) return 'reason too long'

  return null
}

// ─── Code format validation ──────────────────────────────────────────────────

/** Codes are "DWA-XXXXXX" — 6 alphanumeric chars after prefix. Reject anything else. */
const VALID_CODE = /^DWA-[A-Z0-9]{6}$/

// ─── Route handlers ───────────────────────────────────────────────────────────

/** Parse ?direction=app (default: module). Anything else is treated as module. */
function getDirection(request: NextRequest): 'module' | 'app' {
  return request.nextUrl.searchParams.get('direction') === 'app' ? 'app' : 'module'
}

function getOrCreateRelay(code: string): RelayEntry | null {
  let relay = relays.get(code)
  if (!relay) {
    // Enforce relay count cap — prune first, then check limit
    if (relays.size >= MAX_RELAYS) {
      prune()
      if (relays.size >= MAX_RELAYS) return null
    }
    relay = { toModule: [], toApp: [], lastActivity: Date.now() }
    relays.set(code, relay)
  }
  return relay
}

// GET — drain one of the two queues
//   default:              module polls DWA → module queue  ({ advisories, pendingCount })
//   ?direction=app:       DWA polls module → app queue     ({ messages, pendingCount })
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params
  if (!VALID_CODE.test(code)) {
    return NextResponse.json({ error: 'Invalid code' }, { status: 400 })
  }
  if (isCodeRateLimited(code)) {
    return NextResponse.json({ error: 'Rate limited' }, { status: 429, headers: { 'Retry-After': '60' } })
  }
  prune()

  const direction = getDirection(request)
  const relay = relays.get(code)

  if (direction === 'app') {
    // DWA polling for module → DWA messages
    if (!relay) {
      return NextResponse.json({ ok: true, messages: [], pendingCount: 0 })
    }
    const messages = [...relay.toApp]
    relay.toApp = []
    relay.lastActivity = Date.now()
    return NextResponse.json({ ok: true, messages, pendingCount: messages.length })
  }

  // Module polling for DWA → module messages (default — backward compatible shape)
  if (!relay) {
    return NextResponse.json({ ok: true, advisories: [], pendingCount: 0 })
  }
  const advisories = [...relay.toModule]
  relay.toModule = []
  relay.lastActivity = Date.now()
  return NextResponse.json({ ok: true, advisories, pendingCount: advisories.length })
}

// HEAD — health check without draining either queue. Used by DWA's checkStatus.
export async function HEAD(
  _request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params
  if (!VALID_CODE.test(code)) {
    return new NextResponse(null, { status: 400 })
  }
  if (isCodeRateLimited(code)) {
    return new NextResponse(null, { status: 429, headers: { 'Retry-After': '60' } })
  }
  return new NextResponse(null, { status: 200 })
}

// POST — push to one of the two queues
//   default:          DWA pushes to DWA → module queue
//   ?direction=app:   module pushes to module → DWA queue
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params
  if (!VALID_CODE.test(code)) {
    return NextResponse.json({ error: 'Invalid code' }, { status: 400 })
  }
  if (isCodeRateLimited(code)) {
    return NextResponse.json({ error: 'Rate limited' }, { status: 429, headers: { 'Retry-After': '60' } })
  }
  prune()

  let payload: unknown
  try {
    const text = await request.text()
    if (text.length > MAX_PAYLOAD_BYTES) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
    }
    payload = JSON.parse(text)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const direction = getDirection(request)
  const validationError = direction === 'app'
    ? validateToAppPayload(payload)
    : validateToModulePayload(payload)
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 })
  }

  const relay = getOrCreateRelay(code)
  if (!relay) {
    return NextResponse.json({ error: 'Too many active relays' }, { status: 503 })
  }
  const queue = direction === 'app' ? relay.toApp : relay.toModule

  queue.push(payload)
  relay.lastActivity = Date.now()
  // DEBUG: log relay activity to terminal
  const p = payload as Record<string, unknown>
  logDebug(`[RELAY] ${direction === 'app' ? 'module→app' : 'dwa→module'} code=${code} type=${p.type ?? 'advisory'} queue=${queue.length}`)

  // Cap queue size (drop oldest, keep newest)
  if (queue.length > MAX_QUEUE) {
    const trimmed = queue.slice(-MAX_QUEUE)
    if (direction === 'app') relay.toApp = trimmed
    else relay.toModule = trimmed
  }

  const pendingCount = direction === 'app' ? relay.toApp.length : relay.toModule.length
  return NextResponse.json({ accepted: true, pendingCount })
}

// DELETE — Clear both queues (disconnect)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params
  if (!VALID_CODE.test(code)) {
    return NextResponse.json({ error: 'Invalid code' }, { status: 400 })
  }
  if (isCodeRateLimited(code)) {
    return NextResponse.json({ error: 'Rate limited' }, { status: 429, headers: { 'Retry-After': '60' } })
  }
  relays.delete(code)
  return NextResponse.json({ ok: true })
}
