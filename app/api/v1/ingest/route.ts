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

/** Max payload size: 512KB (batches are typically 2-10KB uncompressed) */
const MAX_PAYLOAD_BYTES = 512 * 1024

/** Rate limit: per session, max requests per window */
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX_REQUESTS = 6

// In-memory rate limit store (resets on cold start — acceptable for edge)
const rateLimitMap = new Map<string, { count: number; windowStart: number }>()

// ─── Route handler ──────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    // Check content length
    const contentLength = parseInt(request.headers.get('content-length') ?? '0', 10)
    if (contentLength > MAX_PAYLOAD_BYTES) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
    }

    // Parse body
    let batch: SnapshotBatch
    try {
      batch = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    // Validate schema
    const validationError = validateBatch(batch)
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 })
    }

    // Rate limit by session ID
    if (isRateLimited(batch.sessionId)) {
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
      const errText = await forwardResponse.text().catch(() => 'unknown')
      return NextResponse.json(
        { error: `Storage failed: ${forwardResponse.status}`, detail: errText },
        { status: 502 }
      )
    }

    return NextResponse.json({ ok: true, stored: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
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

  // Spot-check first snapshot
  const first = b.snapshots[0] as Record<string, unknown>
  if (typeof first.t !== 'number') return 'Invalid snapshot.t'
  if (typeof first.s !== 'string') return 'Invalid snapshot.s'
  // Base64 of 512 bytes = ceil(512/3)*4 = 684 chars
  if (first.s.length < 100 || first.s.length > 800) return 'Invalid snapshot.s length'

  return null
}

// ─── Rate limiting ──────────────────────────────────────────────────────────

function isRateLimited(sessionId: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(sessionId)

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(sessionId, { count: 1, windowStart: now })
    return false
  }

  entry.count++
  if (entry.count > RATE_LIMIT_MAX_REQUESTS) return true

  return false
}
