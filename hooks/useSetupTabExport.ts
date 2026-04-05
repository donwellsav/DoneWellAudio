'use client'

import { useCallback, useState } from 'react'
import { getFeedbackHistory } from '@/lib/dsp/feedbackHistory'
import { downloadFile } from '@/lib/export/downloadFile'
import { generateTxtReport } from '@/lib/export/exportTxt'
import { typedStorage } from '@/lib/storage/dwaStorage'
import type { ExportMetadata } from '@/types/export'

const metadataStorage = typedStorage<ExportMetadata>('dwa-export-metadata', {})

function dateSlug(): string {
  return new Date().toISOString().slice(0, 10)
}

export interface UseSetupTabExportReturn {
  metadata: ExportMetadata
  isExporting: boolean
  updateMetadata: (patch: Partial<ExportMetadata>) => void
  handleExportTxt: () => void
  handleExportCSV: () => void
  handleExportJSON: () => void
  handleExportPdf: () => Promise<void>
}

export function useSetupTabExport(): UseSetupTabExportReturn {
  const [metadata, setMetadata] = useState<ExportMetadata>(() => metadataStorage.load())
  const [isExporting, setIsExporting] = useState(false)

  const updateMetadata = useCallback((patch: Partial<ExportMetadata>) => {
    setMetadata(prev => {
      const next = { ...prev, ...patch }
      metadataStorage.save(next)
      return next
    })
  }, [])

  const handleExportTxt = useCallback(() => {
    const history = getFeedbackHistory()
    const txt = generateTxtReport(history.getSessionSummary(), history.getHotspots(), metadata)
    downloadFile(new Blob([txt], { type: 'text/plain' }), `feedback-report-${dateSlug()}.txt`)
  }, [metadata])

  const handleExportCSV = useCallback(() => {
    const csv = getFeedbackHistory().exportToCSV()
    downloadFile(new Blob([csv], { type: 'text/csv' }), `feedback-history-${dateSlug()}.csv`)
  }, [])

  const handleExportJSON = useCallback(() => {
    const json = getFeedbackHistory().exportToJSON()
    downloadFile(new Blob([json], { type: 'application/json' }), `feedback-history-${dateSlug()}.json`)
  }, [])

  const handleExportPdf = useCallback(async () => {
    setIsExporting(true)
    try {
      const { generatePdfReport } = await import('@/lib/export/exportPdf')
      const history = getFeedbackHistory()
      const blob = await generatePdfReport(history.getSessionSummary(), history.getHotspots(), metadata)
      downloadFile(blob, `feedback-report-${dateSlug()}.pdf`)
    } finally {
      setIsExporting(false)
    }
  }, [metadata])

  return {
    metadata,
    isExporting,
    updateMetadata,
    handleExportTxt,
    handleExportCSV,
    handleExportJSON,
    handleExportPdf,
  }
}
