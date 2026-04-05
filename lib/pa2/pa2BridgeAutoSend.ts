import type { Advisory } from '@/types/advisory'
import type { PA2DetectFrequency, PA2MetersResponse } from '@/types/pa2'
import type { HybridAction } from '@/lib/pa2/advisoryBridge'
import { crossValidateWithPA2RTA } from '@/lib/pa2/pa2Utils'

export function getEffectiveConfidenceThreshold(localThreshold: number, companionThreshold: number) {
  return Math.max(localThreshold, companionThreshold)
}

export function buildAutoSendDiag(
  advisories: readonly Advisory[],
  effectiveThreshold: number,
) {
  return {
    total: advisories.length,
    active: advisories.filter((advisory) => !advisory.resolved).length,
    aboveThreshold: advisories.filter(
      (advisory) => !advisory.resolved && advisory.confidence >= effectiveThreshold,
    ).length,
  }
}

export function shouldSkipAutoSendForSilence(meters: PA2MetersResponse | null) {
  if (!meters) return false

  const inputLeft = meters.input?.l ?? -120
  const inputRight = meters.input?.r ?? -120
  return Math.max(inputLeft, inputRight) < -60
}

export function crossValidateAdvisories(
  advisories: readonly Advisory[],
  rta: readonly number[],
) {
  return advisories.map((advisory) => {
    if (advisory.resolved) return advisory

    const confidence = crossValidateWithPA2RTA(
      advisory.trueFrequencyHz,
      advisory.confidence,
      rta,
    )

    return confidence === advisory.confidence
      ? advisory
      : { ...advisory, confidence }
  })
}

export function dedupeGEQCorrections(
  appliedCorrections: Readonly<Record<string, number>>,
  nextCorrections: Readonly<Record<string, number>>,
) {
  const deduped: Record<string, number> = {}

  for (const [band, gain] of Object.entries(nextCorrections)) {
    if (appliedCorrections[band] !== gain) {
      deduped[band] = gain
    }
  }

  return deduped
}

export function splitHybridActions(actions: readonly HybridAction[]) {
  const geqCorrections: Record<string, number> = {}
  const peqPayloadRaw: PA2DetectFrequency[] = []

  for (const action of actions) {
    if (action.type === 'geq') {
      const band = String(action.bandOrFreq)
      const existing = geqCorrections[band]
      if (existing === undefined || action.gain < existing) {
        geqCorrections[band] = action.gain
      }
      continue
    }

    peqPayloadRaw.push({
      hz: action.bandOrFreq,
      confidence: action.confidence ?? 0.9,
      type: 'feedback',
      q: action.q,
      clientId: action.clientId,
    })
  }

  return {
    geqCorrections,
    peqPayloadRaw,
  }
}
