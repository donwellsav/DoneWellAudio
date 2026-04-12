'use client'

import { memo } from 'react'
import { useEngine } from '@/contexts/EngineContext'
import { useMetering } from '@/contexts/MeteringContext'
import { useSettings } from '@/contexts/SettingsContext'
import type { AlgorithmMode, ContentType } from '@/types/advisory'

const MODE_LABELS: Record<AlgorithmMode, string> = {
  auto: 'AUTO',
  custom: 'CUSTOM',
  msd: 'MSD',
  phase: 'PHASE',
  combined: 'MSD+PH',
  all: 'ALL',
}

const CONTENT_LABELS: Record<ContentType, string> = {
  speech: 'SPEECH',
  music: 'MUSIC',
  compressed: 'COMP',
  unknown: '---',
}

/** Shared footer text style — matches the DoneWell branding */
const FOOTER_TEXT = 'font-mono text-[9px] font-bold tracking-[0.2em] text-muted-foreground/40 uppercase'

export const AudioAnalyzerFooter = memo(function AudioAnalyzerFooter() {
  const { isRunning } = useEngine()
  const { spectrumStatus } = useMetering()
  const { settings } = useSettings()

  const algoMode = spectrumStatus?.algorithmMode ?? settings.algorithmMode
  const contentType = spectrumStatus?.contentType ?? 'unknown'
  const msdFrameCount = spectrumStatus?.msdFrameCount ?? 0
  const msdReady = msdFrameCount >= 7

  return (
    <div className="hidden tablet:flex flex-shrink-0 items-center py-0.5 px-3 bg-card/60 border-t border-border/30">
      {/* Left: Algorithm status */}
      <div className="flex-1 flex items-center gap-1.5">
        <span className={FOOTER_TEXT}>
          {MODE_LABELS[algoMode]}
        </span>
        {isRunning && (
          <>
            <span className="font-mono text-[9px] text-muted-foreground/20">·</span>
            <span className={FOOTER_TEXT}>
              {CONTENT_LABELS[contentType]}
            </span>
            <span className="font-mono text-[9px] text-muted-foreground/20">·</span>
            <span className={`font-mono text-[9px] font-bold tracking-[0.2em] uppercase ${msdReady ? 'text-muted-foreground/40' : 'text-muted-foreground/25'}`}>
              MSD {msdFrameCount}
            </span>
          </>
        )}
      </div>

      {/* Center: Branding */}
      <div className="flex items-center gap-2">
        <span className={FOOTER_TEXT}>
          DoneWell Audio Analyzer
        </span>
        <span className="font-mono text-[9px] tracking-[0.1em] text-muted-foreground/25 tabular-nums">
          v{process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0'}
        </span>
      </div>

      {/* Right: spacer for symmetry */}
      <div className="flex-1" />
    </div>
  )
})
