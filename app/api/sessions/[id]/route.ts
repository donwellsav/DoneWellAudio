import { NextRequest, NextResponse } from 'next/server'
import { endSession, getSession, getSessionEvents, deleteSession } from '@/lib/db/sessions'
import { rateLimit, getClientIp } from '@/lib/rateLimit'

interface Params {
  params: Promise<{ id: string }>
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  try {
    const [session, events] = await Promise.all([
      getSession(id),
      getSessionEvents(id),
    ])
    if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ session, events })
  } catch (err) {
    console.error('[sessions/:id] GET error:', err)
    return NextResponse.json({ error: 'Failed to load session' }, { status: 500 })
  }
}

export async function PATCH(_req: NextRequest, { params }: Params) {
  const { id } = await params
  try {
    const session = await endSession(id)
    if (!session) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    return NextResponse.json(session)
  } catch (err) {
    console.error('[sessions/:id] PATCH error:', err)
    return NextResponse.json({ error: 'Failed to end session' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { allowed, retryAfterMs } = rateLimit(getClientIp(_req))
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) } },
    )
  }
  const { id } = await params
  try {
    const deletedCount = await deleteSession(id)
    if (deletedCount === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    console.error('[sessions/:id] DELETE error:', err)
    return NextResponse.json({ error: 'Failed to delete session' }, { status: 500 })
  }
}
