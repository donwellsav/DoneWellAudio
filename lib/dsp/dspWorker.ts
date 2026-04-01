/**
 * DSP Worker — thin orchestrator (runs off the main thread)
 *
 * Delegates DSP computation to focused modules:
 *   - AlgorithmEngine (workerFft.ts): FFT, MSD, phase, amplitude analysis
 *   - AdvisoryManager (advisoryManager.ts): advisory lifecycle, dedup, pruning
 *   - DecayAnalyzer (decayAnalyzer.ts): room-mode decay analysis
 *
 * This file owns:
 *   - Worker message dispatch (onmessage / postMessage)
 *   - Classification temporal smoothing (ring-buffer majority vote)
 *   - Fusion configuration from user settings
 *
 * Refactored from monolithic 935-line dspWorker.ts (Batch 4).
 */

import { TrackManager } from './trackManager'
import { classifyTrackWithAlgorithms, shouldReportIssue } from './classifier'
import { generateEQAdvisory, analyzeSpectralTrends } from './eqAdvisor'
import { fuseAlgorithmResults, DEFAULT_FUSION_CONFIG, CombStabilityTracker } from './advancedDetection'
import type { CombPatternResult, FusionConfig } from './advancedDetection'
import { AlgorithmEngine } from './workerFft'
import { AdvisoryManager } from './advisoryManager'
import { DecayAnalyzer } from './decayAnalyzer'
import type {
  Advisory,
  AlgorithmMode,
  ContentType,
  DetectedPeak,
  DetectorSettings,
  TrackedPeak,
} from '@/types/advisory'
import type { SnapshotWorkerInbound, SnapshotWorkerOutbound, MarkerAlgorithmScores, UserFeedback } from '@/types/data'
import { SnapshotCollector } from '@/lib/data/snapshotCollector'
import { DEFAULT_SETTINGS, MSD_SETTINGS } from './constants'

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
  | {
      type: 'userFeedback'
      frequencyHz: number
      feedback: UserFeedback
    }
  // Periodic spectrum feed for content-type detection (independent of peak backpressure)
  | {
      type: 'spectrumUpdate'
      spectrum: Float32Array
      crestFactor: number
      sampleRate: number
      fftSize: number
    }
  // Room dimension estimation
  | { type: 'startRoomMeasurement' }
  | { type: 'stopRoomMeasurement' }
  // Snapshot collection messages (free tier only)
  | SnapshotWorkerInbound

export type WorkerOutboundMessage =
  | { type: 'advisory'; advisory: Advisory }
  | { type: 'advisoryCleared'; advisoryId: string }
  | { type: 'tracksUpdate'; tracks: TrackedPeak[]; contentType?: ContentType; algorithmMode?: AlgorithmMode; isCompressed?: boolean; compressionRatio?: number }
  | { type: 'combPatternUpdate'; pattern: CombPatternResult | null }
  | { type: 'returnBuffers'; spectrum: Float32Array; timeDomain?: Float32Array; source?: 'peak' | 'spectrumUpdate' }
  | { type: 'contentTypeUpdate'; contentType: ContentType; isCompressed: boolean; compressionRatio: number }
  | { type: 'ready' }
  | { type: 'error'; message: string }
  // Room dimension estimation responses
  | { type: 'roomEstimate'; estimate: import('@/types/calibration').RoomDimensionEstimate }
  | { type: 'roomMeasurementProgress'; elapsedMs: number; stablePeaks: number }
  // Snapshot collection responses
  | SnapshotWorkerOutbound

// ─── Worker state ────────────────────────────────────────────────────────────

let settings: DetectorSettings = { ...DEFAULT_SETTINGS }
let sampleRate = 48000
let fftSize = 8192
let peakProcessCount = 0

/** Compute MSD min frames from operation mode — mirrors FeedbackDetector.updateMsdMinFrames() */
function getMsdMinFramesForMode(mode?: string): number {
  if (mode === 'speech' || mode === 'broadcast') return MSD_SETTINGS.MIN_FRAMES_SPEECH
  if (mode === 'liveMusic' || mode === 'worship' || mode === 'outdoor') return MSD_SETTINGS.MIN_FRAMES_MUSIC
  return MSD_SETTINGS.DEFAULT_MIN_FRAMES
}

// ─── Cached FusionConfig (rebuilt only on settings change, not per-peak) ─────
let _cachedFusionConfig: FusionConfig | null = null

// ─── Per-cycle shelf cache (cross-advisory dedup) ────────────────────────────
// Shelves are broadband (global spectrum), not peak-specific. Computing once
// per analysis frame and sharing across all peaks avoids duplicate shelf arrays.
import type { ShelfRecommendation } from '@/types/advisory'
let cachedShelves: ShelfRecommendation[] | null = null
let cachedShelvesFrameId = -1

// ─── Worker-side status (sent to main thread via tracksUpdate) ───────────────
let lastContentType: ContentType = 'unknown'
let lastIsCompressed = false
let lastCompressionRatio = 1
let lastCombPattern: CombPatternResult | null = null

function normalizeCombPattern(pattern: CombPatternResult | null | undefined): CombPatternResult | null {
  if (!pattern || !pattern.hasPattern || pattern.predictedFrequencies.length === 0) return null
  return {
    ...pattern,
    predictedFrequencies: [...pattern.predictedFrequencies],
  }
}

function combPatternEquals(a: CombPatternResult | null, b: CombPatternResult | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  if (a.hasPattern !== b.hasPattern) return false
  if (Math.round((a.fundamentalSpacing ?? 0) * 10) !== Math.round((b.fundamentalSpacing ?? 0) * 10)) return false
  if (Math.round((a.estimatedPathLength ?? 0) * 100) !== Math.round((b.estimatedPathLength ?? 0) * 100)) return false
  if (Math.round(a.confidence * 100) !== Math.round(b.confidence * 100)) return false
  if (a.predictedFrequencies.length !== b.predictedFrequencies.length) return false
  for (let i = 0; i < a.predictedFrequencies.length; i++) {
    if (Math.round(a.predictedFrequencies[i]) !== Math.round(b.predictedFrequencies[i])) return false
  }
  return true
}

function publishCombPattern(pattern: CombPatternResult | null | undefined): void {
  const normalized = normalizeCombPattern(pattern)
  if (combPatternEquals(lastCombPattern, normalized)) return
  lastCombPattern = normalized
  self.postMessage({ type: 'combPatternUpdate', pattern: normalized } satisfies WorkerOutboundMessage)
}

// ─── Snapshot collection (free tier only) ────────────────────────────────────
// SnapshotCollector is statically imported (line 32) but only instantiated when
// the main thread sends 'enableCollection'. Dynamic import() was removed because
// it silently fails in Webpack worker contexts (PR #89).

let snapshotCollector: SnapshotCollector | null = null

// ─── Room dimension estimation ───────────────────────────────────────────────
// Accumulates stable peaks during measurement mode, then runs inverse solver.

import { estimateRoomDimensions } from './acousticUtils'
import { ROOM_ESTIMATION } from './constants'
import type { RoomDimensionEstimate } from '@/types/calibration'

interface RoomMeasurementState {
  active: boolean
  startedAt: number
  /** Map of frequency (quantized to 1Hz) → { firstSeen, lastSeen, qEstimate } */
  stablePeaks: Map<number, { firstSeen: number; lastSeen: number; q: number }>
  lastEstimate: RoomDimensionEstimate | null
}

const roomMeasurement: RoomMeasurementState = {
  active: false,
  startedAt: 0,
  stablePeaks: new Map(),
  lastEstimate: null,
}

// ─── Module instances ────────────────────────────────────────────────────────

const trackManager = new TrackManager()
const algorithmEngine = new AlgorithmEngine()
const advisoryManager = new AdvisoryManager()
const decayAnalyzer = new DecayAnalyzer()

/** Per-track comb stability trackers — prevents cross-peak contamination. */
const combTrackers = new Map<string, CombStabilityTracker>()

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
/** Reusable Map for majority-vote label smoothing — avoids per-call allocation */
const _labelVoteMap = new Map<string, number>()

/**
 * Smooth classification label via ring-buffer majority vote.
 * RUNAWAY and GROWING severities bypass smoothing — they're safety-critical.
 */
function smoothClassificationLabel(
  trackId: string,
  newLabel: string,
  severity: string
): string {
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

  // Majority vote over the most recent window
  // Reuse module-level Map to avoid per-call allocation (~60 calls/sec)
  const cap = LABEL_HISTORY_CAPACITY
  const windowSize = CLASSIFICATION_SMOOTHING_FRAMES
  _labelVoteMap.clear()
  for (let k = 0; k < windowSize; k++) {
    const label = ring.labels[(ring.idx - 1 - k + cap) % cap]
    _labelVoteMap.set(label, (_labelVoteMap.get(label) ?? 0) + 1)
  }

  let maxLabel = newLabel
  let maxCount = 0
  for (const [label, count] of _labelVoteMap) {
    if (count > maxCount) {
      maxCount = count
      maxLabel = label
    }
  }
  return maxLabel
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

      algorithmEngine.init(fftSize)
      trackManager.clear()
      combTrackers.clear()
      advisoryManager.reset()
      decayAnalyzer.reset()
      classificationLabelHistory.clear()
      peakProcessCount = 0
      cachedShelves = null
      cachedShelvesFrameId = -1
      lastCombPattern = null

      self.postMessage({ type: 'ready' } satisfies WorkerOutboundMessage)
      break
    }

    case 'updateSettings': {
      settings = { ...settings, ...msg.settings }
      _cachedFusionConfig = null  // Invalidate — rebuilt on next processPeak
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
      algorithmEngine.reset()
      advisoryManager.reset()
      decayAnalyzer.reset()
      classificationLabelHistory.clear()
      peakProcessCount = 0
      cachedShelves = null
      cachedShelvesFrameId = -1
      _cachedFusionConfig = null
      snapshotCollector?.reset()
      publishCombPattern(null)
      break
    }

    // ── Snapshot collection (free tier only) ──────────────────────────────

    case 'enableCollection': {
      try {
        // Always create a new instance — re-enable may carry new sessionId,
        // fftSize, or sampleRate (e.g., device change, session restart).
        if (snapshotCollector) {
          console.debug('[DSP Worker] enableCollection: replacing existing collector')
          snapshotCollector.reset()
        }
        snapshotCollector = new SnapshotCollector(msg.sessionId, msg.fftSize, msg.sampleRate)
        console.debug('[DSP Worker] SnapshotCollector ready')
        const stats = snapshotCollector.getStats()
        self.postMessage({
          type: 'collectionStats',
          bufferSize: stats.bufferSize,
          taggedEvents: stats.taggedEvents,
          bytesCollected: stats.bytesCollected,
        } satisfies WorkerOutboundMessage)
      } catch (err) {
        console.error('[DSP Worker] Failed to create SnapshotCollector:', err)
        snapshotCollector = null
        self.postMessage({
          type: 'error',
          message: `SnapshotCollector init failed: ${err instanceof Error ? err.message : String(err)}`,
        } satisfies WorkerOutboundMessage)
      }
      break
    }

    case 'disableCollection': {
      snapshotCollector = null
      break
    }

    case 'userFeedback': {
      if (snapshotCollector) {
        snapshotCollector.applyUserFeedback(msg.frequencyHz, msg.feedback)
      }
      break
    }

    case 'getSnapshotBatch': {
      if (snapshotCollector?.hasPendingBatches) {
        const batch = snapshotCollector.extractBatch()
        self.postMessage({ type: 'snapshotBatch', batch } satisfies WorkerOutboundMessage)
      } else {
        self.postMessage({ type: 'snapshotBatch', batch: null } satisfies WorkerOutboundMessage)
      }
      break
    }

    case 'startRoomMeasurement': {
      roomMeasurement.active = true
      roomMeasurement.startedAt = Date.now()
      roomMeasurement.stablePeaks.clear()
      roomMeasurement.lastEstimate = null
      break
    }

    case 'stopRoomMeasurement': {
      roomMeasurement.active = false
      // Send final estimate if we have one
      if (roomMeasurement.lastEstimate) {
        self.postMessage({
          type: 'roomEstimate',
          estimate: roomMeasurement.lastEstimate,
        } satisfies WorkerOutboundMessage)
      }
      break
    }

    case 'spectrumUpdate': {
      const suSpectrum = msg.spectrum
      try {
        const changed = algorithmEngine.updateContentType(
          suSpectrum, msg.crestFactor, msg.sampleRate, msg.fftSize
        )
        lastContentType = algorithmEngine.getContentType()
        lastIsCompressed = algorithmEngine.getIsCompressed()
        lastCompressionRatio = algorithmEngine.getCompressionRatio()
        if (changed !== null) {
          self.postMessage({
            type: 'contentTypeUpdate',
            contentType: lastContentType,
            isCompressed: lastIsCompressed,
            compressionRatio: lastCompressionRatio,
          } satisfies WorkerOutboundMessage)
        }
      } finally {
        if (suSpectrum.buffer.byteLength > 0) {
          self.postMessage(
            { type: 'returnBuffers', spectrum: suSpectrum, source: 'spectrumUpdate' } satisfies WorkerOutboundMessage,
            [suSpectrum.buffer as ArrayBuffer]
          )
        }
      }
      break
    }

    case 'processPeak': {
      // Guard: worker must be initialized before processing peaks
      if (!sampleRate || !fftSize) {
        console.warn('[dspWorker] processPeak received before init — ignoring')
        break
      }
      const spectrum = msg.spectrum
      const timeDomain = msg.timeDomain
      try {
      const { peak, sampleRate: sr, fftSize: fft } = msg
      sampleRate = sr
      fftSize = fft

      // Validate frequency bounds
      const minFreq = settings.minFrequency ?? 200
      const maxFreq = settings.maxFrequency ?? 8000
      if (minFreq >= maxFreq) break

      // Process through track manager
      const track = trackManager.processPeak(peak)

      // Feed frame-level buffers (MSD, amplitude, phase — once per frame)
      const skipPhase = algorithmEngine.shouldSkipPhase(
        settings?.adaptivePhaseSkip ?? true,
        settings?.mode ?? 'speech',
      )
      const isNewFrame = algorithmEngine.feedFrame(
        peak.timestamp, spectrum, timeDomain,
        minFreq, maxFreq, sampleRate, fftSize,
        skipPhase,
      )

      if (isNewFrame) {
        peakProcessCount++

        // Periodic pruning (every 50 frames) — prevents unbounded growth
        if (peakProcessCount % 50 === 0) {
          const now = peak.timestamp
          decayAnalyzer.pruneExpired(now)
          advisoryManager.pruneBandCooldowns(now)

          // Prune classification label history and comb trackers for dead tracks
          const activeTrackIds = new Set(trackManager.getActiveTracks().map(t => t.id))
          for (const trackId of classificationLabelHistory.keys()) {
            if (!activeTrackIds.has(trackId)) classificationLabelHistory.delete(trackId)
          }
          for (const trackId of combTrackers.keys()) {
            if (!activeTrackIds.has(trackId)) combTrackers.delete(trackId)
          }
        }

        // Room-mode decay analysis (when room physics active)
        if (peakProcessCount % 50 === 0 && settings?.roomPreset != null && settings.roomPreset !== 'none') {
          const rt60 = settings?.roomRT60 ?? 1.2
          const cooldowns = decayAnalyzer.analyzeDecays(spectrum, rt60, peak.timestamp)
          for (const cd of cooldowns) {
            advisoryManager.setBandCooldown(cd.bandIndex, cd.timestamp)
          }
        }
      }

      // ── Snapshot collection (must run BEFORE finally transfers buffers) ──
      if (snapshotCollector) {
        snapshotCollector.recordFrame(spectrum)
      }

      // Compute algorithm scores for this peak
      const activeTracks = trackManager.getRawTracks()
      const peakFrequencies = activeTracks.map(t => t.trueFrequencyHz)

      // ── Room dimension measurement accumulation ──────────────────────────
      if (roomMeasurement.active) {
        const now = Date.now()
        const elapsed = now - roomMeasurement.startedAt

        // Accumulate stable low-frequency peaks with sufficient Q
        for (const t of activeTracks) {
          if (t.trueFrequencyHz > ROOM_ESTIMATION.MAX_FREQUENCY_HZ) continue
          if ((t.qEstimate ?? 0) < ROOM_ESTIMATION.MIN_Q) continue

          const key = Math.round(t.trueFrequencyHz)
          const existing = roomMeasurement.stablePeaks.get(key)
          if (existing) {
            existing.lastSeen = now
            existing.q = Math.max(existing.q, t.qEstimate ?? 0)
          } else {
            roomMeasurement.stablePeaks.set(key, { firstSeen: now, lastSeen: now, q: t.qEstimate ?? 0 })
          }
        }

        // Filter to peaks that have persisted long enough
        const stableFreqs: number[] = []
        for (const [freq, info] of roomMeasurement.stablePeaks) {
          if (info.lastSeen - info.firstSeen >= ROOM_ESTIMATION.MIN_PERSISTENCE_MS) {
            stableFreqs.push(freq)
          }
        }

        // Send progress every ~500ms (every 25 frames at 50fps)
        if (peakProcessCount % 25 === 0) {
          self.postMessage({
            type: 'roomMeasurementProgress',
            elapsedMs: elapsed,
            stablePeaks: stableFreqs.length,
          } satisfies WorkerOutboundMessage)
        }

        // Attempt estimation once we have enough data
        if (stableFreqs.length >= ROOM_ESTIMATION.MIN_PEAKS && elapsed >= 3000) {
          const estimate = estimateRoomDimensions(stableFreqs)
          if (estimate) {
            roomMeasurement.lastEstimate = estimate
            self.postMessage({
              type: 'roomEstimate',
              estimate,
            } satisfies WorkerOutboundMessage)
          }
        }

        // Auto-stop after accumulation window
        if (elapsed >= ROOM_ESTIMATION.ACCUMULATION_WINDOW_MS) {
          roomMeasurement.active = false
        }
      }

      const algorithmResult = algorithmEngine.computeScores(
        peak, track, spectrum, sampleRate, fftSize, peakFrequencies
      )
      const { algorithmScores } = algorithmResult
      publishCombPattern(algorithmScores.comb ?? null)

      // Worker owns authoritative content type (S7 refactor: temporal metrics +
      // majority-vote smoothing now run in worker via spectrumUpdate).
      // algorithmResult.contentType is instantaneous (no temporal); use as fallback only.
      const contentType = algorithmEngine.getContentType() !== 'unknown'
        ? algorithmEngine.getContentType()
        : algorithmResult.contentType

      // Update worker-side status for UI
      lastContentType = contentType
      lastIsCompressed = algorithmScores.compression?.isCompressed ?? false
      lastCompressionRatio = algorithmScores.compression?.estimatedRatio ?? 1

      // Fuse algorithm results with user-selected mode (cached — rebuilt only on settings change)
      if (!_cachedFusionConfig) {
        _cachedFusionConfig = {
          ...DEFAULT_FUSION_CONFIG,
          mode: settings?.algorithmMode ?? 'auto',
          enabledAlgorithms: settings?.enabledAlgorithms,
          msdMinFrames: getMsdMinFramesForMode(settings?.mode),
          mlEnabled: settings?.mlEnabled ?? true,
        }
      }
      // Get or create per-track comb stability tracker
      // Fix 13 (AI Fight Club): Cap at 256 entries to prevent unbounded growth during broadband transients
      let trackCst = combTrackers.get(track.id)
      if (!trackCst) {
        if (combTrackers.size >= 256) {
          // Emergency prune — remove entries not in active tracks (O(1) per check via Map lookup)
          for (const tid of combTrackers.keys()) {
            if (!trackManager.isActiveTrack(tid)) combTrackers.delete(tid)
          }
        }
        trackCst = new CombStabilityTracker()
        combTrackers.set(track.id, trackCst)
      }
      const fusionResult = fuseAlgorithmResults(
        algorithmScores, contentType, _cachedFusionConfig, track.trueFrequencyHz, trackCst,
        undefined, undefined, // agreementTracker, calibrationTable
        { combSweepOverride: settings.combSweepOverride, ihrGateOverride: settings.ihrGateOverride, ptmrGateOverride: settings.ptmrGateOverride }
      )

      // Feed fusion result back to AlgorithmEngine for ML's next-frame input
      algorithmEngine.updateLastFusion(fusionResult.feedbackProbability, fusionResult.confidence)

      // Classify track with full algorithm context
      const classification = classifyTrackWithAlgorithms(
        track, algorithmScores, fusionResult, settings, peakFrequencies
      )

      // Apply temporal smoothing (RUNAWAY/GROWING bypass automatically)
      const smoothedLabel = smoothClassificationLabel(
        track.id, classification.label, classification.severity
      )
      if (smoothedLabel !== classification.label) {
        classification.label = smoothedLabel as typeof classification.label
        // Remap severity to match the smoothed label — all label types must be handled
        if (smoothedLabel === 'WHISTLE') classification.severity = 'WHISTLE'
        else if (smoothedLabel === 'INSTRUMENT') classification.severity = 'INSTRUMENT'
        else if (smoothedLabel === 'ACOUSTIC_FEEDBACK') classification.severity = 'RESONANCE'
        else if (smoothedLabel === 'POSSIBLE_RING') classification.severity = 'POSSIBLE_RING'
      }

      // ── Mark ALL classified peaks for snapshot collection ──
      // Collect before the reporting gate — ML model needs ring, feedback,
      // instruments, and false positives alike to learn the boundaries.
      if (snapshotCollector) {
        // Extract intermediate algorithm scores for ML training data (v1.1+)
        const markerScores: MarkerAlgorithmScores = {
          msd: algorithmScores.msd?.feedbackScore ?? null,
          phase: algorithmScores.phase?.feedbackScore ?? null,
          spectral: algorithmScores.spectral?.feedbackScore ?? null,
          comb: algorithmScores.comb?.confidence ?? null,
          ihr: algorithmScores.ihr?.feedbackScore ?? null,
          ptmr: algorithmScores.ptmr?.feedbackScore ?? null,
          ml: algorithmScores.ml?.feedbackScore ?? null,
          fusedProbability: fusionResult.feedbackProbability,
          fusedConfidence: fusionResult.confidence,
          modelVersion: algorithmScores.ml?.modelVersion ?? null,
        }
        snapshotCollector.markFeedbackEvent(
          track.trueFrequencyHz,
          track.trueAmplitudeDb,
          classification.severity,
          classification.confidence,
          contentType,
          markerScores
        )
        if (snapshotCollector.hasPendingBatches) {
          const batch = snapshotCollector.extractBatch()
          if (batch) {
            console.debug(`[DSP Worker] Posting snapshot batch: ${batch.snapshots.length} snapshots, event=${batch.event.frequencyHz.toFixed(0)}Hz`)
          }
          self.postMessage({ type: 'snapshotBatch', batch } satisfies WorkerOutboundMessage)
        }
      }

      // Gate on reporting threshold
      if (!shouldReportIssue(classification, settings)) {
        const clearedId = advisoryManager.clearForTrack(track.id)
        if (clearedId) {
          self.postMessage({ type: 'advisoryCleared', advisoryId: clearedId } satisfies WorkerOutboundMessage)
        }
        self.postMessage({ type: 'tracksUpdate', tracks: trackManager.getActiveTracks(), contentType: lastContentType, algorithmMode: settings?.algorithmMode ?? 'auto', isCompressed: lastIsCompressed, compressionRatio: lastCompressionRatio } satisfies WorkerOutboundMessage)
        break
      }

      // Flag harmonics of existing advisories — reduce confidence instead of suppressing.
      // This lets the soft floor system send them as shallow cuts if slots are available.
      const isHarmonic = advisoryManager.isHarmonicOfExisting(track.trueFrequencyHz, settings)
      if (isHarmonic) {
        classification.confidence = Math.min(classification.confidence, 0.35)
      }

      // Compute shelves once per analysis frame (cross-advisory dedup)
      if (cachedShelvesFrameId !== peakProcessCount) {
        cachedShelves = analyzeSpectralTrends(spectrum, sampleRate, fftSize)
        cachedShelvesFrameId = peakProcessCount
      }

      // Generate EQ advisory with pre-computed shelves
      const eqAdvisory = generateEQAdvisory(
        track, classification.severity,
        settings.eqPreset, undefined, undefined, undefined, cachedShelves ?? []
      )

      // Create or update advisory (handles rate limit, band cooldown, dedup)
      const actions = advisoryManager.createOrUpdate(
        track, peak, classification, eqAdvisory, settings
      )

      // Attach algorithm scores and spectral profile to advisory actions
      for (const action of actions) {
        if (action.type === 'advisory') {
          action.advisory.algorithmScores = {
            msd: algorithmScores.msd?.feedbackScore ?? null,
            phase: algorithmScores.phase?.feedbackScore ?? null,
            spectral: algorithmScores.spectral?.feedbackScore ?? null,
            comb: algorithmScores.comb?.confidence ?? null,
            ihr: algorithmScores.ihr?.feedbackScore ?? null,
            ptmr: algorithmScores.ptmr?.feedbackScore ?? null,
            ml: algorithmScores.ml?.feedbackScore ?? null,
            fusedProbability: fusionResult.feedbackProbability,
          }
          // Attach ±1 octave spectral profile around detection for smarter notch decisions
          if (spectrum && spectrum.length > 0) {
            const binHz = sampleRate / fftSize
            const centerBin = Math.round(track.trueFrequencyHz / binHz)
            const lowBin = Math.max(0, Math.round(track.trueFrequencyHz / 2 / binHz))
            const highBin = Math.min(spectrum.length - 1, Math.round(track.trueFrequencyHz * 2 / binHz))
            const profile: number[] = []
            const step = Math.max(1, Math.round((highBin - lowBin) / 32)) // max 32 samples
            for (let i = lowBin; i <= highBin; i += step) {
              profile.push(Math.round(spectrum[i] * 10) / 10)
            }
            action.advisory.spectralProfile = {
              lowHz: Math.round(lowBin * binHz),
              highHz: Math.round(highBin * binHz),
              peakHz: Math.round(centerBin * binHz),
              samples: profile,
              isHarmonic: isHarmonic || false,
            }
          }
        }
        self.postMessage(action satisfies WorkerOutboundMessage)
      }

      // Post tracks update if any advisory was created/updated
      if (actions.length > 0) {
        self.postMessage({ type: 'tracksUpdate', tracks: trackManager.getActiveTracks(), contentType: lastContentType, algorithmMode: settings?.algorithmMode ?? 'auto', isCompressed: lastIsCompressed, compressionRatio: lastCompressionRatio } satisfies WorkerOutboundMessage)
      }

      break
      } finally {
        // Return pooled buffers to main thread via zero-copy transfer
        const returnList: ArrayBuffer[] = []
        if (spectrum.buffer.byteLength > 0) returnList.push(spectrum.buffer as ArrayBuffer)
        if (timeDomain && timeDomain.buffer.byteLength > 0) returnList.push(timeDomain.buffer as ArrayBuffer)
        if (returnList.length > 0) {
          self.postMessage(
            { type: 'returnBuffers', spectrum, timeDomain, source: 'peak' } satisfies WorkerOutboundMessage,
            returnList
          )
        }
      }
    }

    case 'clearPeak': {
      const { binIndex, frequencyHz, timestamp } = msg

      // Clear from track manager and record for decay analysis
      const lastAmplitude = trackManager.clearTrack(binIndex, timestamp)
      if (lastAmplitude !== null) {
        decayAnalyzer.recordDecay(binIndex, lastAmplitude, timestamp, frequencyHz)
      }
      trackManager.pruneInactiveTracks(timestamp)

      // Prune combTrackers for tracks that no longer exist
      for (const trackId of combTrackers.keys()) {
        if (!trackManager.getTrack(trackId)) combTrackers.delete(trackId)
      }
      if (trackManager.getActiveTracks().length < 3) {
        publishCombPattern(null)
      }

      // Clear advisory by frequency (also sets band cooldown)
      const clearedId = advisoryManager.clearByFrequency(frequencyHz, timestamp)
      if (clearedId) {
        self.postMessage({ type: 'advisoryCleared', advisoryId: clearedId } satisfies WorkerOutboundMessage)
      }

      self.postMessage({ type: 'tracksUpdate', tracks: trackManager.getActiveTracks(), contentType: lastContentType, algorithmMode: settings?.algorithmMode ?? 'auto', isCompressed: lastIsCompressed, compressionRatio: lastCompressionRatio } satisfies WorkerOutboundMessage)
      break
    }

    default: {
      // Exhaustiveness check — if a new WorkerInboundMessage variant is added
      // but not handled, TypeScript will error here at compile time.
      const _exhaustive: never = msg
      console.warn('[DSP Worker] Unhandled message type:', (_exhaustive as { type: string }).type)
    }
  }
  } catch (err) {
    // Fix 6 (AI Fight Club): Use trueFrequencyHz (actual field name), not frequency.
    const peakCtx = msg.type === 'processPeak' && 'peak' in msg
      ? ` @ ${(msg as { peak?: { trueFrequencyHz?: number; binIndex?: number } }).peak?.trueFrequencyHz?.toFixed(1)}Hz bin=${(msg as { peak?: { trueFrequencyHz?: number; binIndex?: number } }).peak?.binIndex}`
      : ''
    self.postMessage({ type: 'error', message: `[${msg.type}${peakCtx}] ${err instanceof Error ? err.message : String(err)}` } satisfies WorkerOutboundMessage)
  }
}

export {}
