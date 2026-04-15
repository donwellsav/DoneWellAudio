/**
 * Autoresearch Evaluation Script — DoneWell Audio
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

import { pathToFileURL } from 'node:url'
import { DEFAULT_FUSION_CONFIG, fuseAlgorithmResults, FUSION_WEIGHTS } from '@/lib/dsp/fusionEngine'
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

function acceptableVerdictsForScenario(scenario: Scenario): readonly FeedbackVerdict[] {
  return scenario.acceptableVerdicts ?? [scenario.expectedVerdict]
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

const WEIGHT_PROFILES = ['DEFAULT', 'SPEECH', 'MUSIC', 'COMPRESSED'] as const
const MIN_WEIGHT = 0.01
const MAX_WEIGHT = 0.50
const MIN_FEEDBACK_THRESHOLD = 0.40
const MAX_FEEDBACK_THRESHOLD = 0.80

export interface ConstraintIssue {
  message: string
  profile?: (typeof WEIGHT_PROFILES)[number]
  metric: string
  value: number
}

export interface ScenarioContradiction {
  signature: string
  scenarios: Array<Pick<Scenario, 'id' | 'expectedVerdict' | 'category' | 'source'>>
}

function scenarioSignature(scenario: Scenario): string {
  return JSON.stringify({
    msd: scenario.scores.msd ?? null,
    phase: scenario.scores.phase ?? null,
    spectral: scenario.scores.spectral ?? null,
    comb: scenario.scores.comb ?? null,
    ihr: scenario.scores.ihr ?? null,
    ptmr: scenario.scores.ptmr ?? null,
    compressed: scenario.scores.compressed ?? null,
    msdFrames: scenario.scores.msdFrames ?? null,
    contentType: scenario.contentType,
    peakFrequencyHz: scenario.peakFrequencyHz ?? null,
  })
}

export function findScenarioContradictions(
  scenarios: readonly Scenario[] = SCENARIOS,
): ScenarioContradiction[] {
  const grouped = new Map<string, ScenarioContradiction['scenarios']>()

  for (const scenario of scenarios) {
    const signature = scenarioSignature(scenario)
    const matches = grouped.get(signature) ?? []
    matches.push({
      id: scenario.id,
      expectedVerdict: scenario.expectedVerdict,
      category: scenario.category,
      source: scenario.source,
    })
    grouped.set(signature, matches)
  }

  const contradictions: ScenarioContradiction[] = []
  for (const [signature, matches] of grouped) {
    const verdicts = new Set(matches.map((match) => match.expectedVerdict))
    if (matches.length > 1 && verdicts.size > 1) {
      contradictions.push({ signature, scenarios: matches })
    }
  }

  return contradictions
}

export function validateWeightConstraints(): ConstraintIssue[] {
  const issues: ConstraintIssue[] = []

  for (const profile of WEIGHT_PROFILES) {
    const weights = FUSION_WEIGHTS[profile]
    const values = Object.entries(weights) as Array<[string, number]>
    const sum = values.reduce((acc, [, value]) => acc + value, 0)

    const drift = Math.abs(sum - 1.0)
    if (drift > 0.001) {
      issues.push({
        profile,
        metric: 'sum',
        value: sum,
        message: `${profile} weights must sum to 1.0 (got ${sum.toFixed(6)})`,
      })
    }

    for (const [metric, value] of values) {
      if (value < MIN_WEIGHT || value > MAX_WEIGHT) {
        issues.push({
          profile,
          metric,
          value,
          message: `${profile}.${metric} must stay in [${MIN_WEIGHT}, ${MAX_WEIGHT}] (got ${value.toFixed(6)})`,
        })
      }
    }
  }

  if (
    DEFAULT_FUSION_CONFIG.feedbackThreshold < MIN_FEEDBACK_THRESHOLD ||
    DEFAULT_FUSION_CONFIG.feedbackThreshold > MAX_FEEDBACK_THRESHOLD
  ) {
    issues.push({
      metric: 'feedbackThreshold',
      value: DEFAULT_FUSION_CONFIG.feedbackThreshold,
      message:
        `feedbackThreshold must stay in [${MIN_FEEDBACK_THRESHOLD}, ${MAX_FEEDBACK_THRESHOLD}] ` +
        `(got ${DEFAULT_FUSION_CONFIG.feedbackThreshold.toFixed(6)})`,
    })
  }

  return issues
}

export function constraintPenalty(issues: readonly ConstraintIssue[] = validateWeightConstraints()): number {
  let penalty = 0

  for (const issue of issues) {
    if (issue.metric === 'sum') {
      penalty += Math.abs(issue.value - 1.0) * 10.0
    } else {
      penalty += 100.0
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

export interface EvaluationSummary {
  loss: number
  verdictLoss: number
  marginLoss: number
  fpPenalty: number
  constraintOk: boolean
  scenariosCorrect: number
  scenariosTotal: number
  results: ScenarioResult[]
}

function evaluateScenario(scenario: Scenario): ScenarioResult {
  const scores = buildScores(scenario.scores)
  const result = fuseAlgorithmResults(
    scores,
    scenario.contentType,
    undefined,
    scenario.peakFrequencyHz
  )

  const actual = result.verdict as FeedbackVerdict
  const accepted = scenarioAcceptsVerdict(scenario, actual)
  const vLoss = accepted ? 0 : verdictLoss(scenario.expectedVerdict, actual)
  const mLoss = accepted ? 0 : marginLoss(scenario.expectedVerdict, result.feedbackProbability)
  const fp = isFalsePositive(scenario.expectedVerdict, actual)
  const correct = accepted

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

export function evaluate(verbose: boolean): EvaluationSummary {
  const contradictions = findScenarioContradictions()
  if (contradictions.length > 0) {
    if (verbose) {
      console.error('Scenario contradictions detected:')
      for (const contradiction of contradictions) {
        console.error(contradiction.signature)
        console.error(JSON.stringify(contradiction.scenarios, null, 2))
      }
    }
    throw new Error(`Scenario dataset contains ${contradictions.length} contradictory signature(s)`)
  }

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
  const constraintIssues = validateWeightConstraints()
  const cPenalty = constraintPenalty(constraintIssues)

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

    if (constraintIssues.length > 0) {
      console.log('Constraint issues:')
      for (const issue of constraintIssues) {
        console.log(`- ${issue.message}`)
      }
      console.log()
    }
  }

  console.log('---')
  console.log(`loss:          ${loss.toFixed(6)}`)
  console.log(`verdict_loss:  ${avgVerdictLoss.toFixed(6)}`)
  console.log(`margin_loss:   ${avgMarginLoss.toFixed(6)}`)
  console.log(`fp_penalty:    ${avgFpPenalty.toFixed(6)}`)
  console.log(`constraint_ok: ${constraintIssues.length === 0}`)
  console.log(`scenarios:     ${correctCount}/${results.length} correct`)

  return {
    loss,
    verdictLoss: avgVerdictLoss,
    marginLoss: avgMarginLoss,
    fpPenalty: avgFpPenalty,
    constraintOk: constraintIssues.length === 0,
    scenariosCorrect: correctCount,
    scenariosTotal: results.length,
    results,
  }
}

function scenarioAcceptsVerdict(scenario: Scenario, actual: FeedbackVerdict): boolean {
  return acceptableVerdictsForScenario(scenario).includes(actual)
}

// ── Entry point ──────────────────────────────────────────────────────────────

function isDirectExecution(): boolean {
  const entry = process.argv[1]
  if (!entry) return false
  return import.meta.url === pathToFileURL(entry).href
}

if (isDirectExecution()) {
  const verbose = process.argv.includes('--verbose')
  evaluate(verbose)
}
