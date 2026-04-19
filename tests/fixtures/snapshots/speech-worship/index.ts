import { DEFAULT_FUSION_CONFIG, fuseAlgorithmResults } from '@/lib/dsp/fusionEngine'
import {
  dbToByte,
  encodeSnapshotSpectrum,
  frequencyToSnapshotBin,
  normalizeImportedSnapshotFixture,
  type LabeledSnapshotFixture,
  type SnapshotReplayContext,
} from '@/autoresearch/snapshotFixtures'
import { buildScores, type ScoreInput } from '@/tests/helpers/mockAlgorithmScores'
import type { MarkerAlgorithmScores, SnapshotBatch } from '@/types/data'
import type { ContentType, SeverityLevel } from '@/types/advisory'
import type { FeedbackVerdict } from '@/autoresearch/scenarios'

interface SeedPeakSpec {
  frequencyHz: number
  amplitudeDb: number
  widthBins?: number
  falloffDbPerBin?: number
}

interface SeedSpectrumBedSpec {
  centerDb: number
  edgeDb: number
  rippleDb?: number
}

interface SeedFrameSpec {
  t: number
  mainAmplitudeDb: number
  mainFrequencyHz?: number
  extraPeaks?: SeedPeakSpec[]
}

interface SeedFixtureSpec {
  id: string
  mode: 'speech' | 'worship'
  contentType: ContentType
  severity: SeverityLevel
  userFeedback: 'correct' | 'false_positive' | 'confirmed_feedback'
  acceptableVerdicts: FeedbackVerdict[]
  expectAdvisory: boolean
  eventFrequencyHz: number
  eventRelativeMs: number
  mainWidthBins: number
  mainFalloffDbPerBin?: number
  algorithmScores: ScoreInput & { ml?: number | null }
  frames: SeedFrameSpec[]
  expectedLabel?: 'ACOUSTIC_FEEDBACK' | 'POSSIBLE_RING' | 'WHISTLE' | 'INSTRUMENT'
  expectedSeverity?: SeverityLevel
  notes: string
  replayContext?: SnapshotReplayContext
  spectrumBed?: SeedSpectrumBedSpec
}

const SAMPLE_RATE = 48_000
const FFT_SIZE = 8192
const BINS_PER_SNAPSHOT = 512
const FLOOR_DB = -82
const FIXTURE_NOTE_PREFIX =
  'Seed snapshot fixture shaped like SnapshotBatch for replay/testing; not a field-captured session export.'

const BASE_TIMES = [900, 1050, 1200, 1350, 1500, 1650, 1800, 1950, 2100, 2250]

const SPEECH_WORSHIP_FIXTURE_SPECS: SeedFixtureSpec[] = [
  {
    id: 'speech-sustained-vowel-formants-980hz',
    mode: 'speech',
    contentType: 'speech',
    severity: 'RESONANCE',
    userFeedback: 'false_positive',
    acceptableVerdicts: ['NOT_FEEDBACK', 'UNCERTAIN'],
    expectAdvisory: false,
    eventFrequencyHz: 980,
    eventRelativeMs: 1650,
    mainWidthBins: 6,
    mainFalloffDbPerBin: 1.5,
    algorithmScores: { msd: 0.82, phase: 0.72, spectral: 0.45, ihr: 0.24, ptmr: 0.35, comb: 0, ml: 0.15 },
    frames: BASE_TIMES.map((time, index) => ({
      t: time,
      mainAmplitudeDb: -29,
      mainFrequencyHz: index % 2 === 0 ? 980 : 1027,
      extraPeaks: [
        { frequencyHz: 520, amplitudeDb: -33, widthBins: 6, falloffDbPerBin: 1.5 },
        { frequencyHz: 1550, amplitudeDb: -32, widthBins: 6, falloffDbPerBin: 1.5 },
        { frequencyHz: 2850, amplitudeDb: -33, widthBins: 6, falloffDbPerBin: 1.5 },
      ],
    })),
    notes: `${FIXTURE_NOTE_PREFIX} Sustained vowel / formant cluster false positive target.`,
  },
  {
    id: 'speech-vowel-presence-cluster-1410hz',
    mode: 'speech',
    contentType: 'speech',
    severity: 'RESONANCE',
    userFeedback: 'false_positive',
    acceptableVerdicts: ['NOT_FEEDBACK', 'UNCERTAIN'],
    expectAdvisory: false,
    eventFrequencyHz: 1410,
    eventRelativeMs: 1650,
    mainWidthBins: 6,
    mainFalloffDbPerBin: 1.5,
    algorithmScores: { msd: 0.52, phase: 0.47, spectral: 0.32, ihr: 0.22, ptmr: 0.18, comb: 0, ml: 0.05 },
    frames: BASE_TIMES.map((time, index) => ({
      t: time,
      mainAmplitudeDb: -30,
      mainFrequencyHz: index % 2 === 0 ? 1410 : 1457,
      extraPeaks: [
        { frequencyHz: 430, amplitudeDb: -34, widthBins: 6, falloffDbPerBin: 1.5 },
        { frequencyHz: 1740, amplitudeDb: -32, widthBins: 6, falloffDbPerBin: 1.5 },
        { frequencyHz: 3040, amplitudeDb: -33, widthBins: 6, falloffDbPerBin: 1.5 },
      ],
    })),
    notes: `${FIXTURE_NOTE_PREFIX} Long-vowel / presence-band speech false positive target.`,
  },
  {
    id: 'speech-compressed-pastor-1560hz',
    mode: 'speech',
    contentType: 'compressed',
    severity: 'RESONANCE',
    userFeedback: 'false_positive',
    acceptableVerdicts: ['NOT_FEEDBACK', 'UNCERTAIN'],
    expectAdvisory: false,
    eventFrequencyHz: 1560,
    eventRelativeMs: 1650,
    mainWidthBins: 6,
    mainFalloffDbPerBin: 1.5,
    algorithmScores: { msd: 0.42, phase: 0.76, spectral: 0.55, ihr: 0.35, ptmr: 0.18, comb: 0, compressed: true, ml: 0.06 },
    frames: BASE_TIMES.map((time, index) => ({
      t: time,
      mainAmplitudeDb: -27.5,
      mainFrequencyHz: index % 2 === 0 ? 1560 : 1607,
      extraPeaks: [
        { frequencyHz: 540, amplitudeDb: -31, widthBins: 6, falloffDbPerBin: 1.5 },
        { frequencyHz: 1640, amplitudeDb: -29, widthBins: 6, falloffDbPerBin: 1.5 },
        { frequencyHz: 2920, amplitudeDb: -32, widthBins: 6, falloffDbPerBin: 1.5 },
      ],
    })),
    notes: `${FIXTURE_NOTE_PREFIX} Compressed pastor mic false positive target.`,
  },
  {
    id: 'worship-compressed-podium-1240hz',
    mode: 'worship',
    contentType: 'compressed',
    severity: 'RESONANCE',
    userFeedback: 'false_positive',
    acceptableVerdicts: ['NOT_FEEDBACK', 'UNCERTAIN'],
    expectAdvisory: false,
    eventFrequencyHz: 1240,
    eventRelativeMs: 1650,
    mainWidthBins: 6,
    mainFalloffDbPerBin: 1.5,
    algorithmScores: { msd: 0.4, phase: 0.74, spectral: 0.52, ihr: 0.36, ptmr: 0.18, comb: 0, compressed: true, ml: 0.06 },
    frames: BASE_TIMES.map((time, index) => ({
      t: time,
      mainAmplitudeDb: -28,
      mainFrequencyHz: index % 2 === 0 ? 1240 : 1287,
      extraPeaks: [
        { frequencyHz: 390, amplitudeDb: -32, widthBins: 6, falloffDbPerBin: 1.5 },
        { frequencyHz: 1360, amplitudeDb: -30, widthBins: 6, falloffDbPerBin: 1.5 },
        { frequencyHz: 2520, amplitudeDb: -33, widthBins: 6, falloffDbPerBin: 1.5 },
      ],
    })),
    notes: `${FIXTURE_NOTE_PREFIX} Worship podium speech / compressor false positive target.`,
  },
  {
    id: 'speech-formant-cluster-2380hz',
    mode: 'speech',
    contentType: 'speech',
    severity: 'RESONANCE',
    userFeedback: 'false_positive',
    acceptableVerdicts: ['NOT_FEEDBACK', 'UNCERTAIN'],
    expectAdvisory: false,
    eventFrequencyHz: 2380,
    eventRelativeMs: 1650,
    mainWidthBins: 7,
    mainFalloffDbPerBin: 1.2,
    algorithmScores: { msd: 0.45, phase: 0.46, spectral: 0.36, ihr: 0.28, ptmr: 0.15, comb: 0, ml: 0.05 },
    frames: BASE_TIMES.map((time, index) => ({
      t: time,
      mainAmplitudeDb: -31,
      mainFrequencyHz: index % 2 === 0 ? 2380 : 2427,
      extraPeaks: [
        { frequencyHz: 500, amplitudeDb: -32, widthBins: 6, falloffDbPerBin: 1.5 },
        { frequencyHz: 1180, amplitudeDb: -31, widthBins: 6, falloffDbPerBin: 1.5 },
        { frequencyHz: 2600, amplitudeDb: -30, widthBins: 6, falloffDbPerBin: 1.5 },
      ],
    })),
    notes: `${FIXTURE_NOTE_PREFIX} Speech formant cluster false positive target.`,
  },
  {
    id: 'worship-choir-vowel-890hz',
    mode: 'worship',
    contentType: 'speech',
    severity: 'RESONANCE',
    userFeedback: 'false_positive',
    acceptableVerdicts: ['NOT_FEEDBACK', 'UNCERTAIN'],
    expectAdvisory: false,
    eventFrequencyHz: 890,
    eventRelativeMs: 1650,
    mainWidthBins: 6,
    mainFalloffDbPerBin: 1.5,
    algorithmScores: { msd: 0.48, phase: 0.45, spectral: 0.38, ihr: 0.3, ptmr: 0.15, comb: 0, ml: 0.06 },
    frames: BASE_TIMES.map((time, index) => ({
      t: time,
      mainAmplitudeDb: -30,
      mainFrequencyHz: index % 2 === 0 ? 890 : 937,
      extraPeaks: [
        { frequencyHz: 460, amplitudeDb: -33, widthBins: 6, falloffDbPerBin: 1.5 },
        { frequencyHz: 1480, amplitudeDb: -31, widthBins: 6, falloffDbPerBin: 1.5 },
        { frequencyHz: 2740, amplitudeDb: -32, widthBins: 6, falloffDbPerBin: 1.5 },
      ],
    })),
    notes: `${FIXTURE_NOTE_PREFIX} Choir vowel false positive target for worship-mode reporting.`,
  },
  {
    id: 'speech-limiter-clamped-feedback-3150hz',
    mode: 'speech',
    contentType: 'speech',
    severity: 'GROWING',
    userFeedback: 'confirmed_feedback',
    acceptableVerdicts: ['FEEDBACK'],
    expectAdvisory: true,
    eventFrequencyHz: 3150,
    eventRelativeMs: 1650,
    mainWidthBins: 1,
    algorithmScores: { msd: 0.1, phase: 0.9, spectral: 0.9, ihr: 0.9, ptmr: 0.9, comb: 0, ml: 0.86 },
    frames: BASE_TIMES.map((time, index) => ({
      t: time,
      mainAmplitudeDb: -38 + index * 1.4,
    })),
    expectedLabel: 'ACOUSTIC_FEEDBACK',
    expectedSeverity: 'GROWING',
    notes: `${FIXTURE_NOTE_PREFIX} Limiter-clamped real feedback target.`,
  },
  {
    id: 'worship-compressor-damaged-feedback-2450hz',
    mode: 'worship',
    contentType: 'compressed',
    severity: 'GROWING',
    userFeedback: 'confirmed_feedback',
    acceptableVerdicts: ['FEEDBACK'],
    expectAdvisory: true,
    eventFrequencyHz: 2450,
    eventRelativeMs: 1650,
    mainWidthBins: 1,
    algorithmScores: { msd: 0.8, phase: 0.2, spectral: 0.8, ihr: 0.9, ptmr: 0.8, comb: 0, compressed: true, ml: 0.82 },
    frames: BASE_TIMES.map((time, index) => ({
      t: time,
      mainAmplitudeDb: -36 + index * 1.3,
    })),
    expectedLabel: 'ACOUSTIC_FEEDBACK',
    expectedSeverity: 'GROWING',
    notes: `${FIXTURE_NOTE_PREFIX} Compressor-damaged real feedback target.`,
  },
  {
    id: 'worship-reverberant-feedback-420hz',
    mode: 'worship',
    contentType: 'unknown',
    severity: 'RESONANCE',
    userFeedback: 'confirmed_feedback',
    acceptableVerdicts: ['FEEDBACK', 'POSSIBLE_FEEDBACK'],
    expectAdvisory: true,
    eventFrequencyHz: 420,
    eventRelativeMs: 1650,
    mainWidthBins: 2,
    algorithmScores: { msd: 0.4, phase: 0.5, spectral: 0.9, ihr: 0.9, ptmr: 0.8, comb: 0, ml: 0.74 },
    frames: BASE_TIMES.map((time, index) => ({
      t: time,
      mainAmplitudeDb: -31 + (index > 4 ? 0.8 : 0),
      mainFrequencyHz: index % 2 === 0 ? 420 : 468,
    })),
    expectedLabel: 'ACOUSTIC_FEEDBACK',
    expectedSeverity: 'RESONANCE',
    notes: `${FIXTURE_NOTE_PREFIX} Reverberant low-band feedback target.`,
  },
  {
    id: 'worship-dense-band-masked-feedback-2720hz',
    mode: 'worship',
    contentType: 'music',
    severity: 'RESONANCE',
    userFeedback: 'confirmed_feedback',
    acceptableVerdicts: ['FEEDBACK', 'POSSIBLE_FEEDBACK'],
    expectAdvisory: true,
    eventFrequencyHz: 2720,
    eventRelativeMs: 1650,
    mainWidthBins: 2,
    algorithmScores: { msd: 0.6, phase: 0.3, spectral: 0.8, ihr: 0.8, ptmr: 0.7, comb: 0, ml: 0.78 },
    frames: BASE_TIMES.map((time, index) => ({
      t: time,
      mainAmplitudeDb: -34 + index * 0.9,
      extraPeaks: [
        { frequencyHz: 2280, amplitudeDb: -43, widthBins: 3 },
        { frequencyHz: 3110, amplitudeDb: -44, widthBins: 3 },
      ],
    })),
    expectedLabel: 'ACOUSTIC_FEEDBACK',
    expectedSeverity: 'RESONANCE',
    notes: `${FIXTURE_NOTE_PREFIX} Dense-band masked feedback target during worship music context.`,
  },
  {
    id: 'speech-whistle-shaped-feedback-180hz',
    mode: 'speech',
    contentType: 'speech',
    severity: 'RESONANCE',
    userFeedback: 'confirmed_feedback',
    acceptableVerdicts: ['FEEDBACK', 'POSSIBLE_FEEDBACK'],
    expectAdvisory: true,
    eventFrequencyHz: 180,
    eventRelativeMs: 1650,
    mainWidthBins: 5,
    mainFalloffDbPerBin: 1.2,
    algorithmScores: { msd: 0.82, phase: 0.86, spectral: 0.05, ihr: 0.82, ptmr: 0.74, comb: 0, ml: 0.81 },
    frames: BASE_TIMES.map((time, index) => ({
      t: time,
      mainAmplitudeDb: -24,
      mainFrequencyHz: index % 2 === 0 ? 180 : 260,
    })),
    expectedLabel: 'ACOUSTIC_FEEDBACK',
    expectedSeverity: 'RESONANCE',
    replayContext: {
      settingsOverrides: {
        roomPreset: 'custom',
        roomRT60: 2,
        roomVolume: 300,
      },
    },
    notes: `${FIXTURE_NOTE_PREFIX} Whistle-shaped low-band feedback target. Replay should retain the whistle signature but still promote it back to corrective feedback because the growth and fusion evidence stay actionable.`,
  },
  {
    id: 'speech-ambiguous-ring-630hz',
    mode: 'speech',
    contentType: 'speech',
    severity: 'POSSIBLE_RING',
    userFeedback: 'correct',
    acceptableVerdicts: ['POSSIBLE_FEEDBACK'],
    expectAdvisory: true,
    eventFrequencyHz: 630,
    eventRelativeMs: 1650,
    mainWidthBins: 2,
    algorithmScores: { msd: 0.54, phase: 0.58, spectral: 0.68, ihr: 0.66, ptmr: 0.62, comb: 0, ml: 0.58 },
    frames: BASE_TIMES.map((time, index) => ({
      t: time,
      mainAmplitudeDb: -37 + index * 0.7,
      mainFrequencyHz: index % 3 === 0 ? 630 : 676,
    })),
    expectedLabel: 'POSSIBLE_RING',
    expectedSeverity: 'POSSIBLE_RING',
    notes: `${FIXTURE_NOTE_PREFIX} Ambiguous early ring / possible-feedback target.`,
  },
  {
    id: 'worship-monitor-edge-feedback-1810hz',
    mode: 'worship',
    contentType: 'speech',
    severity: 'GROWING',
    userFeedback: 'confirmed_feedback',
    acceptableVerdicts: ['FEEDBACK'],
    expectAdvisory: true,
    eventFrequencyHz: 1810,
    eventRelativeMs: 1650,
    mainWidthBins: 1,
    algorithmScores: { msd: 0.72, phase: 0.84, spectral: 0.82, ihr: 0.88, ptmr: 0.8, comb: 0.1, ml: 0.84 },
    frames: BASE_TIMES.map((time, index) => ({
      t: time,
      mainAmplitudeDb: -35 + index * 1.1,
    })),
    expectedLabel: 'ACOUSTIC_FEEDBACK',
    expectedSeverity: 'GROWING',
    notes: `${FIXTURE_NOTE_PREFIX} Worship monitor-edge feedback target.`,
  },
  {
    id: 'speech-low-edge-feedback-180hz',
    mode: 'speech',
    contentType: 'speech',
    severity: 'GROWING',
    userFeedback: 'confirmed_feedback',
    acceptableVerdicts: ['FEEDBACK', 'POSSIBLE_FEEDBACK'],
    expectAdvisory: true,
    eventFrequencyHz: 180,
    eventRelativeMs: 1650,
    mainWidthBins: 8,
    mainFalloffDbPerBin: 0.5,
    algorithmScores: { msd: 0.68, phase: 0.88, spectral: 0.82, ihr: 0.9, ptmr: 0.81, comb: 0, ml: 0.8 },
    frames: BASE_TIMES.map((time, index) => ({
      t: time,
      mainAmplitudeDb: -39 + index * 1.1,
    })),
    expectedLabel: 'ACOUSTIC_FEEDBACK',
    expectedSeverity: 'GROWING',
    notes: `${FIXTURE_NOTE_PREFIX} Low-edge feedback target that should exercise mirrored bandwidth measurement and conservative low-frequency Q framing.`,
  },
  {
    id: 'worship-merged-cluster-feedback-1000hz',
    mode: 'worship',
    contentType: 'speech',
    severity: 'GROWING',
    userFeedback: 'confirmed_feedback',
    acceptableVerdicts: ['FEEDBACK', 'POSSIBLE_FEEDBACK'],
    expectAdvisory: true,
    eventFrequencyHz: 1000,
    eventRelativeMs: 1650,
    mainWidthBins: 2,
    algorithmScores: { msd: 0.64, phase: 0.8, spectral: 0.76, ihr: 0.82, ptmr: 0.74, comb: 0, ml: 0.77 },
    frames: BASE_TIMES.map((time, index) => ({
      t: time,
      mainAmplitudeDb: -38 + index * 0.95,
    })),
    expectedLabel: 'ACOUSTIC_FEEDBACK',
    expectedSeverity: 'GROWING',
    replayContext: {
      clusterMinHz: 900,
      clusterMaxHz: 1120,
    },
    notes: `${FIXTURE_NOTE_PREFIX} Feedback target with replay-side merged-cluster bounds so the advisory exercises the same broad-region widening used after AdvisoryManager dedup.`,
  },
  {
    id: 'speech-recurring-feedback-2500hz',
    mode: 'speech',
    contentType: 'speech',
    severity: 'GROWING',
    userFeedback: 'confirmed_feedback',
    acceptableVerdicts: ['FEEDBACK', 'POSSIBLE_FEEDBACK'],
    expectAdvisory: true,
    eventFrequencyHz: 2500,
    eventRelativeMs: 1650,
    mainWidthBins: 2,
    algorithmScores: { msd: 0.66, phase: 0.83, spectral: 0.8, ihr: 0.86, ptmr: 0.76, comb: 0, ml: 0.79 },
    frames: BASE_TIMES.map((time, index) => ({
      t: time,
      mainAmplitudeDb: -40 + index * 0.95,
    })),
    expectedLabel: 'ACOUSTIC_FEEDBACK',
    expectedSeverity: 'GROWING',
    replayContext: {
      recommendationContext: {
        recurrenceCount: 2,
      },
    },
    notes: `${FIXTURE_NOTE_PREFIX} Recurring feedback target with replay-side recurrence context so the advisory widens the cut before the final clamp.`,
  },
  {
    id: 'worship-defaulted-bandwidth-feedback-1000hz',
    mode: 'worship',
    contentType: 'speech',
    severity: 'GROWING',
    userFeedback: 'confirmed_feedback',
    acceptableVerdicts: ['FEEDBACK', 'POSSIBLE_FEEDBACK'],
    expectAdvisory: true,
    eventFrequencyHz: 1000,
    eventRelativeMs: 1650,
    mainWidthBins: 4,
    mainFalloffDbPerBin: 0.35,
    algorithmScores: { msd: 0.69, phase: 0.82, spectral: 0.84, ihr: 0.88, ptmr: 0.79, comb: 0, ml: 0.81 },
    spectrumBed: {
      centerDb: -10.8,
      edgeDb: -11.7,
      rippleDb: 0.1,
    },
    frames: BASE_TIMES.map((time, index) => ({
      t: time,
      mainAmplitudeDb: -10.8 + index * 0.18,
    })),
    expectedLabel: 'ACOUSTIC_FEEDBACK',
    expectedSeverity: 'GROWING',
    notes: `${FIXTURE_NOTE_PREFIX} Overloaded broadband frame with a dominant feedback line; still forces defaulted bandwidth measurement because the hot bed never drops 3 dB below the line within the replay window.`,
  },
]

export const SPEECH_WORSHIP_SNAPSHOT_FIXTURES: LabeledSnapshotFixture[] =
  SPEECH_WORSHIP_FIXTURE_SPECS.map(buildFixtureFromSeed)

function buildFixtureFromSeed(seed: SeedFixtureSpec): LabeledSnapshotFixture {
  const capturedScores = buildCapturedAlgorithmScores(seed)
  const batch: SnapshotBatch = {
    version: '1.2',
    sessionId: `seed-${seed.id}`,
    capturedAt: '2026-04-14T00:00:00.000Z',
    fftSize: FFT_SIZE,
    sampleRate: SAMPLE_RATE,
    binsPerSnapshot: BINS_PER_SNAPSHOT,
    event: {
      relativeMs: seed.eventRelativeMs,
      frequencyHz: seed.eventFrequencyHz,
      amplitudeDb: amplitudeAtOrNear(seed.frames, seed.eventRelativeMs),
      severity: seed.severity,
      confidence: capturedScores.fusedConfidence,
      contentType: seed.contentType,
      algorithmScores: capturedScores,
      userFeedback: seed.userFeedback,
    },
    snapshots: seed.frames.map((frame, frameIndex) => ({
      t: frame.t,
      s: encodeSnapshotSpectrum(
        buildSnapshotSpectrum(seed, frame, frameIndex),
      ),
    })),
  }

  return normalizeImportedSnapshotFixture({
    id: seed.id,
    mode: seed.mode,
    batch,
    acceptableVerdicts: seed.acceptableVerdicts,
    expectAdvisory: seed.expectAdvisory,
    expectedLabel: seed.expectedLabel,
    expectedSeverity: seed.expectedSeverity,
    notes: seed.notes,
    replayContext: seed.replayContext,
  })
}

function buildCapturedAlgorithmScores(seed: SeedFixtureSpec): MarkerAlgorithmScores {
  const scores = buildScores({
    msd: seed.algorithmScores.msd,
    phase: seed.algorithmScores.phase,
    spectral: seed.algorithmScores.spectral,
    comb: seed.algorithmScores.comb,
    ihr: seed.algorithmScores.ihr,
    ptmr: seed.algorithmScores.ptmr,
    compressed: seed.contentType === 'compressed' || seed.algorithmScores.compressed === true,
    msdFrames: seed.algorithmScores.msdFrames ?? 20,
  })

  if (seed.algorithmScores.ml != null) {
    scores.ml = {
      feedbackScore: seed.algorithmScores.ml,
      modelConfidence: 1,
      isAvailable: true,
      modelVersion: 'fixture-ml-v1',
    }
  }

  const fusion = fuseAlgorithmResults(
    scores,
    seed.contentType,
    DEFAULT_FUSION_CONFIG,
    seed.eventFrequencyHz,
  )

  return {
    msd: seed.algorithmScores.msd ?? null,
    phase: seed.algorithmScores.phase ?? null,
    spectral: seed.algorithmScores.spectral ?? null,
    comb: seed.algorithmScores.comb ?? null,
    ihr: seed.algorithmScores.ihr ?? null,
    ptmr: seed.algorithmScores.ptmr ?? null,
    ml: seed.algorithmScores.ml ?? null,
    fusedProbability: fusion.feedbackProbability,
    fusedConfidence: fusion.confidence,
    modelVersion: seed.algorithmScores.ml != null ? 'fixture-ml-v1' : null,
  }
}

function buildSnapshotSpectrum(
  seed: SeedFixtureSpec,
  frame: SeedFrameSpec,
  frameIndex: number,
): Uint8Array {
  const spectrumDb = new Array<number>(BINS_PER_SNAPSHOT).fill(FLOOR_DB)

  for (let bin = 0; bin < spectrumDb.length; bin++) {
    const ripple =
      Math.sin((bin + frameIndex * 7) * 0.09) * 1.2
      + Math.cos((bin + frameIndex * 5) * 0.03) * 0.8
    spectrumDb[bin] += ripple
  }

  if (seed.spectrumBed) {
    paintSpectrumBed(
      spectrumDb,
      seed.eventFrequencyHz,
      seed.spectrumBed,
      frameIndex,
    )
  }

  paintPeak(
    spectrumDb,
    frame.mainFrequencyHz ?? seed.eventFrequencyHz,
    frame.mainAmplitudeDb,
    seed.mainWidthBins,
    seed.mainFalloffDbPerBin ?? 4,
  )

  for (const peak of frame.extraPeaks ?? []) {
    paintPeak(
      spectrumDb,
      peak.frequencyHz,
      peak.amplitudeDb,
      peak.widthBins ?? 3,
      peak.falloffDbPerBin ?? 4,
    )
  }

  return Uint8Array.from(spectrumDb.map((value) => dbToByte(value)))
}

function paintSpectrumBed(
  spectrumDb: number[],
  centerFrequencyHz: number,
  bed: SeedSpectrumBedSpec,
  frameIndex: number,
): void {
  const centerBin = frequencyToSnapshotBin(
    centerFrequencyHz,
    SAMPLE_RATE,
    BINS_PER_SNAPSHOT,
  )
  const centerDeltaDb = bed.centerDb - bed.edgeDb
  const rippleDb = bed.rippleDb ?? 0.15

  for (let bin = 0; bin < spectrumDb.length; bin++) {
    const normalizedDistance = Math.abs(bin - centerBin) / Math.max(1, spectrumDb.length - 1)
    const bowlDb = bed.centerDb - centerDeltaDb * Math.pow(normalizedDistance, 1.15)
    const ripple =
      Math.sin((bin + frameIndex * 4) * 0.08) * rippleDb +
      Math.cos((bin + frameIndex * 3) * 0.03) * rippleDb * 0.5
    const candidateDb = bowlDb + ripple
    if (candidateDb > spectrumDb[bin]) {
      spectrumDb[bin] = candidateDb
    }
  }
}

function paintPeak(
  spectrumDb: number[],
  frequencyHz: number,
  amplitudeDb: number,
  widthBins: number,
  falloffDbPerBin: number,
): void {
  const center = frequencyToSnapshotBin(frequencyHz, SAMPLE_RATE, BINS_PER_SNAPSHOT)
  for (let offset = -widthBins; offset <= widthBins; offset++) {
    const bin = center + offset
    if (bin < 0 || bin >= spectrumDb.length) continue
    const candidateDb = amplitudeDb - Math.abs(offset) * falloffDbPerBin
    if (candidateDb > spectrumDb[bin]) {
      spectrumDb[bin] = candidateDb
    }
  }
}

function amplitudeAtOrNear(
  frames: readonly SeedFrameSpec[],
  targetMs: number,
): number {
  let bestFrame = frames[0]
  let bestDistance = Infinity
  for (const frame of frames) {
    const distance = Math.abs(frame.t - targetMs)
    if (distance < bestDistance) {
      bestDistance = distance
      bestFrame = frame
    }
  }
  return bestFrame.mainAmplitudeDb
}
