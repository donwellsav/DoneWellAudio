import { NextRequest, NextResponse } from 'next/server'

/**
 * Server-side proxy for Companion HTTP requests.
 *
 * The DoneWell PWA runs in a browser which enforces CORS. Companion's HTTP
 * server doesn't return CORS headers, so browser fetch() fails. This API
 * route proxies the request server-side where CORS doesn't apply.
 *
 * Usage:
 *   POST /api/companion/proxy
 *   Body: { url: "http://192.168.0.108:8000/instance/DoneWell/status", method: "GET" }
 *   Body: { url: "http://..../advisory", method: "POST", body: {...} }
 *
 * SSRF defense: only http/https allowed; private IPs, loopback, and cloud
 * metadata addresses (169.254.x.x) are blocked.
 */

/**
 * Returns true if the URL should be blocked to prevent SSRF.
 * Blocks: non-http/https schemes, loopback (IPv4 + IPv6), RFC 1918 private
 * ranges, cloud metadata (169.254.x.x), and IPv6 private/link-local ranges.
 */
function isBlockedHost(urlString: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(urlString)
  } catch {
    return true // malformed — block
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return true

  const host = parsed.hostname

  // IPv4 literal checks
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (m) {
    const a = Number(m[1])
    const b = Number(m[2])
    if (a === 0) return true            // 0.x.x.x — unspecified
    if (a === 10) return true           // 10.x.x.x — RFC 1918
    if (a === 127) return true          // 127.x.x.x — loopback
    if (a === 169 && b === 254) return true // 169.254.x.x — link-local / cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true // 172.16–31.x.x — RFC 1918
    if (a === 192 && b === 168) return true // 192.168.x.x — RFC 1918
  }

  // Loopback hostnames
  if (host === 'localhost' || host.endsWith('.localhost')) return true

  // IPv6 checks (new URL() strips brackets: '[::1]' → '::1')
  const lc = host.toLowerCase()
  if (lc === '::1') return true                          // IPv6 loopback
  if (lc === '::') return true                           // IPv6 unspecified
  if (lc.startsWith('::ffff:')) return true              // IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1)
  if (lc.startsWith('fe80')) return true                 // fe80::/10 — link-local
  if (lc.startsWith('fc') || lc.startsWith('fd')) return true  // fc00::/7 — unique local (private)
  if (lc.startsWith('ff')) return true                   // multicast

  return false
}

export async function POST(request: NextRequest) {
  try {
    const { url, method, body } = (await request.json()) as {
      url: string
      method?: string
      body?: unknown
    }

    if (!url) {
      return NextResponse.json({ error: 'Missing url' }, { status: 400 })
    }

    if (isBlockedHost(url)) {
      return NextResponse.json({ error: 'Forbidden target' }, { status: 403 })
    }

    const fetchOptions: RequestInit = {
      method: method ?? 'GET',
      signal: AbortSignal.timeout(3000),
    }

    if (body && method === 'POST') {
      fetchOptions.headers = { 'Content-Type': 'application/json' }
      fetchOptions.body = JSON.stringify(body)
    }

    const response = await fetch(url, fetchOptions)
    const text = await response.text()

    // Try to parse as JSON, fall back to text
    let data: unknown
    try {
      data = JSON.parse(text)
    } catch {
      data = { raw: text }
    }

    return NextResponse.json(data, { status: response.status })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Proxy request failed'
    console.error('[companion-proxy] Error:', message, 'URL:', (await request.clone().json().catch(() => ({}))).url)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
