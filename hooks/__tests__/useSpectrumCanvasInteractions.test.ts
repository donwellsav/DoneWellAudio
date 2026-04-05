import { describe, expect, it } from 'vitest'
import {
  adjustRangeWithKeyboard,
  getHoverCanvasPoint,
  getThresholdDistance,
} from '@/hooks/useSpectrumCanvasInteractions'

describe('useSpectrumCanvasInteractions helpers', () => {
  it('adjusts the low frequency handle with arrow keys', () => {
    expect(adjustRangeWithKeyboard({ min: 200, max: 1000 }, 'ArrowRight', false)).toEqual({
      min: 250,
      max: 1000,
    })
  })

  it('adjusts the high frequency handle with shift plus arrow keys', () => {
    expect(adjustRangeWithKeyboard({ min: 200, max: 1000 }, 'ArrowLeft', true)).toEqual({
      min: 200,
      max: 950,
    })
  })

  it('returns null for non-range keys', () => {
    expect(adjustRangeWithKeyboard({ min: 200, max: 1000 }, 'Enter', false)).toBeNull()
  })

  it('returns a hover point only when the cursor is inside the plot area', () => {
    expect(getHoverCanvasPoint(140, 90, { left: 100, top: 50 }, {
      left: 20,
      top: 10,
      plotWidth: 200,
      plotHeight: 100,
    })).toEqual({ x: 20, y: 30 })

    expect(getHoverCanvasPoint(80, 90, { left: 100, top: 50 }, {
      left: 20,
      top: 10,
      plotWidth: 200,
      plotHeight: 100,
    })).toBeNull()
  })

  it('measures distance from the threshold line in canvas coordinates', () => {
    expect(getThresholdDistance(100, { left: 0, top: 40 }, 10, 45)).toBe(5)
    expect(getThresholdDistance(100, { left: 0, top: 40 }, 10, null)).toBe(Infinity)
  })
})
