// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  RingOutDetectedPhase,
  RingOutListeningPhase,
  RingOutSummaryPhase,
} from '@/components/analyzer/RingOutWizardSections'
import type { Advisory } from '@/types/advisory'

function makeAdvisory(overrides: Partial<Advisory> = {}): Advisory {
  return {
    id: 'ring-1',
    trackId: 'track-ring-1',
    timestamp: Date.now(),
    label: 'ACOUSTIC_FEEDBACK',
    severity: 'GROWING',
    confidence: 0.92,
    why: ['test'],
    trueFrequencyHz: 1000,
    trueAmplitudeDb: -16,
    prominenceDb: 12,
    qEstimate: 5,
    bandwidthHz: 180,
    velocityDbPerSec: 1.4,
    stabilityCentsStd: 0,
    harmonicityScore: 0,
    modulationScore: 0,
    advisory: {
      geq: { bandIndex: 15, bandHz: 1000, suggestedDb: -6 },
      peq: { type: 'notch', hz: 1000, q: 5, gainDb: -6 },
      shelves: [],
      pitch: { note: 'B', octave: 5, cents: 0, midi: 83 },
    },
    ...overrides,
  }
}

describe('RingOutWizardSections', () => {
  it('shows pre-show prompts in the listening phase', () => {
    render(
      <RingOutListeningPhase
        isRunning
        notched={[]}
        onExit={vi.fn()}
        onFinish={vi.fn()}
      />,
    )

    expect(screen.getByText(/before you raise gain/i)).toBeDefined()
    expect(screen.getByText(/mute every mic and speaker/i)).toBeDefined()
    expect(screen.getByText(/pre-show baseline/i)).toBeDefined()
  })

  it('warns when a detected issue looks broader than one narrow ring', () => {
    render(
      <RingOutDetectedPhase
        advisory={makeAdvisory({ clusterCount: 3 })}
        isDark
        notched={[
          {
            frequencyHz: 990,
            pitch: 'B5',
            gainDb: -4,
            q: 4,
            severity: 'GROWING',
            timestamp: 0,
          },
        ]}
        onExit={vi.fn()}
        onSkip={vi.fn()}
        onNext={vi.fn()}
        roomModes={null}
      />,
    )

    expect(screen.getByText(/merged 3 nearby peaks/i)).toBeDefined()
    expect(screen.getByText(/apply this cut if the ring is stable and narrow/i)).toBeDefined()
  })

  it('shows pattern warnings and live/show guidance in the summary phase', () => {
    render(
      <RingOutSummaryPhase
        advisories={[makeAdvisory()]}
        companionEnabled={false}
        notched={[
          {
            frequencyHz: 1000,
            pitch: 'B5',
            gainDb: -6,
            q: 5,
            severity: 'GROWING',
            timestamp: 0,
          },
        ]}
        patternWarnings={[
          '2 accepted cuts clustered around 1.0 kHz. Recheck placement, reflections, or broad EQ before stacking more narrow notches.',
        ]}
        onDone={vi.fn()}
        onExport={vi.fn()}
        onSendAll={vi.fn()}
      />,
    )

    expect(screen.getByText(/pattern warnings/i)).toBeDefined()
    expect(screen.getByText(/clustered around 1\.0 kHz/i)).toBeDefined()
    expect(screen.getByText(/during the show/i)).toBeDefined()
  })
})
