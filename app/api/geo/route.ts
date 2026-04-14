import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * GET /api/geo — returns whether the request originates from an EU/EEA/UK jurisdiction.
 *
 * Vercel sets `x-vercel-ip-country` (ISO 3166-1 alpha-2) on every edge request.
 * Used by useDataCollection to decide whether to show GDPR-enhanced consent dialog.
 *
 * Returns { isEU: false } in local dev (header absent) — standard dialog shown.
 */

/** EU member states + EEA + UK (UK GDPR applies post-Brexit) */
const GDPR_COUNTRIES = new Set([
  'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GR',
  'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO',
  'SE', 'SI', 'SK',       // EU 27
  'IS', 'LI', 'NO',       // EEA
  'GB',                   // UK GDPR
])

export async function GET(request: NextRequest) {
  const country = request.headers.get('x-vercel-ip-country') ?? ''
  return NextResponse.json({ isEU: GDPR_COUNTRIES.has(country) })
}
