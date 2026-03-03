/**
 * DSP Worker — runs off the main thread
 * Handles: track management, classification, EQ advisory generation
 * Receives: raw spectrum Float32Array + detected peaks from main thread
 * Sends back: advisory events, track updates, spectrum metadata
 *
 * Usage (main thread):
 *   const worker = new Worker(new URL('./dspWorker.ts', import.meta.url))
 */

import { TrackManager } from './trackManager'
import { classifyTrackWithAlgorithms, shouldReportIssue } from './classifier'
import { generateEQAdvisory } from './eqAdvisor'
import {
  calculateSpectralFlatness,
  analyzeInterHarmonicRatio,
  calculatePTMR,
  fuseAlgorithmResults,
  detectContentType,
} from './advancedDetection'
import type { AlgorithmScores, FusedDetectionResult } from './advancedDetection'
import { generateId } from '@/lib/utils/mathHelpers'
import type {
  Advisory,
  DetectedPeak,
  DetectorSettings,
  TrackedPeak,
} from '@/types/advisory'
import { DEFAULT_SETTINGS } from './constants'

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
  | { type: 'ready' }
  | { type: 'error'; message: string }

// ─── Worker state ────────────────────────────────────────────────────────────

let settings: DetectorSettings = { ...DEFAULT_SETTINGS }
let sampleRate = 48000
let fftSize = 8192

const trackManager = new TrackManager()
const advisories = new Map<string, Advisory>()
const trackToAdvisoryId = new Map<string, string>()

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getSeverityUrgency(severity: string): number {
  switch (severity) {
    case 'RUNAWAY': return 5
    case 'GROWING': return 4
    case 'RESONANCE': return 3
    case 'POSSIBLE_RING': return 2
    case 'WHISTLE': return 1
    case 'INSTRUMENT': return 1
    default: return 0
  }
}

function isHarmonicOfExisting(freqHz: number): boolean {
  // Use the same cents-based tolerance as FeedbackDetector to stay consistent.
  const toleranceCents = settings.harmonicToleranceCents ?? 50
  const MAX_HARMONIC = 8
  for (const advisory of advisories.values()) {
    const fundamental = advisory.trueFrequencyHz
    if (fundamental >= freqHz) continue
    for (let n = 2; n <= MAX_HARMONIC; n++) {
      const harmonic = fundamental * n
      const cents = Math.abs(1200 * Math.log2(freqHz / harmonic))
      if (cents <= toleranceCents) return true
    }
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

// ─── Message handler ─────────────────────────────────────────────────────────

self.onmessage = (event: MessageEvent<WorkerInboundMessage>) => {
  const msg = event.data

  switch (msg.type) {
    case 'init': {
      settings = { ...DEFAULT_SETTINGS, ...msg.settings }
      sampleRate = msg.sampleRate
      fftSize = msg.fftSize
      trackManager.clear()
      advisories.clear()
      trackToAdvisoryId.clear()
      self.postMessage({ type: 'ready' } satisfies WorkerOutboundMessage)
      break
    }

    case 'updateSettings': {
      settings = { ...settings, ...msg.settings }
      break
    }

    case 'reset': {
      trackManager.clear()
      advisories.clear()
      trackToAdvisoryId.clear()
      break
    }

    case 'processPeak': {
      const { peak, spectrum, sampleRate: sr, fftSize: fft } = msg
      sampleRate = sr
      fftSize = fft

      // Process through track manager
      const track = trackManager.processPeak(peak)

      // ── Compute advanced algorithm scores ──────────────────────────────
      const binIndex = peak.binIndex

      // Spectral flatness around the peak
      const spectralResult = calculateSpectralFlatness(spectrum, binIndex)

      // Inter-harmonic ratio (feedback = clean, music = rich harmonics)
      const ihrResult = analyzeInterHarmonicRatio(spectrum, binIndex, sampleRate, fftSize)

      // Peak-to-median ratio (feedback peaks are very sharp)
      const ptmrResult = calculatePTMR(spectrum, binIndex)

      // Assemble algorithm scores
      const algorithmScores: AlgorithmScores = {
        msd: null,    // MSD is computed in feedbackDetector, not available here per-frame
        phase: null,  // Phase disabled (Web Audio API limitation)
        spectral: spectralResult,
        comb: null,   // Comb detection runs on the full peak set, not per-peak
        compression: null,
        ihr: ihrResult,
        ptmr: ptmrResult,
      }

      // Detect content type for fusion weight selection
      const crestFactor = peak.trueAmplitudeDb - (peak.noiseFloorDb ?? -80)
      const contentType = detectContentType(spectrum, crestFactor, spectralResult.flatness)

      // Fuse algorithm results
      const existingScore = peak.prominenceDb > 15 ? 0.7 : peak.prominenceDb > 10 ? 0.5 : 0.3
      const fusionResult: FusedDetectionResult = fuseAlgorithmResults(
        algorithmScores,
        contentType,
        existingScore
      )

      // Enhanced classification with algorithm scores
      const classification = classifyTrackWithAlgorithms(track, algorithmScores, fusionResult, settings)

      // Gate on reporting threshold
      if (!shouldReportIssue(classification, settings)) {
        const existingId = trackToAdvisoryId.get(track.id)
        if (existingId) {
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

      // Dedup within merge tolerance
      const existingId = trackToAdvisoryId.get(track.id)
      if (!existingId) {
        const dup = findDuplicateAdvisory(track.trueFrequencyHz, track.id)
        if (dup) {
          const existingUrgency = getSeverityUrgency(dup.severity)
          const newUrgency = getSeverityUrgency(classification.severity)
          if (newUrgency <= existingUrgency && track.trueAmplitudeDb <= dup.trueAmplitudeDb) break
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
        velocityDbPerSec: track.velocityDbPerSec,
        stabilityCentsStd: track.features.stabilityCentsStd,
        harmonicityScore: track.features.harmonicityScore,
        modulationScore: track.features.modulationScore,
        advisory: eqAdvisory,
        // Enhanced detection fields from acoustic analysis
        modalOverlapFactor: classification.modalOverlapFactor,
        cumulativeGrowthDb: classification.cumulativeGrowthDb,
        frequencyBand: classification.frequencyBand,
      }

      advisories.set(advisoryId, advisory)
      if (!existingId) trackToAdvisoryId.set(track.id, advisoryId)

      self.postMessage({ type: 'advisory', advisory } satisfies WorkerOutboundMessage)
      self.postMessage({ type: 'tracksUpdate', tracks: trackManager.getActiveTracks() } satisfies WorkerOutboundMessage)
      break
    }

    case 'clearPeak': {
      const { binIndex, frequencyHz, timestamp } = msg
      trackManager.clearTrack(binIndex, timestamp)
      trackManager.pruneInactiveTracks(timestamp)

      for (const [trackId, advisoryId] of trackToAdvisoryId.entries()) {
        const advisory = advisories.get(advisoryId)
        if (advisory && Math.abs(advisory.trueFrequencyHz - frequencyHz) < 10) {
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
}

export {}
