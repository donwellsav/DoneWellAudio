import { pathToFileURL } from 'node:url'
import {
  evaluateSnapshotFixtures,
  replaySnapshotFixture,
} from './snapshotReplay'
import {
  auditSnapshotRecommendations,
  auditSyntheticQPolicyScenarios,
  validateSnapshotRecommendationCoverage,
} from './qRecommendationAudit'
import { SPEECH_WORSHIP_SNAPSHOT_FIXTURES } from '@/tests/fixtures/snapshots/speech-worship'

export interface SnapshotEvaluationSummary {
  total: number
  accepted: number
  advisoryAccepted: number
}

export function evaluateSnapshotCorpus(
  verbose: boolean,
  debug: boolean = false,
  qAudit: boolean = false,
): SnapshotEvaluationSummary {
  const summary = evaluateSnapshotFixtures(SPEECH_WORSHIP_SNAPSHOT_FIXTURES)
  const fullyAccepted = summary.results.filter(
    (result) => result.verdictAccepted && result.advisoryAccepted,
  ).length

  if (verbose) {
    console.log('--- snapshot fixtures ---')
    for (const result of summary.results) {
      const verdictStatus = result.verdictAccepted ? 'PASS' : 'FAIL'
      const advisoryStatus = result.advisoryAccepted ? 'PASS' : 'FAIL'
      const acceptedVerdicts = result.acceptableVerdicts.join('|')
      const advisoryFrequency = result.advisoryFrequencyHz?.toFixed(1) ?? 'none'
      console.log(
        `${verdictStatus}/${advisoryStatus} ${result.id}` +
        ` mode=${result.mode}` +
        ` actual=${result.actualVerdict}` +
        ` accepted=${acceptedVerdicts}` +
        ` prob=${result.feedbackProbability.toFixed(3)}` +
        ` conf=${result.confidence.toFixed(3)}` +
        ` advisory=${advisoryFrequency}`,
      )
      if (debug) {
        const replay = replaySnapshotFixture(
          SPEECH_WORSHIP_SNAPSHOT_FIXTURES.find(
            (fixture) => fixture.id === result.id,
          )!,
        )
        console.log(
          `  label=${replay.classification.label}` +
          ` severity=${replay.classification.severity}` +
          ` reportable=${replay.reportable}` +
          ` eligible=${replay.classification.recommendationEligible}` +
          ` pFeedback=${replay.classification.pFeedback.toFixed(3)}` +
          ` pInstrument=${replay.classification.pInstrument.toFixed(3)}` +
          ` prominence=${replay.track.prominenceDb.toFixed(1)}` +
          ` q=${replay.track.qEstimate.toFixed(1)}`,
        )
        console.log(`  reasons=${replay.classification.reasons.join(' | ')}`)
      }
    }
  }

  if (qAudit) {
    const snapshotAudit = auditSnapshotRecommendations()
    const syntheticAudit = auditSyntheticQPolicyScenarios()
    const coverageIssues = validateSnapshotRecommendationCoverage(snapshotAudit)

    console.log('--- advisory q audit (snapshot fixtures) ---')
    for (const row of snapshotAudit.rows.filter((candidate) => candidate.advisoryGenerated)) {
      console.log(
        `${row.id}` +
        ` freq=${row.trackFrequencyHz.toFixed(1)}Hz` +
        ` severity=${row.severity}` +
        ` trackQ=${row.trackQEstimate.toFixed(1)}` +
        ` measure=${row.qMeasurementMode}` +
        ` recur=${row.recurrenceCount}` +
        ` peqQ=${row.advisoryQ?.toFixed(1) ?? 'none'}` +
        ` qSource=${row.qSource ?? 'none'}` +
        ` strategy=${row.strategy ?? 'none'}`,
      )
      if (row.clusterMinHz !== undefined && row.clusterMaxHz !== undefined) {
        console.log(
          `  cluster=${row.clusterMinHz.toFixed(1)}-${row.clusterMaxHz.toFixed(1)}Hz`
        )
      }
      if (row.reason) {
        console.log(`  reason=${row.reason}`)
      }
    }
    console.log(
      `snapshot_q_sources:   ${formatCounts(snapshotAudit.advisoryQSources)}`
    )
    console.log(
      `snapshot_strategies:  ${formatCounts(snapshotAudit.advisoryStrategies)}`
    )
    console.log(
      `measurement_modes:    ${formatCounts(snapshotAudit.trackMeasurementModes)}`
    )
    console.log(
      `guarded_advisories:   ${snapshotAudit.guardedAdvisories}/${snapshotAudit.advisoryCount}`
    )
    console.log(
      `incomplete_measures:  ${snapshotAudit.incompleteMeasurementAdvisories}/${snapshotAudit.advisoryCount}`
    )

    console.log('--- q policy guardrails (synthetic) ---')
    for (const row of syntheticAudit.rows) {
      console.log(
        `${row.id}` +
        ` freq=${row.frequencyHz.toFixed(1)}Hz` +
        ` severity=${row.severity}` +
        ` preset=${row.preset}` +
        ` trackQ=${Number.isFinite(row.trackQEstimate) ? row.trackQEstimate.toFixed(1) : 'invalid'}` +
        ` measure=${row.qMeasurementMode}` +
        ` peqQ=${row.advisoryQ.toFixed(1)}` +
        ` qSource=${row.qSource}` +
        ` strategy=${row.strategy}`,
      )
      if (row.reason) {
        console.log(`  reason=${row.reason}`)
      }
    }
    console.log(`synthetic_q_sources: ${formatCounts(syntheticAudit.qSources)}`)
    console.log(`synthetic_strategies:${formatCounts(syntheticAudit.strategies)}`)
    console.log(`synthetic_modes:     ${formatCounts(syntheticAudit.measurementModes)}`)
    if (coverageIssues.length > 0) {
      console.log('snapshot_q_coverage: FAIL')
      for (const issue of coverageIssues) {
        console.log(`  - ${issue.message}`)
      }
      throw new Error(`Snapshot Q audit coverage failed with ${coverageIssues.length} issue(s)`)
    }
    console.log('snapshot_q_coverage: PASS')
  }

  console.log('---')
  console.log(`fixtures:            ${summary.total}`)
  console.log(`accepted_verdicts:   ${summary.accepted}/${summary.total}`)
  console.log(`accepted_advisories: ${summary.advisoryAccepted}/${summary.total}`)
  console.log(`accepted_total:      ${fullyAccepted}/${summary.total}`)

  return {
    total: summary.total,
    accepted: summary.accepted,
    advisoryAccepted: summary.advisoryAccepted,
  }
}

function formatCounts<T extends string>(counts: Record<T, number>): string {
  return Object.entries(counts)
    .map(([key, value]) => `${key}=${value}`)
    .join(' ')
}

function isDirectExecution(): boolean {
  const entry = process.argv[1]
  if (!entry) return false
  return import.meta.url === pathToFileURL(entry).href
}

if (isDirectExecution()) {
  const verbose = process.argv.includes('--verbose')
  const debug = process.argv.includes('--debug')
  const qAudit = process.argv.includes('--q-audit')
  evaluateSnapshotCorpus(verbose, debug, qAudit)
}
