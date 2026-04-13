import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

function makeRequest(
  method: 'GET' | 'POST' | 'DELETE',
  body?: unknown,
  ip: string = '127.0.0.1',
): NextRequest {
  return new NextRequest('http://localhost:3000/api/companion/relay/DWA-ABC123', {
    method,
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': ip,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

function validAdvisory(id: string) {
  return {
    id,
    severity: 'RUNAWAY',
    confidence: 0.85,
  }
}

const validParams = { params: Promise.resolve({ code: 'DWA-ABC123' }) }
const invalidParams = { params: Promise.resolve({ code: 'bad' }) }

async function importRoute() {
  return import('../route')
}

describe('relay route', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('rejects invalid relay codes', async () => {
    const { GET, POST, DELETE } = await importRoute()

    expect((await GET(makeRequest('GET'), invalidParams)).status).toBe(400)
    expect((await POST(makeRequest('POST', validAdvisory('adv-1')), invalidParams)).status).toBe(400)
    expect((await DELETE(makeRequest('DELETE'), invalidParams)).status).toBe(400)
  })

  it('accepts advisories and drains the queue on GET', async () => {
    const { GET, POST } = await importRoute()

    const postRes = await POST(makeRequest('POST', validAdvisory('adv-1')), validParams)
    expect(postRes.status).toBe(200)
    expect(await postRes.json()).toMatchObject({ accepted: true, pendingCount: 1 })

    const firstPoll = await GET(makeRequest('GET'), validParams)
    expect(firstPoll.status).toBe(200)
    expect(await firstPoll.json()).toMatchObject({
      ok: true,
      pendingCount: 1,
      advisories: [expect.objectContaining({ id: 'adv-1' })],
    })

    const secondPoll = await GET(makeRequest('GET'), validParams)
    expect(await secondPoll.json()).toMatchObject({
      ok: true,
      pendingCount: 0,
      advisories: [],
    })
  })

  it('accepts control messages and caps queues at 20 entries', async () => {
    const { GET, POST } = await importRoute()

    const controlRes = await POST(makeRequest('POST', { type: 'resolve' }), validParams)
    expect(controlRes.status).toBe(200)

    for (let i = 0; i < 25; i++) {
      await POST(makeRequest('POST', validAdvisory(`adv-${i}`)), validParams)
    }

    const pollRes = await GET(makeRequest('GET'), validParams)
    const data = await pollRes.json()

    expect(data.pendingCount).toBe(20)
    expect(data.advisories).toHaveLength(20)
    expect(data.advisories[0]).toMatchObject({ id: 'adv-5' })
    expect(data.advisories.at(-1)).toMatchObject({ id: 'adv-24' })
  })

  it('validates POST payloads', async () => {
    const { POST } = await importRoute()

    const badConfidence = await POST(makeRequest('POST', {
      id: 'adv-1',
      severity: 'RUNAWAY',
      confidence: 2,
    }), validParams)
    expect(badConfidence.status).toBe(400)
    expect(await badConfidence.json()).toEqual({ error: 'Invalid confidence' })

    const badControl = await POST(makeRequest('POST', { type: 'reboot_everything' }), validParams)
    expect(badControl.status).toBe(400)
    expect(await badControl.json()).toEqual({ error: 'Unknown type: reboot_everything' })
  })

  it('rate limits repeated polls from the same IP', async () => {
    const { GET } = await importRoute()

    for (let i = 0; i < 600; i++) {
      const res = await GET(makeRequest('GET', undefined, '10.0.0.9'), validParams)
      expect(res.status).toBe(200)
    }

    const blocked = await GET(makeRequest('GET', undefined, '10.0.0.9'), validParams)
    expect(blocked.status).toBe(429)
    expect(blocked.headers.get('Retry-After')).toBe('60')
  })
})
