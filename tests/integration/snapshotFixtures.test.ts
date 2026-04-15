import { describe, expect, it } from 'vitest'
import {
  assertValidLabeledSnapshotFixture,
  normalizeImportedSnapshotFixture,
} from '@/autoresearch/snapshotFixtures'
import {
  evaluateSnapshotFixture,
  evaluateSnapshotFixtures,
  reconstructAlgorithmScores,
  replaySnapshotFixture,
} from '@/autoresearch/snapshotReplay'
import { buildFusionConfig, fuseAlgorithmResults } from '@/lib/dsp/fusionEngine'
import { SPEECH_WORSHIP_SNAPSHOT_FIXTURES } from '@/tests/fixtures/snapshots/speech-worship'

describe('Snapshot Fixture Replay', () => {
  it('provides a curated speech/worship corpus', () => {
    expect(SPEECH_WORSHIP_SNAPSHOT_FIXTURES.length).toBeGreaterThanOrEqual(12)

    for (const fixture of SPEECH_WORSHIP_SNAPSHOT_FIXTURES) {
      expect(() => assertValidLabeledSnapshotFixture(fixture)).not.toThrow()
    }
  })

  it('rejects v1.0 batches for the snapshot corpus', () => {
    const source = SPEECH_WORSHIP_SNAPSHOT_FIXTURES[0]
    expect(() =>
      normalizeImportedSnapshotFixture({
        ...source,
        batch: {
          ...source.batch,
          version: '1.0',
        },
      }),
    ).toThrow(/version 1\.1 or 1\.2/i)
  })

  it('rejects fixtures without captured algorithm scores', () => {
    const source = SPEECH_WORSHIP_SNAPSHOT_FIXTURES[0]
    expect(() =>
      normalizeImportedSnapshotFixture({
        ...source,
        batch: {
          ...source.batch,
          event: {
            ...source.batch.event,
            algorithmScores: undefined,
          },
        },
      }),
    ).toThrow(/algorithmScores/i)
  })

  it('never escalates speech/worship false positives to FEEDBACK', () => {
    const falsePositiveFixtures = SPEECH_WORSHIP_SNAPSHOT_FIXTURES.filter(
      (fixture) => fixture.batch.event.userFeedback === 'false_positive',
    )

    for (const fixture of falsePositiveFixtures) {
      const result = evaluateSnapshotFixture(fixture)
      expect(result.actualVerdict).not.toBe('FEEDBACK')
      expect(['NOT_FEEDBACK', 'UNCERTAIN']).toContain(result.actualVerdict)
      expect(result.advisoryGenerated).toBe(false)
      expect(result.verdictAccepted).toBe(true)
      expect(result.advisoryAccepted).toBe(true)
    }
  })

  it('keeps confirmed feedback out of UNCERTAIN and emits a corrective advisory', () => {
    const confirmedFixtures = SPEECH_WORSHIP_SNAPSHOT_FIXTURES.filter(
      (fixture) => fixture.batch.event.userFeedback === 'confirmed_feedback',
    )

    for (const fixture of confirmedFixtures) {
      const result = evaluateSnapshotFixture(fixture)
      expect(['FEEDBACK', 'POSSIBLE_FEEDBACK']).toContain(result.actualVerdict)
      expect(['NOT_FEEDBACK', 'UNCERTAIN']).not.toContain(result.actualVerdict)
      expect(result.advisoryGenerated).toBe(true)
      expect(result.advisoryAccepted).toBe(true)
      expect(result.verdictAccepted).toBe(true)
    }
  })

  it('pins the ambiguous ring case to POSSIBLE_FEEDBACK with an advisory', () => {
    const ambiguous = SPEECH_WORSHIP_SNAPSHOT_FIXTURES.find(
      (fixture) => fixture.id === 'speech-ambiguous-ring-630hz',
    )

    expect(ambiguous).toBeDefined()
    const result = evaluateSnapshotFixture(ambiguous!)
    expect(result.actualVerdict).toBe('POSSIBLE_FEEDBACK')
    expect(result.advisoryGenerated).toBe(true)
    expect(result.advisoryAccepted).toBe(true)
  })

  it('replays fixtures with the worker fusion-config builder', () => {
    const fixture = SPEECH_WORSHIP_SNAPSHOT_FIXTURES.find(
      (candidate) => candidate.id === 'speech-limiter-clamped-feedback-3150hz',
    )

    expect(fixture).toBeDefined()

    const replay = replaySnapshotFixture(fixture!)
    const direct = fuseAlgorithmResults(
      reconstructAlgorithmScores(fixture!.batch),
      fixture!.batch.event.contentType,
      buildFusionConfig(replay.settings),
      fixture!.batch.event.frequencyHz,
    )

    expect(replay.fusionResult.feedbackProbability).toBe(direct.feedbackProbability)
    expect(replay.fusionResult.confidence).toBe(direct.confidence)
    expect(replay.fusionResult.verdict).toBe(direct.verdict)
  })

  it('evaluates the full corpus with no verdict or advisory misses', () => {
    const summary = evaluateSnapshotFixtures(SPEECH_WORSHIP_SNAPSHOT_FIXTURES)
    const acceptedTotal = summary.results.filter(
      (result) => result.verdictAccepted && result.advisoryAccepted,
    ).length

    expect(summary.accepted).toBe(summary.total)
    expect(summary.advisoryAccepted).toBe(summary.total)
    expect(acceptedTotal).toBe(summary.total)
  })
})
