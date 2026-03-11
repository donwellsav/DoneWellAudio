// Calibration system types — in-app data collection for DSP tuning

import type { DetectorSettings, ContentType, AlgorithmMode } from './advisory'

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
  severity: string
  qEstimate: number
  bandwidthHz: number
  velocityDbPerSec: number
  harmonicityScore: number
  contentType: string
  algorithmMode: string
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
  contentType: string
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
