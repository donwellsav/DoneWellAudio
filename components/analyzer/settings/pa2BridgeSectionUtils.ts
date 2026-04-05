'use client'

import { buildCompanionUrl, type PA2BridgeState, type PA2Settings } from '@/types/pa2'

type CompanionSettingsFields = Pick<PA2Settings, 'companionIp' | 'companionPort' | 'instanceLabel'>

interface PA2AutoSendSummaryParams {
  pa2Connected: boolean
  lastAutoSendError: string | null
  lastAutoSendResult: PA2BridgeState['lastAutoSendResult']
  autoSendDiag: PA2BridgeState['autoSendDiag']
  effectiveConfidence: number
  configuredConfidence: number
  now: number
}

export interface PA2StatusSummary {
  indicatorClassName: string
  message: string
  helperText: string | null
  showMixedContentLink: boolean
}

export function sanitizeCompanionIp(value: string): string {
  return value.replace(/^https?:\/\//, '').replace(/\/+$/, '')
}

export function buildCompanionSettingsUpdate(
  current: CompanionSettingsFields,
  partial: Partial<CompanionSettingsFields>,
) {
  const next = {
    ...current,
    ...partial,
  }

  return {
    ...next,
    baseUrl: buildCompanionUrl(next.companionIp, next.companionPort, next.instanceLabel),
  }
}

export function getPA2StatusSummary({
  status,
  pa2Connected,
  notchSlotsUsed,
  notchSlotsAvailable,
  error,
}: Pick<PA2BridgeState, 'status' | 'pa2Connected' | 'notchSlotsUsed' | 'notchSlotsAvailable' | 'error'>): PA2StatusSummary {
  if (status === 'connected' && pa2Connected) {
    return {
      indicatorClassName: 'bg-green-500',
      message: `PA2 Connected - PEQ ${notchSlotsUsed}/${notchSlotsAvailable + notchSlotsUsed} slots`,
      helperText: null,
      showMixedContentLink: false,
    }
  }

  if (status === 'connected' && !pa2Connected) {
    return {
      indicatorClassName: 'bg-amber-500 animate-pulse',
      message: 'Companion OK - PA2 not connected',
      helperText: 'Check Companion: PA2 IP address and TCP connection (port 19272).',
      showMixedContentLink: false,
    }
  }

  if (status === 'connecting') {
    return {
      indicatorClassName: 'bg-yellow-500 animate-pulse',
      message: 'Connecting...',
      helperText: null,
      showMixedContentLink: false,
    }
  }

  if (status === 'error') {
    return {
      indicatorClassName: 'bg-red-500',
      message: error ?? 'Connection error',
      helperText: null,
      showMixedContentLink: error?.includes('Mixed content') ?? false,
    }
  }

  return {
    indicatorClassName: 'bg-muted-foreground',
    message: 'Disconnected',
    helperText: null,
    showMixedContentLink: false,
  }
}

export function getPA2AutoSendSummary({
  pa2Connected,
  lastAutoSendError,
  lastAutoSendResult,
  autoSendDiag,
  effectiveConfidence,
  configuredConfidence,
  now,
}: PA2AutoSendSummaryParams): { toneClassName: string; text: string } | null {
  if (lastAutoSendError) {
    return {
      toneClassName: 'text-red-400',
      text: `Auto-send failed: ${lastAutoSendError}`,
    }
  }

  if (lastAutoSendResult) {
    const secondsAgo = Math.round((now - lastAutoSendResult.timestamp) / 1000)
    const typeLabel =
      lastAutoSendResult.type === 'both' ? 'PEQ+GEQ' : lastAutoSendResult.type.toUpperCase()

    return {
      toneClassName: 'text-muted-foreground/70',
      text: `Sent ${lastAutoSendResult.count} ${typeLabel} correction${lastAutoSendResult.count !== 1 ? 's' : ''} ${secondsAgo}s ago`,
    }
  }

  if (autoSendDiag && autoSendDiag.aboveThreshold === 0 && autoSendDiag.active > 0) {
    const raisedThreshold =
      effectiveConfidence > configuredConfidence
        ? ` (raised by PA2 from ${(configuredConfidence * 100).toFixed(0)}%)`
        : ''

    return {
      toneClassName: 'text-amber-500/70',
      text: `${autoSendDiag.active} card${autoSendDiag.active !== 1 ? 's' : ''} active but 0 above ${(effectiveConfidence * 100).toFixed(0)}% confidence${raisedThreshold} - lower the threshold`,
    }
  }

  if (pa2Connected) {
    return {
      toneClassName: 'text-muted-foreground/50',
      text: 'Listening - no feedback detected yet',
    }
  }

  return null
}
