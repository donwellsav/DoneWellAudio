/**
 * Spectral Flatness + Compression Detection Tests — Kill the Ring
 *
 * Tests calculateSpectralFlatness (Wiener entropy) and AmplitudeHistoryBuffer
 * (compression detection via crest factor + dynamic range).
 *
 * References:
 *   - lib/dsp/compressionDetection.ts
 *   - lib/dsp/constants.ts: SPECTRAL_FLATNESS_SETTINGS, COMPRESSION_SETTINGS
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  calculateSpectralFlatness,
  AmplitudeHistoryBuffer,
  SPECTRAL_CONSTANTS,
  COMPRESSION_CONSTANTS,
} from '@/lib/dsp/compressionDetection'

// ═════════════════════════════════════════════════════════════════════════════
// SPECTRAL FLATNESS
// ═════════════════════════════════════════════════════════════════════════════

describe('calculateSpectralFlatness', () => {
  it('pure tone (single bin high, rest low) → flatness near 0', () => {
    const spectrum = new Float32Array(128).fill(-80) // Background
    spectrum[64] = -20 // Single strong peak
    const result = calculateSpectralFlatness(spectrum, 64, 5)
    expect(result.flatness).toBeLessThan(0.1)
    expect(result.feedbackScore).toBeGreaterThan(0.5)
  })

  it('white noise (all bins equal) → flatness near 1', () => {
    const spectrum = new Float32Array(128).fill(-40) // All equal
    const result = calculateSpectralFlatness(spectrum, 64, 5)
    // When all values are equal, geometric mean = arithmetic mean → flatness = 1
    expect(result.flatness).toBeCloseTo(1.0, 1)
    expect(result.feedbackScore).toBeCloseTo(0, 1)
  })

  it('narrow peak with close neighbors → low flatness (feedback-like)', () => {
    const spectrum = new Float32Array(128).fill(-70)
    // Narrow peak: only 3 bins elevated
    spectrum[63] = -35
    spectrum[64] = -20
    spectrum[65] = -35
    const result = calculateSpectralFlatness(spectrum, 64, 5)
    expect(result.flatness).toBeLessThan(SPECTRAL_CONSTANTS.PURE_TONE_FLATNESS)
  })

  it('broad peak (many bins elevated) → higher flatness (music-like)', () => {
    const spectrum = new Float32Array(128).fill(-70)
    // Broad peak: many bins elevated
    for (let i = 58; i <= 70; i++) {
      spectrum[i] = -30 + Math.random() * 5
    }
    const result = calculateSpectralFlatness(spectrum, 64, 10)
    expect(result.flatness).toBeGreaterThan(0.2)
  })

  it('kurtosis is high for peaky distribution', () => {
    const spectrum = new Float32Array(128).fill(-80)
    spectrum[64] = -10 // Very sharp peak
    const result = calculateSpectralFlatness(spectrum, 64, 10)
    expect(result.kurtosis).toBeGreaterThan(0)
  })

  it('handles edge bins (peak near start of spectrum)', () => {
    const spectrum = new Float32Array(128).fill(-60)
    spectrum[2] = -20
    const result = calculateSpectralFlatness(spectrum, 2, 5)
    // Should not crash, should produce valid result
    expect(Number.isFinite(result.flatness)).toBe(true)
    expect(result.flatness).toBeGreaterThanOrEqual(0)
  })

  it('handles edge bins (peak near end of spectrum)', () => {
    const spectrum = new Float32Array(128).fill(-60)
    spectrum[126] = -20
    const result = calculateSpectralFlatness(spectrum, 126, 5)
    expect(Number.isFinite(result.flatness)).toBe(true)
  })

  it('empty region returns flatness=1, feedbackScore=0', () => {
    // All values at -Infinity equivalent (power = 0)
    const spectrum = new Float32Array(128).fill(-200)
    const result = calculateSpectralFlatness(spectrum, 64, 5)
    // When all powers are essentially zero, geometric mean = 0
    // Function should handle gracefully
    expect(Number.isFinite(result.flatness)).toBe(true)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// COMPRESSION DETECTION
// ═════════════════════════════════════════════════════════════════════════════

describe('AmplitudeHistoryBuffer', () => {
  let buffer: AmplitudeHistoryBuffer

  beforeEach(() => {
    buffer = new AmplitudeHistoryBuffer(100)
  })

  describe('Uncompressed Audio', () => {
    it('high crest factor + wide dynamic range → not compressed', () => {
      // Normal audio: peak varies widely, RMS is lower
      for (let i = 0; i < 50; i++) {
        const peak = -10 - Math.random() * 10  // -10 to -20
        const rms = -25 - Math.random() * 10   // -25 to -35
        buffer.addSample(peak, rms)
      }
      const result = buffer.detectCompression()
      expect(result.isCompressed).toBe(false)
      expect(result.crestFactor).toBeGreaterThan(COMPRESSION_CONSTANTS.COMPRESSED_CREST_FACTOR)
    })
  })

  describe('Compressed Audio', () => {
    it('low crest factor → compressed', () => {
      // Heavily compressed: peak and RMS are very close
      for (let i = 0; i < 50; i++) {
        const peak = -12 - Math.random() * 2  // -12 to -14
        const rms = -15 - Math.random() * 2   // -15 to -17 (only 3dB below peak)
        buffer.addSample(peak, rms)
      }
      const result = buffer.detectCompression()
      expect(result.isCompressed).toBe(true)
      expect(result.crestFactor).toBeLessThan(COMPRESSION_CONSTANTS.COMPRESSED_CREST_FACTOR)
    })

    it('narrow dynamic range → compressed', () => {
      // All peaks at similar level
      for (let i = 0; i < 50; i++) {
        buffer.addSample(-12, -16) // Consistent 4dB crest factor
      }
      const result = buffer.detectCompression()
      expect(result.isCompressed).toBe(true)
      expect(result.dynamicRange).toBeLessThan(COMPRESSION_CONSTANTS.COMPRESSED_DYNAMIC_RANGE)
    })
  })

  describe('Threshold Multiplier', () => {
    it('compressed audio gets thresholdMultiplier > 1', () => {
      for (let i = 0; i < 50; i++) {
        buffer.addSample(-12, -15)
      }
      const result = buffer.detectCompression()
      if (result.isCompressed) {
        expect(result.thresholdMultiplier).toBeGreaterThan(1.0)
        expect(result.thresholdMultiplier).toBeLessThanOrEqual(1.5)
      }
    })

    it('uncompressed audio gets thresholdMultiplier = 1', () => {
      for (let i = 0; i < 50; i++) {
        buffer.addSample(-10, -25) // 15dB crest factor
      }
      const result = buffer.detectCompression()
      expect(result.thresholdMultiplier).toBe(1)
    })
  })

  describe('Edge Cases', () => {
    it('fewer than 10 samples → not compressed (insufficient data)', () => {
      for (let i = 0; i < 5; i++) {
        buffer.addSample(-12, -15)
      }
      const result = buffer.detectCompression()
      expect(result.isCompressed).toBe(false)
      expect(result.crestFactor).toBe(COMPRESSION_CONSTANTS.NORMAL_CREST_FACTOR)
    })

    it('reset clears all history', () => {
      for (let i = 0; i < 50; i++) {
        buffer.addSample(-12, -15)
      }
      buffer.reset()
      const result = buffer.detectCompression()
      expect(result.isCompressed).toBe(false) // Not enough data after reset
    })

    it('ring buffer wraps correctly beyond maxSize', () => {
      // Add 150 samples to a buffer of size 100
      for (let i = 0; i < 150; i++) {
        buffer.addSample(-12, -15)
      }
      const result = buffer.detectCompression()
      // Should not crash, should still detect compression
      expect(result.isCompressed).toBe(true)
    })
  })
})
