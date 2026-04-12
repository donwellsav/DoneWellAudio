/**
 * Tests for bidirectional relay: dual-queue (toModule + toApp),
 * direction parameter, HEAD health check, and auto_apply message type.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

function makeRequest(
  method: 'GET' | 'POST' | 'DELETE' | 'HEAD',
  body?: unknown,
  direction?: 'app' | 'module',
  ip: string = '127.0.0.1',
): NextRequest {
  const url = direction === 'app'
    ? 'http://localhost:3000/api/companion/relay/DWA-ABC123?direction=app'
    : 'http://localhost:3000/api/companion/relay/DWA-ABC123'
  return new NextRequest(url, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': ip,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

const validParams = { params: Promise.resolve({ code: 'DWA-ABC123' }) }

async function importRoute() {
  return import('../route')
}

describe('relay route — bidirectional', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  describe('dual-queue isolation', () => {
    it('DWA POST and module GET use the toModule queue (default direction)', async () => {
      const { GET, POST } = await importRoute()

      await POST(makeRequest('POST', { id: 'adv-1', severity: 'RUNAWAY', confidence: 0.9 }), validParams)

      const moduleGet = await GET(makeRequest('GET'), validParams)
      const data = await moduleGet.json()
      expect(data.advisories).toHaveLength(1)
      expect(data.advisories[0]).toMatchObject({ id: 'adv-1' })
    })

    it('module POST and DWA GET use the toApp queue (direction=app)', async () => {
      const { GET, POST } = await importRoute()

      // Module posts an ack
      const postRes = await POST(
        makeRequest('POST', { type: 'ack', advisoryId: 'adv-1', timestamp: 1000 }, 'app'),
        validParams,
      )
      expect(postRes.status).toBe(200)
      expect(await postRes.json()).toMatchObject({ accepted: true, pendingCount: 1 })

      // DWA polls the toApp queue
      const dwaGet = await GET(makeRequest('GET', undefined, 'app'), validParams)
      const data = await dwaGet.json()
      expect(data.ok).toBe(true)
      expect(data.messages).toHaveLength(1)
      expect(data.messages[0]).toMatchObject({ type: 'ack', advisoryId: 'adv-1' })
    })

    it('queues are independent — toModule post does not appear in toApp drain', async () => {
      const { GET, POST } = await importRoute()

      await POST(makeRequest('POST', { id: 'adv-1', severity: 'RUNAWAY', confidence: 0.9 }), validParams)

      const dwaGet = await GET(makeRequest('GET', undefined, 'app'), validParams)
      const data = await dwaGet.json()
      expect(data.messages).toEqual([])
      expect(data.pendingCount).toBe(0)
    })

    it('queues drain independently — module GET does not consume toApp', async () => {
      const { GET, POST } = await importRoute()

      // Seed both queues
      await POST(makeRequest('POST', { id: 'adv-1', severity: 'RUNAWAY', confidence: 0.9 }), validParams)
      await POST(
        makeRequest('POST', { type: 'ack', advisoryId: 'adv-1', timestamp: 1000 }, 'app'),
        validParams,
      )

      // Module drains toModule
      await GET(makeRequest('GET'), validParams)

      // toApp should still have the ack
      const dwaGet = await GET(makeRequest('GET', undefined, 'app'), validParams)
      const data = await dwaGet.json()
      expect(data.messages).toHaveLength(1)
    })
  })

  describe('HEAD health check', () => {
    it('returns 200 without draining any queue', async () => {
      const { GET, HEAD, POST } = await importRoute()

      await POST(makeRequest('POST', { id: 'adv-1', severity: 'RUNAWAY', confidence: 0.9 }), validParams)

      const headRes = await HEAD(makeRequest('HEAD'), validParams)
      expect(headRes.status).toBe(200)

      // Queue should still have the advisory
      const moduleGet = await GET(makeRequest('GET'), validParams)
      const data = await moduleGet.json()
      expect(data.advisories).toHaveLength(1)
    })

    it('returns 400 for invalid pairing code', async () => {
      const { HEAD } = await importRoute()
      const res = await HEAD(makeRequest('HEAD'), { params: Promise.resolve({ code: 'bad' }) })
      expect(res.status).toBe(400)
    })
  })

  describe('auto_apply message type', () => {
    it('accepts auto_apply with advisory payload', async () => {
      const { POST } = await importRoute()

      const res = await POST(
        makeRequest('POST', {
          type: 'auto_apply',
          id: 'adv-runaway-1',
          severity: 'RUNAWAY',
          confidence: 0.95,
          trueFrequencyHz: 1247,
          peq: { type: 'bell', hz: 1247, q: 8, gainDb: -6 },
          geq: { bandHz: 1250, bandIndex: 20, suggestedDb: -3 },
          pitch: { note: 'D#', octave: 6, cents: 0, midi: 87 },
        }),
        validParams,
      )
      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({ accepted: true })
    })

    it('rejects auto_apply with invalid confidence', async () => {
      const { POST } = await importRoute()

      const res = await POST(
        makeRequest('POST', {
          type: 'auto_apply',
          id: 'adv-1',
          severity: 'RUNAWAY',
          confidence: 1.5,
        }),
        validParams,
      )
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: 'Invalid confidence' })
    })
  })

  describe('toApp validation', () => {
    it('rejects toApp payload without type field', async () => {
      const { POST } = await importRoute()
      const res = await POST(
        makeRequest('POST', { advisoryId: 'adv-1' }, 'app'),
        validParams,
      )
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: 'Missing type field' })
    })

    it('rejects toApp payload with unknown type', async () => {
      const { POST } = await importRoute()
      const res = await POST(
        makeRequest('POST', { type: 'hackme' }, 'app'),
        validParams,
      )
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: 'Unknown type: hackme' })
    })

    it('accepts all known toApp message types', async () => {
      const { POST } = await importRoute()
      const types = ['ack', 'applied', 'apply_failed', 'partial_apply', 'cleared', 'command', 'pong']
      for (const type of types) {
        const res = await POST(
          makeRequest('POST', { type, timestamp: 1000 }, 'app'),
          validParams,
        )
        expect(res.status).toBe(200)
      }
    })

    it('caps advisoryId length', async () => {
      const { POST } = await importRoute()
      const res = await POST(
        makeRequest('POST', { type: 'ack', advisoryId: 'x'.repeat(101), timestamp: 1 }, 'app'),
        validParams,
      )
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: 'advisoryId too long' })
    })
  })

  describe('backward compatibility', () => {
    it('existing module v0.3.0 polling pattern still works (no direction param)', async () => {
      const { GET, POST } = await importRoute()

      // Old-style POST (DWA → module)
      const post = await POST(
        makeRequest('POST', { id: 'adv-1', severity: 'RUNAWAY', confidence: 0.9 }),
        validParams,
      )
      expect(post.status).toBe(200)

      // Old-style GET (module polling)
      const get = await GET(makeRequest('GET'), validParams)
      const data = await get.json()
      expect(data.ok).toBe(true)
      expect(data.advisories).toHaveLength(1)
      expect(data.pendingCount).toBe(1)
    })
  })
})
