import { pathToFileURL } from 'node:url'
import {
  evaluateSnapshotFixtures,
  replaySnapshotFixture,
} from './snapshotReplay'
import { SPEECH_WORSHIP_SNAPSHOT_FIXTURES } from '@/tests/fixtures/snapshots/speech-worship'

export interface SnapshotEvaluationSummary {
  total: number
  accepted: number
  advisoryAccepted: number
}

export function evaluateSnapshotCorpus(
  verbose: boolean,
  debug: boolean = false,
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

function isDirectExecution(): boolean {
  const entry = process.argv[1]
  if (!entry) return false
  return import.meta.url === pathToFileURL(entry).href
}

if (isDirectExecution()) {
  const verbose = process.argv.includes('--verbose')
  const debug = process.argv.includes('--debug')
  evaluateSnapshotCorpus(verbose, debug)
}
