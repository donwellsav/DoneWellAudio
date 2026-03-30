import { NextResponse, type NextRequest } from 'next/server'

/**
 * Per-request CSP middleware.
 *
 * Generates a unique nonce for each request and sets a Content-Security-Policy
 * header with `'nonce-{nonce}' 'strict-dynamic'` in script-src, replacing the
 * previous `'unsafe-inline'` directive.
 *
 * Next.js automatically parses the CSP header, extracts the nonce, and applies
 * it to all framework-injected <script> tags. `'strict-dynamic'` trusts scripts
 * loaded by nonced scripts (lazy chunks, dynamic imports, etc.).
 *
 * Dev mode keeps `'unsafe-inline'` + `'unsafe-eval'` for Turbopack hot reload.
 */
export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')

  const isDev = process.env.NODE_ENV === 'development'
  if (isDev && process.env.VERCEL_ENV === 'production') {
    console.warn('[CSP] WARNING: dev CSP (unsafe-eval) active on production deployment')
  }
  const cspValue = [
    "default-src 'self'",
    isDev
      ? "script-src 'self' 'unsafe-eval' 'unsafe-inline'"
      : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    "worker-src 'self' blob:",
    isDev
      ? "connect-src 'self' ws: http: https://*.ingest.us.sentry.io"
      : "connect-src 'self' http: https://*.ingest.us.sentry.io",
    "img-src 'self' data: blob:",
    "media-src 'self' blob: mediastream:",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ')

  // Set nonce on request headers so server components can read it via headers()
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('Content-Security-Policy', cspValue)

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('Content-Security-Policy', cspValue)

  return response
}

export const config = {
  matcher: [
    // Skip prefetches and static assets (SW, icons, manifest, Next.js internals)
    {
      source: '/((?!api|monitoring|_next/static|_next/image|favicon.ico|icon-.*|apple-icon.*|manifest.json|sw.js|swe-worker-.*).*)',
      missing: [{ type: 'header', key: 'next-router-prefetch' }],
    },
  ],
}
