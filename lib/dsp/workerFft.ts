/**
 * workerFft.ts — FFT processing + algorithm score computation
 *
 * Encapsulates the Radix-2 Cooley-Tukey FFT (for phase extraction),
 * MSD/Phase/Amplitude history buffers, and all algorithm score
 * computation.  Pure computational logic — no worker messaging.
 *
 * Extracted from dspWorker.ts (Batch 4) for maintainability.
 */

import {
  AmplitudeHistoryBuffer,
  PhaseHistoryBuffer,
  detectCombPattern,
  calculateSpectralFlatness,
  analyzeInterHarmonicRatio,
  calculatePTMR,
  detectContentType,
  MSD_CONSTANTS,
} from './advancedDetection'
import type { MSDResult } from './advancedDetection'
import type { AlgorithmScores } from './advancedDetection'
import { MSDPool } from './msdPool'
import { MSD_SETTINGS } from './constants'
import { MLInferenceEngine } from './mlInference'
import type { ContentType, DetectedPeak, Track } from '@/types/advisory'

// ── dB-to-linear LUT (replaces Math.pow(10, db/10) in hot loops) ────────────
// 1001-entry table: index = (db + 100) * 10, range [-100, 0] dB
const EXP_LUT = /* @__PURE__ */ (() => {
  const table = new Float32Array(1001)
  for (let i = 0; i <= 1000; i++) {
    table[i] = Math.pow(10, (i / 10 - 100) / 10)
  }
  return table
})()

/** Convert dB to linear power via LUT. ~3x faster than Math.pow(10, db/10). */
function dbToLinear(db: number): number {
  const idx = ((db + 100) * 10 + 0.5) | 0
  return EXP_LUT[idx < 0 ? 0 : idx > 1000 ? 1000 : idx]
}

// ── Extracted magic numbers ─────────────────────────────────────────────────

const SIDEBAND_NOISE_OFFSET_DB = 3
const SIDEBAND_NOISE_RANGE_DB = 9

// ── Pure helper functions (exported for testability) ────────────────────────

/**
 * Compute noise sideband score for whistle discrimination.
 *
 * Whistles produce broadband breath noise in the sidebands around the main
 * frequency.  Feedback produces a clean spectral spike with sidebands at
 * noise floor.  Measures excess energy in near-sidebands (±5-15 bins)
 * relative to far-sidebands (±20-40 bins).
 *
 * @returns Score 0-1 where higher = more sideband noise (whistle-like)
 */
export function computeNoiseSidebandScore(spectrum: Float32Array, peakBin: number): number {
  const n = spectrum.length

  // Near sidebands (±5 to ±15 bins): breath noise characteristic region
  let nearPower = 0
  let nearCount = 0
  for (let offset = 5; offset <= 15; offset++) {
    if (peakBin + offset < n) { nearPower += dbToLinear(spectrum[peakBin + offset]); nearCount++ }
    if (peakBin - offset >= 0) { nearPower += dbToLinear(spectrum[peakBin - offset]); nearCount++ }
  }

  // Far sidebands (±20 to ±40 bins): reference "clean" spectral floor
  let farPower = 0
  let farCount = 0
  for (let offset = 20; offset <= 40; offset++) {
    if (peakBin + offset < n) { farPower += dbToLinear(spectrum[peakBin + offset]); farCount++ }
    if (peakBin - offset >= 0) { farPower += dbToLinear(spectrum[peakBin - offset]); farCount++ }
  }

  if (nearCount === 0 || farCount === 0) return 0

  const nearAvgDb = 10 * Math.log10(nearPower / nearCount)
  const farAvgDb = 10 * Math.log10(farPower / farCount)

  // Map: < 3 dB excess → 0, > 12 dB excess → 1.0
  const excessDb = nearAvgDb - farAvgDb
  return Math.max(0, Math.min(1, (excessDb - SIDEBAND_NOISE_OFFSET_DB) / SIDEBAND_NOISE_RANGE_DB))
}


/**
 * Choose MSD minimum frames based on detected content type.
 * DAFx-16 paper: speech 7 frames (100%), classical 13 (100%), rock 50 (22%).
 */
export function getMsdMinFrames(contentType: string): number {
  switch (contentType) {
    case 'speech':     return MSD_CONSTANTS.MIN_FRAMES_SPEECH
    case 'music':      return MSD_CONSTANTS.MIN_FRAMES_MUSIC
    case 'compressed': return MSD_CONSTANTS.MAX_FRAMES
    default:           return MSD_CONSTANTS.DEFAULT_FRAMES
  }
}

// ── Radix-2 FFT for Phase Extraction ────────────────────────────────────────
// Lightweight Cooley-Tukey FFT that runs in the worker thread.
// Applies Hann window → in-place FFT → extracts phase angles (atan2).
// Performance: O(N log N) ≈ 106K ops for N=8192, negligible at 50fps.

// Pre-allocated FFT buffers (reused across frames to avoid GC pressure)
let fftComplex: Float32Array | null = null
let fftHannWindow: Float32Array | null = null
let fftPhases: Float32Array | null = null
let fftBitRev: Uint32Array | null = null
let fftCurrentSize: number = 0

/**
 * Ensure all FFT buffers are allocated for the given transform size.
 * Called once per fftSize change (typically at init).
 */
function ensureFftBuffers(n: number): void {
  if (fftCurrentSize === n) return

  fftComplex = new Float32Array(n * 2)
  const numBins = n >>> 1
  fftPhases = new Float32Array(numBins)

  fftHannWindow = new Float32Array(n)
  const factor = 2 * Math.PI / (n - 1)
  for (let i = 0; i < n; i++) {
    fftHannWindow[i] = 0.5 * (1 - Math.cos(factor * i))
  }

  fftBitRev = new Uint32Array(n)
  const bits = Math.log2(n) | 0
  for (let i = 0; i < n; i++) {
    let rev = 0
    let v = i
    for (let b = 0; b < bits; b++) {
      rev = (rev << 1) | (v & 1)
      v >>>= 1
    }
    fftBitRev[i] = rev
  }

  fftCurrentSize = n
}

/**
 * Compute per-bin phase angles from time-domain waveform samples.
 *
 * Pipeline: Hann window → bit-reversal permutation → Radix-2 butterfly → atan2
 *
 * @param timeDomain - Raw waveform from AnalyserNode.getFloatTimeDomainData()
 * @returns Float32Array of phase angles in radians, length = N/2
 */
function computePhaseAngles(timeDomain: Float32Array): Float32Array | null {
  const N = timeDomain.length
  if (N < 64 || (N & (N - 1)) !== 0) return null

  ensureFftBuffers(N)
  const complex = fftComplex!
  const window = fftHannWindow!
  const bitRev = fftBitRev!
  const phases = fftPhases!

  // Step 1+2: Window + bit-reversal permutation in one pass
  for (let i = 0; i < N; i++) {
    const j = bitRev[i]
    complex[j * 2] = timeDomain[i] * window[i]
    complex[j * 2 + 1] = 0
  }

  // Step 3: Cooley-Tukey butterfly passes
  for (let size = 2; size <= N; size <<= 1) {
    const halfSize = size >>> 1
    const angle = -2 * Math.PI / size
    const wStepR = Math.cos(angle)
    const wStepI = Math.sin(angle)

    for (let start = 0; start < N; start += size) {
      let wR = 1
      let wI = 0

      for (let k = 0; k < halfSize; k++) {
        const evenIdx = (start + k) << 1
        const oddIdx = (start + k + halfSize) << 1

        const tR = wR * complex[oddIdx] - wI * complex[oddIdx + 1]
        const tI = wR * complex[oddIdx + 1] + wI * complex[oddIdx]

        complex[oddIdx] = complex[evenIdx] - tR
        complex[oddIdx + 1] = complex[evenIdx + 1] - tI
        complex[evenIdx] += tR
        complex[evenIdx + 1] += tI

        const newWR = wR * wStepR - wI * wStepI
        wI = wR * wStepI + wI * wStepR
        wR = newWR
      }
    }
  }

  // Step 4: Extract phase angles for bins 0..N/2-1
  const numBins = N >>> 1
  for (let i = 0; i < numBins; i++) {
    phases[i] = Math.atan2(complex[i * 2 + 1], complex[i * 2])
  }

  return phases
}

// ── Algorithm Engine ────────────────────────────────────────────────────────

export interface FrameStats {
  specMax: number
  rmsDb: number
}

export interface AlgorithmResult {
  algorithmScores: AlgorithmScores
  contentType: ContentType
}

/**
 * Encapsulates all algorithm history buffers and score computation.
 * Stateful — maintains MSD, phase, and amplitude histories across frames.
 */
export class AlgorithmEngine {
  private msdPool: MSDPool | null = null
  private phaseBuffer: PhaseHistoryBuffer | null = null
  private ampBuffer = new AmplitudeHistoryBuffer()
  private lastFrameTimestamp: number = -1
  private specMax = -Infinity
  private rmsDb = -100
  private _mlEngine = new MLInferenceEngine()
  /** Pre-allocated buffer for ML feature vector (11 features, reused every frame) */
  private _mlFeatures = new Float32Array(11)
  /** Previous frame's fused probability — fed into ML feature vector (1-frame lag) */
  private _lastFusedProb = 0.5
  /** Previous frame's fused confidence — fed into ML feature vector (1-frame lag) */
  private _lastFusedConf = 0.5

  /** Allocate buffers for the given FFT size. */
  init(fftSize: number): void {
    const numBins = Math.floor(fftSize / 2)
    this.msdPool = new MSDPool()  // 256 slots × 64 frames = 64KB (was 1MB dense)
    this.phaseBuffer = new PhaseHistoryBuffer(numBins, 12)
    this.ampBuffer.reset()
    ensureFftBuffers(fftSize)
    this.lastFrameTimestamp = -1
    this._mlEngine.warmup() // Non-blocking async ONNX load
  }

  /**
   * Feed frame-level buffers (MSD, amplitude, phase).
   * Should be called once per peak, but only does work on new frames.
   *
   * @returns true if this was a new frame (first peak in this timestamp)
   */
  feedFrame(
    timestamp: number,
    spectrum: Float32Array,
    timeDomain: Float32Array | undefined,
    minFreq: number,
    maxFreq: number,
    sampleRate: number,
    fftSize: number,
  ): boolean {
    const isNewFrame = timestamp !== this.lastFrameTimestamp
    if (!isNewFrame) return false

    // MSD: no longer fed here — writes happen per-peak in computeScores()
    // (sparse model: only peak bins accumulate history, matching feedbackDetector.ts)

    // Compression: compute frame-level peak and RMS from spectrum
    const startBin = Math.max(1, Math.floor(minFreq * fftSize / sampleRate))
    const endBin = Math.min(spectrum.length - 1, Math.ceil(maxFreq * fftSize / sampleRate))
    this.specMax = -Infinity
    let sumLinearPower = 0
    let validBins = 0
    for (let i = startBin; i <= endBin; i++) {
      if (spectrum[i] > this.specMax) this.specMax = spectrum[i]
      sumLinearPower += dbToLinear(spectrum[i])
      validBins++
    }
    this.rmsDb = validBins > 0 ? 10 * Math.log10(sumLinearPower / validBins) : -100
    this.ampBuffer.addSample(this.specMax, this.rmsDb)

    // Phase coherence: extract phase angles on EVERY frame unconditionally
    if (timeDomain && this.phaseBuffer) {
      const phases = computePhaseAngles(timeDomain)
      if (phases) {
        this.phaseBuffer.addFrame(phases)
      }
    }

    this.lastFrameTimestamp = timestamp
    return true
  }

  /**
   * Compute all algorithm scores for a given peak.
   * Requires `feedFrame()` to have been called for this frame first.
   */
  computeScores(
    peak: DetectedPeak,
    track: Track,
    spectrum: Float32Array,
    sampleRate: number,
    fftSize: number,
    activePeakFrequencies: number[],
  ): AlgorithmResult {
    const binIndex = peak.binIndex

    // Spectral flatness around the peak
    const spectralResult = calculateSpectralFlatness(spectrum, binIndex)

    // Inter-harmonic ratio
    const ihrResult = analyzeInterHarmonicRatio(spectrum, binIndex, sampleRate, fftSize)

    // Peak-to-median ratio
    const ptmrResult = calculatePTMR(spectrum, binIndex)

    // Content type detection — uses full spectrum + global crest factor
    const crestFactor = this.specMax - this.rmsDb
    const contentType = detectContentType(spectrum, crestFactor)

    // MSD: write this peak's magnitude to pool (builds history across frames)
    this.msdPool?.write(binIndex, spectrum[binIndex])

    // Compute MSD from pooled sparse history (matches feedbackDetector.ts per-bin tracking)
    const msdMinFrames = getMsdMinFrames(contentType)
    let msdResult: MSDResult | null = null
    if (this.msdPool) {
      const raw = this.msdPool.getMSD(binIndex, msdMinFrames)
      if (raw.msd >= 0) {
        // Energy gate (caller responsibility — MSDPool returns raw values)
        const gated = peak.noiseFloorDb != null
          && spectrum[binIndex] - peak.noiseFloorDb < MSD_SETTINGS.MIN_ENERGY_ABOVE_NOISE_DB
        msdResult = {
          msd: gated ? Infinity : raw.msd,
          feedbackScore: gated ? 0 : Math.exp(-raw.msd / MSD_CONSTANTS.THRESHOLD),
          secondDerivative: 0,
          isFeedbackLikely: !gated && raw.msd < MSD_CONSTANTS.THRESHOLD,
          framesAnalyzed: raw.frameCount,
          meanMagnitudeDb: spectrum[binIndex],
        }
      }
    }

    // Compression detection
    const compressionResult = this.ampBuffer.detectCompression()

    // Comb filter pattern from active track frequencies
    const combResult = activePeakFrequencies.length >= 3
      ? detectCombPattern(activePeakFrequencies, sampleRate)
      : null

    // Noise sideband score for whistle discrimination
    const sidebandScore = computeNoiseSidebandScore(spectrum, binIndex)
    track.features.noiseSidebandScore = sidebandScore

    // Phase coherence for this specific peak bin
    const phaseResult = this.phaseBuffer?.calculateCoherence(binIndex) ?? null

    // ML meta-model: fill pre-allocated feature vector (zero-alloc hot path)
    const f = this._mlFeatures
    f[0] = msdResult?.feedbackScore ?? 0.5
    f[1] = phaseResult?.feedbackScore ?? 0.5
    f[2] = spectralResult?.feedbackScore ?? 0.5
    f[3] = combResult?.hasPattern ? combResult.confidence : 0
    f[4] = ihrResult?.feedbackScore ?? 0.5
    f[5] = ptmrResult?.feedbackScore ?? 0.5
    f[6] = this._lastFusedProb
    f[7] = this._lastFusedConf
    f[8] = contentType === 'speech' ? 1 : 0
    f[9] = contentType === 'music' ? 1 : 0
    f[10] = contentType === 'compressed' ? 1 : 0
    const mlResult = this._mlEngine.predictCached(f)

    const algorithmScores: AlgorithmScores = {
      msd: msdResult,
      phase: phaseResult,
      spectral: spectralResult,
      comb: combResult,
      compression: compressionResult,
      ihr: ihrResult,
      ptmr: ptmrResult,
      ml: mlResult,
    }

    return { algorithmScores, contentType }
  }

  /**
   * Feed back the fusion result from the current frame so the ML model
   * can use it as input for the next frame's prediction (1-frame lag).
   */
  updateLastFusion(probability: number, confidence: number): void {
    this._lastFusedProb = probability
    this._lastFusedConf = confidence
  }

  reset(): void {
    this.msdPool?.reset()
    this.phaseBuffer?.reset()
    this.ampBuffer.reset()
    this.lastFrameTimestamp = -1
    this.specMax = -Infinity
    this.rmsDb = -100
    this._lastFusedProb = 0.5
    this._lastFusedConf = 0.5
    this._mlEngine.dispose()
    this._mlEngine = new MLInferenceEngine()
    this._mlEngine.warmup()
  }
}
