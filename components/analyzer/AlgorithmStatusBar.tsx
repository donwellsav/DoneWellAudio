'use client'

/**
 * AlgorithmStatusBar - Displays advanced algorithm status and scores
 * Shows MSD, Phase, Spectral, Comb pattern detection status
 * Based on DAFx-16, DBX, and KU Leuven research papers
 */

import { memo } from 'react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { AlgorithmMode, ContentType } from '@/types/advisory'

interface AlgorithmStatusBarProps {
  algorithmMode?: AlgorithmMode
  contentType?: ContentType
  msdFrameCount?: number
  isCompressed?: boolean
  compressionRatio?: number
  isRunning: boolean
  showDetailed?: boolean
  actualFps?: number
  droppedPercent?: number
}

const ALGORITHM_MODE_LABELS: Record<AlgorithmMode, string> = {
  auto: 'AUTO',
  custom: 'CUSTOM',
  msd: 'MSD',
  phase: 'PHASE',
  combined: 'MSD+PH',
  all: 'ALL',
}

const CONTENT_TYPE_LABELS: Record<ContentType, { label: string; color: string }> = {
  speech: { label: 'SPEECH', color: 'text-blue-400' },
  music: { label: 'MUSIC', color: 'text-green-400' },
  compressed: { label: 'COMP', color: 'text-amber-400' },
  unknown: { label: '---', color: 'text-muted-foreground' },
}

export const AlgorithmStatusBar = memo(function AlgorithmStatusBar({
  algorithmMode = 'combined',
  contentType = 'unknown',
  msdFrameCount = 0,
  isCompressed = false,
  compressionRatio = 1,
  isRunning,
  showDetailed = false,
  actualFps = 0,
  droppedPercent = 0,
}: AlgorithmStatusBarProps) {
  const contentInfo = CONTENT_TYPE_LABELS[contentType]
  const msdReady = msdFrameCount >= 7 // Minimum for speech per DAFx paper
  const msdProgress = Math.min(msdFrameCount / 15, 1) * 100 // Progress to optimal

  if (!isRunning) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-0.5 text-sm tracking-wide text-muted-foreground">
        <span className="led-dot led-dot-waiting" />
        <span className="font-mono">ALGO: {ALGORITHM_MODE_LABELS[algorithmMode]}</span>
        <span className="text-muted-foreground/25 mx-0.5">|</span>
        <span className="font-mono">Waiting for audio...</span>
      </div>
    )
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex items-center gap-1.5 px-2 py-0.5 text-sm tracking-wide font-mono">
        <span className="led-dot led-dot-active" />
        {/* Algorithm Mode + auto-selected indicators */}
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-primary font-semibold inline-flex items-center gap-1">
              {ALGORITHM_MODE_LABELS[algorithmMode]}
              {algorithmMode === 'auto' && (
                <span className="text-muted-foreground font-normal">
                  · {msdReady ? 'All' : '−MSD'}
                </span>
              )}
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-sm max-w-[280px]">
            <p className="font-semibold">Algorithm Mode: {algorithmMode}</p>
            <p className="text-muted-foreground mt-1">
              {algorithmMode === 'combined' && 'MSD + Phase coherence (recommended)'}
              {algorithmMode === 'msd' && 'Magnitude Slope Deviation only'}
              {algorithmMode === 'phase' && 'Phase coherence only'}
              {algorithmMode === 'all' && 'All algorithms active'}
              {algorithmMode === 'auto' && (msdReady
                ? 'Auto: all 6 algorithms active (MSD buffer ready)'
                : 'Auto: 5 algorithms active (waiting for MSD buffer)'
              )}
            </p>
          </TooltipContent>
        </Tooltip>

        <span className="text-muted-foreground/20 mx-1">·</span>

        {/* Content Type */}
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={contentInfo.color}>
              {contentInfo.label}
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-sm max-w-[260px]">
            <p className="font-semibold">Detected Content: {contentType}</p>
            <p className="text-muted-foreground mt-1">
              {contentType === 'speech' && 'Vocal content detected - MSD highly accurate'}
              {contentType === 'music' && 'Musical content - phase coherence weighted higher'}
              {contentType === 'compressed' && 'Compressed audio - thresholds adjusted'}
              {contentType === 'unknown' && 'Content type not yet determined'}
            </p>
          </TooltipContent>
        </Tooltip>

        <span className="text-muted-foreground/20 mx-1">·</span>

        {/* MSD Buffer Status */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1">
              <span className={msdReady ? 'text-green-400' : 'text-muted-foreground'}>
                MSD
              </span>
              {showDetailed && (
                <div className="w-8 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${msdReady ? 'bg-green-500' : 'bg-amber-500'}`}
                    style={{ width: `${msdProgress}%` }}
                  />
                </div>
              )}
              <span className="text-muted-foreground/70 tabular-nums">{msdFrameCount}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-sm max-w-[280px]">
            <p className="font-semibold">MSD History Buffer: {msdFrameCount} frames</p>
            <p className="text-muted-foreground mt-1">
              {msdFrameCount < 7 && 'Collecting frames... (need 7+ for speech)'}
              {msdFrameCount >= 7 && msdFrameCount < 13 && 'Ready for speech analysis'}
              {msdFrameCount >= 13 && msdFrameCount < 30 && 'Ready for music analysis'}
              {msdFrameCount >= 30 && 'Optimal buffer for compressed content'}
            </p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              From DAFx-16: 7 frames = 100% speech accuracy
            </p>
          </TooltipContent>
        </Tooltip>

        {/* Compression Indicator */}
        {isCompressed && (
          <>
            <span className="text-muted-foreground/20 mx-1">·</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-amber-400 motion-safe:animate-pulse">
                  COMP {compressionRatio.toFixed(1)}:1
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-sm max-w-[260px]">
                <p className="font-semibold">Dynamic Compression Detected</p>
                <p className="text-muted-foreground mt-1">
                  Estimated ratio: {compressionRatio.toFixed(1)}:1
                </p>
                <p className="text-sm text-muted-foreground/70 mt-1">
                  Thresholds automatically adjusted to reduce false positives from sustained notes.
                </p>
              </TooltipContent>
            </Tooltip>
          </>
        )}

        {/* FPS Indicator — right-aligned */}
        {actualFps > 0 && (
          <>
            <span className="ml-auto" />
            <Tooltip>
              <TooltipTrigger asChild>
                <span className={`tabular-nums text-[10px] tracking-tight ${
                  droppedPercent > 20 ? 'text-red-400' : droppedPercent > 5 ? 'text-amber-400' : 'text-muted-foreground/50'
                }`}>
                  {actualFps}fps
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-sm max-w-[260px]">
                <p className="font-semibold">Rendering: {actualFps} fps</p>
                {droppedPercent > 0 && (
                  <p className={`mt-1 ${droppedPercent > 20 ? 'text-red-400' : 'text-amber-400'}`}>
                    {droppedPercent}% frames dropped
                  </p>
                )}
                <p className="text-muted-foreground mt-1">
                  {droppedPercent > 20
                    ? 'Severe drops — try reducing FFT size or closing other tabs'
                    : droppedPercent > 5
                      ? 'Some frame drops detected'
                      : 'Rendering smoothly'}
                </p>
              </TooltipContent>
            </Tooltip>
          </>
        )}
      </div>
    </TooltipProvider>
  )
})
