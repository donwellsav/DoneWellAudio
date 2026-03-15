/**
 * Autoresearch Scenario Dataset — Kill the Ring
 *
 * Ground-truth labeled scenarios for autonomous optimization of fusion weights.
 * Each scenario specifies what the system SHOULD produce (desired verdict),
 * not what it currently does.
 *
 * Extracted from:
 *   - tests/dsp/algorithmFusion.test.ts (Gemini Ultra analysis)
 *   - tests/dsp/algorithmFusion.gpt.test.ts (GPT-5.4 Deep Thinking)
 *   - tests/dsp/algorithmFusion.chatgpt-context.test.ts (ChatGPT-5.4)
 *   - lib/dsp/__tests__/algorithmFusion.test.ts (unit baselines)
 *
 * Categories:
 *   TP        = True Positive — IS feedback, SHOULD be detected
 *   TN        = True Negative — NOT feedback, should NOT be detected
 *   known_FP  = Currently false positive — fix to become TN
 *   known_FN  = Currently false negative — fix to become TP
 *   baseline  = Ground-truth baseline (pure cases)
 */

import type { ScoreInput } from '@/tests/helpers/mockAlgorithmScores'

export type ContentType = 'speech' | 'music' | 'compressed' | 'unknown'
export type FeedbackVerdict = 'FEEDBACK' | 'POSSIBLE_FEEDBACK' | 'UNCERTAIN' | 'NOT_FEEDBACK'

export interface Scenario {
  /** Unique identifier */
  id: string
  /** Human-readable description */
  name: string
  /** Algorithm score inputs for buildScores() */
  scores: ScoreInput
  /** Content type for weight profile selection */
  contentType: ContentType
  /** Legacy existingScore (ignored, always 0.5) */
  existingScore: number
  /** Optional peak frequency for frequency-aware scoring */
  peakFrequencyHz?: number
  /** GROUND TRUTH — what the system SHOULD produce */
  expectedVerdict: FeedbackVerdict
  /** Scenario classification */
  category: 'TP' | 'TN' | 'known_FP' | 'known_FN' | 'baseline'
  /** Importance weight (default 1.0, FP scenarios get 2.0) */
  weight: number
  /** Discovery source */
  source: string
}

// ═════════════════════════════════════════════════════════════════════════════
// BASELINE SCENARIOS — Ground truth, these must ALWAYS pass
// ═════════════════════════════════════════════════════════════════════════════

const BASELINES: Scenario[] = [
  {
    id: 'baseline-pure-feedback',
    name: 'Pure feedback: all algorithms agree',
    scores: { msd: 0.95, phase: 0.95, spectral: 0.95, comb: 0, ihr: 0.95, ptmr: 0.95 },
    contentType: 'unknown',
    existingScore: 0.5,
    expectedVerdict: 'FEEDBACK',
    category: 'baseline',
    weight: 3.0, // Critical — must never break
    source: 'manual',
  },
  {
    id: 'baseline-pure-music',
    name: 'Pure music: all algorithms agree not feedback',
    scores: { msd: 0.05, phase: 0.1, spectral: 0.05, comb: 0, ihr: 0.05, ptmr: 0.05 },
    contentType: 'music',
    existingScore: 0.5,
    expectedVerdict: 'NOT_FEEDBACK',
    category: 'baseline',
    weight: 3.0,
    source: 'manual',
  },
  {
    id: 'baseline-silence',
    name: 'Silence: no algorithm data',
    scores: {},
    contentType: 'unknown',
    existingScore: 0.5,
    expectedVerdict: 'NOT_FEEDBACK',
    category: 'baseline',
    weight: 3.0,
    source: 'manual',
  },
  {
    id: 'baseline-feedback-with-comb',
    name: 'Feedback with comb pattern confirmation',
    scores: { msd: 0.8, phase: 0.85, spectral: 0.7, comb: 0.9, ihr: 0.8, ptmr: 0.8 },
    contentType: 'unknown',
    existingScore: 0.5,
    expectedVerdict: 'FEEDBACK',
    category: 'baseline',
    weight: 2.0,
    source: 'manual',
  },
  {
    id: 'baseline-very-low-scores',
    name: 'Very low scores across the board',
    scores: { msd: 0.02, phase: 0.05, spectral: 0.02, comb: 0, ihr: 0.02, ptmr: 0.02 },
    contentType: 'unknown',
    existingScore: 0.5,
    expectedVerdict: 'NOT_FEEDBACK',
    category: 'baseline',
    weight: 2.0,
    source: 'manual',
  },
]

// ═════════════════════════════════════════════════════════════════════════════
// TRUE POSITIVES — Real feedback that the system SHOULD detect
// ═════════════════════════════════════════════════════════════════════════════

const TRUE_POSITIVES: Scenario[] = [
  {
    id: 'tp-reverberant-feedback',
    name: 'Low-frequency feedback in reverberant room',
    scores: { msd: 0.4, phase: 0.5, spectral: 0.9, comb: 0, ihr: 0.9, ptmr: 0.8 },
    contentType: 'unknown',
    existingScore: 0.5,
    expectedVerdict: 'FEEDBACK',
    category: 'known_FN',
    weight: 1.5, // Important real-world scenario
    source: 'gemini',
  },
  {
    id: 'tp-limiter-clamped',
    name: 'Fast ringing feedback clamped by system limiter',
    scores: { msd: 0.1, phase: 0.9, spectral: 0.9, comb: 0, ihr: 0.9, ptmr: 0.9 },
    contentType: 'speech',
    existingScore: 0.5,
    expectedVerdict: 'FEEDBACK',
    category: 'known_FN',
    weight: 1.5,
    source: 'gemini',
  },
  {
    id: 'tp-dense-mix-feedback',
    name: 'Feedback hidden in dense loud mix (phase ruined)',
    scores: { msd: 0.6, phase: 0.3, spectral: 0.8, comb: 0, ihr: 0.8, ptmr: 0.7 },
    contentType: 'music',
    existingScore: 0.5,
    expectedVerdict: 'FEEDBACK',
    category: 'known_FN',
    weight: 1.5,
    source: 'gemini',
  },
  {
    id: 'tp-compressor-pumped',
    name: 'Feedback fighting heavy mix bus compressor',
    scores: { msd: 0.8, phase: 0.2, spectral: 0.8, comb: 0, ihr: 0.9, ptmr: 0.8, compressed: true },
    contentType: 'unknown',
    existingScore: 0.5,
    expectedVerdict: 'FEEDBACK',
    category: 'known_FN',
    weight: 1.5,
    source: 'gemini',
  },
  {
    id: 'tp-doppler-feedback',
    name: 'Moving mic Doppler feedback (phase + MSD fail)',
    scores: { msd: 0.3, phase: 0.2, spectral: 0.8, comb: 0.8, ihr: 0.9, ptmr: 0.6 },
    contentType: 'unknown',
    existingScore: 0.5,
    expectedVerdict: 'POSSIBLE_FEEDBACK',
    category: 'known_FN',
    weight: 1.0,
    source: 'gpt',
  },
  {
    id: 'tp-plosive-howl',
    name: 'Brief high-frequency ringing from plosive P-pops',
    scores: { msd: 0.1, phase: 0.9, spectral: 0.9, comb: 0, ihr: 0.8, ptmr: 0.9 },
    contentType: 'speech',
    existingScore: 0.5,
    expectedVerdict: 'FEEDBACK',
    category: 'known_FN',
    weight: 1.0,
    source: 'gpt',
  },
  {
    id: 'tp-cymbal-buried',
    name: 'Feedback buried in cymbal-heavy rock mix',
    scores: { msd: 0.8, phase: 0.2, spectral: 0.6, comb: 0, ihr: 0.6, ptmr: 0.5 },
    contentType: 'music',
    existingScore: 0.5,
    expectedVerdict: 'POSSIBLE_FEEDBACK',
    category: 'known_FN',
    weight: 1.0,
    source: 'gpt',
  },
  {
    id: 'tp-sidechain-pumped',
    name: 'Feedback during EDM sidechain compression pumping',
    scores: { msd: 0.1, phase: 0.8, spectral: 0.7, comb: 0, ihr: 0.8, ptmr: 0.3, compressed: true },
    contentType: 'unknown',
    existingScore: 0.5,
    expectedVerdict: 'POSSIBLE_FEEDBACK',
    category: 'known_FN',
    weight: 1.0,
    source: 'gpt',
  },
  {
    id: 'tp-spectral-only',
    name: 'Early howl: MSD+Phase both unavailable, spectral strong',
    scores: { msd: 0.0, phase: 0.0, spectral: 0.80, comb: 0, ihr: 0.80, ptmr: 0.80 },
    contentType: 'unknown',
    existingScore: 0.5,
    expectedVerdict: 'POSSIBLE_FEEDBACK',
    category: 'known_FN',
    weight: 1.5, // Structural flaw — high impact
    source: 'chatgpt',
  },
  {
    id: 'tp-speech-no-msd',
    name: 'Real feedback without MSD in SPEECH mode',
    scores: { msd: 0.0, phase: 0.20, spectral: 0.80, comb: 0, ihr: 0.80, ptmr: 0.80 },
    contentType: 'speech',
    existingScore: 0.5,
    expectedVerdict: 'POSSIBLE_FEEDBACK',
    category: 'known_FN',
    weight: 1.0,
    source: 'chatgpt',
  },
  {
    id: 'tp-music-no-phase',
    name: 'Real feedback without phase in MUSIC mode',
    scores: { msd: 0.80, phase: 0.0, spectral: 0.80, comb: 0, ihr: 0.80, ptmr: 0.20 },
    contentType: 'music',
    existingScore: 0.5,
    expectedVerdict: 'POSSIBLE_FEEDBACK',
    category: 'known_FN',
    weight: 1.0,
    source: 'chatgpt',
  },
  {
    id: 'tp-compressed-no-phase',
    name: 'Real feedback without phase in COMPRESSED mode',
    scores: { msd: 0.80, phase: 0.0, spectral: 0.0, comb: 0, ihr: 0.80, ptmr: 0.80, compressed: true },
    contentType: 'unknown',
    existingScore: 0.5,
    expectedVerdict: 'POSSIBLE_FEEDBACK',
    category: 'known_FN',
    weight: 1.0,
    source: 'chatgpt',
  },
]

// ═════════════════════════════════════════════════════════════════════════════
// TRUE NEGATIVES — NOT feedback, system should NOT flag
// ═════════════════════════════════════════════════════════════════════════════

const TRUE_NEGATIVES: Scenario[] = [
  {
    id: 'tn-synth-note',
    name: 'Sustained synthesizer note (flat envelope, tonal)',
    scores: { msd: 0.8, phase: 0.9, spectral: 0.4, comb: 0, ihr: 0.1, ptmr: 0.7 },
    contentType: 'unknown',
    existingScore: 0.5,
    expectedVerdict: 'UNCERTAIN',
    category: 'known_FP',
    weight: 2.0, // FPs penalized heavily
    source: 'gemini',
  },
  {
    id: 'tn-sustained-vowel',
    name: 'Speaker holding long vowel "Ummmm" into compressed mic',
    scores: { msd: 0.9, phase: 0.8, spectral: 0.5, comb: 0, ihr: 0.2, ptmr: 0.6 },
    contentType: 'speech',
    existingScore: 0.5,
    expectedVerdict: 'UNCERTAIN',
    category: 'known_FP',
    weight: 2.0,
    source: 'gemini',
  },
  {
    id: 'tn-compressed-flute',
    name: 'Compressed backing track with clean flute sample',
    scores: { msd: 0.5, phase: 0.95, spectral: 0.6, comb: 0, ihr: 0.3, ptmr: 0.6, compressed: true },
    contentType: 'unknown',
    existingScore: 0.5,
    expectedVerdict: 'UNCERTAIN',
    category: 'known_FP',
    weight: 2.0,
    source: 'gemini',
  },
  {
    id: 'tn-guitar-feedback-intentional',
    name: 'Intentional musical guitar feedback (acceptable FP)',
    scores: { msd: 0.8, phase: 0.95, spectral: 0.6, comb: 0, ihr: 0.2, ptmr: 0.8 },
    contentType: 'music',
    existingScore: 0.5,
    // This IS acoustically feedback — detecting it is arguably correct
    // So we accept FEEDBACK or POSSIBLE_FEEDBACK
    expectedVerdict: 'FEEDBACK',
    category: 'TP',
    weight: 0.5, // Low weight — acceptable either way
    source: 'gemini',
  },
  {
    id: 'tn-consensus-synth-v1',
    name: 'Consensus FP: synth note (MSD+Phase dominant)',
    scores: { msd: 0.85, phase: 0.80, spectral: 0.55, comb: 0, ihr: 0.20, ptmr: 0.35 },
    contentType: 'unknown',
    existingScore: 0.5,
    expectedVerdict: 'UNCERTAIN',
    category: 'known_FP',
    weight: 2.0,
    source: 'consensus',
  },
  {
    id: 'tn-shouting-presenter',
    name: 'Shouting presenter holding loud vowel "Wooooo!"',
    scores: { msd: 0.95, phase: 0.4, spectral: 0.8, comb: 0, ihr: 0.2, ptmr: 0.8 },
    contentType: 'speech',
    existingScore: 0.5,
    expectedVerdict: 'UNCERTAIN',
    category: 'known_FP',
    weight: 2.0,
    source: 'gpt',
  },
  {
    id: 'tn-flanger-pedal',
    name: 'Guitarist using Flanger/Phaser/Chorus pedal',
    scores: { msd: 0.7, phase: 0.8, spectral: 0.7, comb: 0.8, ihr: 0.4, ptmr: 0.6 },
    contentType: 'music',
    existingScore: 0.5,
    expectedVerdict: 'UNCERTAIN',
    category: 'known_FP',
    weight: 2.0, // Critical — very common in live music
    source: 'gpt',
  },
  {
    id: 'tn-autotune-vocal',
    name: 'Heavily compressed, Auto-Tuned pop vocal',
    scores: { msd: 0.7, phase: 0.95, spectral: 0.85, comb: 0, ihr: 0.5, ptmr: 0.7, compressed: true },
    contentType: 'unknown',
    existingScore: 0.5,
    expectedVerdict: 'UNCERTAIN',
    category: 'known_FP',
    weight: 2.0, // Devastating for worship environments
    source: 'gpt',
  },
  {
    id: 'tn-consensus-sustained-vowel',
    name: 'Consensus: sustained vowel FP in SPEECH mode',
    scores: { msd: 0.92, phase: 0.6, spectral: 0.6, comb: 0, ihr: 0.2, ptmr: 0.7 },
    contentType: 'speech',
    existingScore: 0.5,
    expectedVerdict: 'UNCERTAIN',
    category: 'known_FP',
    weight: 2.5, // Three-model consensus — highest confidence
    source: 'consensus',
  },
  {
    id: 'tn-phase-dominant-music',
    name: 'Phase-dominant music detection (phase alone convicts)',
    scores: { msd: 0, phase: 1.0, spectral: 0.80, comb: 0, ihr: 0.60, ptmr: 0.40 },
    contentType: 'music',
    existingScore: 0.5,
    expectedVerdict: 'UNCERTAIN',
    category: 'known_FP',
    weight: 2.0,
    source: 'consensus',
  },
  {
    id: 'tn-chatgpt-synth',
    name: 'ChatGPT: compressed tonal instrument / synth note',
    scores: { msd: 0.85, phase: 0.80, spectral: 0.55, comb: 0, ihr: 0.20, ptmr: 0.35 },
    contentType: 'unknown',
    existingScore: 0.5,
    expectedVerdict: 'UNCERTAIN',
    category: 'known_FP',
    weight: 2.0,
    source: 'chatgpt',
  },
  {
    id: 'tn-chatgpt-phase-music',
    name: 'ChatGPT: phase-dominant music (zero MSD)',
    scores: { msd: 0.0, phase: 1.0, spectral: 0.80, comb: 0, ihr: 0.60, ptmr: 0.40 },
    contentType: 'music',
    existingScore: 0.5,
    expectedVerdict: 'UNCERTAIN',
    category: 'known_FP',
    weight: 2.0,
    source: 'chatgpt',
  },
  {
    id: 'tn-chatgpt-phase-compressed',
    name: 'ChatGPT: phase-only conviction in compressed mode',
    scores: { msd: 0.0, phase: 1.0, spectral: 0.40, comb: 0, ihr: 0.40, ptmr: 0.60, compressed: true },
    contentType: 'unknown',
    existingScore: 0.5,
    expectedVerdict: 'UNCERTAIN',
    category: 'known_FP',
    weight: 2.0,
    source: 'chatgpt',
  },
  {
    id: 'tn-alarm-siren',
    name: 'Environmental alarm / sustained violin crescendo',
    scores: { msd: 0.9, phase: 0.6, spectral: 0.8, comb: 0, ihr: 0.2, ptmr: 0.9 },
    contentType: 'unknown',
    existingScore: 0.5,
    expectedVerdict: 'POSSIBLE_FEEDBACK',
    category: 'known_FP',
    weight: 1.0, // Borderline — alarm is ambiguous
    source: 'gpt',
  },
]

// ═════════════════════════════════════════════════════════════════════════════
// STRUCTURAL TESTS — Verify architectural properties
// ═════════════════════════════════════════════════════════════════════════════

const STRUCTURAL: Scenario[] = [
  {
    id: 'struct-msd-alone',
    name: 'MSD=1.0 alone cannot reach FEEDBACK',
    scores: { msd: 1.0, phase: 0, spectral: 0, comb: 0, ihr: 0, ptmr: 0 },
    contentType: 'unknown',
    existingScore: 0.5,
    expectedVerdict: 'UNCERTAIN',
    category: 'TN',
    weight: 1.5,
    source: 'manual',
  },
  {
    id: 'struct-msd-phase-below',
    name: 'MSD+Phase both=1.0 still below FEEDBACK threshold',
    scores: { msd: 1.0, phase: 1.0, spectral: 0, comb: 0, ihr: 0, ptmr: 0 },
    contentType: 'unknown',
    existingScore: 0.5,
    expectedVerdict: 'UNCERTAIN',
    category: 'TN',
    weight: 1.5,
    source: 'manual',
  },
  {
    id: 'struct-three-algos-feedback',
    name: 'MSD+Phase+Spectral+PTMR all=1.0 reaches FEEDBACK',
    scores: { msd: 1.0, phase: 1.0, spectral: 1.0, comb: 0, ihr: 0, ptmr: 0.3 },
    contentType: 'unknown',
    existingScore: 0.5,
    expectedVerdict: 'FEEDBACK',
    category: 'TP',
    weight: 1.5,
    source: 'manual',
  },
  {
    id: 'struct-msd-only-speech',
    name: 'V3 FIXED: MSD-only conviction no longer FEEDBACK in SPEECH',
    scores: { msd: 1.0, phase: 0, spectral: 0.60, comb: 0, ihr: 0.40, ptmr: 0.60 },
    contentType: 'speech',
    existingScore: 0.5,
    expectedVerdict: 'POSSIBLE_FEEDBACK',
    category: 'TN',
    weight: 2.0,
    source: 'consensus',
  },
  {
    id: 'struct-phase-compressed-fixed',
    name: 'V8 FIXED: Phase conviction under compression not FEEDBACK',
    scores: { msd: 0, phase: 1.0, spectral: 0.40, comb: 0, ihr: 0.40, ptmr: 0.60, compressed: true },
    contentType: 'unknown',
    existingScore: 0.5,
    expectedVerdict: 'POSSIBLE_FEEDBACK',
    category: 'TN',
    weight: 2.0,
    source: 'consensus',
  },
]

// ═════════════════════════════════════════════════════════════════════════════
// EXPORT — Complete scenario dataset
// ═════════════════════════════════════════════════════════════════════════════

export const SCENARIOS: Scenario[] = [
  ...BASELINES,
  ...TRUE_POSITIVES,
  ...TRUE_NEGATIVES,
  ...STRUCTURAL,
]
