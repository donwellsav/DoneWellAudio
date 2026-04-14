'use client'

import { useTheme } from 'next-themes'
import { useCallback, useMemo, useState } from 'react'
import { getSeverityColor } from '@/lib/utils/advisoryDisplay'
import {
  formatFrequency,
  formatFrequencyRange,
  formatPitch,
} from '@/lib/utils/pitchUtils'
import { useSwipeGesture } from '@/hooks/useSwipeGesture'
import {
  RUNAWAY_VELOCITY_THRESHOLD,
  WARNING_VELOCITY_THRESHOLD,
} from '@/components/analyzer/issueCardConfig'
import type { Advisory } from '@/types/advisory'

export type IssueCardActionsLayout = 'desktop' | 'mobile' | 'copy-only' | null

export interface IssueCardDerivedState {
  pitchStr: string | null
  exactFreqStr: string
  isClustered: boolean
  velocity: number
  isRunaway: boolean
  isWarning: boolean
  isResolved: boolean
  peqNotchSvgPath: string | null
}

export function resolveIssueCardActionsLayout(
  touchFriendly?: boolean,
  swipeLabeling?: boolean,
): IssueCardActionsLayout {
  if (!touchFriendly) return 'desktop'
  if (touchFriendly) return 'mobile'
  return null
}

export function buildIssueCardDerivedState(advisory: Advisory): IssueCardDerivedState {
  const pitchStr = advisory.advisory?.pitch ? formatPitch(advisory.advisory.pitch) : null
  const isClustered =
    (advisory.clusterCount ?? 1) > 1 &&
    advisory.clusterMinHz != null &&
    advisory.clusterMaxHz != null
  const exactFreqStr = isClustered
    ? formatFrequencyRange(advisory.clusterMinHz!, advisory.clusterMaxHz!)
    : formatFrequency(advisory.trueFrequencyHz)
  const velocity = advisory.velocityDbPerSec ?? 0
  const isRunaway = velocity >= RUNAWAY_VELOCITY_THRESHOLD || advisory.isRunaway === true
  const isWarning = velocity >= WARNING_VELOCITY_THRESHOLD && !isRunaway
  const isResolved = advisory.resolved === true

  const peq = advisory.advisory?.peq
  if (!peq) {
    return {
      pitchStr,
      exactFreqStr,
      isClustered,
      velocity,
      isRunaway,
      isWarning,
      isResolved,
      peqNotchSvgPath: null,
    }
  }

  const logMin = Math.log10(20)
  const logMax = Math.log10(20000)
  const centerX = ((Math.log10(Math.max(20, peq.hz)) - logMin) / (logMax - logMin)) * 40
  const depth = Math.min(10, (Math.abs(peq.gainDb) / 12) * 10)
  const halfWidth = Math.max(2, Math.min(14, 20 / peq.q))
  const x1 = Math.max(0, centerX - halfWidth)
  const x2 = Math.min(40, centerX + halfWidth)
  const baseline = 5
  const peqNotchSvgPath = `M 0 ${baseline} L ${x1.toFixed(1)} ${baseline} Q ${centerX.toFixed(1)} ${(baseline + depth).toFixed(1)} ${x2.toFixed(1)} ${baseline} L 40 ${baseline}`

  return {
    pitchStr,
    exactFreqStr,
    isClustered,
    velocity,
    isRunaway,
    isWarning,
    isResolved,
    peqNotchSvgPath,
  }
}

interface UseIssueCardStateParams {
  advisory: Advisory
  touchFriendly?: boolean
  swipeLabeling?: boolean
  onFalsePositive?: (advisoryId: string) => void
  onConfirmFeedback?: (advisoryId: string) => void
  onDismiss?: (advisoryId: string) => void
  onSendToMixer?: (advisory: Advisory) => void
}

export function useIssueCardState({
  advisory,
  touchFriendly,
  swipeLabeling,
  onFalsePositive,
  onConfirmFeedback,
  onDismiss,
  onSendToMixer,
}: UseIssueCardStateParams) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme !== 'light'

  const derivedState = useMemo(() => buildIssueCardDerivedState(advisory), [advisory])
  const severityColor = useMemo(
    () => getSeverityColor(advisory.severity, isDark),
    [advisory.severity, isDark],
  )

  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    const parts = [derivedState.exactFreqStr]
    if (derivedState.pitchStr) parts.push(`(${derivedState.pitchStr})`)

    navigator.clipboard.writeText(parts.join(' ')).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }).catch(() => {
      // Clipboard API may be unavailable in insecure or test contexts.
    })
  }, [derivedState.exactFreqStr, derivedState.pitchStr])

  const { swipeX, swiping, swipeProgress, swipeDirection, handlers } = useSwipeGesture({
    enabled: !!swipeLabeling,
    onSwipeLeft: onDismiss ? () => onDismiss(advisory.id) : undefined,
    onSwipeRight: onConfirmFeedback ? () => onConfirmFeedback(advisory.id) : undefined,
    onLongPress: onFalsePositive ? () => onFalsePositive(advisory.id) : undefined,
  })

  const handleSendToMixer = useMemo(
    () => (onSendToMixer ? () => onSendToMixer(advisory) : undefined),
    [advisory, onSendToMixer],
  )

  return {
    ...derivedState,
    severityColor,
    copied,
    handleCopy,
    swipeX,
    swiping,
    swipeProgress,
    swipeDirection,
    handlers,
    actionsLayout: resolveIssueCardActionsLayout(touchFriendly, swipeLabeling),
    handleSendToMixer,
  }
}
