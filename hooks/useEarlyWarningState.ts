'use client'

import { useCallback, useState } from 'react'
import type { CombPatternResult } from '@/lib/dsp/advancedDetection'
import type { EarlyWarning } from '@/hooks/audioAnalyzerTypes'

export function earlyWarningMatchesPattern(
  earlyWarning: EarlyWarning,
  pattern: CombPatternResult,
): boolean {
  if (Math.round((earlyWarning.fundamentalSpacing ?? 0) * 10) !== Math.round((pattern.fundamentalSpacing ?? 0) * 10)) return false
  if (Math.round((earlyWarning.estimatedPathLength ?? 0) * 100) !== Math.round((pattern.estimatedPathLength ?? 0) * 100)) return false
  if (Math.round(earlyWarning.confidence * 100) !== Math.round(pattern.confidence * 100)) return false
  if (earlyWarning.predictedFrequencies.length !== pattern.predictedFrequencies.length) return false

  for (let i = 0; i < earlyWarning.predictedFrequencies.length; i++) {
    if (Math.round(earlyWarning.predictedFrequencies[i]) !== Math.round(pattern.predictedFrequencies[i])) return false
  }

  return true
}

export function buildEarlyWarning(
  previous: EarlyWarning | null,
  pattern: CombPatternResult | null,
): EarlyWarning | null {
  if (!pattern || !pattern.hasPattern || pattern.predictedFrequencies.length === 0) return null

  return {
    predictedFrequencies: pattern.predictedFrequencies,
    fundamentalSpacing: pattern.fundamentalSpacing,
    estimatedPathLength: pattern.estimatedPathLength,
    confidence: pattern.confidence,
    timestamp: previous && earlyWarningMatchesPattern(previous, pattern)
      ? previous.timestamp
      : Date.now(),
  }
}

export function useEarlyWarningState() {
  const [earlyWarning, setEarlyWarning] = useState<EarlyWarning | null>(null)

  const applyPattern = useCallback((pattern: CombPatternResult | null) => {
    setEarlyWarning((previous) => {
      const next = buildEarlyWarning(previous, pattern)
      const unchanged = previous === next || (
        previous !== null &&
        next !== null &&
        previous.timestamp === next.timestamp &&
        earlyWarningMatchesPattern(previous, {
          ...next,
          hasPattern: true,
          matchingPeaks: next.predictedFrequencies.length,
        })
      )
      return unchanged ? previous : next
    })
  }, [])

  const clearEarlyWarning = useCallback(() => {
    setEarlyWarning(null)
  }, [])

  return {
    earlyWarning,
    applyPattern,
    clearEarlyWarning,
  }
}
