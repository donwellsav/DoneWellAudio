import { describe, expect, it } from 'vitest'
import { replaySnapshotFixture } from '@/autoresearch/snapshotReplay'
import { classifyTrackWithAlgorithms, shouldReportIssue } from '@/lib/dsp/classifier'
import { generatePEQRecommendation } from '@/lib/dsp/eqAdvisor'
import {
  buildFusionConfig,
  fuseAlgorithmResults,
  type AlgorithmScores,
  type FusedDetectionResult,
} from '@/lib/dsp/fusionEngine'
import { deriveDefaultDetectorSettings } from '@/lib/settings/defaultDetectorSettings'
import { SPEECH_WORSHIP_SNAPSHOT_FIXTURES } from '@/tests/fixtures/snapshots/speech-worship'
import { buildScores, type ScoreInput } from '@/tests/helpers/mockAlgorithmScores'
import type { ContentType, DetectorSettings, Track } from '@/types/advisory'
import type { ModeId } from '@/types/settings'

interface SyntheticScenarioInput {
  mode?: ModeId
  contentType?: ContentType
  scoreInput: ScoreInput
  trackOverrides?: Partial<Track>
  settingsOverrides?: Partial<DetectorSettings>
  activeFrequencies?: number[]
  fusionOverrides?: Partial<FusedDetectionResult>
}

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'validation-track',
    binIndex: 170,
    trueFrequencyHz: 1000,
    trueAmplitudeDb: -20,
    prominenceDb: 15,
    onsetTime: Date.now() - 2000,
    onsetDb: -25,
    lastUpdateTime: Date.now(),
    history: [],
    features: {
      stabilityCentsStd: 5,
      meanQ: 30,
      minQ: 20,
      meanVelocityDbPerSec: 1,
      maxVelocityDbPerSec: 3,
      persistenceMs: 1000,
      harmonicityScore: 0.2,
      modulationScore: 0.1,
      noiseSidebandScore: 0.05,
    },
    qEstimate: 30,
    bandwidthHz: 33,
    velocityDbPerSec: 1,
    harmonicOfHz: null,
    isSubHarmonicRoot: false,
    isActive: true,
    ...overrides,
  } as Track
}

function findFixture(id: string) {
  const fixture = SPEECH_WORSHIP_SNAPSHOT_FIXTURES.find((candidate) => candidate.id === id)
  expect(fixture).toBeDefined()
  return fixture!
}

function buildSyntheticScenario({
  mode = 'speech',
  contentType = 'unknown',
  scoreInput,
  trackOverrides,
  settingsOverrides,
  activeFrequencies,
  fusionOverrides,
}: SyntheticScenarioInput) {
  const settings: DetectorSettings = {
    ...deriveDefaultDetectorSettings(mode),
    ...settingsOverrides,
  }
  const track = makeTrack(trackOverrides)
  const algorithmScores = buildScores(scoreInput)
  const fusionBase = fuseAlgorithmResults(
    algorithmScores,
    contentType,
    buildFusionConfig(settings),
    track.trueFrequencyHz,
  )
  const fusionResult: FusedDetectionResult = {
    ...fusionBase,
    ...fusionOverrides,
    algorithmScores,
  }
  const classification = classifyTrackWithAlgorithms(
    track,
    algorithmScores,
    fusionResult,
    settings,
    activeFrequencies ?? [track.trueFrequencyHz],
  )

  return {
    settings,
    track,
    algorithmScores,
    fusionResult,
    classification,
    reportable: shouldReportIssue(classification, settings),
  }
}

describe('validation matrix', () => {
  describe('snapshot sentinels', () => {
    it('keeps sustained speech-formant fixtures out of the advisory path', () => {
      const replay = replaySnapshotFixture(findFixture('speech-sustained-vowel-formants-980hz'))

      expect(replay.classification.speechLikePattern).toBe(true)
      expect(replay.fusionResult.verdict).not.toBe('FEEDBACK')
      expect(replay.reportable).toBe(false)
      expect(replay.advisory).toBeNull()
    })

    it('keeps real 3.15 kHz speech feedback urgent and narrow', () => {
      const replay = replaySnapshotFixture(findFixture('speech-limiter-clamped-feedback-3150hz'))

      expect(replay.classification.label).toBe('ACOUSTIC_FEEDBACK')
      expect(['RUNAWAY', 'GROWING']).toContain(replay.classification.severity)
      expect(replay.reportable).toBe(true)
      expect(replay.advisory).not.toBeNull()
      expect(replay.advisory?.peq.strategy).toBe('narrow-cut')
    })

    it('promotes whistle-shaped replay feedback back onto the corrective path', () => {
      const replay = replaySnapshotFixture(findFixture('speech-whistle-shaped-feedback-180hz'))

      expect(replay.classification.label).toBe('ACOUSTIC_FEEDBACK')
      expect(replay.classification.reasons).toContain(
        'Whistle-shaped tone retained as feedback due to growth/fusion evidence',
      )
      expect(replay.reportable).toBe(true)
      expect(replay.advisory).not.toBeNull()
    })

    it('keeps the ambiguous early ring on the narrow-cut advisory path', () => {
      const replay = replaySnapshotFixture(findFixture('speech-ambiguous-ring-630hz'))

      expect(replay.fusionResult.verdict).toBe('POSSIBLE_FEEDBACK')
      expect(replay.reportable).toBe(true)
      expect(replay.advisory).not.toBeNull()
      expect(replay.advisory?.peq.strategy).toBe('narrow-cut')
    })
  })

  describe('mode-aware suppression', () => {
    it('keeps room-like low-band buildup out of speech while monitors can still surface it', () => {
      const sharedTrack: Partial<Track> = {
        trueFrequencyHz: 90,
        trueAmplitudeDb: -18,
        onsetDb: -22,
        prominenceDb: 12,
        qEstimate: 9,
        bandwidthHz: 10,
        velocityDbPerSec: 0.4,
        features: {
          stabilityCentsStd: 4,
          harmonicityScore: 0.22,
          modulationScore: 0.05,
          noiseSidebandScore: 0.03,
          meanQ: 9,
          minQ: 9,
          meanVelocityDbPerSec: 0.4,
          maxVelocityDbPerSec: 0.7,
          persistenceMs: 1500,
        },
      }
      const sharedScores: ScoreInput = {
        msd: 0.78,
        phase: 0.72,
        spectral: 0.48,
        ihr: 0.3,
        ptmr: 0.45,
        msdFrames: 20,
      }
      const roomOverrides: Partial<DetectorSettings> = {
        roomPreset: 'small',
        roomRT60: 0.4,
        roomVolume: 80,
        roomLengthM: 6.1,
        roomWidthM: 4.6,
        roomHeightM: 2.9,
      }

      const speech = buildSyntheticScenario({
        mode: 'speech',
        scoreInput: sharedScores,
        trackOverrides: sharedTrack,
        settingsOverrides: roomOverrides,
        activeFrequencies: [82, 90, 99],
        fusionOverrides: {
          verdict: 'POSSIBLE_FEEDBACK',
          feedbackProbability: 0.49,
          confidence: 0.43,
          reasons: ['borderline low-band evidence'],
        },
      })
      const monitors = buildSyntheticScenario({
        mode: 'monitors',
        scoreInput: sharedScores,
        trackOverrides: sharedTrack,
        settingsOverrides: roomOverrides,
        activeFrequencies: [82, 90, 99],
        fusionOverrides: {
          verdict: 'POSSIBLE_FEEDBACK',
          feedbackProbability: 0.49,
          confidence: 0.43,
          reasons: ['borderline low-band evidence'],
        },
      })

      expect(speech.classification.roomModeRisk).toBe(true)
      expect(speech.classification.severity).toBe('RESONANCE')
      expect(speech.reportable).toBe(false)
      expect(monitors.reportable).toBe(true)
    })

    it('keeps compressed phase-dominant music from escalating into an actionable liveMusic alert', () => {
      const uncompressed = buildSyntheticScenario({
        mode: 'liveMusic',
        contentType: 'music',
        scoreInput: {
          msd: 0.58,
          phase: 0.96,
          spectral: 0.72,
          ihr: 0.42,
          ptmr: 0.55,
          msdFrames: 20,
        },
        trackOverrides: {
          trueFrequencyHz: 1560,
          prominenceDb: 11,
          qEstimate: 7,
          bandwidthHz: 160,
          velocityDbPerSec: 0.2,
          features: {
            stabilityCentsStd: 8,
            harmonicityScore: 0.25,
            modulationScore: 0.05,
            noiseSidebandScore: 0.05,
            meanQ: 7,
            minQ: 6,
            meanVelocityDbPerSec: 0.2,
            maxVelocityDbPerSec: 0.4,
            persistenceMs: 1400,
          },
        },
      })
      const compressed = buildSyntheticScenario({
        mode: 'liveMusic',
        contentType: 'music',
        scoreInput: {
          msd: 0.58,
          phase: 0.96,
          spectral: 0.72,
          ihr: 0.42,
          ptmr: 0.55,
          compressed: true,
          msdFrames: 20,
        },
        trackOverrides: {
          trueFrequencyHz: 1560,
          prominenceDb: 11,
          qEstimate: 7,
          bandwidthHz: 160,
          velocityDbPerSec: 0.2,
          features: {
            stabilityCentsStd: 8,
            harmonicityScore: 0.25,
            modulationScore: 0.05,
            noiseSidebandScore: 0.05,
            meanQ: 7,
            minQ: 6,
            meanVelocityDbPerSec: 0.2,
            maxVelocityDbPerSec: 0.4,
            persistenceMs: 1400,
          },
        },
      })

      expect(compressed.fusionResult.feedbackProbability).toBeLessThan(uncompressed.fusionResult.feedbackProbability)
      expect(compressed.fusionResult.reasons).toContain('Compressed tonal-source gate: phase-dominant sustained source')
      expect(compressed.classification.severity).not.toBe('RUNAWAY')
      expect(compressed.reportable).toBe(false)
    })

    it('suppresses hum-series peaks once a mains harmonic stack is corroborated', () => {
      const baseScenario = {
        mode: 'speech' as const,
        scoreInput: {
          msd: 0.42,
          phase: 0.96,
          spectral: 0.66,
          ihr: 0.78,
          ptmr: 0.62,
          msdFrames: 20,
        },
        trackOverrides: {
          trueFrequencyHz: 180,
          prominenceDb: 9,
          qEstimate: 10,
          bandwidthHz: 18,
          velocityDbPerSec: 0.1,
          features: {
            stabilityCentsStd: 4,
            harmonicityScore: 0.1,
            modulationScore: 0.02,
            noiseSidebandScore: 0.02,
            meanQ: 10,
            minQ: 10,
            meanVelocityDbPerSec: 0.1,
            maxVelocityDbPerSec: 0.2,
            persistenceMs: 1600,
          },
        },
        activeFrequencies: [60, 120, 180, 240],
        fusionOverrides: {
          verdict: 'POSSIBLE_FEEDBACK' as const,
          feedbackProbability: 0.52,
          confidence: 0.46,
          reasons: ['borderline narrow hum line'],
        },
      }

      const humDisabled = buildSyntheticScenario({
        ...baseScenario,
        settingsOverrides: {
          mainsHumEnabled: false,
        },
      })
      const humEnabled = buildSyntheticScenario({
        ...baseScenario,
        settingsOverrides: {
          mainsHumEnabled: true,
          mainsHumFundamental: 60,
        },
      })

      expect(humEnabled.classification.reasons.some((reason) => reason.includes('Mains hum gate'))).toBe(true)
      expect(humEnabled.classification.pFeedback).toBeLessThan(humDisabled.classification.pFeedback)
      expect(humDisabled.reportable).toBe(true)
    })
  })

  describe('recommendation framing', () => {
    it('distinguishes a single narrow offender from a merged ring-out cluster', () => {
      const track = makeTrack({
        trueFrequencyHz: 1000,
        qEstimate: 10,
        bandwidthHz: 80,
      })

      const narrow = generatePEQRecommendation(track, 'POSSIBLE_RING', 'surgical')
      const cluster = generatePEQRecommendation(
        track,
        'POSSIBLE_RING',
        'surgical',
        undefined,
        900,
        1120,
      )

      expect(narrow.strategy).toBe('narrow-cut')
      expect(narrow.reason).toBeUndefined()
      expect(cluster.strategy).toBe('broad-region')
      expect(cluster.reason).toMatch(/unstable region/i)
      expect(cluster.q).toBeLessThan(narrow.q)
    })
  })

  describe('display-only invariants', () => {
    it('keeps detector and advisory decisions identical across raw and perceptual spectrum views', () => {
      const scoreInput: ScoreInput = {
        msd: 0.64,
        phase: 0.72,
        spectral: 0.58,
        ihr: 0.52,
        ptmr: 0.61,
        msdFrames: 20,
      }
      const trackOverrides: Partial<Track> = {
        trueFrequencyHz: 2500,
        prominenceDb: 14,
        qEstimate: 18,
        bandwidthHz: 55,
        velocityDbPerSec: 1.6,
        features: {
          stabilityCentsStd: 3,
          harmonicityScore: 0.18,
          modulationScore: 0.04,
          noiseSidebandScore: 0.03,
          meanQ: 18,
          minQ: 16,
          meanVelocityDbPerSec: 1.2,
          maxVelocityDbPerSec: 1.6,
          persistenceMs: 1300,
        },
      }

      const raw = buildSyntheticScenario({
        mode: 'speech',
        scoreInput,
        trackOverrides,
        settingsOverrides: {
          spectrumSmoothingMode: 'raw',
        },
      })
      const perceptual = buildSyntheticScenario({
        mode: 'speech',
        scoreInput,
        trackOverrides,
        settingsOverrides: {
          spectrumSmoothingMode: 'perceptual',
        },
      })

      expect(perceptual.fusionResult).toEqual(raw.fusionResult)
      expect(perceptual.classification).toEqual(raw.classification)
      expect(perceptual.reportable).toBe(raw.reportable)
    })
  })
})
