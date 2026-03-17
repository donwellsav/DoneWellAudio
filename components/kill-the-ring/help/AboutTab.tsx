'use client'

import { memo } from 'react'
import { CHANGELOG } from '@/lib/changelog'
import { HelpSection, TYPE_STYLES } from './HelpShared'

export const AboutTab = memo(function AboutTab() {
  return (
    <>
      <div className="flex flex-col items-center text-center py-6 space-y-3">
        <div className="text-3xl font-black tracking-tighter font-mono">
          KILL THE <span className="text-primary drop-shadow-[0_0_10px_rgba(75,146,255,0.4)]">RING</span>
        </div>
        <div className="text-sm text-muted-foreground/80 font-mono tracking-[0.2em] uppercase">Real-Time Acoustic Feedback Detection</div>
        <div className="font-mono text-sm bg-card/80 text-muted-foreground px-3 py-1.5 rounded border">
          v{process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0'}
        </div>
      </div>

      {/* Group: Project Info */}
      <div>
        <div className="py-1.5 px-2 section-label panel-groove bg-card/60">Project Info</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 pt-3">
          <HelpSection title="About">
            <p>
              Kill The Ring is a professional real-time acoustic feedback detection and analysis tool
              for live sound engineers. It uses 6 detection algorithms from peer-reviewed acoustic
              research to identify feedback frequencies and deliver EQ recommendations with pitch translation.
            </p>
            <p className="mt-2">
              The app is <strong>analysis-only</strong> — it never outputs or modifies audio.
              All processing happens locally in your browser via Web Audio API and Web Workers.
            </p>
          </HelpSection>

          <HelpSection title="Tech">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
              <span className="text-muted-foreground">Platform</span><span className="font-mono">Progressive Web App</span>
              <span className="text-muted-foreground">Framework</span><span className="font-mono">Next.js + React 19</span>
              <span className="text-muted-foreground">Audio</span><span className="font-mono">Web Audio API + Web Workers</span>
              <span className="text-muted-foreground">Algorithms</span><span className="font-mono">6 (MSD, Phase, Spectral/Compression, Comb, IHR, PTMR)</span>
              <span className="text-muted-foreground">Offline</span><span className="font-mono">Service worker cached</span>
            </div>
          </HelpSection>

          <HelpSection title="Credits">
            <p>Built by <strong>Don Wells AV</strong></p>
            <p className="mt-1 text-sm">
              Algorithm research: DAFx-16, KU Leuven (2025), DBX, Hopkins (2007), IEC 61672-1
            </p>
          </HelpSection>
        </div>
      </div>

      {/* Changelog — compact entries */}
      <div>
        <div className="py-1.5 px-2 section-label panel-groove bg-card/60">Changelog</div>
        <div className="space-y-1.5 pt-3">
          {CHANGELOG.map((entry) => (
            <div key={entry.version} className="bg-card/80 rounded border p-2.5">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="font-mono text-sm font-bold text-foreground">v{entry.version}</span>
                <span className="text-xs text-muted-foreground font-mono">{entry.date}</span>
                {entry.highlights && (
                  <span className="text-xs text-primary font-mono">· {entry.highlights}</span>
                )}
              </div>
              <div className="space-y-1">
                {entry.changes.map((change) => {
                  const style = TYPE_STYLES[change.type]
                  return (
                    <div key={change.description} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-mono font-medium leading-none shrink-0 mt-0.5 ${style.className}`}>
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
      </div>
    </>
  )
})
