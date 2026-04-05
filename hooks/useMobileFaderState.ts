'use client'

import { useCallback, useState } from 'react'
import type { DetectorSettings } from '@/types/advisory'
import type { FaderGuidance } from '@/components/analyzer/SingleFader'
import { useSensitivityGuidance } from '@/hooks/useSensitivityGuidance'

interface UseMobileFaderStateParams {
  settings: Pick<DetectorSettings, 'feedbackThresholdDb' | 'inputGainDb'>
  isRunning: boolean
  inputLevel: number
  activeAdvisoryCount: number
  isAutoGain: boolean
  handleThresholdChange: (db: number) => void
  setInputGain: (db: number) => void
  setAutoGain: (enabled: boolean, targetDb?: number) => void
}

export interface UseMobileFaderStateReturn {
  mobileFaderMode: 'gain' | 'sensitivity'
  mobileFaderValue: number
  mobileGuidance: FaderGuidance
  mobileFaderOnChange: (db: number) => void
  toggleMobileFaderMode: () => void
}

export function useMobileFaderState({
  settings,
  isRunning,
  inputLevel,
  activeAdvisoryCount,
  isAutoGain,
  handleThresholdChange,
  setInputGain,
  setAutoGain,
}: UseMobileFaderStateParams): UseMobileFaderStateReturn {
  const [mobileFaderMode, setMobileFaderMode] = useState<'gain' | 'sensitivity'>('sensitivity')

  const mobileFaderOnChange = useCallback((db: number) => {
    if (mobileFaderMode === 'sensitivity') {
      handleThresholdChange(db)
      return
    }

    if (isAutoGain) setAutoGain(false)
    setInputGain(db)
  }, [mobileFaderMode, handleThresholdChange, isAutoGain, setAutoGain, setInputGain])

  const toggleMobileFaderMode = useCallback(() => {
    setMobileFaderMode((current) => current === 'gain' ? 'sensitivity' : 'gain')
  }, [])

  const mobileGuidance: FaderGuidance = useSensitivityGuidance({
    enabled: mobileFaderMode === 'sensitivity',
    isRunning,
    inputLevel,
    activeAdvisoryCount,
    sensitivityDb: settings.feedbackThresholdDb,
  })

  return {
    mobileFaderMode,
    mobileFaderValue: mobileFaderMode === 'sensitivity' ? settings.feedbackThresholdDb : settings.inputGainDb,
    mobileGuidance,
    mobileFaderOnChange,
    toggleMobileFaderMode,
  }
}
