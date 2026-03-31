import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'

import { GET } from '../route'

function makeRequest(country?: string): NextRequest {
  const headers = new Headers()
  if (country) headers.set('x-vercel-ip-country', country)
  return new NextRequest('http://localhost:3000/api/geo', {
    method: 'GET',
    headers,
  })
}

describe('GET /api/geo', () => {
  it('returns isEU=true for GDPR jurisdictions', async () => {
    const res = await GET(makeRequest('DE'))
    expect(await res.json()).toEqual({ isEU: true })
  })

  it('returns isEU=false for non-GDPR jurisdictions', async () => {
    const res = await GET(makeRequest('US'))
    expect(await res.json()).toEqual({ isEU: false })
  })

  it('defaults to isEU=false when the header is absent', async () => {
    const res = await GET(makeRequest())
    expect(await res.json()).toEqual({ isEU: false })
  })
})
