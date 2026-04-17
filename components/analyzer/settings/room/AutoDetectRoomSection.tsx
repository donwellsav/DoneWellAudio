'use client'

import { memo } from 'react'
import { Mic, Square, X } from 'lucide-react'
import { ROOM_ESTIMATION } from '@/lib/dsp/constants'
import { useEngine } from '@/contexts/EngineContext'
import { Section } from '@/components/analyzer/settings/SettingsShared'

function metersToFeet(value: number) {
  return value * 3.28084
}

function formatDimension(valueM: number, unit: 'meters' | 'feet') {
  const displayValue = unit === 'feet' ? metersToFeet(valueM) : valueM
  return displayValue.toFixed(1)
}

interface AutoDetectRoomSectionProps {
  showTooltips: boolean
  unit: 'meters' | 'feet'
  onApplyEstimate: (dimensionsM: { length: number; width: number; height: number }) => void
}

export const AutoDetectRoomSection = memo(function AutoDetectRoomSection({
  showTooltips,
  unit,
  onApplyEstimate,
}: AutoDetectRoomSectionProps) {
  const {
    isRunning,
    roomEstimate,
    roomMeasuring,
    roomProgress,
    startRoomMeasurement,
    stopRoomMeasurement,
    clearRoomEstimate,
  } = useEngine()
  const progressPct = Math.min((roomProgress.elapsedMs / ROOM_ESTIMATION.ACCUMULATION_WINDOW_MS) * 100, 100)
  const unitLabel = unit === 'feet' ? 'ft' : 'm'

  return (
    <Section
      title="Auto-Detect Room"
      showTooltip={showTooltips}
      tooltip="Listens for low-frequency room resonances and estimates dimensions from their spacing. This is a resonance-derived estimate, not a full room analysis. Results are position-sensitive, work best in quiet conditions, and are most trustworthy in the low-frequency modal region. Requires analysis to be running."
    >
      <div className="space-y-3">
        <div className="rounded border border-border/40 bg-card/40 px-3 py-2.5">
          <p className="text-xs text-muted-foreground font-mono leading-relaxed">
            Resonance-derived estimate only. Move the mic or speaker and the dominant
            modes can change, so treat this as a low-frequency sizing clue rather than
            a full room characterization.
          </p>
        </div>

        <div className="grid grid-cols-1 @[340px]:grid-cols-2 gap-2">
          <div className="rounded border border-border/40 bg-card/40 px-3 py-2.5">
            <p className="text-xs font-mono uppercase tracking-wide text-[var(--console-green)]">Best For</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Low-frequency resonance, modal spacing, and rough room-size clues.
            </p>
          </div>

          <div className="rounded border border-border/40 bg-card/40 px-3 py-2.5">
            <p className="text-xs font-mono uppercase tracking-wide text-[var(--console-amber)]">Not For</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Early reflections, speech smear, or narrow high-frequency feedback calls.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {roomMeasuring ? (
            <button
              onClick={stopRoomMeasurement}
              className="flex-1 px-3 py-2 text-sm font-mono rounded bg-destructive/20 text-destructive hover:bg-destructive/30 cursor-pointer transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <Square className="w-3 h-3 inline mr-1" /> Stop Measuring
            </button>
          ) : (
            <button
              onClick={startRoomMeasurement}
              disabled={!isRunning}
              className="flex-1 px-3 py-2 text-sm font-mono rounded bg-primary/20 text-primary hover:bg-primary/30 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <Mic className="w-3.5 h-3.5 inline mr-1" /> Measure Room
            </button>
          )}

          {roomEstimate && !roomMeasuring ? (
            <button
              onClick={clearRoomEstimate}
              className="px-2 py-2 text-sm font-mono rounded bg-card/40 text-muted-foreground hover:bg-muted cursor-pointer transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              title="Clear estimate"
            >
              <X className="w-4 h-4" />
            </button>
          ) : null}
        </div>

        {!isRunning && !roomMeasuring ? (
          <p className="text-sm text-muted-foreground font-mono">
            Start analysis first, then estimate room dimensions from detected low-frequency resonances.
          </p>
        ) : null}

        {roomMeasuring ? (
          <div className="space-y-1.5">
            <div className="h-1.5 bg-card/60 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary/60 rounded-full transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <div className="flex justify-between text-sm text-muted-foreground font-mono">
              <span>Listening... {roomProgress.stablePeaks} stable peaks</span>
              <span>{Math.round(roomProgress.elapsedMs / 1000)}s / {ROOM_ESTIMATION.ACCUMULATION_WINDOW_MS / 1000}s</span>
            </div>
          </div>
        ) : null}

        {roomEstimate ? (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              {([
                ['L', roomEstimate.dimensions.length],
                ['W', roomEstimate.dimensions.width],
                ['H', roomEstimate.dimensions.height],
              ] as const).map(([label, valueM]) => (
                <div key={label} className="bg-primary/10 rounded px-2 py-1.5 text-center">
                  <div className="font-mono font-bold text-foreground tabular-nums">
                    {valueM > 0 ? `${formatDimension(valueM, unit)}${unitLabel}` : '-'}
                  </div>
                  <div className="text-sm text-muted-foreground font-mono">{label}</div>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-3 text-sm font-mono text-muted-foreground">
              <span>
                Confidence:{' '}
                <span className={
                  roomEstimate.confidence > 0.7
                    ? 'text-green-500'
                    : roomEstimate.confidence > 0.4
                      ? 'text-yellow-500'
                      : 'text-destructive'
                }>
                  {Math.round(roomEstimate.confidence * 100)}%
                </span>
              </span>
              <span>&bull;</span>
              <span>{roomEstimate.seriesFound}/3 axes found</span>
              <span>&bull;</span>
              <span>+/-{roomEstimate.residualError.toFixed(1)}Hz</span>
            </div>

            <div className="rounded border border-border/30 bg-card/30 px-3 py-2 text-sm text-muted-foreground">
              Use this estimate to understand low-frequency modal context. Do not use it to judge
              early reflections, speech clarity, or whether a single high-frequency peak is true feedback.
            </div>

            {roomEstimate.detectedSeries.map((series, index) => (
              <div key={index} className="text-sm font-mono pl-2 border-l-2 border-primary/30">
                <span className="text-muted-foreground">Axis {index + 1}:</span>{' '}
                <span className="text-foreground">{formatDimension(series.dimensionM, unit)}{unitLabel}</span>{' '}
                <span className="text-muted-foreground">
                  ({series.harmonicsMatched} harmonics @ {series.fundamentalHz.toFixed(1)}Hz spacing)
                </span>
              </div>
            ))}

            {roomEstimate.seriesFound >= 2 ? (
              <button
                onClick={() => onApplyEstimate({
                  length: roomEstimate.dimensions.length,
                  width: roomEstimate.dimensions.width,
                  height: roomEstimate.dimensions.height > 0 ? roomEstimate.dimensions.height : 2.7,
                })}
                className="w-full px-3 py-2 text-sm font-mono rounded bg-primary/20 text-primary hover:bg-primary/30 cursor-pointer transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                Apply to Room Settings
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </Section>
  )
})
