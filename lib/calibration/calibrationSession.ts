// CalibrationSession — in-memory data collection for a single calibration session

import type { Advisory, SpectrumData, DetectorSettings } from '@/types/advisory'
import type {
  CalibrationDetection,
  MissedDetection,
  SettingsChangeEntry,
  NoiseFloorSample,
  SpectrumSnapshot,
  ContentTypeTransition,
  CalibrationExport,
  CalibrationSummary,
  RoomProfile,
  AmbientCapture,
  FrequencyBand,
  CalibrationStats,
} from '@/types/calibration'

const TARGET_BINS = 1024
const MAX_DETECTIONS = 500
const MAX_SNAPSHOTS = 300
const MAX_NOISE_SAMPLES = 500
const MAX_SETTINGS_CHANGES = 200
const MAX_MISSED = 100
const MAX_CONTENT_TRANSITIONS = 200

/** Downsample Float32Array to targetBins using peak-hold (max per group) */
export function downsampleSpectrum(freqDb: Float32Array, targetBins: number = TARGET_BINS): number[] {
  const sourceLen = freqDb.length
  if (sourceLen <= targetBins) {
    return Array.from(freqDb).map(v => Math.round(v * 10) / 10) // 0.1 dB precision
  }
  const groupSize = sourceLen / targetBins
  const result: number[] = new Array(targetBins)
  for (let i = 0; i < targetBins; i++) {
    const start = Math.floor(i * groupSize)
    const end = Math.floor((i + 1) * groupSize)
    let max = -Infinity
    for (let j = start; j < end; j++) {
      if (freqDb[j] > max) max = freqDb[j]
    }
    result[i] = Math.round(max * 10) / 10
  }
  return result
}

function now(): string {
  return new Date().toISOString()
}

export class CalibrationSession {
  private _startTime: number
  private _initialSettings: DetectorSettings
  private _initialPreset: string
  private _detections: CalibrationDetection[] = []
  private _missedDetections: MissedDetection[] = []
  private _settingsHistory: SettingsChangeEntry[] = []
  private _noiseFloorLog: NoiseFloorSample[] = []
  private _spectrumSnapshots: SpectrumSnapshot[] = []
  private _contentTypeTransitions: ContentTypeTransition[] = []
  private _falsePositiveIds: Set<string> = new Set()
  private _lastContentType: string = 'unknown'

  constructor(settings: DetectorSettings) {
    this._startTime = Date.now()
    this._initialSettings = { ...settings }
    this._initialPreset = settings.mode
  }

  get startTime(): number { return this._startTime }
  get falsePositiveIds(): ReadonlySet<string> { return this._falsePositiveIds }

  getStats(): CalibrationStats {
    return {
      elapsedMs: Date.now() - this._startTime,
      detectionCount: this._detections.length,
      falsePositiveCount: this._falsePositiveIds.size,
      missedCount: this._missedDetections.length,
      snapshotCount: this._spectrumSnapshots.length,
    }
  }

  logDetection(advisory: Advisory, spectrum: SpectrumData | null): void {
    if (this._detections.length >= MAX_DETECTIONS) return
    const snapshot = spectrum?.freqDb ? downsampleSpectrum(spectrum.freqDb) : null
    this._detections.push({
      timestamp: now(),
      advisoryId: advisory.id,
      frequencyHz: advisory.trueFrequencyHz,
      amplitudeDb: advisory.trueAmplitudeDb,
      confidence: advisory.confidence,
      severity: advisory.severity,
      qEstimate: advisory.qEstimate,
      bandwidthHz: advisory.bandwidthHz,
      velocityDbPerSec: advisory.velocityDbPerSec,
      harmonicityScore: advisory.harmonicityScore,
      contentType: spectrum?.contentType ?? 'unknown',
      algorithmMode: spectrum?.algorithmMode ?? 'auto',
      noiseFloorAtTime: spectrum?.noiseFloorDb ?? -80,
      effectiveThresholdAtTime: spectrum?.effectiveThresholdDb ?? -50,
      annotation: 'true_positive',
      spectrumSnapshot: snapshot,
    })
  }

  logFalsePositive(advisoryId: string): void {
    this._falsePositiveIds.add(advisoryId)
    const det = this._detections.find(d => d.advisoryId === advisoryId)
    if (det) det.annotation = 'false_positive'
  }

  unflagFalsePositive(advisoryId: string): void {
    this._falsePositiveIds.delete(advisoryId)
    const det = this._detections.find(d => d.advisoryId === advisoryId)
    if (det) det.annotation = 'true_positive'
  }

  logMissed(band: FrequencyBand | null): void {
    if (this._missedDetections.length >= MAX_MISSED) return
    this._missedDetections.push({ timestamp: now(), frequencyBand: band })
  }

  logSettingsChange(changes: Partial<DetectorSettings>): void {
    if (this._settingsHistory.length >= MAX_SETTINGS_CHANGES) return
    this._settingsHistory.push({ timestamp: now(), changes })
  }

  logNoiseFloor(noiseFloorDb: number, peakDb: number, contentType: string): void {
    if (this._noiseFloorLog.length >= MAX_NOISE_SAMPLES) return
    this._noiseFloorLog.push({ timestamp: now(), noiseFloorDb, peakDb, contentType })
  }

  logSpectrumSnapshot(spectrum: SpectrumData, trigger: SpectrumSnapshot['trigger']): void {
    if (this._spectrumSnapshots.length >= MAX_SNAPSHOTS) return
    this._spectrumSnapshots.push({
      timestamp: now(),
      spectrum: downsampleSpectrum(spectrum.freqDb),
      noiseFloorDb: spectrum.noiseFloorDb ?? -80,
      peakDb: spectrum.peak,
      trigger,
    })
  }

  logContentTypeChange(from: string, to: string): void {
    if (this._contentTypeTransitions.length >= MAX_CONTENT_TRANSITIONS) return
    this._contentTypeTransitions.push({ timestamp: now(), from, to })
    this._lastContentType = to
  }

  get lastContentType(): string { return this._lastContentType }

  buildExport(
    room: RoomProfile,
    ambient: AmbientCapture | null,
    finalSettings: DetectorSettings,
    appVersion: string,
  ): CalibrationExport {
    const endTime = Date.now()
    const summary = this._buildSummary()

    return {
      version: '1.0',
      appVersion,
      exportedAt: now(),
      room,
      ambient,
      session: {
        startTime: new Date(this._startTime).toISOString(),
        endTime: new Date(endTime).toISOString(),
        durationSeconds: Math.round((endTime - this._startTime) / 1000),
        initialPreset: this._initialPreset,
        initialSettings: this._initialSettings,
        finalSettings: { ...finalSettings },
      },
      settingsHistory: this._settingsHistory,
      noiseFloorLog: this._noiseFloorLog,
      spectrumSnapshots: this._spectrumSnapshots,
      detections: this._detections,
      missedDetections: this._missedDetections,
      contentTypeTransitions: this._contentTypeTransitions,
      summary,
    }
  }

  private _buildSummary(): CalibrationSummary {
    const falsePositives = this._falsePositiveIds.size
    const totalDetections = this._detections.length
    const annotated = totalDetections > 0
    const truePositives = totalDetections - falsePositives

    // Noise floor range
    const nfValues = this._noiseFloorLog.map(s => s.noiseFloorDb)
    const nfMin = nfValues.length > 0 ? Math.min(...nfValues) : -80
    const nfMax = nfValues.length > 0 ? Math.max(...nfValues) : -80

    // Top frequencies by occurrence count
    const freqCounts = new Map<number, number>()
    for (const d of this._detections) {
      // Round to nearest 10 Hz for grouping
      const rounded = Math.round(d.frequencyHz / 10) * 10
      freqCounts.set(rounded, (freqCounts.get(rounded) ?? 0) + 1)
    }
    const topFrequencies = [...freqCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([hz, count]) => ({ hz, count }))

    return {
      totalDetections,
      falsePositives,
      missedCount: this._missedDetections.length,
      precision: annotated && totalDetections > 0
        ? Math.round((truePositives / totalDetections) * 1000) / 1000
        : null,
      noiseFloorRange: { min: nfMin, max: nfMax },
      topFrequencies,
    }
  }
}
