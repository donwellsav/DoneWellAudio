'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { getEventLogger, type LogEntry, type FeedbackIssueLog } from '@/lib/logging/eventLogger'
import { Download, Trash2, FileJson, FileText, Sheet, BarChart3 } from 'lucide-react'

export function LogsViewer() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [stats, setStats] = useState<ReturnType<ReturnType<typeof getEventLogger>['getStats']>>({
    totalEvents: 0,
    issuesDetected: 0,
    sessionDuration: 0,
    avgFrequency: 0,
    avgAmplitude: 0,
    severities: {},
  })
  const [open, setOpen] = useState(false)

  const logger = getEventLogger()

  useEffect(() => {
    // Initial load
    setLogs(logger.getLogs())
    setStats(logger.getStats())

    // Subscribe to updates
    const unsubscribe = logger.subscribe((updatedLogs) => {
      setLogs(updatedLogs)
      setStats(logger.getStats())
    })

    return unsubscribe
  }, [])

  const handleExport = (format: 'csv' | 'json' | 'text') => {
    let content = ''
    let filename = `kill-the-ring-logs_${new Date().toISOString().split('T')[0]}`
    let mimeType = 'text/plain'

    switch (format) {
      case 'csv':
        content = logger.exportAsCSV()
        filename += '.csv'
        mimeType = 'text/csv'
        break
      case 'json':
        content = logger.exportAsJSON()
        filename += '.json'
        mimeType = 'application/json'
        break
      case 'text':
        content = logger.exportAsText()
        filename += '.txt'
        mimeType = 'text/plain'
        break
    }

    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    logger.logExport(format, logs.length)
  }

  // TODO: Replace native confirm() with AlertDialog for UI consistency (see ResetConfirmDialog pattern)
  const handleClear = () => {
    if (confirm('Clear all logs? This cannot be undone.')) {
      logger.clearLogs()
    }
  }

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString()
  }

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString()
  }

  const getLogIcon = (type: string) => {
    switch (type) {
      case 'issue_detected':
        return '🔊'
      case 'analysis_started':
        return '▶️'
      case 'analysis_stopped':
        return '⏹️'
      case 'settings_changed':
        return '⚙️'
      case 'export':
        return '📤'
      default:
        return '📝'
    }
  }

  const issueLogsCount = logs.filter(l => l.type === 'issue_detected').length

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button suppressHydrationWarning variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground" aria-label="Logs">
          <BarChart3 className="w-4 h-4" />
          <span className="hidden sm:inline text-xs">Logs</span>
          {issueLogsCount > 0 && (
            <span className="ml-0.5 sm:ml-1 px-1.5 py-0.5 bg-primary/20 text-primary text-[0.625rem] rounded-full font-medium">
              {issueLogsCount}
            </span>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>Event Logs</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="events" className="flex flex-col flex-1 min-h-0">
          <TabsList className="grid w-full grid-cols-3 flex-shrink-0">
            <TabsTrigger value="events">Events</TabsTrigger>
            <TabsTrigger value="statistics">Statistics</TabsTrigger>
            <TabsTrigger value="export">Export</TabsTrigger>
          </TabsList>

          <TabsContent value="events" className="flex-1 min-h-0 overflow-hidden flex flex-col mt-2">
            <div className="flex justify-between items-center mb-3 flex-shrink-0">
              <p className="text-sm text-muted-foreground">
                {logs.length} total events • {issueLogsCount} detected issues
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClear}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                Clear
              </Button>
            </div>

            <ScrollArea className="flex-1 min-h-0 border rounded-md p-3">
              <div className="space-y-2">
                {logs.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No events logged yet</p>
                ) : (
                  logs
                    .slice()
                    .reverse()
                    .map(log => (
                      <div
                        key={log.id}
                        className="p-2 border border-border rounded-md text-xs hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-start gap-2">
                          <span className="text-lg min-w-fit">{getLogIcon(log.type)}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-semibold capitalize">
                                {log.type.replace(/_/g, ' ')}
                              </span>
                              <span className="text-muted-foreground text-[0.625rem]">
                                {formatTimestamp(log.timestamp)}
                              </span>
                            </div>
                            {log.type === 'issue_detected' && (
                              <IssueLogDetails log={log as FeedbackIssueLog} />
                            )}
                            {log.type !== 'issue_detected' && (
                              <div className="text-muted-foreground">
                                {Object.entries(log.data)
                                  .map(([key, value]) => (
                                    <div key={key}>
                                      {key}: {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                                    </div>
                                  ))
                                  .slice(0, 2)}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="statistics" className="flex-1 min-h-0 overflow-y-auto mt-2">
            <div className="space-y-4 p-4">
              <div className="grid grid-cols-2 gap-3">
                <StatCard
                  label="Total Events"
                  value={stats.totalEvents.toString()}
                  icon="📊"
                />
                <StatCard
                  label="Issues Detected"
                  value={stats.issuesDetected.toString()}
                  icon="🔊"
                />
                <StatCard
                  label="Avg Frequency"
                  value={`${stats.avgFrequency.toFixed(0)} Hz`}
                  icon="📈"
                />
                <StatCard
                  label="Avg Amplitude"
                  value={`${stats.avgAmplitude.toFixed(1)} dB`}
                  icon="📉"
                />
                <StatCard
                  label="Session Duration"
                  value={formatDuration(stats.sessionDuration)}
                  icon="⏱️"
                />
              </div>

              {Object.keys(stats.severities).length > 0 && (
                <div className="border rounded-md p-3">
                  <h3 className="font-semibold text-sm mb-2">Issue Severity Distribution</h3>
                  <div className="space-y-2">
                    {Object.entries(stats.severities).map(([severity, count]) => (
                      <div key={severity} className="flex items-center justify-between text-sm">
                        <span className="capitalize text-muted-foreground">{severity}</span>
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary"
                              style={{
                                width: `${(count / stats.issuesDetected) * 100}%`,
                              }}
                            />
                          </div>
                          <span className="font-mono w-12 text-right">{count}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="export" className="flex-1 min-h-0 overflow-y-auto mt-2">
            <div className="space-y-3 p-4">
              <p className="text-sm text-muted-foreground">
                Export {logs.length} event(s) in your preferred format
              </p>

              <div className="space-y-2">
                <ExportButton
                  format="csv"
                  label="CSV"
                  description="Open in Excel or Sheets for analysis"
                  icon={<Sheet className="w-4 h-4" />}
                  onClick={() => handleExport('csv')}
                  disabled={logs.length === 0}
                />
                <ExportButton
                  format="json"
                  label="JSON"
                  description="Complete data structure for programmatic analysis"
                  icon={<FileJson className="w-4 h-4" />}
                  onClick={() => handleExport('json')}
                  disabled={logs.length === 0}
                />
                <ExportButton
                  format="text"
                  label="Plain Text"
                  description="Human-readable formatted report"
                  icon={<FileText className="w-4 h-4" />}
                  onClick={() => handleExport('text')}
                  disabled={logs.length === 0}
                />
              </div>

              <div className="border-t pt-3">
                <p className="text-xs text-muted-foreground mb-2">
                  💡 Tip: Logs are stored in your browser for this session. Export them before closing the page to keep them.
                </p>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

function IssueLogDetails({ log }: { log: FeedbackIssueLog }) {
  const data = log.data
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-muted-foreground text-[0.625rem]">
      <div>{data.frequency.toFixed(1)} Hz</div>
      <div>{data.amplitude.toFixed(1)} dB</div>
      <div className="capitalize">{data.severity}</div>
      <div className="capitalize">{data.classification}</div>
      <div>Q: {data.qFactor.toFixed(2)}</div>
      <div>{data.bandwidth.toFixed(1)} Hz wide</div>
    </div>
  )
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="border rounded-md p-3 bg-muted/50">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg">{icon}</span>
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  )
}

function ExportButton({
  format,
  label,
  description,
  icon,
  onClick,
  disabled,
}: {
  format: string
  label: string
  description: string
  icon: React.ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-start gap-3 p-3 border rounded-md hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-left"
    >
      <div className="mt-1">{icon}</div>
      <div className="flex-1">
        <div className="font-semibold text-sm">{label}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      <Download className="w-4 h-4 text-muted-foreground mt-1" />
    </button>
  )
}

function formatDuration(ms: number): string {
  if (ms < 1000) return '< 1s'
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`
  } else {
    return `${seconds}s`
  }
}
