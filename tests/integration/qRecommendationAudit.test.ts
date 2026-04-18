import { describe, expect, it } from 'vitest'
import {
  auditSnapshotRecommendations,
  auditSyntheticQPolicyScenarios,
  validateSnapshotRecommendationCoverage,
} from '@/autoresearch/qRecommendationAudit'
import { SPEECH_WORSHIP_SNAPSHOT_FIXTURES } from '@/tests/fixtures/snapshots/speech-worship'

function rowById<T extends { id: string }>(rows: readonly T[], id: string): T {
  const row = rows.find((candidate) => candidate.id === id)
  expect(row).toBeDefined()
  return row!
}

describe('q recommendation audit', () => {
  it('summarizes advisory metadata across replayed snapshot fixtures', () => {
    const summary = auditSnapshotRecommendations()
    const coverageIssues = validateSnapshotRecommendationCoverage(summary)
    const expectedAdvisories = SPEECH_WORSHIP_SNAPSHOT_FIXTURES.filter(
      (fixture) => fixture.expectAdvisory,
    ).length
    const highBandRunaway = rowById(
      summary.rows,
      'speech-limiter-clamped-feedback-3150hz',
    )
    const lowEdge = rowById(
      summary.rows,
      'speech-low-edge-feedback-180hz',
    )
    const mergedCluster = rowById(
      summary.rows,
      'worship-merged-cluster-feedback-1000hz',
    )
    const recurring = rowById(
      summary.rows,
      'speech-recurring-feedback-2500hz',
    )
    const defaulted = rowById(
      summary.rows,
      'worship-defaulted-bandwidth-feedback-1000hz',
    )

    expect(summary.totalFixtures).toBe(SPEECH_WORSHIP_SNAPSHOT_FIXTURES.length)
    expect(summary.advisoryCount).toBe(expectedAdvisories)
    expect(coverageIssues).toEqual([])
    expect(summary.advisoryQSources.measured).toBeGreaterThan(0)
    expect(summary.advisoryQSources.guarded).toBeGreaterThan(0)
    expect(summary.advisoryQSources.cluster).toBeGreaterThan(0)
    expect(summary.trackMeasurementModes.mirrored).toBeGreaterThan(0)
    expect(summary.trackMeasurementModes.defaulted).toBeGreaterThan(0)
    expect(highBandRunaway.advisoryGenerated).toBe(true)
    expect(highBandRunaway.qMeasurementMode).toBe('full')
    expect(highBandRunaway.qSource).toBe('measured')
    expect(highBandRunaway.strategy).toBe('narrow-cut')
    expect(highBandRunaway.advisoryQ).toBe(16)
    expect(lowEdge).toMatchObject({
      advisoryGenerated: true,
      qMeasurementMode: 'mirrored',
      qSource: 'guarded',
      strategy: 'broad-region',
      recurrenceCount: 0,
    })
    expect(lowEdge.advisoryQ).toBeLessThanOrEqual(8)
    expect(lowEdge.reason).toMatch(/bandwidth estimate was incomplete/i)
    expect(mergedCluster).toMatchObject({
      advisoryGenerated: true,
      qSource: 'cluster',
      strategy: 'broad-region',
      clusterMinHz: 900,
      clusterMaxHz: 1120,
    })
    expect(mergedCluster.reason).toMatch(/unstable region/i)
    expect(recurring).toMatchObject({
      advisoryGenerated: true,
      recurrenceCount: 2,
    })
    expect(defaulted).toMatchObject({
      advisoryGenerated: true,
      qMeasurementMode: 'defaulted',
      qSource: 'guarded',
      strategy: 'narrow-cut',
    })
    expect(defaulted.reason).toMatch(/bandwidth estimate was incomplete/i)
  })

  it('covers every q-source guard rail in the synthetic policy audit', () => {
    const summary = auditSyntheticQPolicyScenarios()
    const byId = Object.fromEntries(
      summary.rows.map((row) => [row.id, row]),
    )

    expect(summary.qSources).toEqual({
      baseline: 1,
      measured: 2,
      cluster: 1,
      guarded: 2,
    })
    expect(summary.measurementModes).toEqual({
      full: 5,
      mirrored: 1,
      defaulted: 0,
    })

    expect(byId['measured-high-band-runaway']).toMatchObject({
      qSource: 'measured',
      strategy: 'narrow-cut',
      advisoryQ: 16,
    })
    expect(byId['guarded-incomplete-bandwidth']).toMatchObject({
      qSource: 'guarded',
      strategy: 'narrow-cut',
      qMeasurementMode: 'mirrored',
    })
    expect(byId['guarded-incomplete-bandwidth'].reason).toMatch(
      /bandwidth estimate was incomplete/i,
    )
    expect(byId['guarded-low-frequency-region']).toMatchObject({
      qSource: 'guarded',
      strategy: 'broad-region',
    })
    expect(byId['guarded-low-frequency-region'].advisoryQ).toBeLessThanOrEqual(8)
    expect(byId['guarded-low-frequency-region'].reason).toMatch(
      /low-frequency recurrence/i,
    )
    expect(byId['cluster-widened-region']).toMatchObject({
      qSource: 'cluster',
      strategy: 'broad-region',
      advisoryQ: 4,
    })
    expect(byId['cluster-widened-region'].reason).toMatch(/unstable region/i)
    expect(byId['baseline-without-trusted-width']).toMatchObject({
      qSource: 'baseline',
      strategy: 'narrow-cut',
      advisoryQ: 7,
    })
  })
})
