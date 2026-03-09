/**
 * DSP Worker — runs off the main thread
 * Handles: track management, classification, EQ advisory generation
 * Receives: raw spectrum Float32Array + detected peaks from main thread
 * Sends back: advisory events, track updates, spectrum metadata
 *
 * 2025-03 Upgrade: Wired up all dormant algorithm modules:
 * - MSDHistoryBuffer: full-spectrum MSD analysis (DAFx-16 paper)
 * - AmplitudeHistoryBuffer: compression detection (crest factor + dynamic range)
 * - detectCombPattern(): comb filter pattern from active peaks (DBX paper)
 * - computeNoiseSidebandScore(): breath-noise sideband energy for whistle discrimination
 * - Improved existingScore: uses prominence, MSD, persistence, and Q data
 *
 * Usage (main thread):
 *   const worker = new Worker(new URL('./dspWorker.ts', import.meta.url))
 */

import { TrackManager } from './trackManager'
import { classifyTrackWithAlgorithms, shouldReportIssue, getSeverityUrgency } from './classifier'
import { generateEQAdvisory, findNearestGEQBand } from './eqAdvisor'
import {
  MSDHistoryBuffer,
  AmplitudeHistoryBuffer,
  PhaseHistoryBuffer,
  detectCombPattern,
  calculateSpectralFlatness,
  analyzeInterHarmonicRatio,
  calculatePTMR,
  fuseAlgorithmResults,
  detectContentType,
  MSD_CONSTANTS,
  DEFAULT_FUSION_CONFIG,
} from './advancedDetection'
import type { AlgorithmScores, FusedDetectionResult, FusionConfig } from './advancedDetection'
import { generateId } from '@/lib/utils/mathHelpers'
import type {
  Advisory,
  DetectedPeak,
  DetectorSettings,
  TrackedPeak,
} from '@/types/advisory'
import { DEFAULT_SETTINGS, BAND_COOLDOWN_MS } from './constants'

// ─── Message types ──────────────────────────────────────────────────────────

export type WorkerInboundMessage =
  | {
      type: 'init'
      settings: DetectorSettings
      sampleRate: number
      fftSize: number
    }
  | {
      type: 'updateSettings'
      settings: Partial<DetectorSettings>
    }
  | {
      type: 'processPeak'
      peak: DetectedPeak
      spectrum: Float32Array
      sampleRate: number
      fftSize: number
      /** Optional time-domain samples for phase coherence analysis.
       *  Send via AnalyserNode.getFloatTimeDomainData() on the main thread. */
      timeDomain?: Float32Array
    }
  | {
      type: 'clearPeak'
      binIndex: number
      frequencyHz: number
      timestamp: number
    }
  | {
      type: 'reset'
    }

export type WorkerOutboundMessage =
  | { type: 'advisory'; advisory: Advisory }
  | { type: 'advisoryReplaced'; replacedId: string; advisory: Advisory }
  | { type: 'advisoryCleared'; advisoryId: string }
  | { type: 'tracksUpdate'; tracks: TrackedPeak[] }
  | { type: 'returnBuffers'; spectrum: Float32Array; timeDomain?: Float32Array }
  | { type: 'ready' }
  | { type: 'error'; message: string }

// ─── Worker state ────────────────────────────────────────────────────────────

let settings: DetectorSettings = { ...DEFAULT_SETTINGS }
let sampleRate = 48000
let fftSize = 8192

const trackManager = new TrackManager()
const advisories = new Map<string, Advisory>()
const advisoriesByBand = new Map<number, string>() // GEQ band index → advisory ID
const trackToAdvisoryId = new Map<string, string>()

// Band cooldown: maps GEQ band index → timestamp when the band was last explicitly cleared.
// Suppresses re-triggering the same band for BAND_COOLDOWN_MS after an advisory is cleared via clearPeak.
const bandClearedAt = new Map<number, number>()

// Global advisory rate limiter — max 1 NEW advisory per second (updates to existing still allowed)
let lastAdvisoryCreatedAt = 0
const ADVISORY_RATE_LIMIT_MS = 500

// Decay rate analysis — tracks recently cleared peaks to analyze their decay signature
// Room modes decay exponentially (following RT60); feedback drops instantly (Hopkins §1.2.6.3)
const recentDecays = new Map<number, { lastAmplitudeDb: number; clearTime: number; frequencyHz: number }>()
const DECAY_ANALYSIS_WINDOW_MS = 500
let peakProcessCount = 0

// ─── Extracted magic numbers ─────────────────────────────────────────────────
const SIDEBAND_NOISE_OFFSET_DB = 3
const SIDEBAND_NOISE_RANGE_DB = 9
const EXISTING_PROMINENCE_THRESHOLD_DB = 10
const CLEAR_PEAK_TOLERANCE_CENTS = 100

// ─── Advanced algorithm buffers (previously dormant, now active) ────────────

/** Full-spectrum MSD history — provides per-bin MSD scores to the fusion engine.
 *  Complement to the per-bin ring-buffer MSD in feedbackDetector.ts. */
let msdBuffer: MSDHistoryBuffer | null = null
let msdDownsampleBuf: Float32Array | null = null

/** Phase history buffer for coherence analysis (KU Leuven 2025).
 *  Stores raw phase angles per bin per frame from our own FFT of the time-domain
 *  waveform. Phase coherence ≈ 1.0 for feedback, < 0.4 for music. */
let phaseBuffer: PhaseHistoryBuffer | null = null

/** Amplitude history for compression detection — tracks peak-to-RMS crest factor
 *  and dynamic range over time to identify heavily compressed audio. */
const ampBuffer = new AmplitudeHistoryBuffer()

/** Timestamp of the last frame fed to MSD/amplitude buffers.
 *  Multiple peaks in the same frame share the same spectrum; only add once. */
let lastFrameTimestamp: number = -1

/** Spectrum peak and RMS (in dB) from the most recent frame, used for crest factor. */
let specMax = -Infinity
let rmsDb = -100

// ─── Classification temporal smoothing ──────────────────────────────────────
// Prevents advisory flickering by requiring N consistent classification frames
// before changing a track's label. Safety-critical RUNAWAY/GROWING bypass this.

const CLASSIFICATION_SMOOTHING_FRAMES = 3
interface LabelRingBuffer {
  labels: string[]
  idx: number
  count: number
}
const LABEL_HISTORY_CAPACITY = CLASSIFICATION_SMOOTHING_FRAMES * 3
const classificationLabelHistory = new Map<string, LabelRingBuffer>()

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isHarmonicOfExisting(freqHz: number): boolean {
  // Use the same cents-based tolerance as FeedbackDetector to stay consistent.
  const toleranceCents = settings.harmonicToleranceCents ?? 50
  const MAX_HARMONIC = 8
  for (const advisory of advisories.values()) {
    const existingHz = advisory.trueFrequencyHz

    // A: Overtone check — is new peak an overtone of an existing advisory?
    if (existingHz < freqHz) {
      for (let n = 2; n <= MAX_HARMONIC; n++) {
        const harmonic = existingHz * n
        const cents = Math.abs(1200 * Math.log2(freqHz / harmonic))
        if (cents <= toleranceCents) return true
      }
    }

    // B: Sub-harmonic check removed — if a fundamental appears after its overtone,
    // the fundamental is the actual problem frequency and should NOT be suppressed.
    // The overtone advisory will be replaced via frequency-proximity dedup if close enough.
  }
  return false
}

function findDuplicateAdvisory(freqHz: number, excludeTrackId?: string): Advisory | null {
  const mergeCents = settings.peakMergeCents
  for (const advisory of advisories.values()) {
    if (excludeTrackId && advisory.trackId === excludeTrackId) continue
    const centsDistance = Math.abs(1200 * Math.log2(freqHz / advisory.trueFrequencyHz))
    if (centsDistance <= mergeCents) return advisory
  }
  return null
}

/**
 * Find an existing advisory that targets the same GEQ band.
 * Two peaks at 940 Hz and 1080 Hz both map to the 1000 Hz band —
 * without this check they produce duplicate advisory cards pointing
 * at the same fader. This dedup ensures one advisory per GEQ band.
 */
function findAdvisoryForSameBand(bandIndex: number, excludeTrackId?: string): Advisory | null {
  const advisoryId = advisoriesByBand.get(bandIndex)
  if (!advisoryId) return null
  const advisory = advisories.get(advisoryId)
  if (!advisory) return null
  if (excludeTrackId && advisory.trackId === excludeTrackId) return null
  return advisory
}

/**
 * Compute noise sideband score for whistle discrimination.
 *
 * Whistles produce broadband breath noise in the sidebands around the main
 * frequency.  Feedback produces a clean spectral spike with sidebands at
 * noise floor.  This function measures the excess energy in near-sidebands
 * (±5-15 bins) relative to far-sidebands (±20-40 bins).
 *
 * @param spectrum  - Magnitude spectrum (dB)
 * @param peakBin   - Bin index of the detected peak
 * @returns Score 0-1 where higher = more sideband noise (whistle-like)
 */
function computeNoiseSidebandScore(spectrum: Float32Array, peakBin: number): number {
  const n = spectrum.length

  // Near sidebands (±5 to ±15 bins): breath noise characteristic region
  // Convert dB to linear power for correct averaging, then back to dB
  let nearPower = 0
  let nearCount = 0
  for (let offset = 5; offset <= 15; offset++) {
    if (peakBin + offset < n) { nearPower += Math.pow(10, spectrum[peakBin + offset] / 10); nearCount++ }
    if (peakBin - offset >= 0) { nearPower += Math.pow(10, spectrum[peakBin - offset] / 10); nearCount++ }
  }

  // Far sidebands (±20 to ±40 bins): reference "clean" spectral floor
  let farPower = 0
  let farCount = 0
  for (let offset = 20; offset <= 40; offset++) {
    if (peakBin + offset < n) { farPower += Math.pow(10, spectrum[peakBin + offset] / 10); farCount++ }
    if (peakBin - offset >= 0) { farPower += Math.pow(10, spectrum[peakBin - offset] / 10); farCount++ }
  }

  if (nearCount === 0 || farCount === 0) return 0

  const nearAvgDb = 10 * Math.log10(nearPower / nearCount)
  const farAvgDb = 10 * Math.log10(farPower / farCount)

  // Excess near-sideband energy above far-sideband floor.
  // Breath noise typically shows 5-15 dB excess in near sidebands.
  // Feedback shows < 3 dB excess (clean spectral spike).
  // Map: < 3 dB excess → 0, > 12 dB excess → 1.0
  const excessDb = nearAvgDb - farAvgDb
  return Math.max(0, Math.min(1, (excessDb - SIDEBAND_NOISE_OFFSET_DB) / SIDEBAND_NOISE_RANGE_DB))
}

/**
 * Build a richer "existing" (legacy) score from multiple feature dimensions.
 *
 * Previously this was a crude 3-level mapping from prominenceDb alone.
 * Now combines prominence, feedbackDetector MSD, persistence, and Q data
 * to give the fusion engine a more informative baseline signal.
 */
function computeExistingScore(peak: DetectedPeak): number {
  let score = 0.3 // base

  // Prominence contributes
  if (peak.prominenceDb > 15) score += 0.2
  else if (peak.prominenceDb > EXISTING_PROMINENCE_THRESHOLD_DB) score += 0.1

  // MSD from feedbackDetector (per-bin, fast path)
  if (peak.msdIsHowl) score += 0.15
  else if (peak.msd !== undefined && peak.msd < 0.15) score += 0.1

  // Persistence from feedbackDetector
  if (peak.isHighlyPersistent) score += 0.1
  else if (peak.isPersistent) score += 0.05

  // High Q (narrow resonance)
  if (peak.qEstimate !== undefined && peak.qEstimate > 40) score += 0.1

  return Math.min(score, 1)
}

/**
 * Smooth classification label to prevent advisory flickering.
 *
 * Without smoothing, a peak near the feedback/instrument decision boundary
 * can flip label on every frame, causing distracting UI flicker.  This
 * function requires CLASSIFICATION_SMOOTHING_FRAMES of consistent labelling
 * before accepting a label change.
 *
 * RUNAWAY and GROWING severities bypass smoothing — they're safety-critical
 * and must propagate immediately.
 *
 * @param trackId  - Track identifier
 * @param newLabel - New classification label from this frame
 * @param severity - Severity level (RUNAWAY/GROWING bypass smoothing)
 * @returns The smoothed label to use
 */
function smoothClassificationLabel(
  trackId: string,
  newLabel: string,
  severity: string
): string {
  // Safety-critical: RUNAWAY and GROWING always pass through immediately
  if (severity === 'RUNAWAY' || severity === 'GROWING') {
    classificationLabelHistory.delete(trackId)
    return newLabel
  }

  let ring = classificationLabelHistory.get(trackId)
  if (!ring) {
    ring = { labels: new Array<string>(LABEL_HISTORY_CAPACITY), idx: 0, count: 0 }
    classificationLabelHistory.set(trackId, ring)
  }

  ring.labels[ring.idx] = newLabel
  ring.idx = (ring.idx + 1) % LABEL_HISTORY_CAPACITY
  ring.count = Math.min(ring.count + 1, LABEL_HISTORY_CAPACITY)

  if (ring.count < CLASSIFICATION_SMOOTHING_FRAMES) {
    return newLabel
  }

  // Count occurrences of each label in the most recent CLASSIFICATION_SMOOTHING_FRAMES only.
  // ring.idx points to the NEXT write slot, so walk backwards from (idx - 1).
  const cap = LABEL_HISTORY_CAPACITY
  const windowSize = CLASSIFICATION_SMOOTHING_FRAMES
  const counts = new Map<string, number>()
  for (let k = 0; k < windowSize; k++) {
    const label = ring.labels[(ring.idx - 1 - k + cap) % cap]
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }

  // Return most frequent label (majority vote)
  let maxLabel = newLabel
  let maxCount = 0
  for (const [label, count] of counts) {
    if (count > maxCount) {
      maxCount = count
      maxLabel = label
    }
  }
  return maxLabel
}

/**
 * Choose MSD minimum frames based on detected content type.
 * DAFx-16 paper: speech 7 frames (100%), classical 13 (100%), rock 50 (22%).
 */
function getMsdMinFrames(contentType: string): number {
  switch (contentType) {
    case 'speech':     return MSD_CONSTANTS.MIN_FRAMES_SPEECH
    case 'music':      return MSD_CONSTANTS.MIN_FRAMES_MUSIC
    case 'compressed': return MSD_CONSTANTS.MAX_FRAMES // 30 frames for compressed
    default:           return MSD_CONSTANTS.DEFAULT_FRAMES // 7 for unknown
  }
}

// ─── Radix-2 FFT for Phase Extraction ────────────────────────────────────────
// Lightweight Cooley-Tukey FFT that runs in the worker thread.
// Applies Hann window → in-place FFT → extracts phase angles (atan2).
// Used to feed PhaseHistoryBuffer for phase coherence analysis.
// Performance: O(N log N) ≈ 106K ops for N=8192, negligible at 50fps.

// Pre-allocated FFT buffers (reused across frames to avoid GC pressure)
let fftComplex: Float32Array | null = null       // Interleaved [re, im, re, im, ...]
let fftHannWindow: Float32Array | null = null     // Hann window coefficients
let fftPhases: Float32Array | null = null         // Output phase angles per bin
let fftBitRev: Uint32Array | null = null          // Bit-reversal permutation table
let fftCurrentSize: number = 0

/**
 * Ensure all FFT buffers are allocated for the given transform size.
 * Called once per fftSize change (typically at init).
 */
function ensureFftBuffers(n: number): void {
  if (fftCurrentSize === n) return

  // Interleaved complex: 2 floats per sample
  fftComplex = new Float32Array(n * 2)

  // Phase output: bins 0..N/2-1 (matches PhaseHistoryBuffer size)
  const numBins = n >>> 1
  fftPhases = new Float32Array(numBins)

  // Hann window
  fftHannWindow = new Float32Array(n)
  const factor = 2 * Math.PI / (n - 1)
  for (let i = 0; i < n; i++) {
    fftHannWindow[i] = 0.5 * (1 - Math.cos(factor * i))
  }

  // Bit-reversal table
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
 * Pipeline:
 *  1. Apply Hann window to input samples
 *  2. Bit-reversal permutation
 *  3. In-place Radix-2 Cooley-Tukey butterfly
 *  4. Extract phase via atan2(imag, real) for bins 0..N/2-1
 *
 * @param timeDomain - Raw waveform from AnalyserNode.getFloatTimeDomainData()
 * @returns Float32Array of phase angles in radians, length = N/2
 */
function computePhaseAngles(timeDomain: Float32Array): Float32Array | null {
  const N = timeDomain.length
  if (N < 64 || (N & (N - 1)) !== 0) return null // Must be power of 2

  ensureFftBuffers(N)
  const complex = fftComplex!
  const window = fftHannWindow!
  const bitRev = fftBitRev!
  const phases = fftPhases!

  // Step 1+2: Window + bit-reversal permutation in one pass
  for (let i = 0; i < N; i++) {
    const j = bitRev[i]
    complex[j * 2] = timeDomain[i] * window[i]     // real
    complex[j * 2 + 1] = 0                          // imag
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

        // Twiddle multiply: t = w * complex[odd]
        const tR = wR * complex[oddIdx] - wI * complex[oddIdx + 1]
        const tI = wR * complex[oddIdx + 1] + wI * complex[oddIdx]

        // Butterfly
        complex[oddIdx] = complex[evenIdx] - tR
        complex[oddIdx + 1] = complex[evenIdx + 1] - tI
        complex[evenIdx] += tR
        complex[evenIdx + 1] += tI

        // Rotate twiddle factor
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

// ─── Message handler ─────────────────────────────────────────────────────────

self.onmessage = (event: MessageEvent<WorkerInboundMessage>) => {
  const msg = event.data

  try {
  switch (msg.type) {
    case 'init': {
      settings = { ...DEFAULT_SETTINGS, ...msg.settings }
      sampleRate = msg.sampleRate
      fftSize = msg.fftSize

      // Initialize advanced algorithm buffers
      const numBins = Math.floor(fftSize / 2)
      msdBuffer = new MSDHistoryBuffer(numBins >> 1)
      phaseBuffer = new PhaseHistoryBuffer(numBins, 12) // 12 frames ≈ 240ms at 50fps
      ampBuffer.reset()
      msdDownsampleBuf = null
      ensureFftBuffers(fftSize) // Pre-allocate FFT buffers
      lastFrameTimestamp = -1

      trackManager.clear()
      advisories.clear()
      advisoriesByBand.clear()
      trackToAdvisoryId.clear()
      bandClearedAt.clear()
      lastAdvisoryCreatedAt = 0
      recentDecays.clear()
      peakProcessCount = 0
      self.postMessage({ type: 'ready' } satisfies WorkerOutboundMessage)
      break
    }

    case 'updateSettings': {
      settings = { ...settings, ...msg.settings }
      // Forward track management options to TrackManager
      if (msg.settings.maxTracks !== undefined || msg.settings.trackTimeoutMs !== undefined) {
        trackManager.updateOptions({
          maxTracks: msg.settings.maxTracks,
          trackTimeoutMs: msg.settings.trackTimeoutMs,
        })
      }
      break
    }

    case 'reset': {
      trackManager.clear()
      advisories.clear()
      advisoriesByBand.clear()
      trackToAdvisoryId.clear()
      bandClearedAt.clear()
      lastAdvisoryCreatedAt = 0
      recentDecays.clear()
      peakProcessCount = 0
      msdBuffer?.reset()
      msdDownsampleBuf = null
      phaseBuffer?.reset()
      ampBuffer.reset()
      classificationLabelHistory.clear()
      lastFrameTimestamp = -1
      specMax = -Infinity
      rmsDb = -100
      break
    }

    case 'processPeak': {
      const spectrum = msg.spectrum
      const timeDomain = msg.timeDomain
      try {
      if (!msdBuffer || !phaseBuffer || !trackManager) break

      const { peak, sampleRate: sr, fftSize: fft } = msg
      sampleRate = sr
      fftSize = fft

      // Validate frequency bounds — prevents division-by-zero from invalid settings
      const minFreq = settings.minFrequency ?? 200
      const maxFreq = settings.maxFrequency ?? 8000
      if (minFreq >= maxFreq) break

      // Process through track manager
      const track = trackManager.processPeak(peak)

      // ── Feed frame-level buffers (once per frame, not per peak) ──────────
      const isNewFrame = peak.timestamp !== lastFrameTimestamp
      if (isNewFrame) {
        // MSD: max-pool spectrum to half resolution before storing (halves memory)
        if (msdBuffer) {
          const halfLen = spectrum.length >> 1
          if (!msdDownsampleBuf || msdDownsampleBuf.length !== halfLen) {
            msdDownsampleBuf = new Float32Array(halfLen)
          }
          for (let i = 0; i < halfLen; i++) {
            msdDownsampleBuf[i] = Math.max(spectrum[i << 1], spectrum[(i << 1) + 1])
          }
          msdBuffer.addFrame(msdDownsampleBuf)
        }

        // Compression: compute frame-level peak and RMS from spectrum
        // Use the analysis frequency range from settings
        const startBin = Math.max(1, Math.floor(minFreq * fft / sr))
        const endBin = Math.min(spectrum.length - 1, Math.ceil(maxFreq * fft / sr))
        specMax = -Infinity
        let sumLinearPower = 0
        let validBins = 0
        for (let i = startBin; i <= endBin; i++) {
          if (spectrum[i] > specMax) specMax = spectrum[i]
          sumLinearPower += Math.pow(10, spectrum[i] / 10)
          validBins++
        }
        rmsDb = validBins > 0 ? 10 * Math.log10(sumLinearPower / validBins) : -100
        ampBuffer.addSample(specMax, rmsDb)

        // Phase coherence: extract phase angles on EVERY frame unconditionally.
        // Gaps in phase history corrupt frame-to-frame delta-phase calculations,
        // so we collect even when no tracks exist to maintain continuous history.
        if (timeDomain && phaseBuffer) {
          const phases = computePhaseAngles(timeDomain)
          if (phases) {
            phaseBuffer.addFrame(phases)
          }
        }

        peakProcessCount++

        // Decay rate analysis — only run every 50 peaks to reduce overhead
        // Only applies when room is configured (preset !== 'none')
        if (peakProcessCount % 50 === 0 && settings?.roomPreset != null && settings.roomPreset !== 'none') {
          // ── Decay rate analysis — check recently cleared bins ──────────────
          // Room modes decay exponentially (following RT60); feedback drops instantly.
          // If a recently cleared bin is decaying at the RT60 rate, extend band cooldown.
          const rt60 = settings?.roomRT60 ?? 1.2
          const roomVol = settings?.roomVolume ?? 250
          const now = peak.timestamp
          const expiredBins: number[] = []
          // Estimate surface area for air absorption correction
          const sideLen = Math.pow(roomVol, 1 / 3) * 1.2
          const estSurface = 6 * sideLen * sideLen

          for (const [dBin, decay] of recentDecays) {
            const elapsed = now - decay.clearTime
            if (elapsed > DECAY_ANALYSIS_WINDOW_MS) {
              expiredBins.push(dBin)
              continue
            }
            // Check if this bin still has energy in the current spectrum
            if (dBin < spectrum.length) {
              const currentDb = spectrum[dBin]
              if (currentDb > -100) { // Still measurable
                const elapsedSec = elapsed / 1000
                if (elapsedSec > 0.05) { // Need at least 50ms for meaningful rate
                  const actualDecayRate = (decay.lastAmplitudeDb - currentDb) / elapsedSec // dB/sec
                  const expectedDecayRate = 60 / rt60 // dB/sec for RT60 exponential decay
                  // If actual decay is within 50% of expected → room mode signature
                  if (actualDecayRate > 0 && actualDecayRate < expectedDecayRate * 1.5) {
                    // Decaying like a room mode — extend band cooldown to suppress re-trigger
                    const { bandIndex: geqBandIdx } = findNearestGEQBand(decay.frequencyHz)
                    bandClearedAt.set(geqBandIdx, now)
                  }
                }
              }
            }
          }
          for (const bin of expiredBins) {
            recentDecays.delete(bin)
          }

          // ── Prune stale entries from unbounded maps ─────────────────────
          // bandClearedAt: remove entries past cooldown window (no longer suppressing)
          for (const [band, ts] of bandClearedAt) {
            if (now - ts > BAND_COOLDOWN_MS * 2) bandClearedAt.delete(band)
          }
          // classificationLabelHistory: remove entries for dead tracks
          const activeTrackIds = new Set(trackManager.getActiveTracks().map(t => t.id))
          for (const trackId of classificationLabelHistory.keys()) {
            if (!activeTrackIds.has(trackId)) classificationLabelHistory.delete(trackId)
          }
        }

        lastFrameTimestamp = peak.timestamp
      }

      // ── Compute advanced algorithm scores ──────────────────────────────
      const binIndex = peak.binIndex

      // Spectral flatness around the peak
      const spectralResult = calculateSpectralFlatness(spectrum, binIndex)

      // Inter-harmonic ratio (feedback = clean, music = rich harmonics)
      const ihrResult = analyzeInterHarmonicRatio(spectrum, binIndex, sampleRate, fftSize)

      // Peak-to-median ratio (feedback peaks are very sharp)
      const ptmrResult = calculatePTMR(spectrum, binIndex)

      // Content type detection (needed for MSD frame count selection)
      const crestFactor = specMax - rmsDb
      const contentType = detectContentType(spectrum, crestFactor, spectralResult.flatness)

      // MSD from half-resolution history buffer (DAFx-16 paper, max-pooled 2:1)
      // Content-type-aware frame count: speech=5, music=10, compressed=30, unknown=7
      const msdMinFrames = getMsdMinFrames(contentType)
      const msdResult = msdBuffer?.calculateMSD(binIndex >> 1, msdMinFrames) ?? null

      // Compression detection from amplitude history
      const compressionResult = ampBuffer.detectCompression()

      // Comb filter pattern from all active track frequencies (DBX paper)
      // Runs on every peak but uses cached active tracks — fast for typical counts (<20)
      const activeTracks = trackManager.getRawTracks()
      const peakFrequencies = activeTracks.map(t => t.trueFrequencyHz)
      const combResult = peakFrequencies.length >= 3
        ? detectCombPattern(peakFrequencies, sampleRate)
        : null

      // Noise sideband score for whistle discrimination
      // Measures excess near-sideband energy characteristic of breath noise
      const sidebandScore = computeNoiseSidebandScore(spectrum, binIndex)
      track.features.noiseSidebandScore = sidebandScore

      // Phase coherence for this specific peak bin (KU Leuven 2025)
      // Feedback: coherence ≈ 1.0 (constant Δφ per frame)
      // Music:    coherence < 0.4 (random Δφ per frame)
      const phaseResult = phaseBuffer?.calculateCoherence(binIndex) ?? null

      // Assemble algorithm scores — ALL slots now populated
      const algorithmScores: AlgorithmScores = {
        msd: msdResult,
        phase: phaseResult,
        spectral: spectralResult,
        comb: combResult,
        compression: compressionResult,
        ihr: ihrResult,
        ptmr: ptmrResult,
      }

      // Build enriched existing score from multiple feature dimensions
      const existingScore = computeExistingScore(peak)

      // Fuse algorithm results — pass user-selected algorithm mode + enabled set
      const fusionConfig: FusionConfig = {
        ...DEFAULT_FUSION_CONFIG,
        mode: settings?.algorithmMode ?? 'auto',
        enabledAlgorithms: settings?.enabledAlgorithms,
      }
      const fusionResult: FusedDetectionResult = fuseAlgorithmResults(
        algorithmScores,
        contentType,
        existingScore,
        fusionConfig
      )

      // Enhanced classification with algorithm scores + active frequencies for mode clustering
      const classification = classifyTrackWithAlgorithms(track, algorithmScores, fusionResult, settings, peakFrequencies)

      // Apply classification temporal smoothing (prevents advisory flickering)
      // Safety-critical RUNAWAY/GROWING bypass smoothing automatically
      const smoothedLabel = smoothClassificationLabel(
        track.id,
        classification.label,
        classification.severity
      )
      if (smoothedLabel !== classification.label) {
        classification.label = smoothedLabel as typeof classification.label
        // Re-derive severity for non-feedback labels
        if (smoothedLabel === 'WHISTLE') classification.severity = 'WHISTLE'
        else if (smoothedLabel === 'INSTRUMENT') classification.severity = 'INSTRUMENT'
      }

      // Gate on reporting threshold
      if (!shouldReportIssue(classification, settings)) {
        const existingId = trackToAdvisoryId.get(track.id)
        if (existingId) {
          // No band cooldown here — classification gate drops are transient.
          // Only explicit clearPeak events (hold-time expiry) trigger cooldown.
          const deletedAdvisory = advisories.get(existingId)
          if (deletedAdvisory?.advisory?.geq?.bandIndex !== undefined) {
            advisoriesByBand.delete(deletedAdvisory.advisory.geq.bandIndex)
          }
          advisories.delete(existingId)
          trackToAdvisoryId.delete(track.id)
          self.postMessage({ type: 'advisoryCleared', advisoryId: existingId } satisfies WorkerOutboundMessage)
        }
        self.postMessage({ type: 'tracksUpdate', tracks: trackManager.getActiveTracks() } satisfies WorkerOutboundMessage)
        break
      }

      // Skip harmonics
      if (isHarmonicOfExisting(track.trueFrequencyHz)) break

      // Generate EQ advisory
      const eqAdvisory = generateEQAdvisory(
        track,
        classification.severity,
        settings.eqPreset,
        spectrum,
        sampleRate,
        fftSize
      )

      // Dedup: frequency proximity (original) + GEQ band-level (new)
      const existingId = trackToAdvisoryId.get(track.id)
      let mergedClusterCount = 1

      if (!existingId) {
        // Check -1: global rate limiter — safety-critical severities bypass
        if (peak.timestamp - lastAdvisoryCreatedAt < ADVISORY_RATE_LIMIT_MS
            && classification.severity !== 'RUNAWAY' && classification.severity !== 'GROWING') {
          break
        }

        // Check 0: band cooldown — suppress if this band was recently cleared
        const geqBandIndex = eqAdvisory.geq.bandIndex
        const lastCleared = bandClearedAt.get(geqBandIndex)
        if (lastCleared !== undefined && (peak.timestamp - lastCleared) < BAND_COOLDOWN_MS) {
          break // Band still in cooldown period, don't re-trigger
        }

        // Check 1: cents-based proximity dedup (original logic)
        const freqDup = findDuplicateAdvisory(track.trueFrequencyHz, track.id)
        // Check 2: GEQ band-level dedup — prevents two cards for the same fader
        const bandDup = !freqDup ? findAdvisoryForSameBand(geqBandIndex, track.id) : null
        const dup = freqDup ?? bandDup

        if (dup) {
          const existingUrgency = getSeverityUrgency(dup.severity)
          const newUrgency = getSeverityUrgency(classification.severity)
          if (newUrgency <= existingUrgency && track.trueAmplitudeDb <= dup.trueAmplitudeDb) {
            // New peak is less urgent — absorb into existing, bump its cluster count
            const updatedAdvisory = { ...dup, clusterCount: (dup.clusterCount ?? 1) + 1 }
            advisories.set(dup.id, updatedAdvisory)
            trackToAdvisoryId.set(track.id, dup.id) // Map absorbed track so it doesn't re-enter dedup
            self.postMessage({ type: 'advisory', advisory: updatedAdvisory } satisfies WorkerOutboundMessage)
            break
          }
          // New peak supersedes — carry over cluster count from the one we're replacing
          mergedClusterCount = (dup.clusterCount ?? 1) + 1
          if (dup.advisory?.geq?.bandIndex !== undefined) {
            advisoriesByBand.delete(dup.advisory.geq.bandIndex)
          }
          advisories.delete(dup.id)
          trackToAdvisoryId.delete(dup.trackId)
          self.postMessage({ type: 'advisoryCleared', advisoryId: dup.id } satisfies WorkerOutboundMessage)
        }
      }

      const advisoryId = existingId ?? generateId()
      const advisory: Advisory = {
        id: advisoryId,
        trackId: track.id,
        timestamp: peak.timestamp,
        label: classification.label,
        severity: classification.severity,
        confidence: classification.confidence,
        why: classification.reasons,
        trueFrequencyHz: track.trueFrequencyHz,
        trueAmplitudeDb: track.trueAmplitudeDb,
        prominenceDb: track.prominenceDb,
        qEstimate: track.qEstimate,
        bandwidthHz: track.bandwidthHz,
        phpr: track.phpr,
        velocityDbPerSec: track.velocityDbPerSec,
        stabilityCentsStd: track.features.stabilityCentsStd,
        harmonicityScore: track.features.harmonicityScore,
        modulationScore: track.features.modulationScore,
        advisory: eqAdvisory,
        // Enhanced detection fields from acoustic analysis
        modalOverlapFactor: classification.modalOverlapFactor,
        cumulativeGrowthDb: classification.cumulativeGrowthDb,
        frequencyBand: classification.frequencyBand,
        // Cluster info — how many peaks merged into this advisory
        clusterCount: mergedClusterCount > 1 ? mergedClusterCount : undefined,
      }

      advisories.set(advisoryId, advisory)
      if (eqAdvisory?.geq?.bandIndex !== undefined) {
        advisoriesByBand.set(eqAdvisory.geq.bandIndex, advisoryId)
      }
      if (!existingId) {
        trackToAdvisoryId.set(track.id, advisoryId)
        lastAdvisoryCreatedAt = peak.timestamp
      }

      self.postMessage({ type: 'advisory', advisory } satisfies WorkerOutboundMessage)
      self.postMessage({ type: 'tracksUpdate', tracks: trackManager.getActiveTracks() } satisfies WorkerOutboundMessage)
      break
      } finally {
        // Return pooled buffers to main thread via zero-copy transfer.
        // Include the typed arrays in the message payload so the main thread
        // can access the transferred buffers (they become valid Float32Arrays
        // on the receiving side, while detaching on the worker side).
        const returnList: ArrayBuffer[] = []
        if (spectrum.buffer.byteLength > 0) returnList.push(spectrum.buffer as ArrayBuffer)
        if (timeDomain && timeDomain.buffer.byteLength > 0) returnList.push(timeDomain.buffer as ArrayBuffer)
        if (returnList.length > 0) {
          self.postMessage(
            { type: 'returnBuffers', spectrum, timeDomain } satisfies WorkerOutboundMessage,
            returnList
          )
        }
      }
    }

    case 'clearPeak': {
      const { binIndex, frequencyHz, timestamp } = msg
      const lastAmplitude = trackManager.clearTrack(binIndex, timestamp)
      // Record for decay rate analysis (room mode vs feedback distinction)
      if (lastAmplitude !== null) {
        recentDecays.set(binIndex, { lastAmplitudeDb: lastAmplitude, clearTime: timestamp, frequencyHz })
      }
      trackManager.pruneInactiveTracks(timestamp)

      for (const [trackId, advisoryId] of trackToAdvisoryId.entries()) {
        const advisory = advisories.get(advisoryId)
        const cents = advisory ? Math.abs(1200 * Math.log2(advisory.trueFrequencyHz / frequencyHz)) : Infinity
        if (advisory && cents <= CLEAR_PEAK_TOLERANCE_CENTS) {
          if (advisory.advisory?.geq?.bandIndex != null) {
            bandClearedAt.set(advisory.advisory.geq.bandIndex, timestamp)
            advisoriesByBand.delete(advisory.advisory.geq.bandIndex)
          }
          advisories.delete(advisoryId)
          trackToAdvisoryId.delete(trackId)
          self.postMessage({ type: 'advisoryCleared', advisoryId } satisfies WorkerOutboundMessage)
          break
        }
      }

      self.postMessage({ type: 'tracksUpdate', tracks: trackManager.getActiveTracks() } satisfies WorkerOutboundMessage)
      break
    }
  }
  } catch (err) {
    self.postMessage({ type: 'error', message: `[${msg.type}] ${err instanceof Error ? err.message : String(err)}` } satisfies WorkerOutboundMessage)
  }
}

export {}
