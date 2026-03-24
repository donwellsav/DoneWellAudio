// DoneWell Audio Classifier - Distinguishes feedback vs whistle vs instrument
// Enhanced with acoustic research from "Sound Insulation" (Carl Hopkins, 2007)
// Now integrates MSD, Phase Coherence, and Spectral Flatness from advancedDetection.ts

import { CLASSIFIER_WEIGHTS, SEVERITY_THRESHOLDS, SCHROEDER_CONSTANTS, PHPR_SETTINGS, MAINS_HUM_GATE } from './constants'
import type { 
  Track, 
  ClassificationResult, 
  SeverityLevel, 
  IssueLabel, 
  TrackedPeak, 
  DetectorSettings,
} from '@/types/advisory'
import type { AlgorithmScores, FusedDetectionResult } from './advancedDetection'
import {
  calculateSchroederFrequency,
  getFrequencyBand,
  calculateModalOverlap,
  classifyModalOverlap,
  analyzeCumulativeGrowth,
  calculateCalibratedConfidence,
  analyzeVibrato,
  reverberationQAdjustment,
  modalDensityFeedbackAdjustment,
  roomModeProximityPenalty,
  frequencyDependentProminence,
  airAbsorptionCorrectedRT60,
} from './acousticUtils'

// ── Classifier Tuning Constants ─────────────────────────────────────────────
/**
 * Bayesian prior probabilities per class.
 * Feedback prior is elevated (0.45 vs uniform 0.33) because the user has
 * explicitly opened a feedback-detection tool — the base rate of feedback
 * in this context is higher than uniform.  Whistle and instrument share
 * the remainder equally.  Sum ≈ 0.99 (same as the original 3 × 0.33).
 */
const PRIOR_FEEDBACK = 0.45
const PRIOR_WHISTLE = 0.27
const PRIOR_INSTRUMENT = 0.27
const CLUSTERING_BANDWIDTH_MULTIPLIER = 3
const MODE_PRESENCE_BONUS = 0.12
const MODE_ABSENCE_PENALTY = 0.05
const SCHROEDER_TRANSITION_HZ = 12.5

/** Sigmoid weight: ~1 below Schroeder, ~0 above. */
function belowSchroederWeight(freq: number, schroederHz: number): number {
  return 1 / (1 + Math.exp((freq - schroederHz) / SCHROEDER_TRANSITION_HZ))
}

/**
 * Formant gate constants — suppresses sustained vowel false positives.
 * Vocal formants (Fant 1960, "Acoustic Theory of Speech Production"):
 *   F1 ≈ 300–900 Hz (jaw height), F2 ≈ 800–2500 Hz (tongue position),
 *   F3 ≈ 2200–3500 Hz (lip rounding / nasal cavity).
 * Formant peaks have moderate Q (3–20) vs feedback Q (50+).
 * When 2+ active peaks fall in distinct formant bands with the current
 * peak also in a formant band, feedbackProbability is reduced.
 */
/**
 * Chromatic quantization gate — suppresses Auto-Tune false positives.
 * Pitch-corrected audio snaps frequencies to the 12-TET semitone grid,
 * producing artificially high phase coherence that mimics feedback.
 * When a peak sits within ±5 cents of a semitone AND phase coherence
 * exceeds 0.80, the phase boost is scaled by 0.60 (40% reduction).
 * Ref: Bristow-Johnson (2001), "The Equivalence of Various Methods of
 * Computing Biquad Coefficients for Audio Parametric Equalizers".
 */
const CHROMATIC_SNAP_CENTS = 5
const CHROMATIC_PHASE_THRESHOLD = 0.80
const CHROMATIC_PHASE_REDUCTION = 0.60

/**
 * Maximum absolute delta that room-physics adjustments can cumulatively apply
 * to pFeedback. Room cues (RT60, modal density, Schroeder penalty, mode
 * clustering, mode proximity) are correlated — they all derive from Q,
 * frequency, and RT60 — so unbounded stacking can over-suppress.
 */
const MAX_ROOM_DELTA = 0.30

const FORMANT_BANDS = [
  { min: 300, max: 900 },   // F1
  { min: 800, max: 2500 },  // F2
  { min: 2200, max: 3500 }, // F3
] as const
const FORMANT_Q_MIN = 3
const FORMANT_Q_MAX = 20
const FORMANT_MIN_MATCHES = 2     // Need peaks in at least 2 distinct bands
const FORMANT_GATE_MULTIPLIER = 0.65

// Type union for track input
type TrackInput = Track | TrackedPeak

// Helper to normalize input to common interface
function normalizeTrackInput(input: TrackInput) {
  // Check if it's a TrackedPeak (has 'frequency' field) or Track (has 'trueFrequencyHz')
  if ('trueFrequencyHz' in input) {
    return {
      frequencyHz: input.trueFrequencyHz,
      amplitudeDb: input.trueAmplitudeDb,
      onsetDb: input.onsetDb,
      onsetTime: input.onsetTime,
      velocityDbPerSec: input.velocityDbPerSec,
      stabilityCentsStd: input.features.stabilityCentsStd,
      harmonicityScore: input.features.harmonicityScore,
      modulationScore: input.features.modulationScore,
      noiseSidebandScore: input.features.noiseSidebandScore,
      maxVelocityDbPerSec: input.features.maxVelocityDbPerSec,
      minQ: input.features.minQ,
      persistenceMs: input.features.persistenceMs,
      prominenceDb: input.prominenceDb,
      phpr: input.phpr,
    }
  }
  // TrackedPeak
  return {
    frequencyHz: input.frequency,
    amplitudeDb: input.amplitude,
    onsetDb: input.history[0]?.amplitude ?? input.amplitude,
    onsetTime: input.onsetTime,
    velocityDbPerSec: input.features.velocityDbPerSec,
    stabilityCentsStd: input.features.stabilityCentsStd,
    harmonicityScore: input.features.harmonicityScore,
    modulationScore: input.features.modulationScore,
    noiseSidebandScore: 0, // TrackedPeak doesn't have this
    maxVelocityDbPerSec: Math.abs(input.features.velocityDbPerSec),
    minQ: input.qEstimate,
    persistenceMs: input.lastUpdateTime - input.onsetTime,
    prominenceDb: input.prominenceDb,
    phpr: undefined, // TrackedPeak doesn't carry PHPR
  }
}

/**
 * Count how many distinct formant bands contain at least one frequency.
 * Returns the number of unique bands (0–3) that have a matching peak.
 * Ref: Fant (1960), "Acoustic Theory of Speech Production".
 */
function countFormantBands(frequencies: number[]): number {
  let count = 0
  for (const band of FORMANT_BANDS) {
    if (frequencies.some(f => f >= band.min && f <= band.max)) count++
  }
  return count
}

/**
 * Check if a frequency is quantized to the 12-TET semitone grid.
 * Returns true when the frequency is within ±CHROMATIC_SNAP_CENTS of
 * the nearest equal-tempered semitone (A4 = 440 Hz reference).
 * Pitch-corrected audio (Auto-Tune, Melodyne) snaps to this grid.
 */
function isChromaticallyQuantized(frequencyHz: number): boolean {
  if (frequencyHz <= 0) return false
  // Semitones from A4: n = 12 * log2(f / 440)
  const semitones = 12 * Math.log2(frequencyHz / 440)
  // Distance to nearest semitone in cents (1 semitone = 100 cents)
  const centsOffset = Math.abs((semitones - Math.round(semitones)) * 100)
  return centsOffset <= CHROMATIC_SNAP_CENTS
}

/**
 * Detect if a frequency belongs to the AC mains electrical harmonic series.
 * Auto-detects 50 Hz (EU/Asia) vs 60 Hz (NA) by checking which fundamental
 * produces more matching harmonics among the active peaks.
 *
 * HVAC compressors, lighting dimmers, and transformers generate exact integer
 * multiples of the mains frequency (50n or 60n Hz). These persistent, narrow,
 * high-Q, phase-locked tones are indistinguishable from feedback to all six
 * detection algorithms. This gate requires corroborating evidence: the peak
 * must be on a mains harmonic AND 2+ other active peaks must match the same
 * series AND phase coherence must be high (AC-locked signal).
 *
 * @param frequencyHz - The peak frequency to evaluate
 * @param activeFrequencies - All currently active peak frequencies
 * @param phaseCoherence - Phase coherence score for this peak (0–1)
 * @returns Detection result with matched fundamental and corroboration count
 */
function detectMainsHum(
  frequencyHz: number,
  activeFrequencies: number[],
  phaseCoherence: number
): { isHum: boolean; fundamental: number; matchCount: number } {
  const noMatch = { isHum: false, fundamental: 0, matchCount: 0 }

  // Phase coherence must be high — mains hum is AC-locked
  if (phaseCoherence < MAINS_HUM_GATE.PHASE_COHERENCE_THRESHOLD) return noMatch

  const tol = MAINS_HUM_GATE.TOLERANCE_HZ
  let bestFundamental = 0
  let bestCount = 0

  for (const fund of MAINS_HUM_GATE.FUNDAMENTALS) {
    // Check if the current peak is on this mains series
    let onSeries = false
    for (let n = 1; n <= MAINS_HUM_GATE.MAX_HARMONIC; n++) {
      if (Math.abs(frequencyHz - fund * n) <= tol) { onSeries = true; break }
    }
    if (!onSeries) continue

    // Count corroborating peaks (other active peaks also on this series)
    let corroborating = 0
    for (const af of activeFrequencies) {
      if (Math.abs(af - frequencyHz) < 1) continue // skip self
      for (let n = 1; n <= MAINS_HUM_GATE.MAX_HARMONIC; n++) {
        if (Math.abs(af - fund * n) <= tol) { corroborating++; break }
      }
    }

    if (corroborating > bestCount) {
      bestCount = corroborating
      bestFundamental = fund
    }
  }

  return {
    isHum: bestCount >= MAINS_HUM_GATE.MIN_CORROBORATING_PEAKS,
    fundamental: bestFundamental,
    matchCount: bestCount,
  }
}

/**
 * Classify a track as feedback, whistle, or instrument
 * Uses weighted scoring model based on extracted features
 * Enhanced with acoustic research from "Sound Insulation" (Carl Hopkins, 2007)
 */
export function classifyTrack(track: TrackInput, settings?: DetectorSettings, activeFrequencies?: number[]): ClassificationResult {
  const features = normalizeTrackInput(track)
  const reasons: string[] = []

  // ==================== Acoustic Context ====================

  // Gate all room physics behind preset — 'none' means raw detection only
  const roomConfigured = settings?.roomPreset != null && settings.roomPreset !== 'none'

  // Calculate Schroeder frequency for frequency-dependent analysis
  // When room is unconfigured, schroederFreq = 0 so nothing falls in LOW band
  const roomRT60 = settings?.roomRT60 ?? 1.2
  const roomVolume = settings?.roomVolume ?? 500
  const schroederFreq = roomConfigured ? calculateSchroederFrequency(roomRT60, roomVolume) : 0
  
  // Get frequency band and modifiers
  const freqBand = getFrequencyBand(features.frequencyHz, schroederFreq)
  
  // Calculate modal overlap indicator (M = 1/Q, based on textbook Section 1.2.6.7)
  const modalOverlap = calculateModalOverlap(features.minQ)
  const modalAnalysis = classifyModalOverlap(modalOverlap)
  
  // Analyze cumulative growth for slow-building feedback
  const cumulativeGrowth = analyzeCumulativeGrowth(
    features.onsetDb,
    features.amplitudeDb,
    features.persistenceMs
  )

  // Initialize probabilities with context-aware priors
  let pFeedback = PRIOR_FEEDBACK
  let pWhistle = PRIOR_WHISTLE
  let pInstrument = PRIOR_INSTRUMENT

  // ==================== Feature Analysis ====================

  // 1. Stationarity (low pitch variation = feedback)
  // Apply frequency-dependent threshold
  const stabilityThreshold = CLASSIFIER_WEIGHTS.STABILITY_THRESHOLD_CENTS * freqBand.sustainMultiplier
  const stabilityScore = features.stabilityCentsStd < stabilityThreshold ? 1 : 0
  if (stabilityScore > 0) {
    pFeedback += CLASSIFIER_WEIGHTS.STABILITY_FEEDBACK * stabilityScore
    reasons.push(`Pitch stability: ${features.stabilityCentsStd.toFixed(1)} cents std dev`)
  } else {
    // High variation suggests whistle or instrument
    pWhistle += 0.1
    pInstrument += 0.1
  }

  // 2. Harmonicity (coherent harmonics = instrument)
  if (features.harmonicityScore > CLASSIFIER_WEIGHTS.HARMONICITY_THRESHOLD) {
    pInstrument += CLASSIFIER_WEIGHTS.HARMONICITY_INSTRUMENT * features.harmonicityScore
    reasons.push(`Harmonic structure detected: ${(features.harmonicityScore * 100).toFixed(0)}%`)
  }

  // 2b. PHPR (Peak-to-Harmonic Power Ratio) — Van Waterschoot & Moonen 2011
  // Feedback is sinusoidal (no harmonics), music has rich harmonics
  if (features.phpr !== undefined) {
    if (features.phpr >= PHPR_SETTINGS.FEEDBACK_THRESHOLD_DB) {
      pFeedback += PHPR_SETTINGS.CONFIDENCE_BOOST
      reasons.push(`Pure tone (PHPR ${features.phpr.toFixed(0)} dB) — likely feedback`)
    } else if (features.phpr <= PHPR_SETTINGS.MUSIC_THRESHOLD_DB) {
      pInstrument += PHPR_SETTINGS.CONFIDENCE_PENALTY
      reasons.push(`Harmonics present (PHPR ${features.phpr.toFixed(0)} dB) — likely music/speech`)
    }
  }

  // 3. Modulation (vibrato = whistle)
  if (features.modulationScore > CLASSIFIER_WEIGHTS.MODULATION_THRESHOLD) {
    pWhistle += CLASSIFIER_WEIGHTS.MODULATION_WHISTLE * features.modulationScore
    reasons.push(`Vibrato/modulation: ${(features.modulationScore * 100).toFixed(0)}%`)
  }

  // 4. Sideband noise (breath = whistle)
  if (features.noiseSidebandScore > CLASSIFIER_WEIGHTS.SIDEBAND_THRESHOLD) {
    pWhistle += CLASSIFIER_WEIGHTS.SIDEBAND_WHISTLE * features.noiseSidebandScore
    reasons.push(`Breath noise detected: ${(features.noiseSidebandScore * 100).toFixed(0)}%`)
  }

  // 4b. NEW: Enhanced vibrato detection for whistle discrimination
  // Check frequency history for characteristic 4-8 Hz vibrato
  if ('history' in track && Array.isArray(track.history) && track.history.length >= 10) {
    const frequencyHistory = track.history.map((h: { time: number; frequency?: number; freqHz?: number }) => ({
      time: h.time,
      frequency: h.frequency ?? h.freqHz ?? 0,
    }))
    const vibratoAnalysis = analyzeVibrato(frequencyHistory)
    if (vibratoAnalysis.hasVibrato) {
      pWhistle += vibratoAnalysis.whistleProbability
      pFeedback -= vibratoAnalysis.whistleProbability * 0.5 // Reduce feedback probability
      reasons.push(`Vibrato detected: ${vibratoAnalysis.vibratoRateHz?.toFixed(1)}Hz rate, ${vibratoAnalysis.vibratoDepthCents?.toFixed(0)}¢ depth`)
    }
  }

  // 5. Runaway growth (high velocity = feedback)
  // Use settings.growthRateThreshold if provided, otherwise fall back to constant
  const growthThreshold = settings?.growthRateThreshold ?? CLASSIFIER_WEIGHTS.GROWTH_THRESHOLD
  if (features.maxVelocityDbPerSec > growthThreshold) {
    const growthFactor = Math.min(features.maxVelocityDbPerSec / 20, 1)
    pFeedback += CLASSIFIER_WEIGHTS.GROWTH_FEEDBACK * growthFactor
    reasons.push(`Rapid growth: ${features.maxVelocityDbPerSec.toFixed(1)} dB/sec`)
  }

  // 6. Q factor with frequency-dependent threshold
  const qThreshold = SEVERITY_THRESHOLDS.HIGH_Q * freqBand.qThresholdMultiplier
  if (features.minQ > qThreshold) {
    pFeedback += 0.15
    reasons.push(`Narrow Q: ${features.minQ.toFixed(1)} (band: ${freqBand.band})`)
  }

  // Track cumulative room-physics delta for MAX_ROOM_DELTA cap
  let roomDelta = 0

  // 6a. Reverberation-aware Q adjustment (Hopkins §1.2.6.3)
  // Rooms with high RT60 produce naturally high-Q room modes.
  // A peak Q ≤ Q_room = π·f·T₆₀/6.9 is more likely a room mode than feedback.
  // A peak Q >> Q_room is unusually sharp → boost pFeedback.
  // Air absorption correction (Hopkins §1.2.4) shortens effective RT60 at high frequencies.
  // Only applies when room is configured (preset !== 'none')
  if (roomConfigured) {
    const effectiveRT60 = airAbsorptionCorrectedRT60(roomRT60, features.frequencyHz, roomVolume)
    const rt60Adj = reverberationQAdjustment(features.minQ, features.frequencyHz, effectiveRT60)
    if (rt60Adj.delta !== 0) {
      pFeedback += rt60Adj.delta
      roomDelta += rt60Adj.delta
      if (rt60Adj.reason) reasons.push(rt60Adj.reason)
    }
  }

  // 7. Persistence without modulation
  const persistenceThreshold = 1000 * freqBand.sustainMultiplier
  if (features.persistenceMs > persistenceThreshold && features.modulationScore < 0.2) {
    pFeedback += 0.1
    reasons.push(`Sustained without modulation: ${(features.persistenceMs / 1000).toFixed(1)}s`)
  }

  // 8. Modal overlap analysis (from textbook)
  // Isolated modes (M < 0.3) are more likely feedback
  pFeedback += modalAnalysis.feedbackProbabilityBoost
  if (modalAnalysis.classification === 'ISOLATED') {
    reasons.push(`Isolated mode (M=${modalOverlap.toFixed(2)}) - high feedback risk`)
  } else if (modalAnalysis.classification === 'DIFFUSE') {
    reasons.push(`Diffuse field (M=${modalOverlap.toFixed(2)}) - likely room noise`)
  }

  // 8a. Hopkins n(f) modal density adjustment (Eq. 1.77)
  // Sparse modal fields make peaks ambiguous; dense modal fields make sharp
  // peaks stand out as feedback.  Derives from room volume + frequency.
  // Only applies when room is configured (preset !== 'none')
  if (roomConfigured) {
    const nfAdj = modalDensityFeedbackAdjustment(
      features.frequencyHz,
      roomVolume,
      features.minQ
    )
    if (nfAdj.delta !== 0) {
      pFeedback += nfAdj.delta
      roomDelta += nfAdj.delta
      if (nfAdj.note) reasons.push(nfAdj.note)
    }
  }

  // 8b. Mode clustering — 2+ peaks within 3× bandwidth suggest coupled room modes (Hopkins §1.2.6.7)
  if (activeFrequencies && activeFrequencies.length > 1 && features.minQ > 0) {
    const bandwidth3dB = features.frequencyHz / features.minQ
    const clusterRadius = CLUSTERING_BANDWIDTH_MULTIPLIER * bandwidth3dB
    const neighbors = activeFrequencies.filter(f =>
      f !== features.frequencyHz && Math.abs(f - features.frequencyHz) <= clusterRadius
    ).length
    if (neighbors >= 2) {
      pFeedback -= MODE_PRESENCE_BONUS
      reasons.push(`Mode cluster: ${neighbors + 1} peaks within ${clusterRadius.toFixed(0)} Hz — coupled modes`)
    }
  }

  // 9. NEW: Cumulative growth analysis (slow-building feedback)
  if (cumulativeGrowth.shouldAlert) {
    if (cumulativeGrowth.severity === 'RUNAWAY') {
      pFeedback += 0.25
      reasons.push(`Cumulative growth: +${cumulativeGrowth.totalGrowthDb.toFixed(1)}dB (RUNAWAY)`)
    } else if (cumulativeGrowth.severity === 'GROWING') {
      pFeedback += 0.15
      reasons.push(`Cumulative growth: +${cumulativeGrowth.totalGrowthDb.toFixed(1)}dB (growing)`)
    } else if (cumulativeGrowth.severity === 'BUILDING') {
      pFeedback += 0.08
      reasons.push(`Cumulative growth: +${cumulativeGrowth.totalGrowthDb.toFixed(1)}dB (building)`)
    }
  }

  // 10. Frequency band context — Schroeder room-mode penalty
  // PHYSICS (Hopkins §1.2.6): Below the Schroeder frequency individual room
  // modes dominate.  Modal density n(f) ≈ 4π f² V / c³ → very sparse below
  // ~200 Hz.  A sharp peak in this range is more likely to be a room mode
  // than acoustic feedback.
  //
  // Penalty reduced to -0.12 (was -0.25): the old value consumed 76% of the
  // starting pFeedback budget (0.33), making it nearly impossible for low-freq
  // feedback to reach the confidence threshold even with strong positive
  // signals (high MSD, sustained growth, high Q).  The frequency-dependent
  // prominence floor (up to 1.5× via modal density) and the LOW band
  // multipliers (1.4× prominence, 1.5× sustain) already provide robust
  // room-mode filtering without this severe a classifier penalty.
  if (roomConfigured && schroederFreq > 0) {
    const bw = belowSchroederWeight(features.frequencyHz, schroederFreq)
    if (bw > 0.001) {
      const schroederDelta = -MODE_PRESENCE_BONUS * bw
      pFeedback   += schroederDelta
      roomDelta   += schroederDelta
      pInstrument += MODE_ABSENCE_PENALTY * bw
      reasons.push(`Below Schroeder boundary (${schroederFreq.toFixed(0)} Hz, weight ${bw.toFixed(2)}) — possible room mode`)
    }
  }

  // 10a. Room mode proximity — compare against calculated eigenfrequencies
  if (roomConfigured && settings?.roomLengthM > 0 && settings?.roomWidthM > 0 && settings?.roomHeightM > 0) {
    const modeProximity = roomModeProximityPenalty(
      features.frequencyHz,
      settings.roomLengthM,
      settings.roomWidthM,
      settings.roomHeightM,
      roomRT60
    )
    if (modeProximity.delta !== 0) {
      pFeedback += modeProximity.delta
      roomDelta += modeProximity.delta
      if (modeProximity.reason) reasons.push(modeProximity.reason)
    }
  }

  // Room-physics delta cap: clamp cumulative room-only adjustments
  if (roomConfigured && Math.abs(roomDelta) > MAX_ROOM_DELTA) {
    const excess = roomDelta - Math.sign(roomDelta) * MAX_ROOM_DELTA
    pFeedback -= excess
    reasons.push(`Room delta clamped: ${roomDelta.toFixed(3)} to ${MAX_ROOM_DELTA}`)
  }

  // 11. Formant gate — suppress sustained vowel false positives (Fant 1960)
  // When the current peak has moderate Q (vocal tract, not feedback) AND
  // 2+ active peaks fall in distinct formant bands (F1/F2/F3), this is
  // likely a voiced speech segment, not feedback.
  if (
    activeFrequencies && activeFrequencies.length >= FORMANT_MIN_MATCHES &&
    features.minQ >= FORMANT_Q_MIN && features.minQ <= FORMANT_Q_MAX &&
    FORMANT_BANDS.some(b => features.frequencyHz >= b.min && features.frequencyHz <= b.max)
  ) {
    const bandsHit = countFormantBands(activeFrequencies)
    if (bandsHit >= FORMANT_MIN_MATCHES) {
      pFeedback *= FORMANT_GATE_MULTIPLIER
      reasons.push(`Formant gate: ${bandsHit} vocal formant bands active, Q=${features.minQ.toFixed(0)} (speech-like)`)
    }
  }

  // ==================== Normalization ====================

  // Clamp probabilities to valid range before normalization
  pFeedback = Math.max(0, Math.min(1, pFeedback))
  pWhistle = Math.max(0, Math.min(1, pWhistle))
  pInstrument = Math.max(0, Math.min(1, pInstrument))

  const total = pFeedback + pWhistle + pInstrument
  if (total > 0) {
    pFeedback /= total
    pWhistle /= total
    pInstrument /= total
  }

  // Calculate calibrated confidence using new utility
  const calibratedResult = calculateCalibratedConfidence(
    pFeedback,
    pWhistle,
    pInstrument,
    modalAnalysis.feedbackProbabilityBoost,
    cumulativeGrowth.severity
  )

  // F5 fix: apply adjustedPFeedback and renormalize so the posterior
  // and confidence describe the same model state.
  pFeedback = calibratedResult.adjustedPFeedback
  const postCalibTotal = pFeedback + pWhistle + pInstrument
  if (postCalibTotal > 0) {
    pFeedback /= postCalibTotal
    pWhistle /= postCalibTotal
    pInstrument /= postCalibTotal
  }

  const confidence = calibratedResult.confidence
  // pUnknown is computed after severity overrides (below) to maintain posterior consistency

  // ==================== Classification ====================

  let label: IssueLabel
  let severity: SeverityLevel

  // Determine severity based on velocity, cumulative growth, prominence, and other factors
  // Use settings thresholds if provided, otherwise fall back to constants
  const runawayVelocity = SEVERITY_THRESHOLDS.RUNAWAY_VELOCITY
  const growingVelocity = settings?.growthRateThreshold ?? SEVERITY_THRESHOLDS.GROWING_VELOCITY
  const ringThreshold = settings?.ringThresholdDb ?? 5 // Default 5dB prominence for ring
  
  // Priority 1: Check for runaway (instantaneous OR cumulative)
  if (features.maxVelocityDbPerSec >= runawayVelocity || cumulativeGrowth.severity === 'RUNAWAY') {
    severity = 'RUNAWAY'
    pFeedback = Math.max(pFeedback, 0.85) // Runaway almost always feedback
  }
  // Priority 2: Check for growing (instantaneous OR cumulative)
  else if (features.maxVelocityDbPerSec >= growingVelocity || cumulativeGrowth.severity === 'GROWING') {
    severity = 'GROWING'
    pFeedback = Math.max(pFeedback, 0.7)
  }
  // Priority 3: Check cumulative building (slow but steady growth)
  else if (cumulativeGrowth.severity === 'BUILDING') {
    severity = 'GROWING' // Treat as growing for early warning
    reasons.push('Early warning: slow buildup detected')
  }
  // Priority 4: High Q resonance
  else if (features.minQ > qThreshold) {
    severity = 'RESONANCE'
  }
  // Priority 5: Prominent but short-lived = ring
  else if (features.prominenceDb >= ringThreshold && features.persistenceMs < SEVERITY_THRESHOLDS.PERSISTENCE_MS) {
    severity = 'POSSIBLE_RING'
  }
  // Priority 6: Prominent and persisting = resonance
  else if (features.prominenceDb >= ringThreshold) {
    severity = 'RESONANCE'
  }
  // Default: resonance
  else {
    severity = 'RESONANCE'
  }

  // F5: Renormalize after severity overrides so the posterior sums to 1.
  // Severity overrides (e.g. RUNAWAY Math.max(pFeedback, 0.85)) can push
  // the class sum above 1.0 — renormalize to maintain a valid distribution.
  const postSeverityTotal = pFeedback + pWhistle + pInstrument
  if (postSeverityTotal > 1) {
    pFeedback /= postSeverityTotal
    pWhistle /= postSeverityTotal
    pInstrument /= postSeverityTotal
  }
  const pUnknown = Math.max(0, 1 - (pFeedback + pWhistle + pInstrument))

  // Determine label
  if (pWhistle >= CLASSIFIER_WEIGHTS.WHISTLE_THRESHOLD && pWhistle > pFeedback) {
    label = 'WHISTLE'
    severity = 'WHISTLE'
  } else if (pInstrument >= CLASSIFIER_WEIGHTS.INSTRUMENT_THRESHOLD && pInstrument > pFeedback) {
    label = 'INSTRUMENT'
    severity = 'INSTRUMENT'
  } else if (severity === 'POSSIBLE_RING') {
    label = 'POSSIBLE_RING'
  } else {
    label = 'ACOUSTIC_FEEDBACK'
  }

  // Override: Runaway is always feedback
  if (severity === 'RUNAWAY') {
    label = 'ACOUSTIC_FEEDBACK'
  }

  return {
    pFeedback,
    pWhistle,
    pInstrument,
    pUnknown,
    label,
    severity,
    confidence,
    reasons,
    // Enhanced fields from acoustic analysis
    frequencyHz: features.frequencyHz,
    modalOverlapFactor: modalOverlap,
    cumulativeGrowthDb: cumulativeGrowth.totalGrowthDb,
    frequencyBand: freqBand.band,
    confidenceLabel: calibratedResult.confidenceLabel,
    prominenceDb: features.prominenceDb,
  }
}

/**
 * Determine if an issue should be reported based on mode, classification, and confidence
 * Enhanced with confidence threshold filtering to reduce false positives
 */
export function shouldReportIssue(
  classification: ClassificationResult,
  settings: DetectorSettings
): boolean {
  const mode = settings.mode
  const ignoreWhistle = settings.ignoreWhistle ?? true
  const { label, severity, confidence } = classification
  
  // Get confidence threshold from settings (default 0.40 = 40%)
  const confidenceThreshold = settings.confidenceThreshold ?? 0.40

  // Always report runaway regardless of mode or confidence
  if (severity === 'RUNAWAY') {
    return true
  }
  
  // Always report GROWING severity regardless of confidence (early warning)
  if (severity === 'GROWING') {
    return true
  }

  // Filter by confidence threshold (reduces low-confidence alerts)
  if (confidence < confidenceThreshold) {
    return false
  }

  // Frequency-dependent prominence floor — sparse modal regions need higher prominence
  // Uses the actual peak frequency (not a band proxy) so e.g. a 350 Hz peak isn't
  // penalised as heavily as a 100 Hz peak.  Falls back to band midpoints only when
  // the actual frequency isn't available.
  // Only applies when room is configured (preset !== 'none')
  if (settings.roomPreset !== 'none') {
    const baseProminence = settings.prominenceDb ?? 10
    const freq = classification.frequencyHz
      ?? (classification.frequencyBand === 'LOW' ? 200 : classification.frequencyBand === 'HIGH' ? 6000 : 1000)
    const prominenceFloor = frequencyDependentProminence(baseProminence, freq, settings.roomVolume ?? 250)
    if (classification.prominenceDb !== undefined && classification.prominenceDb < prominenceFloor) {
      return false
    }
  }

  // Handle whistle filtering
  if (label === 'WHISTLE' && ignoreWhistle) {
    return false
  }

  // Mode-specific filtering — professional live sound scenarios
  switch (mode) {
    case 'speech':
      // Corporate/conference — report feedback and rings, suppress instruments
      return label !== 'INSTRUMENT'

    case 'worship':
      // House of worship — music-aware, skip instruments during music portions
      return label !== 'INSTRUMENT'

    case 'liveMusic':
      // Live music — only report clear feedback, skip instruments and possible rings
      if (label === 'INSTRUMENT') return false
      if (label === 'POSSIBLE_RING' && confidence < 0.65) return false
      return true

    case 'theater':
      // Theater/drama — report feedback and rings, skip instruments
      return label !== 'INSTRUMENT'

    case 'monitors':
      // Stage monitors — report everything including instruments (could be feedback)
      return true

    case 'ringOut':
      // Calibration — report everything including instruments
      return true

    case 'broadcast':
      // Studio/broadcast — very sensitive, report feedback and rings
      return label !== 'INSTRUMENT'

    case 'outdoor':
      // Outdoor — report feedback and strong rings, skip instruments
      return label !== 'INSTRUMENT'

    default:
      return label === 'ACOUSTIC_FEEDBACK' || label === 'POSSIBLE_RING'
  }
}

/**
 * Get display text for severity level
 */
export function getSeverityText(severity: SeverityLevel): string {
  switch (severity) {
    case 'RUNAWAY': return 'RUNAWAY'
    case 'GROWING': return 'Growing'
    case 'RESONANCE': return 'Resonance'
    case 'POSSIBLE_RING': return 'Ring'
    case 'WHISTLE': return 'Whistle'
    case 'INSTRUMENT': return 'Instrument'
    default: return 'Unknown'
  }
}

// getSeverityUrgency extracted to ./severityUtils — re-exported below for backward compat
export { getSeverityUrgency } from './severityUtils'

// ============================================================================
// ENHANCED CLASSIFICATION WITH ADVANCED ALGORITHMS
// ============================================================================

/**
 * Enhanced classification that incorporates advanced algorithm scores
 * Combines traditional classification with MSD, Phase, and Spectral analysis
 */
export function classifyTrackWithAlgorithms(
  track: Track | TrackedPeak,
  algorithmScores: AlgorithmScores | null,
  fusionResult: FusedDetectionResult | null,
  settings?: DetectorSettings,
  activeFrequencies?: number[]
): ClassificationResult {
  // Get base classification (with active frequencies for mode clustering)
  const baseResult = classifyTrack(track, settings, activeFrequencies)
  
  // If no algorithm scores, return base result
  if (!algorithmScores || !fusionResult) {
    return baseResult
  }
  
  const reasons = [...baseResult.reasons]
  let pFeedback = baseResult.pFeedback
  let pWhistle = baseResult.pWhistle
  let pInstrument = baseResult.pInstrument

  // Extract frequency for chromatic quantization detection
  const trackFreqHz = 'trueFrequencyHz' in track ? track.trueFrequencyHz : track.frequency

  // ==================== Fusion Result (algorithm evidence counted once) ====================
  //
  // Fusion owns the algorithm-level posterior (MSD, phase, spectral, comb,
  // IHR, PTMR, ML). Classifier adds only track/acoustic context.
  // Per-algorithm scores are NOT re-added here to avoid double-counting.

  // Blend track-level base probability toward fusion's algorithm posterior.
  const FUSION_BLEND = 0.6
  pFeedback = pFeedback * (1 - FUSION_BLEND) + fusionResult.feedbackProbability * FUSION_BLEND
  reasons.push(`Fusion: ${(fusionResult.feedbackProbability * 100).toFixed(0)}% (${fusionResult.contributingAlgorithms.join('+')})`)

  // Chromatic quantization gate (classifier-only context, not in fusion)
  if (algorithmScores.phase && algorithmScores.phase.isFeedbackLikely) {
    const chromaticGated =
      algorithmScores.phase.coherence > CHROMATIC_PHASE_THRESHOLD &&
      isChromaticallyQuantized(trackFreqHz)
    if (chromaticGated) {
      pFeedback *= CHROMATIC_PHASE_REDUCTION
      reasons.push(`Chromatic quantization gate: phase reduced`)
    }
  }

  // Compression context (classifier-only)
  if (algorithmScores.compression && algorithmScores.compression.isCompressed) {
    const adjustment = algorithmScores.compression.thresholdMultiplier - 1
    pFeedback = Math.max(0, pFeedback - adjustment * 0.1)
    reasons.push(`Compressed audio (crest: ${algorithmScores.compression.crestFactor.toFixed(1)}dB)`)
  }

  // ==================== Mains Hum Gate ====================
  // AC mains hum creates exact harmonic series at 50n or 60n Hz with high
  // phase coherence (AC-locked). When the current peak sits on a mains
  // harmonic AND 2+ other active peaks corroborate the same series,
  // reduce feedback probability. Auto-detects 50 vs 60 Hz.
  if (activeFrequencies && algorithmScores.phase) {
    const hum = detectMainsHum(
      trackFreqHz,
      activeFrequencies,
      algorithmScores.phase.coherence
    )
    if (hum.isHum) {
      pFeedback *= MAINS_HUM_GATE.GATE_MULTIPLIER
      reasons.push(`Mains hum gate: ${hum.matchCount} peaks match ${hum.fundamental}Hz series`)
    }
  }

  // ==================== Renormalize ====================

  pFeedback = Math.max(0, Math.min(1, pFeedback))
  pWhistle = Math.max(0, Math.min(1, pWhistle))
  pInstrument = Math.max(0, Math.min(1, pInstrument))

  const total = pFeedback + pWhistle + pInstrument
  if (total > 0) {
    pFeedback /= total
    pWhistle /= total
    pInstrument /= total
  }

  // Re-apply severity overrides AFTER normalization — overrides are final
  if (baseResult.severity === 'RUNAWAY') {
    pFeedback = Math.max(pFeedback, 0.85)
  } else if (baseResult.severity === 'GROWING') {
    pFeedback = Math.max(pFeedback, 0.7)
  }

  // Recalculate confidence
  const maxProb = Math.max(pFeedback, pWhistle, pInstrument)
  const confidence = fusionResult
    ? Math.max(fusionResult.confidence, baseResult.confidence, maxProb)
    : Math.max(baseResult.confidence, maxProb)
  const pUnknown = 1 - confidence
  
  // Determine updated label and severity
  let { label, severity } = baseResult
  
  // Override based on new probabilities
  if (pFeedback >= 0.6 && fusionResult?.verdict === 'FEEDBACK') {
    label = 'ACOUSTIC_FEEDBACK'
    if (severity !== 'RUNAWAY' && severity !== 'GROWING') {
      severity = fusionResult.confidence > 0.8 ? 'GROWING' : 'RESONANCE'
    }
  }
  
  return {
    ...baseResult,
    pFeedback,
    pWhistle,
    pInstrument,
    pUnknown,
    label,
    severity,
    confidence,
    reasons,
  }
}

/**
 * Get algorithm contribution summary for display
 */
export function getAlgorithmSummary(scores: AlgorithmScores): string[] {
  const summary: string[] = []
  
  if (scores.msd) {
    const status = scores.msd.isFeedbackLikely ? 'FEEDBACK' : 'OK'
    summary.push(`MSD: ${status} (${(scores.msd.feedbackScore * 100).toFixed(0)}%)`)
  }
  
  if (scores.phase) {
    const status = scores.phase.isFeedbackLikely ? 'LOCKED' : 'RANDOM'
    summary.push(`Phase: ${status} (${(scores.phase.coherence * 100).toFixed(0)}%)`)
  }
  
  if (scores.spectral) {
    const status = scores.spectral.isFeedbackLikely ? 'PURE' : 'BROAD'
    summary.push(`Spectral: ${status} (${scores.spectral.flatness.toFixed(2)})`)
  }
  
  if (scores.comb && scores.comb.hasPattern) {
    summary.push(`Comb: ${scores.comb.matchingPeaks} peaks @ ${scores.comb.fundamentalSpacing?.toFixed(0)}Hz`)
  }
  
  if (scores.ihr) {
    const status = scores.ihr.isFeedbackLike ? 'CLEAN' : scores.ihr.isMusicLike ? 'MUSIC' : 'OK'
    summary.push(`IHR: ${status} (${scores.ihr.interHarmonicRatio.toFixed(2)}, ${scores.ihr.harmonicsFound}h)`)
  }

  if (scores.ptmr) {
    const status = scores.ptmr.isFeedbackLike ? 'SHARP' : 'BROAD'
    summary.push(`PTMR: ${status} (${scores.ptmr.ptmrDb.toFixed(1)}dB)`)
  }

  if (scores.compression && scores.compression.isCompressed) {
    summary.push(`Compressed: ${scores.compression.estimatedRatio.toFixed(1)}:1`)
  }

  return summary
}
