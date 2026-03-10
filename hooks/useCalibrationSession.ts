'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { CalibrationSession, downloadCalibrationExport } from '@/lib/calibration'
import type { Advisory, SpectrumData, DetectorSettings } from '@/types/advisory'
import type {
  RoomProfile,
  AmbientCapture,
  CalibrationStats,
  FrequencyBand,
} from '@/types/calibration'
import { EMPTY_ROOM_PROFILE } from '@/types/calibration'
import { downsampleSpectrum } from '@/lib/calibration'

const STORAGE_KEY = 'ktr-calibration-room'
const SAMPLE_INTERVAL_MS = 60_000 // 60 seconds

function loadRoom(): RoomProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...EMPTY_ROOM_PROFILE, ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return { ...EMPTY_ROOM_PROFILE }
}

function saveRoom(room: RoomProfile): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(room))
  } catch { /* quota */ }
}

export interface UseCalibrationSessionReturn {
  // State
  calibrationEnabled: boolean
  setCalibrationEnabled: (enabled: boolean) => void
  isRecording: boolean
  room: RoomProfile
  updateRoom: (partial: Partial<RoomProfile>) => void
  clearRoom: () => void
  ambientCapture: AmbientCapture | null
  stats: CalibrationStats
  falsePositiveIds: ReadonlySet<string>

  // Actions
  captureAmbient: (spectrumRef: React.RefObject<SpectrumData | null>) => void
  isCapturingAmbient: boolean
  onDetection: (advisory: Advisory, spectrum: SpectrumData | null) => void
  onFalsePositive: (advisoryId: string) => void
  onMissed: (band: FrequencyBand | null) => void
  onSettingsChange: (changes: Partial<DetectorSettings>) => void
  exportSession: (settings: DetectorSettings, appVersion: string) => void
}

export function useCalibrationSession(
  spectrumRef: React.RefObject<SpectrumData | null>,
  isAnalysisRunning: boolean,
): UseCalibrationSessionReturn {
  const [calibrationEnabled, setCalibrationEnabled] = useState(false)
  const [room, setRoom] = useState<RoomProfile>(loadRoom)
  const [ambientCapture, setAmbientCapture] = useState<AmbientCapture | null>(null)
  const [isCapturingAmbient, setIsCapturingAmbient] = useState(false)
  const [stats, setStats] = useState<CalibrationStats>({
    elapsedMs: 0, detectionCount: 0, falsePositiveCount: 0, missedCount: 0, snapshotCount: 0,
  })
  const [falsePositiveIds, setFalsePositiveIds] = useState<ReadonlySet<string>>(new Set())

  const sessionRef = useRef<CalibrationSession | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const settingsSnapshotRef = useRef<DetectorSettings | null>(null)

  const isRecording = calibrationEnabled && isAnalysisRunning && sessionRef.current !== null

  // Start/stop session lifecycle
  useEffect(() => {
    if (calibrationEnabled && isAnalysisRunning) {
      // Start a new session if none exists
      if (!sessionRef.current && settingsSnapshotRef.current) {
        sessionRef.current = new CalibrationSession(settingsSnapshotRef.current)
        setFalsePositiveIds(new Set())
      }
    }
    // Don't auto-clear session on stop — preserve data for export
  }, [calibrationEnabled, isAnalysisRunning])

  // Periodic sampling (noise floor + spectrum snapshot every 60s)
  useEffect(() => {
    if (!isRecording) {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
      return
    }
    intervalRef.current = setInterval(() => {
      const session = sessionRef.current
      const spectrum = spectrumRef.current
      if (!session || !spectrum) return

      session.logNoiseFloor(
        spectrum.noiseFloorDb ?? -80,
        spectrum.peak,
        spectrum.contentType ?? 'unknown',
      )
      session.logSpectrumSnapshot(spectrum, 'periodic')
      setStats(session.getStats())
    }, SAMPLE_INTERVAL_MS)

    return () => { if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null } }
  }, [isRecording, spectrumRef])

  // Stats update timer (every 2 seconds for elapsed time display)
  useEffect(() => {
    if (!isRecording) return
    const timer = setInterval(() => {
      const session = sessionRef.current
      if (session) setStats(session.getStats())
    }, 2000)
    return () => clearInterval(timer)
  }, [isRecording])

  // Track content type transitions
  const lastContentTypeRef = useRef<string>('unknown')
  useEffect(() => {
    if (!isRecording) return
    const spectrum = spectrumRef.current
    const ct = spectrum?.contentType ?? 'unknown'
    if (ct !== lastContentTypeRef.current) {
      sessionRef.current?.logContentTypeChange(lastContentTypeRef.current, ct)
      lastContentTypeRef.current = ct
    }
  })

  const updateRoom = useCallback((partial: Partial<RoomProfile>) => {
    setRoom(prev => {
      // Handle nested dimensions
      const next = partial.dimensions
        ? { ...prev, ...partial, dimensions: { ...prev.dimensions, ...partial.dimensions } }
        : { ...prev, ...partial }
      saveRoom(next)
      return next
    })
  }, [])

  const clearRoom = useCallback(() => {
    setRoom({ ...EMPTY_ROOM_PROFILE })
    saveRoom(EMPTY_ROOM_PROFILE)
  }, [])

  const captureAmbient = useCallback((specRef: React.RefObject<SpectrumData | null>) => {
    if (isCapturingAmbient) return
    setIsCapturingAmbient(true)

    const frames: Float32Array[] = []
    const duration = 5_000 // 5 seconds
    const interval = 100 // sample every 100ms
    let elapsed = 0

    const timer = setInterval(() => {
      const spectrum = specRef.current
      if (spectrum?.freqDb) {
        frames.push(new Float32Array(spectrum.freqDb))
      }
      elapsed += interval
      if (elapsed >= duration) {
        clearInterval(timer)

        if (frames.length === 0) {
          setIsCapturingAmbient(false)
          return
        }

        // Average all frames
        const len = frames[0].length
        const avg = new Float32Array(len)
        for (let i = 0; i < len; i++) {
          let sum = 0
          for (const frame of frames) sum += frame[i]
          avg[i] = sum / frames.length
        }

        const avgDb = avg.reduce((sum, v) => sum + v, 0) / avg.length
        const firstSpectrum = specRef.current

        setAmbientCapture({
          capturedAt: new Date().toISOString(),
          avgNoiseFloorDb: Math.round(avgDb * 10) / 10,
          spectrum: downsampleSpectrum(avg),
          sampleRate: firstSpectrum?.sampleRate ?? 48000,
          fftSize: firstSpectrum?.fftSize ?? 8192,
          durationSeconds: duration / 1000,
        })

        // Also log as a spectrum snapshot if session active
        if (sessionRef.current && firstSpectrum) {
          sessionRef.current.logSpectrumSnapshot(firstSpectrum, 'ambient_capture')
        }

        setIsCapturingAmbient(false)
      }
    }, interval)
  }, [isCapturingAmbient])

  const onDetection = useCallback((advisory: Advisory, spectrum: SpectrumData | null) => {
    const session = sessionRef.current
    if (!session) return
    session.logDetection(advisory, spectrum)
    // Also capture spectrum snapshot on detection
    if (spectrum) session.logSpectrumSnapshot(spectrum, 'detection')
    setStats(session.getStats())
  }, [])

  const onFalsePositive = useCallback((advisoryId: string) => {
    const session = sessionRef.current
    if (!session) return
    // Toggle behavior
    if (session.falsePositiveIds.has(advisoryId)) {
      session.unflagFalsePositive(advisoryId)
    } else {
      session.logFalsePositive(advisoryId)
    }
    setFalsePositiveIds(new Set(session.falsePositiveIds))
    setStats(session.getStats())
  }, [])

  const onMissed = useCallback((band: FrequencyBand | null) => {
    const session = sessionRef.current
    if (!session) return
    session.logMissed(band)
    setStats(session.getStats())
  }, [])

  const onSettingsChangeCalib = useCallback((changes: Partial<DetectorSettings>) => {
    sessionRef.current?.logSettingsChange(changes)
    // Keep snapshot ref updated for session creation
    if (settingsSnapshotRef.current) {
      settingsSnapshotRef.current = { ...settingsSnapshotRef.current, ...changes }
    }
  }, [])

  const exportSession = useCallback((settings: DetectorSettings, appVersion: string) => {
    const session = sessionRef.current
    if (!session) return
    const data = session.buildExport(room, ambientCapture, settings, appVersion)
    downloadCalibrationExport(data)
  }, [room, ambientCapture])

  // Initialize settings snapshot when calibration is enabled
  const setCalibrationEnabledWithSnapshot = useCallback((enabled: boolean) => {
    setCalibrationEnabled(enabled)
    if (!enabled) {
      // Keep session data alive for export even after disabling
    }
  }, [])

  // Expose a way to set the initial settings snapshot
  const updateSettingsSnapshot = useCallback((settings: DetectorSettings) => {
    settingsSnapshotRef.current = settings
    // Auto-create session if analysis is running and calibration just enabled
    if (calibrationEnabled && isAnalysisRunning && !sessionRef.current) {
      sessionRef.current = new CalibrationSession(settings)
      setFalsePositiveIds(new Set())
    }
  }, [calibrationEnabled, isAnalysisRunning])

  // Expose updateSettingsSnapshot via a ref so KillTheRing can call it
  // Actually, simpler: just keep settingsSnapshotRef always updated
  // We'll handle this in the integration

  return {
    calibrationEnabled,
    setCalibrationEnabled: setCalibrationEnabledWithSnapshot,
    isRecording,
    room,
    updateRoom,
    clearRoom,
    ambientCapture,
    stats,
    falsePositiveIds,
    captureAmbient,
    isCapturingAmbient,
    onDetection,
    onFalsePositive,
    onMissed,
    onSettingsChange: onSettingsChangeCalib,
    exportSession,
  }
}
