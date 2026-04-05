'use client'

import { memo } from 'react'
import type { RefObject } from 'react'
import type { DetectorSettings, MicCalibrationProfile, SpectrumData } from '@/types/advisory'
import type {
  AmbientCapture,
  CalibrationStats,
  RoomProfile,
} from '@/types/calibration'
import { useCalibrationTabState } from '@/hooks/useCalibrationTabState'
import { CalibrationAmbientSection } from './calibration/CalibrationAmbientSection'
import { CalibrationRoomProfileSection } from './calibration/CalibrationRoomProfileSection'
import { CalibrationSessionSection } from './calibration/CalibrationSessionSection'

export interface CalibrationTabProps {
  settings: DetectorSettings
  setMicProfile: (profile: MicCalibrationProfile) => void
  room: RoomProfile
  updateRoom: (partial: Partial<RoomProfile>) => void
  clearRoom: () => void
  calibrationEnabled: boolean
  setCalibrationEnabled: (enabled: boolean) => void
  isRecording: boolean
  ambientCapture: AmbientCapture | null
  captureAmbient: (spectrumRef: RefObject<SpectrumData | null>) => void
  isCapturingAmbient: boolean
  spectrumRef: RefObject<SpectrumData | null>
  stats: CalibrationStats
  onExport: () => void
}

export const CalibrationTab = memo(function CalibrationTab({
  settings,
  setMicProfile,
  room,
  updateRoom,
  clearRoom,
  calibrationEnabled,
  setCalibrationEnabled,
  isRecording,
  ambientCapture,
  captureAmbient,
  isCapturingAmbient,
  spectrumRef,
  stats,
  onExport,
}: CalibrationTabProps) {
  const {
    handleMicToggle,
    handleDimension,
    handleUnit,
    handleCaptureAmbient,
    elapsed,
  } = useCalibrationTabState({
    room,
    updateRoom,
    captureAmbient,
    spectrumRef,
    elapsedMs: stats.elapsedMs,
  })

  return (
    <div className="space-y-5 py-2">
      <CalibrationRoomProfileSection
        room={room}
        updateRoom={updateRoom}
        clearRoom={clearRoom}
        handleMicToggle={handleMicToggle}
        handleDimension={handleDimension}
        handleUnit={handleUnit}
      />

      <CalibrationAmbientSection
        settings={settings}
        setMicProfile={setMicProfile}
        ambientCapture={ambientCapture}
        isCapturingAmbient={isCapturingAmbient}
        handleCaptureAmbient={handleCaptureAmbient}
      />

      <CalibrationSessionSection
        calibrationEnabled={calibrationEnabled}
        setCalibrationEnabled={setCalibrationEnabled}
        isRecording={isRecording}
        stats={stats}
        elapsed={elapsed}
        micCalibrationProfile={settings.micCalibrationProfile}
        onExport={onExport}
      />
    </div>
  )
})
