import { Buffer } from 'node:buffer'
import type { SnapshotBatch, EncodedSnapshot } from '@/types/data'
import type {
  DetectorSettings,
  IssueLabel,
  QMeasurementMode,
  RecommendationContext,
  SeverityLevel,
} from '@/types/advisory'
import type { FeedbackVerdict } from './scenarios'

export type SnapshotFixtureTargetContext = 'speech_worship'
export type SnapshotFixtureMode = 'speech' | 'worship'

export interface SnapshotReplayContext {
  recommendationContext?: RecommendationContext
  clusterMinHz?: number
  clusterMaxHz?: number
  settingsOverrides?: Partial<Pick<DetectorSettings, 'roomPreset' | 'roomRT60' | 'roomVolume'>>
}

export interface LabeledSnapshotFixture {
  id: string
  targetContext: SnapshotFixtureTargetContext
  mode: SnapshotFixtureMode
  batch: SnapshotBatch
  acceptableVerdicts: FeedbackVerdict[]
  expectAdvisory: boolean
  expectedLabel?: IssueLabel
  expectedSeverity?: SeverityLevel
  notes?: string
  replayContext?: SnapshotReplayContext
}

export interface SnapshotFixtureEvaluationResult {
  id: string
  mode: SnapshotFixtureMode
  acceptableVerdicts: FeedbackVerdict[]
  actualVerdict: FeedbackVerdict
  feedbackProbability: number
  confidence: number
  reportable: boolean
  advisoryGenerated: boolean
  advisoryFrequencyHz: number | null
  verdictAccepted: boolean
  advisoryAccepted: boolean
}

export interface NormalizeSnapshotFixtureInput {
  id?: string
  mode: SnapshotFixtureMode
  batch: SnapshotBatch
  acceptableVerdicts: FeedbackVerdict[]
  expectAdvisory: boolean
  targetContext?: SnapshotFixtureTargetContext
  expectedLabel?: IssueLabel
  expectedSeverity?: SeverityLevel
  notes?: string
  replayContext?: SnapshotReplayContext
}

const VALID_FEEDBACK_VERDICTS: readonly FeedbackVerdict[] = [
  'NOT_FEEDBACK',
  'UNCERTAIN',
  'POSSIBLE_FEEDBACK',
  'FEEDBACK',
]

const FIXTURE_SUPPORTED_VERSIONS = new Set<SnapshotBatch['version']>(['1.1', '1.2'])
const FIXTURE_TARGET_BINS = 512
const NORMALIZED_CAPTURED_AT = '2026-01-01T00:00:00.000Z'
const NORMALIZED_SESSION_ID = 'snapshot-fixture'
const FIXTURE_ID_SANITIZER = /[^a-z0-9-]+/g

export const SNAPSHOT_FIXTURE_BIN_COUNT = FIXTURE_TARGET_BINS
export const SNAPSHOT_FIXTURE_DB_MIN = -100
export const SNAPSHOT_FIXTURE_DB_MAX = 0
const SNAPSHOT_FIXTURE_DB_RANGE = SNAPSHOT_FIXTURE_DB_MAX - SNAPSHOT_FIXTURE_DB_MIN

export function byteToDb(value: number): number {
  const clamped = Math.max(0, Math.min(255, value))
  return SNAPSHOT_FIXTURE_DB_MIN + (clamped / 255) * SNAPSHOT_FIXTURE_DB_RANGE
}

export function dbToByte(valueDb: number): number {
  if (valueDb <= SNAPSHOT_FIXTURE_DB_MIN) return 0
  if (valueDb >= SNAPSHOT_FIXTURE_DB_MAX) return 255
  return Math.round(
    ((valueDb - SNAPSHOT_FIXTURE_DB_MIN) / SNAPSHOT_FIXTURE_DB_RANGE) * 255
  )
}

export function encodeSnapshotSpectrum(spectrum: Uint8Array): string {
  if (spectrum.length !== FIXTURE_TARGET_BINS) {
    throw new Error(
      `Fixture spectra must contain ${FIXTURE_TARGET_BINS} bins (got ${spectrum.length})`
    )
  }
  return Buffer.from(spectrum).toString('base64')
}

export function decodeSnapshotSpectrum(snapshot: EncodedSnapshot): Uint8Array {
  const decoded = Buffer.from(snapshot.s, 'base64')
  if (decoded.length !== FIXTURE_TARGET_BINS) {
    throw new Error(
      `Decoded snapshot must contain ${FIXTURE_TARGET_BINS} bins (got ${decoded.length})`
    )
  }
  return Uint8Array.from(decoded)
}

export function snapshotBinToFrequency(
  binIndex: number,
  sampleRate: number,
  binsPerSnapshot: number = FIXTURE_TARGET_BINS,
): number {
  const clampedBin = Math.max(0, Math.min(binsPerSnapshot - 1, binIndex))
  const nyquist = sampleRate / 2
  return (clampedBin / (binsPerSnapshot - 1)) * nyquist
}

export function frequencyToSnapshotBin(
  frequencyHz: number,
  sampleRate: number,
  binsPerSnapshot: number = FIXTURE_TARGET_BINS,
): number {
  const nyquist = sampleRate / 2
  if (nyquist <= 0) return 0
  const ratio = Math.max(0, Math.min(1, frequencyHz / nyquist))
  return Math.round(ratio * (binsPerSnapshot - 1))
}

export function sortFeedbackVerdicts(
  verdicts: readonly FeedbackVerdict[],
): FeedbackVerdict[] {
  return [...verdicts].sort(
    (left, right) =>
      VALID_FEEDBACK_VERDICTS.indexOf(left) - VALID_FEEDBACK_VERDICTS.indexOf(right),
  )
}

export function assertValidLabeledSnapshotFixture(
  fixture: unknown,
): asserts fixture is LabeledSnapshotFixture {
  if (!fixture || typeof fixture !== 'object') {
    throw new Error('Snapshot fixture must be an object')
  }

  const candidate = fixture as Partial<LabeledSnapshotFixture>
  if (typeof candidate.id !== 'string' || candidate.id.trim().length === 0) {
    throw new Error('Snapshot fixture must include a non-empty id')
  }
  if (candidate.targetContext !== 'speech_worship') {
    throw new Error(
      `Snapshot fixture ${candidate.id} must target speech_worship`
    )
  }
  if (candidate.mode !== 'speech' && candidate.mode !== 'worship') {
    throw new Error(
      `Snapshot fixture ${candidate.id} must declare mode 'speech' or 'worship'`
    )
  }
  if (
    !Array.isArray(candidate.acceptableVerdicts)
    || candidate.acceptableVerdicts.length === 0
  ) {
    throw new Error(
      `Snapshot fixture ${candidate.id} must declare acceptable verdicts`
    )
  }
  for (const verdict of candidate.acceptableVerdicts) {
    if (!VALID_FEEDBACK_VERDICTS.includes(verdict)) {
      throw new Error(
        `Snapshot fixture ${candidate.id} uses unsupported verdict '${String(verdict)}'`
      )
    }
  }
  if (typeof candidate.expectAdvisory !== 'boolean') {
    throw new Error(
      `Snapshot fixture ${candidate.id} must declare expectAdvisory`
    )
  }
  validateReplayContext(candidate.id, candidate.replayContext)
  validateSnapshotBatch(candidate.id, candidate.batch)
}

export function normalizeImportedSnapshotFixture(
  input: NormalizeSnapshotFixtureInput,
): LabeledSnapshotFixture {
  const fixtureId = makeStableFixtureId(input.id, input.mode, input.batch)
  const normalizedBatch: SnapshotBatch = {
    ...input.batch,
    sessionId: NORMALIZED_SESSION_ID,
    capturedAt: NORMALIZED_CAPTURED_AT,
    event: {
      ...input.batch.event,
      algorithmScores: input.batch.event.algorithmScores
        ? {
            ...input.batch.event.algorithmScores,
          }
        : input.batch.event.algorithmScores,
    },
    snapshots: [...input.batch.snapshots]
      .sort((left, right) => left.t - right.t)
      .map((snapshot) => ({
        t: snapshot.t,
        s: snapshot.s,
      })),
  }

  const normalizedFixture: LabeledSnapshotFixture = {
    id: fixtureId,
    targetContext: input.targetContext ?? 'speech_worship',
    mode: input.mode,
    batch: normalizedBatch,
    acceptableVerdicts: sortFeedbackVerdicts(input.acceptableVerdicts),
    expectAdvisory: input.expectAdvisory,
    expectedLabel: input.expectedLabel,
    expectedSeverity: input.expectedSeverity,
    notes: input.notes,
    replayContext: input.replayContext,
  }

  assertValidLabeledSnapshotFixture(normalizedFixture)
  return normalizedFixture
}

export function serializeSnapshotFixture(
  fixture: LabeledSnapshotFixture,
): string {
  assertValidLabeledSnapshotFixture(fixture)
  return `${JSON.stringify(toSerializableFixture(fixture), null, 2)}\n`
}

function validateSnapshotBatch(
  fixtureId: string,
  batch: SnapshotBatch | undefined,
): void {
  if (!batch || typeof batch !== 'object') {
    throw new Error(`Snapshot fixture ${fixtureId} must include a batch`)
  }
  if (!FIXTURE_SUPPORTED_VERSIONS.has(batch.version)) {
    throw new Error(
      `Snapshot fixture ${fixtureId} must use batch version 1.1 or 1.2 (got ${batch.version})`
    )
  }
  if (batch.binsPerSnapshot !== FIXTURE_TARGET_BINS) {
    throw new Error(
      `Snapshot fixture ${fixtureId} must use ${FIXTURE_TARGET_BINS} bins per snapshot`
    )
  }
  if (!batch.event.algorithmScores) {
    throw new Error(
      `Snapshot fixture ${fixtureId} must include event.algorithmScores`
    )
  }
  if (!Array.isArray(batch.snapshots) || batch.snapshots.length === 0) {
    throw new Error(`Snapshot fixture ${fixtureId} must include snapshots`)
  }
  for (const snapshot of batch.snapshots) {
    decodeSnapshotSpectrum(snapshot)
  }
}

function validateReplayContext(
  fixtureId: string,
  replayContext: SnapshotReplayContext | undefined,
): void {
  if (!replayContext) return

  const {
    recommendationContext,
    clusterMinHz,
    clusterMaxHz,
    settingsOverrides,
  } = replayContext

  if (recommendationContext) {
    if (
      !Number.isInteger(recommendationContext.recurrenceCount) ||
      recommendationContext.recurrenceCount < 0
    ) {
      throw new Error(
        `Snapshot fixture ${fixtureId} must use a non-negative integer recurrenceCount`
      )
    }
  }

  const hasClusterMin = typeof clusterMinHz === 'number'
  const hasClusterMax = typeof clusterMaxHz === 'number'
  if (hasClusterMin !== hasClusterMax) {
    throw new Error(
      `Snapshot fixture ${fixtureId} must provide both clusterMinHz and clusterMaxHz`
    )
  }
  if (
    hasClusterMin &&
    hasClusterMax &&
    !(clusterMinHz! < clusterMaxHz!)
  ) {
    throw new Error(
      `Snapshot fixture ${fixtureId} must use clusterMinHz < clusterMaxHz`
    )
  }

  if (!settingsOverrides) return

  if (
    settingsOverrides.roomPreset !== undefined &&
    typeof settingsOverrides.roomPreset !== 'string'
  ) {
    throw new Error(
      `Snapshot fixture ${fixtureId} must use a string roomPreset override`
    )
  }

  for (const key of ['roomRT60', 'roomVolume'] as const) {
    const value = settingsOverrides[key]
    if (value !== undefined && !(typeof value === 'number' && Number.isFinite(value))) {
      throw new Error(
        `Snapshot fixture ${fixtureId} must use a finite numeric ${key} override`
      )
    }
  }
}

function makeStableFixtureId(
  preferredId: string | undefined,
  mode: SnapshotFixtureMode,
  batch: SnapshotBatch,
): string {
  if (preferredId && preferredId.trim().length > 0) {
    return preferredId
      .trim()
      .toLowerCase()
      .replace(FIXTURE_ID_SANITIZER, '-')
      .replace(/^-+|-+$/g, '')
  }

  const hash = hashFixtureBatch(batch)
  const frequency = Math.round(batch.event.frequencyHz)
  const feedback = batch.event.userFeedback ?? 'unlabeled'
  return `${mode}-${frequency}-${feedback}-${hash}`
}

function hashFixtureBatch(batch: SnapshotBatch): string {
  const source = [
    batch.version,
    batch.fftSize,
    batch.sampleRate,
    batch.event.frequencyHz.toFixed(2),
    batch.event.amplitudeDb.toFixed(2),
    batch.event.contentType,
    batch.event.userFeedback ?? 'unlabeled',
    batch.snapshots.length,
    batch.snapshots[0]?.t ?? 0,
    batch.snapshots[batch.snapshots.length - 1]?.t ?? 0,
    batch.event.algorithmScores?.fusedProbability.toFixed(4) ?? '0',
  ].join('|')

  let hash = 2166136261
  for (let index = 0; index < source.length; index++) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function toSerializableFixture(
  fixture: LabeledSnapshotFixture,
): Record<string, unknown> {
  return {
    id: fixture.id,
    targetContext: fixture.targetContext,
    mode: fixture.mode,
    acceptableVerdicts: sortFeedbackVerdicts(fixture.acceptableVerdicts),
    expectAdvisory: fixture.expectAdvisory,
    expectedLabel: fixture.expectedLabel,
    expectedSeverity: fixture.expectedSeverity,
    notes: fixture.notes,
    replayContext: fixture.replayContext,
    batch: {
      version: fixture.batch.version,
      sessionId: fixture.batch.sessionId,
      capturedAt: fixture.batch.capturedAt,
      fftSize: fixture.batch.fftSize,
      sampleRate: fixture.batch.sampleRate,
      binsPerSnapshot: fixture.batch.binsPerSnapshot,
      event: {
        relativeMs: fixture.batch.event.relativeMs,
        frequencyHz: fixture.batch.event.frequencyHz,
        amplitudeDb: fixture.batch.event.amplitudeDb,
        severity: fixture.batch.event.severity,
        confidence: fixture.batch.event.confidence,
        contentType: fixture.batch.event.contentType,
        algorithmScores: fixture.batch.event.algorithmScores,
        userFeedback: fixture.batch.event.userFeedback,
      },
      snapshots: fixture.batch.snapshots.map((snapshot) => ({
        t: snapshot.t,
        s: snapshot.s,
      })),
    },
  }
}
