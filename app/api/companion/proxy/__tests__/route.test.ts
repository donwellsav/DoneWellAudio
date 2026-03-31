import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('node:dns/promises', () => ({
  default: {
    lookup: vi.fn().mockResolvedValue([{ address: '93.184.216.34', family: 4 }]),
  },
}))

function makeRequest(body: unknown, headers?: Record<string, string>): NextRequest {
  return new NextRequest('http://localhost:3000/api/companion/proxy', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'origin': 'http://localhost:3000', // Same-origin by default
      ...headers,
    },
    body: JSON.stringify(body),
  })
}

/** Make a request with no Origin header (simulates non-browser client). */
function makeNoOriginRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/companion/proxy', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/** Make a request with a cross-origin Origin header. */
function makeCrossOriginRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/companion/proxy', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'origin': 'http://evil.com',
    },
    body: JSON.stringify(body),
  })
}

const routePromise = import('../route')
async function getRoute() {
  return routePromise
}

async function getDnsMock() {
  const mod = await import('node:dns/promises')
  return mod.default.lookup as ReturnType<typeof vi.fn>
}

describe('POST /api/companion/proxy', () => {
  beforeEach(async () => {
    const lookup = await getDnsMock()
    lookup.mockReset().mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  // === Basic validation ===

  it('rejects requests without a url', async () => {
    const { POST } = await getRoute()
    const res = await POST(makeRequest({ method: 'GET' }))
    expect(res.status).toBe(400)
  })

  // === Origin/CSRF protection ===

  it('blocks cross-origin requests', async () => {
    const { POST } = await getRoute()
    const res = await POST(makeCrossOriginRequest({ url: 'http://192.168.0.108:8000/status', method: 'GET' }))
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'Cross-origin request blocked' })
  })

  it('allows same-origin requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const { POST } = await getRoute()
    const res = await POST(makeRequest({ url: 'http://example.com:8000/status', method: 'GET' }))
    expect(res.status).toBe(200)
  })

  // === IPv6 blocked (Companion is IPv4-only) ===

  it('blocks IPv6 targets', async () => {
    const { POST } = await getRoute()
    expect((await POST(makeRequest({ url: 'http://[::1]:8000/status' }))).status).toBe(403)
    expect((await POST(makeRequest({ url: 'http://[fd00::1234]:8000/status' }))).status).toBe(403)
    expect((await POST(makeRequest({ url: 'http://[fe80::1]:8000/status' }))).status).toBe(403)
  })

  it('blocks DNS resolving to IPv6', async () => {
    const lookup = await getDnsMock()
    lookup.mockResolvedValueOnce([{ address: 'fd00::1', family: 6 }])

    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const { POST } = await getRoute()
    const res = await POST(makeRequest({ url: 'http://v6host.local:8000/status' }))
    expect(res.status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('blocks requests without Origin header', async () => {
    const { POST } = await getRoute()
    const res = await POST(makeNoOriginRequest({ url: 'http://192.168.0.108:8000/status', method: 'GET' }))
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'Cross-origin request blocked' })
  })

  // === Scheme check: only HTTP allowed ===

  it('blocks HTTPS proxying', async () => {
    const { POST } = await getRoute()
    const res = await POST(makeRequest({ url: 'https://example.com/status', method: 'GET' }))
    expect(res.status).toBe(403)
  })

  // === Dangerous targets blocked ===

  it('blocks loopback', async () => {
    const { POST } = await getRoute()
    expect((await POST(makeRequest({ url: 'http://localhost:8000/status' }))).status).toBe(403)
    expect((await POST(makeRequest({ url: 'http://127.0.0.1:8000/status' }))).status).toBe(403)
  })

  it('blocks cloud metadata (169.254.x.x)', async () => {
    const { POST } = await getRoute()
    expect((await POST(makeRequest({ url: 'http://169.254.169.254/latest/meta-data/' }))).status).toBe(403)
  })

  it('blocks CGNAT IP (100.64.x.x)', async () => {
    const { POST } = await getRoute()
    expect((await POST(makeRequest({ url: 'http://100.64.0.1:8000/status' }))).status).toBe(403)
  })

  it('blocks benchmarking IP (198.18.x.x)', async () => {
    const { POST } = await getRoute()
    expect((await POST(makeRequest({ url: 'http://198.18.0.1:8000/status' }))).status).toBe(403)
  })

  // === RFC 1918 blocked (cloud deployment — private IPs reach Vercel infra) ===

  it('blocks RFC 1918 private IPs', async () => {
    const { POST } = await getRoute()
    expect((await POST(makeRequest({ url: 'http://192.168.0.108:8000/status' }))).status).toBe(403)
    expect((await POST(makeRequest({ url: 'http://10.0.1.50:8000/status' }))).status).toBe(403)
    expect((await POST(makeRequest({ url: 'http://172.16.0.5:8000/status' }))).status).toBe(403)
  })

  // === DNS rebinding prevention ===

  it('blocks DNS rebinding to loopback', async () => {
    const lookup = await getDnsMock()
    lookup.mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }])

    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const { POST } = await getRoute()
    const res = await POST(makeRequest({ url: 'http://evil.com:8000/status' }))
    expect(res.status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('blocks multi-record DNS with any dangerous IP', async () => {
    const lookup = await getDnsMock()
    lookup.mockResolvedValueOnce([
      { address: '93.184.216.34', family: 4 },
      { address: '127.0.0.1', family: 4 },
    ])

    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const { POST } = await getRoute()
    const res = await POST(makeRequest({ url: 'http://multi.evil.com/status' }))
    expect(res.status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('blocks DNS resolving to RFC 1918', async () => {
    const lookup = await getDnsMock()
    lookup.mockResolvedValueOnce([{ address: '192.168.1.100', family: 4 }])

    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const { POST } = await getRoute()
    const res = await POST(makeRequest({ url: 'http://companion.local:8000/status', method: 'GET' }))
    expect(res.status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('dual-stack hostname: uses IPv4 record, ignores IPv6', async () => {
    const lookup = await getDnsMock()
    // Hostname returns both A and AAAA records — should use IPv4, ignore IPv6
    lookup.mockResolvedValueOnce([
      { address: '93.184.216.34', family: 4 },
      { address: 'fd00::1234', family: 6 },
    ])

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const { POST } = await getRoute()
    const res = await POST(makeRequest({ url: 'http://dual-stack.example.com:8000/status', method: 'GET' }))
    expect(res.status).toBe(200)
    // Should pin to the IPv4 address, not reject because of IPv6
    expect((fetchMock.mock.calls[0][0] as string)).toContain('93.184.216.34')
  })

  it('IPv6-only hostname blocked', async () => {
    const lookup = await getDnsMock()
    lookup.mockResolvedValueOnce([{ address: 'fd00::1234', family: 6 }])

    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const { POST } = await getRoute()
    const res = await POST(makeRequest({ url: 'http://v6only.example.com:8000/status', method: 'GET' }))
    expect(res.status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  // === IP pinning ===

  it('pins fetch to validated IP (TOCTOU-safe)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const { POST } = await getRoute()
    const res = await POST(makeRequest({ url: 'http://example.com:8000/status', method: 'GET' }))

    expect(res.status).toBe(200)
    const fetchedUrl = fetchMock.mock.calls[0][0] as string
    expect(fetchedUrl).toContain('93.184.216.34')
    expect(fetchedUrl).not.toContain('example.com')
    const headers = fetchMock.mock.calls[0][1].headers as Headers
    expect(headers.get('Host')).toBe('example.com:8000')
  })

  it('preserves non-default port in Host header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const { POST } = await getRoute()
    await POST(makeRequest({ url: 'http://example.com:9090/api', method: 'GET' }))

    const headers = fetchMock.mock.calls[0][1].headers as Headers
    expect(headers.get('Host')).toBe('example.com:9090')
  })

  // === DNS failure handling ===

  it('DNS timeout returns 504 (not 403)', async () => {
    const lookup = await getDnsMock()
    lookup.mockImplementation(() => new Promise(() => {}))

    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const { POST } = await getRoute()
    const res = await POST(makeRequest({ url: 'http://slow-dns.example.com/status', method: 'GET' }))

    expect(res.status).toBe(504)
    expect(fetchMock).not.toHaveBeenCalled()
    const body = await res.json()
    expect(body.error).toContain('DNS resolution failed')
  })

  it('DNS resolution failure returns 504', async () => {
    const lookup = await getDnsMock()
    lookup.mockRejectedValueOnce(new Error('ENOTFOUND'))

    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const { POST } = await getRoute()
    const res = await POST(makeRequest({ url: 'http://nonexistent.invalid/status', method: 'GET' }))

    expect(res.status).toBe(504)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  // === Response size cap ===

  it('rejects oversized upstream responses', async () => {
    // Create a response larger than 1MB
    const bigBody = 'x'.repeat(1024 * 1024 + 100)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(bigBody, {
        status: 200,
        headers: { 'content-length': String(bigBody.length) },
      }),
    ))

    const { POST } = await getRoute()
    const res = await POST(makeRequest({ url: 'http://example.com/big', method: 'GET' }))

    expect(res.status).toBe(502)
    const body = await res.json()
    expect(body.error).toContain('too large')
  })

  // === Redirect validation ===

  it('blocks redirect to cloud metadata', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { location: 'http://169.254.169.254/latest/meta-data/' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const { POST } = await getRoute()
    const res = await POST(makeRequest({ url: 'http://example.com/redirect', method: 'GET' }))
    expect(res.status).toBe(403)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('blocks redirect where DNS resolves to loopback', async () => {
    const lookup = await getDnsMock()
    lookup.mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }])
    lookup.mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }])

    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { location: 'http://rebind.evil.com/steal' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const { POST } = await getRoute()
    const res = await POST(makeRequest({ url: 'http://example.com/hop', method: 'GET' }))
    expect(res.status).toBe(403)
  })

  it('blocks redirect to HTTPS', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(null, {
        status: 301,
        headers: { location: 'https://example.com/secure' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const { POST } = await getRoute()
    const res = await POST(makeRequest({ url: 'http://example.com/start', method: 'GET' }))
    expect(res.status).toBe(403)
  })

  it('follows safe redirects with IP pinning', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 301,
          headers: { location: 'http://example.com/new-path' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ redirected: true }), { status: 200 }),
      )
    vi.stubGlobal('fetch', fetchMock)

    const { POST } = await getRoute()
    const res = await POST(makeRequest({ url: 'http://example.com/old-path', method: 'GET' }))

    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect((fetchMock.mock.calls[0][0] as string)).toContain('93.184.216.34')
    expect((fetchMock.mock.calls[1][0] as string)).toContain('93.184.216.34')
  })

  it('multi-hop relative redirect resolves against current hop', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 301,
          headers: { location: 'http://other.example.com/base/' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(null, {
          status: 301,
          headers: { location: './final' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ hop: 3 }), { status: 200 }),
      )
    vi.stubGlobal('fetch', fetchMock)

    const { POST } = await getRoute()
    const res = await POST(makeRequest({ url: 'http://example.com/start', method: 'GET' }))

    expect(res.status).toBe(200)
    const thirdHeaders = fetchMock.mock.calls[2][1].headers as Headers
    expect(thirdHeaders.get('Host')).toBe('other.example.com')
  })

  it('307 redirect preserves POST method and body', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 307,
          headers: { location: 'http://example.com/new-endpoint' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ preserved: true }), { status: 200 }),
      )
    vi.stubGlobal('fetch', fetchMock)

    const { POST } = await getRoute()
    const payload = { action: 'advisory' }
    const res = await POST(makeRequest({
      url: 'http://example.com/old-endpoint',
      method: 'POST',
      body: payload,
    }))

    expect(res.status).toBe(200)
    const redirectCall = fetchMock.mock.calls[1][1]
    expect(redirectCall.method).toBe('POST')
    expect(redirectCall.body).toBe(JSON.stringify(payload))
  })

  it('301 redirect demotes POST to GET and drops body', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 301,
          headers: { location: 'http://example.com/moved' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ demoted: true }), { status: 200 }),
      )
    vi.stubGlobal('fetch', fetchMock)

    const { POST } = await getRoute()
    const res = await POST(makeRequest({
      url: 'http://example.com/old',
      method: 'POST',
      body: { data: 'test' },
    }))

    expect(res.status).toBe(200)
    const redirectCall = fetchMock.mock.calls[1][1]
    expect(redirectCall.method).toBe('GET')
    expect(redirectCall.body).toBeUndefined()
  })

  // === Normal proxy behavior ===

  it('forwards JSON requests and preserves upstream status', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, source: 'upstream' }), { status: 201 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const { POST } = await getRoute()
    const payload = { action: 'ping' }
    const res = await POST(makeRequest({
      url: 'http://example.com/instance/donewell/advisory',
      method: 'POST',
      body: payload,
    }))

    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ ok: true, source: 'upstream' })
  })

  it('wraps non-JSON upstream responses as raw text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response('plain text response', { status: 202 }),
    ))

    const { POST } = await getRoute()
    const res = await POST(makeRequest({ url: 'http://example.com/plain', method: 'GET' }))
    expect(res.status).toBe(202)
    expect(await res.json()).toEqual({ raw: 'plain text response' })
  })

  it('returns 502 when the upstream request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('socket hang up')))

    const { POST } = await getRoute()
    const res = await POST(makeRequest({ url: 'http://example.com/fail', method: 'GET' }))
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'socket hang up' })
  })
})
