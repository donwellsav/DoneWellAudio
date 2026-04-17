// DoneWell Audio Types - Full type definitions for the feedback detection system

// Re-export algorithm types defined in advancedDetection.ts so consumers
// can import everything from '@/types/advisory'
export type { AlgorithmScores, FusedDetectionResult, InterHarmonicResult, PTMRResult, MLScoreResult } from '@/lib/dsp/advancedDetection'
export type Algorithm = 'msd' | 'phase' | 'spectral' | 'comb' | 'ihr' | 'ptmr' | 'ml'
export type AlgorithmMode = 'auto' | 'custom' | 'msd' | 'phase' | 'combined' | 'all' // legacy modes kept for backward compat
export type ContentType = 'speech' | 'music' | 'compressed' | 'unknown'
export type MicCalibrationProfile = 'none' | 'ecm8000' | 'rta-m' | 'smartphone'

export type ThresholdMode = 'absolute' | 'relative' | 'hybrid'
// Professional live sound operation modes — each configures detection for a specific scenario
export type OperationMode = 'speech' | 'worship' | 'liveMusic' | 'theater' | 'monitors' | 'ringOut' | 'broadcast' | 'outdoor'
export type Preset = 'surgical' | 'heavy'
export type SeverityLevel = 'RUNAWAY' | 'GROWING' | 'RESONANCE' | 'POSSIBLE_RING' | 'WHISTLE' | 'INSTRUMENT'
/** @deprecated Use SeverityLevel instead. Kept for backward compatibility. */
export type Severity = SeverityLevel | 'unknown'
export type IssueLabel = 'ACOUSTIC_FEEDBACK' | 'WHISTLE' | 'INSTRUMENT' | 'POSSIBLE_RING'
export type PEQType = 'bell' | 'notch' | 'highShelf' | 'lowShelf' | 'HPF' | 'LPF'
export type ShelfType = 'highShelf' | 'lowShelf' | 'HPF' | 'LPF'
export type SpectrumSmoothingMode = 'raw' | 'perceptual'

/** MSD algorithm output — used by fusion engine and classification. */
export interface MSDResult {
  msd: number
  feedbackScore: number
  secondDerivative: number
  isFeedbackLikely: boolean
  framesAnalyzed: number
  /** Mean magnitude over the history window (dB) — used for energy gate */
  meanMagnitudeDb: number
}

export interface AnalysisConfig {
  fftSize: number
  minHz: number
  maxHz: number
  analysisIntervalMs: number
  sustainMs: number
  clearMs: number
  thresholdMode: ThresholdMode
  thresholdDb: number
  relativeThresholdDb: number
  prominenceDb: number
  neighborhoodBins: number
  maxIssues: number
  ignoreWhistle: boolean
  preset: Preset
  mode: OperationMode
  aWeightingEnabled: boolean
  micCalibrationProfile: MicCalibrationProfile
  // Room acoustics for Schroeder frequency calculation
  roomRT60?: number
  roomVolume?: number
  // Confidence threshold for filtering
  confidenceThreshold?: number
  // Noise floor settings
  noiseFloorEnabled: boolean
  noiseFloorSampleCount: number
  noiseFloorAttackMs: number
  noiseFloorReleaseMs: number
  // Input gain (software boost/cut applied to spectrum)
  inputGainDb: number
  autoGainEnabled: boolean
}

export interface DetectedPeak {
  binIndex: number
  trueFrequencyHz: number
  trueAmplitudeDb: number
  prominenceDb: number
  sustainedMs: number
  harmonicOfHz: number | null
  isSubHarmonicRoot?: boolean // True when this peak is the root of a harmonic series already active
  timestamp: number
  noiseFloorDb: number | null
  effectiveThresholdDb: number
  // MSD (Magnitude Slope Deviation) analysis - DAFx-16 algorithm
  // Lower MSD = more consistent growth = more likely feedback howl
  msd?: number // MSD value (-1 if not enough history)
  msdGrowthRate?: number // Average dB growth per frame
  msdIsHowl?: boolean // True if MSD indicates feedback howl pattern
  msdFastConfirm?: boolean // True if MSD confirms feedback quickly (for speed priority)
  // Phase 2: Peak Persistence Scoring
  // Higher persistence = more likely feedback (pure tone persists)
  persistenceFrames?: number // Consecutive frames at this frequency
  persistenceBoost?: number // Probability boost based on persistence
  isPersistent?: boolean // True if persistence >= MIN_PERSISTENCE_FRAMES
  isHighlyPersistent?: boolean // True if persistence >= HIGH_PERSISTENCE_FRAMES
  // Q and bandwidth from -3dB analysis
  qEstimate?: number // Estimated Q factor
  bandwidthHz?: number // -3dB bandwidth in Hz
  /** PHPR (Peak-to-Harmonic Power Ratio) in dB — high = pure tone (feedback), low = harmonics (music) */
  phpr?: number
}

export interface TrackFeatures {
  stabilityCentsStd: number
  meanQ: number
  minQ: number
  meanVelocityDbPerSec: number
  maxVelocityDbPerSec: number
  persistenceMs: number
  harmonicityScore: number
  modulationScore: number
  noiseSidebandScore: number
}

export interface TrackHistoryEntry {
  time: number
  freqHz: number
  ampDb: number
  prominenceDb: number
  qEstimate: number
}

export interface Track {
  id: string
  binIndex: number
  trueFrequencyHz: number
  trueAmplitudeDb: number
  prominenceDb: number
  onsetTime: number
  onsetDb: number
  lastUpdateTime: number
  history: TrackHistoryEntry[]
  features: TrackFeatures
  qEstimate: number
  bandwidthHz: number
  /** PHPR (Peak-to-Harmonic Power Ratio) in dB */
  phpr?: number
  velocityDbPerSec: number
  harmonicOfHz: number | null
  isSubHarmonicRoot: boolean // True when this track is the fundamental of a partial series
  isActive: boolean
  // MSD (Magnitude Slope Deviation) analysis - DAFx-16 algorithm
  msd?: number // Current MSD value
  msdGrowthRate?: number // Average dB growth per frame
  msdIsHowl?: boolean // True if MSD indicates feedback howl pattern
  msdFastConfirm?: boolean // True if MSD confirms feedback quickly
  // Phase 2: Peak Persistence Scoring
  persistenceFrames?: number // Consecutive frames at this frequency
  persistenceBoost?: number // Probability boost from persistence
  isPersistent?: boolean // True if persistence >= MIN_PERSISTENCE_FRAMES
  isHighlyPersistent?: boolean // True if persistence >= HIGH_PERSISTENCE_FRAMES
  // Phase 3: Adjacent Frequency Detection (beating)
  hasAdjacentPeaks?: boolean // True if nearby peaks causing beating detected
  adjacentPeakIds?: string[] // IDs of adjacent peaks
  beatFrequencies?: number[] // Beat frequencies in Hz
  clusterCenterHz?: number // Center of the frequency cluster
  clusterWidthHz?: number // Width of the cluster
  // Early-warning dP/dt annotation — rising probability trajectory
  earlyWarning?: 'BUILDING' | 'GROWING' | null
}

export interface ClassificationResult {
  pFeedback: number
  pWhistle: number
  pInstrument: number
  pUnknown: number
  label: IssueLabel
  severity: SeverityLevel
  confidence: number
  fusionVerdict:
    | 'FEEDBACK'
    | 'POSSIBLE_FEEDBACK'
    | 'NOT_FEEDBACK'
    | 'UNCERTAIN'
  recommendationEligible: boolean
  reasons: string[]
  // Enhanced fields from acoustic analysis
  modalOverlapFactor?: number // M = 1/Q (isolated < 0.03, coupled < 0.1, diffuse > 0.33)
  cumulativeGrowthDb?: number // Total dB growth since onset
  frequencyHz?: number // Actual peak frequency for downstream gates
  frequencyBand?: 'LOW' | 'MID' | 'HIGH' // Which frequency band this falls into
  confidenceLabel?: 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH' // Human-readable confidence
  prominenceDb?: number // Carried through for downstream filtering
  speechLikePattern?: boolean // Formant-pattern speech / sung-vowel suppressor fired
  roomModeRisk?: boolean // Multiple low-frequency room-physics cues aligned against feedback
}

export interface PitchInfo {
  note: string
  octave: number
  cents: number
  midi: number
}

export interface GEQRecommendation {
  bandHz: number
  bandIndex: number
  suggestedDb: number
}

export interface PEQRecommendation {
  type: PEQType
  hz: number
  q: number
  gainDb: number
  /** -3dB bandwidth in Hz (from measured peak analysis) */
  bandwidthHz?: number
  /** Recommendation framing for UI: narrow offender vs broader corrective region. */
  strategy?: 'narrow-cut' | 'broad-region'
  /** Human-readable explanation of why the chosen strategy was used. */
  reason?: string
}

export interface ShelfRecommendation {
  type: ShelfType
  hz: number
  gainDb: number
  reason: string
}

export interface RecommendationContext {
  recurrenceCount: number
  learnedCutDb?: number
  successfulCutCount?: number
}

export interface EQAdvisory {
  geq: GEQRecommendation
  peq: PEQRecommendation
  shelves: ShelfRecommendation[]
  pitch: PitchInfo
  recommendationContext?: RecommendationContext
  /** Summary of any broadband tonal issue that should stay separate from the acute cut. */
  tonalIssueSummary?: string
}

export interface Advisory {
  id: string
  trackId: string
  timestamp: number
  label: IssueLabel
  severity: SeverityLevel
  confidence: number
  why: string[]
  trueFrequencyHz: number
  trueAmplitudeDb: number
  prominenceDb: number
  qEstimate: number
  bandwidthHz: number
  /** PHPR (Peak-to-Harmonic Power Ratio) in dB */
  phpr?: number
  velocityDbPerSec: number
  stabilityCentsStd: number
  harmonicityScore: number
  modulationScore: number
  advisory: EQAdvisory
  // Feedback prediction fields
  isRunaway?: boolean
  predictedTimeToClipMs?: number
  // Enhanced detection fields (from textbook research)
  modalOverlapFactor?: number // M = 1/Q (isolated < 0.03, coupled < 0.1, diffuse > 0.33)
  cumulativeGrowthDb?: number // Total dB growth since onset
  frequencyBand?: 'LOW' | 'MID' | 'HIGH' // Which frequency band this falls into
  schroederFrequency?: number // Calculated Schroeder frequency for reference
  // Cluster info — tracks merged peaks in same GEQ band
  clusterCount?: number // Number of peaks merged into this advisory (default 1)
  clusterMinHz?: number // Lowest frequency in merged cluster
  clusterMaxHz?: number // Highest frequency in merged cluster
  /** Algorithm scores that contributed to this detection (debug display) */
  algorithmScores?: {
    msd: number | null
    phase: number | null
    spectral: number | null
    comb: number | null
    ihr: number | null
    ptmr: number | null
    ml: number | null
    fusedProbability: number
  }
  /** Spectral profile ±1 octave around detection — for smarter notch decisions */
  spectralProfile?: {
    lowHz: number
    highHz: number
    peakHz: number
    samples: number[]
    isHarmonic: boolean
  }
  // UI-only: resolved state (worker never produces these)
  resolved?: boolean // True when worker cleared but user hasn't dismissed yet
  resolvedAt?: number // Timestamp when marked resolved
}

export interface SpectrumData {
  freqDb: Float32Array
  power: Float32Array
  noiseFloorDb: number | null
  effectiveThresholdDb: number
  sampleRate: number
  fftSize: number
  timestamp: number
  peak: number // Peak level in dB for metering
  // Auto-gain control status
  autoGainEnabled?: boolean // Whether auto-gain is active
  autoGainDb?: number // Current auto-computed gain in dB
  autoGainLocked?: boolean // True when auto-gain has finished calibration and is frozen
  rawPeakDb?: number // Pre-gain peak level in dBFS
  // Algorithm status fields (populated by DSP worker)
  algorithmMode?: AlgorithmMode // Which detection algorithm is active
  contentType?: ContentType // Detected content type (speech, music, compressed, unknown)
  msdFrameCount?: number // Number of frames accumulated for MSD calculation
  isCompressed?: boolean // Whether compressed/limited audio is detected
  compressionRatio?: number // Estimated compression ratio (1.0 = no compression, higher = more compressed)
  isSignalPresent?: boolean // True when pre-gain signal is above silence threshold
}

export interface AnalyzerState {
  isRunning: boolean
  hasPermission: boolean
  error: string | null
  noiseFloorDb: number | null
  spectrum: SpectrumData | null
  tracks: Track[]
  advisories: Advisory[]
}

// TrackSummary - compact worker -> UI track payload
export interface TrackSummary {
  id: string
  frequency: number
  amplitude: number
  prominenceDb: number
  qEstimate: number
  bandwidthHz: number
  classification: Severity
  severity: Severity
  onsetTime: number
   onsetAmplitudeDb: number
  lastUpdateTime: number
  active: boolean
  features: {
    stabilityCentsStd: number
    harmonicityScore: number
    modulationScore: number
    velocityDbPerSec: number
  }
  // Phase 2+6: MSD and persistence for hybrid fusion
  msd?: number
  msdIsHowl?: boolean
  persistenceFrames?: number
}

// TrackedPeak - legacy detailed track shape with history
export interface TrackedPeak extends TrackSummary {
  history: Array<{
    time: number
    frequency: number
    amplitude: number
  }>
}

// DetectorSettings - primary settings interface for the analyzer
export interface DetectorSettings {
  mode: OperationMode
  fftSize: 4096 | 8192 | 16384
  smoothingTimeConstant: number
  minFrequency: number
  maxFrequency: number
  feedbackThresholdDb: number
  ringThresholdDb: number
  growthRateThreshold: number
  peakMergeCents: number
  maxDisplayedIssues: number
  eqPreset: 'surgical' | 'heavy'
  inputGainDb: number // Software gain applied to analysis (-40 to +40 dB)
  autoGainEnabled: boolean // Auto-adjust inputGainDb based on signal level
  autoGainTargetDb: number // Target post-gain peak level for auto-gain (-30 to -6 dBFS)
  graphFontSize: number // Font size for canvas graph labels (8-26px, default 15px)
  harmonicToleranceCents: number // Cents window for harmonic/sub-harmonic matching (25–400, default 200)
  showTooltips: boolean // Show/hide all help tooltips throughout the UI
  aWeightingEnabled: boolean // Apply A-weighting curve to analysis (per IEC 61672-1)
  micCalibrationProfile: MicCalibrationProfile // Measurement mic compensation profile ('none' | 'ecm8000' | 'rta-m')
  // Confidence and filtering
  confidenceThreshold: number // Minimum confidence to display (0.0-1.0, default 0.35)
  // Unified room physics (acoustics + mode calculator)
  roomRT60: number // Reverberation time in seconds (auto-derived from dimensions + treatment)
  roomVolume: number // Room volume in m³ (auto-derived from dimensions)
  roomPreset: 'none' | 'small' | 'medium' | 'large' | 'arena' | 'worship' | 'custom' // Room preset ('none' disables all room physics)
  roomTreatment: 'untreated' | 'typical' | 'treated' // Acoustic treatment level for RT60 estimation
  roomLengthM: number // Room length (in display unit, converted at use)
  roomWidthM: number // Room width
  roomHeightM: number // Room height
  roomDimensionsUnit: 'meters' | 'feet' // Unit for dimension input
  mainsHumEnabled: boolean // Whether mains hum detection gate is active
  mainsHumFundamental: 'auto' | 50 | 60 // Mains frequency: auto-detect or explicit 50/60 Hz
  // Algorithm mode and scoring display
  algorithmMode: AlgorithmMode // 'auto' (content-adaptive) or 'custom' (user-selected algorithms)
  enabledAlgorithms: Algorithm[] // Which algorithms are active when algorithmMode === 'custom'
  mlEnabled: boolean // When false, ML algorithm is excluded from all mode branches including Auto
  adaptivePhaseSkip: boolean // Skip phase FFT when MSD is decisive in MSD-led modes (default true)
  showAlgorithmScores: boolean // Show the algorithm status bar with live scoring metrics
  showPeqDetails: boolean // Show PEQ recommendation (type, Q, gain) on each issue card
  showFreqZones: boolean // Show frequency zone overlay (Sub/Voice/Presence/Air) on RTA
  showRoomModeLines: boolean // Show predicted axial room mode lines on RTA (below Schroeder, faint dashed)
  spectrumWarmMode: boolean // Use warm amber spectrum line instead of blue
  spectrumSmoothingMode: SpectrumSmoothingMode // Display-only spectrum view: raw or perceptual 1/3-octave smoothing
  // Peak timing
  sustainMs: number // Peak sustain before confirmation (100-2000, default 250)
  clearMs: number // Time before peak declared dead (100-2000, default 400)
  // Threshold control
  thresholdMode: ThresholdMode // 'absolute' | 'relative' | 'hybrid' (default 'hybrid')
  prominenceDb: number // Peak prominence required (4-30, default 12)
  // Noise floor timing
  noiseFloorAttackMs: number // Noise floor attack time (50-1000, default 200)
  noiseFloorReleaseMs: number // Noise floor release time (200-5000, default 1000)
  // Track management
  maxTracks: number // Max simultaneous tracks (8-128, default 64)
  trackTimeoutMs: number // Track inactivity timeout (200-5000, default 1000)
  ignoreWhistle: boolean // Suppress whistle classifications (default true)
  // Display / canvas
  rtaDbMin: number // RTA display range minimum (-120 to -60, default -100)
  rtaDbMax: number // RTA display range maximum (-20 to 0, default 0)
  spectrumLineWidth: number // RTA line width in pixels (0.5-4, default 1.5)
  showThresholdLine: boolean // Show effective threshold line on RTA graph
  canvasTargetFps: number // Target FPS for canvas rendering (15-60, default 30)
  faderMode: 'gain' | 'sensitivity' // DEPRECATED — kept for mobile toggle during dual-fader migration
  faderLinkMode: 'unlinked' | 'linked' | 'linked-reversed'
  faderLinkRatio: number
  faderLinkCenterGainDb: number
  faderLinkCenterSensDb: number
  swipeLabeling: boolean // Enable swipe-to-label on issue cards (left=false+, right=confirm). Hides buttons when on.
  signalTintEnabled: boolean // Enable signal-responsive background tint (severity → console color shift)
  // Gate multiplier overrides — expert-only, undefined = use hardcoded default
  formantGateOverride?: number    // 0.65 default
  chromaticGateOverride?: number  // 0.60 default
  combSweepOverride?: number      // 0.25 default
  ihrGateOverride?: number        // 0.65 default
  ptmrGateOverride?: number       // 0.80 default
  mainsHumGateOverride?: number   // 0.40 default
}

// Default analysis configuration - aligned with the canonical Speech-mode startup profile.
export const DEFAULT_CONFIG: AnalysisConfig = {
  fftSize: 8192,
  minHz: 150, // Body mic chest resonance lower bound
  maxHz: 10000, // Condenser sibilance feedback upper bound
  analysisIntervalMs: 20, // Faster analysis for quicker detection
  sustainMs: 300, // 300 ms — filters plosives/transients while catching real feedback (matches startup Speech defaults)
  clearMs: 400, // Slightly longer decay reduces display flicker
  thresholdMode: 'hybrid',
  thresholdDb: -80, // Safety floor only — relative threshold (noise floor + slider) controls detection
  relativeThresholdDb: 30, // Matches feedbackThresholdDb — headroom above noise floor
  prominenceDb: 8, // Lowered to catch quieter peaks with MSD confirmation
  neighborhoodBins: 8, // ±2 exclusion means effective 6 each side
  maxIssues: 12, // Show more issues for comprehensive tuning
  ignoreWhistle: true,
  preset: 'surgical',
  mode: 'speech', // Matches the startup Speech profile
  aWeightingEnabled: true, // A-weighting on — prioritizes speech intelligibility band (2–5 kHz)
  micCalibrationProfile: 'none' as const, // Mic frequency response compensation off by default
  noiseFloorEnabled: true,
  noiseFloorSampleCount: 160, // Faster noise floor sampling
  noiseFloorAttackMs: 200, // Faster attack for dynamic environments
  noiseFloorReleaseMs: 1000, // Faster release
  inputGainDb: 0, // Zero gain — modern interfaces deliver adequate signal (matches startup Speech defaults)
  autoGainEnabled: false, // Auto-gain off by default — user clicks venue pill to start calibration
}
