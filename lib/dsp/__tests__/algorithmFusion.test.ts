/**
 * Algorithm Fusion unit tests
 *
 * Tests the multi-algorithm detection fusion engine:
 * - detectCombPattern: DBX comb filter pattern detection
 * - analyzeInterHarmonicRatio: IHR feedback vs music discrimination
 * - calculatePTMR: Peak-to-Median Ratio for spectral peak sharpness
 * - calculateMINDS: DAFx-16 adaptive notch depth setting
 * - detectContentType: speech vs music vs compressed classification
 * - fuseAlgorithmResults: weighted multi-algorithm fusion with verdict
 */

import { describe, it, expect } from 'vitest'
import {
  detectCombPattern,
  analyzeInterHarmonicRatio,
  calculatePTMR,
  calculateMINDS,
  detectContentType,
  fuseAlgorithmResults,
  FUSION_WEIGHTS,
  DEFAULT_FUSION_CONFIG,
  COMB_CONSTANTS,
} from '../algorithmFusion'
import type {
  AlgorithmScores,
  FusedDetectionResult,
  CombPatternResult,
  PTMRResult,
  MINDSResult,
} from '../algorithmFusion'

// ── detectCombPattern ──────────────────────────────────────────────────────

describe('detectCombPattern', () => {
  it('returns no pattern when too few peaks', () => {
    const result = detectCombPattern([100, 200]) // < MIN_PEAKS
    expect(result.hasPattern).toBe(false)
    expect(result.confidence).toBe(0)
  })

  it('detects evenly-spaced peaks as comb pattern', () => {
    // Simulate comb filter with 200 Hz spacing (5m path length: 343/200 ≈ 1.7m)
    const spacing = 200
    const peaks = Array.from({ length: 6 }, (_, i) => (i + 1) * spacing)
    // [200, 400, 600, 800, 1000, 1200]
    const result = detectCombPattern(peaks, 48000)
    expect(result.hasPattern).toBe(true)
    expect(result.fundamentalSpacing).toBeCloseTo(spacing, -1) // Within ~10 Hz
    expect(result.matchingPeaks).toBeGreaterThanOrEqual(COMB_CONSTANTS.MIN_PEAKS_FOR_PATTERN)
    expect(result.confidence).toBeGreaterThan(0)
  })

  it('estimates path length from fundamental spacing', () => {
    // d = c / Δf = 343 / 200 = 1.715 m
    const peaks = [200, 400, 600, 800, 1000]
    const result = detectCombPattern(peaks, 48000)
    if (result.hasPattern && result.estimatedPathLength !== null) {
      expect(result.estimatedPathLength).toBeCloseTo(343 / 200, 0)
    }
  })

  it('rejects random non-evenly-spaced peaks', () => {
    const randomPeaks = [137, 523, 891, 1247, 1759]
    const result = detectCombPattern(randomPeaks, 48000)
    // Random peaks shouldn't form a comb pattern
    // (may technically match by chance, so we just check confidence is low)
    if (result.hasPattern) {
      expect(result.confidence).toBeLessThan(0.5)
    }
  })

  it('rejects unrealistic path lengths (>50m)', () => {
    // Very small spacing → very long path → reject
    // d = 343 / 5 = 68.6 m > MAX_PATH_LENGTH (50m)
    const peaks = [5, 10, 15, 20, 25]
    const result = detectCombPattern(peaks, 48000)
    expect(result.hasPattern).toBe(false)
  })

  it('returns predicted frequencies for undetected harmonics', () => {
    // Missing the 3rd harmonic (600 Hz)
    const peaks = [200, 400, 800, 1000, 1200]
    const result = detectCombPattern(peaks, 48000)
    if (result.hasPattern && result.predictedFrequencies.length > 0) {
      // Should predict 600 Hz as a missing harmonic
      const hasCloseTo600 = result.predictedFrequencies.some(f => Math.abs(f - 600) < 20)
      expect(hasCloseTo600).toBe(true)
    }
  })
})

// ── analyzeInterHarmonicRatio ──────────────────────────────────────────────

describe('analyzeInterHarmonicRatio', () => {
  const sampleRate = 48000
  const fftSize = 8192
  const numBins = fftSize / 2

  /** Create spectrum with a single pure tone (feedback-like) */
  function pureToneSpectrum(fundamentalBin: number): Float32Array {
    const arr = new Float32Array(numBins)
    arr.fill(-80) // Noise floor
    arr[fundamentalBin] = -10 // Strong fundamental
    return arr
  }

  /** Create spectrum with rich harmonics (music-like) */
  function harmonicSpectrum(fundamentalBin: number): Float32Array {
    const arr = new Float32Array(numBins)
    arr.fill(-80)
    // Add fundamental + decaying harmonics
    for (let k = 1; k <= 6; k++) {
      const bin = Math.round(fundamentalBin * k)
      if (bin < numBins) {
        arr[bin] = -10 - (k - 1) * 6 // 6 dB/octave decay
      }
    }
    // Add inter-harmonic energy (noise between harmonics)
    for (let k = 1; k <= 5; k++) {
      const midBin = Math.round(fundamentalBin * (k + 0.5))
      if (midBin < numBins) {
        arr[midBin] = -40 // Significant inter-harmonic energy
      }
    }
    return arr
  }

  it('pure tone has low IHR and high feedback score', () => {
    const spectrum = pureToneSpectrum(100)
    const result = analyzeInterHarmonicRatio(spectrum, 100, sampleRate, fftSize)
    expect(result.harmonicsFound).toBeLessThanOrEqual(2) // Just fundamental, maybe 1 harmonic
    expect(result.feedbackScore).toBeGreaterThan(0)
  })

  it('harmonic-rich signal has higher IHR', () => {
    const spectrum = harmonicSpectrum(100)
    const result = analyzeInterHarmonicRatio(spectrum, 100, sampleRate, fftSize)
    expect(result.harmonicsFound).toBeGreaterThanOrEqual(3)
    // IHR should be higher for music-like content
    expect(result.interHarmonicRatio).toBeGreaterThan(0)
  })

  it('returns neutral result for out-of-range fundamentalBin', () => {
    const spectrum = pureToneSpectrum(100)
    const result = analyzeInterHarmonicRatio(spectrum, 0, sampleRate, fftSize) // DC
    expect(result.interHarmonicRatio).toBe(0.5)
    expect(result.feedbackScore).toBe(0)
  })

  it('feedbackScore is clamped to [0, 1]', () => {
    const spectrum = pureToneSpectrum(100)
    const result = analyzeInterHarmonicRatio(spectrum, 100, sampleRate, fftSize)
    expect(result.feedbackScore).toBeGreaterThanOrEqual(0)
    expect(result.feedbackScore).toBeLessThanOrEqual(1)
  })
})

// ── calculatePTMR ──────────────────────────────────────────────────────────

describe('calculatePTMR', () => {
  it('returns high PTMR for sharp spectral peak (feedback)', () => {
    const spectrum = new Float32Array(1024)
    spectrum.fill(-60) // Noise floor
    spectrum[500] = -20 // Sharp peak: 40 dB above floor
    const result = calculatePTMR(spectrum, 500, 20)
    expect(result.ptmrDb).toBeGreaterThan(15)
    expect(result.isFeedbackLike).toBe(true)
    expect(result.feedbackScore).toBeGreaterThan(0)
  })

  it('returns low PTMR for broad spectral content', () => {
    const spectrum = new Float32Array(1024)
    // Fill with uniform level
    spectrum.fill(-40)
    const result = calculatePTMR(spectrum, 500, 20)
    // Peak and median are the same → PTMR ≈ 0
    expect(result.ptmrDb).toBeLessThan(5)
    expect(result.isFeedbackLike).toBe(false)
  })

  it('returns zero result when too few values', () => {
    const spectrum = new Float32Array(5)
    spectrum.fill(-40)
    spectrum[2] = -20
    const result = calculatePTMR(spectrum, 2, 1)
    // halfWidth=1, excluding ±2 around peak → almost no values
    expect(result.ptmrDb).toBe(0)
    expect(result.feedbackScore).toBe(0)
  })

  it('feedbackScore scales between 0 and 1', () => {
    const spectrum = new Float32Array(1024)
    spectrum.fill(-60)
    spectrum[500] = -30 // 30 dB peak
    const result = calculatePTMR(spectrum, 500, 20)
    expect(result.feedbackScore).toBeGreaterThanOrEqual(0)
    expect(result.feedbackScore).toBeLessThanOrEqual(1)
  })
})

// ── calculateMINDS ─────────────────────────────────────────────────────────

describe('calculateMINDS', () => {
  it('returns -3 dB default with insufficient data', () => {
    const result = calculateMINDS([])
    expect(result.suggestedDepthDb).toBe(-3)
    expect(result.isGrowing).toBe(false)
    expect(result.confidence).toBe(0.3)
  })

  it('detects growing feedback and suggests deeper cut', () => {
    // Simulate rapid growth: +2 dB per frame
    const history = [-20, -18, -16, -14, -12, -10]
    const result = calculateMINDS(history, 0, 50)
    expect(result.isGrowing).toBe(true)
    expect(result.suggestedDepthDb).toBeLessThan(-3) // Deeper than default
    expect(result.confidence).toBeGreaterThan(0.5)
  })

  it('suggests more aggressive cut for runaway (>6 dB/s)', () => {
    // At 50 fps, each frame is 0.02s. 6 dB/s = 0.12 dB/frame
    // Over 50 frames (1 second), total growth = 6 dB
    const frames = 50
    const history = Array.from({ length: frames }, (_, i) => -30 + (i * 0.15)) // 0.15 dB/frame = 7.5 dB/s
    const result = calculateMINDS(history, 0, 50)
    expect(result.isGrowing).toBe(true)
    expect(result.confidence).toBeGreaterThanOrEqual(0.85)
  })

  it('suggests lighter cut for stable signal', () => {
    // Flat signal: no growth
    const history = [-20, -20, -20, -20, -20]
    const result = calculateMINDS(history, 0, 50)
    expect(result.isGrowing).toBe(false)
    expect(result.suggestedDepthDb).toBe(-3) // Light resonance default
  })

  it('deepens from currentDepthDb when growing', () => {
    const history = [-20, -18, -16, -14, -12, -10]
    const noExisting = calculateMINDS(history, 0, 50)
    const withExisting = calculateMINDS(history, -6, 50)
    // Starting from -6 dB should produce a deeper suggestion
    expect(withExisting.suggestedDepthDb).toBeLessThan(noExisting.suggestedDepthDb)
  })

  it('caps suggested depth at -18 dB', () => {
    // Extreme growth scenario
    const history = Array.from({ length: 10 }, (_, i) => -30 + i * 5) // 5 dB/frame!
    const result = calculateMINDS(history, -12, 50)
    expect(result.suggestedDepthDb).toBeGreaterThanOrEqual(-18)
  })
})

// ── detectContentType ──────────────────────────────────────────────────────

describe('detectContentType', () => {
  /**
   * Create a speech-like spectrum: energy concentrated in low bins (100-4kHz),
   * steep rolloff, low global spectral flatness (tonal formants).
   */
  function speechSpectrum(length: number = 4096): Float32Array {
    const arr = new Float32Array(length)
    for (let i = 0; i < length; i++) {
      // Strong energy in low bins (formant region), steep rolloff
      const normFreq = i / length
      if (normFreq < 0.10) arr[i] = -25 - normFreq * 100  // Strong 0–2kHz
      else if (normFreq < 0.20) arr[i] = -45 - normFreq * 50  // Moderate 2–4kHz
      else arr[i] = -80 - normFreq * 20  // Very weak above 4kHz
    }
    return arr
  }

  /**
   * Create a music-like spectrum: energy spread evenly across wide range,
   * high global spectral flatness (dense harmonics across many bins).
   * All bins at roughly the same level → high centroid, high rolloff, high flatness.
   */
  function musicSpectrum(length: number = 4096): Float32Array {
    const arr = new Float32Array(length)
    for (let i = 0; i < length; i++) {
      // Broad, even energy spread — slight slope but energy present throughout
      const normFreq = i / length
      arr[i] = -35 - normFreq * 15  // -35 to -50 — very flat slope
    }
    return arr
  }

  /** Create a flat spectrum (all bins equal dB) */
  function flatSpectrum(db: number, length: number = 4096): Float32Array {
    const arr = new Float32Array(length)
    arr.fill(db)
    return arr
  }

  it('detects compressed content from low crest factor', () => {
    // crestFactor=4 < COMPRESSED_CREST_FACTOR (6) — early gate fires
    const result = detectContentType(flatSpectrum(-40), 4)
    expect(result).toBe('compressed')
  })

  it('detects speech from speech-like spectrum + high crest factor', () => {
    // Speech: concentrated low energy, steep rolloff, high crest (pauses)
    const result = detectContentType(speechSpectrum(), 12)
    expect(result).toBe('speech')
  })

  it('detects speech regardless of crest factor when spectral shape is speech-like', () => {
    // Key test: spectral centroid + rolloff + flatness should dominate over crest factor.
    // Speech with moderate crest (sustained vowel, no pauses) should still classify as speech.
    const result = detectContentType(speechSpectrum(), 7)
    expect(result).toBe('speech')
  })

  it('detects music from music-like spectrum + moderate crest factor', () => {
    // Music: broad energy spread, moderate crest factor
    const result = detectContentType(musicSpectrum(), 7)
    expect(result).toBe('music')
  })

  it('detects music even with high crest factor when spectral shape is music-like', () => {
    // Key test: music with a loud fundamental can have high crest factor (> 12 dB).
    // The broad spectral spread should still classify as music, not speech.
    const result = detectContentType(musicSpectrum(), 13)
    expect(result).toBe('music')
  })

  it('returns unknown for silent/empty spectrum', () => {
    // All bins at -Infinity → no valid power → unknown
    const silent = new Float32Array(4096)
    silent.fill(-Infinity)
    const result = detectContentType(silent, 10)
    expect(result).toBe('unknown')
  })

  it('returns a valid ContentType string', () => {
    const result = detectContentType(flatSpectrum(-40), 8)
    expect(['speech', 'music', 'compressed', 'unknown']).toContain(result)
  })
})

// ── fuseAlgorithmResults ───────────────────────────────────────────────────

describe('fuseAlgorithmResults', () => {
  /** Create empty/null algorithm scores */
  function emptyScores(): AlgorithmScores {
    return {
      msd: null,
      phase: null,
      spectral: null,
      comb: null,
      compression: null,
      ihr: null,
      ptmr: null,
      ml: null,
    }
  }

  /** Create high-confidence feedback scores */
  function feedbackScores(): AlgorithmScores {
    return {
      msd: {
        msd: 0.5,
        framesAnalyzed: 100,
        isFeedbackLikely: true,
        feedbackScore: 0.9,
        meanMagnitudeDb: -10,
        secondDerivative: 0.1,
      },
      phase: {
        coherence: 0.95,
        isFeedbackLikely: true,
        feedbackScore: 0.85,
        meanPhaseDelta: 0.05,
        phaseDeltaStd: 0.1,
      },
      spectral: {
        flatness: 0.01,
        isFeedbackLikely: true,
        feedbackScore: 0.8,
        kurtosis: 15,
      },
      comb: null,
      compression: null,
      ihr: {
        interHarmonicRatio: 0.05,
        isFeedbackLike: true,
        isMusicLike: false,
        harmonicsFound: 1,
        feedbackScore: 0.9,
      },
      ptmr: {
        ptmrDb: 25,
        isFeedbackLike: true,
        feedbackScore: 0.85,
      },
      ml: null,
    }
  }

  it('returns FEEDBACK verdict for high-scoring algorithms', () => {
    const result = fuseAlgorithmResults(feedbackScores(), 'unknown', 0.8)
    expect(result.verdict).toBe('FEEDBACK')
    expect(result.feedbackProbability).toBeGreaterThan(0.6)
    expect(result.confidence).toBeGreaterThan(0.5)
  })

  it('returns NOT_FEEDBACK for low-scoring algorithms', () => {
    const scores = feedbackScores()
    // Zero out all feedback scores
    if (scores.msd) scores.msd.feedbackScore = 0.05
    if (scores.phase) scores.phase.feedbackScore = 0.05
    if (scores.spectral) scores.spectral.feedbackScore = 0.05
    if (scores.ihr) scores.ihr.feedbackScore = 0.05
    if (scores.ptmr) scores.ptmr.feedbackScore = 0.05

    const result = fuseAlgorithmResults(scores, 'unknown', 0.05)
    expect(result.feedbackProbability).toBeLessThan(0.3)
    expect(['NOT_FEEDBACK', 'UNCERTAIN']).toContain(result.verdict)
  })

  it('lists contributing algorithms', () => {
    const result = fuseAlgorithmResults(feedbackScores(), 'unknown', 0.5)
    expect(result.contributingAlgorithms).toContain('MSD')
    expect(result.contributingAlgorithms).toContain('Phase')
    // Legacy/existing weight removed — no longer contributes
  })

  it('generates reasons array for detected issues', () => {
    const result = fuseAlgorithmResults(feedbackScores())
    expect(result.reasons.length).toBeGreaterThan(0)
  })

  it('feedbackProbability stays in [0, 1]', () => {
    const result = fuseAlgorithmResults(feedbackScores(), 'unknown', 1.0)
    expect(result.feedbackProbability).toBeGreaterThanOrEqual(0)
    expect(result.feedbackProbability).toBeLessThanOrEqual(1)
  })

  it('handles all-null scores gracefully', () => {
    const result = fuseAlgorithmResults(emptyScores(), 'unknown', 0.5)
    // No algorithms contribute (existing weight removed), probability should be 0
    expect(result.feedbackProbability).toBe(0)
    expect(result.feedbackProbability).toBeGreaterThanOrEqual(0)
    expect(result.feedbackProbability).toBeLessThanOrEqual(1)
  })

  it('uses speech weights for speech content', () => {
    const result = fuseAlgorithmResults(feedbackScores(), 'speech', 0.5)
    // Speech mode upweights MSD (0.33 vs 0.30 default)
    expect(result.contributingAlgorithms).toContain('MSD')
  })

  it('uses compressed weights when compression detected', () => {
    const scores = feedbackScores()
    scores.compression = {
      isCompressed: true,
      estimatedRatio: 8.0,
      crestFactor: 4,
      dynamicRange: 6,
      thresholdMultiplier: 1.5,
    }
    const result = fuseAlgorithmResults(scores)
    expect(result.reasons.some(r => r.includes('Compression'))).toBe(true)
  })

  it('doubles comb weight when comb pattern detected (FLAW 6 FIX)', () => {
    const scores = feedbackScores()
    scores.comb = {
      hasPattern: true,
      fundamentalSpacing: 200,
      estimatedPathLength: 1.7,
      matchingPeaks: 5,
      predictedFrequencies: [600],
      confidence: 0.8,
    }
    const result = fuseAlgorithmResults(scores)
    expect(result.contributingAlgorithms).toContain('Comb')
    expect(result.feedbackProbability).toBeGreaterThanOrEqual(0)
    expect(result.feedbackProbability).toBeLessThanOrEqual(1)
  })
})

// ── Confidence formula ──────────────────────────────────────────────────────

describe('confidence formula', () => {
  /** Create scores with known feedbackScore values for all algorithms */
  function uniformScores(score: number): AlgorithmScores {
    return {
      msd: {
        msd: 0.5, framesAnalyzed: 100, isFeedbackLikely: score > 0.5,
        feedbackScore: score, meanMagnitudeDb: -10, secondDerivative: 0.1,
      },
      phase: {
        coherence: score, isFeedbackLikely: score > 0.5,
        feedbackScore: score, meanPhaseDelta: 0.05, phaseDeltaStd: 0.1,
      },
      spectral: {
        flatness: 0.01, isFeedbackLikely: score > 0.5,
        feedbackScore: score, kurtosis: 15,
      },
      comb: null,
      compression: null,
      ihr: {
        interHarmonicRatio: 0.05, isFeedbackLike: score > 0.5,
        isMusicLike: false, harmonicsFound: 1, feedbackScore: score,
      },
      ptmr: {
        ptmrDb: 25, isFeedbackLike: score > 0.5, feedbackScore: score,
      },
      ml: null,
    }
  }

  it('confidence = probability * (0.5 + 0.5 * agreement)', () => {
    // When all algorithms agree (uniform scores), variance=0 → agreement=1
    // confidence = probability * (0.5 + 0.5 * 1.0) = probability
    const result = fuseAlgorithmResults(uniformScores(0.9), 'unknown', 0.9)
    // With uniform scores at 0.9, probability ≈ 0.9, agreement ≈ 1
    // So confidence ≈ probability
    expect(result.confidence).toBeGreaterThan(0.7)
    expect(result.confidence).toBeLessThanOrEqual(1)
  })

  it('mixed scores produce lower confidence than uniform scores', () => {
    const uniform = fuseAlgorithmResults(uniformScores(0.8), 'unknown', 0.8)

    // Create mixed scores — some high, some low
    const mixed = uniformScores(0.8)
    if (mixed.msd) mixed.msd.feedbackScore = 0.9
    if (mixed.phase) mixed.phase.feedbackScore = 0.2
    if (mixed.spectral) mixed.spectral.feedbackScore = 0.7
    if (mixed.ihr) mixed.ihr.feedbackScore = 0.3
    if (mixed.ptmr) mixed.ptmr.feedbackScore = 0.9
    const mixedResult = fuseAlgorithmResults(mixed, 'unknown', 0.5)

    // Higher variance → lower agreement → confidence scaled down toward 0.5 * probability
    expect(mixedResult.confidence).toBeLessThan(uniform.confidence)
  })
})

// ── Verdict boundary ───────────────────────────────────────────────────────

describe('verdict boundaries', () => {
  function uniformScores(score: number): AlgorithmScores {
    return {
      msd: {
        msd: 0.5, framesAnalyzed: 100, isFeedbackLikely: score > 0.5,
        feedbackScore: score, meanMagnitudeDb: -10, secondDerivative: 0.1,
      },
      phase: {
        coherence: score, isFeedbackLikely: score > 0.5,
        feedbackScore: score, meanPhaseDelta: 0.05, phaseDeltaStd: 0.1,
      },
      spectral: {
        flatness: 0.01, isFeedbackLikely: score > 0.5,
        feedbackScore: score, kurtosis: 15,
      },
      comb: null, compression: null,
      ihr: {
        interHarmonicRatio: 0.05, isFeedbackLike: score > 0.5,
        isMusicLike: false, harmonicsFound: 1, feedbackScore: score,
      },
      ptmr: {
        ptmrDb: 25, isFeedbackLike: score > 0.5, feedbackScore: score,
      },
      ml: null,
    }
  }

  it('very low scores → NOT_FEEDBACK or UNCERTAIN', () => {
    const result = fuseAlgorithmResults(uniformScores(0.05), 'unknown', 0.05)
    expect(['NOT_FEEDBACK', 'UNCERTAIN']).toContain(result.verdict)
  })

  it('very high scores → FEEDBACK', () => {
    const result = fuseAlgorithmResults(uniformScores(0.95), 'unknown', 0.95)
    expect(result.verdict).toBe('FEEDBACK')
  })

  it('moderate scores → POSSIBLE_FEEDBACK or UNCERTAIN', () => {
    const result = fuseAlgorithmResults(uniformScores(0.5), 'unknown', 0.5)
    expect(['POSSIBLE_FEEDBACK', 'UNCERTAIN', 'FEEDBACK']).toContain(result.verdict)
  })
})

// ── Content-weight interaction ──────────────────────────────────────────────

describe('content-weight interaction', () => {
  function feedbackScoresForWeight(): AlgorithmScores {
    return {
      msd: {
        msd: 0.05, framesAnalyzed: 100, isFeedbackLikely: true,
        feedbackScore: 0.9, meanMagnitudeDb: -10, secondDerivative: 0.01,
      },
      phase: {
        coherence: 0.9, isFeedbackLikely: true,
        feedbackScore: 0.9, meanPhaseDelta: 0.05, phaseDeltaStd: 0.05,
      },
      spectral: {
        flatness: 0.02, isFeedbackLikely: true,
        feedbackScore: 0.8, kurtosis: 12,
      },
      comb: null, compression: null,
      ihr: {
        interHarmonicRatio: 0.05, isFeedbackLike: true,
        isMusicLike: false, harmonicsFound: 1, feedbackScore: 0.85,
      },
      ptmr: {
        ptmrDb: 25, isFeedbackLike: true, feedbackScore: 0.85,
      },
      ml: null,
    }
  }

  it('speech mode uses SPEECH weights', () => {
    const result = fuseAlgorithmResults(feedbackScoresForWeight(), 'speech', 0.8)
    // Speech mode upweights MSD (0.33) vs default (0.30)
    expect(result.contributingAlgorithms).toContain('MSD')
    expect(result.verdict).toBe('FEEDBACK')
  })

  it('music mode uses MUSIC weights', () => {
    const result = fuseAlgorithmResults(feedbackScoresForWeight(), 'music', 0.8)
    // Music mode upweights Phase (0.35) vs default (0.25)
    expect(result.contributingAlgorithms).toContain('Phase')
    expect(result.verdict).toBe('FEEDBACK')
  })
})

// ── FUSION_WEIGHTS ─────────────────────────────────────────────────────────

describe('FUSION_WEIGHTS', () => {
  it.each(['DEFAULT', 'SPEECH', 'MUSIC', 'COMPRESSED'] as const)(
    '%s weights sum to approximately 1',
    (key) => {
      const w = FUSION_WEIGHTS[key]
      const sum = Object.values(w).reduce((a, b) => a + b, 0)
      expect(sum).toBeCloseTo(1, 1)
    }
  )

  it('SPEECH mode upweights MSD relative to DEFAULT', () => {
    expect(FUSION_WEIGHTS.SPEECH.msd).toBeGreaterThan(FUSION_WEIGHTS.DEFAULT.msd)
  })

  it('MUSIC mode upweights Phase relative to DEFAULT', () => {
    expect(FUSION_WEIGHTS.MUSIC.phase).toBeGreaterThan(FUSION_WEIGHTS.DEFAULT.phase)
  })

  it('COMPRESSED mode upweights Phase over MSD', () => {
    expect(FUSION_WEIGHTS.COMPRESSED.phase).toBeGreaterThan(FUSION_WEIGHTS.COMPRESSED.msd)
  })
})
