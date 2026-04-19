import { generatePEQRecommendation } from '@/lib/dsp/eqAdvisor'
import { SPEECH_WORSHIP_SNAPSHOT_FIXTURES } from '@/tests/fixtures/snapshots/speech-worship'
import type {
  PEQRecommendation,
  Preset,
  QMeasurementMode,
  RecommendationContext,
  SeverityLevel,
  Track,
} from '@/types/advisory'
import { replaySnapshotFixture } from './snapshotReplay'

type AdvisoryQSource = NonNullable<PEQRecommendation['qSource']>
type AdvisoryStrategy = NonNullable<PEQRecommendation['strategy']>

const ADVISORY_Q_SOURCES = ['baseline', 'measured', 'cluster', 'guarded'] as const
const ADVISORY_STRATEGIES = ['narrow-cut', 'broad-region'] as const
const Q_MEASUREMENT_MODES = ['full', 'mirrored', 'defaulted'] as const

interface SyntheticQPolicyScenario {
  id: string
  description: string
  track: Track
  severity: SeverityLevel
  preset: Preset
  recommendationContext?: RecommendationContext
  clusterMinHz?: number
  clusterMaxHz?: number
}

export interface SnapshotRecommendationAuditRow {
  id: string
  mode: string
  expectedAdvisory: boolean
  advisoryGenerated: boolean
  actualVerdict: string
  label: string
  severity: SeverityLevel
  reportable: boolean
  trackFrequencyHz: number
  trackQEstimate: number
  trackBandwidthHz: number
  qMeasurementMode: QMeasurementMode
  recurrenceCount: number
  clusterMinHz?: number
  clusterMaxHz?: number
  advisoryType: PEQRecommendation['type'] | null
  advisoryQ: number | null
  qSource: AdvisoryQSource | null
  strategy: AdvisoryStrategy | null
  reason: string | null
}

export interface SnapshotRecommendationAuditSummary {
  totalFixtures: number
  advisoryCount: number
  rows: SnapshotRecommendationAuditRow[]
  advisoryQSources: Record<AdvisoryQSource, number>
  advisoryStrategies: Record<AdvisoryStrategy, number>
  trackMeasurementModes: Record<QMeasurementMode, number>
  guardedAdvisories: number
  incompleteMeasurementAdvisories: number
}

export interface SnapshotQCoverageIssue {
  code:
    | 'missing-guarded-advisory'
    | 'missing-cluster-advisory'
    | 'missing-incomplete-measurement'
    | 'missing-defaulted-measurement'
    | 'missing-recurrence-advisory'
  message: string
}

export interface SyntheticQPolicyAuditRow {
  id: string
  description: string
  frequencyHz: number
  severity: SeverityLevel
  preset: Preset
  trackQEstimate: number
  trackBandwidthHz: number
  qMeasurementMode: QMeasurementMode
  recurrenceCount: number
  clusterMinHz?: number
  clusterMaxHz?: number
  advisoryQ: number
  advisoryType: PEQRecommendation['type']
  qSource: AdvisoryQSource
  strategy: AdvisoryStrategy
  reason: string | null
}

export interface SyntheticQPolicyAuditSummary {
  rows: SyntheticQPolicyAuditRow[]
  qSources: Record<AdvisoryQSource, number>
  strategies: Record<AdvisoryStrategy, number>
  measurementModes: Record<QMeasurementMode, number>
}

export function auditSnapshotRecommendations(
  fixtures = SPEECH_WORSHIP_SNAPSHOT_FIXTURES,
): SnapshotRecommendationAuditSummary {
  const rows = fixtures.map((fixture) => {
    const replay = replaySnapshotFixture(fixture)
    const peq = replay.advisory?.peq

    return {
      id: fixture.id,
      mode: fixture.mode,
      expectedAdvisory: fixture.expectAdvisory,
      advisoryGenerated: peq != null,
      actualVerdict: replay.fusionResult.verdict,
      label: replay.classification.label,
      severity: replay.classification.severity,
      reportable: replay.reportable,
      trackFrequencyHz: replay.track.trueFrequencyHz,
      trackQEstimate: replay.track.qEstimate,
      trackBandwidthHz: replay.track.bandwidthHz,
      qMeasurementMode: replay.track.qMeasurementMode ?? 'full',
      recurrenceCount: fixture.replayContext?.recommendationContext?.recurrenceCount ?? 0,
      clusterMinHz: fixture.replayContext?.clusterMinHz,
      clusterMaxHz: fixture.replayContext?.clusterMaxHz,
      advisoryType: peq?.type ?? null,
      advisoryQ: peq?.q ?? null,
      qSource: peq?.qSource ?? null,
      strategy: peq?.strategy ?? null,
      reason: peq?.reason ?? null,
    } satisfies SnapshotRecommendationAuditRow
  })

  const advisoryQSources = createCounter(ADVISORY_Q_SOURCES)
  const advisoryStrategies = createCounter(ADVISORY_STRATEGIES)
  const trackMeasurementModes = createCounter(Q_MEASUREMENT_MODES)
  let advisoryCount = 0
  let guardedAdvisories = 0
  let incompleteMeasurementAdvisories = 0

  for (const row of rows) {
    trackMeasurementModes[row.qMeasurementMode]++
    if (!row.advisoryGenerated) continue

    advisoryCount++
    if (row.qSource) advisoryQSources[row.qSource]++
    if (row.strategy) advisoryStrategies[row.strategy]++
    if (row.qSource === 'guarded') guardedAdvisories++
    if (row.qMeasurementMode !== 'full') incompleteMeasurementAdvisories++
  }

  return {
    totalFixtures: fixtures.length,
    advisoryCount,
    rows,
    advisoryQSources,
    advisoryStrategies,
    trackMeasurementModes,
    guardedAdvisories,
    incompleteMeasurementAdvisories,
  }
}

export function validateSnapshotRecommendationCoverage(
  summary: SnapshotRecommendationAuditSummary = auditSnapshotRecommendations(),
): SnapshotQCoverageIssue[] {
  const issues: SnapshotQCoverageIssue[] = []
  const advisoryRows = summary.rows.filter((row) => row.advisoryGenerated)

  if (!advisoryRows.some((row) => row.qSource === 'guarded')) {
    issues.push({
      code: 'missing-guarded-advisory',
      message: 'Replay corpus no longer produces a guarded advisory. Add or repair a fixture with incomplete bandwidth or low-frequency conservative Q handling.',
    })
  }

  if (!advisoryRows.some((row) => row.qSource === 'cluster')) {
    issues.push({
      code: 'missing-cluster-advisory',
      message: 'Replay corpus no longer produces a cluster-widened advisory. Add or repair a merged-region fixture with cluster bounds.',
    })
  }

  if (!summary.rows.some((row) => row.qMeasurementMode !== 'full')) {
    issues.push({
      code: 'missing-incomplete-measurement',
      message: 'Replay corpus no longer exercises mirrored or defaulted bandwidth measurement. Add or repair an edge-of-window fixture.',
    })
  }

  if (!summary.rows.some((row) => row.qMeasurementMode === 'defaulted')) {
    issues.push({
      code: 'missing-defaulted-measurement',
      message: 'Replay corpus no longer exercises the no-crossing defaulted bandwidth path. Add or repair an over-wide fixture that keeps both sides above the -3 dB threshold.',
    })
  }

  if (!advisoryRows.some((row) => row.recurrenceCount >= 2)) {
    issues.push({
      code: 'missing-recurrence-advisory',
      message: 'Replay corpus no longer exercises recurrence-driven Q widening. Add or repair a recurring-region fixture.',
    })
  }

  return issues
}

export function auditSyntheticQPolicyScenarios(): SyntheticQPolicyAuditSummary {
  const qSources = createCounter(ADVISORY_Q_SOURCES)
  const strategies = createCounter(ADVISORY_STRATEGIES)
  const measurementModes = createCounter(Q_MEASUREMENT_MODES)

  const rows = SYNTHETIC_Q_POLICY_SCENARIOS.map((scenario) => {
    const peq = generatePEQRecommendation(
      scenario.track,
      scenario.severity,
      scenario.preset,
      scenario.recommendationContext,
      scenario.clusterMinHz,
      scenario.clusterMaxHz,
    )
    const row: SyntheticQPolicyAuditRow = {
      id: scenario.id,
      description: scenario.description,
      frequencyHz: scenario.track.trueFrequencyHz,
      severity: scenario.severity,
      preset: scenario.preset,
      trackQEstimate: scenario.track.qEstimate,
      trackBandwidthHz: scenario.track.bandwidthHz,
      qMeasurementMode: scenario.track.qMeasurementMode ?? 'full',
      recurrenceCount: scenario.recommendationContext?.recurrenceCount ?? 0,
      clusterMinHz: scenario.clusterMinHz,
      clusterMaxHz: scenario.clusterMaxHz,
      advisoryQ: peq.q,
      advisoryType: peq.type,
      qSource: peq.qSource ?? 'baseline',
      strategy: peq.strategy ?? 'narrow-cut',
      reason: peq.reason ?? null,
    }

    qSources[row.qSource]++
    strategies[row.strategy]++
    measurementModes[row.qMeasurementMode]++

    return row
  })

  return {
    rows,
    qSources,
    strategies,
    measurementModes,
  }
}

function createSyntheticTrack({
  id,
  frequencyHz,
  qEstimate,
  bandwidthHz,
  qMeasurementMode = 'full',
  meanQ = qEstimate,
  minQ = qEstimate,
}: {
  id: string
  frequencyHz: number
  qEstimate: number
  bandwidthHz: number
  qMeasurementMode?: QMeasurementMode
  meanQ?: number
  minQ?: number
}): Track {
  return {
    id,
    binIndex: Math.round(frequencyHz / 5),
    trueFrequencyHz: frequencyHz,
    trueAmplitudeDb: -18,
    prominenceDb: 14,
    onsetTime: 0,
    onsetDb: -22,
    lastUpdateTime: 1500,
    history: [],
    features: {
      stabilityCentsStd: 4,
      meanQ,
      minQ,
      meanVelocityDbPerSec: 0.8,
      maxVelocityDbPerSec: 1.4,
      persistenceMs: 1200,
      harmonicityScore: 0.2,
      modulationScore: 0.04,
      noiseSidebandScore: 0.03,
    },
    qEstimate,
    bandwidthHz,
    qMeasurementMode,
    velocityDbPerSec: 1.4,
    harmonicOfHz: null,
    isSubHarmonicRoot: false,
    isActive: true,
  }
}

function createCounter<T extends string>(keys: readonly T[]): Record<T, number> {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<T, number>
}

const SYNTHETIC_Q_POLICY_SCENARIOS: SyntheticQPolicyScenario[] = [
  {
    id: 'measured-high-band-runaway',
    description: 'Trusted high-band width stays on the narrow-cut path and clamps to the shared max Q.',
    track: createSyntheticTrack({
      id: 'synthetic-measured-high-band-runaway',
      frequencyHz: 3150,
      qEstimate: 67,
      bandwidthHz: 47,
    }),
    severity: 'RUNAWAY',
    preset: 'surgical',
  },
  {
    id: 'guarded-incomplete-bandwidth',
    description: 'Mirrored bandwidth should not be allowed to infer a razor-thin notch.',
    track: createSyntheticTrack({
      id: 'synthetic-guarded-incomplete-bandwidth',
      frequencyHz: 1800,
      qEstimate: 40,
      bandwidthHz: 45,
      qMeasurementMode: 'mirrored',
    }),
    severity: 'GROWING',
    preset: 'surgical',
  },
  {
    id: 'guarded-low-frequency-region',
    description: 'Sub-300 Hz issues stay conservative and use the broader-region framing.',
    track: createSyntheticTrack({
      id: 'synthetic-guarded-low-frequency-region',
      frequencyHz: 180,
      qEstimate: 14,
      bandwidthHz: 13,
    }),
    severity: 'GROWING',
    preset: 'surgical',
  },
  {
    id: 'cluster-widened-region',
    description: 'Merged region bounds should widen the PEQ to cover the whole unstable span.',
    track: createSyntheticTrack({
      id: 'synthetic-cluster-widened-region',
      frequencyHz: 1000,
      qEstimate: 10,
      bandwidthHz: 100,
    }),
    severity: 'POSSIBLE_RING',
    preset: 'surgical',
    clusterMinHz: 900,
    clusterMaxHz: 1120,
  },
  {
    id: 'recurrence-widened-cut',
    description: 'Repeated reappearance in the same region should widen the chosen Q before the final clamp.',
    track: createSyntheticTrack({
      id: 'synthetic-recurrence-widened-cut',
      frequencyHz: 2500,
      qEstimate: 12,
      bandwidthHz: 208,
    }),
    severity: 'GROWING',
    preset: 'heavy',
    recommendationContext: {
      recurrenceCount: 2,
    },
  },
  {
    id: 'baseline-without-trusted-width',
    description: 'When no trustworthy Q survives validation, the policy falls back to the severity baseline.',
    track: createSyntheticTrack({
      id: 'synthetic-baseline-without-trusted-width',
      frequencyHz: 900,
      qEstimate: Number.NaN,
      bandwidthHz: 90,
      meanQ: Number.NaN,
      minQ: Number.NaN,
    }),
    severity: 'POSSIBLE_RING',
    preset: 'surgical',
  },
]
