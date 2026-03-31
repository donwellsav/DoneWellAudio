import { NextResponse } from 'next/server'

/**
 * GET /api/health — deployment health check.
 *
 * Returns app version (from NEXT_PUBLIC_APP_VERSION env, set at build time
 * via next.config.mjs from package.json) and server timestamp.
 * Used for deploy verification and version correlation.
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    version: process.env.NEXT_PUBLIC_APP_VERSION ?? 'unknown',
    timestamp: new Date().toISOString(),
  })
}
