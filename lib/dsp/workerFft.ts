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
} from './advancedDetection'
import { TEMPORAL_ENVELOPE, MSD_CONSTANTS, MSD_SETTINGS } from './constants'
import type { AlgorithmScores } from './advancedDetection'
import { MSDPool } from './msdPool'
import { MLInferenceEngine } from './mlInference'
import { dbToLinearLut as dbToLinear } from './expLut'
import type { ContentType, DetectedPeak, Track, MSDResult } from '@/types/advisory'

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
  /** Frame counter for phase skip cadence (0, 1, 2, 0, 1, 2, ...) */
  private _phaseFrameCounter = 0

  // ── Content-type authority (moved from main-thread feedbackDetector.ts) ─────
  private _ctEnergyBuffer = new Float32Array(TEMPORAL_ENVELOPE.BUFFER_SIZE)
  private _ctEnergyPos = 0
  private _ctEnergyFilled = false
  // Welford's online variance accumulators — O(1) per frame instead of O(n)
  private _ctWelfordCount = 0
  private _ctWelfordMean = 0
  private _ctWelfordM2 = 0
  private _ctSilentFrameCount = 0
  // Fix 1: Circular buffer replaces push/shift — O(1) vs O(n)
  private _ctHistoryBuf: ContentType[] = new Array<ContentType>(10).fill('unknown')
  private _ctHistoryPos = 0
  private _ctHistoryFilled = false
  private static readonly CT_WINDOW = 10
  private _contentType: ContentType = 'unknown'
  private _ctSilenceThresholdDb = -65
  private _ctIsCompressed = false
  private _ctCompressionRatio = 1

  /**
   * Update content-type classification from a periodic spectrum snapshot.
   * Includes temporal envelope analysis and majority-vote smoothing,
   * previously done on the main thread in feedbackDetector.ts.
   *
   * @returns The smoothed content type, or null if unchanged.
   */
  updateContentType(
    spectrum: Float32Array,
    crestFactor: number,
    sampleRateParam: number,
    fftSizeParam: number,
  ): ContentType | null {
    const startBin = Math.max(1, Math.floor(150 * fftSizeParam / sampleRateParam))
    const endBin = Math.min(spectrum.length - 1, Math.ceil(10000 * fftSizeParam / sampleRateParam))
    let specMax = -Infinity
    let sumLinear = 0
    let validBins = 0
    for (let i = startBin; i <= endBin; i++) {
      const v = spectrum[i]
      if (Number.isFinite(v)) {
        if (v > specMax) specMax = v
        sumLinear += dbToLinear(v)
        validBins++
      }
    }
    if (validBins === 0 || specMax <= this._ctSilenceThresholdDb) return null

    // Write energy to temporal ring buffer + Welford's online variance (O(1) per frame)
    const bufSize = TEMPORAL_ENVELOPE.BUFFER_SIZE
    const writeIdx = this._ctEnergyPos % bufSize
    const isSilent = specMax < this._ctSilenceThresholdDb

    if (this._ctEnergyFilled) {
      // Ring buffer full — subtract the evicted sample from Welford accumulators
      const evicted = this._ctEnergyBuffer[writeIdx]
      // Reverse Welford: remove evicted sample (count stays constant)
      const n = this._ctWelfordCount
      const oldMean = this._ctWelfordMean
      const newMean = oldMean + (specMax - evicted) / n
      // Update M2: add new sample's contribution, remove evicted sample's
      this._ctWelfordM2 += (specMax - newMean) * (specMax - oldMean)
        - (evicted - newMean) * (evicted - oldMean)
      if (this._ctWelfordM2 < 0) this._ctWelfordM2 = 0 // Clamp numerical drift
      this._ctWelfordMean = newMean
      // Update silent frame count
      if (evicted < this._ctSilenceThresholdDb) this._ctSilentFrameCount--
      if (isSilent) this._ctSilentFrameCount++
    } else {
      // Buffer filling — standard Welford add
      this._ctWelfordCount++
      const n = this._ctWelfordCount
      const delta = specMax - this._ctWelfordMean
      this._ctWelfordMean += delta / n
      const delta2 = specMax - this._ctWelfordMean
      this._ctWelfordM2 += delta * delta2
      if (isSilent) this._ctSilentFrameCount++
    }

    this._ctEnergyBuffer[writeIdx] = specMax
    this._ctEnergyPos++
    if (this._ctEnergyPos >= bufSize) this._ctEnergyFilled = true

    // Read temporal metrics in O(1) from accumulators
    let temporalMetrics: { energyVariance: number; silenceGapRatio: number } | undefined
    const count = this._ctEnergyFilled ? bufSize : this._ctWelfordCount
    if (count >= TEMPORAL_ENVELOPE.MIN_FRAMES) {
      temporalMetrics = {
        energyVariance: this._ctWelfordM2 / count,
        silenceGapRatio: this._ctSilentFrameCount / count,
      }
    }

    const instantType = detectContentType(spectrum, crestFactor, temporalMetrics)

    // Majority-vote smoothing via circular buffer — O(1) write, O(window) scan
    this._ctHistoryBuf[this._ctHistoryPos] = instantType
    this._ctHistoryPos = (this._ctHistoryPos + 1) % AlgorithmEngine.CT_WINDOW
    if (!this._ctHistoryFilled && this._ctHistoryPos === 0) this._ctHistoryFilled = true
    const histLen = this._ctHistoryFilled ? AlgorithmEngine.CT_WINDOW : this._ctHistoryPos
    const ctCounts: Record<string, number> = {}
    for (let ci = 0; ci < histLen; ci++) {
      const t = this._ctHistoryBuf[ci]
      if (t !== 'unknown') ctCounts[t] = (ctCounts[t] ?? 0) + 1
    }
    // Single-pass max instead of sort (4 content types → O(4) vs O(4 log 4) + allocation)
    let bestKey = ''
    let bestCount = 0
    for (const key in ctCounts) {
      if (ctCounts[key] > bestCount) { bestCount = ctCounts[key]; bestKey = key }
    }
    const prev = this._contentType
    this._contentType = bestKey && bestCount >= 3 ? bestKey as ContentType : (this._contentType ?? 'unknown')

    // Update compression status
    const compressionResult = this.ampBuffer.detectCompression()
    this._ctIsCompressed = compressionResult?.isCompressed ?? false
    this._ctCompressionRatio = compressionResult?.estimatedRatio ?? 1

    return this._contentType !== prev ? this._contentType : null
  }

  /** Get the worker's authoritative content type. */
  getContentType(): ContentType { return this._contentType }
  /** Whether compressed audio is detected. */
  getIsCompressed(): boolean { return this._ctIsCompressed }
  /** Estimated compression ratio. */
  getCompressionRatio(): number { return this._ctCompressionRatio }

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
    skipPhase: boolean = false,
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

    // Phase coherence: adaptive skip when MSD is decisive in MSD-led modes
    if (timeDomain && this.phaseBuffer) {
      this._phaseFrameCounter++
      if (!skipPhase) {
        const phases = computePhaseAngles(timeDomain)
        if (phases) {
          this.phaseBuffer.addFrame(phases)
        }
      }
      // On skip frames, phaseBuffer retains last-written frame — coherence score
      // uses existing history, which is at most 40ms stale (2 skipped × 20ms).
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

    // Use the worker's smoothed authoritative content type (majority-vote pipeline)
    // instead of calling detectContentType() again per-peak. This ensures MSD frame
    // thresholds and ML one-hot features are consistent with fusion and UI.
    const contentType = this._contentType

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

  /**
   * Determine if phase FFT should be skipped this frame.
   * Skip when: adaptive skip enabled AND mode is MSD-led AND MSD is decisive.
   * Never skip in liveMusic or worship (phase is the lead algorithm there).
   */
  shouldSkipPhase(adaptivePhaseSkip: boolean, mode: string): boolean {
    if (!adaptivePhaseSkip) return false
    if (mode === 'liveMusic' || mode === 'worship') return false
    const msdDecisive = this._lastFusedProb > 0.8 || this._lastFusedProb < 0.1
    if (!msdDecisive) return false
    return (this._phaseFrameCounter % 3) !== 0
  }

  reset(): void {
    this.msdPool?.reset()
    this.phaseBuffer?.reset()
    this.ampBuffer.reset()
    this.lastFrameTimestamp = -1
    this._phaseFrameCounter = 0
    this.specMax = -Infinity
    this.rmsDb = -100
    this._lastFusedProb = 0.5
    this._lastFusedConf = 0.5
    this._mlEngine.dispose()
    this._mlEngine = new MLInferenceEngine()
    this._mlEngine.warmup()
    this._ctEnergyBuffer.fill(-100)
    this._ctEnergyPos = 0
    this._ctEnergyFilled = false
    this._ctWelfordCount = 0
    this._ctWelfordMean = 0
    this._ctWelfordM2 = 0
    this._ctSilentFrameCount = 0
    this._ctHistoryBuf.fill('unknown')
    this._ctHistoryPos = 0
    this._ctHistoryFilled = false
    this._contentType = 'unknown'
    this._ctIsCompressed = false
    this._ctCompressionRatio = 1
  }
}
