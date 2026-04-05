'use client'

import { useEffect, useRef } from 'react'
import { useAdvisoryLogging } from '@/hooks/useAdvisoryLogging'
import { useIsMobile } from '@/hooks/use-mobile'
import type { DataCollectionHandle } from '@/hooks/useDataCollection'
import type { UseCalibrationSessionReturn } from '@/hooks/useCalibrationSession'
import type { Advisory, DetectorSettings, MicCalibrationProfile, SpectrumData } from '@/types/advisory'

function assignSettingDelta<K extends keyof DetectorSettings>(
  delta: Partial<DetectorSettings>,
  key: K,
  value: DetectorSettings[K],
): void {
  delta[key] = value
}

interface UseAnalyzerSessionEffectsParams {
  isRunning: boolean
  dataCollection: Pick<DataCollectionHandle, 'promptIfNeeded'>
  fftSize: number
  sampleRate: number
  advisories: Advisory[]
  calibrationEnabled: UseCalibrationSessionReturn['calibrationEnabled']
  onDetection: UseCalibrationSessionReturn['onDetection']
  onSettingsChange: UseCalibrationSessionReturn['onSettingsChange']
  spectrumRef: React.RefObject<SpectrumData | null>
  settings: DetectorSettings
  setMicProfile: (profile: MicCalibrationProfile) => void
}

export function useAnalyzerSessionEffects({
  isRunning,
  dataCollection,
  fftSize,
  sampleRate,
  advisories,
  calibrationEnabled,
  onDetection,
  onSettingsChange,
  spectrumRef,
  settings,
  setMicProfile,
}: UseAnalyzerSessionEffectsParams): void {
  const isMobile = useIsMobile()

  useEffect(() => {
    if (isRunning) {
      dataCollection.promptIfNeeded(fftSize, sampleRate)
    }
  }, [dataCollection, fftSize, isRunning, sampleRate])

  useAdvisoryLogging(advisories)

  const prevAdvisoryIdsRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (!calibrationEnabled) return

    const prevIds = prevAdvisoryIdsRef.current
    for (const advisory of advisories) {
      if (!prevIds.has(advisory.id)) {
        onDetection(advisory, spectrumRef.current)
      }
    }

    prevIds.clear()
    advisories.forEach(advisory => prevIds.add(advisory.id))
  }, [advisories, calibrationEnabled, onDetection, spectrumRef])

  const prevSettingsRef = useRef(settings)
  useEffect(() => {
    const timer = setTimeout(() => {
      const previousSettings = prevSettingsRef.current
      const delta: Partial<DetectorSettings> = {}
      let hasDelta = false

      for (const key of Object.keys(settings) as Array<keyof DetectorSettings>) {
        if (settings[key] !== previousSettings[key]) {
          assignSettingDelta(delta, key, settings[key])
          hasDelta = true
        }
      }

      if (hasDelta) {
        onSettingsChange(delta)
      }

      prevSettingsRef.current = settings
    }, 100)

    return () => clearTimeout(timer)
  }, [onSettingsChange, settings])

  const mobileCalAppliedRef = useRef(false)
  useEffect(() => {
    if (isMobile && !mobileCalAppliedRef.current && settings.micCalibrationProfile === 'none') {
      mobileCalAppliedRef.current = true
      setMicProfile('smartphone')
    }
  }, [isMobile, setMicProfile, settings.micCalibrationProfile])
}
