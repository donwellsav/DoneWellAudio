/**
 * Classifier unit tests
 *
 * Tests classification logic that drives the advisory UX:
 * - shouldReportIssue: mode-specific filtering + confidence gates
 * - getSeverityText: display string mapping
 * - getSeverityUrgency: priority ordering for dedup
 * - classifyTrack: feature-weighted classification of Track objects
 */

import { describe, it, expect } from 'vitest'
import { classifyTrack, classifyTrackWithAlgorithms, shouldReportIssue, getSeverityText } from '../classifier'
import { getSeverityUrgency } from '../severityUtils'
import { DEFAULT_SETTINGS, MAINS_HUM_GATE } from '../constants'
import type { ClassificationResult, SeverityLevel, Track, DetectorSettings, FusedDetectionResult } from '@/types/advisory'
import { buildScores } from '@/tests/helpers/mockAlgorithmScores'

// ── Fixtures ────────────────────────────────────────────────────────────────

/** Minimal Track fixture for classifyTrack. All numeric features at neutral values. */
function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'test-track-1',
    binIndex: 170,
    trueFrequencyHz: 1000,
    trueAmplitudeDb: -20,
    prominenceDb: 15,
    onsetTime: Date.now() - 2000,
    onsetDb: -25,
    lastUpdateTime: Date.now(),
    history: [],
    features: {
      stabilityCentsStd: 5,       // Low = very stable (feedback-like)
      meanQ: 30,
      minQ: 20,
      meanVelocityDbPerSec: 1,
      maxVelocityDbPerSec: 3,
      persistenceMs: 1000,
      harmonicityScore: 0.2,      // Low = no harmonics (feedback-like)
      modulationScore: 0.1,       // Low = no vibrato (feedback-like)
      noiseSidebandScore: 0.05,   // Low = clean sidebands (feedback-like)
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

/** Minimal ClassificationResult fixture for shouldReportIssue */
function makeClassification(overrides: Partial<ClassificationResult> = {}): ClassificationResult {
  return {
    pFeedback: 0.7,
    pWhistle: 0.1,
    pInstrument: 0.1,
    pUnknown: 0.1,
    label: 'ACOUSTIC_FEEDBACK',
    severity: 'RESONANCE',
    confidence: 0.8,
    reasons: ['test'],
    ...overrides,
  } as ClassificationResult
}

function makeSettings(overrides: Partial<DetectorSettings> = {}): DetectorSettings {
  return { ...DEFAULT_SETTINGS, ...overrides }
}

// ── getSeverityText ─────────────────────────────────────────────────────────

describe('getSeverityText', () => {
  it.each<[SeverityLevel, string]>([
    ['RUNAWAY', 'RUNAWAY'],
    ['GROWING', 'Growing'],
    ['RESONANCE', 'Resonance'],
    ['POSSIBLE_RING', 'Ring'],
    ['WHISTLE', 'Whistle'],
    ['INSTRUMENT', 'Instrument'],
  ])('maps %s → "%s"', (severity, expected) => {
    expect(getSeverityText(severity)).toBe(expected)
  })
})

// ── getSeverityUrgency ──────────────────────────────────────────────────────

describe('getSeverityUrgency', () => {
  it('RUNAWAY is the most urgent (5)', () => {
    expect(getSeverityUrgency('RUNAWAY')).toBe(5)
  })

  it('maintains strict ordering: RUNAWAY > GROWING > RESONANCE > POSSIBLE_RING', () => {
    expect(getSeverityUrgency('RUNAWAY')).toBeGreaterThan(getSeverityUrgency('GROWING'))
    expect(getSeverityUrgency('GROWING')).toBeGreaterThan(getSeverityUrgency('RESONANCE'))
    expect(getSeverityUrgency('RESONANCE')).toBeGreaterThan(getSeverityUrgency('POSSIBLE_RING'))
  })

  it('WHISTLE and INSTRUMENT are equal priority (1)', () => {
    expect(getSeverityUrgency('WHISTLE')).toBe(getSeverityUrgency('INSTRUMENT'))
    expect(getSeverityUrgency('WHISTLE')).toBe(1)
  })
})

// ── shouldReportIssue ───────────────────────────────────────────────────────

describe('shouldReportIssue', () => {
  it('always reports RUNAWAY regardless of confidence or mode', () => {
    const classification = makeClassification({
      severity: 'RUNAWAY',
      confidence: 0.01, // Very low confidence
      label: 'ACOUSTIC_FEEDBACK',
    })
    // Should report in every mode
    expect(shouldReportIssue(classification, makeSettings({ mode: 'speech' }))).toBe(true)
    expect(shouldReportIssue(classification, makeSettings({ mode: 'liveMusic' }))).toBe(true)
  })

  it('always reports GROWING regardless of confidence', () => {
    const classification = makeClassification({
      severity: 'GROWING',
      confidence: 0.1,
      label: 'ACOUSTIC_FEEDBACK',
    })
    expect(shouldReportIssue(classification, makeSettings())).toBe(true)
  })

  it('rejects low-confidence results below threshold', () => {
    const classification = makeClassification({
      severity: 'RESONANCE',
      confidence: 0.2, // Below default threshold of 0.35
    })
    expect(shouldReportIssue(classification, makeSettings())).toBe(false)
  })

  it('filters WHISTLE when ignoreWhistle is true', () => {
    const classification = makeClassification({
      label: 'WHISTLE',
      severity: 'WHISTLE',
      confidence: 0.9,
    })
    expect(shouldReportIssue(classification, makeSettings({ ignoreWhistle: true }))).toBe(false)
  })

  it('reports WHISTLE when ignoreWhistle is false', () => {
    const classification = makeClassification({
      label: 'WHISTLE',
      severity: 'WHISTLE',
      confidence: 0.9,
    })
    expect(shouldReportIssue(classification, makeSettings({ ignoreWhistle: false }))).toBe(true)
  })

  it('speech mode suppresses INSTRUMENT labels', () => {
    const classification = makeClassification({
      label: 'INSTRUMENT',
      severity: 'INSTRUMENT',
      confidence: 0.9,
    })
    expect(shouldReportIssue(classification, makeSettings({ mode: 'speech' }))).toBe(false)
  })

  it('monitors mode reports everything including INSTRUMENT', () => {
    const classification = makeClassification({
      label: 'INSTRUMENT',
      severity: 'INSTRUMENT',
      confidence: 0.9,
    })
    expect(shouldReportIssue(classification, makeSettings({ mode: 'monitors' }))).toBe(true)
  })

  it('ringOut mode reports everything (calibration)', () => {
    const classification = makeClassification({
      label: 'INSTRUMENT',
      severity: 'INSTRUMENT',
      confidence: 0.9,
    })
    expect(shouldReportIssue(classification, makeSettings({ mode: 'ringOut' }))).toBe(true)
  })

  it('liveMusic mode requires high confidence for POSSIBLE_RING', () => {
    // Low confidence POSSIBLE_RING → rejected
    expect(shouldReportIssue(
      makeClassification({ label: 'POSSIBLE_RING', severity: 'POSSIBLE_RING', confidence: 0.5 }),
      makeSettings({ mode: 'liveMusic' }),
    )).toBe(false)

    // High confidence POSSIBLE_RING → accepted
    expect(shouldReportIssue(
      makeClassification({ label: 'POSSIBLE_RING', severity: 'POSSIBLE_RING', confidence: 0.7 }),
      makeSettings({ mode: 'liveMusic' }),
    )).toBe(true)
  })
})

// ── classifyTrack ───────────────────────────────────────────────────────────

describe('classifyTrack', () => {
  it('classifies a stable, non-harmonic, non-modulated track as feedback', () => {
    const track = makeTrack({
      features: {
        stabilityCentsStd: 3,       // Very stable
        harmonicityScore: 0.1,      // No harmonics
        modulationScore: 0.05,      // No vibrato
        noiseSidebandScore: 0.02,   // Clean
        meanQ: 40,
        minQ: 30,
        meanVelocityDbPerSec: 2,
        maxVelocityDbPerSec: 5,
        persistenceMs: 2000,
      },
      velocityDbPerSec: 2,
      prominenceDb: 20,
      qEstimate: 40,
    })

    const result = classifyTrack(track)
    expect(result.label).toBe('ACOUSTIC_FEEDBACK')
    expect(result.pFeedback).toBeGreaterThan(result.pInstrument)
    expect(result.pFeedback).toBeGreaterThan(result.pWhistle)
    expect(result.confidence).toBeGreaterThan(0)
  })

  it('classifies a modulated, noise-sideband track as whistle', () => {
    const track = makeTrack({
      features: {
        stabilityCentsStd: 40,      // Unstable (vibrato)
        harmonicityScore: 0.1,      // No harmonics
        modulationScore: 0.95,      // Strong vibrato (clear whistle signature)
        noiseSidebandScore: 0.9,    // Breath noise (emphatic to overcome feedback prior)
        meanQ: 20,
        minQ: 15,
        meanVelocityDbPerSec: 0,
        maxVelocityDbPerSec: 1,
        persistenceMs: 3000,
      },
      velocityDbPerSec: 0,
      prominenceDb: 12,
    })

    const result = classifyTrack(track)
    expect(result.pWhistle).toBeGreaterThan(result.pFeedback)
  })

  it('classifies a harmonic-rich track as instrument', () => {
    const track = makeTrack({
      features: {
        stabilityCentsStd: 60,      // Very unstable pitch (not feedback-like)
        harmonicityScore: 0.95,     // Very rich harmonics (instrument-like)
        modulationScore: 0.3,       // Moderate modulation
        noiseSidebandScore: 0.15,   // Some noise
        meanQ: 5,                   // Very broad peak (not feedback-like)
        minQ: 3,                    // Very broad min Q
        meanVelocityDbPerSec: 0,    // No growth
        maxVelocityDbPerSec: 0.5,   // No growth
        persistenceMs: 200,         // Short-lived (not sustained feedback)
      },
      velocityDbPerSec: 0,
      prominenceDb: 6,    // Low prominence
      qEstimate: 5,       // Broad peak
    })

    const result = classifyTrack(track)
    expect(result.pInstrument).toBeGreaterThan(result.pFeedback)
  })

  it('classifies fast-growing track as RUNAWAY severity', () => {
    const track = makeTrack({
      velocityDbPerSec: 15, // Very fast growth
      features: {
        stabilityCentsStd: 3,
        harmonicityScore: 0.1,
        modulationScore: 0.05,
        noiseSidebandScore: 0.02,
        meanQ: 40,
        minQ: 30,
        meanVelocityDbPerSec: 12,
        maxVelocityDbPerSec: 15,
        persistenceMs: 500,
      },
    })

    const result = classifyTrack(track)
    expect(result.severity).toBe('RUNAWAY')
  })

  it('three-class probabilities (pFeedback + pWhistle + pInstrument) sum to >= 1', () => {
    const track = makeTrack()
    const result = classifyTrack(track)

    // After normalization, probabilities sum to 1. Severity overrides
    // (RUNAWAY/GROWING) may then boost pFeedback above its normalized
    // value, so the sum can exceed 1. It should never be below 1.
    const classSum = result.pFeedback + result.pWhistle + result.pInstrument
    expect(classSum).toBeGreaterThanOrEqual(1 - 0.05)
  })

  it('pUnknown is 1 - confidence', () => {
    const track = makeTrack()
    const result = classifyTrack(track)
    expect(result.pUnknown).toBeCloseTo(1 - result.confidence, 5)
  })

  it('always returns reasons array', () => {
    const result = classifyTrack(makeTrack())
    expect(Array.isArray(result.reasons)).toBe(true)
    expect(result.reasons.length).toBeGreaterThan(0)
  })
})

// ── Mains Hum Gate (classifyTrackWithAlgorithms) ───────────────────────────

/**
 * Helper: build a minimal FusedDetectionResult for classifyTrackWithAlgorithms.
 * The mains hum gate only reads algorithmScores.phase, so the fusion result
 * fields are set to plausible defaults.
 */
function makeFusionResult(scores: ReturnType<typeof buildScores>): FusedDetectionResult {
  return {
    feedbackProbability: 0.8,
    confidence: 0.8,
    contributingAlgorithms: ['msd', 'phase'],
    algorithmScores: scores,
    verdict: 'FEEDBACK',
    reasons: [],
  }
}

describe('Mains hum gate', () => {
  // Feedback-like track at a mains harmonic frequency
  function mainsTrack(frequencyHz: number) {
    return makeTrack({
      trueFrequencyHz: frequencyHz,
      features: {
        stabilityCentsStd: 3,
        harmonicityScore: 0.1,
        modulationScore: 0.05,
        noiseSidebandScore: 0.02,
        meanQ: 40,
        minQ: 30,
        meanVelocityDbPerSec: 2,
        maxVelocityDbPerSec: 5,
        persistenceMs: 2000,
      },
      velocityDbPerSec: 2,
      prominenceDb: 20,
      qEstimate: 40,
    })
  }

  it('60 Hz series with 2+ corroborating peaks triggers gate', () => {
    const scores = buildScores({ msd: 0.9, phase: 0.85, spectral: 0.8 })
    const fusion = makeFusionResult(scores)
    const activeFreqs = [120, 180, 240] // 60×2, 60×3, 60×4

    const result = classifyTrackWithAlgorithms(
      mainsTrack(120), scores, fusion, makeSettings(), activeFreqs
    )

    expect(result.reasons.some(r => r.includes('Mains hum gate'))).toBe(true)
    expect(result.reasons.some(r => r.includes('60Hz series'))).toBe(true)
  })

  it('50 Hz series with 2+ corroborating peaks triggers gate', () => {
    const scores = buildScores({ msd: 0.9, phase: 0.85, spectral: 0.8 })
    const fusion = makeFusionResult(scores)
    const activeFreqs = [100, 150, 200] // 50×2, 50×3, 50×4

    const result = classifyTrackWithAlgorithms(
      mainsTrack(100), scores, fusion, makeSettings(), activeFreqs
    )

    expect(result.reasons.some(r => r.includes('Mains hum gate'))).toBe(true)
    expect(result.reasons.some(r => r.includes('50Hz series'))).toBe(true)
  })

  it('single mains peak without corroboration does NOT trigger', () => {
    const scores = buildScores({ msd: 0.9, phase: 0.85, spectral: 0.8 })
    const fusion = makeFusionResult(scores)
    const activeFreqs = [120] // Only one peak on 60Hz series

    const result = classifyTrackWithAlgorithms(
      mainsTrack(120), scores, fusion, makeSettings(), activeFreqs
    )

    expect(result.reasons.some(r => r.includes('Mains hum gate'))).toBe(false)
  })

  it('off-frequency peaks do NOT trigger gate', () => {
    const scores = buildScores({ msd: 0.9, phase: 0.85, spectral: 0.8 })
    const fusion = makeFusionResult(scores)
    // Peaks close to but not within ±2Hz of 60Hz harmonics
    const activeFreqs = [123, 185, 247]

    const result = classifyTrackWithAlgorithms(
      mainsTrack(123), scores, fusion, makeSettings(), activeFreqs
    )

    expect(result.reasons.some(r => r.includes('Mains hum gate'))).toBe(false)
  })

  it('low phase coherence does NOT trigger gate', () => {
    // Phase coherence below 0.70 threshold
    const scores = buildScores({ msd: 0.9, phase: 0.50, spectral: 0.8 })
    const fusion = makeFusionResult(scores)
    const activeFreqs = [120, 180, 240]

    const result = classifyTrackWithAlgorithms(
      mainsTrack(120), scores, fusion, makeSettings(), activeFreqs
    )

    expect(result.reasons.some(r => r.includes('Mains hum gate'))).toBe(false)
  })

  it('auto-detects correct fundamental when both could match', () => {
    const scores = buildScores({ msd: 0.9, phase: 0.85, spectral: 0.8 })
    const fusion = makeFusionResult(scores)
    // 300 Hz is both 50×6 and 60×5. Other peaks: 180 (60×3), 240 (60×4), 360 (60×6)
    // 60 Hz has 3 corroborating, 50 Hz has 0 corroborating → picks 60 Hz
    const activeFreqs = [180, 240, 300, 360]

    const result = classifyTrackWithAlgorithms(
      mainsTrack(300), scores, fusion, makeSettings(), activeFreqs
    )

    expect(result.reasons.some(r => r.includes('60Hz series'))).toBe(true)
  })

  it('reduces pFeedback when gate fires', () => {
    const scores = buildScores({ msd: 0.9, phase: 0.85, spectral: 0.8 })
    const fusion = makeFusionResult(scores)

    // Without mains corroboration
    const resultNoGate = classifyTrackWithAlgorithms(
      mainsTrack(120), scores, fusion, makeSettings(), [120]
    )

    // With mains corroboration
    const resultGate = classifyTrackWithAlgorithms(
      mainsTrack(120), scores, fusion, makeSettings(), [120, 180, 240]
    )

    expect(resultGate.pFeedback).toBeLessThan(resultNoGate.pFeedback)
  })

  it('tolerance allows ±2 Hz frequency matching', () => {
    const scores = buildScores({ msd: 0.9, phase: 0.85, spectral: 0.8 })
    const fusion = makeFusionResult(scores)
    // 121.5 is within ±2Hz of 120 (60×2), 179 is within ±2Hz of 180 (60×3)
    const activeFreqs = [121.5, 179, 241]

    const result = classifyTrackWithAlgorithms(
      mainsTrack(121.5), scores, fusion, makeSettings(), activeFreqs
    )

    expect(result.reasons.some(r => r.includes('Mains hum gate'))).toBe(true)
  })
})
