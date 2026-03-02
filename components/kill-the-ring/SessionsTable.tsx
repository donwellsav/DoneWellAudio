'use client'

import { useTransition, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import type { Session } from '@/lib/db/sessions'
import { formatDuration, formatDate } from '@/lib/utils/pitchUtils'

/** Renders date only on the client to avoid server/client timezone mismatch */
function ClientDate({ dateStr }: { dateStr: string }) {
  const [formatted, setFormatted] = useState<string>('')
  useEffect(() => {
    setFormatted(formatDate(dateStr))
  }, [dateStr])
  return <span suppressHydrationWarning>{formatted}</span>
}

const MODE_LABELS: Record<string, string> = {
  feedbackHunt: 'Feedback Hunt',
  vocalRing: 'Vocal Ring',
  musicAware: 'Music-Aware',
  aggressive: 'Aggressive',
  calibration: 'Calibration',
}

function DeleteButton({ id }: { id: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [confirmed, setConfirmed] = useState(false)

  const handleClick = () => {
    if (!confirmed) {
      setConfirmed(true)
      return
    }
    startTransition(async () => {
      await fetch(`/api/sessions/${id}`, { method: 'DELETE' })
      router.refresh()
    })
  }

  // Auto-reset confirm state after 3s — cleanup prevents setState on unmount
  useEffect(() => {
    if (!confirmed) return
    const t = setTimeout(() => setConfirmed(false), 3000)
    return () => clearTimeout(t)
  }, [confirmed])

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleClick}
      disabled={isPending}
      aria-label={confirmed ? 'Confirm delete session' : 'Delete session'}
      className={`h-7 w-7 p-0 transition-colors ${
        confirmed
          ? 'text-destructive hover:text-destructive hover:bg-destructive/10'
          : 'text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10'
      } ${isPending ? 'opacity-50' : ''}`}
    >
      <Trash2 className="w-3.5 h-3.5" />
    </Button>
  )
}

interface SessionsTableProps {
  sessions: Session[]
}

export function SessionsTable({ sessions }: SessionsTableProps) {
  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 border border-dashed border-border rounded-lg text-center gap-3">
        <svg className="w-10 h-10 text-muted-foreground/30" viewBox="0 0 24 24" fill="currentColor">
          <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.31-2.5-4.06v8.12c1.48-.75 2.5-2.29 2.5-4.06zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
        </svg>
        <p className="text-sm text-muted-foreground">No sessions yet</p>
        <p className="text-xs text-muted-foreground/70">Start an analysis on the main page to record your first session.</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      {/* Desktop table */}
      <table className="hidden sm:table w-full text-xs">
        <thead>
          <tr className="border-b border-border bg-muted/30">
            <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Started</th>
            <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Mode</th>
            <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">FFT</th>
            <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Duration</th>
            <th className="text-right px-4 py-2.5 text-muted-foreground font-medium">Issues</th>
            <th className="text-right px-4 py-2.5 text-muted-foreground font-medium">Status</th>
            <th className="w-10 px-2 py-2.5" aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {sessions.map((s, i) => (
            <tr
              key={s.id}
              className={`border-b border-border last:border-0 hover:bg-muted/20 transition-colors group ${i % 2 === 0 ? '' : 'bg-muted/5'}`}
            >
              <td className="px-4 py-3 font-mono text-foreground/80">
                <Link href={`/sessions/${s.id}`} className="hover:text-foreground hover:underline underline-offset-2">
                  <ClientDate dateStr={s.started_at} />
                </Link>
              </td>
              <td className="px-4 py-3 text-foreground">{MODE_LABELS[s.mode] ?? s.mode}</td>
              <td className="px-4 py-3 font-mono text-muted-foreground">{s.fft_size}</td>
              <td className="px-4 py-3 font-mono text-muted-foreground">{formatDuration(s.started_at, s.ended_at)}</td>
              <td className="px-4 py-3 text-right">
                <span className={`font-mono font-medium ${(s.event_count ?? 0) > 0 ? 'text-primary' : 'text-muted-foreground'}`}>
                  {s.event_count ?? 0}
                </span>
              </td>
              <td className="px-4 py-3 text-right">
                {s.ended_at ? (
                  <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                    Ended
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                    Live
                  </span>
                )}
              </td>
              <td className="px-2 py-3 text-right">
                <div className="flex items-center justify-end gap-1">
                  <Button variant="ghost" size="sm" asChild className="h-7 w-7 p-0 text-muted-foreground/40 hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity" aria-label="View session detail">
                    <Link href={`/sessions/${s.id}`}><ChevronRight className="w-3.5 h-3.5" /></Link>
                  </Button>
                  <DeleteButton id={s.id} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Mobile card list */}
      <div className="sm:hidden divide-y divide-border">
        {sessions.map((s) => (
          <div key={s.id} className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <Link href={`/sessions/${s.id}`} className="text-xs font-medium text-foreground hover:underline underline-offset-2">
                <ClientDate dateStr={s.started_at} />
              </Link>
              <div className="flex items-center gap-2">
                {s.ended_at ? (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Ended</span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                    Live
                  </span>
                )}
                <DeleteButton id={s.id} />
              </div>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>{MODE_LABELS[s.mode] ?? s.mode}</span>
              <span className="font-mono">{s.fft_size}pt</span>
              <span className="font-mono">{formatDuration(s.started_at, s.ended_at)}</span>
            </div>
            <div className="text-xs">
              <span className="text-muted-foreground">Issues: </span>
              <span className={`font-mono font-medium ${(s.event_count ?? 0) > 0 ? 'text-primary' : 'text-muted-foreground'}`}>
                {s.event_count ?? 0}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
