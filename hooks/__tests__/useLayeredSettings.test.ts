// @vitest-environment jsdom
/**
 * Integration tests for useLayeredSettings in a React render context.
 *
 * Proves that:
 * 1. The hook produces valid DetectorSettings on mount
 * 2. Semantic actions produce correct derived output
 * 3. The legacy shim routes old-style partials correctly
 * 4. Mode changes reset live overrides as expected
 * 5. Persistence round-trips through v2 storage
 */

import { renderHook, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useLayeredSettings } from '@/hooks/useLayeredSettings'
import { MODE_BASELINES } from '@/lib/settings/modeBaselines'
import {
  DEFAULT_DISPLAY_PREFS,
  FRESH_START_FEEDBACK_THRESHOLD_DB,
  FRESH_START_SENSITIVITY_OFFSET_DB,
} from '@/lib/settings/defaults'
import { ENVIRONMENT_TEMPLATES } from '@/lib/settings/environmentTemplates'

afterEach(() => {
  localStorage.removeItem('dwa-v2-session')
  localStorage.removeItem('dwa-v2-display')
})

// ─── Mount / default state ───────────────────────────────────────────────────

describe('useLayeredSettings — default state', () => {
  it('produces the fresh-start Speech snapshot on first mount', () => {
    const { result } = renderHook(() => useLayeredSettings())
    const ds = result.current.derivedSettings

    expect(ds.mode).toBe('speech')
    expect(ds.feedbackThresholdDb).toBe(FRESH_START_FEEDBACK_THRESHOLD_DB)
    expect(ds.fftSize).toBe(MODE_BASELINES.speech.fftSize)
    expect(ds.minFrequency).toBe(MODE_BASELINES.speech.minFrequency)
    expect(ds.maxFrequency).toBe(MODE_BASELINES.speech.maxFrequency)
    expect(ds.sustainMs).toBe(MODE_BASELINES.speech.sustainMs)
    expect(ds.clearMs).toBe(MODE_BASELINES.speech.clearMs)
  })

  it('display prefs match defaults', () => {
    const { result } = renderHook(() => useLayeredSettings())
    const ds = result.current.derivedSettings

    expect(ds.showAlgorithmScores).toBe(DEFAULT_DISPLAY_PREFS.showAlgorithmScores)
    expect(ds.graphFontSize).toBe(DEFAULT_DISPLAY_PREFS.graphFontSize)
    expect(ds.canvasTargetFps).toBe(DEFAULT_DISPLAY_PREFS.canvasTargetFps)
    expect(ds.spectrumSmoothingMode).toBe(DEFAULT_DISPLAY_PREFS.spectrumSmoothingMode)
  })

  it('session starts in speech mode with the startup-only sensitivity bump', () => {
    const { result } = renderHook(() => useLayeredSettings())

    expect(result.current.session.modeId).toBe('speech')
    expect(result.current.session.liveOverrides.sensitivityOffsetDb).toBe(
      FRESH_START_SENSITIVITY_OFFSET_DB,
    )
    expect(result.current.session.environment.feedbackOffsetDb).toBe(0)
  })

  it('does not inject the fresh-start bump when explicit initial settings are provided', () => {
    const { result } = renderHook(() => useLayeredSettings({ mode: 'speech' }))

    expect(result.current.derivedSettings.feedbackThresholdDb).toBe(
      MODE_BASELINES.speech.feedbackThresholdDb,
    )
    expect(result.current.session.liveOverrides.sensitivityOffsetDb).toBe(0)
  })

  it('applies initial detector overrides on mount', () => {
    const { result } = renderHook(() => useLayeredSettings({
      mode: 'monitors',
      feedbackThresholdDb: 18,
      minFrequency: 250,
      maxDisplayedIssues: 5,
      showAlgorithmScores: true,
      roomPreset: 'small',
      mainsHumFundamental: 60,
    }))

    expect(result.current.derivedSettings.mode).toBe('monitors')
    expect(result.current.derivedSettings.feedbackThresholdDb).toBe(18)
    expect(result.current.derivedSettings.minFrequency).toBe(250)
    expect(result.current.display.maxDisplayedIssues).toBe(5)
    expect(result.current.display.showAlgorithmScores).toBe(true)
    expect(result.current.session.environment.templateId).toBe('small')
    expect(result.current.session.environment.mainsHumFundamental).toBe(60)
  })
})

// ─── Semantic actions ────────────────────────────────────────────────────────

describe('useLayeredSettings — semantic actions', () => {
  it('setMode changes derived mode and thresholds', () => {
    const { result } = renderHook(() => useLayeredSettings())

    act(() => result.current.setMode('liveMusic'))

    const ds = result.current.derivedSettings
    expect(ds.mode).toBe('liveMusic')
    expect(ds.feedbackThresholdDb).toBe(MODE_BASELINES.liveMusic.feedbackThresholdDb)
    expect(ds.fftSize).toBe(MODE_BASELINES.liveMusic.fftSize)
    expect(ds.minFrequency).toBe(MODE_BASELINES.liveMusic.minFrequency)
  })

  it('setMode resets sensitivity offset but preserves gain', () => {
    const { result } = renderHook(() => useLayeredSettings())

    act(() => {
      result.current.setSensitivityOffset(5)
      result.current.setInputGain(6)
    })

    act(() => result.current.setMode('monitors'))

    // Sensitivity offset reset
    expect(result.current.session.liveOverrides.sensitivityOffsetDb).toBe(0)
    // Gain preserved
    expect(result.current.session.liveOverrides.inputGainDb).toBe(6)
  })

  it('setSensitivityOffset shifts threshold', () => {
    const { result } = renderHook(() => useLayeredSettings())

    act(() => result.current.setSensitivityOffset(5))

    expect(result.current.derivedSettings.feedbackThresholdDb).toBe(
      MODE_BASELINES.speech.feedbackThresholdDb + 5,
    )
  })

  it('setEnvironment with template applies relative offsets', () => {
    const { result } = renderHook(() => useLayeredSettings())

    act(() => result.current.setEnvironment({ templateId: 'small' }))

    const ds = result.current.derivedSettings
    const expected = (
      MODE_BASELINES.speech.feedbackThresholdDb +
      FRESH_START_SENSITIVITY_OFFSET_DB +
      ENVIRONMENT_TEMPLATES.small.feedbackOffsetDb
    )
    expect(ds.feedbackThresholdDb).toBe(expected)
  })

  it('updateDisplay changes display prefs without affecting DSP', () => {
    const { result } = renderHook(() => useLayeredSettings())
    const thresholdBefore = result.current.derivedSettings.feedbackThresholdDb

    act(() => result.current.updateDisplay({
      showAlgorithmScores: true,
      graphFontSize: 22,
      spectrumSmoothingMode: 'perceptual',
    }))

    expect(result.current.derivedSettings.showAlgorithmScores).toBe(true)
    expect(result.current.derivedSettings.graphFontSize).toBe(22)
    expect(result.current.derivedSettings.spectrumSmoothingMode).toBe('perceptual')
    expect(result.current.derivedSettings.feedbackThresholdDb).toBe(thresholdBefore)
  })

  it('resetAll restores all defaults', () => {
    const { result } = renderHook(() => useLayeredSettings())

    act(() => {
      result.current.setMode('liveMusic')
      result.current.setSensitivityOffset(10)
      result.current.updateDisplay({ graphFontSize: 30 })
    })

    act(() => result.current.resetAll())

    expect(result.current.derivedSettings.mode).toBe('speech')
    expect(result.current.session.liveOverrides.sensitivityOffsetDb).toBe(
      FRESH_START_SENSITIVITY_OFFSET_DB,
    )
    expect(result.current.derivedSettings.feedbackThresholdDb).toBe(
      FRESH_START_FEEDBACK_THRESHOLD_DB,
    )
    expect(result.current.display.graphFontSize).toBe(DEFAULT_DISPLAY_PREFS.graphFontSize)
  })
})

// ─── Regression tests (GPT cross-review findings) ───────────────────────────

describe('useLayeredSettings — regression', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('resetAll cancels in-flight debounced persistence (P1 fix)', () => {
    const { result } = renderHook(() => useLayeredSettings())

    act(() => result.current.setMode('liveMusic'))
    act(() => result.current.resetAll())
    act(() => { vi.advanceTimersByTime(200) })

    const stored = JSON.parse(localStorage.getItem('dwa-v2-session') ?? '{}')
    expect(stored.modeId).toBe('speech')
    expect(stored.liveOverrides?.sensitivityOffsetDb).toBe(FRESH_START_SENSITIVITY_OFFSET_DB)
    expect(result.current.derivedSettings.mode).toBe('speech')
    expect(result.current.derivedSettings.feedbackThresholdDb).toBe(FRESH_START_FEEDBACK_THRESHOLD_DB)
  })

  it('setEnvironment with displayUnit triggers recomputation (P2 fix)', () => {
    const { result } = renderHook(() => useLayeredSettings())

    act(() => result.current.setEnvironment({
      templateId: 'custom',
      provenance: 'manual',
      dimensionsM: { length: 10, width: 8, height: 3 },
      treatment: 'typical',
      displayUnit: 'meters',
    }))

    act(() => result.current.setEnvironment({ displayUnit: 'feet' }))

    expect(result.current.session.environment.displayUnit).toBe('feet')
    expect(result.current.derivedSettings.roomRT60).toBeGreaterThan(0)
    expect(result.current.derivedSettings.roomVolume).toBeGreaterThan(0)
  })
})

// ─── Persistence ─────────────────────────────────────────────────────────────

describe('useLayeredSettings — persistence', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('session state persists to v2 storage and reloads on remount', () => {
    const { result, unmount } = renderHook(() => useLayeredSettings())

    act(() => result.current.setMode('worship'))
    // Flush debounced persistence
    act(() => { vi.advanceTimersByTime(200) })
    unmount()

    const { result: result2 } = renderHook(() => useLayeredSettings())
    expect(result2.current.derivedSettings.mode).toBe('worship')
  })

  it('display prefs persist separately from session', () => {
    const { result, unmount } = renderHook(() => useLayeredSettings())

    act(() => {
      result.current.setMode('liveMusic')
      result.current.updateDisplay({ graphFontSize: 25 })
    })
    // Flush debounced persistence
    act(() => { vi.advanceTimersByTime(200) })
    unmount()

    // Clear only session storage
    localStorage.removeItem('dwa-v2-session')

    const { result: result2 } = renderHook(() => useLayeredSettings())
    // Session reset to default
    expect(result2.current.derivedSettings.mode).toBe('speech')
    expect(result2.current.derivedSettings.feedbackThresholdDb).toBe(FRESH_START_FEEDBACK_THRESHOLD_DB)
    // Display prefs survived
    expect(result2.current.display.graphFontSize).toBe(25)
  })
})

// ─── Storage backfill ─────────────────────────────────────────────────────────

describe('useLayeredSettings — storage backfill', () => {
  it('backfills missing display pref fields from defaults', () => {
    // Simulate an existing user who saved display prefs before showRoomModeLines existed
    const oldDisplayPrefs = {
      maxDisplayedIssues: 12,
      graphFontSize: 18,
      showTooltips: false,
      showAlgorithmScores: true,
      showPeqDetails: false,
      showFreqZones: true,
      spectrumWarmMode: false,
      rtaDbMin: -90,
      rtaDbMax: -5,
      spectrumLineWidth: 2,
      showThresholdLine: true,
      canvasTargetFps: 30,
      faderMode: 'gain',
      faderLinkMode: 'unlinked',
      faderLinkRatio: 1.0,
      faderLinkCenterGainDb: 0,
      faderLinkCenterSensDb: 25,
      swipeLabeling: false,
      // NOTE: showRoomModeLines is intentionally missing
    }
    localStorage.setItem('dwa-v2-display', JSON.stringify(oldDisplayPrefs))

    const { result } = renderHook(() => useLayeredSettings())

    // Stored values should survive
    expect(result.current.display.maxDisplayedIssues).toBe(12)
    expect(result.current.display.graphFontSize).toBe(18)
    expect(result.current.display.showTooltips).toBe(false)
    expect(result.current.display.showFreqZones).toBe(true)

    // New field should backfill from DEFAULT_DISPLAY_PREFS
    expect(result.current.display.showRoomModeLines).toBe(DEFAULT_DISPLAY_PREFS.showRoomModeLines)
    expect(result.current.display.spectrumSmoothingMode).toBe(DEFAULT_DISPLAY_PREFS.spectrumSmoothingMode)
  })

  it('backfills missing nested session fields from defaults', () => {
    // Simulate a session saved before environment gained mainsHumEnabled
    const oldSession = {
      modeId: 'worship',
      environment: {
        templateId: 'medium',
        treatment: 'typical',
        feedbackOffsetDb: 5,
        ringOffsetDb: 3,
        provenance: 'template',
        roomRT60: 1.5,
        roomVolume: 300,
        displayUnit: 'meters',
        // NOTE: mainsHumEnabled and mainsHumFundamental intentionally missing
      },
      liveOverrides: {
        sensitivityOffsetDb: 2,
        inputGainDb: 0,
        autoGainEnabled: false,
        autoGainTargetDb: -18,
        focusRange: { kind: 'mode-default' },
        eqStyle: 'mode-default',
      },
      diagnostics: {
        mlEnabled: true,
        algorithmMode: 'auto',
        enabledAlgorithms: ['msd', 'phase', 'spectral', 'comb', 'ihr', 'ptmr', 'ml'],
        thresholdMode: 'hybrid',
        noiseFloorAttackMs: 200,
        noiseFloorReleaseMs: 1000,
        maxTracks: 64,
        trackTimeoutMs: 1000,
        harmonicToleranceCents: 200,
        peakMergeCents: 100,
      },
      micCalibrationProfile: 'none',
    }
    localStorage.setItem('dwa-v2-session', JSON.stringify(oldSession))

    const { result } = renderHook(() => useLayeredSettings())

    // Stored values should survive
    expect(result.current.session.modeId).toBe('worship')
    expect(result.current.session.environment.templateId).toBe('medium')
    expect(result.current.session.environment.feedbackOffsetDb).toBe(5)
    expect(result.current.session.liveOverrides.sensitivityOffsetDb).toBe(2)

    // New nested fields should backfill from defaults
    expect(result.current.session.environment.mainsHumEnabled).toBe(true)
    expect(result.current.session.environment.mainsHumFundamental).toBe('auto')
  })
})
