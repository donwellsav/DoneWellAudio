import { describe, it, expect } from 'vitest'
import { verifyGEQCorrections } from '../closedLoopEQ'

describe('verifyGEQCorrections', () => {
  it('marks correction as effective when drop exceeds threshold', () => {
    const corrections = { '22': -6 } // band 22 = 2500Hz
    const preRTA = { '2500': -20 }
    const postRTA = { '2500': -26 }
    const results = verifyGEQCorrections(corrections, preRTA, postRTA, 3)
    expect(results).toHaveLength(1)
    expect(results[0].effective).toBe(true)
    expect(results[0].dropDb).toBe(6)
    expect(results[0].adjustedGain).toBeUndefined()
  })

  it('marks correction as ineffective and suggests deepening', () => {
    const corrections = { '22': -3 }
    const preRTA = { '2500': -20 }
    const postRTA = { '2500': -21 } // only 1dB drop, below 3dB threshold
    const results = verifyGEQCorrections(corrections, preRTA, postRTA, 3)
    expect(results[0].effective).toBe(false)
    expect(results[0].adjustedGain).toBe(-6) // deepened by 3dB
  })

  it('does not deepen beyond maxCutDb', () => {
    const corrections = { '22': -11 }
    const preRTA = { '2500': -20 }
    const postRTA = { '2500': -20 } // no drop
    const results = verifyGEQCorrections(corrections, preRTA, postRTA, 3, -12)
    expect(results[0].adjustedGain).toBe(-12) // clamped
  })

  it('does not suggest deepening when already at maxCutDb', () => {
    const corrections = { '22': -12 }
    const preRTA = { '2500': -20 }
    const postRTA = { '2500': -20 }
    const results = verifyGEQCorrections(corrections, preRTA, postRTA, 3, -12)
    expect(results[0].adjustedGain).toBeUndefined() // already at max
  })

  it('handles missing RTA data gracefully (defaults to -90)', () => {
    const corrections = { '22': -6 }
    const results = verifyGEQCorrections(corrections, {}, {})
    expect(results[0].preCorrectionDb).toBe(-90)
    expect(results[0].postCorrectionDb).toBe(-90)
    expect(results[0].dropDb).toBe(0)
  })

  it('skips invalid band numbers', () => {
    const corrections = { '0': -6, '32': -6 }
    const results = verifyGEQCorrections(corrections, {}, {})
    expect(results).toHaveLength(0)
  })
})
