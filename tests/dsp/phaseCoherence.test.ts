/**
 * Phase Coherence Tests — Kill the Ring
 *
 * Tests the PhaseHistoryBuffer class from phaseCoherence.ts against
 * the KU Leuven 2025 mean phasor formula:
 *
 *   coherence = | (1/N) × Σ exp(j × Δφ_n) |
 *
 * where Δφ_n = φ(n) - φ(n-1) is the frame-to-frame phase difference.
 *
 * References:
 *   - KU Leuven 2025, Equation 4
 *   - lib/dsp/phaseCoherence.ts: PhaseHistoryBuffer class
 *   - lib/dsp/constants.ts: PHASE_SETTINGS (HIGH_COHERENCE=0.85)
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { PhaseHistoryBuffer, PHASE_CONSTANTS } from '@/lib/dsp/phaseCoherence'

const NUM_BINS = 64
const TEST_BIN = 32
const MAX_FRAMES = 12

describe('PhaseHistoryBuffer', () => {
  let buffer: PhaseHistoryBuffer

  beforeEach(() => {
    buffer = new PhaseHistoryBuffer(NUM_BINS, MAX_FRAMES)
  })

  describe('Initialization', () => {
    it('starts with zero frame count', () => {
      expect(buffer.getFrameCount()).toBe(0)
    })

    it('returns coherence=0 when below minimum samples', () => {
      // Add fewer than MIN_SAMPLES (5) frames
      for (let i = 0; i < 3; i++) {
        const frame = new Float32Array(NUM_BINS).fill(0)
        buffer.addFrame(frame)
      }
      const result = buffer.calculateCoherence(TEST_BIN)
      expect(result.coherence).toBe(0)
      expect(result.feedbackScore).toBe(0)
      expect(result.isFeedbackLikely).toBe(false)
    })
  })

  describe('Constant Phase Delta (Feedback Pattern)', () => {
    it('constant phase increment → coherence ≈ 1.0', () => {
      // Feedback: phase advances by a constant amount each frame
      // Simulates a pure tone at a fixed frequency
      const phaseDelta = 0.5 // radians per frame
      for (let i = 0; i < 10; i++) {
        const frame = new Float32Array(NUM_BINS)
        frame[TEST_BIN] = phaseDelta * i // Linear phase progression
        buffer.addFrame(frame)
      }
      const result = buffer.calculateCoherence(TEST_BIN)
      // All frame-to-frame deltas are identical → perfect coherence
      expect(result.coherence).toBeCloseTo(1.0, 1)
      expect(result.isFeedbackLikely).toBe(true)
    })

    it('zero phase delta (DC-like) → coherence ≈ 1.0', () => {
      for (let i = 0; i < 10; i++) {
        const frame = new Float32Array(NUM_BINS).fill(0)
        buffer.addFrame(frame)
      }
      const result = buffer.calculateCoherence(TEST_BIN)
      // All deltas are 0, so cos(0)=1, sin(0)=0, mean phasor = (1, 0), |phasor| = 1
      expect(result.coherence).toBeCloseTo(1.0, 1)
    })
  })

  describe('Random Phase (Music/Noise Pattern)', () => {
    it('random phase per frame → low coherence', () => {
      const rng = mulberry32(42)
      for (let i = 0; i < 10; i++) {
        const frame = new Float32Array(NUM_BINS)
        for (let b = 0; b < NUM_BINS; b++) {
          frame[b] = (rng() * 2 - 1) * Math.PI // Random in [-π, π]
        }
        buffer.addFrame(frame)
      }
      const result = buffer.calculateCoherence(TEST_BIN)
      // Random phase differences → phasors cancel → low coherence
      expect(result.coherence).toBeLessThan(0.5)
      expect(result.isFeedbackLikely).toBe(false)
    })

    it('alternating phase deltas → low coherence', () => {
      // Alternating large/small deltas produce varied phasor directions
      // → vectors partially cancel → lower coherence
      const buffer2 = new PhaseHistoryBuffer(NUM_BINS, 50)
      const rng = mulberry32(99)
      let phase = 0
      for (let i = 0; i < 50; i++) {
        const frame = new Float32Array(NUM_BINS)
        // Random delta each frame: phasors point in different directions
        phase += (rng() * 2 - 1) * Math.PI
        frame[TEST_BIN] = phase
        buffer2.addFrame(frame)
      }
      const result = buffer2.calculateCoherence(TEST_BIN)
      // Random deltas → phasors cancel → low coherence
      expect(result.coherence).toBeLessThan(0.5)
    })
  })

  describe('Phase Unwrapping', () => {
    it('handles phase wrapping across +π/-π boundary', () => {
      // Phase sequence that crosses the ±π boundary
      const phases = [3.0, 3.1, -3.08, -2.98, -2.88] // Crosses +π to -π
      // The actual deltas are: 0.1, ~0.1 (after unwrap), 0.1, 0.1
      // So coherence should be high (consistent delta)
      for (let i = 0; i < phases.length; i++) {
        const frame = new Float32Array(NUM_BINS)
        frame[TEST_BIN] = phases[i]
        buffer.addFrame(frame)
      }
      const result = buffer.calculateCoherence(TEST_BIN)
      // After unwrapping, deltas should be consistent → high coherence
      expect(result.coherence).toBeGreaterThan(0.8)
    })

    it('handles negative-to-positive phase wrapping', () => {
      // Phase decreasing through -π
      const phases = [-2.9, -3.0, -3.1, 3.08, 2.98]
      for (let i = 0; i < phases.length; i++) {
        const frame = new Float32Array(NUM_BINS)
        frame[TEST_BIN] = phases[i]
        buffer.addFrame(frame)
      }
      const result = buffer.calculateCoherence(TEST_BIN)
      expect(result.coherence).toBeGreaterThan(0.7)
    })
  })

  describe('Threshold Classification', () => {
    it('coherence >= 0.85 → isFeedbackLikely = true', () => {
      // Create high coherence
      for (let i = 0; i < 10; i++) {
        const frame = new Float32Array(NUM_BINS)
        frame[TEST_BIN] = 1.0 * i
        buffer.addFrame(frame)
      }
      const result = buffer.calculateCoherence(TEST_BIN)
      if (result.coherence >= PHASE_CONSTANTS.HIGH_COHERENCE) {
        expect(result.isFeedbackLikely).toBe(true)
      }
    })

    it('feedbackScore equals coherence directly', () => {
      for (let i = 0; i < 10; i++) {
        const frame = new Float32Array(NUM_BINS)
        frame[TEST_BIN] = 0.3 * i
        buffer.addFrame(frame)
      }
      const result = buffer.calculateCoherence(TEST_BIN)
      expect(result.feedbackScore).toBe(result.coherence)
    })
  })

  describe('Ring Buffer Behavior', () => {
    it('wraps correctly when exceeding maxFrames', () => {
      // Add more frames than maxFrames (12)
      for (let i = 0; i < 20; i++) {
        const frame = new Float32Array(NUM_BINS)
        frame[TEST_BIN] = 0.5 * i
        buffer.addFrame(frame)
      }
      const result = buffer.calculateCoherence(TEST_BIN)
      expect(Number.isFinite(result.coherence)).toBe(true)
      expect(result.coherence).toBeGreaterThanOrEqual(0)
      expect(result.coherence).toBeLessThanOrEqual(1)
    })

    it('reset clears history', () => {
      for (let i = 0; i < 10; i++) {
        buffer.addFrame(new Float32Array(NUM_BINS).fill(0))
      }
      expect(buffer.getFrameCount()).toBe(10)
      buffer.reset()
      expect(buffer.getFrameCount()).toBe(0)
    })
  })

  describe('Mean Phasor Formula Verification', () => {
    it('matches manual calculation for known phase sequence', () => {
      // Known phase sequence with known deltas
      const phases = [0, 0.5, 1.0, 1.5, 2.0, 2.5]
      // Deltas: [0.5, 0.5, 0.5, 0.5, 0.5] — all identical
      // mean phasor = (1/5) × Σ exp(j × 0.5)
      // = exp(j × 0.5) (since all are the same)
      // |exp(j × 0.5)| = 1.0

      for (const phase of phases) {
        const frame = new Float32Array(NUM_BINS)
        frame[TEST_BIN] = phase
        buffer.addFrame(frame)
      }
      const result = buffer.calculateCoherence(TEST_BIN)

      // With all identical deltas, coherence should be very close to 1.0
      expect(result.coherence).toBeCloseTo(1.0, 2)

      // Mean phase delta should be 0.5
      expect(result.meanPhaseDelta).toBeCloseTo(0.5, 2)

      // Phase delta std should be ≈ 0 (all deltas identical)
      expect(result.phaseDeltaStd).toBeCloseTo(0, 2)
    })
  })
})

// ── Deterministic PRNG ───────────────────────────────────────────────────────
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
