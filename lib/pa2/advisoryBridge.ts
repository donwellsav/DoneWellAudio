/**
 * Advisory Bridge — maps DoneWellAudio advisories to PA2 API commands.
 *
 * This module translates between DoneWellAudio's internal advisory format
 * (frequency, severity, EQ recommendations with ERB-scaled Q values) and
 * the PA2 Companion module's HTTP API format (band numbers, dB gains, detect payloads).
 *
 * The bridge supports three operation modes:
 * 1. **GEQ mode** — Maps advisories to GEQ band corrections (coarse, 31 bands)
 * 2. **PEQ/detect mode** — Sends advisories to /detect for precision notch filters
 * 3. **Hybrid mode** — GEQ for broad issues, PEQ for narrow feedback
 *
 * @example
 * ```ts
 * const corrections = advisoriesToGEQCorrections(advisories, currentGEQBands)
 * await client.setGEQBands(corrections)
 * ```
 */

import type { Advisory, SeverityLevel } from '@/types/advisory'
import type { PA2DetectFrequency } from '@/types/pa2'
import { PA2_GEQ_FREQUENCIES } from '@/types/pa2'

// ═══ GEQ Bridge ═══

/**
 * Find the nearest GEQ band index (0-30) for a given frequency.
 * Uses log-space distance for perceptually correct matching.
 */
export function findNearestGEQBandIndex(frequencyHz: number): number {
  let bestIdx = 0
  let bestDist = Infinity
  for (let i = 0; i < PA2_GEQ_FREQUENCIES.length; i++) {
    const dist = Math.abs(Math.log2(frequencyHz) - Math.log2(PA2_GEQ_FREQUENCIES[i]))
    if (dist < bestDist) {
      bestDist = dist
      bestIdx = i
    }
  }
  return bestIdx
}

/**
 * Maps a severity level to a GEQ cut depth in dB.
 *
 * More severe issues get deeper cuts. These are conservative defaults;
 * the operator can configure max depth in the Companion module.
 *
 * | Severity | Cut |
 * |----------|-----|
 * | RUNAWAY | -12 dB |
 * | GROWING | -6 dB |
 * | RESONANCE | -3 dB |
 * | POSSIBLE_RING | -2 dB |
 * | WHISTLE | -4 dB |
 * | INSTRUMENT | 0 dB (no action) |
 */
export function severityToGEQCut(severity: SeverityLevel, q?: number): number {
  let base: number
  switch (severity) {
    case 'RUNAWAY': base = -12; break
    case 'GROWING': base = -6; break
    case 'RESONANCE': base = -3; break
    case 'POSSIBLE_RING': base = -2; break
    case 'WHISTLE': base = -4; break
    case 'INSTRUMENT': return 0
    default: return 0
  }
  // Q-scaling: narrow feedback (high Q) needs shallower cuts than broad (low Q).
  // Q=4 (broad) -> full depth, Q=16 (narrow) -> half depth.
  if (q !== undefined && q > 0) {
    const qFactor = Math.max(0.5, Math.min(1.0, 4 / q))
    return Math.round(base * qFactor)
  }
  return base
}

/**
 * Converts a set of advisories into GEQ band corrections.
 *
 * When multiple advisories map to the same GEQ band, the deepest cut wins.
 * Corrections are clamped to [-12, 0] dB (cuts only, no boosts from advisories).
 * Existing GEQ values are NOT considered — the caller should merge with current state.
 *
 * @param advisories - Active advisories from DoneWellAudio's detection pipeline
 * @param minConfidence - Minimum confidence to act on (default 0.6)
 * @returns Record<string, number> where key is PA2 band number "1"-"31" and value is dB
 */
export function advisoriesToGEQCorrections(
  advisories: readonly Advisory[],
  minConfidence: number = 0.6,
  softFloor: number = 0.25,
): Record<string, number> {
  const corrections: Record<string, number> = {}

  for (const adv of advisories) {
    if (adv.severity === 'INSTRUMENT') continue
    if (adv.resolved) continue
    // Below soft floor — skip entirely
    if (adv.confidence < softFloor) continue

    let cut = severityToGEQCut(adv.severity, adv.qEstimate)
    if (cut === 0) continue

    // Between softFloor and minConfidence — apply shallower cut (half depth, min -2dB)
    if (adv.confidence < minConfidence) {
      cut = Math.max(-2, Math.round(cut * 0.5))
      if (cut === 0) cut = -1
    }

    const bandIdx = findNearestGEQBandIndex(adv.trueFrequencyHz)
    const bandNum = String(bandIdx + 1)

    // Deepest cut wins when multiple advisories hit the same band
    const existing = corrections[bandNum]
    if (existing === undefined || cut < existing) {
      corrections[bandNum] = cut
    }
  }

  return corrections
}

/**
 * Merges advisory-driven corrections with the current GEQ state.
 *
 * This is additive: if the GEQ band is already at -4dB and the advisory
 * recommends -3dB, the result is -7dB (clamped to -12dB max).
 *
 * @param currentBands - Current GEQ band gains from PA2 (from GET /geq)
 * @param corrections - Advisory-driven corrections (from advisoriesToGEQCorrections)
 * @returns Merged band gains ready for POST /geq
 */
export function mergeGEQCorrections(
  currentBands: Readonly<Record<string, number>>,
  corrections: Readonly<Record<string, number>>,
): Record<string, number> {
  const merged: Record<string, number> = {}

  for (const [band, correction] of Object.entries(corrections)) {
    const current = currentBands[band] ?? 0
    merged[band] = Math.max(-12, current + correction)
  }

  return merged
}

// ═══ PEQ / Detect Bridge ═══

/**
 * Converts advisories to PA2 /detect format for precision PEQ notch placement.
 *
 * This is preferred over GEQ corrections for narrow feedback events because
 * PEQ filters have variable Q (the PA2 supports Q 0.1-16.0), while GEQ
 * bands are fixed 1/3-octave width.
 *
 * @param advisories - Active advisories
 * @param minConfidence - Minimum confidence to forward (default 0.7)
 * @returns Array of detect frequencies ready for POST /detect
 */
export function advisoriesToDetectPayload(
  advisories: readonly Advisory[],
  minConfidence: number = 0.7,
  softFloor: number = 0.25,
): PA2DetectFrequency[] {
  const payload: PA2DetectFrequency[] = []

  for (const adv of advisories) {
    if (adv.confidence < softFloor) continue
    if (adv.resolved) continue

    // Map DWA severity to detect type — all actionable severities sent as 'feedback'
    // so the Companion module will write PEQ notches (it skips 'resonance' type)
    const isFeedback = adv.severity !== 'INSTRUMENT'

    payload.push({
      hz: Math.round(adv.trueFrequencyHz),
      magnitude: adv.trueAmplitudeDb,
      confidence: adv.confidence,
      type: isFeedback ? 'feedback' : 'resonance',
      q: Math.min(16, Math.max(4, adv.qEstimate)),
      clientId: adv.id,
    })
  }

  // Sort by confidence descending — most certain issues first
  payload.sort((a, b) => b.confidence - a.confidence)

  return payload
}

// ═══ Hybrid Bridge ═══

export interface HybridAction {
  readonly type: 'geq' | 'peq'
  readonly bandOrFreq: number
  readonly gain: number
  readonly q?: number
  readonly confidence?: number
  readonly clientId?: string
  readonly reason: string
}

/**
 * Decides whether each advisory should use GEQ or PEQ correction.
 *
 * Decision criteria:
 * - Narrow feedback (Q > 8): PEQ (precise notch)
 * - Broad resonance (Q < 4): GEQ (wider correction)
 * - High severity (RUNAWAY/GROWING): PEQ (needs precision)
 * - Low severity (RESONANCE): GEQ (broad is fine)
 *
 * This mirrors how a skilled sound engineer thinks: narrow rings get
 * surgical PEQ notches, broad room modes get GEQ adjustments.
 */
export function advisoriesToHybridActions(
  advisories: readonly Advisory[],
  minConfidence: number = 0.6,
): HybridAction[] {
  const actions: HybridAction[] = []

  for (const adv of advisories) {
    if (adv.confidence < minConfidence) continue
    if (adv.severity === 'INSTRUMENT') continue
    if (adv.resolved) continue

    const isNarrow = adv.qEstimate > 8
    const isUrgent = adv.severity === 'RUNAWAY' || adv.severity === 'GROWING'

    if (isNarrow || isUrgent) {
      // PEQ: precise notch filter
      actions.push({
        type: 'peq',
        bandOrFreq: Math.round(adv.trueFrequencyHz),
        gain: severityToGEQCut(adv.severity, adv.qEstimate),
        q: Math.min(16, Math.max(4, adv.qEstimate)),
        confidence: adv.confidence,
        clientId: adv.id,
        reason: `${adv.severity} at ${Math.round(adv.trueFrequencyHz)}Hz (Q=${adv.qEstimate.toFixed(1)}, conf=${(adv.confidence * 100).toFixed(0)}%)`,
      })
    } else {
      // GEQ: broader correction
      const bandIdx = findNearestGEQBandIndex(adv.trueFrequencyHz)
      actions.push({
        type: 'geq',
        bandOrFreq: bandIdx + 1,
        gain: severityToGEQCut(adv.severity, adv.qEstimate),
        reason: `${adv.severity} near ${PA2_GEQ_FREQUENCIES[bandIdx]}Hz (conf=${(adv.confidence * 100).toFixed(0)}%)`,
      })
    }
  }

  return actions
}
