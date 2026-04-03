/**
 * Mode-aware PA2 configuration sync.
 *
 * When DoneWell switches mode (speech → worship → liveMusic),
 * auto-configure PA2's AFS content mode, compressor settings, etc.
 *
 * Uses the existing Companion HTTP bridge /command endpoint.
 */

import type { OperationMode } from '@/types/advisory'
import type { PA2Client } from './pa2Client'

/** PA2 configuration for a DoneWell mode */
interface PA2ModeConfig {
  /** AFS content mode: 'Speech', 'Music', or 'Speech Music' */
  readonly afsContent: string
  /** AFS filter mode: 'Live' or 'Fixed' */
  readonly afsMode: string
  /** Whether to enable compressor */
  readonly compEnabled: boolean
  /** Compressor threshold in dB (only applied if compEnabled) */
  readonly compThresholdDb: number
}

/**
 * Map DoneWell modes to PA2 configurations.
 * Values tuned for typical live sound scenarios.
 */
const MODE_PA2_CONFIG: Record<OperationMode, PA2ModeConfig> = {
  speech: {
    afsContent: 'Speech',
    afsMode: 'Live',
    compEnabled: true,
    compThresholdDb: -20,
  },
  worship: {
    afsContent: 'Speech Music',
    afsMode: 'Live',
    compEnabled: true,
    compThresholdDb: -15,
  },
  liveMusic: {
    afsContent: 'Music',
    afsMode: 'Live',
    compEnabled: true,
    compThresholdDb: -10,
  },
  theater: {
    afsContent: 'Speech Music',
    afsMode: 'Live',
    compEnabled: true,
    compThresholdDb: -18,
  },
  monitors: {
    afsContent: 'Speech Music',
    afsMode: 'Live',
    compEnabled: false,
    compThresholdDb: -10,
  },
  ringOut: {
    afsContent: 'Speech Music',
    afsMode: 'Fixed',
    compEnabled: false,
    compThresholdDb: -10,
  },
  broadcast: {
    afsContent: 'Speech',
    afsMode: 'Live',
    compEnabled: true,
    compThresholdDb: -25,
  },
  outdoor: {
    afsContent: 'Music',
    afsMode: 'Live',
    compEnabled: true,
    compThresholdDb: -8,
  },
}

/**
 * Apply DoneWell mode configuration to PA2.
 * Sends AFS and compressor settings via the Companion /command endpoint.
 */
export type ModeSyncResult = {
  ok: boolean
  /** Which steps completed before failure */
  completedSteps: string[]
  /** Which step failed (null if all succeeded) */
  failedStep: string | null
  error?: unknown
}

export async function syncModeToPA2(client: PA2Client, mode: OperationMode): Promise<ModeSyncResult> {
  const config = MODE_PA2_CONFIG[mode]
  if (!config) return { ok: true, completedSteps: [], failedStep: null }

  const completed: string[] = []

  try {
    await client.sendAction('afs_content', { content: config.afsContent })
    completed.push('afs_content')

    await client.sendAction('afs_mode', { mode: config.afsMode })
    completed.push('afs_mode')

    await client.sendAction('comp_enable', { value: config.compEnabled })
    completed.push('comp_enable')

    if (config.compEnabled) {
      await client.sendAction('comp_threshold', { value: config.compThresholdDb })
      completed.push('comp_threshold')
    }

    return { ok: true, completedSteps: completed, failedStep: null }
  } catch (error) {
    const nextStep = ['afs_content', 'afs_mode', 'comp_enable', 'comp_threshold']
      .find(s => !completed.includes(s)) ?? 'unknown'
    console.warn(`[modeSync] Partial failure at step '${nextStep}' — completed: [${completed.join(', ')}]`)
    return { ok: false, completedSteps: completed, failedStep: nextStep, error }
  }
}

export { MODE_PA2_CONFIG }
