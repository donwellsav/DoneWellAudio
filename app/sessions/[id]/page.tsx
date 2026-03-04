import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getSession, getSessionFrequencyStats } from '@/lib/db/sessions'
import { FrequencyHistogram } from '@/components/kill-the-ring/FrequencyHistogram'
import { Button } from '@/components/ui/button'
import { ArrowLeft, AlertCircle } from 'lucide-react'
import { formatFrequency, formatDuration, formatDate } from '@/lib/utils/pitchUtils'

const MODE_LABELS: Record<string, string> = {
  feedbackHunt: 'Feedback Hunt',
  vocalRing: 'Vocal Ring',
  musicAware: 'Music-Aware',
  aggressive: 'Aggressive',
  calibration: 'Calibration',
}

const SEVERITY_COLORS: Record<string, string> = {
  runaway:    '#ef4444',
  growing:    '#f97316',
  resonance:  '#eab308',
  ring:       '#a855f7',
  whistle:    '#06b6d4',
  instrument: '#22c55e',
  unknown:    '#6b7280',
}

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props) {
  const { id } = await params
  return {
    title: `Session ${id.slice(0, 8)} — Kill The Ring`,
    description: 'Frequency histogram and event breakdown for this analysis session',
  }
}

export default async function SessionDetailPage({ params }: Props) {
  const { id } = await params

  let session: Awaited<ReturnType<typeof getSession>>
  let bins: Awaited<ReturnType<typeof getSessionFrequencyStats>>

  try {
    ;[session, bins] = await Promise.all([
      getSession(id),
      getSessionFrequencyStats(id),
    ])
  } catch {
    return (
      <div className="flex flex-col min-h-screen">
        <SessionHeader id={id} />
        <main className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-center">
            <AlertCircle className="w-8 h-8 text-destructive/60" />
            <p className="text-sm font-medium text-foreground">Could not load session</p>
            <Button asChild size="sm" variant="outline"><Link href="/sessions">Back to Sessions</Link></Button>
          </div>
        </main>
      </div>
    )
  }

  if (!session) notFound()

  const totalIssues = session.event_count ?? 0
  const topBins = bins.slice().sort((a, b) => b.count - a.count).slice(0, 5)

  // Severity breakdown across all bins
  const severityTotals: Record<string, number> = {}
  for (const bin of bins) {
    for (const [sev, count] of Object.entries(bin.severities)) {
      severityTotals[sev] = (severityTotals[sev] ?? 0) + count
    }
  }
  const sortedSeverities = Object.entries(severityTotals).sort((a, b) => b[1] - a[1])

  return (
    <div className="flex flex-col min-h-screen">
      <SessionHeader id={id} />

      <main className="flex-1 p-4 sm:p-6 max-w-5xl mx-auto w-full space-y-6">

        {/* Meta strip */}
        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <span className="font-mono text-foreground/60 text-[10px] truncate max-w-[200px]" title={session.id}>{session.id}</span>
          <span>{formatDate(session.started_at)}</span>
          <span>{formatDuration(session.started_at, session.ended_at)}</span>
          <span>{MODE_LABELS[session.mode] ?? session.mode}</span>
          <span className="font-mono">{session.fft_size}pt FFT</span>
          {session.ended_at ? (
            <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-[10px]">Ended</span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px]">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              Live
            </span>
          )}
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Total Issues" value={totalIssues} />
          <StatCard label="Unique Bands" value={bins.length} />
          <StatCard
            label="Hottest Freq"
            value={topBins[0] ? formatFrequency(topBins[0].bandHz) : '—'}
          />
          <StatCard
            label="Top Severity"
            value={sortedSeverities[0]?.[0] ?? '—'}
            color={SEVERITY_COLORS[sortedSeverities[0]?.[0] ?? ''] ?? undefined}
          />
        </div>

        {/* Histogram */}
        <section className="rounded-lg border border-border bg-card/60 overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted/20 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Frequency Distribution</h2>
            <span className="text-[10px] text-muted-foreground">{bins.length} active band{bins.length === 1 ? '' : 's'}</span>
          </div>
          <div className="p-3">
            {bins.length > 0 ? (
              <FrequencyHistogram bins={bins} height={220} />
            ) : (
              <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
                No frequency data logged for this session
              </div>
            )}
          </div>
          {/* Legend */}
          {bins.length > 0 && (
            <div className="px-4 pb-3 flex flex-wrap gap-3">
              {Object.entries(SEVERITY_COLORS).filter(([k]) => severityTotals[k]).map(([sev, color]) => (
                <div key={sev} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }} />
                  <span className="capitalize">{sev}</span>
                  <span className="font-mono text-foreground">×{severityTotals[sev]}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Top 5 problematic bands */}
        {topBins.length > 0 && (
          <section className="rounded-lg border border-border bg-card/60 overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-muted/20">
              <h2 className="text-sm font-semibold text-foreground">Most Active Bands</h2>
            </div>
            <div className="divide-y divide-border">
              {topBins.map((bin, i) => {
                const dom = Object.entries(bin.severities).sort((a, b) => b[1] - a[1])[0]
                const color = dom ? (SEVERITY_COLORS[dom[0]] ?? '#6b7280') : '#6b7280'
                const freqLabel = formatFrequency(bin.bandHz)
                return (
                  <div key={bin.bandHz} className="flex items-center gap-4 px-4 py-2.5 text-xs">
                    <span className="text-muted-foreground font-mono w-4 text-right">{i + 1}</span>
                    <span className="font-mono font-medium text-foreground w-16">{freqLabel}</span>
                    <span className="text-[10px] capitalize px-2 py-0.5 rounded-full" style={{ backgroundColor: color + '22', color }}>
                      {dom?.[0] ?? 'unknown'}
                    </span>
                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${(bin.count / (topBins[0]?.count ?? 1)) * 100}%`,
                          backgroundColor: color,
                        }}
                      />
                    </div>
                    <span className="font-mono text-muted-foreground w-12 text-right">{bin.count}×</span>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        <div className="flex gap-3">
          <Button asChild size="sm" variant="outline">
            <Link href="/sessions">
              <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
              All Sessions
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/">New Session</Link>
          </Button>
        </div>
      </main>
    </div>
  )
}

function SessionHeader({ id }: { id: string }) {
  return (
    <header className="flex items-center gap-3 px-4 sm:px-6 py-3 border-b border-border bg-card/80 backdrop-blur-sm">
      <Button variant="ghost" size="sm" asChild className="gap-1.5 text-muted-foreground hover:text-foreground p-0 h-auto">
        <Link href="/sessions">
          <ArrowLeft className="w-4 h-4" />
          <span className="text-xs">Sessions</span>
        </Link>
      </Button>
      <div className="flex items-center gap-2 border-l border-border/50 pl-3">
        <svg className="w-4 h-4 text-primary" viewBox="0 0 24 24" fill="currentColor">
          <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.31-2.5-4.06v8.12c1.48-.75 2.5-2.29 2.5-4.06zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
        </svg>
        <div className="flex flex-col gap-0">
          <div className="leading-none">
            <span className="text-sm font-black tracking-tight text-foreground">KILL THE </span>
            <span className="text-base font-black tracking-tight text-primary">RING</span>
          </div>
          <span className="text-[7.5px] font-semibold tracking-widest text-muted-foreground uppercase">
            Session {id.slice(0, 8)}
          </span>
        </div>
      </div>
    </header>
  )
}

function StatCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card/60 px-4 py-3 flex flex-col gap-1">
      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</span>
      <span
        className="text-xl font-bold font-mono text-foreground capitalize"
        style={color ? { color } : undefined}
      >
        {value}
      </span>
    </div>
  )
}
