'use client'

import { useState, useEffect, useCallback, memo } from 'react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { History, Download, Trash2, AlertTriangle, TrendingUp, BarChart3 } from 'lucide-react'
import { getFeedbackHistory, type FrequencyHotspot } from '@/lib/dsp/feedbackHistory'

export const FeedbackHistoryPanel = memo(function FeedbackHistoryPanel() {
  const [hotspots, setHotspots] = useState<FrequencyHotspot[]>([])
  const [isOpen, setIsOpen] = useState(false)

  // Refresh data when panel opens
  const refreshData = useCallback(() => {
    setHotspots(getFeedbackHistory().getHotspots())
  }, [])

  useEffect(() => {
    if (isOpen) {
      refreshData()
      // Also set up interval to refresh while open
      const interval = setInterval(refreshData, 2000)
      return () => clearInterval(interval)
    }
  }, [isOpen, refreshData])

  const handleExportCSV = useCallback(() => {
    const history = getFeedbackHistory()
    const csv = history.exportToCSV()
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `feedback-history-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }, [])

  const handleExportJSON = useCallback(() => {
    const history = getFeedbackHistory()
    const json = history.exportToJSON()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `feedback-history-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }, [])

  // TODO: Replace native confirm() with AlertDialog for UI consistency (see ResetConfirmDialog pattern)
  const handleClear = useCallback(() => {
    if (confirm('Clear all feedback history? This cannot be undone.')) {
      getFeedbackHistory().clear()
      refreshData()
    }
  }, [refreshData])

  const formatFrequency = (hz: number) => {
    if (hz >= 1000) return `${(hz / 1000).toFixed(1)}kHz`
    return `${Math.round(hz)}Hz`
  }

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="h-14 w-14 sm:h-8 sm:w-8" title="Feedback History">
          <History className="h-7 w-7 sm:h-4 sm:w-4" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:w-[400px] lg:w-[540px] bg-background border-border">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 font-bold tracking-tight">
            <History className="h-5 w-5" />
            Feedback History
          </SheetTitle>
        </SheetHeader>

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
            <ScrollArea className="h-[250px]">
              <div className="space-y-1.5 pr-3">
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
            </ScrollArea>
          </div>

          {/* Export/Clear Actions */}
          <div className="flex gap-2 pt-2 border-t border-border">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={handleExportCSV}
              disabled={hotspots.length === 0}
            >
              <Download className="h-3 w-3 mr-1" />
              CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={handleExportJSON}
              disabled={hotspots.length === 0}
            >
              <Download className="h-3 w-3 mr-1" />
              JSON
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClear}
              className="text-muted-foreground/50 hover:text-destructive"
              disabled={hotspots.length === 0}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
})
