// Kill The Ring Constants - ISO bands, note frequencies, and configuration

// Standard ISO 31-band graphic EQ center frequencies (1/3 octave)
export const ISO_31_BANDS: readonly number[] = [
  20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160,
  200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600,
  2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000,
  20000
] as const

// A4 = 440 Hz reference
export const A4_HZ = 440
export const A4_MIDI = 69

// Note names for pitch display
export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const

// Cents per semitone
export const CENTS_PER_SEMITONE = 100
export const SEMITONES_PER_OCTAVE = 12
export const CENTS_PER_OCTAVE = 1200

// Mathematical constants (precomputed for performance)
export const LN10_OVER_10 = Math.LN10 / 10 // For dB to power conversion
export const LOG10_E = Math.LOG10E // For power to dB conversion
export const TWO_PI = Math.PI * 2

// ============================================================================
// ACOUSTIC CONSTANTS (from Sound Insulation textbook, Carl Hopkins 2007)
// ============================================================================

// Schroeder frequency calculation: f_S = 2000 * sqrt(T/V)
// Below this frequency, individual room modes dominate
// T = reverberation time (seconds), V = room volume (m³)
export const SCHROEDER_CONSTANTS = {
  COEFFICIENT: 2000, // From textbook Equation 1.111
  // Default estimates for typical venues when room data unavailable
  DEFAULT_RT60: 1.2, // seconds - typical for medium venue
  DEFAULT_VOLUME: 500, // m³ - typical conference room / small venue
  // Pre-calculated default Schroeder frequency
  get DEFAULT_FREQUENCY() {
    return this.COEFFICIENT * Math.sqrt(this.DEFAULT_RT60 / this.DEFAULT_VOLUME)
  },
} as const

// Frequency band definitions for frequency-dependent thresholds
// Based on textbook + acoustic principles for PA feedback detection
export const FREQUENCY_BANDS = {
  // Low band: Below Schroeder frequency, room modes dominate
  // Requires longer sustain, higher prominence to distinguish from bass content
  LOW: {
    minHz: 20,
    maxHz: 300, // Approximate - adjusted by Schroeder calculation
    prominenceMultiplier: 1.4, // Require 40% more prominence
    sustainMultiplier: 1.5, // Require 50% longer sustain
    qThresholdMultiplier: 0.6, // Lower Q threshold (broader peaks expected)
    description: 'Sub-bass to low-mid (room modes)',
  },
  // Mid band: Primary speech/vocal range, most feedback-prone
  // Standard thresholds, fastest response
  MID: {
    minHz: 300,
    maxHz: 3000,
    prominenceMultiplier: 1.0, // Standard prominence
    sustainMultiplier: 1.0, // Standard sustain
    qThresholdMultiplier: 1.0, // Standard Q threshold
    description: 'Mid range (speech fundamental + harmonics)',
  },
  // High band: Sibilance and high harmonics
  // More sensitive to high-Q peaks, A-weighting affects perception
  HIGH: {
    minHz: 3000,
    maxHz: 20000,
    prominenceMultiplier: 0.85, // Slightly less prominence needed (more audible)
    sustainMultiplier: 0.8, // Faster response (high freq feedback builds fast)
    qThresholdMultiplier: 1.2, // Higher Q threshold (expect narrower peaks)
    description: 'High range (sibilance, harmonics)',
  },
} as const

// Modal overlap indicator thresholds (M = 1/Q)
// Based on textbook Section 1.2.6.7 adapted for feedback detection
// With M = 1/Q: high Q (feedback-like) gives low M, low Q (broad) gives high M
export const MODAL_OVERLAP = {
  ISOLATED: 0.03, // M < 0.03 (Q > 33): Sharp isolated peak, high feedback risk
  COUPLED: 0.1, // M ≈ 0.1 (Q ≈ 10): Moderate resonance
  DIFFUSE: 0.33, // M > 0.33 (Q < 3): Broad peak, low feedback risk
} as const

// Cumulative growth tracking for slow-building feedback
export const CUMULATIVE_GROWTH = {
  WARNING_THRESHOLD_DB: 3, // Flag as "building" after 3dB cumulative growth
  ALERT_THRESHOLD_DB: 6, // Flag as "growing" after 6dB cumulative growth
  RUNAWAY_THRESHOLD_DB: 10, // Flag as "runaway" after 10dB cumulative growth
  MIN_DURATION_MS: 500, // Minimum duration to consider cumulative growth
  MAX_DURATION_MS: 10000, // Maximum window for cumulative growth calculation
} as const

// Vocal formant frequencies for whistle/vocal discrimination
// Based on average adult formant frequencies
export const VOCAL_FORMANTS = {
  F1_CENTER: 500, // First formant (jaw opening)
  F1_RANGE: 200, // ±200Hz
  F2_CENTER: 1500, // Second formant (tongue position)
  F2_RANGE: 500, // ±500Hz
  F3_CENTER: 2500, // Third formant (lip rounding)
  F3_RANGE: 500, // ±500Hz
  // Formant detection requires multiple peaks at these ratios
  MIN_FORMANTS_FOR_VOICE: 2, // Need at least 2 formants to classify as voice
} as const

// Vibrato detection for whistle discrimination
export const VIBRATO_DETECTION = {
  MIN_RATE_HZ: 4, // Minimum vibrato rate
  MAX_RATE_HZ: 8, // Maximum vibrato rate
  MIN_DEPTH_CENTS: 20, // Minimum vibrato depth
  MAX_DEPTH_CENTS: 100, // Maximum vibrato depth (wider = more likely whistle)
  DETECTION_WINDOW_MS: 500, // Window for vibrato analysis
} as const

// A-weighting constants (IEC/CD 1672)
export const A_WEIGHTING = {
  C1: 20.6,
  C2: 107.7,
  C3: 737.9,
  C4: 12200,
  OFFSET: 2.0, // dB offset for A-weighting formula
  MIN_DB: -120, // Clamp for frequencies near 0 Hz
} as const

// FFT size options
export const FFT_SIZE_OPTIONS = [2048, 4096, 8192, 16384, 32768] as const

// Severity thresholds - tuned for PA system feedback detection
export const SEVERITY_THRESHOLDS = {
  RUNAWAY_VELOCITY: 8, // dB/sec growth rate for runaway (lower = catch faster)
  GROWING_VELOCITY: 2, // dB/sec for growing (more sensitive)
  HIGH_Q: 40, // Q value indicating narrow resonance (lower = catch more)
  PERSISTENCE_MS: 400, // ms for resonance classification (faster detection)
} as const

// Classification weights - optimized for PA feedback detection
// Feature weights normalized to sum to 1.0 for proper probability distribution
export const CLASSIFIER_WEIGHTS = {
  // Stationarity (low pitch variation = feedback) - primary indicator
  STABILITY_FEEDBACK: 0.28,
  STABILITY_THRESHOLD_CENTS: 12, // tighter threshold for feedback detection

  // Harmonicity (coherent harmonics = instrument)
  HARMONICITY_INSTRUMENT: 0.22,
  HARMONICITY_THRESHOLD: 0.65, // higher threshold = less false instrument classification

  // Modulation (vibrato = whistle)
  MODULATION_WHISTLE: 0.18,
  MODULATION_THRESHOLD: 0.45, // slightly higher threshold

  // Sideband noise (breath = whistle)
  SIDEBAND_WHISTLE: 0.09,
  SIDEBAND_THRESHOLD: 0.35, // slightly higher threshold

  // Runaway growth (high velocity = feedback) - strong indicator
  GROWTH_FEEDBACK: 0.23,
  GROWTH_THRESHOLD: 4, // lower threshold = catch feedback growth earlier

  // Classification thresholds - more conservative for PA use
  CLASSIFICATION_THRESHOLD: 0.45, // lower = more likely to flag as potential issue
  WHISTLE_THRESHOLD: 0.65, // higher = less false whistle classification
  INSTRUMENT_THRESHOLD: 0.60, // higher = less false instrument classification
} as const

// EQ recommendation presets
export const EQ_PRESETS = {
  surgical: {
    defaultQ: 8,
    runawayQ: 16,
    maxCut: -18,
    moderateCut: -9,
    lightCut: -4,
  },
  heavy: {
    defaultQ: 4,
    runawayQ: 8,
    maxCut: -12,
    moderateCut: -6,
    lightCut: -3,
  },
} as const

// Vocal ring assist mode settings - optimized for speech/corporate PA
export const VOCAL_RING_SETTINGS = {
  BASELINE_EMA_ALPHA: 0.02, // Slow LTAS baseline adaptation
  RING_THRESHOLD_DB: 4, // Lower threshold for earlier ring detection
  RING_PERSISTENCE_MS: 150, // Faster confirmation for speech dynamics
  VOICE_FREQ_LOW: 200, // Hz - vocal-focused lower bound
  VOICE_FREQ_HIGH: 8000, // Hz - extended for speech sibilance
  SUGGESTED_CUT_MIN: -2, // dB
  SUGGESTED_CUT_MAX: -6, // dB
} as const

// Spectral trend monitor settings
export const SPECTRAL_TRENDS = {
  LOW_RUMBLE_THRESHOLD_HZ: 80,
  LOW_RUMBLE_EXCESS_DB: 6,
  MUD_FREQ_LOW: 200,
  MUD_FREQ_HIGH: 400,
  MUD_EXCESS_DB: 4,
  HARSH_FREQ_LOW: 6000,
  HARSH_FREQ_HIGH: 10000,
  HARSH_EXCESS_DB: 5,
} as const

// Track history settings
export const TRACK_SETTINGS = {
  HISTORY_SIZE: 128, // Ring buffer size for track history
  ASSOCIATION_TOLERANCE_CENTS: 50, // Max cents difference to associate peak to track
  MAX_TRACKS: 64, // Maximum simultaneous tracks
  TRACK_TIMEOUT_MS: 1000, // Remove track after this inactive time
} as const

// Harmonic detection settings
export const HARMONIC_SETTINGS = {
  MAX_HARMONIC: 8, // Check overtones up to this partial (2nd–8th)
  TOLERANCE_CENTS: 50, // ±50 cents = half a semitone; matches track association tolerance
  // Sub-harmonic check: if new peak F and an active track is near F*k, new peak may be the fundamental
  CHECK_SUB_HARMONICS: true,
} as const

// Canvas rendering settings
export const CANVAS_SETTINGS = {
  RTA_DB_MIN: -100,
  RTA_DB_MAX: 0,
  RTA_FREQ_MIN: 20,
  RTA_FREQ_MAX: 20000,
  WATERFALL_HISTORY_FRAMES: 256,
  GEQ_BAR_WIDTH_RATIO: 0.8, // Bar width as ratio of band spacing
} as const

// Operation mode presets - optimized for PA system feedback detection
// Default is Aggressive for corporate/conference environments with vocal focus
export const OPERATION_MODES = {
  feedbackHunt: {
    // Balanced PA mode - good sensitivity without excessive false positives
    feedbackThreshold: 8, // Moderate threshold for balanced detection
    ringThreshold: 5, // Catch resonances before they become problematic
    growthRateThreshold: 2, // Responsive to growing feedback
    musicAware: false,
  },
  vocalRing: {
    // Optimized for vocal frequencies (200Hz-8kHz)
    feedbackThreshold: 6, // More sensitive for speech feedback
    ringThreshold: 4, // Catch vocal ring-outs
    growthRateThreshold: 1.5, // Fast response for speech dynamics
    musicAware: false,
  },
  musicAware: {
    // Use during live performance to reduce false positives
    feedbackThreshold: 12, // Higher threshold to ignore musical content
    ringThreshold: 7, // Less sensitive during music
    growthRateThreshold: 3, // Only catch severe feedback
    musicAware: true,
  },
  aggressive: {
    // DEFAULT - Maximum sensitivity for corporate/conference PA
    // Catches feedback early before it becomes audible to audience
    feedbackThreshold: 6, // Very sensitive detection
    ringThreshold: 3, // Catch subtle resonances
    growthRateThreshold: 1, // Immediate response to any growth
    musicAware: false,
  },
  calibration: {
    // Ultra-sensitive for initial system setup and ring-out
    feedbackThreshold: 4, // Maximum sensitivity
    ringThreshold: 2, // Catch everything
    growthRateThreshold: 0.5, // Fastest possible response
    musicAware: false,
  },
} as const

// Default settings for the analyzer - OPTIMIZED FOR CORPORATE/CONFERENCE SPEECH SYSTEMS
// AGGRESSIVE DETECTION - better to have false positives than miss real feedback!
export const DEFAULT_SETTINGS = {
  mode: 'feedbackHunt' as const, // Feedback Hunt is the balanced default for PA systems
  fftSize: 8192 as const, // Good frequency resolution for accurate detection
  smoothingTimeConstant: 0.5, // Faster response for quick detection
  minFrequency: 200, // Vocal-focused lower bound (below this is mostly HVAC rumble)
  maxFrequency: 8000, // Vocal-focused upper bound - where most speech feedback occurs
  feedbackThresholdDb: 6, // AGGRESSIVE - catch feedback early, before it's dangerous
  ringThresholdDb: 4, // AGGRESSIVE - catch resonances before they become feedback
  growthRateThreshold: 1.5, // FAST - detect growing peaks quickly
  holdTimeMs: 3000, // Longer hold for reference during EQ adjustments
  noiseFloorDecay: 0.98, // Fast adaptation for dynamic environments
  peakMergeCents: 50,
  maxDisplayedIssues: 8, // Show more issues - don't hide potential problems
  eqPreset: 'surgical' as const, // Precise narrow cuts for speech (preserve clarity)
  musicAware: false, // Disabled - no music in corporate/conference
  autoMusicAware: false, // Auto music-aware mode off for speech systems
  autoMusicAwareHysteresisDb: 15, // 15dB above noise floor = band is playing
  inputGainDb: 15, // Default input gain (adjustable -40 to +40 dB)
  graphFontSize: 15, // Default label size for canvas graphs (8-26px range, 15px center)
  harmonicToleranceCents: 50, // ±50 cents for harmonic matching
  showTooltips: true, // Show help tooltips (useful for AV techs)
  aWeightingEnabled: true, // A-WEIGHTING ON - prioritizes speech frequencies (2-5kHz)
  // Confidence filtering - LOW threshold, better false positives than missing real feedback
  confidenceThreshold: 0.40, // 40% - very aggressive, surface almost everything
  // Room acoustics - defaults to medium conference room
  roomRT60: 0.7, // Typical treated conference room (0.5-0.8s)
  roomVolume: 250, // Medium conference room ~250m³ (seats ~30 people)
  // Room preset identifier
  roomPreset: 'medium' as const, // Default to medium conference room
  
  // ==================== ADVANCED ALGORITHM SETTINGS ====================
  // Based on DAFx-16, DBX, and KU Leuven research papers
  // TUNED FOR FAST DETECTION (accepts more false positives for speed)
  algorithmMode: 'combined' as const, // MSD + Phase for best accuracy
  showAlgorithmScores: false, // Hide advanced scores by default (for advanced users)
  // Harmonic filter and room mode settings
  harmonicFilterEnabled: true, // Enable harmonic series detection to filter instruments
  roomModesEnabled: false, // Room mode calculation disabled by default (advanced feature)
  roomLengthM: 10, // Default room length in meters
  roomWidthM: 8, // Default room width in meters
  roomHeightM: 3, // Default room height in meters
  roomDimensionsUnit: 'meters' as const, // Default unit for dimension input
  // Peak timing
  sustainMs: 250, // Fast confirmation for speech dynamics
  clearMs: 400, // Fast clearing for responsive display
  // Threshold control
  thresholdMode: 'hybrid' as const,
  relativeThresholdDb: 18, // Slightly sensitive relative threshold
  prominenceDb: 12, // Lower prominence for catching subtle peaks
  // Noise floor timing
  noiseFloorAttackMs: 200, // Fast attack for dynamic environments
  noiseFloorReleaseMs: 1000, // Moderate release
  // Track management
  maxTracks: 64, // Maximum simultaneous tracks
  trackTimeoutMs: 1000, // Remove track after 1s inactive
  ignoreWhistle: true, // Suppress whistle classifications by default
  // Display / canvas
  rtaDbMin: -100, // RTA display range minimum
  rtaDbMax: 0, // RTA display range maximum
  spectrumLineWidth: 1.5, // RTA line width in pixels
}

// Room size presets for quick switching in corporate/conference environments
// AGGRESSIVE THRESHOLDS - better false positives than missing real feedback!
export const ROOM_PRESETS = {
  small: {
    label: 'Small Boardroom',
    description: '10-20 people, huddle rooms, small meeting spaces',
    roomRT60: 0.5, // Well-treated small room
    roomVolume: 80, // ~80m³ (approx 20x15x10 ft)
    schroederFreq: 158, // Pre-calculated: 2000 * sqrt(0.5/80)
    feedbackThresholdDb: 5, // AGGRESSIVE - quiet rooms need early warning
    ringThresholdDb: 3,
  },
  medium: {
    label: 'Medium Conference Room',
    description: '20-50 people, standard conference/training rooms',
    roomRT60: 0.7, // Typical treated conference room
    roomVolume: 250, // ~250m³ (approx 30x25x12 ft)
    schroederFreq: 106, // Pre-calculated: 2000 * sqrt(0.7/250)
    feedbackThresholdDb: 6, // AGGRESSIVE - catch problems early
    ringThresholdDb: 4,
  },
  large: {
    label: 'Large Auditorium',
    description: '50-200 people, ballrooms, auditoriums, town halls',
    roomRT60: 1.0, // Larger spaces have more reverb
    roomVolume: 1000, // ~1000m³ (approx 50x40x20 ft)
    schroederFreq: 63, // Pre-calculated: 2000 * sqrt(1.0/1000)
    feedbackThresholdDb: 7, // Slightly less aggressive due to ambient noise
    ringThresholdDb: 5,
  },
  custom: {
    label: 'Custom',
    description: 'Manual RT60 and volume settings',
    roomRT60: 0.7,
    roomVolume: 250,
    schroederFreq: 106,
    feedbackThresholdDb: 6,
    ringThresholdDb: 4,
  },
} as const

export type RoomPresetKey = keyof typeof ROOM_PRESETS

// Frequency range presets — quick switching for different use cases
export const FREQ_RANGE_PRESETS = [
  { label: 'Vocal',    minFrequency: 200,  maxFrequency: 8000  },
  { label: 'Monitor',  minFrequency: 300,  maxFrequency: 3000  },
  { label: 'Full',     minFrequency: 20,   maxFrequency: 20000 },
  { label: 'Sub',      minFrequency: 20,   maxFrequency: 250   },
] as const

// Color palette for visualizations
export const VIZ_COLORS = {
  RUNAWAY: '#ef4444', // red-500
  GROWING: '#f97316', // orange-500
  RESONANCE: '#eab308', // yellow-500
  POSSIBLE_RING: '#a855f7', // purple-500
  WHISTLE: '#06b6d4', // cyan-500
  INSTRUMENT: '#22c55e', // green-500
  NOISE_FLOOR: '#6b7280', // gray-500
  THRESHOLD: '#3b82f6', // blue-500
  SPECTRUM: '#10b981', // emerald-500
  PEAK_MARKER: '#f59e0b', // amber-500
  // Advanced algorithm colors
  MSD_HIGH: '#22c55e', // green-500 (likely feedback)
  MSD_LOW: '#6b7280', // gray-500 (not feedback)
  PHASE_COHERENT: '#3b82f6', // blue-500 (high coherence)
  PHASE_RANDOM: '#9ca3af', // gray-400 (low coherence)
  COMPRESSION: '#f59e0b', // amber-500 (compression detected)
  COMB_PATTERN: '#8b5cf6', // violet-500 (comb pattern)
} as const

// ============================================================================
// ADVANCED ALGORITHM CONSTANTS (from academic research)
// ============================================================================

// MSD (Magnitude Slope Deviation) from DAFx-16 paper
export const MSD_SETTINGS = {
  /** Default MSD threshold (dB²/frame²) - values below indicate feedback
   *  DAFx-16 paper gives 1.0 dB²/frame² for 16-frame window.
   *  After normalizing by numTerms (frameCount - 2), threshold ≈ 1.0/14 ≈ 0.071.
   *  We use 0.1 (slightly loose) for robustness. */
  THRESHOLD: 0.1,
  /** MSD below this → flag as feedback howl */
  HOWL_THRESHOLD: 0.1,
  /** MSD below this threshold on consecutive frames → fast-confirm feedback */
  FAST_CONFIRM_THRESHOLD: 0.15,
  /** Number of consecutive frames below FAST_CONFIRM_THRESHOLD to confirm */
  FAST_CONFIRM_FRAMES: 3,
  /** Minimum frames for speech detection (100% accuracy per paper) */
  MIN_FRAMES_SPEECH: 7,
  /** Minimum frames for classical music (100% accuracy per paper) */
  MIN_FRAMES_MUSIC: 13,
  /** Minimum frames for rock/pop (22% accuracy - use with compression detection) */
  MIN_FRAMES_ROCK: 50,
  /** Default minimum frames */
  DEFAULT_MIN_FRAMES: 15,
  /** Maximum frames (balance accuracy vs latency) */
  MAX_FRAMES: 50,
  /** Ring buffer size for MSD magnitude history per bin */
  HISTORY_SIZE: 64,
  /** Minimum energy above noise floor (dB) required to run MSD analysis on a bin */
  MIN_ENERGY_ABOVE_NOISE_DB: 6,
} as const

// Peak Persistence Scoring - Phase 2 Enhancement
// Feedback is persistent over time, transients are short-lived
export const PERSISTENCE_SCORING = {
  /** Maximum frames to track persistence (ring buffer size) */
  HISTORY_FRAMES: 32,
  /** dB tolerance for counting a frame as "same peak still present" */
  AMPLITUDE_TOLERANCE_DB: 6,
  /** Minimum consecutive frames to consider a peak persistent */
  MIN_PERSISTENCE_FRAMES: 5,
  /** Frames for high persistence classification */
  HIGH_PERSISTENCE_FRAMES: 15,
  /** Frames for very high persistence classification */
  VERY_HIGH_PERSISTENCE_FRAMES: 30,
  /** Confidence boost for minimally persistent peaks */
  MIN_PERSISTENCE_BOOST: 0.05,
  /** Confidence boost for highly persistent peaks */
  HIGH_PERSISTENCE_BOOST: 0.12,
  /** Confidence boost for very highly persistent peaks */
  VERY_HIGH_PERSISTENCE_BOOST: 0.20,
  /** Frame count below which a penalty is applied (transient peak) */
  LOW_PERSISTENCE_FRAMES: 3,
  /** Confidence penalty for transient peaks */
  LOW_PERSISTENCE_PENALTY: 0.05,
} as const

// Phase coherence from KU Leuven/Nyquist analysis
export const PHASE_SETTINGS = {
  /** High coherence indicates feedback (pure tone maintains phase) */
  HIGH_COHERENCE: 0.85,
  /** Medium coherence is uncertain */
  MEDIUM_COHERENCE: 0.65,
  /** Low coherence indicates music/noise */
  LOW_COHERENCE: 0.4,
  /** Minimum samples for reliable analysis */
  MIN_SAMPLES: 5,
  /** Default threshold for detection */
  DEFAULT_THRESHOLD: 0.75,
} as const

// Spectral flatness thresholds
export const SPECTRAL_FLATNESS_SETTINGS = {
  /** Pure tone (feedback) has very low flatness */
  PURE_TONE: 0.05,
  /** Speech has moderate flatness */
  SPEECH: 0.15,
  /** Music has higher flatness */
  MUSIC: 0.3,
  /** High kurtosis indicates peaky distribution */
  HIGH_KURTOSIS: 10,
  /** Bandwidth around peak to analyze (bins) */
  ANALYSIS_BANDWIDTH: 10,
} as const

// Comb filter pattern detection from DBX paper
export const COMB_PATTERN_SETTINGS = {
  /** Speed of sound (m/s) */
  SPEED_OF_SOUND: 343,
  /** Minimum peaks to establish pattern */
  MIN_PEAKS: 3,
  /** Tolerance for frequency spacing (fraction) */
  SPACING_TOLERANCE: 0.05,
  /** Maximum path length (meters) */
  MAX_PATH_LENGTH: 50,
} as const

// Compression detection thresholds
export const COMPRESSION_SETTINGS = {
  /** Normal crest factor for uncompressed audio (dB) */
  NORMAL_CREST_FACTOR: 12,
  /** Heavy compression crest factor (dB) */
  COMPRESSED_CREST_FACTOR: 6,
  /** Minimum dynamic range for detection (dB) */
  MIN_DYNAMIC_RANGE: 20,
  /** Compressed dynamic range (dB) */
  COMPRESSED_DYNAMIC_RANGE: 8,
} as const

// FUSION_WEIGHTS: canonical definition is in advancedDetection.ts (the only consumer)
// Removed duplicate from here to avoid conflicting values.

// Algorithm mode options for UI
export const ALGORITHM_MODES = {
  auto: { label: 'Auto', description: 'Automatic algorithm selection based on content' },
  msd: { label: 'MSD Only', description: 'Magnitude Slope Deviation (best for speech)' },
  phase: { label: 'Phase Only', description: 'Phase coherence analysis' },
  combined: { label: 'MSD + Phase', description: 'Combined analysis (recommended)' },
  all: { label: 'All Algorithms', description: 'Maximum accuracy, higher CPU usage' },
} as const
