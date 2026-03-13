/**
 * MSD (Magnitude Slope Deviation) Tests — Kill the Ring
 *
 * Tests the MSDHistoryBuffer class from msdAnalysis.ts against
 * the DAFx-16 paper's mathematical definition:
 *
 *   MSD = (1/(N-2)) × Σ|G''(k,n)|²
 *   where G''(k,n) = G(k,n) - 2G(k,n-1) + G(k,n-2)
 *
 * References:
 *   - DAFx-16 paper: "Howling Detection based on Magnitude Slope Deviation"
 *   - lib/dsp/msdAnalysis.ts: MSDHistoryBuffer class
 *   - lib/dsp/constants.ts: MSD_SETTINGS (THRESHOLD=0.1, MIN_FRAMES_SPEECH=7)
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { MSDHistoryBuffer, MSD_CONSTANTS } from '@/lib/dsp/msdAnalysis'

const NUM_BINS = 128 // Small for testing
const TEST_BIN = 64  // Middle bin for all tests

describe('MSDHistoryBuffer', () => {
  let buffer: MSDHistoryBuffer

  beforeEach(() => {
    buffer = new MSDHistoryBuffer(NUM_BINS)
  })

  describe('Initialization', () => {
    it('starts with zero frame count', () => {
      expect(buffer.getFrameCount()).toBe(0)
    })

    it('returns msd=Infinity when below minimum frames', () => {
      // Add only 3 frames (below MIN_FRAMES_SPEECH=7)
      for (let i = 0; i < 3; i++) {
        const frame = new Float32Array(NUM_BINS).fill(-50)
        buffer.addFrame(frame)
      }
      const result = buffer.calculateMSD(TEST_BIN)
      expect(result.msd).toBe(Infinity)
      expect(result.feedbackScore).toBe(0)
      expect(result.isFeedbackLikely).toBe(false)
    })
  })

  describe('Constant Magnitude (Feedback Pattern)', () => {
    it('constant -30dB across 20 frames → MSD ≈ 0', () => {
      for (let i = 0; i < 20; i++) {
        const frame = new Float32Array(NUM_BINS).fill(-30)
        buffer.addFrame(frame)
      }
      const result = buffer.calculateMSD(TEST_BIN)
      expect(result.msd).toBeCloseTo(0, 5)
      expect(result.feedbackScore).toBeCloseTo(1.0, 1) // exp(-0/0.1) = 1.0
      expect(result.isFeedbackLikely).toBe(true)
    })

    it('constant magnitude has zero second derivative', () => {
      for (let i = 0; i < 20; i++) {
        const frame = new Float32Array(NUM_BINS).fill(-40)
        buffer.addFrame(frame)
      }
      const result = buffer.calculateMSD(TEST_BIN)
      // Second derivative of constant = 0, so MSD = 0
      expect(result.msd).toBeLessThan(0.001)
    })
  })

  describe('Linear Growth (Feedback Onset)', () => {
    it('linear +1 dB/frame for 20 frames → MSD ≈ 0', () => {
      // Feedback onset: linear growth on dB scale
      // G(n) = -50 + n, so G'(n) = 1, G''(n) = 0
      for (let i = 0; i < 20; i++) {
        const frame = new Float32Array(NUM_BINS).fill(-50 + i)
        buffer.addFrame(frame)
      }
      const result = buffer.calculateMSD(TEST_BIN)
      // Linear growth has zero second derivative → MSD ≈ 0
      expect(result.msd).toBeCloseTo(0, 3)
      expect(result.isFeedbackLikely).toBe(true)
    })

    it('linear -0.5 dB/frame (decaying feedback) → MSD ≈ 0', () => {
      for (let i = 0; i < 20; i++) {
        const frame = new Float32Array(NUM_BINS).fill(-30 - 0.5 * i)
        buffer.addFrame(frame)
      }
      const result = buffer.calculateMSD(TEST_BIN)
      expect(result.msd).toBeCloseTo(0, 3)
    })
  })

  describe('Random Fluctuation (Music/Speech Pattern)', () => {
    it('random dB values → high MSD (not feedback)', () => {
      // Music: random fluctuations in magnitude
      const rng = mulberry32(42) // Seeded random for reproducibility
      for (let i = 0; i < 20; i++) {
        const frame = new Float32Array(NUM_BINS)
        for (let b = 0; b < NUM_BINS; b++) {
          frame[b] = -50 + rng() * 30 // Random between -50 and -20
        }
        buffer.addFrame(frame)
      }
      const result = buffer.calculateMSD(TEST_BIN)
      expect(result.msd).toBeGreaterThan(0.5) // Well above threshold
      expect(result.isFeedbackLikely).toBe(false)
      expect(result.feedbackScore).toBeLessThan(0.01) // exp(-large/0.1) ≈ 0
    })

    it('sinusoidal modulation → high MSD (vibrato/music)', () => {
      // Simulates vibrato or musical amplitude modulation
      for (let i = 0; i < 30; i++) {
        const frame = new Float32Array(NUM_BINS)
        frame.fill(-35 + 5 * Math.sin(2 * Math.PI * i / 8)) // 5dB modulation at ~6Hz
        buffer.addFrame(frame)
      }
      const result = buffer.calculateMSD(TEST_BIN)
      // Sinusoidal amplitude has non-zero second derivative
      expect(result.msd).toBeGreaterThan(MSD_CONSTANTS.THRESHOLD)
      expect(result.isFeedbackLikely).toBe(false)
    })
  })

  describe('Energy Gate (Silence Floor)', () => {
    it('bins below silence floor return feedbackScore = 0', () => {
      // Below MSD_CONSTANTS.SILENCE_FLOOR_DB (-70)
      for (let i = 0; i < 20; i++) {
        const frame = new Float32Array(NUM_BINS).fill(-80)
        buffer.addFrame(frame)
      }
      const result = buffer.calculateMSD(TEST_BIN)
      expect(result.feedbackScore).toBe(0)
      expect(result.isFeedbackLikely).toBe(false)
    })

    it('bins above silence floor are analyzed normally', () => {
      for (let i = 0; i < 20; i++) {
        const frame = new Float32Array(NUM_BINS).fill(-30)
        buffer.addFrame(frame)
      }
      const result = buffer.calculateMSD(TEST_BIN)
      expect(result.feedbackScore).toBeGreaterThan(0)
      expect(result.framesAnalyzed).toBe(20)
    })
  })

  describe('FeedbackScore Formula', () => {
    it('feedbackScore = exp(-msd / THRESHOLD)', () => {
      // Create a signal with known MSD
      for (let i = 0; i < 20; i++) {
        const frame = new Float32Array(NUM_BINS).fill(-30)
        buffer.addFrame(frame)
      }
      const result = buffer.calculateMSD(TEST_BIN)
      const expected = Math.exp(-result.msd / MSD_CONSTANTS.THRESHOLD)
      expect(result.feedbackScore).toBeCloseTo(expected, 5)
    })
  })

  describe('Ring Buffer Behavior', () => {
    it('handles more frames than maxFrames (ring buffer wraps)', () => {
      // Default maxFrames = MSD_CONSTANTS.MAX_FRAMES (64), add 80 frames
      for (let i = 0; i < 80; i++) {
        const frame = new Float32Array(NUM_BINS).fill(-30 + (i % 2)) // Alternating
        buffer.addFrame(frame)
      }
      const result = buffer.calculateMSD(TEST_BIN)
      // Should not crash, and should produce valid result
      expect(Number.isFinite(result.msd)).toBe(true)
      expect(result.framesAnalyzed).toBeLessThanOrEqual(MSD_CONSTANTS.MAX_FRAMES)
    })

    it('reset clears all history', () => {
      for (let i = 0; i < 20; i++) {
        const frame = new Float32Array(NUM_BINS).fill(-30)
        buffer.addFrame(frame)
      }
      expect(buffer.getFrameCount()).toBe(20)

      buffer.reset()
      expect(buffer.getFrameCount()).toBe(0)

      const result = buffer.calculateMSD(TEST_BIN)
      expect(result.msd).toBe(Infinity) // Not enough frames
    })
  })

  describe('Frame Count Selection (Content-Aware)', () => {
    it('speech needs 7 frames minimum', () => {
      for (let i = 0; i < 6; i++) {
        buffer.addFrame(new Float32Array(NUM_BINS).fill(-30))
      }
      const result = buffer.calculateMSD(TEST_BIN, MSD_CONSTANTS.MIN_FRAMES_SPEECH)
      expect(result.msd).toBe(Infinity) // Not enough

      buffer.addFrame(new Float32Array(NUM_BINS).fill(-30))
      const result2 = buffer.calculateMSD(TEST_BIN, MSD_CONSTANTS.MIN_FRAMES_SPEECH)
      expect(result2.msd).not.toBe(Infinity) // Now enough
    })

    it('music needs 13 frames minimum', () => {
      for (let i = 0; i < 12; i++) {
        buffer.addFrame(new Float32Array(NUM_BINS).fill(-30))
      }
      const result = buffer.calculateMSD(TEST_BIN, MSD_CONSTANTS.MIN_FRAMES_MUSIC)
      expect(result.msd).toBe(Infinity)

      buffer.addFrame(new Float32Array(NUM_BINS).fill(-30))
      const result2 = buffer.calculateMSD(TEST_BIN, MSD_CONSTANTS.MIN_FRAMES_MUSIC)
      expect(result2.msd).not.toBe(Infinity)
    })
  })
})

// ── Deterministic PRNG for reproducible tests ────────────────────────────────
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
