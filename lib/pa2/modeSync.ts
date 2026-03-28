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
export async function syncModeToPA2(client: PA2Client, mode: OperationMode): Promise<void> {
  const config = MODE_PA2_CONFIG[mode]
  if (!config) return

  // Set AFS content mode
  await client.sendAction('afs_content', { content: config.afsContent })
  // Set AFS filter mode
  await client.sendAction('afs_mode', { mode: config.afsMode })
  // Enable/disable compressor
  await client.sendAction('comp_enable', { value: config.compEnabled })
  // Set compressor threshold (only if enabled)
  if (config.compEnabled) {
    await client.sendAction('comp_threshold', { value: config.compThresholdDb })
  }
}

export { MODE_PA2_CONFIG }
