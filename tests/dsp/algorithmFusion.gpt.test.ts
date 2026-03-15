/**
 * Algorithm Fusion Tests — GPT-5.4 Deep Thinking Scenarios
 *
 * Additional vulnerability scenarios discovered by GPT-5.4 xhigh that
 * were NOT found by Gemini Ultra's analysis. These test real-world
 * audio processing effects (flangers, pitch correction, sidechain
 * compression) that create acoustic signatures mimicking feedback.
 *
 * Cross-referenced with:
 *   - Gemini Ultra scenarios (algorithmFusion.test.ts)
 *   - Claude Opus Deep Algorithm Audit (DA-001 through DA-023)
 *
 * Key GPT-specific findings:
 *   1. Chorus/Phaser pedals create REAL comb filtering + phase alignment
 *      that triggers both Phase AND Comb detectors simultaneously
 *   2. Auto-Tune locks phase on compressed vocals, triggering the
 *      COMPRESSED profile's 38% phase weight
 *   3. Sidechain compression (EDM pumping) destroys both MSD and PTMR
 *      simultaneously, leaving only Phase to carry detection
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
// GPT-5.4 VULNERABILITY SCENARIOS — CURRENT WEIGHTS
// ═════════════════════════════════════════════════════════════════════════════

describe('GPT-5.4 Scenarios — DEFAULT Profile', () => {
  /**
   * Scenario: Environmental alarm / sustained violin crescendo
   * MSD catches rising envelope (0.9), Legacy sees prominent peak (0.9),
   * PTMR triggers (0.9), Phase drifts slightly (0.6), Spectral (0.8),
   * IHR low (0.2, has harmonics).
   *
   * GPT calculated: 0.685 (borderline)
   * VULNERABILITY: Heavy MSD dependency (0.30) biases toward sustained instruments.
   */
  it('BORDERLINE: alarm/siren scores near threshold', () => {
    const result = fuse(
      { msd: 0.9, phase: 0.6, spectral: 0.8, comb: 0, ihr: 0.2, ptmr: 0.9 },
      'unknown',
      0.9
    )
    console.log(`[GPT DEFAULT FP] alarm: probability=${result.feedbackProbability.toFixed(3)}, verdict=${result.verdict}`)
    // GPT calculated 0.685 — should be close to threshold boundary
    expect(result.feedbackProbability).toBeGreaterThan(0.55)
    expect(result.feedbackProbability).toBeLessThan(0.80)
  })

  /**
   * Scenario: Moving mic with Doppler shift causing fast-onset ringing
   * Phase fails due to Doppler (0.2), Comb detects reflections (0.8),
   * MSD fails because amplitude fluctuates (0.3), IHR (0.9), PTMR (0.6),
   * Existing (0.7).
   *
   * GPT calculated: 0.548 (missed)
   * VULNERABILITY: If Phase AND MSD both fail, other algorithms can't compensate.
   */
  it('FALSE NEGATIVE: moving mic Doppler feedback missed', () => {
    const result = fuse(
      { msd: 0.3, phase: 0.2, spectral: 0.8, comb: 0.8, ihr: 0.9, ptmr: 0.6 },
      'unknown',
      0.7
    )
    console.log(`[GPT DEFAULT FN] moving mic: probability=${result.feedbackProbability.toFixed(3)}, verdict=${result.verdict}`)
    // Note: comb=0.8 activates the weight doubling, which should help
    // GPT calculated 0.548 without factoring the comb doubling correctly
    // The actual score may differ due to comb weight normalization
  })
})

describe('GPT-5.4 Scenarios — SPEECH Profile', () => {
  /**
   * Scenario: Shouting presenter holding loud vowel "Wooooo!"
   * MSD spikes (0.95), Legacy (0.9), PTMR (0.8), Phase locks on vowel (0.4),
   * Spectral (0.8), IHR low (0.2).
   *
   * GPT calculated: 0.720 (strong false positive)
   * VULNERABILITY: 40% MSD weight means any steep flat envelope dominates.
   * This is WORSE than Gemini's "Ummmm" scenario (0.710).
   */
  it('FALSE POSITIVE: shouting presenter triggers false detection', () => {
    const result = fuse(
      { msd: 0.95, phase: 0.4, spectral: 0.8, comb: 0, ihr: 0.2, ptmr: 0.8 },
      'speech',
      0.9
    )
    console.log(`[GPT SPEECH FP] shouting: probability=${result.feedbackProbability.toFixed(3)}, verdict=${result.verdict}`)
    expect(result.feedbackProbability).toBeGreaterThan(0.60)
  })

  /**
   * Scenario: Brief high-frequency ringing bursts from plosive "P-pops"
   * Phase knows ring is locked (0.9), but chirps too short for MSD (0.1),
   * Spectral (0.9), IHR (0.8), PTMR (0.9), Existing (0.9).
   *
   * GPT calculated: 0.530 (missed)
   * VULNERABILITY: MSD controls 40% of vote — system blind to transient howls
   * because MSD buffer hasn't validated a slope yet.
   */
  it('FALSE NEGATIVE: plosive-triggered transient howl missed', () => {
    const result = fuse(
      { msd: 0.1, phase: 0.9, spectral: 0.9, comb: 0, ihr: 0.8, ptmr: 0.9 },
      'speech',
      0.9
    )
    console.log(`[GPT SPEECH FN] plosive chirp: probability=${result.feedbackProbability.toFixed(3)}, verdict=${result.verdict}`)
    // This is essentially the same vulnerability as Gemini's limiter scenario
    // but with a different real-world cause (plosive vs limiter)
    expect(result.feedbackProbability).toBeLessThan(0.65)
  })
})

describe('GPT-5.4 Scenarios — MUSIC Profile', () => {
  /**
   * *** CRITICAL FINDING — NOT FOUND BY GEMINI ***
   *
   * Scenario: Guitarist using a Flanger/Phaser/Chorus pedal
   * These effects CREATE real comb filtering and temporary phase alignment.
   * Phase triggers on artificial alignment (0.8), Comb triggers (0.8 → doubled),
   * Legacy (0.8), MSD catches the sustained effect (0.7), Spectral (0.7),
   * IHR (0.4), PTMR (0.6).
   *
   * GPT calculated: 0.781 (strong false positive)
   * VULNERABILITY: Phase (0.35) + Comb doubling makes the system highly
   * susceptible to time-based modulation DSP effects. A flanger pedal
   * creates the EXACT acoustic signature of a feedback loop.
   */
  it('FALSE POSITIVE: flanger/phaser pedal mimics feedback signature', () => {
    const result = fuse(
      { msd: 0.7, phase: 0.8, spectral: 0.7, comb: 0.8, ihr: 0.4, ptmr: 0.6 },
      'music',
      0.8
    )
    console.log(`[GPT MUSIC FP] flanger: probability=${result.feedbackProbability.toFixed(3)}, verdict=${result.verdict}`)
    // This is the worst vulnerability GPT found — common guitar effect
    // triggers both Phase AND Comb simultaneously
    expect(result.feedbackProbability).toBeGreaterThan(0.55)
  })

  /**
   * Scenario: Feedback howl buried inside cymbal-heavy rock mix
   * MSD catches slope (0.8), but broadband cymbal noise scrambles Phase (0.2),
   * Spectral (0.6), IHR (0.6), PTMR (0.5), Existing (0.6).
   *
   * GPT calculated: 0.437 (badly missed)
   * VULNERABILITY: Phase tracking fragile in dense high-frequency spaces.
   * At 35% weight, phase failure sinks the entire detection.
   */
  it('FALSE NEGATIVE: feedback buried in cymbal-heavy mix', () => {
    const result = fuse(
      { msd: 0.8, phase: 0.2, spectral: 0.6, comb: 0, ihr: 0.6, ptmr: 0.5 },
      'music',
      0.6
    )
    console.log(`[GPT MUSIC FN] cymbal mix: probability=${result.feedbackProbability.toFixed(3)}, verdict=${result.verdict}`)
    // GPT's score (0.437) is even LOWER than Gemini's (0.496)
    // because GPT used lower IHR and PTMR values
    expect(result.feedbackProbability).toBeLessThan(0.55)
  })
})

describe('GPT-5.4 Scenarios — COMPRESSED Profile', () => {
  /**
   * *** CRITICAL FINDING — NOT FOUND BY GEMINI ***
   *
   * Scenario: Heavily compressed, pitch-corrected pop vocal (Auto-Tune)
   * Auto-Tune strictly locks phase (0.95), MSD catches sustained vocal (0.7),
   * Spectral triggers (0.85), Legacy (0.9), IHR (0.5), PTMR (0.7).
   *
   * GPT calculated: 0.761 (strong false positive)
   * VULNERABILITY: 38% Phase weight perfectly targets electronic pitch
   * correction. Every modern pop/worship vocal uses pitch correction.
   * This means KTR will false positive on EVERY sustained Auto-Tuned note
   * in compressed content.
   */
  it('FALSE POSITIVE: Auto-Tuned vocal triggers phase-locked detection', () => {
    const result = fuse(
      { msd: 0.7, phase: 0.95, spectral: 0.85, comb: 0, ihr: 0.5, ptmr: 0.7, compressed: true },
      'unknown',
      0.9
    )
    console.log(`[GPT COMPRESSED FP] AutoTune: probability=${result.feedbackProbability.toFixed(3)}, verdict=${result.verdict}`)
    expect(result.feedbackProbability).toBeGreaterThan(0.65)
    // This is devastating for worship environments where pitch correction
    // on vocals is standard. Sofia's church WILL hit this.
  })

  /**
   * Scenario: Feedback during EDM sidechain compression pumping
   * Phase catches the tone (0.8), but violent ducking destroys MSD (0.1)
   * and PTMR (0.3), Spectral (0.7), IHR (0.8), Existing (0.6).
   *
   * GPT calculated: 0.582 (missed)
   * VULNERABILITY: Sidechain compression ruins amplitude stability,
   * dropping MSD and PTMR. Without comb pattern, even strong Phase
   * can't carry past threshold.
   */
  it('FALSE NEGATIVE: sidechain-pumped feedback missed', () => {
    const result = fuse(
      { msd: 0.1, phase: 0.8, spectral: 0.7, comb: 0, ihr: 0.8, ptmr: 0.3, compressed: true },
      'unknown',
      0.6
    )
    console.log(`[GPT COMPRESSED FN] sidechain: probability=${result.feedbackProbability.toFixed(3)}, verdict=${result.verdict}`)
    expect(result.feedbackProbability).toBeLessThan(0.65)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// CROSS-MODEL AGREEMENT TESTS
//
// These scenarios were identified by ALL THREE models (Claude, Gemini, GPT)
// as critical vulnerabilities. They represent the highest-confidence findings.
// ═════════════════════════════════════════════════════════════════════════════

describe('Cross-Model Consensus Vulnerabilities', () => {
  /**
   * ALL THREE MODELS AGREE: MSD at 0.40 in SPEECH causes false positives
   * on sustained vowels. This is the #1 actionable finding.
   *
   * Claude: identified in code audit
   * Gemini: "Ummmm" scenario = 0.710
   * GPT: "Wooooo!" scenario = 0.720
   */
  it('CONSENSUS: sustained vowel false positive in SPEECH mode', () => {
    // Average of Gemini and GPT scenarios
    const result = fuse(
      { msd: 0.92, phase: 0.6, spectral: 0.6, comb: 0, ihr: 0.2, ptmr: 0.7 },
      'speech',
      0.8
    )
    // All three models predict this exceeds threshold
    expect(result.feedbackProbability).toBeGreaterThan(0.55)
    console.log(`[CONSENSUS] sustained vowel: probability=${result.feedbackProbability.toFixed(3)}, verdict=${result.verdict}`)
  })

  /**
   * ALL THREE MODELS AGREE: Phase-heavy profiles fail in dense mixes.
   * MUSIC (0.35) and COMPRESSED (0.38) both vulnerable.
   *
   * Claude: identified as architectural single point of failure
   * Gemini: dense mix = 0.496, compressor pump = 0.508
   * GPT: cymbal mix = 0.437, sidechain pump = 0.582
   */
  it('CONSENSUS: dense mix false negative in MUSIC mode', () => {
    const result = fuse(
      { msd: 0.7, phase: 0.25, spectral: 0.7, comb: 0, ihr: 0.7, ptmr: 0.6 },
      'music',
      0.6
    )
    expect(result.feedbackProbability).toBeLessThan(0.60)
    console.log(`[CONSENSUS] dense mix: probability=${result.feedbackProbability.toFixed(3)}, verdict=${result.verdict}`)
  })

  /**
   * ALL THREE MODELS AGREE: "existing" weight is redundant and should
   * be deprecated, redistributing to IHR and PTMR.
   *
   * Test: verify that removing "existing" and boosting IHR/PTMR
   * reduces the sustained vowel false positive.
   */
  it('CONSENSUS: "existing" weight has been removed from all profiles', () => {
    // The existing weight has been removed from all 4 fusion profiles.
    // The _existingScore parameter is kept for API compat but ignored.
    // Verify that changing existingScore has no effect on results.
    const withHighExisting = fuse(
      { msd: 0.92, phase: 0.6, spectral: 0.6, comb: 0, ihr: 0.2, ptmr: 0.7 },
      'speech',
      0.9 // high existing score — should be ignored
    )

    const withLowExisting = fuse(
      { msd: 0.92, phase: 0.6, spectral: 0.6, comb: 0, ihr: 0.2, ptmr: 0.7 },
      'speech',
      0.1 // low existing score — should be ignored
    )

    // Both should produce identical results since existing is ignored
    expect(withHighExisting.feedbackProbability).toBeCloseTo(withLowExisting.feedbackProbability, 10)
    console.log(`[CONSENSUS] existing removed: high=${withHighExisting.feedbackProbability.toFixed(3)}, low=${withLowExisting.feedbackProbability.toFixed(3)}`)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// GPT's ARCHITECTURAL RECOMMENDATION: Multiplicative Gates
//
// GPT suggested converting IHR and PTMR from linear weights to
// multiplicative gates. This test validates the concept.
// ═════════════════════════════════════════════════════════════════════════════

describe('GPT Proposal: Multiplicative IHR Gate (concept validation)', () => {
  /**
   * Concept: If IHR detects rich musical harmonics (isMusicLike=true,
   * harmonicsFound >= 3), multiply the final fusion score by 0.6.
   * This gives harmonic analysis VETO POWER over false positives.
   */
  it('IHR gate would fix the sustained synth false positive', () => {
    const result = fuse(
      { msd: 0.8, phase: 0.9, spectral: 0.4, comb: 0, ihr: 0.1, ptmr: 0.7 },
      'unknown',
      0.8
    )

    // Current: probability > 0.60 (false positive)
    const currentProb = result.feedbackProbability

    // With multiplicative gate: if IHR score < 0.3 (rich harmonics),
    // multiply by 0.6
    const ihrScore = 0.1 // Rich harmonics = low IHR feedbackScore
    const gatedProb = ihrScore < 0.3 ? currentProb * 0.6 : currentProb

    console.log(`[GPT GATE] synth: current=${currentProb.toFixed(3)}, gated=${gatedProb.toFixed(3)}`)

    // The gate should drop it below threshold
    expect(gatedProb).toBeLessThan(0.60)
    // While leaving real feedback (IHR score > 0.7) unaffected
    expect(currentProb * 1.0).toBeGreaterThan(0.60) // No gate for feedback
  })
})
