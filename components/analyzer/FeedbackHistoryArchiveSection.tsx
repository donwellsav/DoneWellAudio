'use client'

import { memo } from 'react'
import { Clock } from 'lucide-react'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import type { ArchivedSession } from '@/types/export'
import { formatHistoryFrequency } from './feedbackHistoryPanelUtils'

interface FeedbackHistoryArchiveSectionProps {
  archivedSessions: ArchivedSession[]
  onClearArchive: () => void
}

export const FeedbackHistoryArchiveSection = memo(function FeedbackHistoryArchiveSection({
  archivedSessions,
  onClearArchive,
}: FeedbackHistoryArchiveSectionProps) {
  return (
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
                <AlertDialogAction onClick={onClearArchive} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Clear
                </AlertDialogAction>
              </div>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      {archivedSessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-6 text-muted-foreground gap-1 bg-card/80 rounded border">
          <Clock className="w-5 h-5 text-[rgba(var(--tint-r),var(--tint-g),var(--tint-b),0.30)] mb-1" />
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
                <span className="text-xs px-1.5 py-0.5 rounded bg-[rgba(var(--tint-r),var(--tint-g),var(--tint-b),0.12)] font-mono" style={{ color: 'var(--console-amber)' }}>
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
                  {session.topHotspots.slice(0, 3).map((hotspot, index) => (
                    <span key={`${session.id}-${index}`}>
                      {formatHistoryFrequency(hotspot.centerFrequencyHz)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
})
