import { describe, expect, it } from 'vitest'
import { MIXER_PROFILES } from '@/companion-module/src/mixerProfiles'

function parsePayload(payload: string | undefined): Record<string, unknown> {
  expect(payload).toBeDefined()
  return JSON.parse(payload!.trim()) as Record<string, unknown>
}

describe('PA2 mixer profile', () => {
  it('clamps Q values to the supported 4-16 range', () => {
    const profile = MIXER_PROFILES.pa2

    const lowQPayload = parsePayload(profile.buildEqMessage({
      prefix: '',
      band: 1,
      freqHz: 1000,
      gainDb: -6,
      q: 0.5,
    }).tcpPayload)
    expect(lowQPayload.q).toBe(4)

    const inRangePayload = parsePayload(profile.buildEqMessage({
      prefix: '',
      band: 1,
      freqHz: 1000,
      gainDb: -6,
      q: 8,
    }).tcpPayload)
    expect(inRangePayload.q).toBe(8)

    const highQPayload = parsePayload(profile.buildEqMessage({
      prefix: '',
      band: 1,
      freqHz: 1000,
      gainDb: -6,
      q: 32,
    }).tcpPayload)
    expect(highQPayload.q).toBe(16)
  })
})
