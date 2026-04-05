import { describe, expect, it } from 'vitest'
import type { Advisory } from '@/types/advisory'
import type { HybridAction } from '@/lib/pa2/advisoryBridge'
import {
  buildAutoSendDiag,
  dedupeGEQCorrections,
  getEffectiveConfidenceThreshold,
  shouldSkipAutoSendForSilence,
  splitHybridActions,
} from '@/lib/pa2/pa2BridgeAutoSend'

function createAdvisory(overrides: Partial<Advisory> = {}): Advisory {
  return {
    id: 'adv-1',
    trackId: 'track-1',
    label: 'ACOUSTIC_FEEDBACK',
    why: ['test advisory'],
    trueFrequencyHz: 1000,
    trueAmplitudeDb: -20,
    prominenceDb: 8,
    severity: 'GROWING',
    confidence: 0.8,
    qEstimate: 10,
    bandwidthHz: 100,
    velocityDbPerSec: 2,
    stabilityCentsStd: 4,
    harmonicityScore: 0.1,
    modulationScore: 0.2,
    advisory: {
      geq: {
        bandHz: 1000,
        bandIndex: 18,
        suggestedDb: -6,
      },
      peq: {
        type: 'bell',
        hz: 1000,
        q: 10,
        gainDb: -6,
      },
      shelves: [],
      pitch: {
        note: 'B',
        octave: 5,
        cents: 0,
        midi: 83,
      },
    },
    timestamp: 0,
    resolved: false,
    ...overrides,
  }
}

describe('pa2BridgeAutoSend', () => {
  it('uses the stricter of the local and companion thresholds', () => {
    expect(getEffectiveConfidenceThreshold(0.4, 0.65)).toBe(0.65)
  })

  it('builds diagnostics from unresolved advisories only', () => {
    const diagnostics = buildAutoSendDiag([
      createAdvisory({ confidence: 0.9 }),
      createAdvisory({ id: 'adv-2', confidence: 0.5 }),
      createAdvisory({ id: 'adv-3', resolved: true, confidence: 0.95 }),
    ], 0.7)

    expect(diagnostics).toEqual({
      total: 3,
      active: 2,
      aboveThreshold: 1,
    })
  })

  it('suppresses auto-send when both PA2 inputs are effectively silent', () => {
    expect(shouldSkipAutoSendForSilence({
      input: { l: -70, r: -68 },
      output: { hl: -30, hr: -30 },
      compressor: { input: 0, gr: 0 },
      limiter: { input: 0, gr: 0 },
      timestamp: 1,
    })).toBe(true)
  })

  it('drops GEQ cuts that were already applied', () => {
    expect(dedupeGEQCorrections(
      { '10': -3, '11': -6 },
      { '10': -3, '11': -9, '12': -2 },
    )).toEqual({
      '11': -9,
      '12': -2,
    })
  })

  it('splits hybrid actions into GEQ and PEQ payloads', () => {
    const actions: HybridAction[] = [
      {
        type: 'geq',
        bandOrFreq: 10,
        gain: -3,
        reason: 'broad issue',
      },
      {
        type: 'peq',
        bandOrFreq: 1400,
        gain: -6,
        q: 12,
        confidence: 0.9,
        clientId: 'adv-2',
        reason: 'narrow issue',
      },
    ]

    expect(splitHybridActions(actions)).toEqual({
      geqCorrections: { '10': -3 },
      peqPayloadRaw: [{
        hz: 1400,
        confidence: 0.9,
        type: 'feedback',
        q: 12,
        clientId: 'adv-2',
      }],
    })
  })
})
