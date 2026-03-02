import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.DATABASE_URL!)

// ─── Session ─────────────────────────────────────────────────────────────────

export interface Session {
  id: string
  started_at: string
  ended_at: string | null
  mode: string
  fft_size: number
  label: string | null
  event_count?: number
}

export async function createSession(params: {
  id: string
  mode: string
  fftSize: number
}): Promise<Session> {
  const rows = await sql`
    INSERT INTO sessions (id, mode, fft_size)
    VALUES (${params.id}, ${params.mode}, ${params.fftSize})
    RETURNING *
  `
  return rows[0] as Session
}

export async function endSession(id: string): Promise<Session | null> {
  const rows = await sql`
    UPDATE sessions
    SET ended_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `
  return (rows[0] as Session) ?? null
}

export async function listSessions(limit = 50): Promise<Session[]> {
  const rows = await sql`
    SELECT
      s.*,
      COUNT(e.id)::int AS event_count
    FROM sessions s
    LEFT JOIN session_events e ON e.session_id = s.id AND e.event_type = 'issue_detected'
    GROUP BY s.id
    ORDER BY s.started_at DESC
    LIMIT ${limit}
  `
  return rows as Session[]
}

export async function deleteSession(id: string): Promise<number> {
  const rows = await sql`DELETE FROM sessions WHERE id = ${id} RETURNING id`
  return rows.length
}

export async function getSession(id: string): Promise<Session | null> {
  const rows = await sql`
    SELECT
      s.*,
      COUNT(e.id)::int AS event_count
    FROM sessions s
    LEFT JOIN session_events e ON e.session_id = s.id AND e.event_type = 'issue_detected'
    WHERE s.id = ${id}
    GROUP BY s.id
  `
  return (rows[0] as Session) ?? null
}

// ─── Events ───────────────────────────────────────────────────────────────────

export interface SessionEventRow {
  id: string
  session_id: string
  occurred_at: string
  event_type: string
  frequency: number | null
  amplitude: number | null
  severity: string | null
  classification: string | null
  q_factor: number | null
  bandwidth: number | null
  growth_rate: number | null
  metadata: Record<string, unknown> | null
}

export async function bulkInsertEvents(
  sessionId: string,
  events: Array<{
    id: string
    type: string
    timestamp: number
    data: Record<string, unknown>
  }>,
): Promise<void> {
  if (events.length === 0) return

  // Single multi-value INSERT — one round-trip regardless of batch size
  const rows = events.map((ev) => {
    const d = ev.data as Record<string, unknown>
    const isIssue = ev.type === 'issue_detected'
    return {
      id: ev.id,
      session_id: sessionId,
      occurred_at: new Date(ev.timestamp).toISOString(),
      event_type: ev.type,
      frequency: isIssue ? (d.frequency as number) ?? null : null,
      amplitude: isIssue ? (d.amplitude as number) ?? null : null,
      severity: isIssue ? (d.severity as string) ?? null : null,
      classification: isIssue ? (d.classification as string) ?? null : null,
      q_factor: isIssue ? (d.qFactor as number) ?? null : null,
      bandwidth: isIssue ? (d.bandwidth as number) ?? null : null,
      growth_rate: isIssue ? (d.growthRate as number) ?? null : null,
      metadata: isIssue ? null : JSON.stringify(d),
    }
  })

  // Build a single multi-row INSERT — one DB round-trip regardless of batch size.
  // The neon client supports sql(queryString, params[]) as an alternative to tagged templates,
  // which lets us construct dynamic parameter placeholders safely.
  const COL_COUNT = 12
  const placeholders = rows
    .map((_, i) => {
      const b = i * COL_COUNT
      return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9},$${b+10},$${b+11},$${b+12})`
    })
    .join(',\n')

  const values = rows.flatMap((r) => [
    r.id, r.session_id, r.occurred_at, r.event_type,
    r.frequency, r.amplitude, r.severity, r.classification,
    r.q_factor, r.bandwidth, r.growth_rate, r.metadata,
  ])

  await sql.query(
    `INSERT INTO session_events (
       id, session_id, occurred_at, event_type,
       frequency, amplitude, severity, classification,
       q_factor, bandwidth, growth_rate, metadata
     ) VALUES ${placeholders}
     ON CONFLICT (id) DO NOTHING`,
    values,
  )
}

export async function getSessionEvents(sessionId: string): Promise<SessionEventRow[]> {
  const rows = await sql`
    SELECT * FROM session_events
    WHERE session_id = ${sessionId}
    ORDER BY occurred_at ASC
  `
  return rows as SessionEventRow[]
}

// ─── Frequency Histogram ──────────────────────────────────────────────────────

export interface FrequencyBin {
  bandHz: number
  count: number
  maxAmplitude: number
  severities: Record<string, number>
}

// ISO 31-band frequencies — mirrors the client constant to avoid a shared import
const ISO_BANDS = [
  20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160,
  200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600,
  2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000, 20000,
]

function nearestIsoBand(hz: number): number {
  let closest = ISO_BANDS[0]
  let closestDist = Math.abs(hz - closest)
  for (const band of ISO_BANDS) {
    const dist = Math.abs(hz - band)
    if (dist < closestDist) {
      closestDist = dist
      closest = band
    }
  }
  return closest
}

export async function getSessionFrequencyStats(sessionId: string): Promise<FrequencyBin[]> {
  const rows = await sql`
    SELECT frequency, amplitude, severity
    FROM session_events
    WHERE session_id = ${sessionId}
      AND event_type = 'issue_detected'
      AND frequency IS NOT NULL
    ORDER BY frequency ASC
  `

  const bins = new Map<number, FrequencyBin>()

  for (const row of rows) {
    const hz = row.frequency as number
    const amp = (row.amplitude as number) ?? -60
    const sev = (row.severity as string) ?? 'unknown'
    const band = nearestIsoBand(hz)

    const existing = bins.get(band)
    if (existing) {
      existing.count++
      if (amp > existing.maxAmplitude) existing.maxAmplitude = amp
      existing.severities[sev] = (existing.severities[sev] ?? 0) + 1
    } else {
      bins.set(band, { bandHz: band, count: 1, maxAmplitude: amp, severities: { [sev]: 1 } })
    }
  }

  return Array.from(bins.values()).sort((a, b) => a.bandHz - b.bandHz)
}
