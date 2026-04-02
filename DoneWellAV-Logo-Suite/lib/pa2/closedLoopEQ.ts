/**
 * Closed-loop GEQ tuning — send correction, read PA2 RTA, verify, adjust.
 *
 * Flow:
 * 1. Compute GEQ corrections from advisories
 * 2. Apply to PA2 via POST /geq
 * 3. Wait for room to settle (~2s)
 * 4. Read PA2 RTA via GET /loop
 * 5. Check if problem frequencies dropped
 * 6. If not: deepen the cut (up to -12dB max)
 * 7. If yes: mark as resolved
 *
 * @see advisoryBridge.ts for correction computation
 */

import type { PA2Client } from './pa2Client'
import { PA2_GEQ_FREQUENCIES } from '@/types/pa2'

/** Result of a single closed-loop verification cycle */
export interface VerifyResult {
  readonly band: number
  readonly freqHz: number
  readonly preCorrectionDb: number
  readonly postCorrectionDb: number
  readonly dropDb: number
  readonly effective: boolean
  readonly adjustedGain?: number
}

/**
 * Verify GEQ corrections by comparing pre/post RTA data.
 *
 * @param corrections - Band corrections that were applied { bandNum: gainDb }
 * @param preRTA - RTA snapshot before corrections (keyed by frequency string)
 * @param postRTA - RTA snapshot after corrections (keyed by frequency string)
 * @param minDropDb - Minimum dB drop to consider effective (default 3)
 * @param maxCutDb - Maximum cut depth for auto-deepening (default -12)
 * @returns Array of verification results with optional adjusted gains
 */
export function verifyGEQCorrections(
  corrections: Readonly<Record<string, number>>,
  preRTA: Readonly<Record<string, number>>,
  postRTA: Readonly<Record<string, number>>,
  minDropDb: number = 3,
  maxCutDb: number = -12,
): VerifyResult[] {
  const results: VerifyResult[] = []

  for (const [bandStr, gainDb] of Object.entries(corrections)) {
    const bandNum = parseInt(bandStr)
    if (bandNum < 1 || bandNum > 31) continue

    const freqHz = PA2_GEQ_FREQUENCIES[bandNum - 1]
    const freqKey = String(freqHz)

    const pre = preRTA[freqKey] ?? -90
    const post = postRTA[freqKey] ?? -90
    const drop = pre - post

    const effective = drop >= minDropDb

    let adjustedGain: number | undefined
    if (!effective && gainDb > maxCutDb) {
      // Deepen the cut by 3dB, clamped to max
      adjustedGain = Math.max(maxCutDb, gainDb - 3)
    }

    results.push({
      band: bandNum,
      freqHz,
      preCorrectionDb: pre,
      postCorrectionDb: post,
      dropDb: drop,
      effective,
      adjustedGain,
    })
  }

  return results
}

/**
 * Run a full closed-loop correction cycle.
 *
 * @param client - PA2 HTTP client
 * @param corrections - Band corrections to apply
 * @param settleMs - Milliseconds to wait for room to settle (default 2000)
 * @param signal - AbortSignal for cancellation
 */
export type ClosedLoopResult = {
  applied: boolean
  /** True when corrections were sent to hardware but verification failed or was aborted */
  appliedButUnverified: boolean
  results: VerifyResult[]
  deepened: Record<string, number>
}

export async function runClosedLoopCycle(
  client: PA2Client,
  corrections: Record<string, number>,
  settleMs: number = 2000,
  signal?: AbortSignal,
): Promise<ClosedLoopResult> {
  // 1. Take pre-correction RTA snapshot + capture current GEQ state for rollback
  const preLoop = await client.getLoop(signal)
  const preRTA = preLoop.rta
  const preGEQ: Record<string, number> = {}
  for (const band of Object.keys(corrections)) {
    preGEQ[band] = preRTA[band] ?? 0
  }

  // 2. Apply corrections
  await client.setGEQBands(corrections)

  // 3. Wait for room to settle — rollback on abort
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, settleMs)
      signal?.addEventListener('abort', () => {
        clearTimeout(timer)
        reject(new DOMException('Aborted', 'AbortError'))
      }, { once: true })
    })
  } catch (err) {
    // Abort during settle — rollback to pre-change state
    try { await client.setGEQBands(preGEQ) } catch { /* best-effort rollback */ }
    throw err
  }

  // 4. Read post-correction RTA — rollback on failure
  let postRTA: Record<string, number>
  try {
    const postLoop = await client.getLoop(signal)
    postRTA = postLoop.rta
  } catch (err) {
    // Post-read failed — corrections are applied but unverified
    // Rollback to pre-change state since we can't confirm the effect
    try { await client.setGEQBands(preGEQ) } catch { /* best-effort rollback */ }
    return { applied: true, appliedButUnverified: true, results: [], deepened: {} }
  }

  // 5. Verify
  const results = verifyGEQCorrections(corrections, preRTA, postRTA)

  // 6. Collect deepened corrections for retry
  const deepened: Record<string, number> = {}
  for (const r of results) {
    if (r.adjustedGain !== undefined) {
      deepened[String(r.band)] = r.adjustedGain
    }
  }

  return { applied: true, appliedButUnverified: false, results, deepened }
}
