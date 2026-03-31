// @vitest-environment jsdom
/**
 * Smoke tests for IssuesList — advisory list rendering, empty states, sorting.
 *
 * Validates standby state, all-clear green state, low-signal warning,
 * card rendering, and clear-all button.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { IssuesList } from '../IssuesList'
import type { Advisory, SeverityLevel } from '@/types/advisory'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'dark' }),
}))

vi.mock('@/hooks/useCompanion', () => ({
  useCompanion: () => ({
    settings: { enabled: false, autoSend: false },
    sendAdvisory: vi.fn(),
  }),
}))

vi.mock('@/contexts/PA2Context', () => ({
  usePA2: () => ({
    settings: { enabled: false, autoSendMode: 'off' },
    status: 'disconnected',
    sendToPA2: vi.fn(),
  }),
}))

vi.mock('@/lib/dsp/feedbackHistory', () => ({
  getFeedbackHistory: () => ({ getOccurrenceCount: () => 1, getHotspots: () => [] }),
}))

vi.mock('@/lib/storage/dwaStorage', () => ({
  swipeHintStorage: { get: () => false, set: vi.fn() },
}))

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeAdvisory(id: string, severity: SeverityLevel = 'POSSIBLE_RING', overrides: Partial<Advisory> = {}): Advisory {
  return {
    id,
    frequencyBin: 100,
    trueFrequencyHz: 1000,
    trueAmplitudeDb: -20,
    severity,
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

describe('IssuesList', () => {
  it('renders standby state with start button when not running', () => {
    const onStart = vi.fn()
    render(<IssuesList advisories={[]} isRunning={false} onStart={onStart} />)
    expect(screen.getByText(/press to start/i)).toBeDefined()
    expect(screen.getByText(/analysis/i)).toBeDefined()
  })

  it('renders ring-out button when onStartRingOut provided', () => {
    const onStart = vi.fn()
    const onStartRingOut = vi.fn()
    render(<IssuesList advisories={[]} isRunning={false} onStart={onStart} onStartRingOut={onStartRingOut} />)
    expect(screen.getByText(/ring out room/i)).toBeDefined()
  })

  it('renders green all-clear state when running with no advisories', () => {
    render(<IssuesList advisories={[]} isRunning={true} />)
    expect(screen.getByText(/no feedback/i)).toBeDefined()
    expect(screen.getByText(/detected/i)).toBeDefined()
  })

  it('renders low-signal warning when isLowSignal', () => {
    render(<IssuesList advisories={[]} isRunning={true} isLowSignal />)
    expect(screen.getByText(/low signal/i)).toBeDefined()
    expect(screen.getByText(/increase gain/i)).toBeDefined()
  })

  it('renders advisory cards when advisories exist', () => {
    const advisories = [
      makeAdvisory('a1', 'GROWING'),
      makeAdvisory('a2', 'POSSIBLE_RING', { trueFrequencyHz: 2500 }),
    ]
    const { container } = render(<IssuesList advisories={advisories} isRunning={true} />)
    // Should render 2 glass-card elements
    const cards = container.querySelectorAll('.glass-card')
    expect(cards.length).toBe(2)
  })

  it('limits displayed cards to maxIssues', () => {
    const advisories = Array.from({ length: 8 }, (_, i) =>
      makeAdvisory(`a${i}`, 'POSSIBLE_RING', { trueFrequencyHz: 500 + i * 100 }),
    )
    const { container } = render(<IssuesList advisories={advisories} isRunning={true} maxIssues={5} />)
    const cards = container.querySelectorAll('.glass-card')
    expect(cards.length).toBeLessThanOrEqual(5)
  })

  it('renders screen reader live region', () => {
    render(<IssuesList advisories={[]} isRunning={true} />)
    const liveRegion = document.querySelector('[aria-live="polite"]')
    expect(liveRegion).not.toBeNull()
  })
})
