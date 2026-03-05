// KillTheRing2 Types - Full type definitions for the feedback detection system

// Re-export algorithm types defined in advancedDetection.ts so consumers
// can import everything from '@/types/advisory'
export type { AlgorithmScores, FusedDetectionResult, InterHarmonicResult, PTMRResult } from '@/lib/dsp/advancedDetection'
export type AlgorithmMode = 'auto' | 'msd' | 'phase' | 'combined' | 'all'
export type ContentType = 'speech' | 'music' | 'compressed' | 'unknown'

export type ThresholdMode = 'absolute' | 'relative' | 'hybrid'
// Professional live sound operation modes — each configures detection for a specific scenario
export type OperationMode = 'speech' | 'worship' | 'liveMusic' | 'theater' | 'monitors' | 'ringOut' | 'broadcast' | 'outdoor'
export type Preset = 'surgical' | 'heavy'
export type SeverityLevel = 'RUNAWAY' | 'GROWING' | 'RESONANCE' | 'POSSIBLE_RING' | 'WHISTLE' | 'INSTRUMENT'
export type Severity = 'runaway' | 'growing' | 'resonance' | 'ring' | 'whistle' | 'instrument' | 'unknown'
export type IssueLabel = 'ACOUSTIC_FEEDBACK' | 'WHISTLE' | 'INSTRUMENT' | 'POSSIBLE_RING'
export type PEQType = 'bell' | 'notch' | 'highShelf' | 'lowShelf' | 'HPF' | 'LPF'
export type ShelfType = 'highShelf' | 'lowShelf' | 'HPF' | 'LPF'

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
}

export interface ClassificationResult {
  pFeedback: number
  pWhistle: number
  pInstrument: number
  pUnknown: number
  label: IssueLabel
  severity: SeverityLevel
  confidence: number
  reasons: string[]
  // Enhanced fields from acoustic analysis
  modalOverlapFactor?: number // M = 1/Q (isolated < 0.03, coupled < 0.1, diffuse > 0.33)
  cumulativeGrowthDb?: number // Total dB growth since onset
  frequencyBand?: 'LOW' | 'MID' | 'HIGH' // Which frequency band this falls into
  confidenceLabel?: 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH' // Human-readable confidence
  prominenceDb?: number // Carried through for downstream filtering
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
}

export interface ShelfRecommendation {
  type: ShelfType
  hz: number
  gainDb: number
  reason: string
}

export interface EQAdvisory {
  geq: GEQRecommendation
  peq: PEQRecommendation
  shelves: ShelfRecommendation[]
  pitch: PitchInfo
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

// TrackedPeak - represents a tracked frequency peak
export interface TrackedPeak {
  id: string
  frequency: number
  amplitude: number
  prominenceDb: number
  qEstimate: number
  bandwidthHz: number
  classification: Severity
  severity: Severity
  onsetTime: number
  lastUpdateTime: number
  active: boolean
  history: Array<{
    time: number
    frequency: number
    amplitude: number
  }>
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
  holdTimeMs: number
  noiseFloorDecay: number
  peakMergeCents: number
  maxDisplayedIssues: number
  eqPreset: 'surgical' | 'heavy'
  musicAware: boolean
  autoMusicAware: boolean // Auto-switch to music-aware mode based on signal level
  autoMusicAwareHysteresisDb: number // dB above noise floor to trigger music-aware mode
  inputGainDb: number // Software gain applied to analysis (-40 to +40 dB)
  autoGainEnabled: boolean // Auto-adjust inputGainDb based on signal level
  graphFontSize: number // Font size for canvas graph labels (8-26px, default 15px)
  harmonicToleranceCents: number // Cents window for harmonic/sub-harmonic matching (25–100, default 50)
  showTooltips: boolean // Show/hide all help tooltips throughout the UI
  aWeightingEnabled: boolean // Apply A-weighting curve to analysis (per IEC 61672-1)
  // Confidence and filtering
  confidenceThreshold: number // Minimum confidence to display (0.0-1.0, default 0.40)
  // Room acoustics for Schroeder frequency calculation
  roomRT60: number // Reverberation time in seconds (0.3-3.0, default 0.7)
  roomVolume: number // Room volume in m³ (50-5000, default 250)
  roomPreset: 'small' | 'medium' | 'large' | 'arena' | 'worship' | 'custom' // Quick room size preset
  // Phase 1: Harmonic Series Filter (reduces bass guitar/instrument false positives)
  harmonicFilterEnabled: boolean // Enable harmonic series detection to filter instruments
  // Phase 4: Room Mode Calculator (identifies room resonances vs feedback)
  roomModesEnabled: boolean // Enable room mode calculation and display
  roomLengthM: number // Room length in meters (for mode calculation)
  roomWidthM: number // Room width in meters
  roomHeightM: number // Room height in meters
  roomDimensionsUnit: 'meters' | 'feet' // Unit for dimension input
  // Algorithm mode and scoring display
  algorithmMode: AlgorithmMode // Which detection algorithm to use (auto, msd, phase, combined, all)
  showAlgorithmScores: boolean // Show the algorithm status bar with live scoring metrics
  // Peak timing
  sustainMs: number // Peak sustain before confirmation (100-2000, default 250)
  clearMs: number // Time before peak declared dead (100-2000, default 400)
  // Threshold control
  thresholdMode: ThresholdMode // 'absolute' | 'relative' | 'hybrid' (default 'hybrid')
  relativeThresholdDb: number // Relative threshold above noise (6-30, default 18)
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
}

// Default configuration - optimized for Corporate/Conference PA (Speech mode)
export const DEFAULT_CONFIG: AnalysisConfig = {
  fftSize: 8192,
  minHz: 150, // Body mic chest resonance lower bound
  maxHz: 10000, // Condenser sibilance feedback upper bound
  analysisIntervalMs: 20, // Faster analysis for quicker detection
  sustainMs: 350, // Filters speech plosives while catching sustained feedback
  clearMs: 400, // Slightly longer decay reduces display flicker
  thresholdMode: 'hybrid',
  thresholdDb: -40, // More sensitive absolute threshold
  relativeThresholdDb: 18, // Headroom above noise floor in quiet rooms
  prominenceDb: 10, // Requires real peak standing out from neighbors
  neighborhoodBins: 8, // ±2 exclusion means effective 6 each side
  maxIssues: 12, // Show more issues for comprehensive tuning
  ignoreWhistle: true,
  preset: 'surgical',
  mode: 'speech', // Matches DEFAULT_SETTINGS.mode for consistency
  aWeightingEnabled: false,
  noiseFloorEnabled: true,
  noiseFloorSampleCount: 160, // Faster noise floor sampling
  noiseFloorAttackMs: 200, // Faster attack for dynamic environments
  noiseFloorReleaseMs: 1000, // Faster release
  inputGainDb: 15, // Default gain for speech systems (adjustable -40 to +40 dB) — matches DEFAULT_SETTINGS
  autoGainEnabled: true, // Auto-gain on by default
}
