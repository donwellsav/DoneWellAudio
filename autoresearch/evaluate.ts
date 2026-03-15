/**
 * Autoresearch Evaluation Script — Kill the Ring
 *
 * Runs all labeled scenarios through the fusion engine and computes a
 * composite loss metric (lower is better).
 *
 * Usage:
 *   npx tsx --tsconfig autoresearch/tsconfig.json autoresearch/evaluate.ts
 *   npx tsx --tsconfig autoresearch/tsconfig.json autoresearch/evaluate.ts --verbose
 *
 * Output:
 *   loss: 1.234567
 *   verdict_loss: 0.456
 *   margin_loss: 0.234
 *   fp_penalty: 0.345
 *   constraint_ok: true
 *   scenarios: 52/60 correct
 */

import { fuseAlgorithmResults, FUSION_WEIGHTS } from '@/lib/dsp/algorithmFusion'
import { buildScores } from '@/tests/helpers/mockAlgorithmScores'
import { SCENARIOS, type Scenario, type FeedbackVerdict } from './scenarios'

// ── Verdict ordering for distance calculation ────────────────────────────────

const VERDICT_ORDER: FeedbackVerdict[] = [
  'NOT_FEEDBACK',
  'UNCERTAIN',
  'POSSIBLE_FEEDBACK',
  'FEEDBACK',
]

function verdictIndex(v: FeedbackVerdict): number {
  return VERDICT_ORDER.indexOf(v)
}

/**
 * Distance between two verdicts (0 = match, 1 = adjacent, 2 = two apart, 3 = opposite)
 */
function verdictDistance(expected: FeedbackVerdict, actual: FeedbackVerdict): number {
  return Math.abs(verdictIndex(expected) - verdictIndex(actual))
}

/**
 * Verdict loss for a single scenario.
 *
 * 0    = correct verdict
 * 0.5  = off by one (e.g., FEEDBACK → POSSIBLE_FEEDBACK)
 * 1.0  = off by two
 * 2.0  = wrong polarity (FEEDBACK → NOT_FEEDBACK or vice versa)
 */
function verdictLoss(expected: FeedbackVerdict, actual: FeedbackVerdict): number {
  const d = verdictDistance(expected, actual)
  if (d === 0) return 0
  if (d === 1) return 0.5
  if (d === 2) return 1.0
  return 2.0 // d === 3
}

/**
 * Margin loss for a single scenario.
 *
 * For TP/FEEDBACK scenarios: want probability well above 0.60 → target 0.75
 * For TN/NOT_FEEDBACK scenarios: want probability well below 0.30 → target 0.25
 * For POSSIBLE_FEEDBACK: want probability in [0.42, 0.60] → target 0.50
 * For UNCERTAIN: want probability in [0.30, 0.42] → target 0.35
 */
function marginLoss(expected: FeedbackVerdict, probability: number): number {
  switch (expected) {
    case 'FEEDBACK':
      return Math.max(0, 0.75 - probability)
    case 'NOT_FEEDBACK':
      return Math.max(0, probability - 0.20)
    case 'POSSIBLE_FEEDBACK':
      return Math.max(0, Math.abs(probability - 0.50) - 0.10)
    case 'UNCERTAIN':
      return Math.max(0, Math.abs(probability - 0.35) - 0.05)
  }
}

/**
 * Check if a result is a false positive (expected non-feedback, got FEEDBACK)
 */
function isFalsePositive(expected: FeedbackVerdict, actual: FeedbackVerdict): boolean {
  const expectedIdx = verdictIndex(expected)
  const actualIdx = verdictIndex(actual)
  // FP = expected is NOT_FEEDBACK or UNCERTAIN, actual is FEEDBACK or POSSIBLE_FEEDBACK
  return expectedIdx <= 1 && actualIdx >= 3
}

// ── Weight constraint validation ─────────────────────────────────────────────

function constraintPenalty(): number {
  let penalty = 0
  const profiles = ['DEFAULT', 'SPEECH', 'MUSIC', 'COMPRESSED'] as const

  for (const key of profiles) {
    const w = FUSION_WEIGHTS[key]
    const values = [w.msd, w.phase, w.spectral, w.comb, w.ihr, w.ptmr]
    const sum = values.reduce((a, b) => a + b, 0)

    // Sum-to-1 constraint (with floating point tolerance)
    const drift = Math.abs(sum - 1.0)
    if (drift > 0.001) {
      penalty += drift * 10.0
    }

    // Range constraint: all weights in [0, 1]
    for (const v of values) {
      if (v < 0 || v > 1) {
        penalty += 100.0 // Hard violation
      }
    }
  }

  return penalty
}

// ── Main evaluation ──────────────────────────────────────────────────────────

interface ScenarioResult {
  scenario: Scenario
  probability: number
  confidence: number
  actualVerdict: FeedbackVerdict
  verdictLoss: number
  marginLoss: number
  isFP: boolean
  correct: boolean
}

function evaluateScenario(scenario: Scenario): ScenarioResult {
  const scores = buildScores(scenario.scores)
  const result = fuseAlgorithmResults(
    scores,
    scenario.contentType,
    scenario.existingScore,
    undefined,
    scenario.peakFrequencyHz
  )

  const actual = result.verdict as FeedbackVerdict
  const vLoss = verdictLoss(scenario.expectedVerdict, actual)
  const mLoss = marginLoss(scenario.expectedVerdict, result.feedbackProbability)
  const fp = isFalsePositive(scenario.expectedVerdict, actual)
  const correct = vLoss === 0

  return {
    scenario,
    probability: result.feedbackProbability,
    confidence: result.confidence,
    actualVerdict: actual,
    verdictLoss: vLoss,
    marginLoss: mLoss,
    isFP: fp,
    correct,
  }
}

function evaluate(verbose: boolean): void {
  const results = SCENARIOS.map(evaluateScenario)

  // Weighted loss calculations
  let totalWeight = 0
  let weightedVerdictLoss = 0
  let weightedMarginLoss = 0
  let weightedFpPenalty = 0
  let correctCount = 0

  for (const r of results) {
    const w = r.scenario.weight
    totalWeight += w
    weightedVerdictLoss += w * r.verdictLoss
    weightedMarginLoss += w * r.marginLoss
    weightedFpPenalty += w * (r.isFP ? 2.0 : 0)
    if (r.correct) correctCount++
  }

  const avgVerdictLoss = weightedVerdictLoss / totalWeight
  const avgMarginLoss = weightedMarginLoss / totalWeight
  const avgFpPenalty = weightedFpPenalty / totalWeight
  const cPenalty = constraintPenalty()

  const loss = (1.0 * avgVerdictLoss) + (0.3 * avgMarginLoss) + (2.0 * avgFpPenalty) + (10.0 * cPenalty)

  // Output
  if (verbose) {
    console.log('═══════════════════════════════════════════════════════════════')
    console.log('  AUTORESEARCH EVALUATION — Per-Scenario Breakdown')
    console.log('═══════════════════════════════════════════════════════════════')
    console.log()

    // Group by category
    const groups = new Map<string, ScenarioResult[]>()
    for (const r of results) {
      const cat = r.scenario.category
      if (!groups.has(cat)) groups.set(cat, [])
      groups.get(cat)!.push(r)
    }

    for (const [cat, group] of groups) {
      console.log(`── ${cat.toUpperCase()} ──────────────────────────────────────`)
      for (const r of group) {
        const status = r.correct ? '\x1b[32m PASS \x1b[0m' : '\x1b[31m FAIL \x1b[0m'
        const fpTag = r.isFP ? ' \x1b[33m[FP!]\x1b[0m' : ''
        console.log(
          `${status} ${r.scenario.id}` +
          `  prob=${r.probability.toFixed(3)}` +
          `  conf=${r.confidence.toFixed(3)}` +
          `  expected=${r.scenario.expectedVerdict}` +
          `  actual=${r.actualVerdict}` +
          `  vLoss=${r.verdictLoss.toFixed(1)}` +
          `  mLoss=${r.marginLoss.toFixed(3)}` +
          `${fpTag}`
        )
      }
      console.log()
    }
  }

  console.log('---')
  console.log(`loss:          ${loss.toFixed(6)}`)
  console.log(`verdict_loss:  ${avgVerdictLoss.toFixed(6)}`)
  console.log(`margin_loss:   ${avgMarginLoss.toFixed(6)}`)
  console.log(`fp_penalty:    ${avgFpPenalty.toFixed(6)}`)
  console.log(`constraint_ok: ${cPenalty === 0}`)
  console.log(`scenarios:     ${correctCount}/${results.length} correct`)
}

// ── Entry point ──────────────────────────────────────────────────────────────

const verbose = process.argv.includes('--verbose')
evaluate(verbose)
