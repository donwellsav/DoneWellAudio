'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { FaderGuidance } from '@/components/analyzer/faderTypes'

interface SensitivityGuidanceParams {
  enabled?: boolean
  isRunning: boolean
  inputLevel: number
  activeAdvisoryCount: number
  sensitivityDb: number
}

interface DerivedSensitivityGuidanceParams {
  enabled: boolean
  isRunning: boolean
  activeAdvisoryCount: number
  prolongedSilence: boolean
  sensitivityDb: number
}

export function deriveSensitivityGuidance({
  enabled,
  isRunning,
  activeAdvisoryCount,
  prolongedSilence,
  sensitivityDb,
}: DerivedSensitivityGuidanceParams): FaderGuidance {
  if (!enabled || !isRunning) return { direction: 'none', urgency: 'none' }
  if (activeAdvisoryCount >= 3) return { direction: 'down', urgency: 'warning' }
  if (prolongedSilence && sensitivityDb > 20) return { direction: 'up', urgency: 'hint' }

  if (sensitivityDb > 35) {
    return {
      direction: 'up',
      urgency: sensitivityDb >= 42 ? 'warning' : 'hint',
    }
  }

  if (sensitivityDb < 10) {
    return {
      direction: 'down',
      urgency: sensitivityDb <= 5 ? 'warning' : 'hint',
    }
  }

  return { direction: 'none', urgency: 'none' }
}

export function useSensitivityGuidance({
  enabled = true,
  isRunning,
  inputLevel,
  activeAdvisoryCount,
  sensitivityDb,
}: SensitivityGuidanceParams): FaderGuidance {
  const [prolongedSilence, setProlongedSilence] = useState(false)
  const noDetectionSecsRef = useRef(0)

  useEffect(() => {
    if (!enabled || !isRunning) {
      noDetectionSecsRef.current = 0
      setProlongedSilence(false)
      return
    }

    const intervalId = setInterval(() => {
      if (activeAdvisoryCount > 0 || inputLevel < -45) {
        noDetectionSecsRef.current = 0
        setProlongedSilence(false)
        return
      }

      noDetectionSecsRef.current += 1
      setProlongedSilence(noDetectionSecsRef.current >= 2)
    }, 1000)

    return () => clearInterval(intervalId)
  }, [enabled, isRunning, activeAdvisoryCount, inputLevel])

  return useMemo(() => deriveSensitivityGuidance({
    enabled,
    isRunning,
    activeAdvisoryCount,
    prolongedSilence,
    sensitivityDb,
  }), [enabled, isRunning, activeAdvisoryCount, prolongedSilence, sensitivityDb])
}
