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
// Mathematical constants (precomputed for performance)
export const LN10_OVER_10 = Math.LN10 / 10 // For dB to power conversion
export const LOG10_E = Math.LOG10E // For power to dB conversion

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
  ASSOCIATION_TOLERANCE_CENTS: 100, // Max cents difference to associate peak to track (1 semitone)
  MAX_TRACKS: 64, // Maximum simultaneous tracks
  TRACK_TIMEOUT_MS: 1000, // Remove track after this inactive time
} as const

// Harmonic detection settings
export const HARMONIC_SETTINGS = {
  MAX_HARMONIC: 8, // Check overtones up to this partial (2nd–8th)
  TOLERANCE_CENTS: 100, // ±100 cents = 1 semitone; synced with ASSOCIATION_TOLERANCE_CENTS
  // Sub-harmonic check: if new peak F and an active track is near F*k, new peak may be the fundamental
  CHECK_SUB_HARMONICS: true,
} as const

// Band cooldown — suppresses re-triggering the same GEQ band after an advisory is explicitly cleared
export const BAND_COOLDOWN_MS = 1500

// Canvas rendering settings
export const CANVAS_SETTINGS = {
  RTA_DB_MIN: -100,
  RTA_DB_MAX: 0,
  RTA_FREQ_MIN: 20,
  RTA_FREQ_MAX: 20000,
  WATERFALL_HISTORY_FRAMES: 256,
  GEQ_BAR_WIDTH_RATIO: 0.8, // Bar width as ratio of band spacing
} as const

// ============================================================================
// OPERATION MODE PRESETS — Professional Live Sound Scenarios
// Research-informed: DBX AFS whitepaper, Smaart v8 measurement guide,
// Master Handbook of Acoustics (Everest), Sound Insulation (Hopkins)
// ============================================================================

export interface ModePreset {
  label: string
  description: string
  // Detection thresholds
  feedbackThresholdDb: number
  ringThresholdDb: number
  growthRateThreshold: number
  // Content awareness
  musicAware: boolean
  autoMusicAware: boolean
  // Analysis parameters
  fftSize: 4096 | 8192 | 16384
  minFrequency: number
  maxFrequency: number
  // Timing
  sustainMs: number
  clearMs: number
  holdTimeMs: number
  // Sensitivity
  confidenceThreshold: number
  prominenceDb: number
  relativeThresholdDb: number
  // Display/EQ
  eqPreset: 'surgical' | 'heavy'
  aWeightingEnabled: boolean
  inputGainDb: number
  ignoreWhistle: boolean
}

export const OPERATION_MODES: Record<string, ModePreset> = {
  // ── SPEECH / CONFERENCE (DEFAULT) ────────────────────────────────────────
  // Corporate presentations, conferences, lectures, panel discussions, town halls
  // Environment: Treated ballrooms, exhibit halls, conference rooms (50–2000 m³)
  // RT60 0.5–1.5 s. Speech only — no music content.
  // Priority: Maximum sensitivity, early detection, preserve speech clarity.
  // Ref: Speech range 170–4000 Hz (Everest), extend to 8 kHz for sibilance.
  //      A-weighting appropriate for speech SPL (~65–85 dBA).
  //      Consonant transients 5–15 ms — sustainMs must exceed this.
  speech: {
    label: 'Speech',
    description: 'Corporate & Conference',
    feedbackThresholdDb: 6,
    ringThresholdDb: 3,
    growthRateThreshold: 1.0,
    musicAware: false,
    autoMusicAware: false,
    fftSize: 8192,           // 5.9 Hz resolution, 170 ms time constant at 48 kHz
    minFrequency: 150,       // Extended for chest-resonance body mics
    maxFrequency: 8000,      // Speech sibilance upper bound
    sustainMs: 150,          // Fast confirmation — load-in friendly, above consonant transients
    clearMs: 350,            // Quick clearing for responsive display
    holdTimeMs: 4000,        // Long hold — time to walk to EQ rack during load-in
    confidenceThreshold: 0.30, // Very aggressive — surface everything during ring-out
    prominenceDb: 8,         // Low prominence catches subtle peaks in empty rooms
    relativeThresholdDb: 16, // Sensitive relative threshold
    eqPreset: 'surgical',   // Narrow cuts preserve speech clarity
    aWeightingEnabled: true, // Prioritizes 2–5 kHz speech intelligibility band
    inputGainDb: 15,
    ignoreWhistle: true,
  },

  // ── WORSHIP / HOUSE OF WORSHIP ───────────────────────────────────────────
  // Churches, synagogues, mosques, temples, cathedrals
  // Environment: Highly reverberant (1.0–3.0 s RT60), large volumes (500–5000 m³),
  //   stone/glass/hard surfaces, often with balconies.
  // Content: Mix of speech (sermon) and music (choir, organ, worship band, piano).
  // Priority: Handle reverberant space, music discrimination, protect speech moments.
  // Ref: Church RT60 1.5–4.0 s (Everest Fig 7-13). Schroeder freq for 1000 m³ / 2.0 s ≈ 89 Hz.
  //      Organ extends to 16 Hz fundamental; worship band to 12 kHz+.
  worship: {
    label: 'Worship',
    description: 'House of Worship',
    feedbackThresholdDb: 8,
    ringThresholdDb: 5,
    growthRateThreshold: 2.0,
    musicAware: true,
    autoMusicAware: true,    // Auto-switch when worship band starts/stops
    fftSize: 8192,
    minFrequency: 100,       // Organ and piano extend low
    maxFrequency: 12000,     // Cymbals and choir harmonics
    sustainMs: 280,          // Tightened for load-in — reverb decay still handled
    clearMs: 500,            // Slower clearing in reverberant environment
    holdTimeMs: 4000,        // Long hold in reverberant space
    confidenceThreshold: 0.45, // Slightly more aggressive — surface more during setup
    prominenceDb: 12,        // Lowered to catch quieter resonances during load-in
    relativeThresholdDb: 20, // Higher relative threshold for reverberant noise floor
    eqPreset: 'surgical',   // Narrow cuts avoid coloring worship music
    aWeightingEnabled: false, // Full spectrum important for organ/choir
    inputGainDb: 10,
    ignoreWhistle: true,
  },

  // ── LIVE MUSIC ───────────────────────────────────────────────────────────
  // Concerts, club gigs, festivals, arena shows, battle of the bands
  // Environment: Variable (small clubs to arenas), 0.5–2.0 s RT60, high SPL (95–120 dBA).
  // Content: Music dominant — high broadband energy, transient-rich program material.
  // Priority: Avoid false positives from instruments, only catch genuine runaway feedback.
  // Ref: DBX whitepaper — music-aware mode critical for live performance.
  //      At high SPL, ear response flattens (equal-loudness contours) — use flat weighting.
  //      Smaart recommends spectrograph (not RTA) for feedback ID during music.
  liveMusic: {
    label: 'Live Music',
    description: 'Concerts & Events',
    feedbackThresholdDb: 14,
    ringThresholdDb: 8,
    growthRateThreshold: 4.0,
    musicAware: true,
    autoMusicAware: false,   // Always music-aware in this mode
    fftSize: 4096,           // Fast 85 ms time response for dynamic transients
    minFrequency: 60,        // Full range for bass/sub instruments
    maxFrequency: 16000,     // Full range for cymbals, brass harmonics
    sustainMs: 350,          // Tightened for load-in — still avoids musical transients
    clearMs: 600,            // Slow clearing for sustained musical content
    holdTimeMs: 3000,        // Extended — time to walk to EQ during sound check
    confidenceThreshold: 0.55, // Slightly more sensitive for load-in discovery
    prominenceDb: 14,        // Lowered to catch resonances in empty venue
    relativeThresholdDb: 24, // Very high — only extreme peaks relative to noise
    eqPreset: 'heavy',      // Wider cuts for emergency feedback killing
    aWeightingEnabled: false, // Flat weighting at high SPL
    inputGainDb: 0,          // Hot line-level signal from console
    ignoreWhistle: false,    // Whistling instruments exist in music
  },

  // ── THEATER / DRAMA ──────────────────────────────────────────────────────
  // Broadway, community theater, musicals, spoken drama, opera
  // Environment: Treated theaters (0.6–1.2 s RT60), moderate volume (200–1500 m³).
  // Content: Mix of dialogue (body-worn lavaliers) and musical numbers (orchestra/band).
  // Priority: Catch feedback during quiet dialogue, handle musical numbers gracefully.
  // Ref: C50 clarity metric weights: 500 Hz (15%), 1 kHz (25%), 2 kHz (35%), 4 kHz (25%).
  //      Body mic proximity effect extends usable range below 200 Hz.
  theater: {
    label: 'Theater',
    description: 'Drama & Musicals',
    feedbackThresholdDb: 7,
    ringThresholdDb: 4,
    growthRateThreshold: 1.5,
    musicAware: true,
    autoMusicAware: true,    // Auto-detect when orchestra starts/stops
    fftSize: 8192,
    minFrequency: 150,       // Body mic range with proximity effect
    maxFrequency: 10000,     // Extended for sibilance from lavaliers
    sustainMs: 200,          // Tightened for load-in — fast for dialogue dynamics
    clearMs: 400,            // Standard clearing
    holdTimeMs: 4000,        // Extended — time to walk to EQ during load-in
    confidenceThreshold: 0.40, // More aggressive — surface more during setup
    prominenceDb: 10,        // Lowered to catch quieter resonances in empty theater
    relativeThresholdDb: 18,
    eqPreset: 'surgical',   // Narrow cuts preserve dialogue clarity
    aWeightingEnabled: true, // A-weighting helps for dialogue-focused detection
    inputGainDb: 12,         // Moderate gain for body mics
    ignoreWhistle: true,
  },

  // ── MONITORS / WEDGES ────────────────────────────────────────────────────
  // Stage wedge monitors, sidefills, drum fills, in-ear monitoring
  // Environment: On-stage, very close mic-to-speaker proximity, high stage SPL.
  // Content: Mix of instruments and vocals — each monitor carries different mix.
  // Priority: Ultra-fast detection, narrow surgical cuts, prevent feedback before ring-out.
  // Ref: DBX whitepaper — "every millisecond counts" for monitor feedback.
  //      Monitor feedback typically 200–6000 Hz (vocal/mid range).
  //      Short feedback loop delay = wider feedback regions (fewer, broader peaks).
  monitors: {
    label: 'Monitors',
    description: 'Stage Wedges',
    feedbackThresholdDb: 5,
    ringThresholdDb: 3,
    growthRateThreshold: 0.8,
    musicAware: false,       // Monitor feedback is priority over music discrimination
    autoMusicAware: false,
    fftSize: 4096,           // Fastest time response for instant detection
    minFrequency: 200,       // Monitor feedback typically mid-range
    maxFrequency: 6000,      // Most monitor feedback is mid-range
    sustainMs: 200,          // Fast confirmation — raised from 150ms to reduce transient false positives
    clearMs: 300,            // Fast clearing
    holdTimeMs: 3000,        // Extended — time to walk to EQ during load-in
    confidenceThreshold: 0.35, // More aggressive — surface everything during ring-out
    prominenceDb: 8,         // Lowered to catch subtler resonances during setup
    relativeThresholdDb: 15,
    eqPreset: 'surgical',   // Narrow notches preserve monitor clarity
    aWeightingEnabled: false,
    inputGainDb: 5,          // Hot signal from console
    ignoreWhistle: false,    // Whistle-like feedback is real in monitors
  },

  // ── RING OUT / CALIBRATION ───────────────────────────────────────────────
  // Pre-show system tuning, microphone gain structure setup, sound check
  // Environment: Any venue — used during sound check with no audience/program.
  // Content: No program material — test signals or deliberate feedback provocation.
  // Priority: Maximum sensitivity, catch every resonance, find all problem frequencies.
  // Ref: Smaart recommends 16K FFT + 1/24-octave banding for feedback work.
  //      DBX whitepaper: AFS Fixed Mode — ring out with performers present when possible.
  ringOut: {
    label: 'Ring Out',
    description: 'System Calibration',
    feedbackThresholdDb: 4,
    ringThresholdDb: 2,
    growthRateThreshold: 0.5,
    musicAware: false,
    autoMusicAware: false,
    fftSize: 16384,          // Maximum frequency resolution (2.93 Hz at 48 kHz)
    minFrequency: 60,        // Full range analysis
    maxFrequency: 16000,     // Full range
    sustainMs: 200,          // Fast confirmation — raised from 150ms to reduce noise false positives
    clearMs: 300,            // Fast clearing
    holdTimeMs: 5000,        // Long hold for reference during EQ adjustments
    confidenceThreshold: 0.30, // Surface everything
    prominenceDb: 8,         // Very low prominence threshold
    relativeThresholdDb: 12, // Very sensitive
    eqPreset: 'surgical',   // Precise notch placement
    aWeightingEnabled: false, // Full spectrum during calibration
    inputGainDb: 15,
    ignoreWhistle: true,
  },

  // ── BROADCAST / STUDIO ───────────────────────────────────────────────────
  // TV studios, radio, podcast, recording, voice-over booths
  // Environment: Treated, very quiet (NCB-15 to NCB-20), small/medium rooms, 0.3–0.5 s RT60.
  // Content: Speech dominant (news anchors, DJs, podcast hosts), occasional music playback.
  // Priority: Very sensitive detection in quiet environment, zero tolerance for feedback.
  // Ref: Everest — studio noise floor NCB-15 to NCB-20. Close-mic proximity effect
  //      extends usable range below 200 Hz. Speech dynamic range ~42 dB.
  broadcast: {
    label: 'Broadcast',
    description: 'Studio & Podcast',
    feedbackThresholdDb: 5,
    ringThresholdDb: 3,
    growthRateThreshold: 1.0,
    musicAware: false,
    autoMusicAware: false,
    fftSize: 8192,
    minFrequency: 80,        // Extended low for proximity effect on broadcast mics
    maxFrequency: 12000,     // Broadcast audio extends higher than speech
    sustainMs: 150,          // Tightened for load-in — fast confirmation
    clearMs: 350,            // Fast clearing
    holdTimeMs: 4000,        // Extended — time to walk to EQ during setup
    confidenceThreshold: 0.30, // Very aggressive — surface everything in quiet studio
    prominenceDb: 8,         // Lowered to catch subtle resonances in treated room
    relativeThresholdDb: 14, // Sensitive — low noise floor makes relative work well
    eqPreset: 'surgical',   // Precise cuts for broadcast quality
    aWeightingEnabled: true, // A-weighting for speech focus
    inputGainDb: 15,
    ignoreWhistle: true,
  },

  // ── OUTDOOR / FESTIVAL ───────────────────────────────────────────────────
  // Open-air concerts, festivals, outdoor ceremonies, sports events
  // Environment: No room reflections, wind/ambient noise, large throw distances.
  //   Atmospheric absorption reduces HF propagation.
  // Content: Variable — speech for ceremonies, music for concerts.
  // Priority: Handle wind noise, ignore ambient, focus on genuine speaker-to-mic coupling.
  // Ref: Free-field falloff 6 dB per doubling distance (Everest). No room modes.
  //      Wind noise predominantly below 100 Hz. Atmospheric HF absorption above 8 kHz.
  outdoor: {
    label: 'Outdoor',
    description: 'Open Air & Festivals',
    feedbackThresholdDb: 10,
    ringThresholdDb: 6,
    growthRateThreshold: 2.5,
    musicAware: false,       // User enables if music present
    autoMusicAware: false,
    fftSize: 4096,           // Fast time response for dynamic outdoor conditions
    minFrequency: 100,       // Above wind rumble range
    maxFrequency: 12000,     // Reduced HF due to atmospheric absorption
    sustainMs: 250,          // Tightened for load-in — less ambient during setup
    clearMs: 450,            // Moderate clearing
    holdTimeMs: 3500,        // Extended — time to walk to EQ during load-in
    confidenceThreshold: 0.45, // Slightly more aggressive — less ambient during setup
    prominenceDb: 12,        // Lowered — quieter environment during load-in
    relativeThresholdDb: 22, // Higher relative threshold for noisy outdoor
    eqPreset: 'heavy',      // Wider cuts for outdoor PA
    aWeightingEnabled: true, // A-weighting helps filter wind rumble perception
    inputGainDb: 5,          // Line level from console
    ignoreWhistle: true,
  },
} as const

// Default settings for the analyzer — OPTIMIZED FOR CORPORATE/CONFERENCE SPEECH SYSTEMS
// Target: Large ballrooms, exhibit halls, convention centers (speech through PA)
// Research: Everest speech range 170–4000 Hz, extend to 8 kHz for sibilance.
//           Ballroom RT60 0.8–1.5 s, volume 500–2000 m³, Schroeder freq ~63–100 Hz.
//           A-weighting appropriate for moderate speech SPL (~65–85 dBA).
//           AGGRESSIVE DETECTION — better false positives than missed real feedback.
export const DEFAULT_SETTINGS = {
  mode: 'speech' as const, // Speech/Conference is the default for corporate PA
  fftSize: 8192 as const, // 5.9 Hz resolution, 170 ms at 48 kHz — balanced for speech
  smoothingTimeConstant: 0.5, // Faster response for quick detection
  minFrequency: 150, // Extended for body mic chest resonance (Everest: speech starts ~170 Hz)
  maxFrequency: 8000, // Speech sibilance upper bound (intelligibility band: 500 Hz–4 kHz)
  feedbackThresholdDb: 6, // AGGRESSIVE — catch feedback before audience hears it
  ringThresholdDb: 3, // AGGRESSIVE — catch resonances before they become feedback
  growthRateThreshold: 1.0, // FAST — detect growing peaks immediately
  holdTimeMs: 4000, // Long hold — time to walk to EQ rack during load-in
  noiseFloorDecay: 0.98, // Fast adaptation for dynamic conference environments
  peakMergeCents: 150, // 1.5 semitones — wider merge window reduces same-band duplicate advisories
  maxDisplayedIssues: 8, // Show more issues — don't hide potential problems
  eqPreset: 'surgical' as const, // Precise narrow cuts preserve speech clarity
  musicAware: false, // Disabled — no music in corporate/conference
  autoMusicAware: false, // Auto music-aware off for speech systems
  autoMusicAwareHysteresisDb: 15, // 15 dB above noise floor = band is playing
  inputGainDb: 15, // Default input gain (adjustable -40 to +40 dB)
  autoGainEnabled: true, // Auto-gain on by default — finds optimal level for any venue
  graphFontSize: 15, // Default label size for canvas graphs (8–26 px)
  harmonicToleranceCents: 100, // ±100 cents for harmonic matching; synced with ASSOCIATION_TOLERANCE_CENTS
  showTooltips: true, // Show help tooltips (useful for AV techs)
  aWeightingEnabled: true, // A-WEIGHTING ON — prioritizes speech intelligibility band (2–5 kHz)
  // Confidence filtering — LOW threshold, surface almost everything
  confidenceThreshold: 0.30, // 30% — very aggressive, load-in optimized
  // Room acoustics — defaults to large ballroom / exhibit hall
  roomRT60: 1.0, // Large ballroom (hard floors, high ceilings, 0.8–1.5 s typical)
  roomVolume: 1000, // ~1000 m³ ballroom (50×40×20 ft, seats ~200 people)
  // Room preset identifier
  roomPreset: 'large' as const, // Default to large auditorium/ballroom

  // ==================== ADVANCED ALGORITHM SETTINGS ====================
  // Based on DAFx-16, DBX, and KU Leuven research papers
  // TUNED FOR FAST DETECTION (accepts more false positives for speed)
  algorithmMode: 'combined' as const, // MSD + Phase for best accuracy
  showAlgorithmScores: false, // Hide advanced scores by default
  // Harmonic filter and room mode settings
  harmonicFilterEnabled: true, // Enable harmonic series detection to filter instruments
  roomModesEnabled: false, // Room mode calculation disabled by default (advanced)
  roomLengthM: 15, // Default room length — large ballroom (~50 ft)
  roomWidthM: 12, // Default room width — large ballroom (~40 ft)
  roomHeightM: 5, // Default ceiling height — ballroom (~16 ft)
  roomDimensionsUnit: 'meters' as const,
  // Peak timing — fast for speech dynamics (consonant transients 5–15 ms)
  sustainMs: 150, // Fast confirmation — load-in friendly, above consonant transients
  clearMs: 350, // Quick clearing for responsive display
  // Threshold control
  thresholdMode: 'hybrid' as const,
  relativeThresholdDb: 16, // Sensitive relative threshold for speech
  prominenceDb: 8, // Low prominence catches subtle peaks in empty rooms during load-in
  // Noise floor timing
  noiseFloorAttackMs: 200, // Fast attack for dynamic conference environments
  noiseFloorReleaseMs: 1000, // Moderate release
  // Track management
  maxTracks: 64,
  trackTimeoutMs: 1000, // Remove track after 1 s inactive
  ignoreWhistle: true, // Suppress whistle classifications in corporate setting
  // Display / canvas
  rtaDbMin: -100,
  rtaDbMax: 0,
  spectrumLineWidth: 1.5,
}

// Room size presets — covers common professional venue types
// Schroeder freq = 2000 * sqrt(RT60 / Volume) — below this, room modes dominate
export const ROOM_PRESETS = {
  small: {
    label: 'Small Room',
    description: 'Boardrooms, huddle rooms, podcast booths (10–20 people)',
    roomRT60: 0.4, // Well-treated small room (Hopkins: furnished dwellings 0.4–0.6 s)
    roomVolume: 80, // ~80 m³ (20×15×10 ft)
    schroederFreq: 141, // 2000 * sqrt(0.4/80) ≈ 141 Hz
    feedbackThresholdDb: 5,
    ringThresholdDb: 3,
  },
  medium: {
    label: 'Medium Room',
    description: 'Conference rooms, classrooms, training rooms (20–80 people)',
    roomRT60: 0.7, // Treated conference room
    roomVolume: 300, // ~300 m³ (35×28×12 ft)
    schroederFreq: 97, // 2000 * sqrt(0.7/300) ≈ 97 Hz
    feedbackThresholdDb: 6,
    ringThresholdDb: 4,
  },
  large: {
    label: 'Large Venue',
    description: 'Ballrooms, auditoriums, theaters, town halls (80–500 people)',
    roomRT60: 1.0, // Ballroom / auditorium
    roomVolume: 1000, // ~1000 m³ (50×40×20 ft)
    schroederFreq: 63, // 2000 * sqrt(1.0/1000) ≈ 63 Hz
    feedbackThresholdDb: 7,
    ringThresholdDb: 5,
  },
  arena: {
    label: 'Arena / Hall',
    description: 'Concert halls, arenas, convention centers (500+ people)',
    roomRT60: 1.8, // Concert hall / arena (Everest: 1.5–2.5 s)
    roomVolume: 5000, // ~5000 m³
    schroederFreq: 38, // 2000 * sqrt(1.8/5000) ≈ 38 Hz
    feedbackThresholdDb: 9,
    ringThresholdDb: 6,
  },
  worship: {
    label: 'Worship Space',
    description: 'Churches, cathedrals, temples (highly reverberant)',
    roomRT60: 2.0, // Reverberant worship (Everest Fig 7-13: 1.5–4.0 s)
    roomVolume: 2000, // ~2000 m³ — medium church
    schroederFreq: 63, // 2000 * sqrt(2.0/2000) ≈ 63 Hz
    feedbackThresholdDb: 8,
    ringThresholdDb: 5,
  },
  custom: {
    label: 'Custom',
    description: 'Manual RT60 and volume settings',
    roomRT60: 1.0,
    roomVolume: 1000,
    schroederFreq: 63,
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
  DEFAULT_MIN_FRAMES: 20, // ~333ms at 60fps — increased from 15 for better statistical confidence
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

// Signal presence gate — prevents auto-gain from amplifying silence into phantom peaks
export const SIGNAL_GATE = {
  /** Default silence threshold in dBFS (pre-gain). Below this, no detection runs. */
  DEFAULT_SILENCE_THRESHOLD_DB: -65,
  /** Per-mode overrides (quieter venues need lower thresholds) */
  MODE_SILENCE_THRESHOLDS: {
    speech: -65,
    worship: -60,
    liveMusic: -55,
    theater: -68,
    monitors: -55,
    ringOut: -70,      // ring-out wants maximum sensitivity
    broadcast: -70,    // studio is very quiet
    outdoor: -55,
  } as Record<string, number>,
} as const

// Hysteresis for peak re-detection — prevents on-off-on flickering
export const HYSTERESIS = {
  /** Extra dB above threshold required to re-trigger a recently cleared peak */
  RE_TRIGGER_DB: 3,
} as const

// Hotspot event cooldown — prevents inflated occurrence counts from rapid re-triggers
export const HOTSPOT_COOLDOWN_MS = 2000

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
