'use client'

import { memo } from 'react'
import { CHANGELOG } from '@/lib/changelog'
import { HelpSection, HelpGroup, TYPE_STYLES } from './HelpShared'

export const AboutTab = memo(function AboutTab() {
  const formatEntryVersion = (version: string) => (/^[0-9]/.test(version) ? `v${version}` : version)
  const [latestEntry, ...olderEntries] = CHANGELOG

  return (
    <>
      <div className="flex flex-col items-center py-6 text-center space-y-3">
        <div className="font-mono text-3xl font-black tracking-tighter">
          DONEWELL <span className="text-[var(--console-blue)] drop-shadow-[0_0_10px_rgba(75,146,255,0.35)]">AUDIO</span>
        </div>
        <div className="font-mono text-sm uppercase tracking-[0.2em] text-muted-foreground/80">Real-Time Acoustic Feedback Detection</div>
        <div className="rounded border bg-card/80 px-3 py-1.5 font-mono text-sm text-muted-foreground">
          v{process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0'}
        </div>
      </div>

      <HelpGroup title="Project Info">
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
          <HelpSection title="About" color="amber">
            <p>
              DoneWell Audio is a professional real-time acoustic feedback detection and analysis tool
              for live sound engineers. It uses 7 detection algorithms (6 classical + ML) from peer-reviewed acoustic
              research to identify feedback frequencies and deliver EQ recommendations with pitch translation.
            </p>
            <p className="mt-2">
              The app is <strong>analysis-only</strong> - it never outputs or modifies audio.
              All processing happens locally in your browser via Web Audio API and Web Workers.
            </p>
          </HelpSection>

          <HelpSection title="Tech" color="blue">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
              <span className="text-muted-foreground">Platform</span><span className="font-mono">Progressive Web App</span>
              <span className="text-muted-foreground">Framework</span><span className="font-mono">Next.js + React 19</span>
              <span className="text-muted-foreground">Audio</span><span className="font-mono">Web Audio API + Web Workers</span>
              <span className="text-muted-foreground">Algorithms</span><span className="font-mono">7 (MSD, Phase, Spectral, Comb, IHR, PTMR, ML)</span>
              <span className="text-muted-foreground">Offline</span><span className="font-mono">Service worker cached</span>
            </div>
          </HelpSection>

          <HelpSection title="Credits" color="amber">
            <p>Built by <strong>Don Wells AV</strong></p>
            <p className="mt-1 text-sm">
              Algorithm research: DAFx-16, KU Leuven (2025), DBX, Hopkins (2007), IEC 61672-1
            </p>
          </HelpSection>
        </div>
      </HelpGroup>

      <HelpGroup title="Latest Release">
        <HelpSection title={formatEntryVersion(latestEntry.version)} color="blue">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs text-muted-foreground">
              <span>{latestEntry.date}</span>
              {latestEntry.highlights && (
                <span style={{ color: 'var(--console-blue)' }}>{latestEntry.highlights}</span>
              )}
              <span>{latestEntry.changes.length} changes</span>
            </div>
            <div className="space-y-1.5">
              {latestEntry.changes.map((change) => {
                const style = TYPE_STYLES[change.type]
                return (
                  <div
                    key={`${latestEntry.version}-${change.type}-${change.description}`}
                    className="flex items-start gap-2 text-sm text-muted-foreground"
                  >
                    <span className={`mt-0.5 inline-flex shrink-0 items-center rounded px-1.5 py-0.5 font-mono text-dwa-sm font-medium leading-none ${style.className}`}>
                      {style.label}
                    </span>
                    <span>{change.description}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </HelpSection>
      </HelpGroup>

      <HelpGroup title="Release History" defaultOpen={false}>
        <div className="space-y-1.5">
          {olderEntries.map((entry, i) => (
            <div key={`${entry.version}-${i}`} className="rounded border bg-card/80 p-2.5">
              <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-mono text-sm font-bold text-foreground">{formatEntryVersion(entry.version)}</span>
                <span className="font-mono text-xs text-muted-foreground">{entry.date}</span>
                {entry.highlights && (
                  <span className="font-mono text-xs" style={{ color: 'var(--console-blue)' }}>&middot; {entry.highlights}</span>
                )}
              </div>
              <div className="space-y-1">
                {entry.changes.map((change) => {
                  const style = TYPE_STYLES[change.type]
                  return (
                    <div
                      key={`${entry.version}-${change.type}-${change.description}`}
                      className="flex items-start gap-2 text-sm text-muted-foreground"
                    >
                      <span className={`mt-0.5 inline-flex shrink-0 items-center rounded px-1.5 py-0.5 font-mono text-dwa-sm font-medium leading-none ${style.className}`}>
                        {style.label}
                      </span>
                      <span>{change.description}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </HelpGroup>
    </>
  )
})
