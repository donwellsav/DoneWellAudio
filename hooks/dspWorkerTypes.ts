'use client'

import type {
  Advisory,
  AlgorithmMode,
  ContentType,
  DetectedPeak,
  TrackedPeak,
} from '@/types/advisory'
import type { SnapshotBatch } from '@/types/data'
import type { RoomDimensionEstimate } from '@/types/calibration'
import type { CombPatternResult } from '@/lib/dsp/advancedDetection'
import type { WorkerRuntimeSettings } from '@/lib/settings/runtimeSettings'

export interface DSPWorkerCallbacks {
  onAdvisory?: (advisory: Advisory) => void
  onAdvisoryCleared?: (advisoryId: string) => void
  onTracksUpdate?: (
    tracks: TrackedPeak[],
    status?: {
      contentType?: ContentType
      algorithmMode?: AlgorithmMode
      isCompressed?: boolean
      compressionRatio?: number
    },
  ) => void
  onEarlyWarningUpdate?: (pattern: CombPatternResult | null) => void
  onContentTypeUpdate?: (
    contentType: ContentType,
    isCompressed: boolean,
    compressionRatio: number,
  ) => void
  onReady?: () => void
  onError?: (message: string) => void
  onSnapshotBatch?: (batch: SnapshotBatch) => void
  onRoomEstimate?: (estimate: RoomDimensionEstimate) => void
  onRoomMeasurementProgress?: (elapsedMs: number, stablePeaks: number) => void
}

export interface DSPWorkerHandle {
  isReady: boolean
  isCrashed: boolean
  isPermanentlyDead: boolean
  getBackpressureStats: () => { dropped: number; total: number; ratio: number }
  init: (
    settings: WorkerRuntimeSettings,
    sampleRate: number,
    fftSize: number,
  ) => void
  updateSettings: (settings: Partial<WorkerRuntimeSettings>) => void
  processPeak: (
    peak: DetectedPeak,
    spectrum: Float32Array,
    sampleRate: number,
    fftSize: number,
    timeDomain?: Float32Array,
  ) => void
  sendSpectrumUpdate: (
    spectrum: Float32Array,
    crestFactor: number,
    sampleRate: number,
    fftSize: number,
  ) => void
  clearPeak: (binIndex: number, frequencyHz: number, timestamp: number) => void
  reset: () => void
  terminate: () => void
  enableCollection: (sessionId: string, fftSize: number, sampleRate: number) => void
  disableCollection: () => void
  sendUserFeedback: (
    frequencyHz: number,
    feedback: 'correct' | 'false_positive' | 'confirmed_feedback',
  ) => void
  startRoomMeasurement: () => void
  stopRoomMeasurement: () => void
}

export interface PendingPeakFrame {
  peak: DetectedPeak
  spectrum: Float32Array
  sampleRate: number
  fftSize: number
  timeDomain?: Float32Array
}

export interface PendingCollectionRequest {
  sessionId: string
  fftSize: number
  sampleRate: number
}

export interface WorkerInitSnapshot {
  settings: WorkerRuntimeSettings
  sampleRate: number
  fftSize: number
}
