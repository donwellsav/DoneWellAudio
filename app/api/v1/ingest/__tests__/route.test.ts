import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

function validBatch(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: '1.0',
    sessionId: 'test-session-uuid-1234567890',
    capturedAt: new Date().toISOString(),
    fftSize: 8192,
    sampleRate: 48000,
    binsPerSnapshot: 512,
    event: {
      relativeMs: 1000,
      frequencyHz: 1000,
      amplitudeDb: -20,
      severity: 'RESONANCE',
      confidence: 0.8,
      contentType: 'unknown',
    },
    snapshots: [
      { t: 0, s: 'A'.repeat(684) },
      { t: 100, s: 'B'.repeat(684) },
      { t: 200, s: 'C'.repeat(684) },
    ],
    ...overrides,
  }
}

function makeRequest(body: unknown, headers: Record<string, string> = {}): NextRequest {
  const json = JSON.stringify(body)
  return new NextRequest('http://localhost:3000/api/v1/ingest', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'content-length': String(json.length),
      'x-forwarded-for': '127.0.0.1',
      ...headers,
    },
    body: json,
  })
}

async function importRoute() {
  const mod = await import('../route')
  return mod
}

describe('POST /api/v1/ingest', () => {
  beforeEach(() => {
    vi.resetModules()
    delete process.env.SUPABASE_INGEST_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
  })

  describe('schema validation', () => {
    it('accepts a valid v1.0 batch', async () => {
      const { POST } = await importRoute()
      const res = await POST(makeRequest(validBatch()))
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.ok).toBe(true)
      expect(data.stored).toBe(false)
    })

    it('accepts a valid v1.1 batch with algorithm scores', async () => {
      const { POST } = await importRoute()
      const batch = validBatch({
        version: '1.1',
        event: {
          relativeMs: 1000,
          frequencyHz: 1000,
          amplitudeDb: -20,
          severity: 'RESONANCE',
          confidence: 0.8,
          contentType: 'unknown',
          algorithmScores: {
            fusedProbability: 0.85,
            fusedConfidence: 0.9,
            msd: 0.7,
          },
        },
      })
      const res = await POST(makeRequest(batch))
      expect(res.status).toBe(200)
    })

    it('accepts v1.2 with confirmed_feedback', async () => {
      const { POST } = await importRoute()
      const batch = validBatch({
        version: '1.2',
        event: {
          relativeMs: 1000,
          frequencyHz: 1000,
          amplitudeDb: -20,
          severity: 'RESONANCE',
          confidence: 0.8,
          contentType: 'unknown',
          userFeedback: 'confirmed_feedback',
        },
      })
      const res = await POST(makeRequest(batch))
      expect(res.status).toBe(200)
    })

    it('rejects unsupported version', async () => {
      const { POST } = await importRoute()
      const res = await POST(makeRequest(validBatch({ version: '2.0' })))
      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.error).toBe('Unsupported version')
    })

    it('rejects short sessionId', async () => {
      const { POST } = await importRoute()
      const res = await POST(makeRequest(validBatch({ sessionId: 'short' })))
      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe('Invalid sessionId')
    })

    it('rejects invalid fftSize', async () => {
      const { POST } = await importRoute()
      const res = await POST(makeRequest(validBatch({ fftSize: 1024 })))
      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe('Invalid fftSize')
    })

    it('rejects sampleRate out of range', async () => {
      const { POST } = await importRoute()
      const low = await POST(makeRequest(validBatch({ sampleRate: 4000 })))
      expect(low.status).toBe(400)
      const high = await POST(makeRequest(validBatch({ sampleRate: 100000 })))
      expect(high.status).toBe(400)
    })

    it('rejects wrong binsPerSnapshot', async () => {
      const { POST } = await importRoute()
      const res = await POST(makeRequest(validBatch({ binsPerSnapshot: 256 })))
      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe('binsPerSnapshot must be 512')
    })

    it('rejects missing event', async () => {
      const { POST } = await importRoute()
      const batch = validBatch()
      delete batch.event
      const res = await POST(makeRequest(batch))
      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe('Missing event')
    })

    it('rejects empty snapshots', async () => {
      const { POST } = await importRoute()
      const res = await POST(makeRequest(validBatch({ snapshots: [] })))
      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe('Empty snapshots')
    })

    it('rejects too many snapshots', async () => {
      const { POST } = await importRoute()
      const snapshots = Array.from({ length: 241 }, (_, i) => ({ t: i * 100, s: 'A'.repeat(684) }))
      const res = await POST(makeRequest(validBatch({ snapshots })))
      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe('Too many snapshots (max 240)')
    })

    it('rejects snapshot with missing t field', async () => {
      const { POST } = await importRoute()
      const res = await POST(makeRequest(validBatch({ snapshots: [{ s: 'A'.repeat(684) }] })))
      expect(res.status).toBe(400)
    })

    it('rejects snapshot with string too short', async () => {
      const { POST } = await importRoute()
      const res = await POST(makeRequest(validBatch({
        snapshots: [{ t: 0, s: 'A'.repeat(50) }],
      })))
      expect(res.status).toBe(400)
    })

    it('rejects invalid algorithmScores (missing fusedProbability)', async () => {
      const { POST } = await importRoute()
      const batch = validBatch({
        version: '1.1',
        event: {
          relativeMs: 1000,
          frequencyHz: 1000,
          amplitudeDb: -20,
          severity: 'RESONANCE',
          confidence: 0.8,
          contentType: 'unknown',
          algorithmScores: { fusedConfidence: 0.9 },
        },
      })
      const res = await POST(makeRequest(batch))
      expect(res.status).toBe(400)
      expect((await res.json()).error).toContain('fusedProbability')
    })

    it('rejects invalid userFeedback value', async () => {
      const { POST } = await importRoute()
      const batch = validBatch({
        event: {
          relativeMs: 1000,
          frequencyHz: 1000,
          amplitudeDb: -20,
          severity: 'RESONANCE',
          confidence: 0.8,
          contentType: 'unknown',
          userFeedback: 'invalid_value',
        },
      })
      const res = await POST(makeRequest(batch))
      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe('Invalid event.userFeedback')
    })
  })

  describe('payload size enforcement', () => {
    it('rejects oversized content-length header', async () => {
      const { POST } = await importRoute()
      const req = makeRequest(validBatch(), { 'content-length': '600000' })
      const res = await POST(req)
      expect(res.status).toBe(413)
    })

    it('rejects invalid JSON', async () => {
      const { POST } = await importRoute()
      const req = new NextRequest('http://localhost:3000/api/v1/ingest', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': '10',
          'x-forwarded-for': '127.0.0.1',
        },
        body: 'not json!!',
      })
      const res = await POST(req)
      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe('Invalid JSON')
    })
  })

  describe('rate limiting', () => {
    it('allows requests within session rate limit', async () => {
      const { POST } = await importRoute()
      for (let i = 0; i < 6; i++) {
        const res = await POST(makeRequest(validBatch()))
        expect(res.status).toBe(200)
      }
    })

    it('blocks requests exceeding session rate limit', async () => {
      const { POST } = await importRoute()
      for (let i = 0; i < 6; i++) {
        await POST(makeRequest(validBatch()))
      }
      const res = await POST(makeRequest(validBatch()))
      expect(res.status).toBe(429)
      expect((await res.json()).error).toBe('Rate limited')
    })

    it('different sessions have independent rate limits', async () => {
      const { POST } = await importRoute()
      for (let i = 0; i < 6; i++) {
        await POST(makeRequest(validBatch({ sessionId: 'session-aaaaaa-1234567890' })))
      }
      const res = await POST(makeRequest(validBatch({ sessionId: 'session-bbbbbb-1234567890' })))
      expect(res.status).toBe(200)
    })
  })

  describe('dev mode', () => {
    it('returns stored:false when Supabase not configured', async () => {
      const { POST } = await importRoute()
      const res = await POST(makeRequest(validBatch()))
      const data = await res.json()
      expect(data.ok).toBe(true)
      expect(data.stored).toBe(false)
      expect(data.reason).toContain('not configured')
    })
  })
})
