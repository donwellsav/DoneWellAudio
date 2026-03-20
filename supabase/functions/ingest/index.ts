/**
 * Supabase Edge Function: /ingest
 *
 * Receives spectral snapshot batches from the Next.js API proxy.
 * Validates, rate-limits by session_id, and stores in the
 * spectral_snapshots table.
 *
 * Schema versions:
 *   v1.0 — base event metadata + snapshots
 *   v1.1 — adds algorithmScores (6 algo scores + fused) + userFeedback
 *   v1.2 — adds ML model score + modelVersion
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

interface AlgorithmScores {
  msd: number | null
  phase: number | null
  spectral: number | null
  comb: number | null
  ihr: number | null
  ptmr: number | null
  ml: number | null
  fusedProbability: number
  fusedConfidence: number
  modelVersion: string | null
}

interface FeedbackEvent {
  relativeMs: number
  frequencyHz: number
  amplitudeDb: number
  severity: string
  confidence: number
  contentType: string
  algorithmScores?: AlgorithmScores
  userFeedback?: string
}

interface SnapshotBatch {
  version: string
  sessionId: string
  capturedAt: string
  fftSize: number
  sampleRate: number
  binsPerSnapshot: number
  event: FeedbackEvent
  snapshots: Array<{ t: number; s: string }>
}

const SUPPORTED_VERSIONS = ["1.0", "1.1", "1.2"]

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
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    })
  }

  const authHeader = req.headers.get("Authorization")
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    })
  }

  try {
    const batch: SnapshotBatch = await req.json()

    // Validate version
    if (!SUPPORTED_VERSIONS.includes(batch.version)) {
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

    if (isRateLimited(batch.sessionId)) {
      return new Response(JSON.stringify({ error: "Rate limited" }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      })
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Build row — base fields present in all versions
    const row: Record<string, unknown> = {
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
      snapshots: batch.snapshots,
      schema_version: batch.version,
    }

    // v1.1+ fields: algorithm scores and user feedback
    const scores = batch.event.algorithmScores
    if (scores) {
      row.algo_msd = scores.msd
      row.algo_phase = scores.phase
      row.algo_spectral = scores.spectral
      row.algo_comb = scores.comb
      row.algo_ihr = scores.ihr
      row.algo_ptmr = scores.ptmr
      row.fused_probability = scores.fusedProbability
      row.fused_confidence = scores.fusedConfidence
      row.model_version = scores.modelVersion
    }

    if (batch.event.userFeedback) {
      row.user_feedback = batch.event.userFeedback
    }

    const { error } = await supabase.from("spectral_snapshots").insert(row)

    if (error) {
      console.error("Insert error:", JSON.stringify({
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      }))
      return new Response(JSON.stringify({
        error: "Storage failed",
        code: error.code,
        message: error.message,
      }), {
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
