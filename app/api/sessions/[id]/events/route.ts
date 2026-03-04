import { NextRequest, NextResponse } from 'next/server'
import { bulkInsertEvents } from '@/lib/db/sessions'
import { rateLimit, getClientIp } from '@/lib/rateLimit'

interface Params {
  params: Promise<{ id: string }>
}

export async function POST(req: NextRequest, { params }: Params) {
  const { allowed, retryAfterMs } = rateLimit(getClientIp(req))
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) } },
    )
  }
  const { id } = await params
  try {
    const body = await req.json()
    const { events } = body as {
      events: Array<{
        id: string
        type: string
        timestamp: number
        data: Record<string, unknown>
      }>
    }
    if (!Array.isArray(events)) {
      return NextResponse.json({ error: 'events must be an array' }, { status: 400 })
    }
    if (events.length === 0) {
      return NextResponse.json({ error: 'events array must not be empty' }, { status: 400 })
    }
    if (events.length > 500) {
      return NextResponse.json({ error: 'events array must not exceed 500 items' }, { status: 400 })
    }
    for (let i = 0; i < events.length; i++) {
      const ev = events[i]
      if (typeof ev.id !== 'string' || !ev.id) {
        return NextResponse.json({ error: `events[${i}].id must be a non-empty string` }, { status: 400 })
      }
      if (typeof ev.type !== 'string' || !ev.type) {
        return NextResponse.json({ error: `events[${i}].type must be a non-empty string` }, { status: 400 })
      }
      if (typeof ev.timestamp !== 'number' || ev.timestamp <= 0) {
        return NextResponse.json({ error: `events[${i}].timestamp must be a positive number` }, { status: 400 })
      }
      if (typeof ev.data !== 'object' || ev.data === null || Array.isArray(ev.data)) {
        return NextResponse.json({ error: `events[${i}].data must be an object` }, { status: 400 })
      }
    }
    await bulkInsertEvents(id, events)
    return NextResponse.json({ saved: events.length })
  } catch (err) {
    console.error('[sessions/:id/events] POST error:', err)
    const isFkViolation =
      err instanceof Error &&
      (('code' in err && (err as Record<string, unknown>).code === '23503') ||
        err.message.includes('foreign key'))
    if (isFkViolation) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }
    return NextResponse.json({ error: 'Failed to save events' }, { status: 500 })
  }
}
