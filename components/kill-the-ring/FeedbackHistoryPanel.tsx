'use client'

import { useState, useEffect, useCallback, memo } from 'react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { History, Download, Trash2, AlertTriangle, TrendingUp, BarChart3, ChevronDown, FileText, FileJson, FileSpreadsheet, Loader2 } from 'lucide-react'
import { getFeedbackHistory, type FrequencyHotspot } from '@/lib/dsp/feedbackHistory'
import { downloadFile } from '@/lib/export/downloadFile'
import { generateTxtReport } from '@/lib/export/exportTxt'

export const FeedbackHistoryPanel = memo(function FeedbackHistoryPanel() {
  const [hotspots, setHotspots] = useState<FrequencyHotspot[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isExporting, setIsExporting] = useState(false)

  // Refresh data when panel opens
  const refreshData = useCallback(() => {
    setHotspots(getFeedbackHistory().getHotspots())
  }, [])

  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: load data on open
      refreshData()
      // Also set up interval to refresh while open
      const interval = setInterval(refreshData, 2000)
      return () => clearInterval(interval)
    }
  }, [isOpen, refreshData])

  const dateSlug = () => new Date().toISOString().slice(0, 10)

  const handleExportTxt = useCallback(() => {
    const history = getFeedbackHistory()
    const txt = generateTxtReport(history.getSessionSummary(), history.getHotspots())
    downloadFile(new Blob([txt], { type: 'text/plain' }), `feedback-report-${dateSlug()}.txt`)
  }, [])

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
      const blob = await generatePdfReport(history.getSessionSummary(), history.getHotspots())
      downloadFile(blob, `feedback-report-${dateSlug()}.pdf`)
    } finally {
      setIsExporting(false)
    }
  }, [])

  const handleClear = useCallback(() => {
    getFeedbackHistory().clear()
    refreshData()
  }, [refreshData])

  const formatFrequency = (hz: number) => {
    if (hz >= 1000) return `${(hz / 1000).toFixed(1)}kHz`
    return `${Math.round(hz)}Hz`
  }

  const hasData = hotspots.length > 0

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="h-14 w-14 sm:h-10 sm:w-10 text-muted-foreground hover:text-foreground" aria-label="Feedback History">
              <History className="size-7 sm:size-6" />
            </Button>
          </SheetTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          History
        </TooltipContent>
      </Tooltip>
      <SheetContent side="right" className="sm:max-w-md overflow-y-auto">
        <SheetHeader className="pb-1">
          <SheetTitle className="text-lg font-bold tracking-tight flex items-center gap-2">
            <History className="h-5 w-5" />
            Feedback History
          </SheetTitle>
          <SheetDescription className="text-xs">
            Tracks repeat offenders and frequency hotspots across sessions.
          </SheetDescription>
        </SheetHeader>

        {/* Export/Clear Actions */}
        <div className="flex gap-2 pb-3 border-b border-border">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                disabled={!hasData || isExporting}
              >
                {isExporting ? (
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                ) : (
                  <Download className="h-3 w-3 mr-1" />
                )}
                {isExporting ? 'Exporting...' : 'Export'}
                <ChevronDown className="h-3 w-3 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={handleExportTxt}>
                <FileText className="h-4 w-4 mr-2" />
                Export as TXT
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportCSV}>
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Export as CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportJSON}>
                <FileJson className="h-4 w-4 mr-2" />
                Export as JSON
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportPdf}>
                <BarChart3 className="h-4 w-4 mr-2" />
                Export as PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="hover:bg-destructive/10 hover:text-destructive hover:border-destructive/50"
                disabled={!hasData}
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Clear
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogTitle>Clear feedback history?</AlertDialogTitle>
              <AlertDialogDescription>
                This will remove all recorded feedback events and hotspot data. This cannot be undone.
              </AlertDialogDescription>
              <div className="flex items-center gap-3 justify-end">
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleClear} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Clear
                </AlertDialogAction>
              </div>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {/* Content */}
        <div className="space-y-4">
          {/* Repeat Offenders Section */}
          {hotspots.filter(h => h.isRepeatOffender).length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-4 w-4 text-amber-400" />
                <span className="text-sm font-bold tracking-tight">Repeat Offenders</span>
              </div>
              <div className="space-y-2">
                {hotspots.filter(h => h.isRepeatOffender).slice(0, 5).map((hotspot, i) => (
                  <div
                    key={i}
                    className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-2 hover:bg-amber-500/15 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-amber-400 font-medium">
                        {formatFrequency(hotspot.centerFrequencyHz)}
                      </span>
                      <span className="text-xs font-mono bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded">
                        {hotspot.occurrences}x detected
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground font-mono">
                      <span>Avg: {hotspot.avgAmplitudeDb.toFixed(1)}dB</span>
                      <span>Max: {hotspot.maxAmplitudeDb.toFixed(1)}dB</span>
                      <span>Cut: -{hotspot.suggestedCutDb.toFixed(1)}dB</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* All Hotspots */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-bold tracking-tight">All Problem Frequencies</span>
            </div>
            <div className="space-y-1.5">
              {hotspots.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-1">
                  <BarChart3 className="w-5 h-5 text-muted-foreground/30 mb-1" />
                  <span className="text-sm font-medium">No feedback events recorded yet</span>
                  <span className="text-xs text-muted-foreground/60">Events will appear here as they are detected</span>
                </div>
              ) : (
                hotspots.map((hotspot, i) => (
                  <div
                    key={i}
                    className={`rounded px-2 py-1.5 flex items-center justify-between transition-colors ${
                      hotspot.isRepeatOffender
                        ? 'bg-amber-500/10 border-l-2 border-amber-500 hover:bg-amber-500/15'
                        : 'bg-muted/30 hover:bg-accent/5'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm">
                        {formatFrequency(hotspot.centerFrequencyHz)}
                      </span>
                      {hotspot.isRepeatOffender && (
                        <TrendingUp className="h-3 w-3 text-amber-400" />
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground font-mono">
                      <span>{hotspot.occurrences}x</span>
                      <span>{(hotspot.avgConfidence * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
})
