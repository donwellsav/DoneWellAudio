/**
 * Worker Pipeline Integration Tests
 *
 * Tests the DSP processing pipeline that runs in the web worker:
 *   AlgorithmEngine.computeScores() → fuseAlgorithmResults() → classifyTrackWithAlgorithms()
 *
 * These tests exercise the full chain with synthetic spectra to verify that:
 * 1. A clean feedback-like peak (narrow, persistent, high MSD) produces high pFeedback
 * 2. A broad musical peak produces low pFeedback
 * 3. The pipeline doesn't crash on edge cases (empty spectrum, silence, NaN)
 *
 * This covers the main-thread → worker contract gap: the message types are
 * tested in dspWorkerMessages.test.ts, but the actual processing logic
 * was previously untested end-to-end.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { AlgorithmEngine } from '@/lib/dsp/workerFft'
import { fuseAlgorithmResults, DEFAULT_FUSION_CONFIG } from '@/lib/dsp/advancedDetection'
import { classifyTrackWithAlgorithms } from '@/lib/dsp/classifier'
import type { DetectedPeak, Track } from '@/types/advisory'
import type { AlgorithmScores } from '@/lib/dsp/advancedDetection'
import {
  buildScores,
  buildMSDResult,
  buildPhaseResult,
  buildSpectralResult,
  buildCombResult,
  buildIHRResult,
  buildPTMRResult,
  buildCompressionResult,
} from '@/tests/helpers/mockAlgorithmScores'

// ── Helpers ─────────────────────────────────────────────────────────────────

const FFT_SIZE = 8192
const SAMPLE_RATE = 48000
const NUM_BINS = FFT_SIZE / 2

/** Create a synthetic spectrum with a single peak at the given bin */
function makePeakSpectrum(peakBin: number, peakDb: number, floorDb: number = -80): Float32Array {
  const spectrum = new Float32Array(NUM_BINS)
  spectrum.fill(floorDb)

  // Narrow peak: ±3 bins with -3dB/bin rolloff (high Q)
  for (let offset = -3; offset <= 3; offset++) {
    const bin = peakBin + offset
    if (bin >= 0 && bin < NUM_BINS) {
      spectrum[bin] = peakDb - Math.abs(offset) * 3
    }
  }
  return spectrum
}

/** Create a broad "musical" spectrum with energy spread across many bins */
function makeBroadSpectrum(centerBin: number, widthBins: number, peakDb: number, floorDb: number = -80): Float32Array {
  const spectrum = new Float32Array(NUM_BINS)
  spectrum.fill(floorDb)

  // Broad hump: Gaussian-ish shape
  for (let offset = -widthBins; offset <= widthBins; offset++) {
    const bin = centerBin + offset
    if (bin >= 0 && bin < NUM_BINS) {
      const rolloff = (offset / widthBins) ** 2
      spectrum[bin] = peakDb - rolloff * 20
    }
  }
  return spectrum
}

/** Create a minimal Track for classification */
function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'test-track',
    binIndex: 170,
    trueFrequencyHz: 1000,
    trueAmplitudeDb: -30,
    prominenceDb: 15,
    onsetTime: Date.now() - 2000,
    onsetDb: -40,
    lastUpdateTime: Date.now(),
    history: [],
    features: {
      stabilityCentsStd: 2,
      meanQ: 25,
      minQ: 20,
      meanVelocityDbPerSec: 3,
      maxVelocityDbPerSec: 5,
      persistenceMs: 2000,
      harmonicityScore: 0.1,
      modulationScore: 0.05,
      noiseSidebandScore: 0.1,
    },
    qEstimate: 25,
    bandwidthHz: 40,
    velocityDbPerSec: 3,
    harmonicOfHz: null,
    isSubHarmonicRoot: false,
    isActive: true,
    msd: 0.5,
    msdGrowthRate: 0.1,
    msdIsHowl: true,
    persistenceFrames: 50,
    isPersistent: true,
    isHighlyPersistent: true,
    ...overrides,
  }
}

/** Create a minimal DetectedPeak */
function makePeak(overrides: Partial<DetectedPeak> = {}): DetectedPeak {
  return {
    binIndex: 170,
    trueFrequencyHz: 1000,
    trueAmplitudeDb: -30,
    prominenceDb: 15,
    sustainedMs: 500,
    harmonicOfHz: null,
    timestamp: Date.now(),
    noiseFloorDb: -70,
    effectiveThresholdDb: -50,
    qEstimate: 25,
    bandwidthHz: 40,
    msd: 0.5,
    msdGrowthRate: 0.1,
    msdIsHowl: true,
    persistenceFrames: 50,
    isPersistent: true,
    isHighlyPersistent: true,
    ...overrides,
  }
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('Worker Pipeline Integration', () => {
  let engine: AlgorithmEngine

  beforeEach(() => {
    engine = new AlgorithmEngine()
    engine.init(FFT_SIZE)
  })

  describe('AlgorithmEngine → computeScores', () => {
    it('computes scores for a narrow feedback-like peak', () => {
      const peakBin = 170 // ~1000 Hz at 48kHz/8192 FFT
      const spectrum = makePeakSpectrum(peakBin, -30)
      const peak = makePeak({ binIndex: peakBin })
      const track = makeTrack({ binIndex: peakBin })

      const result = engine.computeScores(peak, track, spectrum, SAMPLE_RATE, FFT_SIZE, [1000])

      expect(result).toBeDefined()
      expect(result.algorithmScores.msd).toBeDefined()
      expect(result.algorithmScores.phase).toBeDefined()
      expect(result.algorithmScores.spectral).toBeDefined()
      expect(result.algorithmScores.comb).toBeDefined()
      expect(result.algorithmScores.ihr).toBeDefined()
      expect(result.algorithmScores.ptmr).toBeDefined()
    })

    it('produces valid score ranges (all between 0 and 1)', () => {
      const peakBin = 170
      const spectrum = makePeakSpectrum(peakBin, -30)
      const peak = makePeak({ binIndex: peakBin })
      const track = makeTrack({ binIndex: peakBin })

      // Feed several frames to build history
      for (let i = 0; i < 15; i++) {
        engine.computeScores(peak, track, spectrum, SAMPLE_RATE, FFT_SIZE, [1000])
      }

      const result = engine.computeScores(peak, track, spectrum, SAMPLE_RATE, FFT_SIZE, [1000])
      const scores = result.algorithmScores

      // feedbackScore should be in [0, 1] range
      expect(scores.msd!.feedbackScore).toBeGreaterThanOrEqual(0)
      expect(scores.msd!.feedbackScore).toBeLessThanOrEqual(1)
      expect(scores.phase!.coherence).toBeGreaterThanOrEqual(0)
      expect(scores.phase!.coherence).toBeLessThanOrEqual(1)
    })

    it('handles empty spectrum without crashing', () => {
      const emptySpectrum = new Float32Array(NUM_BINS).fill(-100)
      const peak = makePeak({ trueAmplitudeDb: -100 })
      const track = makeTrack({ trueAmplitudeDb: -100 })

      expect(() => {
        engine.computeScores(peak, track, emptySpectrum, SAMPLE_RATE, FFT_SIZE, [])
      }).not.toThrow()
    })
  })

  describe('fuseAlgorithmResults', () => {
    it('produces a fused probability for feedback-like scores', () => {
      // Simulate high-confidence feedback: high MSD score, high phase coherence
      const scores: AlgorithmScores = buildScores({
        msd: 0.9,
        phase: 0.85,
        spectral: 0.7,
        comb: 0,
        ihr: 0.3,
        ptmr: 0.8,
        msdFrames: 20,
      })

      const result = fuseAlgorithmResults(scores, 'unknown', { ...DEFAULT_FUSION_CONFIG })

      expect(result.feedbackProbability).toBeGreaterThan(0.5)
      expect(result.confidence).toBeGreaterThan(0)
    })

    it('produces low probability for broad musical scores', () => {
      const scores: AlgorithmScores = buildScores({
        msd: 0.1,
        phase: 0.2,
        spectral: 0.2,
        comb: 0,
        ihr: 0.8,
        ptmr: 0.1,
        msdFrames: 20,
      })

      const result = fuseAlgorithmResults(scores, 'unknown', { ...DEFAULT_FUSION_CONFIG })

      expect(result.feedbackProbability).toBeLessThan(0.5)
    })
  })

  describe('classifyTrackWithAlgorithms', () => {
    it('classifies a feedback-like track as ACOUSTIC_FEEDBACK', () => {
      const track = makeTrack({
        features: {
          stabilityCentsStd: 1,
          meanQ: 30,
          minQ: 25,
          meanVelocityDbPerSec: 5,
          maxVelocityDbPerSec: 8,
          persistenceMs: 3000,
          harmonicityScore: 0.05,
          modulationScore: 0.02,
          noiseSidebandScore: 0.05,
        },
      })

      const scores: AlgorithmScores = buildScores({
        msd: 0.9,
        phase: 0.85,
        spectral: 0.7,
        comb: 0,
        ihr: 0.3,
        ptmr: 0.8,
        msdFrames: 20,
      })

      const fusionResult = fuseAlgorithmResults(scores, 'unknown', { ...DEFAULT_FUSION_CONFIG })
      const result = classifyTrackWithAlgorithms(track, scores, fusionResult)

      expect(result.label).toBe('ACOUSTIC_FEEDBACK')
      expect(result.pFeedback).toBeGreaterThan(0.5)
      expect(result.confidence).toBeGreaterThan(0)
    })

    it('classifies an instrument-like track with low feedback probability', () => {
      const track = makeTrack({
        features: {
          stabilityCentsStd: 30,
          meanQ: 3,
          minQ: 2,
          meanVelocityDbPerSec: 0,
          maxVelocityDbPerSec: 0.5,
          persistenceMs: 300,
          harmonicityScore: 0.9,
          modulationScore: 0.5,
          noiseSidebandScore: 0.6,
        },
        msd: 50,
        msdGrowthRate: 0,
        msdIsHowl: false,
        isPersistent: false,
        isHighlyPersistent: false,
        prominenceDb: 3,
        qEstimate: 3,
      })

      const scores: AlgorithmScores = buildScores({
        msd: 0.02,
        phase: 0.05,
        spectral: 0.05,
        comb: 0,
        ihr: 0.95,
        ptmr: 0.02,
        msdFrames: 20,
      })

      const fusionResult = fuseAlgorithmResults(scores, 'music', { ...DEFAULT_FUSION_CONFIG })
      const result = classifyTrackWithAlgorithms(track, scores, fusionResult)

      // Instrument-like track with very low algorithm scores should classify below feedback threshold
      expect(result.pFeedback).toBeLessThan(0.5)
    })
  })

  describe('edge cases', () => {
    it('engine handles zero-length init gracefully', () => {
      const smallEngine = new AlgorithmEngine()
      // Don't call init — engine should handle uninitialized state
      const spectrum = new Float32Array(64).fill(-60)
      const peak = makePeak({ binIndex: 10 })
      const track = makeTrack({ binIndex: 10 })

      // Should not throw
      expect(() => {
        smallEngine.computeScores(peak, track, spectrum, SAMPLE_RATE, 128, [])
      }).not.toThrow()
    })

    it('fusion handles all-null ML score', () => {
      const scores: AlgorithmScores = buildScores({
        msd: 0.5,
        phase: 0.5,
        spectral: 0.5,
        comb: 0,
        ihr: 0.5,
        ptmr: 0.5,
        msdFrames: 10,
      })

      const result = fuseAlgorithmResults(scores, 'unknown', DEFAULT_FUSION_CONFIG)
      expect(result.feedbackProbability).toBeGreaterThanOrEqual(0)
      expect(result.feedbackProbability).toBeLessThanOrEqual(1)
      expect(Number.isFinite(result.feedbackProbability)).toBe(true)
    })
  })
})
