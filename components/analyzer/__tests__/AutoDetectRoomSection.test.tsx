// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AutoDetectRoomSection } from '@/components/analyzer/settings/room/AutoDetectRoomSection'

vi.mock('@/contexts/EngineContext', () => ({
  useEngine: () => ({
    isRunning: false,
    roomEstimate: null,
    roomMeasuring: false,
    roomProgress: { elapsedMs: 0, stablePeaks: 0 },
    startRoomMeasurement: vi.fn(),
    stopRoomMeasurement: vi.fn(),
    clearRoomEstimate: vi.fn(),
  }),
}))

describe('AutoDetectRoomSection', () => {
  it('explains that room auto-detect is a resonance-derived estimate', () => {
    render(
      <AutoDetectRoomSection
        showTooltips={false}
        unit="feet"
        onApplyEstimate={vi.fn()}
      />,
    )

    expect(screen.getByText(/resonance-derived estimate only/i)).toBeDefined()
    expect(screen.getByText(/low-frequency sizing clue/i)).toBeDefined()
    expect(screen.getByText(/detected low-frequency resonances/i)).toBeDefined()
    expect(screen.getByText(/low-frequency resonance, modal spacing, and rough room-size clues/i)).toBeDefined()
    expect(screen.getByText(/early reflections, speech smear, or narrow high-frequency feedback calls/i)).toBeDefined()
  })
})
