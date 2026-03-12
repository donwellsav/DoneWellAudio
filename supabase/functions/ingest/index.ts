/**
 * Supabase Edge Function: /ingest
 *
 * Receives spectral snapshot batches from the Next.js API proxy.
 * Validates, rate-limits by session_id, and stores in the
 * spectral_snapshots table.
 *
 * Privacy:
 *   - IP address is NEVER stored (not forwarded by API proxy)
 *   - Session IDs are random UUIDs, not linked to user accounts
 *   - Only magnitude spectrum data (Uint8 quantized) — no phase, no audio
 *   - No device identifiers or geolocation
 *
 * Deploy: supabase functions deploy ingest
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

// ─── Types ──────────────────────────────────────────────────────────────────

interface SnapshotBatch {
  version: string
  sessionId: string
  capturedAt: string
  fftSize: number
  sampleRate: number
  binsPerSnapshot: number
  event: {
    relativeMs: number
    frequencyHz: number
    amplitudeDb: number
    severity: string
    confidence: number
    contentType: string
  }
  snapshots: Array<{
    t: number
    s: string
  }>
}

// ─── Rate limit ─────────────────────────────────────────────────────────────

const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 10
const rateLimits = new Map<string, { count: number; start: number }>()

function isRateLimited(sessionId: string): boolean {
  const now = Date.now()
  const entry = rateLimits.get(sessionId)

  if (!entry || now - entry.start > RATE_LIMIT_WINDOW_MS) {
    rateLimits.set(sessionId, { count: 1, start: now })
    return false
  }

  entry.count++
  return entry.count > RATE_LIMIT_MAX
}

// ─── Handler ────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // Only POST allowed
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    })
  }

  // Verify authorization (service role key from API proxy)
  const authHeader = req.headers.get("Authorization")
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    })
  }

  try {
    const batch: SnapshotBatch = await req.json()

    // Validate
    if (batch.version !== "1.0") {
      return new Response(JSON.stringify({ error: "Unsupported version" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    if (!batch.sessionId || !batch.event || !Array.isArray(batch.snapshots)) {
      return new Response(JSON.stringify({ error: "Invalid payload" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    // Rate limit per session
    if (isRateLimited(batch.sessionId)) {
      return new Response(JSON.stringify({ error: "Rate limited" }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      })
    }

    // Initialize Supabase client with service role
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Store batch — IP is already stripped by the API proxy
    const { error } = await supabase.from("spectral_snapshots").insert({
      session_id: batch.sessionId,
      captured_at: batch.capturedAt,
      fft_size: batch.fftSize,
      sample_rate: batch.sampleRate,
      bins_per_snapshot: batch.binsPerSnapshot,
      event_frequency_hz: batch.event.frequencyHz,
      event_amplitude_db: batch.event.amplitudeDb,
      event_severity: batch.event.severity,
      event_confidence: batch.event.confidence,
      event_content_type: batch.event.contentType,
      snapshot_count: batch.snapshots.length,
      // Store snapshots as JSONB — efficient for batch retrieval during ML training
      snapshots: batch.snapshots,
    })

    if (error) {
      console.error("Insert error:", error)
      return new Response(JSON.stringify({ error: "Storage failed" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      })
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  } catch (err) {
    console.error("Ingest error:", err)
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }
})
