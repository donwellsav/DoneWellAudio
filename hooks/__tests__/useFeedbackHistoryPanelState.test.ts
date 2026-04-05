// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildFeedbackHistoryLayout, formatHistoryFrequency } from '@/components/analyzer/feedbackHistoryPanelUtils'
import { useFeedbackHistoryPanelState } from '@/hooks/useFeedbackHistoryPanelState'

const mockGetFeedbackHistory = vi.fn()
const mockGetArchivedSessions = vi.fn()
const mockClearSessionHistory = vi.fn()
const mockDownloadFile = vi.fn()
const mockGenerateTxtReport = vi.fn()

vi.mock('@/lib/dsp/feedbackHistory', () => ({
  getFeedbackHistory: () => mockGetFeedbackHistory(),
}))

vi.mock('@/lib/storage/sessionHistoryStorage', () => ({
  getArchivedSessions: () => mockGetArchivedSessions(),
  clearSessionHistory: () => mockClearSessionHistory(),
}))

vi.mock('@/lib/export/downloadFile', () => ({
  downloadFile: (...args: unknown[]) => mockDownloadFile(...args),
}))

vi.mock('@/lib/export/exportTxt', () => ({
  generateTxtReport: (...args: unknown[]) => mockGenerateTxtReport(...args),
}))

describe('useFeedbackHistoryPanelState', () => {
  const history = {
    getHotspots: vi.fn(),
    getSessionSummary: vi.fn(),
    exportToCSV: vi.fn(),
    exportToJSON: vi.fn(),
    clear: vi.fn(),
  }

  beforeEach(() => {
    vi.useFakeTimers()

    history.getHotspots.mockReset()
    history.getSessionSummary.mockReset()
    history.exportToCSV.mockReset()
    history.exportToJSON.mockReset()
    history.clear.mockReset()

    mockGetFeedbackHistory.mockReset()
    mockGetArchivedSessions.mockReset()
    mockClearSessionHistory.mockReset()
    mockDownloadFile.mockReset()
    mockGenerateTxtReport.mockReset()

    history.getHotspots.mockReturnValue([
      {
        centerFrequencyHz: 1000,
        occurrences: 3,
        lastSeen: 123,
        isRepeatOffender: true,
        avgAmplitudeDb: -12,
        maxAmplitudeDb: -6,
        avgConfidence: 0.8,
        suggestedCutDb: 4,
      },
    ])
    history.getSessionSummary.mockReturnValue({ sessionId: 'session-1' })
    history.exportToCSV.mockReturnValue('csv')
    history.exportToJSON.mockReturnValue('json')
    mockGetFeedbackHistory.mockReturnValue(history)
    mockGetArchivedSessions.mockReturnValue([
      {
        id: 'arch-1',
        startTime: 1000,
        endTime: 2000,
        durationMs: 1000,
        mode: 'speech',
        totalEvents: 2,
        totalHotspots: 1,
        repeatOffenderCount: 1,
        frequencyBandBreakdown: { LOW: 0, MID: 1, HIGH: 0 },
        topHotspots: [],
      },
    ])
    mockGenerateTxtReport.mockReturnValue('txt-report')
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('refreshes data while the panel is open in uncontrolled mode', () => {
    const { result } = renderHook(() => useFeedbackHistoryPanelState({}))

    expect(result.current.isOpen).toBe(false)
    expect(result.current.hasData).toBe(false)

    act(() => {
      result.current.setIsOpen(true)
    })

    expect(result.current.isOpen).toBe(true)
    expect(history.getHotspots).toHaveBeenCalledTimes(1)
    expect(result.current.hasData).toBe(true)
    expect(result.current.repeatOffenders).toHaveLength(1)

    act(() => {
      vi.advanceTimersByTime(2000)
    })

    expect(history.getHotspots).toHaveBeenCalledTimes(2)
    expect(mockGetArchivedSessions).toHaveBeenCalledTimes(2)
  })

  it('delegates open changes in controlled mode', () => {
    const onOpenChange = vi.fn()

    const { result } = renderHook(() => useFeedbackHistoryPanelState({
      open: true,
      onOpenChange,
    }))

    expect(result.current.isOpen).toBe(true)
    expect(result.current.isControlled).toBe(true)

    act(() => {
      result.current.setIsOpen(false)
    })

    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('exports txt and clears both current and archived history', () => {
    const { result } = renderHook(() => useFeedbackHistoryPanelState({ open: true }))

    act(() => {
      result.current.handleExportTxt()
    })

    expect(mockGenerateTxtReport).toHaveBeenCalledWith(
      { sessionId: 'session-1' },
      history.getHotspots.mock.results[0]?.value,
    )
    expect(mockDownloadFile).toHaveBeenCalledTimes(1)

    act(() => {
      result.current.handleClear()
      result.current.handleClearArchive()
    })

    expect(history.clear).toHaveBeenCalledTimes(1)
    expect(mockClearSessionHistory).toHaveBeenCalledTimes(1)
    expect(history.getHotspots).toHaveBeenCalledTimes(4)
  })

  it('builds adaptive layout classes and human-readable frequency labels', () => {
    expect(buildFeedbackHistoryLayout([])).toEqual({
      columnCount: 1,
      gridClassName: 'space-y-2',
      maxWidthClassName: 'sm:max-w-xl',
    })

    const hotspot = history.getHotspots.mock.results[0]?.value?.[0]

    expect(buildFeedbackHistoryLayout(new Array(7).fill(hotspot))).toEqual({
      columnCount: 2,
      gridClassName: 'grid grid-cols-1 sm:grid-cols-2 gap-1.5',
      maxWidthClassName: 'sm:max-w-4xl',
    })

    expect(formatHistoryFrequency(630)).toBe('630Hz')
    expect(formatHistoryFrequency(1600)).toBe('1.6kHz')
  })
})
