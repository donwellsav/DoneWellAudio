import { NextRequest, NextResponse } from 'next/server'
import dns from 'node:dns/promises'

/**
 * Server-side HTTP proxy for public Companion endpoints.
 *
 * Proxies same-origin browser requests to public HTTP targets, bypassing
 * CORS restrictions that prevent direct browser fetch to Companion servers.
 *
 * **Scope:** Public HTTP endpoints only. All private/special-use IP ranges
 * (RFC 1918, loopback, link-local, CGNAT, etc.) are blocked. On Vercel,
 * private IPs reach Vercel's infrastructure, not the user's LAN.
 * For LAN Companion access, use the relay endpoint (`/api/companion/relay/[code]`).
 *
 * Usage:
 *   POST /api/companion/proxy
 *   Body: { url: "http://companion.example.com:8000/instance/DoneWell/status", method: "GET" }
 *   Body: { url: "http://companion.example.com:8000/advisory", method: "POST", body: {...} }
 *
 * Trust model:
 *   - Browser-only: Origin header required, must match deployment origin
 *   - HTTP only: HTTPS blocked (eliminates TLS/SNI rebinding surface)
 *   - All private IPs blocked: RFC 6890 complete blocklist
 *   - Response size capped: 1MB max prevents memory exhaustion
 *
 * SSRF defense (defense-in-depth, TOCTOU-safe):
 *   1. Origin check — rejects cross-origin and no-Origin requests
 *   2. Scheme check — only http:// allowed
 *   3. String-level IP check — RFC 6890 blocklist (13 ranges)
 *   4. DNS resolution via OS resolver — validates ALL IPv4 records
 *   5. IP pinning — rewrites URL to validated IP before fetch (no TOCTOU)
 *   6. Dual-stack safe — filters to IPv4 only, ignores AAAA records
 *   7. Manual redirect following — re-validates + re-pins each hop
 *   8. 307/308 method preservation — correct HTTP redirect semantics
 *   9. DNS timeout — 2s deadline prevents resolver-based DoS
 *  10. Response size cap — 1MB streaming reader with early abort
 *  11. Distinct error codes — 403 policy, 504 DNS, 502 upstream
 */

/** Max redirect hops to follow manually. */
const MAX_REDIRECTS = 5

/** DNS resolution timeout in ms. */
const DNS_TIMEOUT_MS = 2000

/** Max upstream response body size in bytes (1 MB). */
const MAX_RESPONSE_BYTES = 1024 * 1024

/**
 * Returns true if an IPv4 address is non-globally-reachable (RFC 6890).
 * Blocks ALL private/special-use ranges including RFC 1918.
 * On Vercel, private IPs reach Vercel's infrastructure, not the user's LAN.
 */
function isBlockedIPv4(ip: string): boolean {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!m) return false
  const a = Number(m[1])
  const b = Number(m[2])
  const c = Number(m[3])
  if (a === 0) return true                          // 0.0.0.0/8 — unspecified
  if (a === 10) return true                          // 10.0.0.0/8 — RFC 1918
  if (a === 100 && b >= 64 && b <= 127) return true  // 100.64.0.0/10 — CGNAT
  if (a === 127) return true                          // 127.0.0.0/8 — loopback
  if (a === 169 && b === 254) return true             // 169.254.0.0/16 — link-local / metadata
  if (a === 172 && b >= 16 && b <= 31) return true    // 172.16.0.0/12 — RFC 1918
  if (a === 192 && b === 0 && c === 0) return true    // 192.0.0.0/24 — IETF
  if (a === 192 && b === 0 && c === 2) return true    // 192.0.2.0/24 — TEST-NET-1
  if (a === 192 && b === 168) return true             // 192.168.0.0/16 — RFC 1918
  if (a === 198 && (b === 18 || b === 19)) return true // 198.18.0.0/15 — benchmarking
  if (a === 198 && b === 51 && c === 100) return true // 198.51.100.0/24 — TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true  // 203.0.113.0/24 — TEST-NET-3
  if (a >= 240) return true                           // 240.0.0.0/4 — reserved
  return false
}

/**
 * All IPv6 is blocked — Companion is IPv4-only on LAN.
 * Exception: IPv4-mapped (::ffff:x.x.x.x) delegates to the IPv4 check.
 */
function isBlockedIPv6(ip: string): boolean {
  const lc = ip.toLowerCase()
  if (lc.startsWith('::ffff:')) return isBlockedIPv4(lc.slice(7))
  if (lc.includes(':')) return true // All IPv6
  return false
}

/** Returns true if a resolved address is dangerous. */
function isBlockedAddress(addr: string): boolean {
  return isBlockedIPv4(addr) || isBlockedIPv6(addr)
}

/**
 * Returns true if the URL should be blocked (string-level check).
 * Only http:// is allowed — HTTPS proxying is blocked entirely.
 */
function isBlockedHost(urlString: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(urlString)
  } catch {
    return true
  }

  // Only HTTP allowed — Companion is always HTTP on LAN
  if (parsed.protocol !== 'http:') return true

  const host = parsed.hostname
  if (isBlockedIPv4(host)) return true
  if (host === 'localhost' || host.endsWith('.localhost')) return true
  if (isBlockedIPv6(host)) return true

  return false
}

/** Race a promise against a timeout. */
async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    clearTimeout(timer!)
  }
}

/** Sentinel class to distinguish DNS failures from policy blocks. */
class DnsError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DnsError'
  }
}

/**
 * Resolves and validates a URL. Uses dns.lookup (OS resolver) with { all: true },
 * rejects if ANY address is dangerous, then returns a pinned URL with the
 * validated IP in place of the hostname (TOCTOU-safe).
 *
 * Throws DnsError for resolution failures (→ 504).
 * Returns null for policy blocks (→ 403).
 */
async function resolveAndPin(urlString: string): Promise<{
  fetchUrl: string
  originalAuthority: string
} | null> {
  let parsed: URL
  try {
    parsed = new URL(urlString)
  } catch {
    return null
  }

  const host = parsed.hostname
  const authority = parsed.host // hostname:port

  // IP literals are already pinned — isBlockedHost already validated them
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(host) || host.includes(':')) {
    return { fetchUrl: urlString, originalAuthority: authority }
  }

  // Resolve using OS resolver
  let addresses: { address: string; family: number }[]
  try {
    addresses = await withTimeout(
      dns.lookup(host, { all: true }),
      DNS_TIMEOUT_MS,
      'DNS resolution',
    )
  } catch (err) {
    throw new DnsError(err instanceof Error ? err.message : 'DNS resolution failed')
  }

  if (addresses.length === 0) {
    throw new DnsError(`No DNS records for ${host}`)
  }

  // Filter to IPv4 only — Companion is IPv4-only, and we block all IPv6.
  // This prevents dual-stack hostnames (A + AAAA) from being rejected just
  // because they have an IPv6 record alongside a valid IPv4 one.
  const ipv4Addresses = addresses.filter(a => a.family === 4)
  if (ipv4Addresses.length === 0) {
    return null // IPv6-only hostname — blocked (Companion is IPv4-only)
  }

  // Reject if ANY IPv4 address is blocked
  for (const { address } of ipv4Addresses) {
    if (isBlockedIPv4(address)) return null
  }

  // Pin to first validated IPv4 address
  const pinnedIP = ipv4Addresses[0].address
  const pinned = new URL(urlString)
  pinned.hostname = pinnedIP
  return { fetchUrl: pinned.toString(), originalAuthority: authority }
}

/**
 * Fetch with IP pinning. Sends the original authority (hostname:port)
 * via the Host header so the server sees the correct virtual host.
 */
async function pinnedFetch(
  fetchUrl: string,
  originalAuthority: string,
  options: RequestInit,
): Promise<Response> {
  const headers = new Headers(options.headers)
  headers.set('Host', originalAuthority)
  return fetch(fetchUrl, { ...options, headers })
}

/**
 * Read response body with a size cap. Returns the text if within limit,
 * or throws if the response exceeds MAX_RESPONSE_BYTES.
 */
async function readResponseCapped(response: Response): Promise<string> {
  // Check Content-Length header first (fast path)
  const contentLength = response.headers.get('content-length')
  if (contentLength && parseInt(contentLength, 10) > MAX_RESPONSE_BYTES) {
    throw new Error(`Upstream response too large: ${contentLength} bytes`)
  }

  // Stream-read with byte counting for chunked/unknown-length responses
  const reader = response.body?.getReader()
  if (!reader) return ''

  const chunks: Uint8Array[] = []
  let totalBytes = 0

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    totalBytes += value.byteLength
    if (totalBytes > MAX_RESPONSE_BYTES) {
      reader.cancel()
      throw new Error(`Upstream response exceeds ${MAX_RESPONSE_BYTES} byte limit`)
    }
    chunks.push(value)
  }

  const merged = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(merged)
}

/**
 * Validates the request origin to prevent CSRF. Only same-origin requests
 * (from the DoneWell PWA) are allowed. Requests without an Origin header
 * are rejected — this proxy is browser-only.
 */
function isValidOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin')
  if (!origin) return false // No Origin = not a browser request, reject

  const requestUrl = new URL(request.url)
  try {
    const originUrl = new URL(origin)
    return originUrl.origin === requestUrl.origin
  } catch {
    return false
  }
}

export async function POST(request: NextRequest) {
  let requestedUrl: string | undefined
  try {
    // Layer 1: Origin/CSRF check
    if (!isValidOrigin(request)) {
      return NextResponse.json({ error: 'Cross-origin request blocked' }, { status: 403 })
    }

    const { url, method, body } = (await request.json()) as {
      url: string
      method?: string
      body?: unknown
    }
    requestedUrl = url

    if (!url) {
      return NextResponse.json({ error: 'Missing url' }, { status: 400 })
    }

    // Layer 2: Scheme + string-level IP check
    if (isBlockedHost(url)) {
      return NextResponse.json({ error: 'Forbidden target' }, { status: 403 })
    }

    // Layer 3: DNS resolution + IP pinning
    let resolved: Awaited<ReturnType<typeof resolveAndPin>>
    try {
      resolved = await resolveAndPin(url)
    } catch (err) {
      if (err instanceof DnsError) {
        console.error('[companion-proxy] DNS error:', err.message, 'URL:', url)
        return NextResponse.json({ error: `DNS resolution failed: ${err.message}` }, { status: 504 })
      }
      throw err
    }
    if (!resolved) {
      return NextResponse.json({ error: 'Forbidden target' }, { status: 403 })
    }

    const fetchOptions: RequestInit = {
      method: method ?? 'GET',
      signal: AbortSignal.timeout(3000),
      redirect: 'manual',
    }

    if (body && method === 'POST') {
      fetchOptions.headers = { 'Content-Type': 'application/json' }
      fetchOptions.body = JSON.stringify(body)
    }

    let response = await pinnedFetch(resolved.fetchUrl, resolved.originalAuthority, fetchOptions)
    let currentUrl = url
    let currentMethod = method ?? 'GET'
    let currentBody = body && method === 'POST' ? JSON.stringify(body) : undefined
    let redirectCount = 0

    while (
      redirectCount < MAX_REDIRECTS &&
      response.status >= 300 &&
      response.status < 400 &&
      response.headers.has('location')
    ) {
      const location = response.headers.get('location')!
      const redirectUrl = new URL(location, currentUrl).toString()

      if (isBlockedHost(redirectUrl)) {
        return NextResponse.json({ error: 'Forbidden redirect target' }, { status: 403 })
      }

      let redirectResolved: Awaited<ReturnType<typeof resolveAndPin>>
      try {
        redirectResolved = await resolveAndPin(redirectUrl)
      } catch (err) {
        if (err instanceof DnsError) {
          console.error('[companion-proxy] DNS error on redirect:', err.message, 'URL:', redirectUrl)
          return NextResponse.json({ error: `DNS resolution failed: ${err.message}` }, { status: 504 })
        }
        throw err
      }
      if (!redirectResolved) {
        return NextResponse.json({ error: 'Forbidden redirect target' }, { status: 403 })
      }

      const preserveMethod = response.status === 307 || response.status === 308
      const redirectMethod = preserveMethod ? currentMethod : 'GET'
      const redirectBody = preserveMethod ? currentBody : undefined
      const redirectHeaders: HeadersInit | undefined =
        preserveMethod && redirectBody ? { 'Content-Type': 'application/json' } : undefined

      response = await pinnedFetch(
        redirectResolved.fetchUrl,
        redirectResolved.originalAuthority,
        {
          method: redirectMethod,
          body: redirectBody,
          headers: redirectHeaders,
          signal: AbortSignal.timeout(3000),
          redirect: 'manual',
        },
      )
      currentUrl = redirectUrl
      currentMethod = redirectMethod
      currentBody = redirectBody
      redirectCount++
    }

    // Layer 8: Size-capped response reading
    const text = await readResponseCapped(response)

    let data: unknown
    try {
      data = JSON.parse(text)
    } catch {
      data = { raw: text }
    }

    return NextResponse.json(data, { status: response.status })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Proxy request failed'
    console.error('[companion-proxy] Error:', message, 'URL:', requestedUrl)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
