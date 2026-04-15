import type { DetectorSettings } from '@/types/advisory'
import type { ModeId } from '@/types/settings'
import {
  DEFAULT_DIAGNOSTICS,
  DEFAULT_DISPLAY_PREFS,
  DEFAULT_ENVIRONMENT,
  DEFAULT_LIVE_OVERRIDES,
  DEFAULT_MIC_PROFILE,
} from '@/lib/settings/defaults'
import { deriveDetectorSettings } from '@/lib/settings/deriveSettings'
import { MODE_BASELINES } from '@/lib/settings/modeBaselines'

/**
 * Builds the effective DetectorSettings default snapshot for a mode.
 *
 * This is the canonical bridge from the layered settings model back to the
 * legacy flat DetectorSettings bag used by older runtime consumers and tests.
 */
export function deriveDefaultDetectorSettings(modeId: ModeId = 'speech'): DetectorSettings {
  const baseline = MODE_BASELINES[modeId]

  return deriveDetectorSettings(
    baseline,
    DEFAULT_ENVIRONMENT,
    {
      ...DEFAULT_LIVE_OVERRIDES,
      inputGainDb: baseline.defaultInputGainDb,
    },
    DEFAULT_DISPLAY_PREFS,
    DEFAULT_DIAGNOSTICS,
    DEFAULT_MIC_PROFILE,
  )
}

/** Canonical flat settings snapshot for a fresh Speech-mode session. */
export const DEFAULT_DETECTOR_SETTINGS = deriveDefaultDetectorSettings()
