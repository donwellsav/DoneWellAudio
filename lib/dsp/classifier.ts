// KillTheRing2 Classifier - Distinguishes feedback vs whistle vs instrument
// Enhanced with acoustic research from "Sound Insulation" (Carl Hopkins, 2007)
// Now integrates MSD, Phase Coherence, and Spectral Flatness from advancedDetection.ts

import { CLASSIFIER_WEIGHTS, SEVERITY_THRESHOLDS, SCHROEDER_CONSTANTS } from './constants'
import type { 
  Track, 
  ClassificationResult, 
  SeverityLevel, 
  IssueLabel, 
  TrackedPeak, 
  DetectorSettings,
  AlgorithmScores,
  FusedDetectionResult,
} from '@/types/advisory'
import {
  calculateSchroederFrequency,
  getFrequencyBand,
  calculateModalOverlap,
  classifyModalOverlap,
  analyzeCumulativeGrowth,
  calculateCalibratedConfidence,
  analyzeVibrato,
} from './acousticUtils'

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
  }
}

/**
 * Classify a track as feedback, whistle, or instrument
 * Uses weighted scoring model based on extracted features
 * Enhanced with acoustic research from "Sound Insulation" (Carl Hopkins, 2007)
 */
export function classifyTrack(track: TrackInput, settings?: DetectorSettings): ClassificationResult {
  const features = normalizeTrackInput(track)
  const reasons: string[] = []

  // ==================== Acoustic Context ====================
  
  // Calculate Schroeder frequency for frequency-dependent analysis
  const roomRT60 = settings?.roomRT60 ?? 1.2
  const roomVolume = settings?.roomVolume ?? 500
  const schroederFreq = calculateSchroederFrequency(roomRT60, roomVolume)
  
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

  // Initialize probabilities
  let pFeedback = 0.33
  let pWhistle = 0.33
  let pInstrument = 0.33

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

  // 7. Persistence without modulation
  const persistenceThreshold = 1000 * freqBand.sustainMultiplier
  if (features.persistenceMs > persistenceThreshold && features.modulationScore < 0.2) {
    pFeedback += 0.1
    reasons.push(`Sustained without modulation: ${(features.persistenceMs / 1000).toFixed(1)}s`)
  }

  // 8. NEW: Modal overlap analysis (from textbook)
  // Isolated modes (M < 0.3) are more likely feedback
  pFeedback += modalAnalysis.feedbackProbabilityBoost
  if (modalAnalysis.classification === 'ISOLATED') {
    reasons.push(`Isolated mode (M=${modalOverlap.toFixed(2)}) - high feedback risk`)
  } else if (modalAnalysis.classification === 'DIFFUSE') {
    reasons.push(`Diffuse field (M=${modalOverlap.toFixed(2)}) - likely room noise`)
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

  // 10. NEW: Frequency band context
  if (freqBand.band === 'LOW' && features.frequencyHz < schroederFreq) {
    // Below Schroeder frequency - more likely room mode than feedback
    pFeedback -= 0.1
    pInstrument += 0.05
    reasons.push(`Below Schroeder freq (${schroederFreq.toFixed(0)}Hz) - possible room mode`)
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
  
  const confidence = calibratedResult.confidence
  const pUnknown = 1 - confidence

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
    modalOverlapFactor: modalOverlap,
    cumulativeGrowthDb: cumulativeGrowth.totalGrowthDb,
    frequencyBand: freqBand.band,
    confidenceLabel: calibratedResult.confidenceLabel,
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
  const ignoreWhistle = !settings.musicAware // If music aware, don't filter whistles
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

  // Handle whistle filtering
  if (label === 'WHISTLE' && ignoreWhistle) {
    return false
  }

  // Mode-specific filtering
  switch (mode) {
    case 'feedbackHunt':
      // Report feedback and possible rings, not instruments
      return label !== 'INSTRUMENT'

    case 'vocalRing':
      // Report all issues including possible rings
      return true

    case 'musicAware':
      // Skip instruments (RUNAWAY severity already handled above)
      if (label === 'INSTRUMENT') {
        return false
      }
      return true

    case 'aggressive':
      // Report everything
      return true

    case 'calibration':
      // Report everything including instruments
      return true

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

/**
 * Get urgency level (1-5) for severity
 */
export function getSeverityUrgency(severity: SeverityLevel): number {
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
  settings?: DetectorSettings
): ClassificationResult {
  // Get base classification
  const baseResult = classifyTrack(track, settings)
  
  // If no algorithm scores, return base result
  if (!algorithmScores || !fusionResult) {
    return baseResult
  }
  
  const reasons = [...baseResult.reasons]
  let pFeedback = baseResult.pFeedback
  let pWhistle = baseResult.pWhistle
  let pInstrument = baseResult.pInstrument
  
  // ==================== Integrate Advanced Algorithm Scores ====================
  
  // MSD Analysis
  if (algorithmScores.msd) {
    const msd = algorithmScores.msd
    if (msd.isFeedbackLikely) {
      // Strong MSD indicator - boost feedback probability
      pFeedback = Math.min(1, pFeedback + msd.feedbackScore * 0.2)
      reasons.push(`MSD: ${msd.msd.toFixed(3)} dB²/frame² (${msd.framesAnalyzed} frames)`)
    } else if (msd.feedbackScore < 0.3) {
      // Strong non-feedback indicator
      pFeedback = Math.max(0, pFeedback - 0.15)
      pInstrument = Math.min(1, pInstrument + 0.1)
      reasons.push(`MSD indicates musical content (score: ${(msd.feedbackScore * 100).toFixed(0)}%)`)
    }
  }
  
  // Phase Coherence Analysis - DISABLED
  // NOTE: Web Audio API AnalyserNode.getFloatFrequencyData() only returns magnitude, not phase.
  // The phaseBuffer exists but is never populated. Phase analysis is kept here for future
  // implementation if we add AudioWorklet-based phase extraction.
  // if (algorithmScores.phase) { ... } // DISABLED - no data available
  
  // Spectral Flatness Analysis
  if (algorithmScores.spectral) {
    const spectral = algorithmScores.spectral
    if (spectral.isFeedbackLikely) {
      // Pure tone detected
      pFeedback = Math.min(1, pFeedback + 0.1)
      reasons.push(`Pure tone: flatness ${spectral.flatness.toFixed(3)}, kurtosis ${spectral.kurtosis.toFixed(1)}`)
    } else if (spectral.flatness > 0.2) {
      // Broadband content
      pInstrument = Math.min(1, pInstrument + 0.1)
    }
  }
  
  // Comb Pattern Detection
  if (algorithmScores.comb && algorithmScores.comb.hasPattern) {
    const comb = algorithmScores.comb
    // Comb pattern is a strong indicator of feedback loop
    pFeedback = Math.min(1, pFeedback + comb.confidence * 0.2)
    reasons.push(`Comb pattern: ${comb.matchingPeaks} peaks @ ${comb.fundamentalSpacing?.toFixed(0)}Hz`)
    
    // Add predicted frequencies as a note
    if (comb.predictedFrequencies.length > 0) {
      reasons.push(`Predicted feedback: ${comb.predictedFrequencies.slice(0, 3).map(f => f.toFixed(0)).join(', ')}Hz`)
    }
  }
  
  // Inter-Harmonic Ratio Analysis
  if (algorithmScores.ihr) {
    const ihr = algorithmScores.ihr
    if (ihr.isFeedbackLike) {
      // Clean tone with few harmonics — strong feedback indicator
      pFeedback = Math.min(1, pFeedback + ihr.feedbackScore * 0.15)
      reasons.push(`Clean tone (IHR ${ihr.interHarmonicRatio.toFixed(2)}, ${ihr.harmonicsFound} harmonics)`)
    } else if (ihr.isMusicLike) {
      // Rich harmonic content with inter-harmonic energy — suppress feedback
      pFeedback = Math.max(0, pFeedback - 0.15)
      pInstrument = Math.min(1, pInstrument + 0.15)
      reasons.push(`Musical harmonics (IHR ${ihr.interHarmonicRatio.toFixed(2)}, ${ihr.harmonicsFound} harmonics)`)
    }
  }

  // Peak-to-Median Ratio Analysis
  if (algorithmScores.ptmr) {
    const ptmr = algorithmScores.ptmr
    if (ptmr.isFeedbackLike) {
      // Sharp spectral spike well above local floor — feedback hallmark
      pFeedback = Math.min(1, pFeedback + ptmr.feedbackScore * 0.1)
      reasons.push(`Sharp peak (PTMR ${ptmr.ptmrDb.toFixed(1)} dB above median)`)
    } else if (ptmr.ptmrDb < 8) {
      // Broad spectral energy — likely broadband content, not feedback
      pInstrument = Math.min(1, pInstrument + 0.05)
    }
  }

  // Compression Adjustment
  if (algorithmScores.compression && algorithmScores.compression.isCompressed) {
    const comp = algorithmScores.compression
    // Compressed content needs more careful analysis
    // Apply threshold multiplier from compression detection
    const adjustment = comp.thresholdMultiplier - 1
    pFeedback = Math.max(0, pFeedback - adjustment * 0.1)
    reasons.push(`Compressed audio (crest: ${comp.crestFactor.toFixed(1)}dB)`)
  }
  
  // ==================== Use Fusion Result ====================
  
  // Override with fusion result if it's decisive
  if (fusionResult.verdict === 'FEEDBACK' && fusionResult.confidence > 0.7) {
    pFeedback = Math.max(pFeedback, fusionResult.feedbackProbability)
    if (!reasons.some(r => r.includes('Algorithm fusion'))) {
      reasons.push(`Algorithm fusion: ${(fusionResult.feedbackProbability * 100).toFixed(0)}% (${fusionResult.contributingAlgorithms.join('+')})`)
    }
  } else if (fusionResult.verdict === 'NOT_FEEDBACK' && fusionResult.confidence > 0.7) {
    pFeedback = Math.min(pFeedback, 0.3)
    if (!reasons.some(r => r.includes('Algorithm fusion'))) {
      reasons.push(`Fusion: likely not feedback (${(fusionResult.confidence * 100).toFixed(0)}% confident)`)
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
  
  // Recalculate confidence
  const maxProb = Math.max(pFeedback, pWhistle, pInstrument)
  const confidence = Math.max(baseResult.confidence, fusionResult?.confidence ?? 0, maxProb)
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
  
  // Phase is disabled - no data from Web Audio API
  // if (scores.phase) { ... }
  
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
