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
import { roomStorage } from '@/lib/storage/dwaStorage'

const SAMPLE_INTERVAL_MS = 60_000 // 60 seconds
const CONTENT_TYPE_POLL_MS = 250
const INITIAL_STATS: CalibrationStats = {
  elapsedMs: 0,
  detectionCount: 0,
  falsePositiveCount: 0,
  missedCount: 0,
  snapshotCount: 0,
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
  settings: DetectorSettings,
): UseCalibrationSessionReturn {
  const [calibrationEnabled, setCalibrationEnabled] = useState(false)
  const [room, setRoom] = useState<RoomProfile>(() => ({ ...EMPTY_ROOM_PROFILE, ...roomStorage.load() }))
  const [ambientCapture, setAmbientCapture] = useState<AmbientCapture | null>(null)
  const [isCapturingAmbient, setIsCapturingAmbient] = useState(false)
  const [stats, setStats] = useState<CalibrationStats>(INITIAL_STATS)
  const [falsePositiveIds, setFalsePositiveIds] = useState<ReadonlySet<string>>(new Set())
  const [sessionActive, setSessionActive] = useState(false)

  const sessionRef = useRef<CalibrationSession | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const ambientCaptureTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const settingsSnapshotRef = useRef<DetectorSettings | null>(null)
  const mountedRef = useRef(true)

  // Keep settings snapshot in sync so session creation guard works
  useEffect(() => { settingsSnapshotRef.current = settings }, [settings])

  const isRecording = calibrationEnabled && isAnalysisRunning && sessionActive

  // Start/stop session lifecycle
  useEffect(() => {
    if (calibrationEnabled && isAnalysisRunning) {
      // Start a new session if none exists
      if (!sessionRef.current && settingsSnapshotRef.current) {
        sessionRef.current = new CalibrationSession(settingsSnapshotRef.current)
        lastContentTypeRef.current = 'unknown'
        setFalsePositiveIds(new Set())
        setStats(INITIAL_STATS)
      }
      setSessionActive(true)
      return
    }

    setSessionActive(false)

    // Turning calibration off starts a fresh session next time.
    if (!calibrationEnabled) {
      if (ambientCaptureTimerRef.current) {
        clearInterval(ambientCaptureTimerRef.current)
        ambientCaptureTimerRef.current = null
      }
      sessionRef.current = null
      lastContentTypeRef.current = 'unknown'
      setIsCapturingAmbient(false)
      setFalsePositiveIds(new Set())
      setStats(INITIAL_STATS)
    }
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
    const pollContentType = () => {
      const spectrum = spectrumRef.current
      const ct = spectrum?.contentType ?? 'unknown'
      if (ct !== lastContentTypeRef.current) {
        sessionRef.current?.logContentTypeChange(lastContentTypeRef.current, ct)
        lastContentTypeRef.current = ct
      }
    }

    pollContentType()
    const timer = setInterval(pollContentType, CONTENT_TYPE_POLL_MS)
    return () => clearInterval(timer)
  }, [isRecording, spectrumRef])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      if (ambientCaptureTimerRef.current) {
        clearInterval(ambientCaptureTimerRef.current)
        ambientCaptureTimerRef.current = null
      }
    }
  }, [])

  const updateRoom = useCallback((partial: Partial<RoomProfile>) => {
    setRoom(prev => {
      // Handle nested dimensions
      const next = partial.dimensions
        ? { ...prev, ...partial, dimensions: { ...prev.dimensions, ...partial.dimensions } }
        : { ...prev, ...partial }
      roomStorage.save(next)
      return next
    })
  }, [])

  const clearRoom = useCallback(() => {
    setRoom({ ...EMPTY_ROOM_PROFILE })
    roomStorage.save(EMPTY_ROOM_PROFILE)
  }, [])

  const captureAmbient = useCallback((specRef: React.RefObject<SpectrumData | null>) => {
    if (isCapturingAmbient || ambientCaptureTimerRef.current) return
    setIsCapturingAmbient(true)

    const frames: Float32Array[] = []
    const duration = 5_000 // 5 seconds
    const interval = 100 // sample every 100ms
    let elapsed = 0

    ambientCaptureTimerRef.current = setInterval(() => {
      const spectrum = specRef.current
      if (spectrum?.freqDb) {
        frames.push(new Float32Array(spectrum.freqDb))
      }
      elapsed += interval
      if (elapsed >= duration) {
        if (ambientCaptureTimerRef.current) {
          clearInterval(ambientCaptureTimerRef.current)
          ambientCaptureTimerRef.current = null
        }

        if (frames.length === 0) {
          if (mountedRef.current) setIsCapturingAmbient(false)
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

        if (mountedRef.current) {
          setAmbientCapture({
            capturedAt: new Date().toISOString(),
            avgNoiseFloorDb: Math.round(avgDb * 10) / 10,
            spectrum: downsampleSpectrum(avg),
            sampleRate: firstSpectrum?.sampleRate ?? 48000,
            fftSize: firstSpectrum?.fftSize ?? 8192,
            durationSeconds: duration / 1000,
            micCalibrationApplied: (settingsSnapshotRef.current?.micCalibrationProfile ?? 'none') !== 'none',
          })
        }

        // Also log as a spectrum snapshot if session active
        if (sessionRef.current && firstSpectrum) {
          sessionRef.current.logSpectrumSnapshot(firstSpectrum, 'ambient_capture')
        }

        if (mountedRef.current) setIsCapturingAmbient(false)
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

  return {
    calibrationEnabled,
    setCalibrationEnabled,
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
