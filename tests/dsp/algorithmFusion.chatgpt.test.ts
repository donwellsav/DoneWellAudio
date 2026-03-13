/**
 * Algorithm Fusion Tests — ChatGPT-5.4 Scenarios
 *
 * CRITICAL ARCHITECTURAL FINDING:
 *
 * ChatGPT used realistic mixed-signal scores (one algorithm fires,
 * others see noise) instead of optimistic all-agree scores. Every
 * single scenario scored between 0.26 and 0.40 — well below the
 * 0.60 feedbackThreshold needed for 'FEEDBACK' verdict.
 *
 * This reveals that the fusion engine is NOT the primary detection
 * mechanism. Looking at classifier.ts lines 651-656:
 *
 *   if (fusionResult.verdict === 'FEEDBACK' && fusionResult.confidence > 0.7) {
 *     pFeedback = Math.max(pFeedback, fusionResult.feedbackProbability)
 *   }
 *
 * The fusion result only overrides the classifier when verdict='FEEDBACK'
 * (probability >= 0.60 AND confidence >= 0.6) with additional confidence > 0.7.
 *
 * In normal operation with mixed signals, fusion produces 'UNCERTAIN'
 * and the Bayesian feature classifier (stability, harmonicity, Q factor,
 * growth rate, PHPR) does ALL the heavy lifting.
 *
 * The fusion engine is a CONFIRMATION/VETO layer, not the primary detector.
 *
 * This means:
 *   1. Gemini's high-score scenarios test the OVERRIDE path (rare)
 *   2. ChatGPT's realistic scenarios test the NORMAL path (common)
 *   3. Most real-world detection depends on the CLASSIFIER, not fusion
 *   4. Tuning fusion weights mainly affects strong-agreement cases
 *   5. The classifier's own feature weights (CLASSIFIER_WEIGHTS in
 *      constants.ts) may be MORE important to tune than fusion weights
 *
 * References:
 *   - ChatGPT-5.4 vulnerability analysis (March 2026)
 *   - classifier.ts lines 651-661: fusion override logic
 *   - classifier.ts lines 84-414: classifyTrack() Bayesian features
 */

import { describe, it, expect } from 'vitest'
import {
  fuseAlgorithmResults,
  DEFAULT_FUSION_CONFIG,
  type FusionConfig,
} from '@/lib/dsp/algorithmFusion'
import { buildScores, type ScoreInput } from '../helpers/mockAlgorithmScores'

function fuse(
  input: ScoreInput,
  contentType: 'speech' | 'music' | 'compressed' | 'unknown' = 'unknown',
  existingScore: number = 0.5,
  config?: Partial<FusionConfig>
) {
  return fuseAlgorithmResults(
    buildScores(input),
    contentType,
    existingScore,
    { ...DEFAULT_FUSION_CONFIG, ...config }
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// CHATGPT-5.4 VULNERABILITY SCENARIOS — REALISTIC MIXED SIGNALS
//
// Key difference from Gemini: ChatGPT uses realistic scores where typically
// only 1-2 algorithms fire strongly while others see noise. This is how
// real audio actually behaves.
// ═════════════════════════════════════════════════════════════════════════════

describe('ChatGPT-5.4 Scenarios — DEFAULT Profile', () => {
  /**
   * FALSE POSITIVE: Music with comb pattern detected
   * Low MSD (0.05), moderate phase (0.55), spectral (0.45), strong comb (0.70),
   * low IHR (0.15), low PTMR (0.10), moderate existing (0.35).
   *
   * ChatGPT calculated: 0.3725 (raw weighted sum)
   * Note: With comb doubling, totalWeight = 1.08, so normalized = 0.3725/1.08 = 0.345
   * VULNERABILITY: Phase + boosted comb + spectral/existing can beat low MSD.
   * BUT: this is well below 0.60 threshold → verdict will be UNCERTAIN, not FEEDBACK.
   */
  it('FP: music with comb — scores well below threshold (fusion irrelevant)', () => {
    const result = fuse(
      { msd: 0.05, phase: 0.55, spectral: 0.45, comb: 0.70, ihr: 0.15, ptmr: 0.10 },
      'unknown',
      0.35
    )
    console.log(`[GPT DEFAULT FP] comb music: probability=${result.feedbackProbability.toFixed(3)}, confidence=${result.confidence.toFixed(3)}, verdict=${result.verdict}`)
    // ChatGPT's raw sum: 0.3725. After normalization: ~0.345
    // Well below 0.60 threshold → verdict should NOT be FEEDBACK
    expect(result.verdict).not.toBe('FEEDBACK')
    expect(result.feedbackProbability).toBeLessThan(0.50)
  })

  /**
   * FALSE NEGATIVE: Real feedback with only MSD firing
   * Strong MSD (0.90) but weak everything else. Phase (0.10), spectral (0.15),
   * no comb, IHR (0.05), PTMR (0.05), existing (0.10).
   *
   * ChatGPT calculated: 0.3305
   * VULNERABILITY: Early true feedback dominated by MSD alone can't reach
   * threshold when corroboration is weak.
   */
  it('FN: real feedback with only MSD — fusion too low to trigger', () => {
    const result = fuse(
      { msd: 0.90, phase: 0.10, spectral: 0.15, comb: 0, ihr: 0.05, ptmr: 0.05 },
      'unknown',
      0.10
    )
    console.log(`[GPT DEFAULT FN] MSD-only feedback: probability=${result.feedbackProbability.toFixed(3)}, confidence=${result.confidence.toFixed(3)}, verdict=${result.verdict}`)
    // 0.3305 — well below threshold. This validates DA-004.
    // Detection must rely on the classifier's own feature analysis,
    // not on fusion.
    expect(result.feedbackProbability).toBeLessThan(0.50)
    expect(result.verdict).not.toBe('FEEDBACK')
  })
})

describe('ChatGPT-5.4 Scenarios — SPEECH Profile', () => {
  /**
   * FALSE POSITIVE: Sustained musical material in speech mode
   * MSD fires (0.72) because held note has flat envelope. Everything else low.
   *
   * ChatGPT calculated: 0.3585
   * VULNERABILITY: MSD alone is powerful enough to misfire on held/sustained
   * musical material — but NOT powerful enough to reach 0.60.
   * The fusion will produce UNCERTAIN, so detection depends on the classifier.
   */
  it('FP: sustained music in speech mode — fusion too low to matter', () => {
    const result = fuse(
      { msd: 0.72, phase: 0.15, spectral: 0.15, comb: 0, ihr: 0.05, ptmr: 0.10 },
      'speech',
      0.08
    )
    console.log(`[GPT SPEECH FP] sustained music: probability=${result.feedbackProbability.toFixed(3)}, confidence=${result.confidence.toFixed(3)}, verdict=${result.verdict}`)
    expect(result.feedbackProbability).toBeLessThan(0.50)
  })

  /**
   * FALSE NEGATIVE: Real feedback with strong phase lock but weak MSD
   * Phase fires (0.85) but MSD is low (0.25) because feedback just started.
   *
   * ChatGPT calculated: 0.3400
   * VULNERABILITY: Real feedback with strong phase lock misses because
   * phase is underweighted (0.20) relative to MSD (0.40) in SPEECH mode.
   */
  it('FN: phase-locked feedback misses in SPEECH mode', () => {
    const result = fuse(
      { msd: 0.25, phase: 0.85, spectral: 0.35, comb: 0, ihr: 0.10, ptmr: 0.10 },
      'speech',
      0.10
    )
    console.log(`[GPT SPEECH FN] phase-locked: probability=${result.feedbackProbability.toFixed(3)}, confidence=${result.confidence.toFixed(3)}, verdict=${result.verdict}`)
    expect(result.feedbackProbability).toBeLessThan(0.50)
    // This is a DIFFERENT vulnerability than Gemini found.
    // Gemini's SPEECH FN was about limiter-clamped feedback (MSD=0.1, Phase=0.9).
    // ChatGPT's is about early feedback where MSD hasn't caught up yet (MSD=0.25, Phase=0.85).
    // Both root causes are the same: MSD dominance in SPEECH profile.
  })
})

describe('ChatGPT-5.4 Scenarios — MUSIC Profile', () => {
  /**
   * FALSE POSITIVE: Compressed/sustained music with comb pattern
   * Near-zero MSD (0.02), moderate phase (0.55), comb fires (0.65 → doubled).
   *
   * ChatGPT calculated: 0.3860
   * VULNERABILITY: Phase + boosted comb + existing can flag compressed music
   * even with near-zero MSD.
   */
  it('FP: compressed music with comb — below threshold', () => {
    const result = fuse(
      { msd: 0.02, phase: 0.55, spectral: 0.30, comb: 0.65, ihr: 0.20, ptmr: 0.05 },
      'music',
      0.20
    )
    console.log(`[GPT MUSIC FP] compressed comb: probability=${result.feedbackProbability.toFixed(3)}, confidence=${result.confidence.toFixed(3)}, verdict=${result.verdict}`)
    expect(result.feedbackProbability).toBeLessThan(0.50)
  })

  /**
   * FALSE NEGATIVE: True feedback with noisy phase
   * MSD is strong (0.95) but intentionally de-emphasized in MUSIC (0.15 weight).
   * Phase is noisy (0.20).
   *
   * ChatGPT calculated: 0.2825
   * VULNERABILITY: True feedback misses when MSD is de-emphasized AND phase is noisy.
   * This is the LOWEST score across all scenarios — the worst false negative.
   */
  it('FN: true feedback in music mode — worst score of all scenarios', () => {
    const result = fuse(
      { msd: 0.95, phase: 0.20, spectral: 0.20, comb: 0, ihr: 0.10, ptmr: 0.30 },
      'music',
      0.10
    )
    console.log(`[GPT MUSIC FN] noisy phase: probability=${result.feedbackProbability.toFixed(3)}, confidence=${result.confidence.toFixed(3)}, verdict=${result.verdict}`)
    // 0.2825 — the lowest score. Real feedback that the fusion engine
    // COMPLETELY misses. Detection depends entirely on the classifier.
    expect(result.feedbackProbability).toBeLessThan(0.40)
  })
})

describe('ChatGPT-5.4 Scenarios — COMPRESSED Profile', () => {
  /**
   * FALSE POSITIVE: Compressed stationary content with comb
   * Low MSD (0.05), moderate phase (0.50), spectral (0.45), comb fires (0.60).
   *
   * ChatGPT calculated: 0.3965
   * This is the HIGHEST score across all ChatGPT scenarios, but still below 0.40.
   */
  it('FP: compressed stationary with comb — highest GPT score, still below threshold', () => {
    const result = fuse(
      { msd: 0.05, phase: 0.50, spectral: 0.45, comb: 0.60, ihr: 0.15, ptmr: 0.10, compressed: true },
      'unknown',
      0.15
    )
    console.log(`[GPT COMPRESS FP] stationary comb: probability=${result.feedbackProbability.toFixed(3)}, confidence=${result.confidence.toFixed(3)}, verdict=${result.verdict}`)
    expect(result.feedbackProbability).toBeLessThan(0.50)
  })

  /**
   * FALSE NEGATIVE: Real feedback with noisy phase in compressed content
   * Strong MSD (0.95) but phase is noisy/late (0.20). No comb.
   *
   * ChatGPT calculated: 0.2610
   */
  it('FN: early feedback in compressed mode — phase not yet locked', () => {
    const result = fuse(
      { msd: 0.95, phase: 0.20, spectral: 0.20, comb: 0, ihr: 0.10, ptmr: 0.30, compressed: true },
      'unknown',
      0.10
    )
    console.log(`[GPT COMPRESS FN] noisy phase: probability=${result.feedbackProbability.toFixed(3)}, confidence=${result.confidence.toFixed(3)}, verdict=${result.verdict}`)
    expect(result.feedbackProbability).toBeLessThan(0.40)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// THE CRITICAL INSIGHT: Fusion is Confirmation, Not Detection
// ═════════════════════════════════════════════════════════════════════════════

describe('Architectural Insight: Fusion Override Threshold', () => {
  /**
   * The fusion engine only overrides the classifier when:
   *   verdict === 'FEEDBACK' (probability >= 0.60 AND confidence >= 0.6)
   *   AND classifier confidence > 0.7
   *
   * This means fusion must reach 0.60 to have ANY effect on detection.
   * With realistic mixed signals (ChatGPT's approach), fusion rarely
   * reaches 0.60. Detection is driven by the classifier's Bayesian
   * feature model (classifyTrack in classifier.ts).
   *
   * IMPLICATION: The classifier feature weights (CLASSIFIER_WEIGHTS)
   * are MORE important to tune than the fusion weights (FUSION_WEIGHTS).
   */

  it('fusion needs ALL algorithms to agree to reach FEEDBACK verdict', () => {
    // Minimum uniform score needed for all algorithms to reach 0.60
    // With all weights summing to 1.0: if all scores = X, probability = X
    // So X >= 0.60 is needed for FEEDBACK verdict
    const borderline = fuse(
      { msd: 0.60, phase: 0.60, spectral: 0.60, comb: 0, ihr: 0.60, ptmr: 0.60 },
      'unknown',
      0.60
    )
    console.log(`[ARCH] uniform 0.60: probability=${borderline.feedbackProbability.toFixed(3)}, verdict=${borderline.verdict}`)
    expect(borderline.feedbackProbability).toBeCloseTo(0.60, 1)
  })

  it('single strong algorithm cannot reach FEEDBACK alone', () => {
    // MSD at 1.0, everything else at 0.0
    const msdOnly = fuse(
      { msd: 1.0, phase: 0.0, spectral: 0.0, comb: 0, ihr: 0.0, ptmr: 0.0 },
      'unknown',
      0.0
    )
    // MSD weight is 0.30, so max contribution = 0.30
    expect(msdOnly.feedbackProbability).toBeLessThan(0.35)
    expect(msdOnly.verdict).not.toBe('FEEDBACK')
    console.log(`[ARCH] MSD-only: probability=${msdOnly.feedbackProbability.toFixed(3)}, verdict=${msdOnly.verdict}`)
  })

  it('even the two heaviest algorithms together barely reach threshold', () => {
    // MSD (0.30 weight) + Phase (0.25 weight) both at 1.0, rest at 0
    const twoAlgo = fuse(
      { msd: 1.0, phase: 1.0, spectral: 0.0, comb: 0, ihr: 0.0, ptmr: 0.0 },
      'unknown',
      0.0
    )
    // MSD*0.30 + Phase*0.25 = 0.55. Still below 0.60.
    expect(twoAlgo.feedbackProbability).toBeLessThan(0.60)
    expect(twoAlgo.verdict).not.toBe('FEEDBACK')
    console.log(`[ARCH] MSD+Phase only: probability=${twoAlgo.feedbackProbability.toFixed(3)}, verdict=${twoAlgo.verdict}`)
  })

  it('three strong algorithms needed for FEEDBACK verdict', () => {
    // MSD (0.30) + Phase (0.25) + Spectral (0.12) = 0.67 at score=1.0
    // ADV-001: ptmr=0 triggers PTMR breadth gate (×0.80), so provide
    // minimal PTMR support to avoid penalty
    const threeAlgo = fuse(
      { msd: 1.0, phase: 1.0, spectral: 1.0, comb: 0, ihr: 0.0, ptmr: 0.3 },
      'unknown',
      0.0
    )
    // 0.30 + 0.25 + 0.12 = 0.67. Above 0.60.
    expect(threeAlgo.feedbackProbability).toBeGreaterThan(0.60)
    console.log(`[ARCH] MSD+Phase+Spectral: probability=${threeAlgo.feedbackProbability.toFixed(3)}, verdict=${threeAlgo.verdict}`)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// THREE-MODEL COMPARISON SUMMARY
// ═════════════════════════════════════════════════════════════════════════════

describe('Three-Model Score Distribution Comparison', () => {
  /**
   * Summary of fusion scores across all three models:
   *
   * GEMINI (optimistic, all-agree scores):
   *   Range: 0.496 — 0.711
   *   Mean:  ~0.59
   *   Verdict: mix of FEEDBACK, POSSIBLE_FEEDBACK, UNCERTAIN
   *
   * CHATGPT (realistic, mixed-signal scores):
   *   Range: 0.2610 — 0.3965
   *   Mean:  ~0.34
   *   Verdict: always UNCERTAIN or NOT_FEEDBACK
   *
   * IMPLICATION:
   *   - Gemini tests the strong-agreement case (fusion DOES matter)
   *   - ChatGPT tests the normal case (fusion is IRRELEVANT)
   *   - BOTH are needed for complete coverage
   *   - Real detection in normal operation depends on the CLASSIFIER,
   *     not on fusion. Fusion is the confirmation/override layer.
   */
  it('documents the score distribution gap between models', () => {
    // Gemini-style: all algorithms see something
    const geminiStyle = fuse(
      { msd: 0.8, phase: 0.9, spectral: 0.4, comb: 0, ihr: 0.1, ptmr: 0.7 },
      'unknown',
      0.8
    )

    // ChatGPT-style: only one algorithm sees something
    const chatgptStyle = fuse(
      { msd: 0.90, phase: 0.10, spectral: 0.15, comb: 0, ihr: 0.05, ptmr: 0.05 },
      'unknown',
      0.10
    )

    console.log(`[3-MODEL] Gemini-style: ${geminiStyle.feedbackProbability.toFixed(3)} (${geminiStyle.verdict})`)
    console.log(`[3-MODEL] ChatGPT-style: ${chatgptStyle.feedbackProbability.toFixed(3)} (${chatgptStyle.verdict})`)

    // The gap between these two is the "corroboration premium"
    // — the fusion engine rewards agreement, not individual strength
    const gap = geminiStyle.feedbackProbability - chatgptStyle.feedbackProbability
    console.log(`[3-MODEL] Corroboration premium: ${gap.toFixed(3)}`)
    expect(gap).toBeGreaterThan(0.15)
  })
})
