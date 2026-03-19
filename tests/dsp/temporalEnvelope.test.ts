/**
 * Temporal envelope content type detection tests.
 * Verifies that energy variance and silence gap ratio improve
 * speech/music discrimination beyond spectral features alone.
 */
import { describe, it, expect } from 'vitest'
import { detectContentType, type TemporalMetrics } from '@/lib/dsp/advancedDetection'

/** Create a flat spectrum at a given dB level */
function flatSpectrum(db: number, length = 4096): Float32Array {
  const arr = new Float32Array(length)
  arr.fill(db)
  return arr
}

/** Create a speech-like spectrum: energy concentrated in 100-4kHz range */
function speechSpectrum(length = 4096): Float32Array {
  const arr = new Float32Array(length)
  arr.fill(-80) // noise floor
  // Formant region (bins ~10-200 for typical FFT/SR)
  for (let i = 10; i < 200; i++) arr[i] = -30
  // Strong F1 formant
  for (let i = 30; i < 50; i++) arr[i] = -20
  return arr
}

/** Create a music-like spectrum: energy spread across full range */
function musicSpectrum(length = 4096): Float32Array {
  const arr = new Float32Array(length)
  // Music fills the spectrum more evenly
  for (let i = 0; i < length; i++) {
    arr[i] = -40 + Math.sin(i * 0.01) * 10
  }
  return arr
}

describe('detectContentType with temporal metrics', () => {
  it('classifies speech with high variance and silence gaps', () => {
    const temporal: TemporalMetrics = {
      energyVariance: 25, // high — pauses between words
      silenceGapRatio: 0.25, // 25% of frames are silence
    }
    // Use speech spectrum (formant peaks) + speech temporal → should be speech
    const result = detectContentType(speechSpectrum(), 10, temporal)
    expect(result).toBe('speech')
  })

  it('classifies music with low variance and continuous energy', () => {
    const temporal: TemporalMetrics = {
      energyVariance: 4, // low — continuous signal
      silenceGapRatio: 0.01, // almost no silence
    }
    const result = detectContentType(flatSpectrum(-40), 7, temporal)
    expect(result).toBe('music')
  })

  it('temporal metrics reinforce spectral classification', () => {
    // Speech spectrum + speech temporal → confidently speech
    const speechTemporal: TemporalMetrics = { energyVariance: 22, silenceGapRatio: 0.22 }
    expect(detectContentType(speechSpectrum(), 10, speechTemporal)).toBe('speech')

    // Music spectrum + music temporal → confidently music
    const musicTemporal: TemporalMetrics = { energyVariance: 3, silenceGapRatio: 0.02 }
    expect(detectContentType(musicSpectrum(), 7, musicTemporal)).toBe('music')

    // Mismatched: speech spectrum + music temporal → spectral + temporal compete
    // Result depends on weights, but the important thing is it doesn't crash
    const mixed = detectContentType(speechSpectrum(), 10, musicTemporal)
    expect(['speech', 'music', 'unknown']).toContain(mixed)
  })

  it('still returns compressed for low crest factor regardless of temporal', () => {
    const temporal: TemporalMetrics = { energyVariance: 25, silenceGapRatio: 0.3 }
    const result = detectContentType(flatSpectrum(-40), 4, temporal)
    expect(result).toBe('compressed')
  })

  it('existing behavior preserved when no temporal metrics provided', () => {
    // Speech spectrum with high crest factor → should still be speech
    const result = detectContentType(speechSpectrum(), 12)
    expect(result).toBe('speech')

    // Music spectrum with moderate crest → should still be music
    const result2 = detectContentType(musicSpectrum(), 7)
    expect(result2).toBe('music')
  })

  it('moderate temporal values contribute proportionally', () => {
    // Medium speech indicators
    const moderateSpeech: TemporalMetrics = { energyVariance: 15, silenceGapRatio: 0.12 }
    const result = detectContentType(speechSpectrum(), 10, moderateSpeech)
    expect(result).toBe('speech')

    // Medium music indicators
    const moderateMusic: TemporalMetrics = { energyVariance: 8, silenceGapRatio: 0.06 }
    const result2 = detectContentType(musicSpectrum(), 7, moderateMusic)
    expect(result2).toBe('music')
  })
})
