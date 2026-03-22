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

// ─── Configuration ──────────────────────────────────────────────────────────

const SUPABASE_INGEST_URL = process.env.SUPABASE_INGEST_URL ?? ''
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

// Validate SUPABASE_INGEST_URL is a known Supabase domain (SSRF defense-in-depth)
if (SUPABASE_INGEST_URL) {
  try {
    const host = new URL(SUPABASE_INGEST_URL).hostname
    if (!host.endsWith('.supabase.co') && !host.endsWith('.supabase.com') && !host.endsWith('.functions.supabase.co')) {
      console.error(`[ingest] SUPABASE_INGEST_URL host not in allowlist: ${host}`)
    }
  } catch {
    console.error('[ingest] SUPABASE_INGEST_URL is not a valid URL')
  }
}

/** Max payload size: 512KB (batches are typically 2-10KB uncompressed) */
const MAX_PAYLOAD_BYTES = 512 * 1024

/** Rate limit: per session, max requests per window */
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX_REQUESTS = 6

// In-memory rate limit stores (reset on cold start — acceptable for edge)
const rateLimitMap = new Map<string, { count: number; windowStart: number }>()
const ipRateLimitMap = new Map<string, { count: number; windowStart: number }>()

/** IP-based rate limit: more generous than session, catches rotating sessionIds */
const IP_RATE_LIMIT_MAX_REQUESTS = 30

// ─── Route handler ──────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    // Check content length header (fast rejection for oversized requests)
    const contentLength = parseInt(request.headers.get('content-length') ?? '0', 10)
    if (contentLength > MAX_PAYLOAD_BYTES) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
    }

    // IP-based rate limit (primary gate — client cannot forge on Vercel)
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
    if (isRateLimitedByKey(ipRateLimitMap, clientIp, IP_RATE_LIMIT_MAX_REQUESTS)) {
      return NextResponse.json({ error: 'Rate limited' }, { status: 429 })
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
      return NextResponse.json({ error: 'Rate limited' }, { status: 429 })
    }

    // If Supabase is not configured, accept and acknowledge (dev mode)
    if (!SUPABASE_INGEST_URL) {
      return NextResponse.json({
        ok: true,
        stored: false,
        reason: 'Supabase not configured — data accepted but not stored',
      })
    }

    // Forward to Supabase Edge Function (strip IP — don't forward X-Forwarded-For)
    const forwardResponse = await fetch(SUPABASE_INGEST_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
      body: JSON.stringify(batch),
    })

    if (!forwardResponse.ok) {
      // Log detail server-side but don't expose to client
      const errText = await forwardResponse.text().catch(() => 'unknown')
      console.error(`[ingest] Storage failed: ${forwardResponse.status} — ${errText}`)
      return NextResponse.json(
        { error: 'Storage temporarily unavailable' },
        { status: 502 }
      )
    }

    return NextResponse.json({ ok: true, stored: true })
  } catch (err) {
    console.error('[ingest] Unexpected error:', err)
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
  if (typeof b.sessionId !== 'string' || b.sessionId.length < 10) return 'Invalid sessionId'
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

  // Spot-check snapshots: first, last, and one random middle entry
  const indicesToCheck = [0, b.snapshots.length - 1]
  if (b.snapshots.length > 2) {
    indicesToCheck.push(1 + Math.floor(Math.random() * (b.snapshots.length - 2)))
  }
  for (const idx of indicesToCheck) {
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
  rateLimitCallCount++
  if (rateLimitCallCount % 100 === 0) {
    for (const [k, val] of map) {
      if (now - val.windowStart > RATE_LIMIT_WINDOW_MS) map.delete(k)
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
