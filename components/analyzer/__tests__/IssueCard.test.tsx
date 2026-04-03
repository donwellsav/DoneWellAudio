// @vitest-environment jsdom
/**
 * Smoke tests for IssueCard — advisory card rendering, severity states, badges.
 *
 * Validates that cards render correct frequency, severity pill, badges,
 * and visual escalation for RUNAWAY state.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { IssueCard } from '../IssueCard'
import type { Advisory, SeverityLevel } from '@/types/advisory'

// ── Mock next-themes ─────────────────────────────────────────────────────────
vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'dark' }),
}))

// ── Helpers ──────────────────────────────────────────────────────────────────

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
      shelf: null,
      pitch: { note: 'B', octave: 5, cents: +3 },
    },
    velocityDbPerSec: 0,
    isRunaway: false,
    ...overrides,
  } as Advisory
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('IssueCard', () => {
  it('renders frequency text', () => {
    render(<IssueCard advisory={makeAdvisory()} occurrenceCount={1} />)
    // Frequency may appear in hero + PEQ row — use getAllByText
    const els = screen.getAllByText(/1.*kHz|1.*000.*Hz/i)
    expect(els.length).toBeGreaterThanOrEqual(1)
  })

  it('renders severity icon pill', () => {
    render(<IssueCard advisory={makeAdvisory({ severity: 'GROWING' as SeverityLevel })} occurrenceCount={1} />)
    // Severity is now an icon with title text, not visible text
    expect(screen.getByTitle(/growing/i)).toBeDefined()
  })

  it('renders confidence badge', () => {
    render(<IssueCard advisory={makeAdvisory({ confidence: 0.92 })} occurrenceCount={1} />)
    expect(screen.getByText('92%')).toBeDefined()
  })

  it('renders repeat offender badge when occurrenceCount >= 3', () => {
    render(<IssueCard advisory={makeAdvisory()} occurrenceCount={5} />)
    expect(screen.getByText(/5×/)).toBeDefined()
  })

  it('does not render repeat badge when occurrenceCount < 3', () => {
    const { container } = render(<IssueCard advisory={makeAdvisory()} occurrenceCount={2} />)
    expect(container.textContent).not.toContain('×')
  })

  it('renders RUNAWAY velocity indicator', () => {
    render(<IssueCard advisory={makeAdvisory({
      severity: 'RUNAWAY' as SeverityLevel,
      isRunaway: true,
      velocityDbPerSec: 20,
    })} occurrenceCount={1} />)
    // Velocity row shows dB/s rate
    expect(screen.getByText(/20.*dB\/s/i)).toBeDefined()
  })

  it('applies emergency-glow class for RUNAWAY', () => {
    const { container } = render(<IssueCard advisory={makeAdvisory({
      severity: 'RUNAWAY' as SeverityLevel,
      isRunaway: true,
      velocityDbPerSec: 20,
    })} occurrenceCount={1} />)
    const card = container.firstElementChild as HTMLElement
    expect(card.className).toContain('animate-emergency-glow')
  })

  it('applies wider accent strip for RUNAWAY', () => {
    const { container } = render(<IssueCard advisory={makeAdvisory({
      severity: 'RUNAWAY' as SeverityLevel,
      isRunaway: true,
      velocityDbPerSec: 20,
    })} occurrenceCount={1} />)
    const strip = container.querySelector('.severity-accent-strip-runaway')
    expect(strip).not.toBeNull()
  })

  it('renders PEQ details when showPeqDetails is true', () => {
    render(<IssueCard
      advisory={makeAdvisory()}
      occurrenceCount={1}
      showPeqDetails
    />)
    // Q value appears in both promoted PEQ row and debug details row
    const els = screen.getAllByText(/Q:4\.0/)
    expect(els.length).toBeGreaterThanOrEqual(1)
  })

  it('renders notch SVG when PEQ details shown', () => {
    const { container } = render(<IssueCard
      advisory={makeAdvisory()}
      occurrenceCount={1}
      showPeqDetails
    />)
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
  })

  it('renders false-positive styling when flagged', () => {
    const { container } = render(<IssueCard
      advisory={makeAdvisory()}
      occurrenceCount={1}
      isFalsePositive
    />)
    const card = container.firstElementChild as HTMLElement
    expect(card.className).toContain('opacity-50')
  })

  it('renders resolved card without progress bar', () => {
    const { container } = render(<IssueCard
      advisory={makeAdvisory({ resolved: true })}
      occurrenceCount={1}
    />)
    // Progress bar has aria-hidden — should not exist for resolved
    const bars = container.querySelectorAll('[aria-hidden="true"]')
    // Resolved cards skip the freshness bar
    const progressBar = Array.from(bars).find(el => el.className?.includes?.('h-[3px]'))
    expect(progressBar).toBeUndefined()
  })
})
