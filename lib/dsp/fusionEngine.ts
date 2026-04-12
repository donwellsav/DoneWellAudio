/**
 * Fusion Engine — Core Algorithm Fusion + MINDS + Calibration
 *
 * Combines scores from all detection algorithms into a unified feedback
 * probability with confidence and verdict. Also contains MINDS (adaptive
 * notch depth) and post-gate probability calibration.
 *
 * Extracted from algorithmFusion.ts for maintainability.
 */

import type { AlgorithmMode } from '@/types/advisory'
import { COMPRESSION_SETTINGS } from './constants'
import type { MSDResult } from '@/types/advisory'
import { MSD_CONSTANTS } from './constants'
import type { PhaseCoherenceResult } from './phaseCoherence'
import { PHASE_CONSTANTS } from './phaseCoherence'
import type { SpectralFlatnessResult, CompressionResult } from './compressionDetection'
import type { CombPatternResult } from './combPattern'
import { CombStabilityTracker, COMB_SWEEP_PENALTY } from './combPattern'
import type { InterHarmonicResult, PTMRResult } from './spectralAlgorithms'

// Re-export from canonical source so existing imports from advancedDetection still work
export type { AlgorithmMode } from '@/types/advisory'

// ── Types ────────────────────────────────────────────────────────────────────

/** ML model score result — output of the 7th fusion algorithm */
export interface MLScoreResult {
  /** Probability that this peak is feedback [0, 1] */
  feedbackScore: number
  /** Model confidence / calibration quality [0, 1] */
  modelConfidence: number
  /** True if the model is loaded and produced this score */
  isAvailable: boolean
  /** Model version string for tracking */
  modelVersion: string
}

export interface AlgorithmScores {
  msd: MSDResult | null
  phase: PhaseCoherenceResult | null
  spectral: SpectralFlatnessResult | null
  comb: CombPatternResult | null
  compression: CompressionResult | null
  /** Inter-harmonic ratio analysis — low IHR = feedback, high IHR = music */
  ihr: InterHarmonicResult | null
  /** Peak-to-median ratio — high PTMR = narrow spectral peak (feedback) */
  ptmr: PTMRResult | null
  /** ML meta-model FP filter — 7th fusion algorithm (null if model not loaded) */
  ml: MLScoreResult | null
}

export interface FusedDetectionResult {
  feedbackProbability: number
  confidence: number
  contributingAlgorithms: string[]
  algorithmScores: AlgorithmScores
  verdict: 'FEEDBACK' | 'POSSIBLE_FEEDBACK' | 'NOT_FEEDBACK' | 'UNCERTAIN'
  reasons: string[]
}

export interface FusionConfig {
  mode: AlgorithmMode
  enabledAlgorithms?: string[]
  customWeights?: Partial<typeof FUSION_WEIGHTS.DEFAULT>
  msdMinFrames: number
  phaseThreshold: number
  enableCompressionDetection: boolean
  feedbackThreshold: number
  /** When false, ML algorithm is excluded from all mode branches including Auto. */
  mlEnabled?: boolean
}

export interface MINDSResult {
  suggestedDepthDb: number
  isGrowing: boolean
  recentGradient: number
  confidence: number
  recommendation: string
}

// ── Calibration ─────────────────────────────────────────────────────────────

// 14.3: Post-gate probability calibration types and function
export interface CalibrationBreakpoint { raw: number; calibrated: number }
export interface CalibrationTable { breakpoints: CalibrationBreakpoint[] }
export const IDENTITY_CALIBRATION: CalibrationTable = { breakpoints: [] }

export function calibrateProbability(raw: number, table?: CalibrationTable): number {
  if (!table || table.breakpoints.length === 0) return raw
  const bp = table.breakpoints
  if (raw <= bp[0].raw) return bp[0].calibrated
  if (raw >= bp[bp.length - 1].raw) return bp[bp.length - 1].calibrated
  for (let i = 0; i < bp.length - 1; i++) {
    if (raw >= bp[i].raw && raw <= bp[i + 1].raw) {
      const span = bp[i + 1].raw - bp[i].raw
      if (span === 0) return bp[i].calibrated
      const t = (raw - bp[i].raw) / span
      return bp[i].calibrated + t * (bp[i + 1].calibrated - bp[i].calibrated)
    }
  }
  return raw
}

// ── Agreement Persistence ───────────────────────────────────────────────────

// 14.8: Agreement persistence tracker (EWMA of single-frame agreement)
export class AgreementPersistenceTracker {
  private _ewma = 0
  private _alpha: number
  private _frames = 0
  constructor(alpha = 0.15) { this._alpha = alpha }
  update(agreement: number): void {
    this._frames++
    this._ewma = this._frames === 1 ? agreement : this._alpha * agreement + (1 - this._alpha) * this._ewma
  }
  get persistenceBonus(): number {
    return this._frames >= 4 && this._ewma > 0.6 ? Math.min((this._ewma - 0.6) * 0.15, 0.05) : 0
  }
  get ewma(): number { return this._ewma }
  get frames(): number { return this._frames }
  reset(): void { this._ewma = 0; this._frames = 0 }
}

// ── Module-Level State ──────────────────────────────────────────────────────

/** Module-level fallback — only used when no per-track tracker is provided. */
const combStabilityTracker = new CombStabilityTracker()

/** Pre-allocated buffer for effective scores in fuseAlgorithmResults().
 *  Avoids per-call heap allocation (~500 calls/sec). Max 7 algorithms + 1 spare. */
const _effScores = new Float64Array(8)

/** Pre-allocated mutable weights object — avoids object spread per fusion call (~500/sec).
 *  Only read within the synchronous fuseAlgorithmResults(); no concurrent access in Worker. */
const _weights = { msd: 0, phase: 0, spectral: 0, comb: 0, ihr: 0, ptmr: 0, ml: 0 }
// Pre-allocated Set + algorithm list — reused per call to avoid GC pressure (~500 calls/sec)
const _ALL_ALGORITHMS = ['msd', 'phase', 'spectral', 'comb', 'ihr', 'ptmr', 'ml'] as const
const _active = new Set<string>()

// ── Fusion Weights ──────────────────────────────────────────────────────────

// Three-model consensus (Claude+Gemini+ChatGPT): 'existing' was a legacy
// prominence metric that overlapped with spectral/MSD (double-counting).
// Removed entirely and redistributed to IHR (harmonic discrimination) and
// PTMR (peak shape) — the two novel algorithms measuring unique properties.
export const FUSION_WEIGHTS = {
  DEFAULT: {
    msd: 0.27,
    phase: 0.23,
    spectral: 0.11,
    comb: 0.07,
    ihr: 0.12,
    ptmr: 0.10,
    ml: 0.10,
  },
  // SPEECH MSD reduced from 0.40 to 0.33 (effective 42.1% → ~34.7%)
  // Three-model consensus: 0.40 caused false positives on sustained vowels.
  // Gemini: 'Ummmm' scored 0.710. ChatGPT: 'Wooooo!' scored 0.720.
  // Redistributed to phase (+0.04) and ptmr (+0.03) for better discrimination.
  // ML weight (~10%) redistributed proportionally from all existing algorithms.
  SPEECH: {
    msd: 0.30,
    phase: 0.22,
    spectral: 0.09,
    comb: 0.04,
    ihr: 0.09,
    ptmr: 0.16,
    ml: 0.10,
  },
  // MUSIC MSD reduced from 0.15 to 0.08. DAFx-16 paper reports 22% accuracy
  // on rock music. Giving MSD 15% of the vote means it's wrong 78% of the
  // time but still influencing 15% of the decision. At 0.08, it's a weak
  // corroborator, not a lead vote.
  MUSIC: {
    msd: 0.07,
    phase: 0.32,
    spectral: 0.09,
    comb: 0.07,
    ihr: 0.22,
    ptmr: 0.13,
    ml: 0.10,
  },
  // COMPRESSED phase reduced from 0.38 to 0.30 (effective 41.3% → ~33%)
  // Three-model consensus: single-feature conviction risk. Phase at 41.3%
  // effective could convict on Auto-Tuned vocals (ChatGPT) and
  // pitch-corrected worship content (Gemini).
  // Redistributed to spectral/ihr/ptmr for broader corroboration.
  COMPRESSED: {
    msd: 0.11,
    phase: 0.27,
    spectral: 0.16,
    comb: 0.07,
    ihr: 0.16,
    ptmr: 0.13,
    ml: 0.10,
  },
} as const

export const DEFAULT_FUSION_CONFIG: FusionConfig = {
  mode: 'combined',
  msdMinFrames: MSD_CONSTANTS.MIN_FRAMES_SPEECH,
  phaseThreshold: PHASE_CONSTANTS.HIGH_COHERENCE,
  enableCompressionDetection: true,
  feedbackThreshold: 0.60,
}

// ── Algorithm Fusion ────────────────────────────────────────────────────────

/**
 * Fuse multiple algorithm results into a unified detection score.
 *
 * FLAW 6 FIX: When comb pattern detected, doubles both numerator AND
 * denominator weight so feedbackProbability stays in [0, 1].
 */
export function fuseAlgorithmResults(
  scores: AlgorithmScores,
  contentType: import('@/types/advisory').ContentType = 'unknown',
  config: FusionConfig = DEFAULT_FUSION_CONFIG,
  /** Peak frequency in Hz. When provided, enables frequency-aware scoring. */
  peakFrequencyHz?: number,
  /** Per-track comb stability tracker. Falls back to module-level singleton if not provided. */
  trackCombTracker?: CombStabilityTracker,
  /** Per-track agreement persistence tracker for confidence bonus. */
  agreementTracker?: AgreementPersistenceTracker,
  /** Optional calibration table for post-gate probability mapping. Default is identity. */
  calibrationTable?: CalibrationTable,
  /** Optional gate overrides from DiagnosticsProfile (expert-only). */
  gateOverrides?: { combSweepOverride?: number; ihrGateOverride?: number; ptmrGateOverride?: number },
): FusedDetectionResult {
  const reasons: string[] = []
  const contributingAlgorithms: string[] = []

  // Zero-allocation: copy preset fields into module-level _weights object
  // instead of object spread (~500 calls/sec). Synchronous — no concurrent access risk.
  const preset = scores.compression?.isCompressed
    ? (reasons.push(`Compression detected (ratio ~${scores.compression.estimatedRatio.toFixed(1)}:1)`), FUSION_WEIGHTS.COMPRESSED)
    : contentType === 'speech' ? FUSION_WEIGHTS.SPEECH
    : contentType === 'music' ? FUSION_WEIGHTS.MUSIC
    : FUSION_WEIGHTS.DEFAULT
  _weights.msd = preset.msd
  _weights.phase = preset.phase
  _weights.spectral = preset.spectral
  _weights.comb = preset.comb
  _weights.ihr = preset.ihr
  _weights.ptmr = preset.ptmr
  _weights.ml = preset.ml

  if (config.customWeights) {
    const cw = config.customWeights
    if (cw.msd !== undefined) _weights.msd = cw.msd
    if (cw.phase !== undefined) _weights.phase = cw.phase
    if (cw.spectral !== undefined) _weights.spectral = cw.spectral
    if (cw.comb !== undefined) _weights.comb = cw.comb
    if (cw.ihr !== undefined) _weights.ihr = cw.ihr
    if (cw.ptmr !== undefined) _weights.ptmr = cw.ptmr
    if (cw.ml !== undefined) _weights.ml = cw.ml
  }

  const weights = _weights

  // Perf: reuse module-level Set — avoids new Set() + new string[] per call (~500/sec).
  // Safe because fuseAlgorithmResults runs synchronously in a single worker thread.
  _active.clear()
  switch (config.mode) {
    case 'msd':
      _active.add('msd').add('ihr').add('ptmr').add('ml')
      break
    case 'phase':
      _active.add('phase').add('ihr').add('ptmr').add('ml')
      break
    case 'auto':
      if (scores.msd && scores.msd.framesAnalyzed >= config.msdMinFrames) {
        _active.add('msd')
      }
      _active.add('phase').add('spectral').add('comb').add('ihr').add('ptmr').add('ml')
      break
    case 'custom':
      for (const a of (config.enabledAlgorithms ?? _ALL_ALGORITHMS)) _active.add(a)
      break
    default: // 'combined', 'all'
      for (const a of _ALL_ALGORITHMS) _active.add(a)
      break
  }
  if (config.mlEnabled === false) _active.delete('ml')
  const active = _active

  let weightedSum  = 0
  let totalWeight  = 0
  // F2 fix: collect effective (transformed) scores for agreement/confidence
  // Pre-allocated typed array avoids per-call heap allocation + GC pressure (~500 calls/sec)
  let effCount = 0

  if (active.has('msd') && scores.msd) {
    weightedSum += scores.msd.feedbackScore * weights.msd
    totalWeight += weights.msd
    _effScores[effCount++] = scores.msd.feedbackScore
    contributingAlgorithms.push('MSD')
    if (scores.msd.isFeedbackLikely) {
      reasons.push(`MSD indicates feedback (${scores.msd.msd.toFixed(3)} dB/frame\u00b2)`)
    }
  }

  if (active.has('phase') && scores.phase) {
    // Low-frequency phase suppression: below 200 Hz, FFT phase resolution
    // is too coarse for reliable coherence measurement (8 bins at 50 Hz).
    // Reduce phase influence by 50% to prevent phase noise from tanking
    // detection of low-frequency feedback. Source: Gemini deep-think.
    const phaseScore = (peakFrequencyHz !== undefined && peakFrequencyHz < 200)
      ? scores.phase.feedbackScore * 0.5
      : scores.phase.feedbackScore
    weightedSum += phaseScore * weights.phase
    totalWeight += weights.phase
    _effScores[effCount++] = phaseScore
    contributingAlgorithms.push('Phase')
    if (scores.phase.isFeedbackLikely) {
      reasons.push(`High phase coherence (${(scores.phase.coherence * 100).toFixed(0)}%)`)
    }
  }

  if (active.has('spectral') && scores.spectral) {
    weightedSum += scores.spectral.feedbackScore * weights.spectral
    totalWeight += weights.spectral
    _effScores[effCount++] = scores.spectral.feedbackScore
    contributingAlgorithms.push('Spectral')
    if (scores.spectral.isFeedbackLikely) {
      reasons.push(`Pure tone detected (flatness ${scores.spectral.flatness.toFixed(3)})`)
    }
  }

  // Comb doubling: when acoustic comb pattern detected, comb weight doubles
  // in the numerator only (e.g., 0.08 → 0.16 contribution to weightedSum).
  // Only the base weight is added to totalWeight so other algorithms are NOT
  // diluted. This gives comb a bonus boost without penalizing MSD/phase/etc.
  const cst = trackCombTracker ?? combStabilityTracker
  if (active.has('comb') && scores.comb && scores.comb.hasPattern) {
    // Feed spacing into temporal tracker
    if (scores.comb.fundamentalSpacing != null) {
      cst.push(scores.comb.fundamentalSpacing)
    }

    // Apply sweep penalty: if spacing is drifting, this is likely an effect
    const sweeping = cst.isSweeping
    const combConfidence = sweeping
      ? scores.comb.confidence * (gateOverrides?.combSweepOverride ?? COMB_SWEEP_PENALTY)
      : scores.comb.confidence

    const combWeight = weights.comb * 2
    weightedSum += combConfidence * combWeight
    totalWeight += weights.comb
    _effScores[effCount++] = combConfidence
    contributingAlgorithms.push('Comb')

    const cvStr = cst.length >= 4
      ? `, CV=${cst.cv.toFixed(3)}`
      : ''
    const sweepStr = sweeping ? ' [SWEEPING — effect suppressed]' : ''
    reasons.push(
      `Comb pattern: ${scores.comb.matchingPeaks} peaks, ` +
      `${scores.comb.fundamentalSpacing?.toFixed(0)} Hz spacing` +
      (scores.comb.estimatedPathLength != null
        ? ` (path ~${scores.comb.estimatedPathLength.toFixed(1)} m)`
        : '') +
      cvStr + sweepStr
    )
  } else {
    // No comb pattern this frame — reset tracker to avoid stale history
    cst.reset()
  }

  if (active.has('ihr') && scores.ihr) {
    weightedSum += scores.ihr.feedbackScore * weights.ihr
    totalWeight += weights.ihr
    _effScores[effCount++] = scores.ihr.feedbackScore
    contributingAlgorithms.push('IHR')
    if (scores.ihr.isFeedbackLike) {
      reasons.push(`Clean tone (IHR ${scores.ihr.interHarmonicRatio.toFixed(2)}, ${scores.ihr.harmonicsFound} harmonics)`)
    } else if (scores.ihr.isMusicLike) {
      reasons.push(`Rich harmonics suggest music (IHR ${scores.ihr.interHarmonicRatio.toFixed(2)})`)
    }
  }

  if (active.has('ptmr') && scores.ptmr) {
    weightedSum += scores.ptmr.feedbackScore * weights.ptmr
    totalWeight += weights.ptmr
    _effScores[effCount++] = scores.ptmr.feedbackScore
    contributingAlgorithms.push('PTMR')
    if (scores.ptmr.isFeedbackLike) {
      reasons.push(`Sharp spectral peak (PTMR ${scores.ptmr.ptmrDb.toFixed(1)} dB)`)
    }
  }

  // ML meta-model: 7th algorithm for false positive reduction.
  // Only contributes when model is loaded and available (graceful degradation).
  if (active.has('ml') && scores.ml?.isAvailable) {
    weightedSum += scores.ml.feedbackScore * weights.ml
    totalWeight += weights.ml
    _effScores[effCount++] = scores.ml.feedbackScore
    contributingAlgorithms.push('ML')
    reasons.push(`ML: ${(scores.ml.feedbackScore * 100).toFixed(0)}% (${scores.ml.modelVersion})`)
  }

  let feedbackProbability = totalWeight > 0
    ? Math.min(weightedSum / totalWeight, 1)
    : 0

  // IHR penalty gate: rich harmonic content (>= 3 harmonics) reduces probability
  // by 35%. This converts IHR from a weak linear contributor to a discriminative
  // veto. Musical instruments have rich harmonic series; feedback is a singular tone.
  if (scores.ihr?.isMusicLike === true && (scores.ihr?.harmonicsFound ?? 0) >= 3) {
    feedbackProbability *= (gateOverrides?.ihrGateOverride ?? 0.65)
  }

  // PTMR breadth gate: very broad spectral peak (PTMR < 0.2) is unlikely to be
  // feedback. Reduces probability by 20% to penalize wide-spectrum energy.
  if ((scores.ptmr?.feedbackScore ?? 1) < 0.2) {
    feedbackProbability *= (gateOverrides?.ptmrGateOverride ?? 0.80)
  }

  // 14.3: Apply post-gate calibration (identity by default — zero behavior change)
  feedbackProbability = calibrateProbability(feedbackProbability, calibrationTable)
  // Final clamp — gates can only reduce, but calibration tables can extrapolate beyond [0, 1]
  if (feedbackProbability > 1) feedbackProbability = 1
  else if (feedbackProbability < 0) feedbackProbability = 0

  // Agreement and confidence use effective scores (collected above)
  let _effSum = 0
  for (let i = 0; i < effCount; i++) _effSum += _effScores[i]
  const mean = effCount > 0 ? _effSum / effCount : 0
  let _effVarSum = 0
  for (let i = 0; i < effCount; i++) {
    const d = _effScores[i] - mean
    _effVarSum += d * d
  }
  const variance = effCount > 0 ? _effVarSum / effCount : 0
  const agreement = 1 - Math.sqrt(variance)
  // 14.8: Update agreement tracker and add persistence bonus to confidence
  agreementTracker?.update(agreement)
  const confidence = Math.min(
    feedbackProbability * (0.5 + 0.5 * agreement) + (agreementTracker?.persistenceBonus ?? 0),
    1,
  )

  let verdict: FusedDetectionResult['verdict']
  if (feedbackProbability >= config.feedbackThreshold && confidence >= 0.6) {
    verdict = 'FEEDBACK'
  } else if (feedbackProbability >= config.feedbackThreshold * 0.7 && confidence >= 0.4) {
    verdict = 'POSSIBLE_FEEDBACK'
  } else if (feedbackProbability < 0.3 && confidence >= 0.6) {
    verdict = 'NOT_FEEDBACK'
  } else {
    verdict = 'UNCERTAIN'
  }

  return {
    feedbackProbability,
    confidence,
    contributingAlgorithms,
    algorithmScores: scores,
    verdict,
    reasons,
  }
}

// ── MINDS Algorithm — DAFx-16 ───────────────────────────────────────────────

/**
 * MINDS: MSD-Inspired Notch Depth Setting.
 * Strategy: start shallow (-3 dB), deepen 1 dB at a time until growth stops.
 */
export function calculateMINDS(
  magnitudeHistory: number[],
  currentDepthDb: number = 0,
  framesPerSecond: number = 50
): MINDSResult {
  const minFrames = 3

  if (magnitudeHistory.length < minFrames) {
    return {
      suggestedDepthDb: -3,
      isGrowing: false,
      recentGradient: 0,
      confidence: 0.3,
      recommendation: 'Not enough data yet - try -3 dB notch',
    }
  }

  const n = magnitudeHistory.length
  const gradients: number[] = []
  for (let i = 1; i < n; i++) {
    gradients.push(magnitudeHistory[i] - magnitudeHistory[i - 1])
  }

  const lastGradient  = gradients[gradients.length - 1] || 0
  const prevGradient  = gradients[gradients.length - 2] || 0
  const recentGrads   = gradients.slice(-3)
  const recentGradient = recentGrads.reduce((a, b) => a + b, 0) / recentGrads.length

  const isGrowing = lastGradient > 0.1 && prevGradient > 0.1

  const totalGrowth    = magnitudeHistory[n - 1] - magnitudeHistory[0]
  const durationSec    = n / framesPerSecond
  const growthRateDbPerSec = durationSec > 0 ? totalGrowth / durationSec : 0

  let suggestedDepthDb: number
  let confidence: number
  let recommendation: string

  if (isGrowing) {
    const baseDepth = Math.abs(currentDepthDb) || 3

    if (growthRateDbPerSec > 6) {
      suggestedDepthDb = -Math.min(baseDepth + 6, 18)
      confidence = 0.9
      recommendation = `URGENT: Runaway feedback (${growthRateDbPerSec.toFixed(1)} dB/s) - apply ${suggestedDepthDb} dB notch immediately`
    } else if (growthRateDbPerSec > 3) {
      suggestedDepthDb = -Math.min(baseDepth + 3, 15)
      confidence = 0.85
      recommendation = `Growing feedback (${growthRateDbPerSec.toFixed(1)} dB/s) - suggest ${suggestedDepthDb} dB notch`
    } else if (growthRateDbPerSec > 1) {
      suggestedDepthDb = -Math.min(baseDepth + 2, 12)
      confidence = 0.75
      recommendation = `Slow growth detected - suggest ${suggestedDepthDb} dB notch`
    } else {
      suggestedDepthDb = -Math.min(baseDepth + 1, 9)
      confidence = 0.6
      recommendation = `Minor growth - try ${suggestedDepthDb} dB notch`
    }
  } else {
    if (totalGrowth > 6) {
      suggestedDepthDb = currentDepthDb || -6
      confidence = 0.7
      recommendation = `Level stable at high gain - maintain ${suggestedDepthDb} dB notch`
    } else if (totalGrowth > 3) {
      suggestedDepthDb = currentDepthDb || -4
      confidence = 0.6
      recommendation = `Moderate resonance - suggest ${suggestedDepthDb} dB notch`
    } else {
      suggestedDepthDb = -3
      confidence = 0.5
      recommendation = `Light resonance - try ${suggestedDepthDb} dB notch`
    }
  }

  return { suggestedDepthDb, isGrowing, recentGradient, confidence, recommendation }
}
