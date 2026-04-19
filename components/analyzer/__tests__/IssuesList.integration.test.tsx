// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Advisory } from '@/types/advisory'
import type * as DwaStorageModule from '@/lib/storage/dwaStorage'

vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'dark' }),
}))

vi.mock('@/contexts/SettingsContext', () => ({
  useSettings: () => ({
    settings: { mode: 'speech', fftSize: 8192, minFrequency: 200, maxFrequency: 8000 },
  }),
}))

vi.mock('@/contexts/AdvisoryContext', () => ({
  useAdvisories: () => ({ companionState: new Map() }),
  useAdvisoryData: () => ({ companionState: new Map() }),
}))

vi.mock('@/lib/dsp/feedbackHistory', () => ({
  getFeedbackHistory: () => ({
    getOccurrenceCount: () => 1,
    getHotspots: () => [],
    shouldRetryCompanionCut: () => null,
    markCompanionApplied: () => {},
    reapCompanionCuts: () => {},
  }),
}))

vi.mock('@/lib/storage/dwaStorage', async () => {
  const actual = await vi.importActual('@/lib/storage/dwaStorage') as typeof DwaStorageModule
  return {
    ...actual,
    swipeHintStorage: {
      isSet: () => true,
      set: vi.fn(),
      clear: vi.fn(),
    },
  }
})

function makeAdvisory(id: string): Advisory {
  return {
    id,
    trackId: `track-${id}`,
    timestamp: Date.now(),
    label: 'ACOUSTIC_FEEDBACK',
    severity: 'GROWING',
    confidence: 0.91,
    why: ['test'],
    trueFrequencyHz: 1000,
    trueAmplitudeDb: -18,
    prominenceDb: 12,
    qEstimate: 4,
    bandwidthHz: 250,
    velocityDbPerSec: 1,
    stabilityCentsStd: 0,
    harmonicityScore: 0,
    modulationScore: 0,
    advisory: {
      geq: { bandIndex: 15, bandHz: 1000, suggestedDb: -6 },
      peq: { type: 'bell', hz: 1000, q: 4, gainDb: -6 },
      shelves: [],
      pitch: { note: 'B', octave: 5, cents: 0, midi: 83 },
    },
  }
}

async function loadIssuesList() {
  vi.resetModules()
  return import('../IssuesList')
}

describe('IssuesList multi-mount integration', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('dwa-companion', JSON.stringify({
      enabled: true,
      autoSend: true,
      ringOutAutoSend: false,
      minConfidence: 0.8,
      pairingCode: 'DWA-ABC123',
    }))
  })

  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('only auto-sends once when duplicate IssuesList trees mount the same advisories', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, pendingCount: 0 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ accepted: true, pendingCount: 1 }),
      })
    vi.stubGlobal('fetch', fetchMock)

    const { IssuesList } = await loadIssuesList()
    const advisories = [makeAdvisory('adv-1')]

    render(
      <>
        <IssuesList advisories={advisories} isRunning={true} />
        <IssuesList advisories={advisories} isRunning={true} />
      </>,
    )

    await waitFor(() => {
      const postCalls = fetchMock.mock.calls.filter(([, init]) => {
        return Boolean(init) && (init as RequestInit).method === 'POST'
      })
      expect(postCalls).toHaveLength(1)
    })
  }, 10000)

  it('lets an explicit Send to Mixer click bypass minConfidence', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, pendingCount: 0 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ accepted: true, pendingCount: 1 }),
      })
    vi.stubGlobal('fetch', fetchMock)

    localStorage.setItem('dwa-companion', JSON.stringify({
      enabled: true,
      autoSend: false,
      ringOutAutoSend: false,
      minConfidence: 0.95,
      pairingCode: 'DWA-ABC123',
    }))

    const { IssuesList } = await loadIssuesList()
    const advisories = [
      {
        ...makeAdvisory('adv-low'),
        confidence: 0.2,
      },
    ]

    render(<IssuesList advisories={advisories} isRunning={true} />)

    fireEvent.click(
      screen.getByRole('button', {
        name: /send .* eq recommendation to mixer via companion/i,
      }),
    )

    await waitFor(() => {
      const postCalls = fetchMock.mock.calls.filter(([, init]) => {
        return Boolean(init) && (init as RequestInit).method === 'POST'
      })
      expect(postCalls).toHaveLength(1)
    })
  })

  it('keeps explicit Send to Mixer available on touch cards with swipe labeling', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, pendingCount: 0 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ accepted: true, pendingCount: 1 }),
      })
    vi.stubGlobal('fetch', fetchMock)

    localStorage.setItem('dwa-companion', JSON.stringify({
      enabled: true,
      autoSend: false,
      ringOutAutoSend: false,
      minConfidence: 0.95,
      pairingCode: 'DWA-ABC123',
    }))

    const { IssuesList } = await loadIssuesList()
    const advisories = [
      {
        ...makeAdvisory('adv-touch'),
        confidence: 0.2,
      },
    ]

    render(
      <IssuesList
        advisories={advisories}
        isRunning={true}
        touchFriendly
        swipeLabeling
      />,
    )

    fireEvent.click(
      screen.getByRole('button', {
        name: /send .* eq recommendation to mixer via companion/i,
      }),
    )

    await waitFor(() => {
      const postCalls = fetchMock.mock.calls.filter(([, init]) => {
        return Boolean(init) && (init as RequestInit).method === 'POST'
      })
      expect(postCalls).toHaveLength(1)
    })
  })

  it('keeps explicit Send to Mixer available on desktop when swipe labeling is enabled', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, pendingCount: 0 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ accepted: true, pendingCount: 1 }),
      })
    vi.stubGlobal('fetch', fetchMock)

    localStorage.setItem('dwa-companion', JSON.stringify({
      enabled: true,
      autoSend: false,
      ringOutAutoSend: false,
      minConfidence: 0.95,
      pairingCode: 'DWA-ABC123',
    }))

    const { IssuesList } = await loadIssuesList()
    const advisories = [
      {
        ...makeAdvisory('adv-desktop-swipe'),
        confidence: 0.2,
      },
    ]

    render(
      <IssuesList
        advisories={advisories}
        isRunning={true}
        swipeLabeling
      />,
    )

    fireEvent.click(
      screen.getByRole('button', {
        name: /send .* eq recommendation to mixer via companion/i,
      }),
    )

    await waitFor(() => {
      const postCalls = fetchMock.mock.calls.filter(([, init]) => {
        return Boolean(init) && (init as RequestInit).method === 'POST'
      })
      expect(postCalls).toHaveLength(1)
    })
  })
})
