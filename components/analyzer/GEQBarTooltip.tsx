'use client'

import { memo } from 'react'
import type { BandRecommendation } from '@/lib/canvas/geqBarViewShared'

interface GEQBarTooltipProps {
  hoverRec: BandRecommendation
  hoverLabel: string
  hoverPos: { x: number; y: number }
  containerWidth: number
}

export const GEQBarTooltip = memo(function GEQBarTooltip({
  hoverRec,
  hoverLabel,
  hoverPos,
  containerWidth,
}: GEQBarTooltipProps) {
  return (
    <div
      className="absolute z-30 pointer-events-none px-2.5 py-1.5 rounded bg-card/95 backdrop-blur-sm border border-border/60 shadow-lg font-mono text-xs leading-relaxed"
      style={{
        left: Math.min(hoverPos.x + 12, containerWidth - 140),
        top: Math.max(hoverPos.y - 50, 4),
      }}
    >
      <div className="font-bold text-foreground">{hoverLabel} Hz</div>
      <div style={{ color: hoverRec.color }}>Cut: {hoverRec.suggestedDb} dB</div>
      {hoverRec.freq > 0 && (
        <div className="text-muted-foreground">
          Peak:{' '}
          {hoverRec.freq >= 1000
            ? `${(hoverRec.freq / 1000).toFixed(2)} kHz`
            : `${hoverRec.freq.toFixed(1)} Hz`}
        </div>
      )}
      {hoverRec.clusterCount > 1 && (
        <div className="text-muted-foreground">{hoverRec.clusterCount} peaks merged</div>
      )}
    </div>
  )
})
