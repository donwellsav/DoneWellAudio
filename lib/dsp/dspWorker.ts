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
import type { FusionConfig } from './advancedDetection'
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
  // Room dimension estimation
  | { type: 'startRoomMeasurement' }
  | { type: 'stopRoomMeasurement' }
  // Snapshot collection messages (free tier only)
  | SnapshotWorkerInbound

export type WorkerOutboundMessage =
  | { type: 'advisory'; advisory: Advisory }
  | { type: 'advisoryCleared'; advisoryId: string }
  | { type: 'tracksUpdate'; tracks: TrackedPeak[]; contentType?: ContentType; algorithmMode?: AlgorithmMode; isCompressed?: boolean; compressionRatio?: number }
  | { type: 'returnBuffers'; spectrum: Float32Array; timeDomain?: Float32Array }
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
  const cap = LABEL_HISTORY_CAPACITY
  const windowSize = CLASSIFICATION_SMOOTHING_FRAMES
  const counts = new Map<string, number>()
  for (let k = 0; k < windowSize; k++) {
    const label = ring.labels[(ring.idx - 1 - k + cap) % cap]
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }

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

      self.postMessage({ type: 'ready' } satisfies WorkerOutboundMessage)
      break
    }

    case 'updateSettings': {
      settings = { ...settings, ...msg.settings }
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
      snapshotCollector?.reset()
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

    case 'processPeak': {
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
      const isNewFrame = algorithmEngine.feedFrame(
        peak.timestamp, spectrum, timeDomain,
        minFreq, maxFreq, sampleRate, fftSize
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

      const { algorithmScores, contentType, existingScore } = algorithmEngine.computeScores(
        peak, track, spectrum, sampleRate, fftSize, peakFrequencies
      )

      // Update worker-side status for UI
      lastContentType = contentType
      lastIsCompressed = algorithmScores.compression?.isCompressed ?? false
      lastCompressionRatio = algorithmScores.compression?.estimatedRatio ?? 1

      // Fuse algorithm results with user-selected mode
      const fusionConfig: FusionConfig = {
        ...DEFAULT_FUSION_CONFIG,
        mode: settings?.algorithmMode ?? 'auto',
        enabledAlgorithms: settings?.enabledAlgorithms,
        msdMinFrames: getMsdMinFramesForMode(settings?.mode),
      }
      // Get or create per-track comb stability tracker
      let trackCst = combTrackers.get(track.id)
      if (!trackCst) {
        trackCst = new CombStabilityTracker()
        combTrackers.set(track.id, trackCst)
      }
      const fusionResult = fuseAlgorithmResults(
        algorithmScores, contentType, existingScore, fusionConfig, track.trueFrequencyHz, trackCst
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

      // Skip harmonics of existing advisories
      if (advisoryManager.isHarmonicOfExisting(track.trueFrequencyHz, settings)) break

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

      // Attach algorithm scores to advisory actions for debug display
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
            { type: 'returnBuffers', spectrum, timeDomain } satisfies WorkerOutboundMessage,
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
    // Include peak context in error messages for better diagnostics
    const peakCtx = msg.type === 'processPeak' && 'peak' in msg
      ? ` @ ${(msg as { peak?: { frequency?: number; binIndex?: number } }).peak?.frequency?.toFixed(1)}Hz bin=${(msg as { peak?: { frequency?: number; binIndex?: number } }).peak?.binIndex}`
      : ''
    self.postMessage({ type: 'error', message: `[${msg.type}${peakCtx}] ${err instanceof Error ? err.message : String(err)}` } satisfies WorkerOutboundMessage)
  }
}

export {}
