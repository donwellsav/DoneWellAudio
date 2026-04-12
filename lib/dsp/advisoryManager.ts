/**
 * advisoryManager.ts — Advisory lifecycle management
 *
 * Owns the advisories Map and handles creation, dedup (frequency proximity +
 * GEQ band), harmonic filtering, rate limiting, and pruning.
 *
 * Returns action descriptors instead of calling postMessage — the
 * orchestrator (dspWorker.ts) handles all worker messaging.
 *
 * Extracted from dspWorker.ts (Batch 4) for maintainability.
 */

import { getSeverityUrgency } from './classifier'
import { generatePEQRecommendation } from './eqAdvisor'
import { generateId } from '@/lib/utils/mathHelpers'
import { BAND_COOLDOWN_MS, MEMORY_LIMITS } from './constants'
import type {
  Advisory,
  ClassificationResult,
  DetectedPeak,
  DetectorSettings,
  EQAdvisory,
  Track,
} from '@/types/advisory'

// ── Action types returned to the orchestrator ─────────────────────────────────

export type AdvisoryAction =
  | { type: 'advisory'; advisory: Advisory }
  | { type: 'advisoryCleared'; advisoryId: string }

// ── Constants ─────────────────────────────────────────────────────────────────

const ADVISORY_RATE_LIMIT_MS = 200
const CLEAR_PEAK_TOLERANCE_CENTS = 100

// ── Advisory Manager ──────────────────────────────────────────────────────────

export class AdvisoryManager {
  private advisories = new Map<string, Advisory>()
  private advisoriesByBand = new Map<number, string>() // GEQ band index → advisory ID
  private trackToAdvisoryId = new Map<string, string>()
  private bandClearedAt = new Map<number, number>()
  private lastAdvisoryCreatedAt = 0

  // ── Lookup methods ────────────────────────────────────────────────────────

  /** Check if a frequency is a harmonic of any existing advisory. */
  isHarmonicOfExisting(freqHz: number, settings: DetectorSettings): boolean {
    const toleranceCents = settings.harmonicToleranceCents ?? 50
    const MAX_HARMONIC = 8
    for (const advisory of this.advisories.values()) {
      const existingHz = advisory.trueFrequencyHz

      // Overtone check — is new peak an overtone of an existing advisory?
      if (existingHz < freqHz) {
        for (let n = 2; n <= MAX_HARMONIC; n++) {
          const harmonic = existingHz * n
          const cents = Math.abs(1200 * Math.log2(freqHz / harmonic))
          if (cents <= toleranceCents) return true
        }
      }
      // Sub-harmonic check removed — fundamental should NOT be suppressed
    }
    return false
  }

  /** Get advisory ID for a track (if one exists). */
  getAdvisoryIdForTrack(trackId: string): string | undefined {
    return this.trackToAdvisoryId.get(trackId)
  }

  // ── Gate failure — clear advisory for a track ─────────────────────────────

  /**
   * Clear the advisory associated with a track (e.g. when classification
   * gate fails).  Returns the cleared advisory ID, or null if none existed.
   */
  clearForTrack(trackId: string): string | null {
    const existingId = this.trackToAdvisoryId.get(trackId)
    if (!existingId) return null

    const deletedAdvisory = this.advisories.get(existingId)
    if (deletedAdvisory?.advisory?.geq?.bandIndex !== undefined) {
      this.advisoriesByBand.delete(deletedAdvisory.advisory.geq.bandIndex)
    }
    this.advisories.delete(existingId)
    this.trackToAdvisoryId.delete(trackId)
    return existingId
  }

  // ── Clear advisory by frequency (from clearPeak message) ──────────────────

  /**
   * Find and clear the advisory closest to the given frequency.
   * Also sets the band cooldown to prevent re-triggering.
   */
  clearByFrequency(frequencyHz: number, timestamp: number): string | null {
    // Find the nearest advisory within tolerance — not just the first match
    let bestTrackId: string | null = null
    let bestAdvisoryId: string | null = null
    let bestCents = Infinity

    for (const [trackId, advisoryId] of this.trackToAdvisoryId.entries()) {
      const advisory = this.advisories.get(advisoryId)
      if (!advisory) continue
      const cents = Math.abs(1200 * Math.log2(advisory.trueFrequencyHz / frequencyHz))
      if (cents <= CLEAR_PEAK_TOLERANCE_CENTS && cents < bestCents) {
        bestCents = cents
        bestTrackId = trackId
        bestAdvisoryId = advisoryId
      }
    }

    if (bestAdvisoryId && bestTrackId) {
      const advisory = this.advisories.get(bestAdvisoryId)!
      if (advisory.advisory?.geq?.bandIndex != null) {
        this.bandClearedAt.set(advisory.advisory.geq.bandIndex, timestamp)
        this.advisoriesByBand.delete(advisory.advisory.geq.bandIndex)
      }
      this.advisories.delete(bestAdvisoryId)
      this.trackToAdvisoryId.delete(bestTrackId)
      return bestAdvisoryId
    }
    return null
  }

  // ── Main advisory creation/update pipeline ────────────────────────────────

  /**
   * Process a classified peak: handle rate limiting, band cooldown, dedup
   * (frequency proximity + GEQ band), and create/update the advisory.
   *
   * Returns a list of actions for the orchestrator to post.
   */
  createOrUpdate(
    track: Track,
    peak: DetectedPeak,
    classification: ClassificationResult,
    eqAdvisory: EQAdvisory,
    settings: DetectorSettings,
  ): AdvisoryAction[] {
    const actions: AdvisoryAction[] = []
    const existingId = this.trackToAdvisoryId.get(track.id)
    let mergedClusterCount = 1
    let mergedClusterMinHz: number | undefined
    let mergedClusterMaxHz: number | undefined

    if (!existingId) {
      // ── New advisory checks ───────────────────────────────────────────

      // Check 0: global rate limiter — safety-critical severities bypass
      if (peak.timestamp - this.lastAdvisoryCreatedAt < ADVISORY_RATE_LIMIT_MS
          && classification.severity !== 'RUNAWAY' && classification.severity !== 'GROWING') {
        return actions // empty = skip
      }

      // Check 1: band cooldown — suppress if this band was recently cleared
      const geqBandIndex = eqAdvisory.geq.bandIndex
      const lastCleared = this.bandClearedAt.get(geqBandIndex)
      if (lastCleared !== undefined && (peak.timestamp - lastCleared) < BAND_COOLDOWN_MS) {
        return actions // band still in cooldown
      }

      // Check 2: cents-based proximity dedup
      const freqDup = this.findDuplicateAdvisory(track.trueFrequencyHz, track.id, settings)

      // Check 3: GEQ band-level dedup — prevents two cards for the same fader
      const bandDup = !freqDup ? this.findAdvisoryForSameBand(geqBandIndex, track.id) : null
      const dup = freqDup ?? bandDup

      if (dup) {
        const existingUrgency = getSeverityUrgency(dup.severity)
        const newUrgency = getSeverityUrgency(classification.severity)
        if (newUrgency <= existingUrgency && track.trueAmplitudeDb <= dup.trueAmplitudeDb) {
          // New peak is less urgent — absorb into existing, bump cluster count + widen Q
          const clusterMinHz = Math.min(dup.clusterMinHz ?? dup.trueFrequencyHz, track.trueFrequencyHz)
          const clusterMaxHz = Math.max(dup.clusterMaxHz ?? dup.trueFrequencyHz, track.trueFrequencyHz)
          const updatedPeq = generatePEQRecommendation(
            track, dup.severity, settings.eqPreset, clusterMinHz, clusterMaxHz,
          )
          const updatedAdvisory: Advisory = {
            ...dup,
            // Escalate confidence and severity if new detection is stronger
            confidence: Math.max(dup.confidence, classification.confidence),
            severity: newUrgency > existingUrgency ? classification.severity : dup.severity,
            clusterCount: (dup.clusterCount ?? 1) + 1,
            clusterMinHz,
            clusterMaxHz,
            advisory: dup.advisory ? { ...dup.advisory, peq: updatedPeq } : dup.advisory,
          }
          this.advisories.set(dup.id, updatedAdvisory)
          this.trackToAdvisoryId.set(track.id, dup.id)
          actions.push({ type: 'advisory', advisory: updatedAdvisory })
          return actions
        }
        // New peak supersedes — carry over cluster count + bounds
        mergedClusterCount = (dup.clusterCount ?? 1) + 1
        mergedClusterMinHz = Math.min(dup.clusterMinHz ?? dup.trueFrequencyHz, track.trueFrequencyHz)
        mergedClusterMaxHz = Math.max(dup.clusterMaxHz ?? dup.trueFrequencyHz, track.trueFrequencyHz)
        if (dup.advisory?.geq?.bandIndex !== undefined) {
          this.advisoriesByBand.delete(dup.advisory.geq.bandIndex)
        }
        this.advisories.delete(dup.id)
        this.trackToAdvisoryId.delete(dup.trackId)
        actions.push({ type: 'advisoryCleared', advisoryId: dup.id })
      }
    }

    // ── Create / update advisory ──────────────────────────────────────────

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
      advisory: mergedClusterMinHz
        ? { ...eqAdvisory, peq: generatePEQRecommendation(track, classification.severity, settings.eqPreset, mergedClusterMinHz, mergedClusterMaxHz) }
        : eqAdvisory,
      modalOverlapFactor: classification.modalOverlapFactor,
      cumulativeGrowthDb: classification.cumulativeGrowthDb,
      frequencyBand: classification.frequencyBand,
      clusterCount: mergedClusterCount > 1 ? mergedClusterCount : undefined,
      clusterMinHz: mergedClusterMinHz,
      clusterMaxHz: mergedClusterMaxHz,
    }

    this.advisories.set(advisoryId, advisory)
    if (eqAdvisory?.geq?.bandIndex !== undefined) {
      this.advisoriesByBand.set(eqAdvisory.geq.bandIndex, advisoryId)
    }
    if (!existingId) {
      this.trackToAdvisoryId.set(track.id, advisoryId)
      this.lastAdvisoryCreatedAt = peak.timestamp
    }

    // ── Prune oldest if exceeding bound ─────────────────────────────────

    if (this.advisories.size > MEMORY_LIMITS.MAX_ADVISORIES) {
      const prunedId = this.pruneOldest(advisoryId)
      if (prunedId) {
        actions.push({ type: 'advisoryCleared', advisoryId: prunedId })
      }
    }

    actions.push({ type: 'advisory', advisory })
    return actions
  }

  // ── Housekeeping ──────────────────────────────────────────────────────────

  /** Set a band cooldown (e.g. from decay analysis detecting room mode). */
  setBandCooldown(bandIndex: number, timestamp: number): void {
    this.bandClearedAt.set(bandIndex, timestamp)
  }

  /** Prune stale band cooldown entries. */
  pruneBandCooldowns(now: number): void {
    for (const [band, ts] of this.bandClearedAt) {
      if (now - ts > BAND_COOLDOWN_MS * 2) this.bandClearedAt.delete(band)
    }
  }

  reset(): void {
    this.advisories.clear()
    this.advisoriesByBand.clear()
    this.trackToAdvisoryId.clear()
    this.bandClearedAt.clear()
    this.lastAdvisoryCreatedAt = 0
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private findDuplicateAdvisory(freqHz: number, excludeTrackId: string, settings: DetectorSettings): Advisory | null {
    const mergeCents = settings.peakMergeCents
    for (const advisory of this.advisories.values()) {
      if (advisory.trackId === excludeTrackId) continue
      const centsDistance = Math.abs(1200 * Math.log2(freqHz / advisory.trueFrequencyHz))
      if (centsDistance <= mergeCents) return advisory
    }
    return null
  }

  private findAdvisoryForSameBand(bandIndex: number, excludeTrackId: string): Advisory | null {
    const advisoryId = this.advisoriesByBand.get(bandIndex)
    if (!advisoryId) return null
    const advisory = this.advisories.get(advisoryId)
    if (!advisory) return null
    if (advisory.trackId === excludeTrackId) return null
    return advisory
  }

  private pruneOldest(excludeId: string): string | null {
    let oldestId: string | null = null
    let oldestTime = Infinity
    for (const [id, adv] of this.advisories) {
      if (id !== excludeId && adv.timestamp < oldestTime) {
        oldestTime = adv.timestamp
        oldestId = id
      }
    }
    if (oldestId) {
      const removed = this.advisories.get(oldestId)
      if (removed?.advisory?.geq?.bandIndex !== undefined) {
        this.advisoriesByBand.delete(removed.advisory.geq.bandIndex)
      }
      this.advisories.delete(oldestId)
      for (const [tid, aid] of this.trackToAdvisoryId) {
        if (aid === oldestId) this.trackToAdvisoryId.delete(tid)
      }
    }
    return oldestId
  }
}
