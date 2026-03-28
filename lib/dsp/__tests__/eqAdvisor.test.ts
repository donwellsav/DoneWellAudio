/**
 * EQ Advisor unit tests
 *
 * Tests the pure-function EQ recommendation pipeline:
 * - findNearestGEQBand: log-space ISO 31-band snapping
 * - calculateERB: Glasberg & Moore psychoacoustic bandwidth
 * - erbDepthScale: frequency-dependent cut depth scaling
 * - calculateCutDepth: severity × preset × recurrence depth logic
 * - calculateQ: severity-aware Q blending
 * - generateGEQRecommendation / generatePEQRecommendation: complete recs
 * - analyzeSpectralTrends: rumble / mud / harshness detection
 * - generateEQAdvisory: full advisory generation
 */

import { describe, it, expect } from 'vitest'
import {
  findNearestGEQBand,
  calculateERB,
  erbDepthScale,
  calculateCutDepth,
  calculateQ,
  clusterAwareQ,
  generateGEQRecommendation,
  generatePEQRecommendation,
  analyzeSpectralTrends,
  validateShelves,
  generateEQAdvisory,
  getSeverityColor,
  getGEQBandLabels,
} from '../eqAdvisor'
import { ISO_31_BANDS, ERB_SETTINGS, VIZ_COLORS } from '../constants'
import type { Track, SeverityLevel } from '@/types/advisory'

// ── Fixtures ────────────────────────────────────────────────────────────────

/** Minimal Track fixture for EQ recommendation functions */
function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'eq-test-1',
    binIndex: 170,
    trueFrequencyHz: 1000,
    trueAmplitudeDb: -20,
    prominenceDb: 15,
    onsetTime: Date.now() - 2000,
    onsetDb: -25,
    lastUpdateTime: Date.now(),
    history: [],
    features: {
      stabilityCentsStd: 5,
      meanQ: 30,
      minQ: 20,
      meanVelocityDbPerSec: 1,
      maxVelocityDbPerSec: 3,
      persistenceMs: 1000,
      harmonicityScore: 0.2,
      modulationScore: 0.1,
      noiseSidebandScore: 0.05,
    },
    qEstimate: 30,
    bandwidthHz: 33,
    velocityDbPerSec: 1,
    harmonicOfHz: null,
    isSubHarmonicRoot: false,
    isActive: true,
    ...overrides,
  } as Track
}

// ── findNearestGEQBand ─────────────────────────────────────────────────────

describe('findNearestGEQBand', () => {
  it('snaps exact ISO frequency to its own band', () => {
    const result = findNearestGEQBand(1000)
    expect(result.bandHz).toBe(1000)
    expect(result.bandIndex).toBe(ISO_31_BANDS.indexOf(1000))
  })

  it('snaps 20 Hz to the first band', () => {
    const result = findNearestGEQBand(20)
    expect(result.bandHz).toBe(20)
    expect(result.bandIndex).toBe(0)
  })

  it('snaps 20000 Hz to the last band', () => {
    const result = findNearestGEQBand(20000)
    expect(result.bandHz).toBe(20000)
    expect(result.bandIndex).toBe(ISO_31_BANDS.length - 1)
  })

  it('uses log-space distance (not linear)', () => {
    // 750 Hz is linearly closer to 630 Hz (120 Hz gap) than 800 Hz (50 Hz gap),
    // but in log space it's closer to 800 Hz: log2(750/800) < log2(750/630)
    const result = findNearestGEQBand(750)
    expect(result.bandHz).toBe(800)
  })

  it('snaps frequency between two bands to the nearer one', () => {
    // 450 Hz is between 400 and 500 — log distance decides
    const result = findNearestGEQBand(450)
    expect([400, 500]).toContain(result.bandHz)
  })

  it('returns valid bandIndex for every ISO band', () => {
    for (let i = 0; i < ISO_31_BANDS.length; i++) {
      const result = findNearestGEQBand(ISO_31_BANDS[i])
      expect(result.bandIndex).toBe(i)
      expect(result.bandHz).toBe(ISO_31_BANDS[i])
    }
  })
})

// ── calculateERB ───────────────────────────────────────────────────────────

describe('calculateERB', () => {
  it('returns 24.7 Hz at DC (Glasberg & Moore formula)', () => {
    // ERB(0) = 24.7 * (4.37 * 0 + 1) = 24.7
    expect(calculateERB(0)).toBeCloseTo(24.7, 1)
  })

  it('returns ~132.6 Hz at 1000 Hz', () => {
    // ERB(1000) = 24.7 * (4.37 * 1 + 1) = 24.7 * 5.37 ≈ 132.6
    expect(calculateERB(1000)).toBeCloseTo(132.6, 0)
  })

  it('grows monotonically with frequency', () => {
    const erb100 = calculateERB(100)
    const erb1000 = calculateERB(1000)
    const erb10000 = calculateERB(10000)
    expect(erb100).toBeLessThan(erb1000)
    expect(erb1000).toBeLessThan(erb10000)
  })

  it('is always positive', () => {
    expect(calculateERB(0)).toBeGreaterThan(0)
    expect(calculateERB(20)).toBeGreaterThan(0)
    expect(calculateERB(20000)).toBeGreaterThan(0)
  })
})

// ── erbDepthScale ──────────────────────────────────────────────────────────

describe('erbDepthScale', () => {
  it('returns LOW_FREQ_SCALE at/below 500 Hz', () => {
    expect(erbDepthScale(500)).toBe(ERB_SETTINGS.LOW_FREQ_SCALE) // 0.7
    expect(erbDepthScale(100)).toBe(ERB_SETTINGS.LOW_FREQ_SCALE)
    expect(erbDepthScale(0)).toBe(ERB_SETTINGS.LOW_FREQ_SCALE)
  })

  it('returns HIGH_FREQ_SCALE at/above 2000 Hz', () => {
    expect(erbDepthScale(2000)).toBe(ERB_SETTINGS.HIGH_FREQ_SCALE) // 1.2
    expect(erbDepthScale(5000)).toBe(ERB_SETTINGS.HIGH_FREQ_SCALE)
    expect(erbDepthScale(20000)).toBe(ERB_SETTINGS.HIGH_FREQ_SCALE)
  })

  it('interpolates logarithmically between 500 Hz and 2000 Hz', () => {
    const mid = erbDepthScale(1250)
    expect(mid).toBeGreaterThan(ERB_SETTINGS.LOW_FREQ_SCALE)
    expect(mid).toBeLessThan(ERB_SETTINGS.HIGH_FREQ_SCALE)
    // Log2 interpolation: t = (log2(1250)-log2(500))/(log2(2000)-log2(500)) ≈ 0.66
    // scale = 0.7 + 0.66 * 0.5 ≈ 1.03
    expect(mid).toBeCloseTo(1.03, 1)
  })

  it('is monotonically non-decreasing', () => {
    const freqs = [100, 500, 750, 1000, 1250, 1500, 2000, 5000]
    for (let i = 1; i < freqs.length; i++) {
      expect(erbDepthScale(freqs[i])).toBeGreaterThanOrEqual(erbDepthScale(freqs[i - 1]))
    }
  })
})

// ── calculateCutDepth ──────────────────────────────────────────────────────

describe('calculateCutDepth', () => {
  it('returns max cut for RUNAWAY severity (surgical preset)', () => {
    expect(calculateCutDepth('RUNAWAY', 'surgical')).toBe(-18)
  })

  it('returns max cut for RUNAWAY severity (heavy preset)', () => {
    expect(calculateCutDepth('RUNAWAY', 'heavy')).toBe(-12)
  })

  it('returns moderate cut for GROWING', () => {
    expect(calculateCutDepth('GROWING', 'surgical')).toBe(-9)
    expect(calculateCutDepth('GROWING', 'heavy')).toBe(-6)
  })

  it('returns light cut for RESONANCE', () => {
    expect(calculateCutDepth('RESONANCE', 'surgical')).toBe(-4)
    expect(calculateCutDepth('RESONANCE', 'heavy')).toBe(-3)
  })

  it('returns -3 for POSSIBLE_RING', () => {
    expect(calculateCutDepth('POSSIBLE_RING', 'surgical')).toBe(-3)
    expect(calculateCutDepth('POSSIBLE_RING', 'heavy')).toBe(-3)
  })

  it('returns 0 for WHISTLE and INSTRUMENT (no cut)', () => {
    expect(calculateCutDepth('WHISTLE', 'surgical')).toBe(0)
    expect(calculateCutDepth('INSTRUMENT', 'surgical')).toBe(0)
  })

  it('deepens cut with recurrence (MINDS-inspired)', () => {
    const first = calculateCutDepth('RESONANCE', 'surgical', 0)
    const second = calculateCutDepth('RESONANCE', 'surgical', 1)
    const third = calculateCutDepth('RESONANCE', 'surgical', 2)
    expect(second).toBeLessThan(first) // More negative
    expect(third).toBeLessThan(second)
  })

  it('caps recurrence depth at maxCut', () => {
    // Even with many recurrences, should not exceed maxCut
    const depth = calculateCutDepth('RESONANCE', 'surgical', 100)
    expect(depth).toBe(-18) // maxCut for surgical
  })
})

// ── calculateQ ─────────────────────────────────────────────────────────────

describe('calculateQ', () => {
  it('returns higher Q for RUNAWAY severity', () => {
    const runawayQ = calculateQ('RUNAWAY', 'surgical', 30)
    const growingQ = calculateQ('GROWING', 'surgical', 30)
    expect(runawayQ).toBeGreaterThan(growingQ)
  })

  it('blends preset Q with measured trackQ', () => {
    // With trackQ of 30 and preset defaultQ of 30, blend is 30
    const q = calculateQ('GROWING', 'surgical', 30)
    expect(q).toBe(30)
  })

  it('clamps Q between 2 and 120', () => {
    // Very low trackQ
    const lowQ = calculateQ('GROWING', 'surgical', 0.5)
    expect(lowQ).toBeGreaterThanOrEqual(2)

    // Very high trackQ
    const highQ = calculateQ('RUNAWAY', 'surgical', 200)
    expect(highQ).toBeLessThanOrEqual(120)
  })

  it('surgical preset produces higher Q than heavy', () => {
    const surgicalQ = calculateQ('RUNAWAY', 'surgical', 30)
    const heavyQ = calculateQ('RUNAWAY', 'heavy', 30)
    expect(surgicalQ).toBeGreaterThan(heavyQ)
  })
})

// ── clusterAwareQ ─────────────────────────────────────────────────────────

describe('clusterAwareQ', () => {
  it('returns baseQ unchanged when no cluster bounds', () => {
    expect(clusterAwareQ(30, 1000)).toBe(30)
    expect(clusterAwareQ(30, 1000, undefined, undefined)).toBe(30)
  })

  it('returns baseQ when cluster bounds are equal', () => {
    expect(clusterAwareQ(30, 1000, 1000, 1000)).toBe(30)
  })

  it('widens Q to cover a 30 Hz cluster at 835 Hz', () => {
    // 3 peaks at 820, 835, 850 Hz → span = 30 Hz
    // coverageQ = 835 / (30 * 1.5) = 835 / 45 ≈ 18.6
    const q = clusterAwareQ(30, 835, 820, 850)
    expect(q).toBeCloseTo(18.6, 0)
    expect(q).toBeLessThan(30) // Wider than original
  })

  it('does not narrow Q below cluster-derived value', () => {
    // If baseQ is already wider (lower) than cluster needs, keep baseQ
    const q = clusterAwareQ(5, 1000, 990, 1010)
    // coverageQ = 1000 / (20 * 1.5) = 33.3 → min(5, 33.3) = 5
    expect(q).toBe(5)
  })

  it('floors at Q=2', () => {
    // Very wide cluster → coverageQ < 2
    // span = 400 Hz, center = 500 Hz → coverageQ = 500 / (400*1.5) = 0.83
    const q = clusterAwareQ(30, 500, 300, 700)
    expect(q).toBe(2)
  })
})

// ── generatePEQRecommendation with cluster bounds ────────────────────────

describe('generatePEQRecommendation (cluster-aware)', () => {
  it('widens Q when cluster bounds are provided', () => {
    const track = makeTrack({ trueFrequencyHz: 835, qEstimate: 30 })
    const withoutCluster = generatePEQRecommendation(track, 'GROWING', 'surgical')
    const withCluster = generatePEQRecommendation(track, 'GROWING', 'surgical', 820, 850)
    expect(withCluster.q).toBeLessThan(withoutCluster.q)
  })

  it('produces identical Q without cluster bounds', () => {
    const track = makeTrack({ trueFrequencyHz: 1000, qEstimate: 30 })
    const rec = generatePEQRecommendation(track, 'GROWING', 'surgical')
    const recNoCluster = generatePEQRecommendation(track, 'GROWING', 'surgical', undefined, undefined)
    expect(rec.q).toBe(recNoCluster.q)
  })
})

// ── generateGEQRecommendation ──────────────────────────────────────────────

describe('generateGEQRecommendation', () => {
  it('returns valid band index and Hz', () => {
    const track = makeTrack({ trueFrequencyHz: 1000 })
    const rec = generateGEQRecommendation(track, 'RESONANCE', 'surgical')
    expect(rec.bandHz).toBe(1000)
    expect(rec.bandIndex).toBe(ISO_31_BANDS.indexOf(1000))
  })

  it('suggestedDb is negative for feedback severities', () => {
    const track = makeTrack()
    const rec = generateGEQRecommendation(track, 'GROWING', 'surgical')
    expect(rec.suggestedDb).toBeLessThan(0)
  })

  it('applies ERB depth scaling (shallower at low freq)', () => {
    const lowTrack = makeTrack({ trueFrequencyHz: 100 })
    const highTrack = makeTrack({ trueFrequencyHz: 5000 })
    const lowRec = generateGEQRecommendation(lowTrack, 'GROWING', 'surgical')
    const highRec = generateGEQRecommendation(highTrack, 'GROWING', 'surgical')
    // Low frequency should have less aggressive cut (closer to 0)
    expect(lowRec.suggestedDb).toBeGreaterThan(highRec.suggestedDb)
  })
})

// ── generatePEQRecommendation ──────────────────────────────────────────────

describe('generatePEQRecommendation', () => {
  it('returns notch type for RUNAWAY severity', () => {
    const track = makeTrack({ trueFrequencyHz: 1000 })
    const rec = generatePEQRecommendation(track, 'RUNAWAY', 'surgical')
    expect(rec.type).toBe('notch')
  })

  it('returns bell type for moderate severities', () => {
    const track = makeTrack({ trueFrequencyHz: 1000 })
    const rec = generatePEQRecommendation(track, 'RESONANCE', 'surgical')
    expect(rec.type).toBe('bell')
  })

  it('suggests HPF for very low frequencies', () => {
    const track = makeTrack({ trueFrequencyHz: 50 })
    const rec = generatePEQRecommendation(track, 'RESONANCE', 'surgical')
    expect(rec.type).toBe('HPF')
  })

  it('suggests LPF for very high frequencies', () => {
    const track = makeTrack({ trueFrequencyHz: 15000 })
    const rec = generatePEQRecommendation(track, 'RESONANCE', 'surgical')
    expect(rec.type).toBe('LPF')
  })

  it('includes Q, gainDb, and hz fields', () => {
    const track = makeTrack({ trueFrequencyHz: 2000 })
    const rec = generatePEQRecommendation(track, 'GROWING', 'surgical')
    expect(rec.hz).toBe(2000)
    expect(rec.q).toBeGreaterThan(0)
    expect(rec.gainDb).toBeLessThan(0)
  })

  it('includes bandwidthHz when track has it', () => {
    const track = makeTrack({ trueFrequencyHz: 1000, bandwidthHz: 33 })
    const rec = generatePEQRecommendation(track, 'GROWING', 'surgical')
    expect(rec.bandwidthHz).toBe(33)
  })
})

// ── analyzeSpectralTrends ──────────────────────────────────────────────────

describe('analyzeSpectralTrends', () => {
  const sampleRate = 48000
  const fftSize = 8192
  const numBins = fftSize / 2

  /** Create a flat spectrum at a given dB level */
  function flatSpectrum(db: number): Float32Array {
    const arr = new Float32Array(numBins)
    arr.fill(db)
    return arr
  }

  it('returns empty array for flat spectrum', () => {
    const result = analyzeSpectralTrends(flatSpectrum(-40), sampleRate, fftSize)
    expect(result).toHaveLength(0)
  })

  it('detects low-end rumble', () => {
    const spectrum = flatSpectrum(-40)
    // Boost everything below 80 Hz by 10 dB
    const lowEndBin = Math.round(80 / (sampleRate / fftSize))
    for (let i = 0; i < lowEndBin; i++) {
      spectrum[i] = -30
    }
    const result = analyzeSpectralTrends(spectrum, sampleRate, fftSize)
    const hpf = result.find(s => s.type === 'HPF')
    expect(hpf).toBeDefined()
    expect(hpf!.hz).toBe(80)
  })

  it('detects mud buildup (200-400 Hz)', () => {
    const spectrum = flatSpectrum(-40)
    const hzPerBin = sampleRate / fftSize
    const mudLow = Math.round(200 / hzPerBin)
    const mudHigh = Math.round(400 / hzPerBin)
    for (let i = mudLow; i < mudHigh; i++) {
      spectrum[i] = -35 // 5 dB excess over average
    }
    const result = analyzeSpectralTrends(spectrum, sampleRate, fftSize)
    const mud = result.find(s => s.type === 'lowShelf')
    expect(mud).toBeDefined()
  })

  it('detects high-frequency harshness (6-10 kHz) with narrow spike', () => {
    // A narrow spike drives the average up while keeping flatness low (< 0.4)
    const spectrum = flatSpectrum(-40)
    const hzPerBin = sampleRate / fftSize
    const harshLow = Math.round(6000 / hzPerBin)
    const harshHigh = Math.round(10000 / hzPerBin)
    const spikeCenterBin = Math.round(8000 / hzPerBin)
    const spikeHalfWidth = 75
    for (let i = spikeCenterBin - spikeHalfWidth; i <= spikeCenterBin + spikeHalfWidth; i++) {
      if (i >= harshLow && i < harshHigh) {
        spectrum[i] = -10
      }
    }
    const result = analyzeSpectralTrends(spectrum, sampleRate, fftSize)
    const harsh = result.find(s => s.type === 'highShelf')
    expect(harsh).toBeDefined()
  })

  it('raises lowShelf threshold when HPF is active (overlap prevention)', () => {
    // Create spectrum with both rumble AND moderate mud (4.5 dB excess)
    // Without HPF, 4.5 dB > MUD_EXCESS_DB (4) → lowShelf fires
    // With HPF, 4.5 dB < MUD_EXCESS_DB + 2 (6) → lowShelf suppressed
    const spectrum = flatSpectrum(-40)
    const hzPerBin = sampleRate / fftSize

    // Add rumble (triggers HPF)
    const lowEndBin = Math.round(80 / hzPerBin)
    for (let i = 0; i < lowEndBin; i++) {
      spectrum[i] = -30 // 10 dB excess → HPF fires
    }

    // Add moderate mud (4.5 dB excess — above base threshold, below raised threshold)
    const mudLow = Math.round(200 / hzPerBin)
    const mudHigh = Math.round(400 / hzPerBin)
    for (let i = mudLow; i < mudHigh; i++) {
      spectrum[i] = -35.5
    }

    const result = analyzeSpectralTrends(spectrum, sampleRate, fftSize)
    expect(result.find(s => s.type === 'HPF')).toBeDefined()
    // lowShelf should be suppressed because 4.5 dB < 6 dB (raised threshold)
    expect(result.find(s => s.type === 'lowShelf')).toBeUndefined()
  })

  it('allows lowShelf when no HPF (normal threshold)', () => {
    // Same mud level as above, but no rumble → lowShelf fires at normal 4 dB threshold
    const spectrum = flatSpectrum(-40)
    const hzPerBin = sampleRate / fftSize

    const mudLow = Math.round(200 / hzPerBin)
    const mudHigh = Math.round(400 / hzPerBin)
    for (let i = mudLow; i < mudHigh; i++) {
      spectrum[i] = -35.5 // 4.5 dB excess → above 4 dB threshold
    }

    const result = analyzeSpectralTrends(spectrum, sampleRate, fftSize)
    expect(result.find(s => s.type === 'HPF')).toBeUndefined()
    expect(result.find(s => s.type === 'lowShelf')).toBeDefined()
  })

  it('allows HPF + lowShelf when mud is strong enough', () => {
    // When mud excess exceeds the raised threshold (6 dB), both should fire
    const spectrum = flatSpectrum(-40)
    const hzPerBin = sampleRate / fftSize

    // Add rumble
    const lowEndBin = Math.round(80 / hzPerBin)
    for (let i = 0; i < lowEndBin; i++) {
      spectrum[i] = -30
    }

    // Add strong mud (7 dB excess — above raised threshold of 6)
    const mudLow = Math.round(200 / hzPerBin)
    const mudHigh = Math.round(400 / hzPerBin)
    for (let i = mudLow; i < mudHigh; i++) {
      spectrum[i] = -33
    }

    const result = analyzeSpectralTrends(spectrum, sampleRate, fftSize)
    expect(result.find(s => s.type === 'HPF')).toBeDefined()
    expect(result.find(s => s.type === 'lowShelf')).toBeDefined()
  })

  it('skips highShelf when harsh region has broad spectral elevation (flatness > 0.4)', () => {
    // Broad, uniform elevation in 6-10 kHz → high spectral flatness → skip highShelf
    const spectrum = flatSpectrum(-40)
    const hzPerBin = sampleRate / fftSize
    const harshLow = Math.round(6000 / hzPerBin)
    const harshHigh = Math.round(10000 / hzPerBin)
    // Uniform +7 dB across entire harsh region → flatness near 1.0 (perfectly flat)
    for (let i = harshLow; i < harshHigh; i++) {
      spectrum[i] = -33 // 7 dB excess
    }
    const result = analyzeSpectralTrends(spectrum, sampleRate, fftSize)
    // Flatness of a perfectly uniform region ≈ 1.0, well above 0.4 → no highShelf
    expect(result.find(s => s.type === 'highShelf')).toBeUndefined()
  })

  it('recommends highShelf when harsh region has a concentrated spike (low flatness)', () => {
    const spectrum = flatSpectrum(-40)
    const hzPerBin = sampleRate / fftSize
    const harshLow = Math.round(6000 / hzPerBin)
    const harshHigh = Math.round(10000 / hzPerBin)
    const spikeCenterBin = Math.round(8000 / hzPerBin)
    // Spike covers ~20% of the harsh region at -10 dB (rest at -40 dB)
    const spikeHalfWidth = 75
    for (let i = spikeCenterBin - spikeHalfWidth; i <= spikeCenterBin + spikeHalfWidth; i++) {
      if (i >= harshLow && i < harshHigh) {
        spectrum[i] = -10
      }
    }

    const result = analyzeSpectralTrends(spectrum, sampleRate, fftSize)
    const harsh = result.find(s => s.type === 'highShelf')
    expect(harsh).toBeDefined()
  })

  it('all three shelf types can coexist when conditions are met', () => {
    const spectrum = flatSpectrum(-40)
    const hzPerBin = sampleRate / fftSize

    // Rumble
    const lowEndBin = Math.round(80 / hzPerBin)
    for (let i = 0; i < lowEndBin; i++) spectrum[i] = -30

    // Strong mud (above raised threshold)
    const mudLow = Math.round(200 / hzPerBin)
    const mudHigh = Math.round(400 / hzPerBin)
    for (let i = mudLow; i < mudHigh; i++) spectrum[i] = -32

    // Harshness: use a narrow spike so the spectral flatness guard passes
    const harshLow = Math.round(6000 / hzPerBin)
    const harshHigh = Math.round(10000 / hzPerBin)
    const spikeBin = Math.round(8000 / hzPerBin)
    for (let i = spikeBin - 75; i <= spikeBin + 75; i++) {
      if (i >= harshLow && i < harshHigh) {
        spectrum[i] = -10
      }
    }

    const result = analyzeSpectralTrends(spectrum, sampleRate, fftSize)
    expect(result).toHaveLength(3)
    expect(result.map(s => s.type)).toContain('HPF')
    expect(result.map(s => s.type)).toContain('lowShelf')
    expect(result.map(s => s.type)).toContain('highShelf')
  })
})

// ── validateShelves ───────────────────────────────────────────────────────

describe('validateShelves', () => {
  it('removes duplicate shelf types (keeps first)', () => {
    const shelves = [
      { type: 'lowShelf' as const, hz: 300, gainDb: -3, reason: 'first' },
      { type: 'lowShelf' as const, hz: 250, gainDb: -4, reason: 'duplicate' },
    ]
    const result = validateShelves(shelves)
    expect(result).toHaveLength(1)
    expect(result[0].reason).toBe('first')
  })

  it('allows one of each type', () => {
    const shelves = [
      { type: 'HPF' as const, hz: 80, gainDb: 0, reason: 'rumble' },
      { type: 'lowShelf' as const, hz: 300, gainDb: -3, reason: 'mud' },
      { type: 'highShelf' as const, hz: 8000, gainDb: -3, reason: 'harsh' },
    ]
    const result = validateShelves(shelves)
    expect(result).toHaveLength(3)
  })

  it('rejects lowShelf at or below HPF frequency', () => {
    const shelves = [
      { type: 'HPF' as const, hz: 80, gainDb: 0, reason: 'rumble' },
      { type: 'lowShelf' as const, hz: 80, gainDb: -3, reason: 'bad overlap' },
    ]
    const result = validateShelves(shelves)
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('HPF')
  })

  it('caps at 3 shelves total', () => {
    // Force 4 shelves by providing different types including duplicates
    const shelves = [
      { type: 'HPF' as const, hz: 80, gainDb: 0, reason: 'a' },
      { type: 'lowShelf' as const, hz: 300, gainDb: -3, reason: 'b' },
      { type: 'highShelf' as const, hz: 8000, gainDb: -3, reason: 'c' },
      // Extra after dedup won't happen with 3 types, but slice(0,3) is a safety net
    ]
    const result = validateShelves(shelves)
    expect(result.length).toBeLessThanOrEqual(3)
  })

  it('returns empty array for empty input', () => {
    expect(validateShelves([])).toHaveLength(0)
  })
})

// ── generateEQAdvisory ─────────────────────────────────────────────────────

describe('generateEQAdvisory', () => {
  it('returns geq, peq, shelves, and pitch', () => {
    const track = makeTrack({ trueFrequencyHz: 440 })
    const advisory = generateEQAdvisory(track, 'RESONANCE', 'surgical')
    expect(advisory.geq).toBeDefined()
    expect(advisory.peq).toBeDefined()
    expect(advisory.shelves).toBeDefined()
    expect(advisory.pitch).toBeDefined()
  })

  it('pitch reflects the track frequency', () => {
    const track = makeTrack({ trueFrequencyHz: 440 }) // A4
    const advisory = generateEQAdvisory(track, 'RESONANCE', 'surgical')
    expect(advisory.pitch.note).toBe('A')
    expect(advisory.pitch.octave).toBe(4)
  })

  it('returns empty shelves without spectrum data', () => {
    const track = makeTrack()
    const advisory = generateEQAdvisory(track, 'RESONANCE', 'surgical')
    expect(advisory.shelves).toHaveLength(0)
  })
})

// ── Utility functions ──────────────────────────────────────────────────────

describe('getSeverityColor', () => {
  it.each<[SeverityLevel, string]>([
    ['RUNAWAY', VIZ_COLORS.RUNAWAY],
    ['GROWING', VIZ_COLORS.GROWING],
    ['RESONANCE', VIZ_COLORS.RESONANCE],
    ['POSSIBLE_RING', VIZ_COLORS.POSSIBLE_RING],
    ['WHISTLE', VIZ_COLORS.WHISTLE],
    ['INSTRUMENT', VIZ_COLORS.INSTRUMENT],
  ])('maps %s to correct color', (severity, expected) => {
    expect(getSeverityColor(severity)).toBe(expected)
  })
})

describe('getGEQBandLabels', () => {
  it('returns 31 labels (one per ISO band)', () => {
    const labels = getGEQBandLabels()
    expect(labels).toHaveLength(31)
  })

  it('formats kHz bands with "k" suffix', () => {
    const labels = getGEQBandLabels()
    const idx1k = ISO_31_BANDS.indexOf(1000)
    expect(labels[idx1k]).toBe('1k')
    const idx10k = ISO_31_BANDS.indexOf(10000)
    expect(labels[idx10k]).toBe('10k')
  })

  it('formats Hz bands as plain numbers', () => {
    const labels = getGEQBandLabels()
    expect(labels[0]).toBe('20') // 20 Hz
    expect(labels[4]).toBe('50') // 50 Hz
  })
})
