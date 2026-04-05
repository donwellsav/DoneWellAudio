'use client'

import { memo } from 'react'

export const AudioAnalyzerFooter = memo(function AudioAnalyzerFooter() {
  return (
    <div className="hidden tablet:flex flex-shrink-0 items-center justify-center gap-2 py-0.5 bg-card/60 border-t border-border/30">
      <span className="font-mono text-[9px] font-bold tracking-[0.2em] text-muted-foreground/40 uppercase">
        DoneWell Audio Analyzer
      </span>
      <span className="font-mono text-[9px] tracking-[0.1em] text-muted-foreground/25 tabular-nums">
        v{process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0'}
      </span>
    </div>
  )
})
