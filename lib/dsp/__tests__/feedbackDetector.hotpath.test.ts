/**
 * FeedbackDetector hot-path test harness (S8)
 *
 * Tests the analyze() pipeline and its internal methods that run at 50fps.
 * Uses (detector as any) to access private methods — matches existing repo patterns.
 *
 * Part A: Method-level unit tests for _buildPowerSpectrum, _scanAndProcessPeaks,
 *         updatePersistence, calculatePHPR, estimateQ
 * Part B: End-to-end analyze() harness with mocked AnalyserNode
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from 'vitest'
import { FeedbackDetector } from '../feedbackDetector'
import { DEFAULT_CONFIG } from '@/types/advisory'
import { EXP_LUT, PERSISTENCE_SCORING, PHPR_SETTINGS } from '../constants'

// ── Helpers ────────────────────────────────────────────────────────────

const FFT_SIZE = 8192
const NUM_BINS = FFT_SIZE / 2 // 4096 frequencyBinCount
const SAMPLE_RATE = 48000
const HZ_PER_BIN = SAMPLE_RATE / FFT_SIZE // ~5.859 Hz

/**
 * Create a mock AnalyserNode that feeds controlled spectrum data.
 * `spectrumFiller` populates the Float32Array with dB values.
 */
function createMockAnalyser(spectrumFiller: (arr: Float32Array) => void) {
  return {
    frequencyBinCount: NUM_BINS,
    fftSize: FFT_SIZE,
    smoothingTimeConstant: 0.5,
    minDecibels: -100,
    maxDecibels: 0,
    getFloatFrequencyData: (array: Float32Array) => {
      spectrumFiller(array)
    },
    getFloatTimeDomainData: (array: Float32Array) => {
      array.fill(0)
    },
  }
}

/** Minimal AudioContext mock — only sampleRate is needed for math. */
function createMockAudioContext() {
  return {
    sampleRate: SAMPLE_RATE,
    state: 'running' as const,
    resume: () => Promise.resolve(),
  }
}

/**
 * Set up a FeedbackDetector with mocked audio nodes and allocated buffers,
 * ready for calling analyze() directly.
 */
function createReadyDetector(
  spectrumFiller: (arr: Float32Array) => void,
  configOverrides: Record<string, unknown> = {},
) {
  const detector = new FeedbackDetector({
    ...DEFAULT_CONFIG,
    aWeightingEnabled: false, // Disable A-weighting for predictable dB values
    noiseFloorEnabled: false, // Disable noise floor so threshold is absolute
    micCalibrationProfile: 'none' as const,
    inputGainDb: 0,
    autoGainEnabled: false,
    ...configOverrides,
  })

  // Wire up mocks — bypass private access via any cast
  ;(detector as any).audioContext = createMockAudioContext()
  ;(detector as any).analyser = createMockAnalyser(spectrumFiller)

  // Allocate buffers (normally done by setFftSize when analyser is present)
  detector.setFftSize(FFT_SIZE)

  return detector
}

/**
 * Bin index for a given frequency in Hz.
 */
function hzToBin(hz: number): number {
  return Math.round(hz / HZ_PER_BIN)
}

// ═══════════════════════════════════════════════════════════════════════
// Part A: Method-level unit tests
// ═══════════════════════════════════════════════════════════════════════

describe('FeedbackDetector hot path — Part A: Method-level', () => {
  // ── _buildPowerSpectrum ────────────────────────────────────────────

  describe('_buildPowerSpectrum', () => {
    it('converts constant dB spectrum to correct power values', () => {
      const testDb = -30
      const detector = createReadyDetector((arr) => arr.fill(testDb))
      const d = detector as any

      // Fill freqDb with test values (simulating getFloatFrequencyData)
      const freqDb = d.freqDb as Float32Array
      freqDb.fill(testDb)

      ;(detector as any)._buildPowerSpectrum()

      const power = d.power as Float32Array
      const prefix = d.prefix as Float64Array

      // Power should match EXP_LUT for -30 dB
      const lutIdx = ((-30 + 100) * 10 + 0.5) | 0 // = 700
      const expectedPower = EXP_LUT[lutIdx]
      expect(power[100]).toBeCloseTo(expectedPower, 8)

      // Prefix sum should be monotonically non-decreasing
      for (let i = 1; i <= NUM_BINS; i++) {
        expect(prefix[i]).toBeGreaterThanOrEqual(prefix[i - 1])
      }

      // prefix[N] should equal N * expectedPower (constant spectrum)
      expect(prefix[NUM_BINS]).toBeCloseTo(NUM_BINS * expectedPower, 4)
    })

    it('bins far below threshold get zero power (skip optimization)', () => {
      // With threshold at -80 dB (default), skip threshold is -92 dB.
      // Bins at -100 dB should be skipped → power = 0.
      const detector = createReadyDetector((arr) => arr.fill(-100))
      const d = detector as any

      const freqDb = d.freqDb as Float32Array
      freqDb.fill(-100)

      ;(detector as any)._buildPowerSpectrum()

      const power = d.power as Float32Array
      expect(power[100]).toBe(0)
      expect(power[500]).toBe(0)
    })

    it('handles non-finite values by clamping to -100', () => {
      const detector = createReadyDetector((arr) => arr.fill(-50))
      const d = detector as any

      const freqDb = d.freqDb as Float32Array
      freqDb.fill(-50)
      freqDb[200] = -Infinity
      freqDb[300] = NaN

      ;(detector as any)._buildPowerSpectrum()

      // After buildPowerSpectrum, non-finite values are replaced with -100
      expect(freqDb[200]).toBe(-100)
      expect(freqDb[300]).toBe(-100)
    })

    it('applies input gain offset to all bins', () => {
      const baseDb = -40
      const gain = 10
      const detector = createReadyDetector((arr) => arr.fill(baseDb), {
        inputGainDb: gain,
      })
      const d = detector as any

      const freqDb = d.freqDb as Float32Array
      freqDb.fill(baseDb)

      ;(detector as any)._buildPowerSpectrum()

      // After build, freqDb[i] should be baseDb + gain = -30
      expect(freqDb[100]).toBeCloseTo(baseDb + gain, 1)
    })
  })

  // ── estimateQ ──────────────────────────────────────────────────────

  describe('estimateQ', () => {
    it('returns Q = centerFreq / bandwidth for controlled -3dB shape', () => {
      const peakBin = 500 // ~2930 Hz
      const peakDb = -20

      const detector = createReadyDetector((arr) => arr.fill(-100))
      const d = detector as any
      const freqDb = d.freqDb as Float32Array
      freqDb.fill(-100)

      // Create a triangular peak: -20 dB at center, drops 1 dB per bin
      // -3dB crossing at ±3 bins from center
      for (let offset = -10; offset <= 10; offset++) {
        const db = peakDb - Math.abs(offset)
        freqDb[peakBin + offset] = db
      }

      const result = (detector as any).estimateQ(peakBin, peakDb, peakBin * HZ_PER_BIN)
      const { qEstimate, bandwidthHz } = result

      // With 1 dB/bin drop, -3dB crossing is at ±3 bins.
      // Bandwidth = 6 bins * HZ_PER_BIN ≈ 35.16 Hz
      // Q = centerFreq / bandwidth ≈ 2929.7 / 35.16 ≈ 83.3
      // Allow tolerance for interpolation
      expect(bandwidthHz).toBeGreaterThan(20)
      expect(bandwidthHz).toBeLessThan(60)
      expect(qEstimate).toBeGreaterThan(40)
      expect(qEstimate).toBeLessThan(200)
    })

    it('returns high Q for a very narrow peak (single bin)', () => {
      const peakBin = 300
      const peakDb = -10

      const detector = createReadyDetector((arr) => arr.fill(-100))
      const d = detector as any
      const freqDb = d.freqDb as Float32Array
      freqDb.fill(-100)

      // Single bin peak — neighbors are -100 dB (way below -3dB)
      freqDb[peakBin] = peakDb

      const result = (detector as any).estimateQ(peakBin, peakDb, peakBin * HZ_PER_BIN)
      // Very narrow → high Q (capped at 500 by clamp)
      expect(result.qEstimate).toBeGreaterThanOrEqual(100)
    })

    it('returns default when freqDb is null', () => {
      const detector = new FeedbackDetector()
      // freqDb is null because no analyser was set
      const result = (detector as any).estimateQ(100, -20, 1000)
      expect(result.qEstimate).toBe(10)
      expect(result.bandwidthHz).toBe(100)
    })
  })

  // ── calculatePHPR ─────────────────────────────────────────────────

  describe('calculatePHPR', () => {
    it('returns high PHPR for pure tone (no harmonics)', () => {
      const peakBin = 200 // ~1172 Hz

      const detector = createReadyDetector((arr) => arr.fill(-80))
      const d = detector as any
      const freqDb = d.freqDb as Float32Array
      freqDb.fill(-80)

      // Fundamental at -10 dB, harmonics stay at noise floor -80 dB
      freqDb[peakBin] = -10

      const phpr = (detector as any).calculatePHPR(peakBin)

      // Pure tone: PHPR ≈ peakDb - meanHarmonicDb(linear)
      // Harmonics at -80 dB: linear power ≈ 1e-8, mean = 1e-8
      // meanHarmonicDb = 10*log10(1e-8) = -80
      // PHPR = -10 - (-80) = 70 dB (approximately)
      expect(phpr).toBeGreaterThan(PHPR_SETTINGS.FEEDBACK_THRESHOLD_DB)
      expect(phpr).toBeGreaterThan(50)
    })

    it('returns low PHPR for harmonic-rich signal (music)', () => {
      const peakBin = 100 // ~586 Hz fundamental

      const detector = createReadyDetector((arr) => arr.fill(-80))
      const d = detector as any
      const freqDb = d.freqDb as Float32Array
      freqDb.fill(-80)

      // Fundamental at -10 dB
      freqDb[peakBin] = -10
      // Strong harmonics (typical of music): 2nd at -14, 3rd at -18, 4th at -22
      freqDb[peakBin * 2] = -14
      freqDb[peakBin * 3] = -18
      freqDb[peakBin * 4] = -22

      const phpr = (detector as any).calculatePHPR(peakBin)

      // With strong harmonics, PHPR should be low (< 15 dB)
      expect(phpr).toBeDefined()
      expect(phpr!).toBeLessThan(PHPR_SETTINGS.FEEDBACK_THRESHOLD_DB)
      expect(phpr!).toBeGreaterThan(0)
    })

    it('returns undefined when all harmonics are out of FFT range', () => {
      // Peak near Nyquist — 2nd harmonic exceeds bin count
      const peakBin = NUM_BINS - 10

      const detector = createReadyDetector((arr) => arr.fill(-80))
      const d = detector as any
      const freqDb = d.freqDb as Float32Array
      freqDb.fill(-80)
      freqDb[peakBin] = -10

      const phpr = (detector as any).calculatePHPR(peakBin)
      expect(phpr).toBeUndefined()
    })

    it('uses linear-domain averaging (not dB arithmetic mean)', () => {
      const peakBin = 100

      const detector = createReadyDetector((arr) => arr.fill(-80))
      const d = detector as any
      const freqDb = d.freqDb as Float32Array
      freqDb.fill(-80)

      freqDb[peakBin] = -10

      // One loud harmonic, two quiet — linear average is dominated by the loud one
      freqDb[peakBin * 2] = -15 // Loud harmonic
      freqDb[peakBin * 3] = -70 // Quiet
      freqDb[peakBin * 4] = -70 // Quiet

      const phpr = (detector as any).calculatePHPR(peakBin)

      // Linear mean: dominated by -15 dB harmonic (linear ≈ 3.16e-2)
      // Arithmetic dB mean would be (-15 + -70 + -70)/3 = -51.67 dB — very different
      // Linear mean ≈ 10*log10((3.16e-2 + 1e-7 + 1e-7)/3) ≈ -19.8 dB
      // PHPR ≈ -10 - (-19.8) ≈ 9.8 dB
      expect(phpr).toBeDefined()
      expect(phpr!).toBeLessThan(15)
      expect(phpr!).toBeGreaterThan(5)
    })
  })

  // ── updatePersistence ──────────────────────────────────────────────

  describe('updatePersistence', () => {
    it('increments persistence when amplitude is within tolerance', () => {
      const detector = createReadyDetector((arr) => arr.fill(-80))
      const bin = 300

      // First call — initializes
      ;(detector as any).updatePersistence(bin, -20)
      const count1 = (detector as any).persistenceCount[bin]
      expect(count1).toBe(1) // First call sets to 1

      // Second call — same amplitude → increment
      ;(detector as any).updatePersistence(bin, -20)
      const count2 = (detector as any).persistenceCount[bin]
      expect(count2).toBe(2)

      // Third call — within tolerance (6 dB) → still increments
      ;(detector as any).updatePersistence(bin, -20 + PERSISTENCE_SCORING.AMPLITUDE_TOLERANCE_DB)
      const count3 = (detector as any).persistenceCount[bin]
      expect(count3).toBe(3)
    })

    it('resets persistence when amplitude change exceeds tolerance', () => {
      const detector = createReadyDetector((arr) => arr.fill(-80))
      const bin = 300

      // Build up persistence
      for (let i = 0; i < 10; i++) {
        ;(detector as any).updatePersistence(bin, -20)
      }
      expect((detector as any).persistenceCount[bin]).toBe(10)

      // Sudden amplitude jump beyond tolerance → reset to 1
      ;(detector as any).updatePersistence(bin, -20 + PERSISTENCE_SCORING.AMPLITUDE_TOLERANCE_DB + 1)
      expect((detector as any).persistenceCount[bin]).toBe(1)
    })

    it('caps persistence at history window', () => {
      const detector = createReadyDetector((arr) => arr.fill(-80))
      const bin = 300
      const historyFrames = (detector as any)._persistHistoryFrames as number

      // Call many more times than the cap
      for (let i = 0; i < historyFrames + 20; i++) {
        ;(detector as any).updatePersistence(bin, -20)
      }

      expect((detector as any).persistenceCount[bin]).toBe(historyFrames)
    })

    it('does nothing when persistenceCount is null', () => {
      const detector = new FeedbackDetector()
      // persistenceCount is null (no buffers allocated)
      expect(() => {
        ;(detector as any).updatePersistence(100, -20)
      }).not.toThrow()
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════
// Part B: End-to-end analyze() harness
// ═══════════════════════════════════════════════════════════════════════

describe('FeedbackDetector hot path — Part B: analyze() harness', () => {
  // ── Silence gate ──────────────────────────────────────────────────

  describe('silence gate', () => {
    it('does not register peaks when all bins are below silence threshold', () => {
      const detectedPeaks: unknown[] = []
      const detector = createReadyDetector(
        (arr) => arr.fill(-100), // All silence
        { thresholdDb: -80 },
      )

      // Wire up callback to capture peaks
      ;(detector as any).callbacks = {
        onPeakDetected: (peak: unknown) => detectedPeaks.push(peak),
      }

      // Set silence threshold (default is -65 dBFS)
      ;(detector as any)._silenceThresholdDb = -65

      // Run analyze — signal is far below silence threshold
      ;(detector as any).analyze(1000, 20)

      expect(detectedPeaks.length).toBe(0)
      expect(detector.getState().isSignalPresent).toBe(false)
    })
  })

  // ── Single prominent peak ────────────────────────────────────────

  describe('single prominent peak detection', () => {
    it('detects a peak at correct frequency after sustain period', () => {
      const targetBin = hzToBin(1000) // ~171
      const peakDb = -20
      const neighborDb = -60

      const detectedPeaks: Array<{ trueFrequencyHz: number; binIndex: number; prominenceDb: number }> = []

      const detector = createReadyDetector(
        (arr) => {
          arr.fill(neighborDb)
          // Create a prominent local maximum
          arr[targetBin] = peakDb
          // Ensure local-max: neighbors slightly below
          arr[targetBin - 1] = neighborDb
          arr[targetBin + 1] = neighborDb
        },
        {
          thresholdDb: -50, // Peak at -20 clearly exceeds this
          prominenceDb: 5,
          sustainMs: 100, // 100ms sustain = 5 frames at 20ms
        },
      )

      ;(detector as any).callbacks = {
        onPeakDetected: (peak: { trueFrequencyHz: number; binIndex: number; prominenceDb: number }) =>
          detectedPeaks.push(peak),
      }

      // Run enough frames to exceed sustainMs (100ms = 5 frames at 20ms dt)
      for (let frame = 0; frame < 8; frame++) {
        ;(detector as any).analyze(frame * 20, 20)
      }

      // Peak should have been registered
      expect(detectedPeaks.length).toBeGreaterThanOrEqual(1)

      const peak = detectedPeaks[0]
      // Frequency should be near 1000 Hz (with quadratic interpolation)
      expect(peak.trueFrequencyHz).toBeGreaterThan(900)
      expect(peak.trueFrequencyHz).toBeLessThan(1100)
      expect(peak.binIndex).toBe(targetBin)
      expect(peak.prominenceDb).toBeGreaterThan(5)
    })

    it('does not detect a peak that lacks prominence', () => {
      const targetBin = 300
      const peakDb = -30
      const neighborDb = -32 // Only 2 dB prominence — below 8 dB default

      const detectedPeaks: unknown[] = []

      const detector = createReadyDetector(
        (arr) => {
          arr.fill(neighborDb)
          arr[targetBin] = peakDb
        },
        {
          thresholdDb: -50,
          prominenceDb: 8,
          sustainMs: 100,
        },
      )

      ;(detector as any).callbacks = {
        onPeakDetected: (peak: unknown) => detectedPeaks.push(peak),
      }

      for (let frame = 0; frame < 10; frame++) {
        ;(detector as any).analyze(frame * 20, 20)
      }

      expect(detectedPeaks.length).toBe(0)
    })
  })

  // ── Sustain timing ────────────────────────────────────────────────

  describe('sustain timing', () => {
    it('does not register peak before sustainMs is reached', () => {
      const targetBin = 400
      const detectedPeaks: unknown[] = []

      const detector = createReadyDetector(
        (arr) => {
          arr.fill(-70)
          arr[targetBin] = -15
        },
        {
          thresholdDb: -50,
          prominenceDb: 5,
          sustainMs: 300, // 300ms = 15 frames at 20ms
        },
      )

      ;(detector as any).callbacks = {
        onPeakDetected: (peak: unknown) => detectedPeaks.push(peak),
      }

      // Run 10 frames = 200ms < 300ms sustain
      for (let frame = 0; frame < 10; frame++) {
        ;(detector as any).analyze(frame * 20, 20)
      }

      expect(detectedPeaks.length).toBe(0)
    })

    it('registers peak after sustainMs is exceeded', () => {
      const targetBin = 400
      const detectedPeaks: unknown[] = []

      const detector = createReadyDetector(
        (arr) => {
          arr.fill(-70)
          arr[targetBin] = -15
        },
        {
          thresholdDb: -50,
          prominenceDb: 5,
          sustainMs: 300,
        },
      )

      ;(detector as any).callbacks = {
        onPeakDetected: (peak: unknown) => detectedPeaks.push(peak),
      }

      // Run 20 frames = 400ms > 300ms sustain
      for (let frame = 0; frame < 20; frame++) {
        ;(detector as any).analyze(frame * 20, 20)
      }

      expect(detectedPeaks.length).toBeGreaterThanOrEqual(1)
    })
  })

  // ── Persistence tracking through analyze() ────────────────────────

  describe('persistence tracking via analyze()', () => {
    it('increments persistence count for stable peak across frames', () => {
      const targetBin = 350

      const detector = createReadyDetector(
        (arr) => {
          arr.fill(-70)
          arr[targetBin] = -15 // Consistent amplitude each frame
        },
        {
          thresholdDb: -50,
          prominenceDb: 5,
          sustainMs: 9999, // Very long sustain so peak is not registered (keeps accumulating)
        },
      )

      // Run 10 frames — persistence should increment each frame
      // (bin is within threshold - 6 dB, so updatePersistence fires)
      for (let frame = 0; frame < 10; frame++) {
        ;(detector as any).analyze(frame * 20, 20)
      }

      const persistenceCount = (detector as any).persistenceCount as Uint16Array
      expect(persistenceCount[targetBin]).toBeGreaterThanOrEqual(8) // ~10 frames of tracking
    })

    it('resets persistence when peak amplitude fluctuates wildly', () => {
      const targetBin = 350
      let amplitude = -15

      const detector = createReadyDetector(
        (arr) => {
          arr.fill(-70)
          arr[targetBin] = amplitude
        },
        {
          thresholdDb: -50,
          prominenceDb: 5,
          sustainMs: 9999,
        },
      )

      // 5 stable frames
      for (let frame = 0; frame < 5; frame++) {
        ;(detector as any).analyze(frame * 20, 20)
      }

      const countBefore = (detector as any).persistenceCount[targetBin] as number
      expect(countBefore).toBeGreaterThanOrEqual(3)

      // Sudden 20 dB amplitude change — exceeds AMPLITUDE_TOLERANCE_DB (6 dB)
      amplitude = -35
      ;(detector as any).analyze(5 * 20, 20)

      const countAfter = (detector as any).persistenceCount[targetBin] as number
      // Persistence should have reset (back to 1)
      expect(countAfter).toBeLessThan(countBefore)
    })
  })

  // ── PHPR on controlled harmonics through full pipeline ─────────────

  describe('PHPR via analyze()', () => {
    it('attaches PHPR to registered peak for pure tone', () => {
      const targetBin = 200 // ~1172 Hz
      const detectedPeaks: Array<{ phpr?: number }> = []

      const detector = createReadyDetector(
        (arr) => {
          arr.fill(-80) // Noise floor
          arr[targetBin] = -10 // Prominent fundamental, no harmonics
        },
        {
          thresholdDb: -50,
          prominenceDb: 5,
          sustainMs: 60, // Quick registration
        },
      )

      ;(detector as any).callbacks = {
        onPeakDetected: (peak: { phpr?: number }) => detectedPeaks.push(peak),
      }

      // Run enough frames for registration
      for (let frame = 0; frame < 10; frame++) {
        ;(detector as any).analyze(frame * 20, 20)
      }

      expect(detectedPeaks.length).toBeGreaterThanOrEqual(1)
      const peak = detectedPeaks[0]
      // Pure tone → high PHPR
      expect(peak.phpr).toBeDefined()
      expect(peak.phpr!).toBeGreaterThan(20)
    })

    it('attaches low PHPR to registered peak for harmonic signal', () => {
      const targetBin = 100 // ~586 Hz
      const detectedPeaks: Array<{ phpr?: number }> = []

      const detector = createReadyDetector(
        (arr) => {
          arr.fill(-80)
          arr[targetBin] = -10
          arr[targetBin * 2] = -14 // 2nd harmonic
          arr[targetBin * 3] = -18 // 3rd harmonic
          arr[targetBin * 4] = -22 // 4th harmonic
        },
        {
          thresholdDb: -50,
          prominenceDb: 5,
          sustainMs: 60,
        },
      )

      ;(detector as any).callbacks = {
        onPeakDetected: (peak: { phpr?: number }) => detectedPeaks.push(peak),
      }

      for (let frame = 0; frame < 10; frame++) {
        ;(detector as any).analyze(frame * 20, 20)
      }

      expect(detectedPeaks.length).toBeGreaterThanOrEqual(1)
      const peak = detectedPeaks[0]
      expect(peak.phpr).toBeDefined()
      // Harmonic signal → low PHPR
      expect(peak.phpr!).toBeLessThan(PHPR_SETTINGS.FEEDBACK_THRESHOLD_DB)
    })
  })

  // ── Q estimation through full pipeline ────────────────────────────

  describe('Q estimation via analyze()', () => {
    it('attaches Q estimate to registered peak', () => {
      const targetBin = 500 // ~2930 Hz
      const detectedPeaks: Array<{ qEstimate?: number; bandwidthHz?: number }> = []

      const detector = createReadyDetector(
        (arr) => {
          arr.fill(-80)
          // Create a sharp peak with controlled bandwidth
          // 1 dB/bin triangular drop: -3dB crossing at ±3 bins
          for (let offset = -8; offset <= 8; offset++) {
            arr[targetBin + offset] = -10 - Math.abs(offset) * 1.5
          }
          arr[targetBin] = -10
        },
        {
          thresholdDb: -50,
          prominenceDb: 5,
          sustainMs: 60,
        },
      )

      ;(detector as any).callbacks = {
        onPeakDetected: (peak: { qEstimate?: number; bandwidthHz?: number }) =>
          detectedPeaks.push(peak),
      }

      for (let frame = 0; frame < 10; frame++) {
        ;(detector as any).analyze(frame * 20, 20)
      }

      expect(detectedPeaks.length).toBeGreaterThanOrEqual(1)
      const peak = detectedPeaks[0]
      expect(peak.qEstimate).toBeDefined()
      expect(peak.qEstimate!).toBeGreaterThan(10) // Reasonably narrow peak
      expect(peak.bandwidthHz).toBeDefined()
      expect(peak.bandwidthHz!).toBeGreaterThan(0)
    })
  })

  // ── Multiple peaks ────────────────────────────────────────────────

  describe('multiple simultaneous peaks', () => {
    it('detects two well-separated peaks independently', () => {
      const bin1 = 200 // ~1172 Hz
      const bin2 = 600 // ~3516 Hz
      const detectedPeaks: Array<{ binIndex: number }> = []

      const detector = createReadyDetector(
        (arr) => {
          arr.fill(-70)
          arr[bin1] = -10
          arr[bin2] = -15
        },
        {
          thresholdDb: -50,
          prominenceDb: 5,
          sustainMs: 60,
        },
      )

      ;(detector as any).callbacks = {
        onPeakDetected: (peak: { binIndex: number }) => detectedPeaks.push(peak),
      }

      for (let frame = 0; frame < 10; frame++) {
        ;(detector as any).analyze(frame * 20, 20)
      }

      const bins = detectedPeaks.map((p) => p.binIndex)
      expect(bins).toContain(bin1)
      expect(bins).toContain(bin2)
    })
  })

  // ── Peak clearing after signal disappears ─────────────────────────

  describe('peak clearing', () => {
    it('clears an active peak after clearMs when signal disappears', () => {
      const targetBin = 300
      let hasSignal = true
      const clearedPeaks: Array<{ binIndex: number }> = []

      const detector = createReadyDetector(
        (arr) => {
          arr.fill(-70)
          if (hasSignal) {
            arr[targetBin] = -10
          }
        },
        {
          thresholdDb: -50,
          prominenceDb: 5,
          sustainMs: 60,
          clearMs: 200, // 200ms = 10 frames
        },
      )

      ;(detector as any).callbacks = {
        onPeakDetected: () => {},
        onPeakCleared: (peak: { binIndex: number }) => clearedPeaks.push(peak),
      }

      // Phase 1: Build up and register peak (10 frames = 200ms)
      for (let frame = 0; frame < 10; frame++) {
        ;(detector as any).analyze(frame * 20, 20)
      }

      // Phase 2: Remove signal
      hasSignal = false

      // Phase 3: Run enough frames for clearMs (200ms = 10 frames, give extra margin)
      for (let frame = 10; frame < 30; frame++) {
        ;(detector as any).analyze(frame * 20, 20)
      }

      expect(clearedPeaks.length).toBeGreaterThanOrEqual(1)
      expect(clearedPeaks.some((p) => p.binIndex === targetBin)).toBe(true)
    })
  })
})
