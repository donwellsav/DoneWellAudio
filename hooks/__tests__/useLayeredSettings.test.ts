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
import { afterEach, describe, expect, it } from 'vitest'
import { useLayeredSettings } from '@/hooks/useLayeredSettings'
import { OPERATION_MODES } from '@/lib/dsp/constants'
import { MODE_BASELINES } from '@/lib/settings/modeBaselines'
import { DEFAULT_DISPLAY_PREFS } from '@/lib/settings/defaults'
import { ENVIRONMENT_TEMPLATES } from '@/lib/settings/environmentTemplates'

afterEach(() => {
  localStorage.removeItem('dwa-v2-session')
  localStorage.removeItem('dwa-v2-display')
})

// ─── Mount / default state ───────────────────────────────────────────────────

describe('useLayeredSettings — default state', () => {
  it('produces derivedSettings matching speech mode on first mount', () => {
    const { result } = renderHook(() => useLayeredSettings())
    const ds = result.current.derivedSettings

    expect(ds.mode).toBe('speech')
    expect(ds.feedbackThresholdDb).toBe(MODE_BASELINES.speech.feedbackThresholdDb)
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
  })

  it('session starts in speech mode with zero offsets', () => {
    const { result } = renderHook(() => useLayeredSettings())

    expect(result.current.session.modeId).toBe('speech')
    expect(result.current.session.liveOverrides.sensitivityOffsetDb).toBe(0)
    expect(result.current.session.environment.feedbackOffsetDb).toBe(0)
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
    const expected = MODE_BASELINES.speech.feedbackThresholdDb + ENVIRONMENT_TEMPLATES.small.feedbackOffsetDb
    expect(ds.feedbackThresholdDb).toBe(expected)
  })

  it('updateDisplay changes display prefs without affecting DSP', () => {
    const { result } = renderHook(() => useLayeredSettings())
    const thresholdBefore = result.current.derivedSettings.feedbackThresholdDb

    act(() => result.current.updateDisplay({ showAlgorithmScores: true, graphFontSize: 22 }))

    expect(result.current.derivedSettings.showAlgorithmScores).toBe(true)
    expect(result.current.derivedSettings.graphFontSize).toBe(22)
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
    expect(result.current.session.liveOverrides.sensitivityOffsetDb).toBe(0)
    expect(result.current.display.graphFontSize).toBe(DEFAULT_DISPLAY_PREFS.graphFontSize)
  })
})

// ─── Legacy shim ─────────────────────────────────────────────────────────────

describe('useLayeredSettings — applyLegacyPartial shim', () => {
  it('routes mode change and derives all fields from baseline', () => {
    const { result } = renderHook(() => useLayeredSettings())

    act(() => {
      result.current.applyLegacyPartial({
        mode: 'monitors',
        feedbackThresholdDb: OPERATION_MODES.monitors.feedbackThresholdDb,
        fftSize: OPERATION_MODES.monitors.fftSize,
      })
    })

    const ds = result.current.derivedSettings
    expect(ds.mode).toBe('monitors')
    // Threshold comes from baseline, not from the partial's value
    expect(ds.feedbackThresholdDb).toBe(MODE_BASELINES.monitors.feedbackThresholdDb)
  })

  it('routes display-only fields', () => {
    const { result } = renderHook(() => useLayeredSettings())

    act(() => {
      result.current.applyLegacyPartial({
        showAlgorithmScores: true,
        showFreqZones: true,
      })
    })

    expect(result.current.derivedSettings.showAlgorithmScores).toBe(true)
    expect(result.current.derivedSettings.showFreqZones).toBe(true)
  })

  it('routes feedbackThresholdDb as sensitivity offset delta', () => {
    const { result } = renderHook(() => useLayeredSettings())

    // Simulate dragging threshold line from 27 to 32 (speech mode baseline = 27)
    act(() => {
      result.current.applyLegacyPartial({ feedbackThresholdDb: 32 })
    })

    expect(result.current.derivedSettings.feedbackThresholdDb).toBe(32)
    expect(result.current.session.liveOverrides.sensitivityOffsetDb).toBe(5)
  })

  it('routes diagnostics fields', () => {
    const { result } = renderHook(() => useLayeredSettings())

    act(() => {
      result.current.applyLegacyPartial({
        mlEnabled: false,
        algorithmMode: 'custom' as const,
      })
    })

    expect(result.current.derivedSettings.mlEnabled).toBe(false)
    expect(result.current.derivedSettings.algorithmMode).toBe('custom')
  })

  it('routes room preset selection', () => {
    const { result } = renderHook(() => useLayeredSettings())

    act(() => {
      result.current.applyLegacyPartial({ roomPreset: 'arena' })
    })

    expect(result.current.derivedSettings.roomPreset).toBe('arena')
    expect(result.current.session.environment.templateId).toBe('arena')
  })
})

// ─── Persistence ─────────────────────────────────────────────────────────────

describe('useLayeredSettings — persistence', () => {
  it('session state persists to v2 storage and reloads on remount', () => {
    const { result, unmount } = renderHook(() => useLayeredSettings())

    act(() => result.current.setMode('worship'))
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
    unmount()

    // Clear only session storage
    localStorage.removeItem('dwa-v2-session')

    const { result: result2 } = renderHook(() => useLayeredSettings())
    // Session reset to default
    expect(result2.current.derivedSettings.mode).toBe('speech')
    // Display prefs survived
    expect(result2.current.display.graphFontSize).toBe(25)
  })
})
