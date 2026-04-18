import { deriveDefaultDetectorSettings } from '@/lib/settings/defaultDetectorSettings'
import {
  classifyTrackWithAlgorithms,
  shouldReportIssue,
} from '@/lib/dsp/classifier'
import { generateEQAdvisory, generatePEQRecommendation } from '@/lib/dsp/eqAdvisor'
import { estimateQ } from '@/lib/dsp/frequencyAnalysis'
import {
  buildFusionConfig,
  fuseAlgorithmResults,
  type AlgorithmScores,
  type FusedDetectionResult,
} from '@/lib/dsp/fusionEngine'
import { buildScores } from '@/tests/helpers/mockAlgorithmScores'
import type {
  ClassificationResult,
  DetectorSettings,
  EQAdvisory,
  QMeasurementMode,
  Track,
  TrackHistoryEntry,
  TrackFeatures,
} from '@/types/advisory'
import type { SnapshotBatch } from '@/types/data'
import {
  assertValidLabeledSnapshotFixture,
  byteToDb,
  decodeSnapshotSpectrum,
  frequencyToSnapshotBin,
  snapshotBinToFrequency,
  SNAPSHOT_FIXTURE_DB_MIN,
  type LabeledSnapshotFixture,
  type SnapshotFixtureEvaluationResult,
  type SnapshotFixtureMode,
} from './snapshotFixtures'
import type { FeedbackVerdict } from './scenarios'

interface SnapshotTrackPoint {
  time: number
  frequencyHz: number
  amplitudeDb: number
  prominenceDb: number
  qEstimate: number
  bandwidthHz: number
  qMeasurementMode: QMeasurementMode
}

export interface SnapshotReplayResult {
  fixture: LabeledSnapshotFixture
  settings: DetectorSettings
  track: Track
  activeFrequencies: number[]
  algorithmScores: AlgorithmScores
  fusionResult: FusedDetectionResult
  classification: ClassificationResult
  reportable: boolean
  advisory: EQAdvisory | null
}

export interface SnapshotFixtureSummary {
  total: number
  accepted: number
  advisoryAccepted: number
  results: SnapshotFixtureEvaluationResult[]
}

const LOCAL_PEAK_SEARCH_RADIUS = 4
const LOCAL_NOISE_RADIUS = 14
const LOCAL_NOISE_GAP = 2
const MAX_ACTIVE_FREQUENCIES = 8
const ACTIVE_FREQUENCY_FLOOR_DB = -78
const ACTIVE_FREQUENCY_MARGIN_DB = 12
const MODULATION_STDDEV_CENTS_MAX = 80
const NOISE_SIDEBAND_MAX_SCORE = 0.7
const ADVISORY_CENTS_TOLERANCE = 50

export function replaySnapshotFixture(
  fixture: LabeledSnapshotFixture,
): SnapshotReplayResult {
  assertValidLabeledSnapshotFixture(fixture)

  const settings = buildSettingsForMode(fixture)
  const track = buildTrackFromFixture(fixture)
  const activeFrequencies = extractActiveFrequencies(
    fixture.batch,
    fixture.batch.snapshots[fixture.batch.snapshots.length - 1].s,
  )
  const algorithmScores = reconstructAlgorithmScores(fixture.batch)
  const fusionResult = fuseAlgorithmResults(
    algorithmScores,
    fixture.batch.event.contentType,
    buildFusionConfig(settings),
    fixture.batch.event.frequencyHz,
  )
  const classification = classifyTrackWithAlgorithms(
    track,
    algorithmScores,
    fusionResult,
    settings,
    activeFrequencies,
  )
  const reportable = shouldReportIssue(classification, settings)
  const advisory = reportable
    ? buildAdvisoryForFixture(
        fixture,
        track,
        classification.severity,
        settings.eqPreset,
      )
    : null

  return {
    fixture,
    settings,
    track,
    activeFrequencies,
    algorithmScores,
    fusionResult,
    classification,
    reportable,
    advisory,
  }
}

export function evaluateSnapshotFixture(
  fixture: LabeledSnapshotFixture,
): SnapshotFixtureEvaluationResult {
  const replay = replaySnapshotFixture(fixture)
  const actualVerdict = replay.fusionResult.verdict as FeedbackVerdict
  const verdictAccepted = fixture.acceptableVerdicts.includes(actualVerdict)
  const advisoryFrequencyHz = replay.advisory?.peq.hz ?? null
  const advisoryAccepted = fixture.expectAdvisory
    ? advisoryFrequencyHz !== null
      && centsDistance(advisoryFrequencyHz, fixture.batch.event.frequencyHz) <= ADVISORY_CENTS_TOLERANCE
    : advisoryFrequencyHz === null

  return {
    id: fixture.id,
    mode: fixture.mode,
    acceptableVerdicts: [...fixture.acceptableVerdicts],
    actualVerdict,
    feedbackProbability: replay.fusionResult.feedbackProbability,
    confidence: replay.fusionResult.confidence,
    reportable: replay.reportable,
    advisoryGenerated: advisoryFrequencyHz !== null,
    advisoryFrequencyHz,
    verdictAccepted,
    advisoryAccepted,
  }
}

export function evaluateSnapshotFixtures(
  fixtures: readonly LabeledSnapshotFixture[],
): SnapshotFixtureSummary {
  const results = fixtures.map(evaluateSnapshotFixture)
  let accepted = 0
  let advisoryAccepted = 0

  for (const result of results) {
    if (result.verdictAccepted) accepted++
    if (result.advisoryAccepted) advisoryAccepted++
  }

  return {
    total: results.length,
    accepted,
    advisoryAccepted,
    results,
  }
}

export function reconstructAlgorithmScores(batch: SnapshotBatch): AlgorithmScores {
  const captured = batch.event.algorithmScores
  if (!captured) {
    throw new Error('Snapshot batch is missing event.algorithmScores')
  }

  const algorithmScores = buildScores({
    msd: captured.msd,
    phase: captured.phase,
    spectral: captured.spectral,
    comb: captured.comb,
    ihr: captured.ihr,
    ptmr: captured.ptmr,
    compressed: batch.event.contentType === 'compressed',
    msdFrames: 20,
  })

  if (captured.ml != null) {
    algorithmScores.ml = {
      feedbackScore: captured.ml,
      modelConfidence: 1,
      isAvailable: true,
      modelVersion: captured.modelVersion ?? 'snapshot-fixture',
    }
  }

  return algorithmScores
}

function buildSettingsForMode(fixture: LabeledSnapshotFixture): DetectorSettings {
  return {
    ...deriveDefaultDetectorSettings(fixture.mode),
    ...fixture.replayContext?.settingsOverrides,
  }
}

function buildTrackFromFixture(fixture: LabeledSnapshotFixture): Track {
  const points = fixture.batch.snapshots
    .map((snapshot) => analyzeSnapshotPoint(snapshot, fixture.batch))
    .filter((point): point is SnapshotTrackPoint => point !== null)

  if (points.length === 0) {
    throw new Error(`Fixture ${fixture.id} did not yield any usable snapshot points`)
  }

  const history = points.map<TrackHistoryEntry>((point) => ({
    time: point.time,
    freqHz: point.frequencyHz,
    ampDb: point.amplitudeDb,
    prominenceDb: point.prominenceDb,
    qEstimate: point.qEstimate,
  }))

  const amplitudes = points.map((point) => point.amplitudeDb)
  const frequencies = points.map((point) => point.frequencyHz)
  const qEstimates = points.map((point) => point.qEstimate)
  const meanVelocity = calculateMeanVelocity(points)
  const maxVelocity = calculateMaxVelocity(points)
  const latestPoint = points[points.length - 1]
  const firstPoint = points[0]
  const trackFrequencyHz = fixture.batch.event.frequencyHz
  const scoreSeed = buildScores({
    msd: fixture.batch.event.algorithmScores?.msd,
  })
  const harmonicityScore = clamp01(
    1 - (fixture.batch.event.algorithmScores?.ihr ?? 0.5),
  )
  const stabilityCentsStd = calculateStabilityCentsStd(
    fixture.batch.event.frequencyHz,
    frequencies,
  )

  const features: TrackFeatures = {
    stabilityCentsStd,
    meanQ: average(qEstimates),
    minQ: Math.min(...qEstimates),
    meanVelocityDbPerSec: meanVelocity,
    maxVelocityDbPerSec: maxVelocity,
    persistenceMs: latestPoint.time - firstPoint.time,
    harmonicityScore,
    modulationScore: clamp01(stabilityCentsStd / MODULATION_STDDEV_CENTS_MAX),
    noiseSidebandScore: Math.min(
      clamp01((1 - (fixture.batch.event.algorithmScores?.spectral ?? 0.5)) * 0.75),
      NOISE_SIDEBAND_MAX_SCORE,
    ),
  }

  return {
    id: fixture.id,
    binIndex: frequencyToSnapshotBin(
      trackFrequencyHz,
      fixture.batch.sampleRate,
      fixture.batch.binsPerSnapshot,
    ),
    trueFrequencyHz: trackFrequencyHz,
    trueAmplitudeDb: latestPoint.amplitudeDb,
    prominenceDb: latestPoint.prominenceDb,
    onsetTime: firstPoint.time,
    onsetDb: firstPoint.amplitudeDb,
    lastUpdateTime: latestPoint.time,
    history,
    features,
    qEstimate: latestPoint.qEstimate,
    bandwidthHz: latestPoint.bandwidthHz,
    qMeasurementMode: latestPoint.qMeasurementMode,
    phpr: undefined,
    velocityDbPerSec: maxVelocity,
    harmonicOfHz: null,
    isSubHarmonicRoot: false,
    isActive: true,
    msd: scoreSeed.msd?.msd,
    msdGrowthRate: meanVelocity / 50,
    msdIsHowl: (fixture.batch.event.algorithmScores?.msd ?? 0) >= 0.5,
    persistenceFrames: history.length,
    isPersistent: history.length >= 4,
    isHighlyPersistent: history.length >= 8,
  }
}

function analyzeSnapshotPoint(
  snapshot: SnapshotBatch['snapshots'][number],
  batch: SnapshotBatch,
): SnapshotTrackPoint | null {
  const spectrum = decodeSnapshotSpectrum(snapshot)
  const spectrumDb = decodeSnapshotSpectrumDb(snapshot)
  const targetBin = frequencyToSnapshotBin(
    batch.event.frequencyHz,
    batch.sampleRate,
    batch.binsPerSnapshot,
  )
  const searchStart = Math.max(0, targetBin - LOCAL_PEAK_SEARCH_RADIUS)
  const searchEnd = Math.min(
    batch.binsPerSnapshot - 1,
    targetBin + LOCAL_PEAK_SEARCH_RADIUS,
  )

  let localPeakBin = targetBin
  let localPeakByte = spectrum[targetBin]
  for (let bin = searchStart; bin <= searchEnd; bin++) {
    if (spectrum[bin] > localPeakByte) {
      localPeakBin = bin
      localPeakByte = spectrum[bin]
    }
  }

  const amplitudeDb = byteToDb(localPeakByte)
  if (!Number.isFinite(amplitudeDb)) {
    return null
  }

  const noiseFloorDb = calculateLocalNoiseFloorDb(
    spectrum,
    localPeakBin,
    batch.binsPerSnapshot,
  )
  const prominenceDb = Math.max(0, amplitudeDb - noiseFloorDb)
  const frequencyHz = snapshotBinToFrequency(
    localPeakBin,
    batch.sampleRate,
    batch.binsPerSnapshot,
  )
  const qEstimateResult = estimateQ(
    spectrumDb,
    localPeakBin,
    amplitudeDb,
    batch.sampleRate,
    snapshotEffectiveFftSize(batch),
    frequencyHz,
  )

  return {
    time: snapshot.t,
    frequencyHz,
    amplitudeDb,
    prominenceDb,
    qEstimate: qEstimateResult.qEstimate,
    bandwidthHz: qEstimateResult.bandwidthHz,
    qMeasurementMode: qEstimateResult.qMeasurementMode,
  }
}

function extractActiveFrequencies(
  batch: SnapshotBatch,
  latestSnapshotBase64: string,
): number[] {
  const spectrum = decodeSnapshotSpectrum({ t: 0, s: latestSnapshotBase64 })
  let peakByte = 0
  for (let index = 0; index < spectrum.length; index++) {
    peakByte = Math.max(peakByte, spectrum[index])
  }
  const peakDb = byteToDb(peakByte)
  const thresholdDb = Math.max(
    ACTIVE_FREQUENCY_FLOOR_DB,
    peakDb - ACTIVE_FREQUENCY_MARGIN_DB,
  )

  const activeBins: Array<{ bin: number; amplitudeDb: number }> = []
  for (let index = 1; index < spectrum.length - 1; index++) {
    const amplitudeDb = byteToDb(spectrum[index])
    if (
      amplitudeDb >= thresholdDb
      && spectrum[index] >= spectrum[index - 1]
      && spectrum[index] > spectrum[index + 1]
    ) {
      activeBins.push({ bin: index, amplitudeDb })
    }
  }

  activeBins.sort((left, right) => right.amplitudeDb - left.amplitudeDb)

  return activeBins
    .slice(0, MAX_ACTIVE_FREQUENCIES)
    .map((entry) =>
      snapshotBinToFrequency(entry.bin, batch.sampleRate, batch.binsPerSnapshot),
    )
}

function calculateLocalNoiseFloorDb(
  spectrum: Uint8Array,
  centerBin: number,
  totalBins: number,
): number {
  let sumDb = 0
  let count = 0
  const start = Math.max(0, centerBin - LOCAL_NOISE_RADIUS)
  const end = Math.min(totalBins - 1, centerBin + LOCAL_NOISE_RADIUS)

  for (let bin = start; bin <= end; bin++) {
    if (Math.abs(bin - centerBin) <= LOCAL_NOISE_GAP) continue
    sumDb += byteToDb(spectrum[bin])
    count++
  }

  return count > 0 ? sumDb / count : SNAPSHOT_FIXTURE_DB_MIN
}

function decodeSnapshotSpectrumDb(snapshot: SnapshotBatch['snapshots'][number]): Float32Array {
  const encoded = decodeSnapshotSpectrum(snapshot)
  const spectrumDb = new Float32Array(encoded.length)
  for (let index = 0; index < encoded.length; index++) {
    spectrumDb[index] = byteToDb(encoded[index])
  }
  return spectrumDb
}

function snapshotEffectiveFftSize(batch: SnapshotBatch): number {
  return 2 * (batch.binsPerSnapshot - 1)
}

function buildAdvisoryForFixture(
  fixture: LabeledSnapshotFixture,
  track: Track,
  severity: ClassificationResult['severity'],
  preset: DetectorSettings['eqPreset'],
): EQAdvisory {
  const recommendationContext = fixture.replayContext?.recommendationContext
  const clusterMinHz = fixture.replayContext?.clusterMinHz
  const clusterMaxHz = fixture.replayContext?.clusterMaxHz
  const advisory = generateEQAdvisory(
    track,
    severity,
    preset,
    undefined,
    undefined,
    undefined,
    undefined,
    recommendationContext,
  )

  if (clusterMinHz === undefined || clusterMaxHz === undefined) {
    return advisory
  }

  return {
    ...advisory,
    peq: generatePEQRecommendation(
      track,
      severity,
      preset,
      recommendationContext,
      clusterMinHz,
      clusterMaxHz,
    ),
  }
}

function calculateMeanVelocity(points: readonly SnapshotTrackPoint[]): number {
  const velocities = collectVelocities(points)
  return velocities.length > 0 ? average(velocities) : 0
}

function calculateMaxVelocity(points: readonly SnapshotTrackPoint[]): number {
  const velocities = collectVelocities(points).map((value) => Math.abs(value))
  return velocities.length > 0 ? Math.max(...velocities) : 0
}

function collectVelocities(points: readonly SnapshotTrackPoint[]): number[] {
  const velocities: number[] = []
  for (let index = 1; index < points.length; index++) {
    const deltaMs = points[index].time - points[index - 1].time
    if (deltaMs <= 0) continue
    const deltaDb = points[index].amplitudeDb - points[index - 1].amplitudeDb
    velocities.push(deltaDb / (deltaMs / 1000))
  }
  return velocities
}

function calculateStabilityCentsStd(
  referenceFrequencyHz: number,
  frequencies: readonly number[],
): number {
  if (frequencies.length === 0 || referenceFrequencyHz <= 0) return 0
  const centsValues = frequencies.map((frequency) =>
    1200 * Math.log2(frequency / referenceFrequencyHz),
  )
  return standardDeviation(centsValues)
}

function average(values: readonly number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function standardDeviation(values: readonly number[]): number {
  if (values.length === 0) return 0
  const mean = average(values)
  const variance = average(values.map((value) => {
    const delta = value - mean
    return delta * delta
  }))
  return Math.sqrt(variance)
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function centsDistance(leftHz: number, rightHz: number): number {
  if (leftHz <= 0 || rightHz <= 0) return Infinity
  return Math.abs(1200 * Math.log2(leftHz / rightHz))
}
