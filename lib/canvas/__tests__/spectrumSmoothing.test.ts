import { describe, expect, it } from 'vitest'
import {
  smoothSpectrumForDisplay,
  usesPerceptualSpectrumView,
} from '@/lib/canvas/drawing/spectrumSmoothing'

describe('spectrumSmoothing', () => {
  it('reports perceptual mode correctly', () => {
    expect(usesPerceptualSpectrumView('raw')).toBe(false)
    expect(usesPerceptualSpectrumView('perceptual')).toBe(true)
  })

  it('does not mutate the input spectrum', () => {
    const input = new Float32Array(256).fill(-90)
    input[64] = -18
    const before = Array.from(input)

    smoothSpectrumForDisplay(input, 48000, 512, { current: null })

    expect(Array.from(input)).toEqual(before)
  })

  it('spreads a narrow isolated peak into neighboring bins', () => {
    const input = new Float32Array(256).fill(-100)
    input[96] = -20

    const output = smoothSpectrumForDisplay(input, 48000, 512, { current: null })

    expect(output[96]).toBeLessThan(-20)
    expect(output[95]).toBeGreaterThan(-100)
    expect(output[97]).toBeGreaterThan(-100)
  })

  it('keeps an already-flat spectrum effectively flat', () => {
    const input = new Float32Array(256).fill(-48)

    const output = smoothSpectrumForDisplay(input, 48000, 512, { current: null })

    expect(output[32]).toBeCloseTo(-48, 3)
    expect(output[128]).toBeCloseTo(-48, 3)
    expect(output[224]).toBeCloseTo(-48, 3)
  })
})
