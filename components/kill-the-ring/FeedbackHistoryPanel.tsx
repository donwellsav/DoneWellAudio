'use client'

import { useState, useEffect, useCallback } from 'react'
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
import { getFeedbackHistory, type FrequencyHotspot, type SessionSummary } from '@/lib/dsp/feedbackHistory'

export function FeedbackHistoryPanel() {
  const [summary, setSummary] = useState<SessionSummary | null>(null)
  const [hotspots, setHotspots] = useState<FrequencyHotspot[]>([])
  const [isOpen, setIsOpen] = useState(false)

  // Refresh data when panel opens
  const refreshData = useCallback(() => {
    const history = getFeedbackHistory()
    setSummary(history.getSessionSummary())
    setHotspots(history.getHotspots())
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
    URL.revokeObjectURL(url)
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
    URL.revokeObjectURL(url)
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

  const formatDuration = (ms: number) => {
    const minutes = Math.floor(ms / 60000)
    const seconds = Math.floor((ms % 60000) / 1000)
    if (minutes > 0) return `${minutes}m ${seconds}s`
    return `${seconds}s`
  }

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" title="Feedback History">
          <History className="h-4 w-4" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[400px] sm:w-[540px] bg-background border-border">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Feedback History
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {/* Session Summary */}
          {summary && (
            <div className="bg-muted/30 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Session Duration</span>
                <span className="font-mono">{formatDuration(summary.endTime - summary.startTime)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Total Events</span>
                <span className="font-mono">{summary.totalEvents}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Repeat Offenders</span>
                <span className="font-mono text-amber-400">{summary.repeatOffenders.length}</span>
              </div>
              
              {/* Frequency Band Breakdown */}
              <div className="pt-2 border-t border-border">
                <div className="text-xs text-muted-foreground mb-1">By Frequency Band</div>
                <div className="flex gap-2">
                  <div className="flex-1 bg-blue-500/20 rounded px-2 py-1 text-center">
                    <div className="text-xs text-muted-foreground">LOW</div>
                    <div className="text-sm font-mono">{summary.frequencyBandBreakdown.LOW}</div>
                  </div>
                  <div className="flex-1 bg-green-500/20 rounded px-2 py-1 text-center">
                    <div className="text-xs text-muted-foreground">MID</div>
                    <div className="text-sm font-mono">{summary.frequencyBandBreakdown.MID}</div>
                  </div>
                  <div className="flex-1 bg-orange-500/20 rounded px-2 py-1 text-center">
                    <div className="text-xs text-muted-foreground">HIGH</div>
                    <div className="text-sm font-mono">{summary.frequencyBandBreakdown.HIGH}</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Repeat Offenders Section */}
          {hotspots.filter(h => h.isRepeatOffender).length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-4 w-4 text-amber-400" />
                <span className="text-sm font-medium">Repeat Offenders</span>
              </div>
              <div className="space-y-2">
                {hotspots.filter(h => h.isRepeatOffender).slice(0, 5).map((hotspot, i) => (
                  <div
                    key={i}
                    className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-amber-400 font-medium">
                        {formatFrequency(hotspot.centerFrequencyHz)}
                      </span>
                      <span className="text-xs bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded">
                        {hotspot.occurrences}x detected
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span>Avg: {hotspot.avgAmplitudeDb.toFixed(1)}dB</span>
                      <span>Max: {hotspot.maxAmplitudeDb.toFixed(1)}dB</span>
                      <span>Suggested cut: -{hotspot.suggestedCutDb.toFixed(1)}dB</span>
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
              <span className="text-sm font-medium">All Problem Frequencies</span>
            </div>
            <ScrollArea className="h-[250px]">
              <div className="space-y-1.5 pr-3">
                {hotspots.length === 0 ? (
                  <div className="text-center text-muted-foreground text-sm py-8">
                    No feedback events recorded yet.
                    <br />
                    <span className="text-xs">Events will appear here as they are detected.</span>
                  </div>
                ) : (
                  hotspots.map((hotspot, i) => (
                    <div
                      key={i}
                      className={`rounded px-2 py-1.5 flex items-center justify-between ${
                        hotspot.isRepeatOffender
                          ? 'bg-amber-500/10 border-l-2 border-amber-500'
                          : 'bg-muted/30'
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
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{hotspot.occurrences}x</span>
                        <span>{(hotspot.avgConfidence * 100).toFixed(0)}% conf</span>
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
              disabled={!summary || summary.totalEvents === 0}
            >
              <Download className="h-3 w-3 mr-1" />
              CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={handleExportJSON}
              disabled={!summary || summary.totalEvents === 0}
            >
              <Download className="h-3 w-3 mr-1" />
              JSON
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClear}
              className="text-destructive hover:text-destructive"
              disabled={!summary || summary.totalEvents === 0}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
