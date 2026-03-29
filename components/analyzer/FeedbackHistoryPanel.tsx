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
import { History, Download, Trash2, AlertTriangle, TrendingUp, BarChart3, ChevronDown, FileText, FileJson, FileSpreadsheet, Loader2, Clock } from 'lucide-react'
import { getFeedbackHistory, type FrequencyHotspot } from '@/lib/dsp/feedbackHistory'
import { downloadFile } from '@/lib/export/downloadFile'
import { generateTxtReport } from '@/lib/export/exportTxt'
import { getArchivedSessions, clearSessionHistory } from '@/lib/storage/sessionHistoryStorage'
import { cn } from '@/lib/utils'
import type { ArchivedSession } from '@/types/export'

export const FeedbackHistoryPanel = memo(function FeedbackHistoryPanel() {
  const [hotspots, setHotspots] = useState<FrequencyHotspot[]>([])
  const [archivedSessions, setArchivedSessions] = useState<ArchivedSession[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isExporting, setIsExporting] = useState(false)

  // Refresh data when panel opens
  const refreshData = useCallback(() => {
    setHotspots(getFeedbackHistory().getHotspots())
    setArchivedSessions(getArchivedSessions())
  }, [])

  useEffect(() => {
    if (isOpen) {
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

  const handleClearArchive = useCallback(() => {
    clearSessionHistory()
    refreshData()
  }, [refreshData])

  const formatFrequency = (hz: number) => {
    if (hz >= 1000) return `${(hz / 1000).toFixed(1)}kHz`
    return `${Math.round(hz)}Hz`
  }

  const hasData = hotspots.length > 0

  // Adaptive width + columns based on history size
  const colCount = hotspots.length >= 12 ? 3 : hotspots.length >= 6 ? 2 : 1
  const maxW = colCount === 3 ? 'sm:max-w-7xl' : colCount === 2 ? 'sm:max-w-4xl' : 'sm:max-w-xl'
  const gridCls = colCount === 3
    ? 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-1.5'
    : colCount === 2
      ? 'grid grid-cols-1 sm:grid-cols-2 gap-1.5'
      : 'space-y-2'

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="h-10 w-10 text-muted-foreground hover:text-foreground" aria-label="Feedback History">
              <History className="size-5 sm:size-6" />
            </Button>
          </SheetTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-sm">
          History
        </TooltipContent>
      </Tooltip>
      <SheetContent side="right" className={cn("overflow-y-auto channel-strip amber-sidecar", maxW)}>
        <SheetHeader className="pb-3 panel-groove bg-card/60 -mx-4 sm:-mx-6 px-4 sm:px-6 pt-4 max-sm:pt-2 shadow-[0_1px_8px_rgba(0,0,0,0.3),0_1px_0_rgba(245,158,11,0.09)]">
          <SheetTitle className="text-lg flex items-center gap-2">
            <History className="h-5 w-5" style={{ color: 'var(--console-amber)' }} />
            <span style={{ color: 'var(--console-amber)' }}>Feedback History</span>
          </SheetTitle>
          <SheetDescription className="text-sm">
            Frequency hotspots & repeat offenders.
          </SheetDescription>
        </SheetHeader>

        {/* Export/Clear Actions */}
        <div className="flex gap-2 pb-3 border-b border-border/40 panel-groove bg-card/60 -mx-4 sm:-mx-6 px-4 sm:px-6">
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
              <div className="flex items-center gap-2 mb-2 py-1.5 px-2 panel-groove bg-card/60">
                <AlertTriangle className="h-4 w-4 text-amber-400" />
                <span className="section-label">Repeat Offenders</span>
              </div>
              <div className={gridCls}>
                {hotspots.filter(h => h.isRepeatOffender).slice(0, 5).map((hotspot, i) => (
                  <div
                    key={i}
                    className="bg-amber-500/10 border border-amber-500/30 rounded p-2 hover:bg-amber-500/15 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-amber-400 font-medium">
                        {formatFrequency(hotspot.centerFrequencyHz)}
                      </span>
                      <span className="text-sm font-mono bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded">
                        {hotspot.occurrences}x detected
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground font-mono">
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
            <div className="flex items-center gap-2 mb-2 py-1.5 px-2 panel-groove bg-card/60">
              <BarChart3 className="h-4 w-4" style={{ color: 'var(--console-amber)' }} />
              <span className="section-label">All Problem Frequencies</span>
            </div>
            <div className={hotspots.length === 0 ? 'space-y-1.5' : gridCls}>
              {hotspots.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-1 bg-card/80 rounded border">
                  <BarChart3 className="w-5 h-5 text-muted-foreground/50 mb-1" />
                  <span className="text-sm font-mono font-medium">No feedback events recorded yet</span>
                  <span className="text-sm text-muted-foreground font-mono">Events will appear here as they are detected</span>
                </div>
              ) : (
                hotspots.map((hotspot, i) => (
                  <div
                    key={i}
                    className={`rounded px-2 py-1.5 flex items-center justify-between transition-colors ${
                      hotspot.isRepeatOffender
                        ? 'bg-amber-500/10 border-l-2 border-amber-500 hover:bg-amber-500/15'
                        : 'bg-card/80 hover:bg-accent/5'
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
                    <div className="flex items-center gap-3 text-sm text-muted-foreground font-mono">
                      <span>{hotspot.occurrences}x</span>
                      <span>{(hotspot.avgConfidence * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Past Sessions */}
          <div>
            <div className="flex items-center justify-between mb-2 py-1.5 px-2 panel-groove bg-card/60">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" style={{ color: 'var(--console-blue)' }} />
                <span className="section-label" style={{ color: 'var(--console-blue)' }}>Past Sessions</span>
              </div>
              {archivedSessions.length > 0 && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button className="text-xs text-muted-foreground hover:text-destructive transition-colors cursor-pointer">
                      Clear
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogTitle>Clear session archive?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will remove all {archivedSessions.length} archived sessions.
                    </AlertDialogDescription>
                    <div className="flex items-center gap-3 justify-end">
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleClearArchive} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                        Clear
                      </AlertDialogAction>
                    </div>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
            {archivedSessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-muted-foreground gap-1 bg-card/80 rounded border">
                <Clock className="w-5 h-5 text-muted-foreground/50 mb-1" />
                <span className="text-sm font-mono">No past sessions</span>
                <span className="text-xs text-muted-foreground/70 font-mono">Sessions are archived when you stop analysis</span>
              </div>
            ) : (
              <div className="space-y-1.5">
                {archivedSessions.map((session) => (
                  <div key={session.id} className="rounded bg-card/80 hover:bg-accent/5 transition-colors px-2 py-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm">
                        {new Date(session.startTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        {' '}
                        <span className="text-muted-foreground">
                          {new Date(session.startTime).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </span>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-[rgba(245,158,11,0.12)] font-mono" style={{ color: 'var(--console-amber)' }}>
                        {session.mode}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground font-mono mt-0.5">
                      <span>{Math.round(session.durationMs / 60000)}m</span>
                      <span>{session.totalEvents} events</span>
                      {session.repeatOffenderCount > 0 && (
                        <span className="text-amber-400">{session.repeatOffenderCount} repeat</span>
                      )}
                      {session.metadata?.venueName && (
                        <span className="text-muted-foreground/70 truncate max-w-[120px]">{session.metadata.venueName}</span>
                      )}
                    </div>
                    {session.topHotspots.length > 0 && (
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground/70 font-mono">
                        <span>Top:</span>
                        {session.topHotspots.slice(0, 3).map((h, i) => (
                          <span key={i}>{formatFrequency(h.centerFrequencyHz)}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
})
