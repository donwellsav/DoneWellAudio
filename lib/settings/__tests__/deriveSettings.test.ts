/**
 * Exhaustive tests for the derivation function.
 *
 * These tests prove that deriveDetectorSettings() produces outputs that
 * match the current system's behavior for all 8 modes × 7 rooms.
 *
 * Values are sourced from:
 *   - OPERATION_MODES in lib/dsp/constants.ts (lines 417-632)
 *   - ROOM_PRESETS in lib/dsp/constants.ts (lines 709-766)
 *   - DEFAULT_SETTINGS in lib/dsp/constants.ts (lines 640-705)
 *   - Mode baselines in lib/settings/modeBaselines.ts
 *   - Environment templates in lib/settings/environmentTemplates.ts
 *
 * The one intentional behavioral change: room presets now apply relative
 * offsets instead of absolute thresholds. This is tested explicitly.
 */

import { describe, expect, it } from 'vitest'
import { OPERATION_MODES, ROOM_PRESETS } from '@/lib/dsp/constants'
import { DEFAULT_DIAGNOSTICS, DEFAULT_DISPLAY_PREFS, DEFAULT_ENVIRONMENT, DEFAULT_LIVE_OVERRIDES } from '@/lib/settings/defaults'
import { deriveDetectorSettings } from '@/lib/settings/deriveSettings'
import { ENVIRONMENT_TEMPLATES } from '@/lib/settings/environmentTemplates'
import { MODE_BASELINES } from '@/lib/settings/modeBaselines'
import type { ModeId, RoomTemplateId } from '@/types/settings'

const ALL_MODES: ModeId[] = ['speech', 'worship', 'liveMusic', 'theater', 'monitors', 'ringOut', 'broadcast', 'outdoor']
const ALL_ROOMS: RoomTemplateId[] = ['none', 'small', 'medium', 'large', 'arena', 'worship', 'custom']

// ─── Helper ─────────────────────────────────────────────────────────────────

function deriveForMode(modeId: ModeId) {
  return deriveDetectorSettings(
    MODE_BASELINES[modeId],
    DEFAULT_ENVIRONMENT,
    DEFAULT_LIVE_OVERRIDES,
    DEFAULT_DISPLAY_PREFS,
    DEFAULT_DIAGNOSTICS,
    'none',
  )
}

function deriveForModeAndRoom(modeId: ModeId, roomId: RoomTemplateId) {
  const template = ENVIRONMENT_TEMPLATES[roomId]
  const env = {
    ...DEFAULT_ENVIRONMENT,
    templateId: roomId,
    feedbackOffsetDb: template.feedbackOffsetDb,
    ringOffsetDb: template.ringOffsetDb,
    treatment: template.treatment,
    roomRT60: template.roomRT60,
    roomVolume: template.roomVolume,
    dimensionsM: { length: template.lengthM, width: template.widthM, height: template.heightM },
  }
  return deriveDetectorSettings(
    MODE_BASELINES[modeId],
    env,
    DEFAULT_LIVE_OVERRIDES,
    DEFAULT_DISPLAY_PREFS,
    DEFAULT_DIAGNOSTICS,
    'none',
  )
}

// ─── Mode baselines match OPERATION_MODES exactly ────────────────────────────

describe('deriveDetectorSettings — mode baselines (no room)', () => {
  it.each(ALL_MODES)('mode "%s" matches OPERATION_MODES values', (modeId) => {
    const derived = deriveForMode(modeId)
    const original = OPERATION_MODES[modeId]

    // All mode-owned fields must match the source constants
    expect(derived.mode).toBe(modeId)
    expect(derived.feedbackThresholdDb).toBe(original.feedbackThresholdDb)
    expect(derived.ringThresholdDb).toBe(original.ringThresholdDb)
    expect(derived.growthRateThreshold).toBe(original.growthRateThreshold)
    expect(derived.fftSize).toBe(original.fftSize)
    expect(derived.minFrequency).toBe(original.minFrequency)
    expect(derived.maxFrequency).toBe(original.maxFrequency)
    expect(derived.sustainMs).toBe(original.sustainMs)
    expect(derived.clearMs).toBe(original.clearMs)
    expect(derived.confidenceThreshold).toBe(original.confidenceThreshold)
    expect(derived.prominenceDb).toBe(original.prominenceDb)
    expect(derived.eqPreset).toBe(original.eqPreset)
    expect(derived.aWeightingEnabled).toBe(original.aWeightingEnabled)
    expect(derived.ignoreWhistle).toBe(original.ignoreWhistle)
  })
})

// ─── Display fields pass through unchanged ──────────────────────────────────

describe('deriveDetectorSettings — display passthrough', () => {
  it('all display fields match DEFAULT_DISPLAY_PREFS', () => {
    const derived = deriveForMode('speech')

    expect(derived.maxDisplayedIssues).toBe(DEFAULT_DISPLAY_PREFS.maxDisplayedIssues)
    expect(derived.graphFontSize).toBe(DEFAULT_DISPLAY_PREFS.graphFontSize)
    expect(derived.showTooltips).toBe(DEFAULT_DISPLAY_PREFS.showTooltips)
    expect(derived.showAlgorithmScores).toBe(DEFAULT_DISPLAY_PREFS.showAlgorithmScores)
    expect(derived.showPeqDetails).toBe(DEFAULT_DISPLAY_PREFS.showPeqDetails)
    expect(derived.showFreqZones).toBe(DEFAULT_DISPLAY_PREFS.showFreqZones)
    expect(derived.spectrumWarmMode).toBe(DEFAULT_DISPLAY_PREFS.spectrumWarmMode)
    expect(derived.rtaDbMin).toBe(DEFAULT_DISPLAY_PREFS.rtaDbMin)
    expect(derived.rtaDbMax).toBe(DEFAULT_DISPLAY_PREFS.rtaDbMax)
    expect(derived.spectrumLineWidth).toBe(DEFAULT_DISPLAY_PREFS.spectrumLineWidth)
    expect(derived.showThresholdLine).toBe(DEFAULT_DISPLAY_PREFS.showThresholdLine)
    expect(derived.canvasTargetFps).toBe(DEFAULT_DISPLAY_PREFS.canvasTargetFps)
    expect(derived.faderMode).toBe(DEFAULT_DISPLAY_PREFS.faderMode)
    expect(derived.swipeLabeling).toBe(DEFAULT_DISPLAY_PREFS.swipeLabeling)
  })

  it('custom display prefs override defaults', () => {
    const customDisplay = { ...DEFAULT_DISPLAY_PREFS, graphFontSize: 22, showAlgorithmScores: true }
    const derived = deriveDetectorSettings(
      MODE_BASELINES.speech,
      DEFAULT_ENVIRONMENT,
      DEFAULT_LIVE_OVERRIDES,
      customDisplay,
      DEFAULT_DIAGNOSTICS,
      'none',
    )
    expect(derived.graphFontSize).toBe(22)
    expect(derived.showAlgorithmScores).toBe(true)
  })
})

// ─── Diagnostics fields ─────────────────────────────────────────────────────

describe('deriveDetectorSettings — diagnostics', () => {
  it('diagnostics fields match DEFAULT_DIAGNOSTICS', () => {
    const derived = deriveForMode('speech')

    expect(derived.algorithmMode).toBe(DEFAULT_DIAGNOSTICS.algorithmMode)
    expect(derived.enabledAlgorithms).toEqual(DEFAULT_DIAGNOSTICS.enabledAlgorithms)
    expect(derived.mlEnabled).toBe(DEFAULT_DIAGNOSTICS.mlEnabled)
    expect(derived.thresholdMode).toBe(DEFAULT_DIAGNOSTICS.thresholdMode)
    expect(derived.noiseFloorAttackMs).toBe(DEFAULT_DIAGNOSTICS.noiseFloorAttackMs)
    expect(derived.noiseFloorReleaseMs).toBe(DEFAULT_DIAGNOSTICS.noiseFloorReleaseMs)
    expect(derived.maxTracks).toBe(DEFAULT_DIAGNOSTICS.maxTracks)
    expect(derived.trackTimeoutMs).toBe(DEFAULT_DIAGNOSTICS.trackTimeoutMs)
    expect(derived.harmonicToleranceCents).toBe(DEFAULT_DIAGNOSTICS.harmonicToleranceCents)
    expect(derived.peakMergeCents).toBe(DEFAULT_DIAGNOSTICS.peakMergeCents)
  })

  it('diagnostics overrides take precedence over baseline', () => {
    const diag = {
      ...DEFAULT_DIAGNOSTICS,
      confidenceThresholdOverride: 0.9,
      growthRateThresholdOverride: 5.0,
      smoothingTimeConstantOverride: 0.8,
    }
    const derived = deriveDetectorSettings(
      MODE_BASELINES.speech,
      DEFAULT_ENVIRONMENT,
      DEFAULT_LIVE_OVERRIDES,
      DEFAULT_DISPLAY_PREFS,
      diag,
      'none',
    )
    expect(derived.confidenceThreshold).toBe(0.9)
    expect(derived.growthRateThreshold).toBe(5.0)
    expect(derived.smoothingTimeConstant).toBe(0.8)
  })

  it('without overrides, baseline confidenceThreshold and growthRateThreshold are used', () => {
    const derived = deriveForMode('liveMusic')
    // Verify against the actual OPERATION_MODES values
    expect(derived.confidenceThreshold).toBe(OPERATION_MODES.liveMusic.confidenceThreshold)
    expect(derived.growthRateThreshold).toBe(OPERATION_MODES.liveMusic.growthRateThreshold)
  })
})

// ─── Environment offset math ────────────────────────────────────────────────

describe('deriveDetectorSettings — environment offsets', () => {
  it.each(ALL_MODES)('mode "%s" with room=none has zero offset (matches baseline)', (modeId) => {
    const derived = deriveForModeAndRoom(modeId, 'none')
    const baseline = MODE_BASELINES[modeId]

    expect(derived.feedbackThresholdDb).toBe(baseline.feedbackThresholdDb)
    expect(derived.ringThresholdDb).toBe(baseline.ringThresholdDb)
  })

  // Verify that speech mode + each room produces the same absolute values
  // as the old ROOM_PRESETS, since offsets were computed from speech baseline
  it.each(ALL_ROOMS.filter(r => r !== 'none'))('speech + %s matches old ROOM_PRESETS thresholds', (roomId) => {
    const derived = deriveForModeAndRoom('speech', roomId)
    const oldPreset = ROOM_PRESETS[roomId]

    expect(derived.feedbackThresholdDb).toBe(oldPreset.feedbackThresholdDb)
    expect(derived.ringThresholdDb).toBe(oldPreset.ringThresholdDb)
  })

  // The key behavioral change: non-speech modes now get relative offsets
  it('liveMusic + small room uses relative offset (behavioral change)', () => {
    const derived = deriveForModeAndRoom('liveMusic', 'small')
    const lmBaseline = MODE_BASELINES.liveMusic
    const smallTemplate = ENVIRONMENT_TEMPLATES.small

    // New: baseline.feedbackThresholdDb + offset
    const expected = lmBaseline.feedbackThresholdDb + smallTemplate.feedbackOffsetDb
    expect(derived.feedbackThresholdDb).toBe(expected)

    // Old behavior would have been ROOM_PRESETS.small.feedbackThresholdDb = 22 (absolute)
    // New behavior is relative: 42 + (-5) = 37
    expect(derived.feedbackThresholdDb).not.toBe(ROOM_PRESETS.small.feedbackThresholdDb)
  })

  it('room template metadata passes through', () => {
    const derived = deriveForModeAndRoom('speech', 'small')
    const smallTemplate = ENVIRONMENT_TEMPLATES.small

    expect(derived.roomPreset).toBe('small')
    expect(derived.roomTreatment).toBe(smallTemplate.treatment)
    expect(derived.roomRT60).toBe(smallTemplate.roomRT60)
    expect(derived.roomVolume).toBe(smallTemplate.roomVolume)
    expect(derived.roomLengthM).toBe(smallTemplate.lengthM)
    expect(derived.roomWidthM).toBe(smallTemplate.widthM)
    expect(derived.roomHeightM).toBe(smallTemplate.heightM)
  })
})

// ─── Live overrides ─────────────────────────────────────────────────────────

describe('deriveDetectorSettings — live overrides', () => {
  it('sensitivityOffsetDb shifts feedback threshold', () => {
    const live = { ...DEFAULT_LIVE_OVERRIDES, sensitivityOffsetDb: 5 }
    const derived = deriveDetectorSettings(
      MODE_BASELINES.speech,
      DEFAULT_ENVIRONMENT,
      live,
      DEFAULT_DISPLAY_PREFS,
      DEFAULT_DIAGNOSTICS,
      'none',
    )
    // baseline + env(0) + live(5)
    expect(derived.feedbackThresholdDb).toBe(MODE_BASELINES.speech.feedbackThresholdDb + 5)
  })

  it('negative sensitivityOffsetDb makes detection more sensitive', () => {
    const live = { ...DEFAULT_LIVE_OVERRIDES, sensitivityOffsetDb: -10 }
    const derived = deriveDetectorSettings(
      MODE_BASELINES.speech,
      DEFAULT_ENVIRONMENT,
      live,
      DEFAULT_DISPLAY_PREFS,
      DEFAULT_DIAGNOSTICS,
      'none',
    )
    expect(derived.feedbackThresholdDb).toBe(MODE_BASELINES.speech.feedbackThresholdDb - 10)
  })

  it('sensitivity + environment compose correctly', () => {
    const template = ENVIRONMENT_TEMPLATES.arena
    const env = {
      ...DEFAULT_ENVIRONMENT,
      templateId: 'arena' as const,
      feedbackOffsetDb: template.feedbackOffsetDb,
      ringOffsetDb: template.ringOffsetDb,
    }
    const live = { ...DEFAULT_LIVE_OVERRIDES, sensitivityOffsetDb: -3 }
    const derived = deriveDetectorSettings(
      MODE_BASELINES.speech,
      env,
      live,
      DEFAULT_DISPLAY_PREFS,
      DEFAULT_DIAGNOSTICS,
      'none',
    )
    // baseline + arena offset + live offset
    const expected = MODE_BASELINES.speech.feedbackThresholdDb + template.feedbackOffsetDb + (-3)
    expect(derived.feedbackThresholdDb).toBe(expected)
  })

  it('custom focus range overrides mode defaults', () => {
    const live = {
      ...DEFAULT_LIVE_OVERRIDES,
      focusRange: { kind: 'custom' as const, minHz: 500, maxHz: 4000 },
    }
    const derived = deriveDetectorSettings(
      MODE_BASELINES.speech,
      DEFAULT_ENVIRONMENT,
      live,
      DEFAULT_DISPLAY_PREFS,
      DEFAULT_DIAGNOSTICS,
      'none',
    )
    expect(derived.minFrequency).toBe(500)
    expect(derived.maxFrequency).toBe(4000)
  })

  it('mode-default focus range uses baseline values', () => {
    const derived = deriveForMode('liveMusic')
    expect(derived.minFrequency).toBe(MODE_BASELINES.liveMusic.minFrequency)
    expect(derived.maxFrequency).toBe(MODE_BASELINES.liveMusic.maxFrequency)
  })

  it('eqStyle override replaces mode baseline', () => {
    const live = { ...DEFAULT_LIVE_OVERRIDES, eqStyle: 'heavy' as const }
    const derived = deriveDetectorSettings(
      MODE_BASELINES.speech,
      DEFAULT_ENVIRONMENT,
      live,
      DEFAULT_DISPLAY_PREFS,
      DEFAULT_DIAGNOSTICS,
      'none',
    )
    expect(derived.eqPreset).toBe('heavy')
  })

  it('eqStyle mode-default uses baseline', () => {
    const derived = deriveForMode('liveMusic')
    expect(derived.eqPreset).toBe(MODE_BASELINES.liveMusic.eqPreset)
  })

  it('auto-gain settings pass through from live overrides', () => {
    const live = { ...DEFAULT_LIVE_OVERRIDES, autoGainEnabled: true, autoGainTargetDb: -12 }
    const derived = deriveDetectorSettings(
      MODE_BASELINES.speech,
      DEFAULT_ENVIRONMENT,
      live,
      DEFAULT_DISPLAY_PREFS,
      DEFAULT_DIAGNOSTICS,
      'none',
    )
    expect(derived.autoGainEnabled).toBe(true)
    expect(derived.autoGainTargetDb).toBe(-12)
  })
})

// ─── Edge cases ─────────────────────────────────────────────────────────────

describe('deriveDetectorSettings — edge cases', () => {
  it('threshold never goes below 1', () => {
    const live = { ...DEFAULT_LIVE_OVERRIDES, sensitivityOffsetDb: -100 }
    const derived = deriveDetectorSettings(
      MODE_BASELINES.monitors,
      DEFAULT_ENVIRONMENT,
      live,
      DEFAULT_DISPLAY_PREFS,
      DEFAULT_DIAGNOSTICS,
      'none',
    )
    expect(derived.feedbackThresholdDb).toBe(1)
  })

  it('ringThresholdDb never goes below 1', () => {
    const env = { ...DEFAULT_ENVIRONMENT, ringOffsetDb: -100 }
    const derived = deriveDetectorSettings(
      MODE_BASELINES.ringOut,
      env,
      DEFAULT_LIVE_OVERRIDES,
      DEFAULT_DISPLAY_PREFS,
      DEFAULT_DIAGNOSTICS,
      'none',
    )
    expect(derived.ringThresholdDb).toBe(1)
  })

  it('mic calibration profile passes through', () => {
    const derived = deriveDetectorSettings(
      MODE_BASELINES.speech,
      DEFAULT_ENVIRONMENT,
      DEFAULT_LIVE_OVERRIDES,
      DEFAULT_DISPLAY_PREFS,
      DEFAULT_DIAGNOSTICS,
      'ecm8000',
    )
    expect(derived.micCalibrationProfile).toBe('ecm8000')
  })

  it('ringOut mode uses mode-specific autoGainTargetDb when live is at default', () => {
    const derived = deriveDetectorSettings(
      MODE_BASELINES.ringOut,
      DEFAULT_ENVIRONMENT,
      DEFAULT_LIVE_OVERRIDES,
      DEFAULT_DISPLAY_PREFS,
      DEFAULT_DIAGNOSTICS,
      'none',
    )
    // ringOut baseline has defaultAutoGainTargetDb defined
    expect(derived.autoGainTargetDb).toBe(MODE_BASELINES.ringOut.defaultAutoGainTargetDb)
  })
})

// ─── Full matrix: 8 modes × 7 rooms ────────────────────────────────────────

describe('deriveDetectorSettings — full mode × room matrix', () => {
  for (const modeId of ALL_MODES) {
    for (const roomId of ALL_ROOMS) {
      it(`${modeId} × ${roomId} produces valid DetectorSettings`, () => {
        const derived = deriveForModeAndRoom(modeId, roomId)

        // All key fields must be numbers
        expect(typeof derived.feedbackThresholdDb).toBe('number')
        expect(typeof derived.ringThresholdDb).toBe('number')
        expect(typeof derived.minFrequency).toBe('number')
        expect(typeof derived.maxFrequency).toBe('number')
        expect(typeof derived.sustainMs).toBe('number')
        expect(typeof derived.clearMs).toBe('number')
        expect(typeof derived.confidenceThreshold).toBe('number')

        // Thresholds are positive
        expect(derived.feedbackThresholdDb).toBeGreaterThanOrEqual(1)
        expect(derived.ringThresholdDb).toBeGreaterThanOrEqual(1)

        // Frequency range makes sense
        expect(derived.minFrequency).toBeLessThan(derived.maxFrequency)

        // Mode identity preserved
        expect(derived.mode).toBe(modeId)
        expect(derived.roomPreset).toBe(roomId)
      })
    }
  }
})
