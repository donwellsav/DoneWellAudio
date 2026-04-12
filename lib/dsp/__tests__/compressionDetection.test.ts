/**
 * Compression Detection & Spectral Flatness Tests
 *
 * Tests AmplitudeHistoryBuffer.detectCompression() and calculateSpectralFlatness().
 *
 * AmplitudeHistoryBuffer: tracks peak/RMS history for crest factor analysis.
 * - High crest factor (12+ dB) → uncompressed
 * - Low crest factor (<6 dB) → compressed
 *
 * calculateSpectralFlatness: measures how "tonal" a spectral peak is.
 * - Pure tone → flatness ≈ 0, high kurtosis, high feedbackScore
 * - White noise → flatness ≈ 1, low kurtosis, low feedbackScore
 */

import { describe, it, expect } from 'vitest'
import {
  AmplitudeHistoryBuffer,
  calculateSpectralFlatness,
  COMPRESSION_CONSTANTS,
  SPECTRAL_CONSTANTS,
} from '../compressionDetection'
import { pureSine, noiseFloor } from './helpers/signalGenerator'

// ── AmplitudeHistoryBuffer ──────────────────────────────────────────────────

describe('AmplitudeHistoryBuffer', () => {
  // ── High crest factor → not compressed ──────────────────────────────

  describe('uncompressed audio', () => {
    it('returns isCompressed=false for high crest factor (12 dB)', () => {
      const buf = new AmplitudeHistoryBuffer()

      // Simulate uncompressed: peak-to-RMS gap of ~12 dB
      for (let i = 0; i < 20; i++) {
        buf.addSample(-8, -20) // peak=-8, rms=-20 → crest=12 dB
      }

      const result = buf.detectCompression()

      expect(result.isCompressed).toBe(false)
      expect(result.crestFactor).toBeCloseTo(12, 0)
      expect(result.thresholdMultiplier).toBe(1)
    })
  })

  // ── Low crest factor → compressed ──────────────────────────────────

  describe('compressed audio', () => {
    it('returns isCompressed=true for low crest factor (4 dB)', () => {
      const buf = new AmplitudeHistoryBuffer()

      // Simulate compressed: peak-to-RMS gap of only 4 dB
      for (let i = 0; i < 20; i++) {
        buf.addSample(-10, -14) // crest=4 dB < COMPRESSED_CREST_FACTOR (6)
      }

      const result = buf.detectCompression()

      expect(result.isCompressed).toBe(true)
      expect(result.crestFactor).toBeCloseTo(4, 0)
    })

    it('returns isCompressed=true for low dynamic range', () => {
      const buf = new AmplitudeHistoryBuffer()

      // Dynamic range = maxPeak - minRms
      // All samples clustered: peak=-10, rms=-14 → dynamicRange=4 < COMPRESSED_DYNAMIC_RANGE (8)
      for (let i = 0; i < 20; i++) {
        buf.addSample(-10, -14) // crest=4, dynamicRange=4
      }

      const result = buf.detectCompression()

      expect(result.isCompressed).toBe(true)
      expect(result.dynamicRange).toBeLessThan(COMPRESSION_CONSTANTS.COMPRESSED_DYNAMIC_RANGE)
    })
  })

  // ── Fewer than 10 samples → default ────────────────────────────────

  describe('min samples gate', () => {
    it('returns uncompressed default with fewer than 10 samples', () => {
      const buf = new AmplitudeHistoryBuffer()

      for (let i = 0; i < 9; i++) {
        buf.addSample(-5, -10)
      }

      const result = buf.detectCompression()

      expect(result.isCompressed).toBe(false)
      expect(result.estimatedRatio).toBe(1)
      expect(result.crestFactor).toBe(COMPRESSION_CONSTANTS.NORMAL_CREST_FACTOR)
      expect(result.thresholdMultiplier).toBe(1)
    })
  })

  // ── estimatedRatio ─────────────────────────────────────────────────

  describe('estimatedRatio', () => {
    it('higher for more compressed signals', () => {
      const light = new AmplitudeHistoryBuffer()
      const heavy = new AmplitudeHistoryBuffer()

      // Light compression: crest=8 dB
      for (let i = 0; i < 20; i++) light.addSample(-10, -18)
      // Heavy compression: crest=3 dB
      for (let i = 0; i < 20; i++) heavy.addSample(-10, -13)

      const rLight = light.detectCompression()
      const rHeavy = heavy.detectCompression()

      // estimatedRatio = NORMAL_CREST_FACTOR / crest
      // 12/8 = 1.5 vs 12/3 = 4.0
      expect(rHeavy.estimatedRatio).toBeGreaterThan(rLight.estimatedRatio)
    })
  })

  // ── thresholdMultiplier ────────────────────────────────────────────

  describe('thresholdMultiplier', () => {
    it('is 1.0 when not compressed', () => {
      const buf = new AmplitudeHistoryBuffer()
      for (let i = 0; i < 20; i++) buf.addSample(-5, -18)

      const result = buf.detectCompression()

      expect(result.isCompressed).toBe(false)
      expect(result.thresholdMultiplier).toBe(1)
    })

    it('is > 1.0 when compressed', () => {
      const buf = new AmplitudeHistoryBuffer()
      for (let i = 0; i < 20; i++) buf.addSample(-10, -13)

      const result = buf.detectCompression()

      expect(result.isCompressed).toBe(true)
      expect(result.thresholdMultiplier).toBeGreaterThan(1)
    })

    it('is capped at 1.5', () => {
      const buf = new AmplitudeHistoryBuffer()
      // Extreme compression: crest=1 dB → ratio=12
      for (let i = 0; i < 20; i++) buf.addSample(-10, -11)

      const result = buf.detectCompression()

      expect(result.thresholdMultiplier).toBeLessThanOrEqual(1.5)
    })
  })

  // ── Reset ──────────────────────────────────────────────────────────

  describe('reset', () => {
    it('clears buffer and returns default after reset', () => {
      const buf = new AmplitudeHistoryBuffer()
      for (let i = 0; i < 20; i++) buf.addSample(-10, -13)

      // Before reset — should be compressed
      const before = buf.detectCompression()
      expect(before.isCompressed).toBe(true)

      buf.reset()

      // After reset — should return default (not enough samples)
      const after = buf.detectCompression()
      expect(after.isCompressed).toBe(false)
      expect(after.estimatedRatio).toBe(1)
      expect(after.thresholdMultiplier).toBe(1)
    })
  })
})

// ── calculateSpectralFlatness ───────────────────────────────────────────────

describe('calculateSpectralFlatness', () => {
  // ── Pure tone → low flatness, high kurtosis ────────────────────────

  describe('pure tone (feedback)', () => {
    it('produces low flatness and high kurtosis', () => {
      const spectrum = pureSine(1000, -10, 48000, 8192)
      const peakBin = Math.round(1000 * 8192 / 48000)

      const result = calculateSpectralFlatness(spectrum, peakBin, 5)

      expect(result.flatness).toBeLessThan(SPECTRAL_CONSTANTS.PURE_TONE_FLATNESS)
      expect(result.kurtosis).toBeGreaterThan(0)
      expect(result.feedbackScore).toBeGreaterThan(0.5)
    })

    it('isFeedbackLikely is true for pure tone', () => {
      const spectrum = pureSine(2000, -15, 48000, 8192)
      const peakBin = Math.round(2000 * 8192 / 48000)

      const result = calculateSpectralFlatness(spectrum, peakBin, 5)

      expect(result.isFeedbackLikely).toBe(true)
    })
  })

  // ── White noise → high flatness, low kurtosis ─────────────────────

  describe('white noise (not feedback)', () => {
    it('produces flatness ≈ 1 for uniform spectrum', () => {
      const spectrum = noiseFloor(-40, 8192)
      const peakBin = 500

      const result = calculateSpectralFlatness(spectrum, peakBin, 5)

      // All bins equal → geometric mean = arithmetic mean → flatness = 1
      expect(result.flatness).toBeCloseTo(1, 1)
      // Excess kurtosis is negative for uniform/near-uniform distributions
      expect(result.kurtosis).toBeLessThanOrEqual(0)
      expect(result.feedbackScore).toBeLessThan(0.3)
    })

    it('isFeedbackLikely is false for uniform spectrum', () => {
      const spectrum = noiseFloor(-40, 8192)
      const result = calculateSpectralFlatness(spectrum, 500, 5)

      expect(result.isFeedbackLikely).toBe(false)
    })
  })

  // ── feedbackScore formula ─────────────────────────────────────────

  describe('feedbackScore formula', () => {
    it('follows 0.6 * flatnessScore + 0.4 * kurtosisScore', () => {
      const spectrum = pureSine(1500, -10, 48000, 8192)
      const peakBin = Math.round(1500 * 8192 / 48000)

      const result = calculateSpectralFlatness(spectrum, peakBin, 5)

      // Reconstruct expected score from components
      const flatnessScore = 1 - Math.min(result.flatness / SPECTRAL_CONSTANTS.MUSIC_FLATNESS, 1)
      const kurtosisScore = Math.min(Math.max(result.kurtosis, 0) / SPECTRAL_CONSTANTS.HIGH_KURTOSIS, 1)
      const expectedScore = flatnessScore * 0.6 + kurtosisScore * 0.4

      expect(result.feedbackScore).toBeCloseTo(expectedScore, 5)
    })
  })

  // ── Empty/edge cases ──────────────────────────────────────────────

  describe('edge cases', () => {
    it('returns default for empty region', () => {
      // All -Infinity → linear=0 for all bins → empty region
      const spectrum = new Float32Array(4096)
      spectrum.fill(-Infinity)

      const result = calculateSpectralFlatness(spectrum, 500, 5)

      expect(result.flatness).toBe(1)
      expect(result.feedbackScore).toBe(0)
      expect(result.isFeedbackLikely).toBe(false)
    })

    it('handles peakBin at edge of spectrum', () => {
      const spectrum = pureSine(100, -10, 48000, 8192)
      // peakBin near 0 — bandwidth extends into negative bins (clamped)
      const result = calculateSpectralFlatness(spectrum, 2, 5)

      // Should not throw
      expect(result.flatness).toBeGreaterThanOrEqual(0)
    })

    it('detects narrow tone surrounded by -100 dB floor bins as feedback-like', () => {
      // Regression: AnalyserNode.minDecibels = -100, so floor bins are exactly -100.
      // A single tone peak at -20 dB surrounded by -100 dB bins should produce
      // low flatness (tonal signal), NOT flatness ≈ 1.0 (broadband).
      const spectrum = new Float32Array(4096)
      spectrum.fill(-100) // floor (AnalyserNode default minDecibels)
      const peakBin = 500
      spectrum[peakBin] = -20 // 80 dB above floor — clear feedback tone

      const result = calculateSpectralFlatness(spectrum, peakBin, 5)

      // Flatness should be very low — one peak among floor bins is maximally tonal.
      // With the old `<= -100` skip, count collapsed to 1 and flatness was ~1.0 (wrong).
      expect(result.flatness).toBeLessThan(0.1)
      expect(result.isFeedbackLikely).toBe(true)
    })
  })
})
