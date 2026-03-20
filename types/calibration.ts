// Calibration system types — in-app data collection for DSP tuning

import type { DetectorSettings, ContentType, AlgorithmMode, SeverityLevel } from './advisory'

// ── Room Profile ─────────────────────────────────────────────────────────────

export type FloorMaterial = 'carpet' | 'hardwood' | 'concrete' | 'tile' | 'vinyl'
export type WallMaterial = 'drywall' | 'concrete' | 'glass' | 'curtain' | 'wood_panel'
export type CeilingMaterial = 'acoustic_tile' | 'drywall' | 'concrete' | 'open'
export type MicType = 'lav' | 'handheld' | 'headset' | 'gooseneck' | 'shotgun' | 'boundary'
export type DimensionUnit = 'ft' | 'm'
export type FrequencyBand = 'LOW' | 'MID' | 'HIGH'

export interface RoomProfile {
  name: string
  dimensions: { length: number; width: number; height: number; unit: DimensionUnit }
  floor: FloorMaterial
  walls: WallMaterial
  ceiling: CeilingMaterial
  micTypes: MicType[]
  micCount: number
  signalPath: string
  notes: string
}

export const EMPTY_ROOM_PROFILE: RoomProfile = {
  name: '',
  dimensions: { length: 0, width: 0, height: 0, unit: 'ft' },
  floor: 'carpet',
  walls: 'drywall',
  ceiling: 'acoustic_tile',
  micTypes: [],
  micCount: 1,
  signalPath: '',
  notes: '',
}

// ── Room Dimension Estimation ────────────────────────────────────────────────

/**
 * A detected harmonic series mapping to one room dimension.
 * Axial modes along one axis produce evenly-spaced frequencies: f_n = n × c/(2L).
 * The fundamental spacing Δf = c/(2L) gives the dimension L = c/(2×Δf).
 */
export interface DetectedDimensionSeries {
  /** Fundamental spacing frequency (Hz) — the Δf between harmonics */
  fundamentalHz: number
  /** Estimated room dimension from this series (meters) */
  dimensionM: number
  /** Number of harmonics that matched this series */
  harmonicsMatched: number
  /** The actual peak frequencies belonging to this series */
  peakFrequencies: number[]
  /** Confidence for this individual series (0–1) */
  confidence: number
}

/**
 * Result of inverse eigenvalue estimation: detected resonance frequencies → room dimensions.
 * Uses axial mode decomposition — strongest room modes form harmonic series along each axis.
 *
 * @see Kuttruff, "Room Acoustics" 6th ed., §3.3 — eigenfrequencies of rectangular rooms
 */
export interface RoomDimensionEstimate {
  /** Estimated room dimensions in meters (sorted: length ≥ width ≥ height) */
  dimensions: { length: number; width: number; height: number }
  /** Overall confidence (0–1), based on series count, harmonic matches, and residual error */
  confidence: number
  /** Number of independent harmonic series found (1–3) */
  seriesFound: number
  /** Average Hz deviation between detected peaks and forward-predicted modes */
  residualError: number
  /** The individual harmonic series that were identified */
  detectedSeries: DetectedDimensionSeries[]
  /** Total stable peaks that were analyzed */
  totalPeaksAnalyzed: number
}

// ── Ambient Capture ──────────────────────────────────────────────────────────

export interface AmbientCapture {
  capturedAt: string // ISO timestamp
  avgNoiseFloorDb: number
  spectrum: number[] // downsampled FFT bins (1024)
  sampleRate: number
  fftSize: number
  durationSeconds: number
  micCalibrationApplied?: boolean // Was ECM8000 compensation active during capture?
}

// ── Session Events ───────────────────────────────────────────────────────────

export interface CalibrationDetection {
  timestamp: string
  advisoryId: string
  frequencyHz: number
  amplitudeDb: number
  confidence: number
  severity: SeverityLevel
  qEstimate: number
  bandwidthHz: number
  velocityDbPerSec: number
  harmonicityScore: number
  contentType: ContentType
  algorithmMode: AlgorithmMode
  noiseFloorAtTime: number
  effectiveThresholdAtTime: number
  annotation: 'true_positive' | 'false_positive'
  micCalibrationApplied?: boolean // Was ECM8000 compensation active at detection time?
  spectrumSnapshot: number[] | null // downsampled FFT at detection time
}

export interface MissedDetection {
  timestamp: string
  frequencyBand: FrequencyBand | null
}

export interface SettingsChangeEntry {
  timestamp: string
  changes: Partial<DetectorSettings>
}

export interface NoiseFloorSample {
  timestamp: string
  noiseFloorDb: number
  peakDb: number
  contentType: ContentType
}

export interface SpectrumSnapshot {
  timestamp: string
  spectrum: number[] // downsampled 1024 bins
  noiseFloorDb: number
  peakDb: number
  trigger: 'periodic' | 'detection' | 'ambient_capture'
  micCalibrationApplied?: boolean // Was ECM8000 compensation active at snapshot time?
}

export interface ContentTypeTransition {
  timestamp: string
  from: ContentType | string
  to: ContentType | string
}

// ── Mic Calibration Metadata ─────────────────────────────────────────────────

export interface MicCalibrationMetadata {
  applied: boolean // Was compensation active at any point during the session?
  micModel: string // "Behringer ECM8000"
  calibrationId: string // "CSL 746"
  calibrationCurve: readonly [number, number][] // [freqHz, responseDd][] — raw curve data
  compensationNote: string // How to reverse the compensation
}

// ── Export Format ─────────────────────────────────────────────────────────────

export interface CalibrationSummary {
  totalDetections: number
  falsePositives: number
  missedCount: number
  precision: number | null // null if no annotations
  noiseFloorRange: { min: number; max: number }
  topFrequencies: { hz: number; count: number }[]
}

export interface CalibrationExport {
  version: string // "1.0"
  appVersion: string
  exportedAt: string
  room: RoomProfile
  ambient: AmbientCapture | null
  session: {
    startTime: string
    endTime: string
    durationSeconds: number
    initialPreset: string
    initialSettings: DetectorSettings
    finalSettings: DetectorSettings
  }
  settingsHistory: SettingsChangeEntry[]
  noiseFloorLog: NoiseFloorSample[]
  spectrumSnapshots: SpectrumSnapshot[]
  detections: CalibrationDetection[]
  missedDetections: MissedDetection[]
  contentTypeTransitions: ContentTypeTransition[]
  summary: CalibrationSummary
  micCalibration?: MicCalibrationMetadata // Present when mic compensation was used during session
}

// ── Session Stats (live UI display) ──────────────────────────────────────────

export interface CalibrationStats {
  elapsedMs: number
  detectionCount: number
  falsePositiveCount: number
  missedCount: number
  snapshotCount: number
}
