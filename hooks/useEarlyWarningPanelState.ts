'use client'

import { useCallback, useEffect, useState } from 'react'
import type { EarlyWarning } from '@/hooks/audioAnalyzerTypes'

export type EarlyWarningTone = 'notice' | 'warning' | 'critical'

export interface UseEarlyWarningPanelStateResult {
  isVisible: boolean
  isExpanded: boolean
  elapsedSec: number
  confidencePct: number
  progressPercent: number
  tone: EarlyWarningTone
  toggleExpanded: () => void
}

export function hasEarlyWarningContent(
  earlyWarning: EarlyWarning | null,
): boolean {
  return Boolean(
    earlyWarning && earlyWarning.predictedFrequencies.length > 0,
  )
}

export function getEarlyWarningElapsedSeconds(timestamp: number): number {
  return Math.max(0, Math.round((Date.now() - timestamp) / 1000))
}

export function getEarlyWarningTone(elapsedSec: number): EarlyWarningTone {
  if (elapsedSec >= 10) return 'critical'
  if (elapsedSec >= 5) return 'warning'
  return 'notice'
}

export function getEarlyWarningProgressPercent(elapsedSec: number): number {
  return Math.min(100, (elapsedSec / 15) * 100)
}

export function useEarlyWarningPanelState(
  earlyWarning: EarlyWarning | null,
): UseEarlyWarningPanelStateResult {
  const [isExpanded, setIsExpanded] = useState(true)
  const [elapsedSec, setElapsedSec] = useState(0)
  const isVisible = hasEarlyWarningContent(earlyWarning)
  const timestamp = earlyWarning?.timestamp ?? null

  useEffect(() => {
    if (timestamp === null) {
      setElapsedSec(0)
      return
    }

    setElapsedSec(getEarlyWarningElapsedSeconds(timestamp))

    const intervalId = window.setInterval(() => {
      setElapsedSec(getEarlyWarningElapsedSeconds(timestamp))
    }, 1000)

    return () => window.clearInterval(intervalId)
  }, [timestamp])

  const toggleExpanded = useCallback(() => {
    setIsExpanded((current) => !current)
  }, [])

  return {
    isVisible,
    isExpanded,
    elapsedSec,
    confidencePct: Math.round((earlyWarning?.confidence ?? 0) * 100),
    progressPercent: getEarlyWarningProgressPercent(elapsedSec),
    tone: getEarlyWarningTone(elapsedSec),
    toggleExpanded,
  }
}
