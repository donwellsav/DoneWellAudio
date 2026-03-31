// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useFaderLink, _testUtils } from '@/hooks/useFaderLink'

const { gainToVisual, visualToGain, sensToVisual, visualToSens } = _testUtils

// ── Conversion utilities ─────────────────────────────────────────────────────

describe('visual-position conversions', () => {
  it('gainToVisual maps -40 → 0, 0 → 0.5, +40 → 1', () => {
    expect(gainToVisual(-40)).toBeCloseTo(0)
    expect(gainToVisual(0)).toBeCloseTo(0.5)
    expect(gainToVisual(40)).toBeCloseTo(1)
  })

  it('visualToGain is the inverse of gainToVisual', () => {
    for (const db of [-40, -20, 0, 20, 40]) {
      expect(visualToGain(gainToVisual(db))).toBeCloseTo(db)
    }
  })

  it('sensToVisual maps 50 → 0 (bottom), 2 → 1 (top) — inverted', () => {
    expect(sensToVisual(50)).toBeCloseTo(0)
    expect(sensToVisual(2)).toBeCloseTo(1)
    expect(sensToVisual(25)).toBeCloseTo((50 - 25) / 48) // ~0.5208
  })

  it('visualToSens is the inverse of sensToVisual', () => {
    for (const db of [2, 10, 25, 40, 50]) {
      expect(visualToSens(sensToVisual(db))).toBeCloseTo(db)
    }
  })
})

// ── Hook behavior ────────────────────────────────────────────────────────────

function setup(overrides: Partial<Parameters<typeof useFaderLink>[0]> = {}) {
  const onGainChange = vi.fn()
  const onSensitivityChange = vi.fn()
  const onAutoGainToggle = vi.fn()

  const defaultOpts = {
    linkMode: 'unlinked' as const,
    linkRatio: 1.0,
    centerGainDb: 0,
    centerSensDb: 25,
    gainDb: 0,
    sensitivityDb: 25,
    onGainChange,
    onSensitivityChange,
    onAutoGainToggle,
    ...overrides,
  }

  const result = renderHook(() => useFaderLink(defaultOpts))

  return { ...result, onGainChange, onSensitivityChange, onAutoGainToggle }
}

describe('useFaderLink', () => {
  describe('unlinked mode', () => {
    it('gain drag only calls onGainChange', () => {
      const { result, onGainChange, onSensitivityChange } = setup()

      act(() => result.current.handleGainDrag(10))

      expect(onGainChange).toHaveBeenCalledWith(10)
      expect(onSensitivityChange).not.toHaveBeenCalled()
    })

    it('sensitivity drag only calls onSensitivityChange', () => {
      const { result, onGainChange, onSensitivityChange } = setup()

      act(() => result.current.handleSensDrag(15))

      expect(onSensitivityChange).toHaveBeenCalledWith(15)
      expect(onGainChange).not.toHaveBeenCalled()
    })
  })

  describe('linked mode', () => {
    it('gain drag moves sensitivity in same visual direction', () => {
      const { result, onGainChange, onSensitivityChange } = setup({
        linkMode: 'linked',
        linkRatio: 1.0,
        centerGainDb: 0,
        centerSensDb: 25,
      })

      // Drag gain up by 10dB from center (0 → 10)
      act(() => result.current.handleGainDrag(10))

      expect(onGainChange).toHaveBeenCalledWith(10)
      // Gain visual delta = (10 - (-40))/80 - (0 - (-40))/80 = 0.125
      // Sens visual = sensToVisual(25) + 0.125 * 1.0
      // sensToVisual(25) = (50-25)/48 = 0.5208...
      // new sens visual = 0.6458...
      // new sens dB = 50 - 0.6458 * 48 = 19.0
      expect(onSensitivityChange).toHaveBeenCalledWith(19)
    })

    it('sensitivity drag moves gain in same visual direction', () => {
      const { result, onGainChange, onSensitivityChange } = setup({
        linkMode: 'linked',
        linkRatio: 1.0,
        centerGainDb: 0,
        centerSensDb: 25,
      })

      // Drag sensitivity to 15 (more sensitive = up = lower dB)
      act(() => result.current.handleSensDrag(15))

      expect(onSensitivityChange).toHaveBeenCalledWith(15)
      // Sens visual delta = sensToVisual(15) - sensToVisual(25)
      //   = (50-15)/48 - (50-25)/48 = 35/48 - 25/48 = 10/48 = 0.2083
      // Gain visual delta = 0.2083 / 1.0 = 0.2083
      // new gain visual = 0.5 + 0.2083 = 0.7083
      // new gain dB = -40 + 0.7083 * 80 = 16.67 → rounded 17
      expect(onGainChange).toHaveBeenCalledWith(17)
    })

    it('disables auto-gain when sensitivity drag moves gain', () => {
      const { result, onAutoGainToggle } = setup({
        linkMode: 'linked',
      })

      act(() => result.current.handleSensDrag(15))

      expect(onAutoGainToggle).toHaveBeenCalledWith(false)
    })
  })

  describe('linked-reversed mode', () => {
    it('gain drag up moves sensitivity down (opposite visual direction)', () => {
      const { result, onGainChange, onSensitivityChange } = setup({
        linkMode: 'linked-reversed',
        linkRatio: 1.0,
        centerGainDb: 0,
        centerSensDb: 25,
      })

      // Drag gain up by 10dB
      act(() => result.current.handleGainDrag(10))

      expect(onGainChange).toHaveBeenCalledWith(10)
      // gain visual delta = 0.125 (positive = up)
      // reversed: sensVisualDelta = -0.125
      // new sens visual = 0.5208 - 0.125 = 0.3958
      // new sens dB = 50 - 0.3958 * 48 = 31.0
      expect(onSensitivityChange).toHaveBeenCalledWith(31)
    })
  })

  describe('ratio', () => {
    it('ratio 2.0 makes sensitivity move twice as fast', () => {
      const { result, onSensitivityChange } = setup({
        linkMode: 'linked',
        linkRatio: 2.0,
        centerGainDb: 0,
        centerSensDb: 25,
      })

      act(() => result.current.handleGainDrag(10))

      // gain visual delta = 0.125
      // sens visual delta = 0.125 * 2.0 = 0.25
      // new sens visual = 0.5208 + 0.25 = 0.7708
      // new sens dB = 50 - 0.7708 * 48 = 13.0
      expect(onSensitivityChange).toHaveBeenCalledWith(13)
    })

    it('ratio 0.5 makes sensitivity move half as fast', () => {
      const { result, onSensitivityChange } = setup({
        linkMode: 'linked',
        linkRatio: 0.5,
        centerGainDb: 0,
        centerSensDb: 25,
      })

      act(() => result.current.handleGainDrag(10))

      // gain visual delta = 0.125
      // sens visual delta = 0.125 * 0.5 = 0.0625
      // new sens visual = 0.5208 + 0.0625 = 0.5833
      // new sens dB = 50 - 0.5833 * 48 = 22.0
      expect(onSensitivityChange).toHaveBeenCalledWith(22)
    })
  })

  describe('clamping at limits', () => {
    it('follower clamps at sensitivity max (2dB) but leader continues', () => {
      const { result, onGainChange, onSensitivityChange } = setup({
        linkMode: 'linked',
        linkRatio: 1.0,
        centerGainDb: 0,
        centerSensDb: 10, // near top already
      })

      // Drag gain way up — sens should clamp at 2
      act(() => result.current.handleGainDrag(40))

      expect(onGainChange).toHaveBeenCalledWith(40)
      expect(onSensitivityChange).toHaveBeenCalledWith(2)
    })

    it('follower clamps at sensitivity min (50dB) but leader continues', () => {
      const { result, onGainChange, onSensitivityChange } = setup({
        linkMode: 'linked',
        linkRatio: 1.0,
        centerGainDb: 0,
        centerSensDb: 40, // near bottom already
      })

      // Drag gain way down — sens should clamp at 50
      act(() => result.current.handleGainDrag(-40))

      expect(onGainChange).toHaveBeenCalledWith(-40)
      expect(onSensitivityChange).toHaveBeenCalledWith(50)
    })

    it('gain clamps at -40 when sensitivity drags far', () => {
      const { result, onGainChange } = setup({
        linkMode: 'linked',
        linkRatio: 1.0,
        centerGainDb: -30,
        centerSensDb: 25,
      })

      // Drag sensitivity far down (less sensitive = higher dB)
      act(() => result.current.handleSensDrag(50))

      expect(onGainChange).toHaveBeenCalledWith(-40)
    })
  })

  describe('goHome', () => {
    it('snaps both faders to center positions', () => {
      const { result, onGainChange, onSensitivityChange } = setup({
        centerGainDb: 5,
        centerSensDb: 20,
      })

      act(() => result.current.goHome())

      expect(onGainChange).toHaveBeenCalledWith(5)
      expect(onSensitivityChange).toHaveBeenCalledWith(20)
    })

    it('disables auto-gain', () => {
      const { result, onAutoGainToggle } = setup()

      act(() => result.current.goHome())

      expect(onAutoGainToggle).toHaveBeenCalledWith(false)
    })
  })
})
