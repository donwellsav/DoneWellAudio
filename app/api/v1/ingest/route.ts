/**
 * POST /api/v1/ingest — Spectral snapshot ingest endpoint
 *
 * Accepts anonymous spectral data from free-tier users who have consented.
 * Validates the payload schema, enforces rate limits, and forwards to
 * the Supabase Edge Function for storage.
 *
 * Privacy:
 *   - Strips IP address before forwarding
 *   - Session IDs are random UUIDs, never linked to user accounts
 *   - No device identifiers, geolocation, or phase data accepted
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import type { SnapshotBatch } from '@/types/data'
import { logError } from '@/lib/utils/logger'

// ─── Configuration ──────────────────────────────────────────────────────────

const SUPABASE_INGEST_URL = process.env.SUPABASE_INGEST_URL ?? ''
const SUPABASE_INGEST_AUTH_TOKEN = process.env.SUPABASE_INGEST_SHARED_SECRET
  ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  ?? ''

/**
 * SSRF defense: validate SUPABASE_INGEST_URL against Supabase domain allowlist.
 * Throws at module load if an invalid domain is configured — prevents data
 * exfiltration via compromised environment variables.
 */
if (SUPABASE_INGEST_URL) {
  try {
    const host = new URL(SUPABASE_INGEST_URL).hostname
    if (!host.endsWith('.supabase.co') && !host.endsWith('.supabase.com') && !host.endsWith('.functions.supabase.co')) {
      throw new Error(`SUPABASE_INGEST_URL host not in allowlist: ${host}`)
    }
  } catch (err) {
    // Re-throw validation errors; catch only URL parse failures
    if (err instanceof Error && err.message.includes('not in allowlist')) throw err
    throw new Error(`SUPABASE_INGEST_URL is not a valid URL: ${SUPABASE_INGEST_URL}`)
  }
}

// Production environment validation — catch silent misconfiguration early
if (process.env.NODE_ENV === 'production' && SUPABASE_INGEST_URL && !SUPABASE_INGEST_AUTH_TOKEN) {
  logError('[ingest] WARNING: SUPABASE_INGEST_URL set but ingest auth token is missing — forwarding will fail')
}

/** Max payload size: 512KB (batches are typically 2-10KB uncompressed) */
const MAX_PAYLOAD_BYTES = 512 * 1024

/** Rate limit: per session, max requests per window */
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX_REQUESTS = 6

// In-memory rate limit stores (reset on cold start — acceptable for edge)
// Bounded to MAX_RATE_LIMIT_ENTRIES to prevent memory exhaustion via many unique keys
const MAX_RATE_LIMIT_ENTRIES = 10_000
const rateLimitMap = new Map<string, { count: number; windowStart: number }>()
const ipRateLimitMap = new Map<string, { count: number; windowStart: number }>()

/** IP-based rate limit: more generous than session, catches rotating sessionIds */
const IP_RATE_LIMIT_MAX_REQUESTS = 30

// ─── Route handler ──────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    // Require JSON content type
    const ct = request.headers.get('content-type') ?? ''
    if (!ct.includes('application/json')) {
      return NextResponse.json({ error: 'Content-Type must be application/json' }, { status: 415 })
    }

    // Check content length header (fast rejection for oversized requests)
    const contentLength = parseInt(request.headers.get('content-length') ?? '0', 10)
    if (isNaN(contentLength) || contentLength < 0 || contentLength > MAX_PAYLOAD_BYTES) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
    }

    // IP-based rate limit (primary gate).
    // Prefer request.ip (set by Vercel, not forgeable) over the header.
    const clientIp = (request as NextRequest & { ip?: string }).ip
      ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      ?? 'unknown'
    if (isRateLimitedByKey(ipRateLimitMap, clientIp, IP_RATE_LIMIT_MAX_REQUESTS)) {
      return NextResponse.json({ error: 'Rate limited' }, { status: 429, headers: { 'Retry-After': '60' } })
    }

    // Parse body and enforce actual size (Content-Length can be spoofed)
    let rawText: string
    try {
      rawText = await request.text()
    } catch {
      return NextResponse.json({ error: 'Failed to read body' }, { status: 400 })
    }
    if (rawText.length > MAX_PAYLOAD_BYTES) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
    }

    let batch: SnapshotBatch
    try {
      batch = JSON.parse(rawText) as SnapshotBatch
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    // Validate schema
    const validationError = validateBatch(batch)
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 })
    }

    // Session-based rate limit (secondary — catches burst within same session)
    if (isRateLimitedByKey(rateLimitMap, batch.sessionId, RATE_LIMIT_MAX_REQUESTS)) {
      return NextResponse.json({ error: 'Rate limited' }, { status: 429, headers: { 'Retry-After': '60' } })
    }

    // If Supabase is not configured, accept and acknowledge (dev mode)
    if (!SUPABASE_INGEST_URL) {
      return NextResponse.json({
        ok: true,
        stored: false,
        reason: 'Supabase not configured — data accepted but not stored',
      })
    }

    if (!SUPABASE_INGEST_AUTH_TOKEN) {
      logError('[ingest] Missing SUPABASE_INGEST_SHARED_SECRET or SUPABASE_SERVICE_ROLE_KEY')
      return NextResponse.json(
        { error: 'Storage temporarily unavailable' },
        { status: 503 }
      )
    }

    // Forward to Supabase Edge Function (strip IP — don't forward X-Forwarded-For)
    const forwardResponse = await fetch(SUPABASE_INGEST_URL, {
      method: 'POST',
      signal: AbortSignal.timeout(5000),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_INGEST_AUTH_TOKEN}`,
      },
      body: JSON.stringify(batch),
    })

    if (!forwardResponse.ok) {
      // Log status only — do not log response body (may contain Supabase internals)
      const errLen = parseInt(forwardResponse.headers.get('content-length') ?? '0', 10)
      logError(`[ingest] Storage failed: ${forwardResponse.status} (${errLen} bytes)`)
      return NextResponse.json(
        { error: 'Storage temporarily unavailable' },
        { status: 502 }
      )
    }

    return NextResponse.json({ ok: true, stored: true })
  } catch (err) {
    logError('[ingest] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal error' },
      { status: 500 }
    )
  }
}

// ─── Validation ─────────────────────────────────────────────────────────────

function validateBatch(batch: unknown): string | null {
  if (!batch || typeof batch !== 'object') return 'Expected object'

  const b = batch as Record<string, unknown>

  if (b.version !== '1.0' && b.version !== '1.1' && b.version !== '1.2') return 'Unsupported version'
  if (typeof b.sessionId !== 'string' || b.sessionId.length < 10 || b.sessionId.length > 64 || !/^[a-zA-Z0-9_-]+$/.test(b.sessionId)) return 'Invalid sessionId'
  if (typeof b.fftSize !== 'number' || ![4096, 8192, 16384].includes(b.fftSize)) return 'Invalid fftSize'
  if (typeof b.sampleRate !== 'number' || b.sampleRate < 8000 || b.sampleRate > 96000) return 'Invalid sampleRate'
  if (typeof b.binsPerSnapshot !== 'number' || b.binsPerSnapshot !== 512) return 'binsPerSnapshot must be 512'

  // Validate event
  if (!b.event || typeof b.event !== 'object') return 'Missing event'
  const event = b.event as Record<string, unknown>
  if (typeof event.frequencyHz !== 'number') return 'Invalid event.frequencyHz'
  if (typeof event.amplitudeDb !== 'number') return 'Invalid event.amplitudeDb'

  // v1.1 optional fields
  if (event.algorithmScores !== undefined) {
    const scores = event.algorithmScores as Record<string, unknown>
    if (typeof scores !== 'object' || scores === null) return 'Invalid event.algorithmScores'
    if (typeof scores.fusedProbability !== 'number') return 'Invalid event.algorithmScores.fusedProbability'
    if (typeof scores.fusedConfidence !== 'number') return 'Invalid event.algorithmScores.fusedConfidence'
  }
  if (event.userFeedback !== undefined) {
    if (event.userFeedback !== 'correct' && event.userFeedback !== 'false_positive' && event.userFeedback !== 'confirmed_feedback') {
      return 'Invalid event.userFeedback'
    }
  }

  // Validate snapshots array
  if (!Array.isArray(b.snapshots)) return 'snapshots must be array'
  if (b.snapshots.length === 0) return 'Empty snapshots'
  if (b.snapshots.length > 240) return 'Too many snapshots (max 240)'

  // Validate ALL snapshots — spot-checking left unchecked positions exploitable
  for (let idx = 0; idx < b.snapshots.length; idx++) {
    const snap = b.snapshots[idx] as Record<string, unknown>
    if (typeof snap.t !== 'number') return `Invalid snapshot[${idx}].t`
    if (typeof snap.s !== 'string') return `Invalid snapshot[${idx}].s`
    // Base64 of 512 bytes = ceil(512/3)*4 = 684 chars
    if (snap.s.length < 100 || snap.s.length > 800) return `Invalid snapshot[${idx}].s length`
  }

  return null
}

// ─── Rate limiting ──────────────────────────────────────────────────────────

/** Monotonic counter for amortised pruning — shared across both rate limit maps */
let rateLimitCallCount = 0

function isRateLimitedByKey(
  map: Map<string, { count: number; windowStart: number }>,
  key: string,
  maxRequests: number,
): boolean {
  const now = Date.now()
  const entry = map.get(key)

  // Amortised time-based pruning: sweep stale entries every 100 calls
  // Hard cap prevents unbounded memory growth from many unique IPs (DoS defense)
  rateLimitCallCount++
  if (rateLimitCallCount % 100 === 0 || map.size > MAX_RATE_LIMIT_ENTRIES) {
    for (const [k, val] of map) {
      if (now - val.windowStart > RATE_LIMIT_WINDOW_MS) map.delete(k)
    }
    // If still over cap after pruning, drop oldest entries
    if (map.size > MAX_RATE_LIMIT_ENTRIES) {
      const excess = map.size - MAX_RATE_LIMIT_ENTRIES
      const iter = map.keys()
      for (let i = 0; i < excess; i++) {
        const k = iter.next().value
        if (k !== undefined) map.delete(k)
      }
    }
  }

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    map.set(key, { count: 1, windowStart: now })
    return false
  }

  entry.count++
  if (entry.count > maxRequests) return true

  return false
}
