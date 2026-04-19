// @vitest-environment jsdom
/**
 * Smoke tests for IssueCard - advisory card rendering, severity states, badges.
 */

import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { IssueCard } from '@/components/analyzer/IssueCard'
import type { Advisory, SeverityLevel } from '@/types/advisory'

vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'dark' }),
}))

function makeAdvisory(overrides: Partial<Advisory> = {}): Advisory {
  return {
    id: 'test-1',
    frequencyBin: 100,
    trueFrequencyHz: 1000,
    trueAmplitudeDb: -20,
    severity: 'POSSIBLE_RING' as SeverityLevel,
    confidence: 0.85,
    timestamp: Date.now() - 5000,
    resolved: false,
    advisory: {
      geq: null,
      peq: { type: 'notch', hz: 1000, q: 4.0, gainDb: -6, bandwidthHz: 250 },
      shelves: [],
      pitch: { note: 'B', octave: 5, cents: 3 },
    },
    velocityDbPerSec: 0,
    isRunaway: false,
    ...overrides,
  } as Advisory
}

describe('IssueCard', () => {
  it('renders frequency text', () => {
    render(<IssueCard advisory={makeAdvisory()} occurrenceCount={1} />)
    const matches = screen.getAllByText(/1.*kHz|1.*000.*Hz/i)
    expect(matches.length).toBeGreaterThanOrEqual(1)
  })

  it('renders severity icon pill', () => {
    render(
      <IssueCard
        advisory={makeAdvisory({ severity: 'GROWING' as SeverityLevel })}
        occurrenceCount={1}
      />,
    )

    expect(screen.getByTitle(/growing/i)).toBeDefined()
  })

  it('renders confidence badge', () => {
    render(<IssueCard advisory={makeAdvisory({ confidence: 0.92 })} occurrenceCount={1} />)
    expect(screen.getByText('92%')).toBeDefined()
  })

  it('renders repeat offender badge and guidance when occurrenceCount >= 3', () => {
    render(<IssueCard advisory={makeAdvisory()} occurrenceCount={5} />)
    expect(screen.getByLabelText(/repeat offender: detected 5 times/i)).toBeDefined()
    expect(screen.getByText(/repeat band/i)).toBeDefined()
  })

  it('does not render repeat badge when occurrenceCount < 3', () => {
    const { container } = render(<IssueCard advisory={makeAdvisory()} occurrenceCount={2} />)
    expect(container.textContent?.toLowerCase()).not.toContain('repeat band')
  })

  it('renders RUNAWAY velocity indicator', () => {
    render(
      <IssueCard
        advisory={makeAdvisory({
          severity: 'RUNAWAY' as SeverityLevel,
          isRunaway: true,
          velocityDbPerSec: 20,
        })}
        occurrenceCount={1}
      />,
    )

    expect(screen.getByText(/20.*dB\/s/i)).toBeDefined()
  })

  it('applies emergency-glow class for RUNAWAY', () => {
    const { container } = render(
      <IssueCard
        advisory={makeAdvisory({
          severity: 'RUNAWAY' as SeverityLevel,
          isRunaway: true,
          velocityDbPerSec: 20,
        })}
        occurrenceCount={1}
      />,
    )

    const card = container.firstElementChild as HTMLElement
    expect(card.className).toContain('animate-emergency-glow')
  })

  it('applies wider accent strip for RUNAWAY', () => {
    const { container } = render(
      <IssueCard
        advisory={makeAdvisory({
          severity: 'RUNAWAY' as SeverityLevel,
          isRunaway: true,
          velocityDbPerSec: 20,
        })}
        occurrenceCount={1}
      />,
    )

    const strip = container.querySelector('.severity-accent-strip-runaway')
    expect(strip).not.toBeNull()
  })

  it('renders PEQ details when showPeqDetails is true', () => {
    render(
      <IssueCard
        advisory={makeAdvisory()}
        occurrenceCount={1}
        showPeqDetails
      />,
    )

    const matches = screen.getAllByText(/Q:4\.0/)
    expect(matches.length).toBeGreaterThanOrEqual(1)
  })

  it('renders notch SVG when PEQ details shown', () => {
    const { container } = render(
      <IssueCard
        advisory={makeAdvisory()}
        occurrenceCount={1}
        showPeqDetails
      />,
    )

    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
  })

  it('renders false-positive styling when flagged', () => {
    const { container } = render(
      <IssueCard
        advisory={makeAdvisory()}
        occurrenceCount={1}
        isFalsePositive
      />,
    )

    const card = container.firstElementChild as HTMLElement
    expect(card.className).toContain('opacity-50')
  })

  it('renders resolved card without progress bar', () => {
    const { container } = render(
      <IssueCard
        advisory={makeAdvisory({ resolved: true })}
        occurrenceCount={1}
      />,
    )

    const bars = container.querySelectorAll('[aria-hidden="true"]')
    const progressBar = Array.from(bars).find((element) =>
      element.className?.includes?.('h-[3px]'),
    )
    expect(progressBar).toBeUndefined()
  })

  it('renders partial apply status when Companion only applies one side', () => {
    render(
      <IssueCard
        advisory={makeAdvisory()}
        occurrenceCount={1}
        companionState={{
          partialApply: {
            at: Date.now(),
            peqApplied: false,
            geqApplied: true,
            failReason: 'PEQ slots full',
          },
        }}
      />,
    )

    expect(screen.getByText('PARTIAL')).toBeDefined()
    expect(
      screen.getByLabelText(/partial apply: peq failed, geq applied; peq slots full/i),
    ).toBeDefined()
  })

  it('renders broader-region guidance when nearby peaks were merged', () => {
    render(
      <IssueCard
        advisory={makeAdvisory({
          clusterCount: 3,
          clusterMinHz: 980,
          clusterMaxHz: 1060,
          advisory: {
            geq: { bandIndex: 15, bandHz: 1000, suggestedDb: -6 },
            peq: {
              type: 'bell',
              hz: 1000,
              q: 4,
              gainDb: -6,
              bandwidthHz: 250,
              qSource: 'cluster',
              strategy: 'broad-region',
              reason: 'Q widened to cover the broader unstable region from 980 Hz - 1.1 kHz.',
            },
            shelves: [],
            pitch: { note: 'B', octave: 5, cents: 3, midi: 83 },
          },
        })}
        occurrenceCount={1}
      />,
    )

    expect(screen.getByText(/merged 3 nearby peaks into one broad region/i)).toBeDefined()
    expect(screen.getByText('Broad Region')).toBeDefined()
    expect(screen.getByText(/q widened to cover the broader unstable region/i)).toBeDefined()
  })

  it('renders pure whistle advisories as warning-only without corrective PEQ copy', () => {
    const baseEqAdvisory = makeAdvisory().advisory

    render(
      <IssueCard
        advisory={makeAdvisory({
          label: 'WHISTLE',
          severity: 'WHISTLE' as SeverityLevel,
          advisory: {
            ...baseEqAdvisory,
            peq: { type: 'bell', hz: 1000, q: 6, gainDb: 0, bandwidthHz: 180 },
            shelves: [],
            pitch: { note: 'B', octave: 5, cents: 3, midi: 83 },
          },
        })}
        occurrenceCount={1}
      />,
    )

    expect(screen.getByText(/warning only · no eq cut/i)).toBeDefined()
    expect(screen.getByText(/whistle alert only/i)).toBeDefined()
    expect(screen.queryByText(/Q:/i)).toBeNull()
  })
})
