/**
 * Acoustic Constants — Room Physics & Analysis
 *
 * Schroeder frequency, frequency band definitions, modal overlap,
 * cumulative growth tracking, vibrato detection, and room dimension
 * estimation parameters.
 *
 * @see Hopkins, "Sound Insulation" (2007) — Schroeder frequency, modal overlap
 * @see Kuttruff, "Room Acoustics" 6th ed. — rectangular room eigenfrequencies
 */

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
    prominenceMultiplier: 1.15, // Mild extra prominence (was 1.4 — too aggressive with other gates)
    sustainMultiplier: 1.2, // Slightly longer sustain (was 1.5)
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

// Vibrato detection for whistle discrimination
export const VIBRATO_DETECTION = {
  MIN_RATE_HZ: 4, // Minimum vibrato rate
  MAX_RATE_HZ: 8, // Maximum vibrato rate
  MIN_DEPTH_CENTS: 20, // Minimum vibrato depth
  MAX_DEPTH_CENTS: 100, // Maximum vibrato depth (wider = more likely whistle)
  DETECTION_WINDOW_MS: 500, // Window for vibrato analysis
} as const

// Room dimension estimation from detected resonances (inverse eigenvalue solver)
export const ROOM_ESTIMATION = {
  /** Speed of sound (m/s) at ~20°C */
  SPEED_OF_SOUND: 343,
  /** Minimum stable peaks required to attempt estimation */
  MIN_PEAKS: 4,
  /** Maximum frequency to consider for room modes (Hz) — above Schroeder is diffuse */
  MAX_FREQUENCY_HZ: 500,
  /** Minimum Q factor for a peak to be considered a room mode */
  MIN_Q: 10,
  /** Minimum persistence (ms) before a peak is considered stable */
  MIN_PERSISTENCE_MS: 500,
  /** Accumulation window (ms) — how long to listen before estimating */
  ACCUMULATION_WINDOW_MS: 10_000,
  /** Frequency tolerance for harmonic series matching (fraction) */
  HARMONIC_TOLERANCE: 0.04,
  /** Minimum harmonics in a series to identify a dimension */
  MIN_HARMONICS: 2,
  /** Maximum room dimension (meters) — sanity check */
  MAX_DIMENSION_M: 50,
  /** Minimum room dimension (meters) — sanity check */
  MIN_DIMENSION_M: 1.5,
  /** Minimum confidence to report an estimate */
  MIN_CONFIDENCE: 0.3,
} as const
