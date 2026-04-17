// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DEFAULT_SETTINGS } from '@/lib/dsp/constants'
import { MeasurementInterpretationSection } from '@/components/analyzer/settings/room/MeasurementInterpretationSection'

vi.mock('@/contexts/EngineContext', () => ({
  useEngine: () => ({
    roomEstimate: {
      dimensions: { length: 8.2, width: 5.4, height: 2.7 },
      confidence: 0.62,
      seriesFound: 2,
      residualError: 4.1,
      detectedSeries: [],
      totalPeaksAnalyzed: 6,
    },
  }),
}))

describe('MeasurementInterpretationSection', () => {
  it('separates narrow feedback, speech reflections, room resonance, and broad tonal balance', () => {
    render(
      <MeasurementInterpretationSection
        settings={{
          ...DEFAULT_SETTINGS,
          showTooltips: false,
          roomPreset: 'medium',
          roomRT60: 1.0,
          roomVolume: 400,
          spectrumSmoothingMode: 'perceptual',
        }}
      />,
    )

    expect(screen.getByText(/Narrow Feedback Risk/i)).toBeDefined()
    expect(screen.getByText(/Reflection-Rich Speech/i)).toBeDefined()
    expect(screen.getByText(/Room Resonance/i)).toBeDefined()
    expect(screen.getByText(/Perceptual Tonal Balance/i)).toBeDefined()
    expect(screen.getByText(/This app does not yet separate direct, early, and late arrivals/i)).toBeDefined()
    expect(screen.getByText(/Current spectrum view: Perceptual 1\/3-octave smoothing/i)).toBeDefined()
    expect(screen.getByText(/This changes the graph only; it does not change detector sensitivity/i)).toBeDefined()
    expect(screen.getByText(/Measured estimate on screen: 2\/3 axes, 62% confidence/i)).toBeDefined()
    expect(screen.getAllByText(/about 100 Hz in this room/i)).toHaveLength(2)
  })
})
