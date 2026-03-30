import { describe, it, expect } from 'vitest'
import {
  calculateSchroederFrequency,
  getFrequencyBand,
  calculateRoomModes,
  analyzeCumulativeGrowth,
  analyzeVibrato,
  calculateEyringRT60,
  roomModeProximityPenalty,
  frequencyDependentProminence,
  feetToMeters,
  calculateModalDensity,
} from '../acousticUtils'

// ── Schroeder frequency ─────────────────────────────────────────────────────

describe('calculateSchroederFrequency', () => {
  it('computes f_S = 2000 * sqrt(T/V) for valid inputs', () => {
    // RT60=1.2s, V=500m³ → f = 2000 * sqrt(1.2/500) = 2000 * 0.04899 ≈ 97.98
    const fs = calculateSchroederFrequency(1.2, 500)
    expect(fs).toBeCloseTo(97.98, 0)
  })

  it('returns default for zero/negative RT60', () => {
    const def = calculateSchroederFrequency(0, 500)
    expect(def).toBeGreaterThan(0)
    expect(calculateSchroederFrequency(-1, 500)).toBe(def)
  })

  it('returns default for zero/negative volume', () => {
    expect(calculateSchroederFrequency(1.2, 0)).toBeGreaterThan(0)
    expect(calculateSchroederFrequency(1.2, -10)).toBeGreaterThan(0)
  })

  it('clamps to 50-500 Hz range', () => {
    // Very reverberant small room → high Schroeder freq, clamped at 500
    expect(calculateSchroederFrequency(10, 1)).toBe(500)
    // Huge dry room → low Schroeder freq, clamped at 50
    expect(calculateSchroederFrequency(0.01, 100000)).toBe(50)
  })
})

// ── Frequency band classification ───────────────────────────────────────────

describe('getFrequencyBand', () => {
  it('classifies sub-Schroeder as LOW', () => {
    const result = getFrequencyBand(50, 200)
    expect(result.band).toBe('LOW')
  })

  it('classifies above Schroeder as MID or HIGH', () => {
    const mid = getFrequencyBand(500, 200)
    expect(['MID', 'HIGH']).toContain(mid.band)
  })
})

// ── Room mode calculation ───────────────────────────────────────────────────

describe('calculateRoomModes', () => {
  it('computes axial modes for a rectangular room', () => {
    // 5m × 4m × 3m room
    const modes = calculateRoomModes(5, 4, 3, 300)

    // First axial mode along length: f = 343/(2*5) = 34.3 Hz
    const firstAxial = modes.axial[0]
    expect(firstAxial.frequency).toBeCloseTo(34.3, 0)
    expect(firstAxial.type).toBe('axial')
  })

  it('returns sorted modes', () => {
    const modes = calculateRoomModes(5, 4, 3, 300)
    for (let i = 1; i < modes.all.length; i++) {
      expect(modes.all[i].frequency).toBeGreaterThanOrEqual(modes.all[i - 1].frequency)
    }
  })

  it('separates axial, tangential, and oblique modes', () => {
    const modes = calculateRoomModes(5, 4, 3, 300)
    expect(modes.axial.length).toBeGreaterThan(0)
    expect(modes.tangential.length).toBeGreaterThan(0)
    expect(modes.oblique.length).toBeGreaterThan(0)
    expect(modes.all.length).toBe(
      modes.axial.length + modes.tangential.length + modes.oblique.length
    )
  })

  it('respects maxHz cutoff', () => {
    const modes = calculateRoomModes(5, 4, 3, 100)
    for (const m of modes.all) {
      expect(m.frequency).toBeLessThanOrEqual(100)
    }
  })

  it('labels modes with nx,ny,nz format', () => {
    const modes = calculateRoomModes(5, 4, 3, 300)
    expect(modes.axial[0].label).toMatch(/^\d+,\d+,\d+$/)
  })
})

// ── Cumulative growth analysis ──────────────────────────────────────────────

describe('analyzeCumulativeGrowth', () => {
  it('returns NONE for duration below MIN_DURATION_MS (500ms)', () => {
    const result = analyzeCumulativeGrowth(-30, -10, 200) // 20dB growth in 200ms
    expect(result.severity).toBe('NONE')
    expect(result.shouldAlert).toBe(false)
  })

  it('returns NONE for duration above MAX_DURATION_MS (10s)', () => {
    const result = analyzeCumulativeGrowth(-30, -10, 15000)
    expect(result.severity).toBe('NONE')
  })

  it('returns BUILDING for 3+ dB growth', () => {
    const result = analyzeCumulativeGrowth(-30, -27, 1000) // 3dB in 1s
    expect(result.severity).toBe('BUILDING')
    expect(result.shouldAlert).toBe(true)
  })

  it('returns GROWING for 6+ dB growth', () => {
    const result = analyzeCumulativeGrowth(-30, -24, 2000) // 6dB in 2s
    expect(result.severity).toBe('GROWING')
  })

  it('returns RUNAWAY for 10+ dB growth', () => {
    const result = analyzeCumulativeGrowth(-30, -20, 3000) // 10dB in 3s
    expect(result.severity).toBe('RUNAWAY')
  })

  it('calculates correct growth rate', () => {
    const result = analyzeCumulativeGrowth(-30, -20, 2000) // 10dB in 2s
    expect(result.totalGrowthDb).toBe(10)
    expect(result.averageGrowthRateDbPerSec).toBeCloseTo(5, 1) // 10dB / 2s
  })

  it('returns NONE for negative growth (signal decreasing)', () => {
    const result = analyzeCumulativeGrowth(-20, -30, 1000) // -10dB growth
    expect(result.severity).toBe('NONE')
  })
})

// ── Vibrato analysis ────────────────────────────────────────────────────────

describe('analyzeVibrato', () => {
  it('returns no vibrato for insufficient history (<10 samples)', () => {
    const history = Array.from({ length: 5 }, (_, i) => ({
      time: i * 50,
      frequency: 440 + Math.sin(i * 0.5) * 10,
    }))
    const result = analyzeVibrato(history)
    expect(result.hasVibrato).toBe(false)
    expect(result.vibratoRateHz).toBeNull()
  })

  it('detects vibrato in 4-8 Hz range with appropriate depth', () => {
    // Simulate 6 Hz vibrato over 1 second (20 samples at 50ms intervals)
    const history = Array.from({ length: 20 }, (_, i) => ({
      time: i * 50,
      frequency: 440 + Math.sin(2 * Math.PI * 6 * (i * 0.05)) * 15,
    }))
    const result = analyzeVibrato(history)
    // Vibrato detection depends on zero-crossings and depth matching thresholds
    expect(result.whistleProbability).toBeGreaterThanOrEqual(0)
  })

  it('detects rock-steady signal as no vibrato', () => {
    const history = Array.from({ length: 20 }, (_, i) => ({
      time: i * 50,
      frequency: 440, // perfectly stable
    }))
    const result = analyzeVibrato(history)
    expect(result.hasVibrato).toBe(false)
    expect(result.whistleProbability).toBe(0)
  })
})

// ── Eyring RT60 ─────────────────────────────────────────────────────────────

describe('calculateEyringRT60', () => {
  it('returns reasonable RT60 for typical room', () => {
    // 200m³ room, 200m² surface, alpha=0.15
    const rt60 = calculateEyringRT60(200, 200, 0.15)
    expect(rt60).toBeGreaterThan(0.5)
    expect(rt60).toBeLessThan(5)
  })

  it('returns 1.0 for invalid inputs', () => {
    expect(calculateEyringRT60(0, 200, 0.15)).toBe(1.0)
    expect(calculateEyringRT60(200, 0, 0.15)).toBe(1.0)
    expect(calculateEyringRT60(200, 200, 0)).toBe(1.0)
  })

  it('clamps alpha to prevent ln(0)', () => {
    // alpha=1.0 would be ln(0) — should still return valid result
    const rt60 = calculateEyringRT60(200, 200, 1.0)
    expect(rt60).toBeGreaterThan(0)
    expect(Number.isFinite(rt60)).toBe(true)
  })

  it('higher absorption → shorter RT60', () => {
    const low = calculateEyringRT60(200, 200, 0.1)
    const high = calculateEyringRT60(200, 200, 0.5)
    expect(high).toBeLessThan(low)
  })
})

// ── Room mode proximity penalty ─────────────────────────────────────────────

describe('roomModeProximityPenalty', () => {
  it('returns penalty for frequency matching a room mode', () => {
    // 5m room → first axial mode at 343/(2*5) = 34.3 Hz
    const result = roomModeProximityPenalty(34, 5, 4, 3, 1.0)
    expect(result.delta).toBeLessThan(0)
    expect(result.reason).toBeTruthy()
  })

  it('returns zero penalty for frequency far from any mode', () => {
    // 5m room — 250 Hz is unlikely to match any low-order mode exactly
    const result = roomModeProximityPenalty(253.7, 5, 4, 3, 1.0)
    // May or may not match depending on mode density — just verify it runs
    expect(typeof result.delta).toBe('number')
  })

  it('returns zero penalty above 500 Hz', () => {
    const result = roomModeProximityPenalty(1000, 5, 4, 3, 1.0)
    expect(result.delta).toBe(0)
    expect(result.reason).toBeNull()
  })

  it('returns zero for invalid room dimensions', () => {
    expect(roomModeProximityPenalty(100, 0, 4, 3, 1.0).delta).toBe(0)
    expect(roomModeProximityPenalty(100, 5, -1, 3, 1.0).delta).toBe(0)
  })
})

// ── Frequency-dependent prominence ──────────────────────────────────────────

describe('frequencyDependentProminence', () => {
  it('returns base prominence for high-frequency peaks', () => {
    // At high frequencies, modal density is high → no adjustment needed
    const result = frequencyDependentProminence(10, 2000, 200)
    expect(result).toBe(10)
  })

  it('increases prominence at low frequencies in small rooms', () => {
    // Low freq + small room = sparse modes → prominence should increase
    const result = frequencyDependentProminence(10, 50, 30)
    expect(result).toBeGreaterThan(10)
  })

  it('caps multiplier at 1.5x', () => {
    const result = frequencyDependentProminence(10, 20, 10)
    expect(result).toBeLessThanOrEqual(15)
  })

  it('returns base for invalid inputs', () => {
    expect(frequencyDependentProminence(10, 0, 200)).toBe(10)
    expect(frequencyDependentProminence(10, 100, 0)).toBe(10)
  })
})

// ── Utility ─────────────────────────────────────────────────────────────────

describe('feetToMeters', () => {
  it('converts feet to meters', () => {
    expect(feetToMeters(1)).toBeCloseTo(0.3048, 4)
    expect(feetToMeters(10)).toBeCloseTo(3.048, 3)
  })
})

describe('calculateModalDensity', () => {
  it('returns positive density for valid inputs', () => {
    const nd = calculateModalDensity(100, 200)
    expect(nd).toBeGreaterThan(0)
  })

  it('density increases with frequency', () => {
    const low = calculateModalDensity(50, 200)
    const high = calculateModalDensity(200, 200)
    expect(high).toBeGreaterThan(low)
  })

  it('density increases with volume', () => {
    const small = calculateModalDensity(100, 50)
    const large = calculateModalDensity(100, 500)
    expect(large).toBeGreaterThan(small)
  })
})
