'use client'

import { useCallback, useMemo } from 'react'
import type { DataCollectionHandle } from '@/hooks/useDataCollection'
import { useAdvisoryFeedback } from '@/hooks/useAdvisoryFeedback'
import { useAnalyzerSessionEffects } from '@/hooks/useAnalyzerSessionEffects'
import { useAnalyzerShellState } from '@/hooks/useAnalyzerShellState'
import { useCalibrationSession } from '@/hooks/useCalibrationSession'
import { useFpsMonitor } from '@/hooks/useFpsMonitor'
import { useRingOutFlow } from '@/hooks/useRingOutFlow'
import { useDetection } from '@/contexts/DetectionContext'
import { useEngine } from '@/contexts/EngineContext'
import { useMetering } from '@/contexts/MeteringContext'
import { useSettings } from '@/contexts/SettingsContext'
import type { CalibrationTabProps } from '@/components/analyzer/settings/CalibrationTab'
import type { DataCollectionTabProps } from '@/components/analyzer/settings/SettingsPanel'

export function useAudioAnalyzerViewState(dataCollection: DataCollectionHandle) {
  const { isRunning, error, workerError, start, dspWorker } = useEngine()
  const { settings, handleModeChange, setMicProfile } = useSettings()
  const { spectrumRef, sampleRate, fftSize } = useMetering()
  const { advisories } = useDetection()

  const { actualFps, droppedPercent } = useFpsMonitor(isRunning, settings.canvasTargetFps)
  const calibration = useCalibrationSession(spectrumRef, isRunning, settings)
  const ringOutFlow = useRingOutFlow({ handleModeChange, start })
  const shellState = useAnalyzerShellState(error, start)

  const advisoryFeedback = useAdvisoryFeedback({
    advisories,
    dspWorker,
    calibration: {
      calibrationEnabled: calibration.calibrationEnabled,
      falsePositiveIds: calibration.falsePositiveIds,
      onFalsePositive: calibration.onFalsePositive,
    },
  })

  useAnalyzerSessionEffects({
    isRunning,
    dataCollection,
    dspWorker,
    fftSize,
    sampleRate,
    advisories,
    calibrationEnabled: calibration.calibrationEnabled,
    onDetection: calibration.onDetection,
    onSettingsChange: calibration.onSettingsChange,
    spectrumRef,
    settings,
  })

  const appVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0'
  const handleCalibrationExport = useCallback(() => {
    calibration.exportSession(settings, appVersion)
  }, [appVersion, calibration, settings])

  const calibrationTabProps = useMemo<Omit<CalibrationTabProps, 'settings'>>(
    () => ({
      room: calibration.room,
      updateRoom: calibration.updateRoom,
      clearRoom: calibration.clearRoom,
      calibrationEnabled: calibration.calibrationEnabled,
      setCalibrationEnabled: calibration.setCalibrationEnabled,
      isRecording: calibration.isRecording,
      ambientCapture: calibration.ambientCapture,
      captureAmbient: calibration.captureAmbient,
      isCapturingAmbient: calibration.isCapturingAmbient,
      spectrumRef,
      stats: calibration.stats,
      onExport: handleCalibrationExport,
      setMicProfile,
    }),
    [calibration, handleCalibrationExport, setMicProfile, spectrumRef],
  )

  const dataCollectionTabProps = useMemo<DataCollectionTabProps>(
    () => ({
      consentStatus: dataCollection.consentStatus,
      isCollecting: dataCollection.isCollecting,
      onEnableCollection: dataCollection.handleReEnable,
      onDisableCollection: dataCollection.handleRevoke,
    }),
    [
      dataCollection.consentStatus,
      dataCollection.handleReEnable,
      dataCollection.handleRevoke,
      dataCollection.isCollecting,
    ],
  )

  return {
    isRunning,
    error,
    workerError,
    isWorkerPermanentlyDead: dspWorker.isPermanentlyDead,
    actualFps,
    droppedPercent,
    shellState,
    ringOutFlow,
    advisoryFeedback,
    calibrationTabProps,
    dataCollectionTabProps,
  }
}
