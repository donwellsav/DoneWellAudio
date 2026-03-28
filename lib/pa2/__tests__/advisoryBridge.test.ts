import { describe, it, expect } from 'vitest'
import {
  findNearestGEQBandIndex,
  severityToGEQCut,
  advisoriesToGEQCorrections,
  mergeGEQCorrections,
  advisoriesToDetectPayload,
  advisoriesToHybridActions,
} from '../advisoryBridge'
import type { Advisory } from '@/types/advisory'
import { PA2_GEQ_FREQUENCIES } from '@/types/pa2'

// ── Helper: build a minimal advisory for testing ──
function makeAdvisory(overrides: Partial<Advisory> = {}): Advisory {
  return {
    id: 'test-adv-1',
    trueFrequencyHz: 2500,
    trueAmplitudeDb: -3,
    severity: 'GROWING',
    confidence: 0.88,
    qEstimate: 6,
    resolved: false,
    bandwidthHz: 420,
    timestamp: Date.now(),
    persistenceFrames: 15,
    msd: 0.85,
    msdGrowthRate: 0.5,
    cumulativeGrowthDb: 3,
    ...overrides,
  } as Advisory
}

// ═══ findNearestGEQBandIndex ═══

describe('findNearestGEQBandIndex', () => {
  it('returns 0 for frequencies at or below 20Hz', () => {
    expect(findNearestGEQBandIndex(20)).toBe(0)
    expect(findNearestGEQBandIndex(15)).toBe(0)
  })

  it('returns 30 for frequencies at or above 20kHz', () => {
    expect(findNearestGEQBandIndex(20000)).toBe(30)
    expect(findNearestGEQBandIndex(22000)).toBe(30)
  })

  it('maps exact ISO frequencies to their band index', () => {
    expect(findNearestGEQBandIndex(1000)).toBe(17) // 1kHz = band 18 (index 17)
    expect(findNearestGEQBandIndex(250)).toBe(11)  // 250Hz = band 12 (index 11)
    expect(findNearestGEQBandIndex(4000)).toBe(23) // 4kHz = band 24 (index 23)
  })

  it('maps between-band frequencies to nearest in log space', () => {
    // 1500Hz is between 1250Hz (idx 18) and 1600Hz (idx 19)
    // log2(1500/1250) = 0.263, log2(1600/1500) = 0.093 → closer to 1600
    expect(findNearestGEQBandIndex(1500)).toBe(19)
  })

  it('covers all 31 PA2 bands', () => {
    for (let i = 0; i < PA2_GEQ_FREQUENCIES.length; i++) {
      expect(findNearestGEQBandIndex(PA2_GEQ_FREQUENCIES[i])).toBe(i)
    }
  })
})

// ═══ severityToGEQCut ═══

describe('severityToGEQCut', () => {
  it('returns correct base depths without Q', () => {
    expect(severityToGEQCut('RUNAWAY')).toBe(-12)
    expect(severityToGEQCut('GROWING')).toBe(-6)
    expect(severityToGEQCut('RESONANCE')).toBe(-3)
    expect(severityToGEQCut('POSSIBLE_RING')).toBe(-2)
    expect(severityToGEQCut('WHISTLE')).toBe(-4)
    expect(severityToGEQCut('INSTRUMENT')).toBe(0)
  })

  it('returns 0 for INSTRUMENT regardless of Q', () => {
    expect(severityToGEQCut('INSTRUMENT', 4)).toBe(0)
    expect(severityToGEQCut('INSTRUMENT', 16)).toBe(0)
  })

  it('applies Q-scaling: narrow Q gets shallower cut', () => {
    // Q=16 → factor = max(0.5, 4/16) = 0.5 → RUNAWAY: -12 * 0.5 = -6
    expect(severityToGEQCut('RUNAWAY', 16)).toBe(-6)
    // Q=4 → factor = max(0.5, 4/4) = 1.0 → RUNAWAY: -12 * 1.0 = -12
    expect(severityToGEQCut('RUNAWAY', 4)).toBe(-12)
  })

  it('clamps Q factor between 0.5 and 1.0', () => {
    // Q=2 → factor = min(1.0, 4/2) = 1.0
    expect(severityToGEQCut('GROWING', 2)).toBe(-6)
    // Q=32 → factor = max(0.5, 4/32) = 0.5 → GROWING: -6 * 0.5 = -3
    expect(severityToGEQCut('GROWING', 32)).toBe(-3)
  })
})

// ═══ advisoriesToGEQCorrections ═══

describe('advisoriesToGEQCorrections', () => {
  it('returns empty object for no advisories', () => {
    expect(advisoriesToGEQCorrections([])).toEqual({})
  })

  it('skips advisories below soft floor', () => {
    const adv = makeAdvisory({ confidence: 0.1 })
    expect(advisoriesToGEQCorrections([adv], 0.6, 0.25)).toEqual({})
  })

  it('includes low-confidence advisories with shallower cut', () => {
    const adv = makeAdvisory({ confidence: 0.4, severity: 'GROWING', qEstimate: 4 })
    const result = advisoriesToGEQCorrections([adv], 0.6, 0.25)
    // Should be included with half depth
    expect(Object.keys(result).length).toBeGreaterThan(0)
    // Half of -6 = -3, but at least -2
    const cut = Object.values(result)[0]
    expect(cut).toBeGreaterThanOrEqual(-3)
    expect(cut).toBeLessThan(0)
  })

  it('skips resolved advisories', () => {
    const adv = makeAdvisory({ resolved: true })
    expect(advisoriesToGEQCorrections([adv])).toEqual({})
  })

  it('skips INSTRUMENT severity', () => {
    const adv = makeAdvisory({ severity: 'INSTRUMENT' })
    expect(advisoriesToGEQCorrections([adv])).toEqual({})
  })

  it('maps a GROWING advisory at 2500Hz to band 22', () => {
    const adv = makeAdvisory({ trueFrequencyHz: 2500, severity: 'GROWING', qEstimate: 4 })
    const result = advisoriesToGEQCorrections([adv])
    expect(result).toHaveProperty('22') // 2500Hz = band 22 (index 21 + 1)
    expect(result['22']).toBeLessThan(0) // it should be a cut
  })

  it('deepest cut wins when multiple advisories hit same band', () => {
    const adv1 = makeAdvisory({ trueFrequencyHz: 2500, severity: 'GROWING', qEstimate: 4, id: 'a' })
    const adv2 = makeAdvisory({ trueFrequencyHz: 2600, severity: 'RUNAWAY', qEstimate: 4, id: 'b' })
    const result = advisoriesToGEQCorrections([adv1, adv2])
    // Both map to band 22 (2500Hz). RUNAWAY at Q=4 = -12, GROWING at Q=4 = -6. Deepest wins.
    expect(result['22']).toBe(-12)
  })
})

// ═══ mergeGEQCorrections ═══

describe('mergeGEQCorrections', () => {
  it('adds correction to current band value', () => {
    const current = { '18': -2 }
    const corrections = { '18': -3 }
    const result = mergeGEQCorrections(current, corrections)
    expect(result['18']).toBe(-5) // -2 + -3
  })

  it('clamps to -12dB minimum', () => {
    const current = { '18': -10 }
    const corrections = { '18': -6 }
    const result = mergeGEQCorrections(current, corrections)
    expect(result['18']).toBe(-12) // max(-12, -10 + -6) = -12
  })

  it('treats missing current band as 0dB', () => {
    const current = {}
    const corrections = { '18': -4 }
    const result = mergeGEQCorrections(current, corrections)
    expect(result['18']).toBe(-4)
  })

  it('only includes bands with corrections', () => {
    const current = { '1': -2, '18': -3 }
    const corrections = { '18': -1 }
    const result = mergeGEQCorrections(current, corrections)
    expect(Object.keys(result)).toEqual(['18'])
  })
})

// ═══ advisoriesToDetectPayload ═══

describe('advisoriesToDetectPayload', () => {
  it('returns empty array for no advisories', () => {
    expect(advisoriesToDetectPayload([])).toEqual([])
  })

  it('skips advisories below soft floor', () => {
    const adv = makeAdvisory({ confidence: 0.1 })
    expect(advisoriesToDetectPayload([adv], 0.7, 0.25)).toEqual([])
  })

  it('includes low-confidence advisories above soft floor', () => {
    const adv = makeAdvisory({ confidence: 0.4 })
    const payload = advisoriesToDetectPayload([adv], 0.7, 0.25)
    expect(payload).toHaveLength(1)
    expect(payload[0].confidence).toBe(0.4)
  })

  it('creates payload with correct fields', () => {
    const adv = makeAdvisory({ trueFrequencyHz: 2500, confidence: 0.88, qEstimate: 6, severity: 'GROWING' })
    const payload = advisoriesToDetectPayload([adv])
    expect(payload).toHaveLength(1)
    expect(payload[0].hz).toBe(2500)
    expect(payload[0].confidence).toBe(0.88)
    expect(payload[0].type).toBe('feedback')
    expect(payload[0].q).toBe(6) // clamped to 4-16 range
  })

  it('clamps Q to 4-16 range', () => {
    const narrow = makeAdvisory({ qEstimate: 20 })
    const broad = makeAdvisory({ qEstimate: 2, id: 'b' })
    const payloadN = advisoriesToDetectPayload([narrow])
    const payloadB = advisoriesToDetectPayload([broad])
    expect(payloadN[0].q).toBe(16) // clamped from 20
    expect(payloadB[0].q).toBe(4)  // clamped from 2
  })

  it('sorts by confidence descending', () => {
    const low = makeAdvisory({ confidence: 0.75, id: 'low' })
    const high = makeAdvisory({ confidence: 0.95, id: 'high' })
    const payload = advisoriesToDetectPayload([low, high])
    expect(payload[0].confidence).toBe(0.95)
    expect(payload[1].confidence).toBe(0.75)
  })

  it('marks INSTRUMENT as resonance type', () => {
    const adv = makeAdvisory({ severity: 'INSTRUMENT' })
    const payload = advisoriesToDetectPayload([adv])
    expect(payload[0].type).toBe('resonance')
  })
})

// ═══ advisoriesToHybridActions ═══

describe('advisoriesToHybridActions', () => {
  it('routes narrow feedback (Q > 8) to PEQ', () => {
    const adv = makeAdvisory({ qEstimate: 12, severity: 'RESONANCE' })
    const actions = advisoriesToHybridActions([adv])
    expect(actions).toHaveLength(1)
    expect(actions[0].type).toBe('peq')
  })

  it('routes urgent (RUNAWAY) to PEQ regardless of Q', () => {
    const adv = makeAdvisory({ qEstimate: 3, severity: 'RUNAWAY' })
    const actions = advisoriesToHybridActions([adv])
    expect(actions[0].type).toBe('peq')
  })

  it('routes broad resonance (low Q, not urgent) to GEQ', () => {
    const adv = makeAdvisory({ qEstimate: 3, severity: 'RESONANCE' })
    const actions = advisoriesToHybridActions([adv])
    expect(actions[0].type).toBe('geq')
  })

  it('carries confidence on PEQ actions', () => {
    const adv = makeAdvisory({ qEstimate: 12, confidence: 0.92 })
    const actions = advisoriesToHybridActions([adv])
    expect(actions[0].confidence).toBe(0.92)
  })

  it('skips INSTRUMENT severity', () => {
    const adv = makeAdvisory({ severity: 'INSTRUMENT' })
    const actions = advisoriesToHybridActions([adv])
    expect(actions).toHaveLength(0)
  })

  it('skips resolved advisories', () => {
    const adv = makeAdvisory({ resolved: true })
    const actions = advisoriesToHybridActions([adv])
    expect(actions).toHaveLength(0)
  })
})
