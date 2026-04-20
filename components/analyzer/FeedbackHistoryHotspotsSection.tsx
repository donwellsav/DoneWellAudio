'use client'

import { memo } from 'react'
import { AlertTriangle, BarChart3, TrendingUp } from 'lucide-react'
import type { FrequencyHotspot } from '@/lib/dsp/feedbackHistory'
import { formatHistoryFrequency } from './feedbackHistoryPanelUtils'

interface FeedbackHistoryHotspotsSectionProps {
  hotspots: FrequencyHotspot[]
  repeatOffenders: FrequencyHotspot[]
  gridClassName: string
}

export const FeedbackHistoryHotspotsSection = memo(function FeedbackHistoryHotspotsSection({
  hotspots,
  repeatOffenders,
  gridClassName,
}: FeedbackHistoryHotspotsSectionProps) {
  return (
    <>
      {repeatOffenders.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2 py-1.5 px-2 panel-groove bg-card/60">
            <AlertTriangle className="h-4 w-4 text-amber-700 dark:text-amber-400" />
            <span className="section-label">Repeat Offenders</span>
          </div>
          <div className={gridClassName}>
            {repeatOffenders.slice(0, 5).map((hotspot) => (
              <div
                key={`${hotspot.centerFrequencyHz}-${hotspot.lastSeen}`}
                className="bg-amber-100 border border-amber-300 hover:bg-amber-200 dark:bg-amber-500/10 dark:border-amber-500/30 dark:hover:bg-amber-500/15 rounded p-2 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-amber-800 dark:text-amber-400 font-medium">
                    {formatHistoryFrequency(hotspot.centerFrequencyHz)}
                  </span>
                  <span className="text-sm font-mono bg-amber-200 text-amber-900 dark:bg-amber-500/20 dark:text-amber-300 px-2 py-0.5 rounded">
                    {hotspot.occurrences}x detected
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground font-mono">
                  <span>Avg: {hotspot.avgAmplitudeDb.toFixed(1)}dB</span>
                  <span>Max: {hotspot.maxAmplitudeDb.toFixed(1)}dB</span>
                  <span>Cut: -{hotspot.suggestedCutDb.toFixed(1)}dB</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center gap-2 mb-2 py-1.5 px-2 panel-groove bg-card/60">
          <BarChart3 className="h-4 w-4" style={{ color: 'var(--console-amber)' }} />
          <span className="section-label">All Problem Frequencies</span>
        </div>
        <div className={hotspots.length === 0 ? 'space-y-1.5' : gridClassName}>
          {hotspots.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-1 bg-card/80 rounded border">
              <BarChart3 className="w-5 h-5 text-[rgba(var(--tint-r),var(--tint-g),var(--tint-b),0.30)] mb-1" />
              <span className="text-sm font-mono font-medium">No feedback events recorded yet</span>
              <span className="text-sm text-muted-foreground font-mono">Events will appear here as they are detected</span>
            </div>
          ) : (
            hotspots.map((hotspot) => (
              <div
                key={`${hotspot.centerFrequencyHz}-${hotspot.lastSeen}`}
                className={`rounded px-2 py-1.5 flex items-center justify-between transition-colors ${
                  hotspot.isRepeatOffender
                    ? 'bg-amber-100 shadow-[inset_2px_0_0_0_var(--console-amber)] hover:bg-amber-200 dark:bg-amber-500/10 dark:hover:bg-amber-500/15'
                    : 'bg-card/80 hover:bg-accent/5'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm">
                    {formatHistoryFrequency(hotspot.centerFrequencyHz)}
                  </span>
                  {hotspot.isRepeatOffender && (
                    <TrendingUp className="h-3 w-3 text-amber-700 dark:text-amber-400" />
                  )}
                </div>
                <div className="flex items-center gap-3 text-sm text-muted-foreground font-mono">
                  <span>{hotspot.occurrences}x</span>
                  <span>{(hotspot.avgConfidence * 100).toFixed(0)}%</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  )
})
