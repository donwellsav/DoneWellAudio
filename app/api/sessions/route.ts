import { NextRequest, NextResponse } from 'next/server'
import { createSession, listSessions } from '@/lib/db/sessions'
import { rateLimit, getClientIp } from '@/lib/rateLimit'

export async function GET() {
  try {
    const sessions = await listSessions(50)
    return NextResponse.json(sessions)
  } catch (err) {
    console.error('[sessions] GET error:', err)
    return NextResponse.json({ error: 'Failed to load sessions' }, { status: 500 })
  }
}

const VALID_FFT_SIZES = [4096, 8192, 16384] as const
const VALID_MODES = ['feedbackHunt', 'vocalRing', 'musicAware', 'aggressive', 'calibration'] as const
const ID_PATTERN = /^[a-zA-Z0-9\-_]{1,128}$/

export async function POST(req: NextRequest) {
  const { allowed, retryAfterMs } = rateLimit(getClientIp(req))
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) } },
    )
  }
  try {
    const body = await req.json()
    const { id, mode, fftSize } = body as { id: unknown; mode: unknown; fftSize: unknown }

    // Type checks
    if (typeof id !== 'string') {
      return NextResponse.json({ error: 'id must be a string' }, { status: 400 })
    }
    if (typeof mode !== 'string') {
      return NextResponse.json({ error: 'mode must be a string' }, { status: 400 })
    }
    if (typeof fftSize !== 'number') {
      return NextResponse.json({ error: 'fftSize must be a number' }, { status: 400 })
    }

    // Value validation
    if (!ID_PATTERN.test(id)) {
      return NextResponse.json(
        { error: 'id must be 1-128 characters, alphanumeric, hyphens, or underscores' },
        { status: 400 },
      )
    }
    if (!(VALID_MODES as readonly string[]).includes(mode)) {
      return NextResponse.json(
        { error: `mode must be one of: ${VALID_MODES.join(', ')}` },
        { status: 400 },
      )
    }
    if (!(VALID_FFT_SIZES as readonly number[]).includes(fftSize)) {
      return NextResponse.json(
        { error: `fftSize must be one of: ${VALID_FFT_SIZES.join(', ')}` },
        { status: 400 },
      )
    }

    const session = await createSession({ id, mode, fftSize })
    return NextResponse.json(session, { status: 201 })
  } catch (err) {
    // Catch duplicate key (unique_violation) from Postgres
    if (err instanceof Error && err.message.includes('duplicate key')) {
      return NextResponse.json({ error: 'Session with this id already exists' }, { status: 409 })
    }
    console.error('[sessions] POST error:', err)
    return NextResponse.json({ error: 'Failed to create session' }, { status: 500 })
  }
}
