'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { getFeedbackHistory, type FrequencyHotspot } from '@/lib/dsp/feedbackHistory'
import { downloadFile } from '@/lib/export/downloadFile'
import { generateTxtReport } from '@/lib/export/exportTxt'
import { clearSessionHistory, getArchivedSessions } from '@/lib/storage/sessionHistoryStorage'
import type { ArchivedSession } from '@/types/export'
import { buildFeedbackHistoryLayout, type FeedbackHistoryLayout } from '@/components/analyzer/feedbackHistoryPanelUtils'

interface UseFeedbackHistoryPanelStateOptions {
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export interface FeedbackHistoryPanelState {
  hotspots: FrequencyHotspot[]
  repeatOffenders: FrequencyHotspot[]
  archivedSessions: ArchivedSession[]
  isOpen: boolean
  isControlled: boolean
  isExporting: boolean
  hasData: boolean
  layout: FeedbackHistoryLayout
  setIsOpen: (open: boolean) => void
  refreshData: () => void
  handleExportTxt: () => void
  handleExportCSV: () => void
  handleExportJSON: () => void
  handleExportPdf: () => Promise<void>
  handleClear: () => void
  handleClearArchive: () => void
}

function buildDateSlug(): string {
  return new Date().toISOString().slice(0, 10)
}

export function useFeedbackHistoryPanelState({
  open: controlledOpen,
  onOpenChange,
}: UseFeedbackHistoryPanelStateOptions): FeedbackHistoryPanelState {
  const [hotspots, setHotspots] = useState<FrequencyHotspot[]>([])
  const [archivedSessions, setArchivedSessions] = useState<ArchivedSession[]>([])
  const [internalOpen, setInternalOpen] = useState(false)
  const [isExporting, setIsExporting] = useState(false)

  const isControlled = controlledOpen !== undefined
  const isOpen = controlledOpen ?? internalOpen
  const setIsOpen = onOpenChange ?? setInternalOpen

  const refreshData = useCallback(() => {
    const history = getFeedbackHistory()
    setHotspots(history.getHotspots())
    setArchivedSessions(getArchivedSessions())
  }, [])

  useEffect(() => {
    if (!isOpen) return

    refreshData()
    const intervalId = window.setInterval(refreshData, 2000)
    return () => window.clearInterval(intervalId)
  }, [isOpen, refreshData])

  const handleExportTxt = useCallback(() => {
    const history = getFeedbackHistory()
    const txt = generateTxtReport(history.getSessionSummary(), history.getHotspots())
    downloadFile(new Blob([txt], { type: 'text/plain' }), `feedback-report-${buildDateSlug()}.txt`)
  }, [])

  const handleExportCSV = useCallback(() => {
    const csv = getFeedbackHistory().exportToCSV()
    downloadFile(new Blob([csv], { type: 'text/csv' }), `feedback-history-${buildDateSlug()}.csv`)
  }, [])

  const handleExportJSON = useCallback(() => {
    const json = getFeedbackHistory().exportToJSON()
    downloadFile(new Blob([json], { type: 'application/json' }), `feedback-history-${buildDateSlug()}.json`)
  }, [])

  const handleExportPdf = useCallback(async () => {
    setIsExporting(true)
    try {
      const { generatePdfReport } = await import('@/lib/export/exportPdf')
      const history = getFeedbackHistory()
      const blob = await generatePdfReport(history.getSessionSummary(), history.getHotspots())
      downloadFile(blob, `feedback-report-${buildDateSlug()}.pdf`)
    } finally {
      setIsExporting(false)
    }
  }, [])

  const handleClear = useCallback(() => {
    getFeedbackHistory().clear()
    refreshData()
  }, [refreshData])

  const handleClearArchive = useCallback(() => {
    clearSessionHistory()
    refreshData()
  }, [refreshData])

  const repeatOffenders = useMemo(
    () => hotspots.filter((hotspot) => hotspot.isRepeatOffender),
    [hotspots],
  )

  const layout = useMemo(
    () => buildFeedbackHistoryLayout(hotspots),
    [hotspots],
  )

  return {
    hotspots,
    repeatOffenders,
    archivedSessions,
    isOpen,
    isControlled,
    isExporting,
    hasData: hotspots.length > 0,
    layout,
    setIsOpen,
    refreshData,
    handleExportTxt,
    handleExportCSV,
    handleExportJSON,
    handleExportPdf,
    handleClear,
    handleClearArchive,
  }
}
