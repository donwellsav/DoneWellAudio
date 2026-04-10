// @vitest-environment jsdom

import { render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Advisory } from '@/types/advisory'

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
  const actual = await vi.importActual<typeof import('@/lib/storage/dwaStorage')>('@/lib/storage/dwaStorage')
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
})
