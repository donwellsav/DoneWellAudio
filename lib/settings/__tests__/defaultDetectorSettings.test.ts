import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '@/lib/dsp/constants'
import {
  deriveDefaultDetectorSettings,
  deriveFreshStartDetectorSettings,
} from '@/lib/settings/defaultDetectorSettings'
import {
  DEFAULT_DIAGNOSTICS,
  DEFAULT_DISPLAY_PREFS,
  DEFAULT_ENVIRONMENT,
  FRESH_START_SENSITIVITY_OFFSET_DB,
  DEFAULT_LIVE_OVERRIDES,
  DEFAULT_MIC_PROFILE,
} from '@/lib/settings/defaults'
import { deriveDetectorSettings } from '@/lib/settings/deriveSettings'
import { MODE_BASELINES } from '@/lib/settings/modeBaselines'

describe('deriveDefaultDetectorSettings', () => {
  it('matches the layered Speech composition for explicit Speech mode defaults', () => {
    const expected = deriveDetectorSettings(
      MODE_BASELINES.speech,
      DEFAULT_ENVIRONMENT,
      {
        ...DEFAULT_LIVE_OVERRIDES,
        inputGainDb: MODE_BASELINES.speech.defaultInputGainDb,
      },
      DEFAULT_DISPLAY_PREFS,
      DEFAULT_DIAGNOSTICS,
      DEFAULT_MIC_PROFILE,
    )

    expect(deriveDefaultDetectorSettings('speech')).toEqual(expected)
    expect(deriveDefaultDetectorSettings('speech').feedbackThresholdDb).toBe(20)
  })

  it('exports the fresh-start compatibility snapshot at 25 dB', () => {
    const expected = deriveDetectorSettings(
      MODE_BASELINES.speech,
      DEFAULT_ENVIRONMENT,
      {
        ...DEFAULT_LIVE_OVERRIDES,
        inputGainDb: MODE_BASELINES.speech.defaultInputGainDb,
        sensitivityOffsetDb: FRESH_START_SENSITIVITY_OFFSET_DB,
      },
      DEFAULT_DISPLAY_PREFS,
      DEFAULT_DIAGNOSTICS,
      DEFAULT_MIC_PROFILE,
    )

    expect(deriveFreshStartDetectorSettings()).toEqual(expected)
    expect(DEFAULT_SETTINGS).toEqual(expected)
    expect(DEFAULT_SETTINGS.feedbackThresholdDb).toBe(25)
  })

  it('keeps mode-owned defaults aligned for non-Speech modes', () => {
    const ringOutDefaults = deriveDefaultDetectorSettings('ringOut')

    expect(ringOutDefaults.feedbackThresholdDb).toBe(MODE_BASELINES.ringOut.feedbackThresholdDb)
    expect(ringOutDefaults.trackTimeoutMs).toBe(MODE_BASELINES.ringOut.defaultTrackTimeoutMs)
    expect(ringOutDefaults.autoGainTargetDb).toBe(MODE_BASELINES.ringOut.defaultAutoGainTargetDb)
  })
})
