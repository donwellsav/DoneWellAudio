import { describe, expect, it } from 'vitest'

import { computeEffectiveThreshold, normalizeRelativeThresholdDb } from '../detectorUtils'

describe('normalizeRelativeThresholdDb', () => {
  it('compresses speech headroom so moderate feedback can clear the detector sooner', () => {
    expect(normalizeRelativeThresholdDb(20, 'speech')).toBeCloseTo(16, 6)
  })

  it('compresses aggressive music-mode headroom into a sane live-use range', () => {
    expect(normalizeRelativeThresholdDb(42, 'liveMusic')).toBeCloseTo(23.1, 6)
    expect(normalizeRelativeThresholdDb(35, 'worship')).toBeCloseTo(22.75, 6)
  })

  it('preserves fast monitor sensitivity instead of letting headroom collapse to zero', () => {
    expect(normalizeRelativeThresholdDb(15, 'monitors')).toBeCloseTo(12, 6)
  })
})

describe('computeEffectiveThreshold', () => {
  it('uses normalized relative headroom in hybrid mode', () => {
    const threshold = computeEffectiveThreshold({
      thresholdDb: -80,
      noiseFloorEnabled: true,
      relativeThresholdDb: 42,
      thresholdMode: 'hybrid',
      mode: 'liveMusic',
    }, -60)

    expect(threshold).toBeCloseTo(-36.9, 6)
  })
})
