// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSetupTabExport } from '@/hooks/useSetupTabExport'
import type { FrequencyHotspot, SessionSummary } from '@/lib/dsp/feedbackHistory'
import type { ExportMetadata } from '@/types/export'

const mockDownloadFile = vi.fn()
const mockGenerateTxtReport = vi.fn()
const mockGetFeedbackHistory = vi.fn()

vi.mock('@/lib/export/downloadFile', () => ({
  downloadFile: (...args: unknown[]) => mockDownloadFile(...args),
}))

vi.mock('@/lib/export/exportTxt', () => ({
  generateTxtReport: (...args: unknown[]) => mockGenerateTxtReport(...args),
}))

vi.mock('@/lib/dsp/feedbackHistory', () => ({
  getFeedbackHistory: () => mockGetFeedbackHistory(),
  whenFeedbackHistoryReady: () => Promise.resolve(),
}))

function createSummary(): SessionSummary {
  return {
    sessionId: 'session_1',
    startTime: 1000,
    endTime: 2000,
    totalEvents: 0,
    hotspots: [],
    repeatOffenders: [],
    mostProblematicFrequency: null,
    frequencyBandBreakdown: {
      LOW: 0,
      MID: 0,
      HIGH: 0,
    },
  }
}

describe('useSetupTabExport', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-04T15:00:00.000Z'))

    const hotspots: FrequencyHotspot[] = []
    mockGetFeedbackHistory.mockReturnValue({
      getSessionSummary: vi.fn(() => createSummary()),
      getHotspots: vi.fn(() => hotspots),
      exportToCSV: vi.fn(() => 'freq\n1000'),
      exportToJSON: vi.fn(() => '{"ok":true}'),
    })
    mockGenerateTxtReport.mockReturnValue('plain text report')
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('loads saved metadata and persists merged updates', () => {
    const saved: ExportMetadata = {
      venueName: 'Main Sanctuary',
    }
    localStorage.setItem('dwa-export-metadata', JSON.stringify(saved))

    const { result } = renderHook(() => useSetupTabExport())

    expect(result.current.metadata).toEqual(saved)

    act(() => {
      result.current.updateMetadata({ engineerName: 'Alex' })
    })

    expect(result.current.metadata).toEqual({
      venueName: 'Main Sanctuary',
      engineerName: 'Alex',
    })
    expect(JSON.parse(localStorage.getItem('dwa-export-metadata') ?? '{}')).toEqual({
      venueName: 'Main Sanctuary',
      engineerName: 'Alex',
    })
  })

  it('builds and downloads a TXT export using current metadata', async () => {
    const { result } = renderHook(() => useSetupTabExport())

    act(() => {
      result.current.updateMetadata({
        venueName: 'Club Room',
        engineerName: 'Sam',
      })
    })

    await act(async () => {
      await result.current.handleExportTxt()
    })

    expect(mockGenerateTxtReport).toHaveBeenCalledWith(
      createSummary(),
      [],
      {
        venueName: 'Club Room',
        engineerName: 'Sam',
      },
    )
    expect(mockDownloadFile).toHaveBeenCalledTimes(1)
    expect(mockDownloadFile).toHaveBeenCalledWith(expect.any(Blob), 'feedback-report-2026-04-04.txt')

    const [blob] = mockDownloadFile.mock.calls[0] as [Blob, string]
    await expect(blob.text()).resolves.toBe('plain text report')
  })
})
