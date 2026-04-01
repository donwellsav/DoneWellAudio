'use client'

import React, { memo, useCallback } from 'react'
import { Slider } from '@/components/ui/slider'
import { ConsoleSlider } from '@/components/ui/console-slider'
import { useSettings } from '@/contexts/SettingsContext'
import type { DetectorSettings } from '@/types/advisory'
import { FREQ_RANGE_PRESETS } from '@/lib/dsp/constants'
import { roundFreqToNice } from '@/lib/utils/mathHelpers'
import { MODE_BASELINES } from '@/lib/settings/modeBaselines'

// ── Constants ────────────────────────────────────────────────────────────────

const LOG_MIN = Math.log10(20)
const LOG_MAX = Math.log10(20000)

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatFreqLabel(hz: number): string {
  if (hz >= 10000) return `${(hz / 1000).toFixed(0)}k`
  if (hz >= 1000) return `${(hz / 1000).toFixed(1)}k`
  return `${hz}`
}

// ── Props ────────────────────────────────────────────────────────────────────

interface LiveTabProps {
  settings: DetectorSettings
}

// ── LiveTab ──────────────────────────────────────────────────────────────────
// Show-time controls only: sensitivity + frequency range.
// No accordions — everything always visible, fast and obvious.

export const LiveTab = memo(function LiveTab({ settings }: LiveTabProps) {
  const ctx = useSettings()

  /** Sensitivity slider writes absolute dB; compute delta for layered model */
  const handleSensitivityChange = useCallback((v: number) => {
    const absoluteDb = 52 - v
    const baseline = MODE_BASELINES[ctx.session.modeId]
    const envOffset = ctx.session.environment.feedbackOffsetDb
    const currentEffective = baseline.feedbackThresholdDb + envOffset + ctx.session.liveOverrides.sensitivityOffsetDb
    const delta = absoluteDb - currentEffective
    if (delta !== 0) {
      ctx.setSensitivityOffset(ctx.session.liveOverrides.sensitivityOffsetDb + delta)
    }
  }, [ctx])

  const handleFreqSliderChange = useCallback(([logMin, logMax]: number[]) => {
    const newMin = roundFreqToNice(Math.pow(10, logMin))
    const newMax = roundFreqToNice(Math.pow(10, logMax))
    ctx.setFocusRange({ kind: 'custom', minHz: newMin, maxHz: newMax })
  }, [ctx])

  const handleFreqPresetClick = useCallback((minFrequency: number, maxFrequency: number) => {
    ctx.setFocusRange({ kind: 'custom', minHz: minFrequency, maxHz: maxFrequency })
  }, [ctx])

  return (
    <div className="space-y-2">

      {/* Sensitivity slider */}
      <ConsoleSlider
        label="Sensitivity"
        value={`${settings.feedbackThresholdDb}dB`}
        tooltip={settings.showTooltips ? 'Fader up = picks up more. Lower = catches subtle resonances. Higher = fewer false positives. Also draggable on the RTA spectrum.' : undefined}
        showTooltip={settings.showTooltips}
        min={2} max={50} step={1}
        sliderValue={52 - settings.feedbackThresholdDb}
        onChange={handleSensitivityChange}
      />

      {/* Section divider */}
      <div className="panel-groove-subtle" />

      {/* Frequency range presets + slider */}
      <div className="space-y-1 py-1">
        <div className="flex items-center gap-1 flex-wrap">
          {FREQ_RANGE_PRESETS.map((preset) => {
            const isActive = settings.minFrequency === preset.minFrequency && settings.maxFrequency === preset.maxFrequency
            return (
              <button key={preset.label} onClick={() => handleFreqPresetClick(preset.minFrequency, preset.maxFrequency)}
                className={`min-h-11 px-3 py-1.5 rounded-md flex flex-col items-center gap-0.5 text-xs font-mono font-bold tracking-wide transition-[color,background-color,border-color,box-shadow] cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 ${
                  isActive
                    ? 'bg-[rgba(75,146,255,0.12)] text-[var(--console-blue)] border border-[rgba(75,146,255,0.38)] shadow-[0_0_10px_rgba(75,146,255,0.16)]'
                    : 'bg-[rgba(255,255,255,0.03)] text-foreground/50 border border-[rgba(255,255,255,0.08)] hover:text-foreground/80 hover:border-border/50'
                }`}
              >
                {preset.label}
                <span className={`text-[9px] font-normal block ${isActive ? 'text-[rgba(75,146,255,0.65)]' : 'text-muted-foreground/50'}`}>{preset.shortRange}</span>
              </button>
            )
          })}
        </div>
        <div className="flex items-center justify-between">
          <span className="section-label" style={{ color: 'var(--console-blue)' }}>Freq Range</span>
          <span className="font-mono text-[13px] font-semibold tabular-nums text-[#4B92FF] dark:text-[#4B92FF]">{formatFreqLabel(settings.minFrequency)} – {formatFreqLabel(settings.maxFrequency)}</span>
        </div>
        <Slider value={[Math.log10(Math.max(20, settings.minFrequency)), Math.log10(Math.min(20000, settings.maxFrequency))]} onValueChange={handleFreqSliderChange} min={LOG_MIN} max={LOG_MAX} step={0.005} minStepsBetweenThumbs={0.1} />
      </div>

    </div>
  )
})
