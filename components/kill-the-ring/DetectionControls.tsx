'use client'

import React, { memo, useCallback } from 'react'
import { HelpCircle } from 'lucide-react'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { DetectorSettings, OperationMode, AlgorithmMode, Algorithm } from '@/types/advisory'
import { FREQ_RANGE_PRESETS } from '@/lib/dsp/constants'
import { roundFreqToNice } from '@/lib/utils/mathHelpers'

interface DetectionControlsProps {
  settings: DetectorSettings
  onModeChange: (mode: OperationMode) => void
  onSettingsChange: (settings: Partial<DetectorSettings>) => void
}

const LOG_MIN = Math.log10(20)
const LOG_MAX = Math.log10(20000)

function formatFreqLabel(hz: number): string {
  if (hz >= 10000) return `${(hz / 1000).toFixed(0)}k`
  if (hz >= 1000) return `${(hz / 1000).toFixed(1)}k`
  return `${hz}`
}

export const DetectionControls = memo(function DetectionControls({ settings, onModeChange, onSettingsChange }: DetectionControlsProps) {

  const handleFreqSliderChange = useCallback(([logMin, logMax]: number[]) => {
    const newMin = roundFreqToNice(Math.pow(10, logMin))
    const newMax = roundFreqToNice(Math.pow(10, logMax))
    onSettingsChange({ minFrequency: newMin, maxFrequency: newMax })
  }, [onSettingsChange])

  return (
    <TooltipProvider delayDuration={400}>
      <div className="space-y-1.5">

        {/* Freq range — dual slider + preset chips */}
        <div className="space-y-1">
          {/* Preset chips */}
          <div className="flex items-center gap-1 flex-wrap">
            {FREQ_RANGE_PRESETS.map((preset) => {
              const isActive = settings.minFrequency === preset.minFrequency
                && settings.maxFrequency === preset.maxFrequency
              return (
                <button
                  key={preset.label}
                  onClick={() => onSettingsChange({
                    minFrequency: preset.minFrequency,
                    maxFrequency: preset.maxFrequency,
                  })}
                  className={`px-1.5 py-0.5 rounded text-[0.625rem] font-medium transition-colors ${
                    isActive
                      ? 'bg-primary/20 text-primary border border-primary/40'
                      : 'text-muted-foreground hover:text-foreground border border-transparent hover:border-border'
                  }`}
                >
                  {preset.label}
                </button>
              )
            })}
          </div>

          {/* Hz range label */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Freq Range</span>
            <span className="text-xs font-mono text-foreground tabular-nums">
              {formatFreqLabel(settings.minFrequency)}-{formatFreqLabel(settings.maxFrequency)}
            </span>
          </div>

          {/* Dual-thumb logarithmic slider */}
          <Slider
            value={[Math.log10(Math.max(20, settings.minFrequency)), Math.log10(Math.min(20000, settings.maxFrequency))]}
            onValueChange={handleFreqSliderChange}
            min={LOG_MIN}
            max={LOG_MAX}
            step={0.005}
            minStepsBetweenThumbs={0.1}
          />
        </div>

        {/* Auto Music-Aware toggle */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Music-Aware</span>
            {settings.showTooltips && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="w-3 h-3 text-muted-foreground/40 hover:text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-[200px] text-xs">
                  Auto-activates when signal rises {settings.autoMusicAwareHysteresisDb}dB above noise floor.
                </TooltipContent>
              </Tooltip>
            )}
            {settings.autoMusicAware && (
              <span className={`px-1 py-px rounded text-[0.625rem] font-medium border leading-4 ${
                settings.musicAware
                  ? 'bg-primary/10 border-primary/40 text-primary'
                  : 'bg-muted border-border text-muted-foreground'
              }`}>
                {settings.musicAware ? 'ON' : 'OFF'}
              </span>
            )}
          </div>
          <button
            role="switch"
            aria-checked={settings.autoMusicAware}
            aria-label="Toggle auto music-aware mode"
            onClick={() => onSettingsChange({ autoMusicAware: !settings.autoMusicAware })}
            className={`relative inline-flex h-4 w-7 flex-shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
              settings.autoMusicAware ? 'bg-primary' : 'bg-muted'
            }`}
          >
            <span className={`inline-block h-3 w-3 transform rounded-full bg-background shadow transition-transform ${
              settings.autoMusicAware ? 'translate-x-3.5' : 'translate-x-0.5'
            }`} />
          </button>
        </div>

        {/* Sliders */}
        <div className="space-y-0">
          <div className="pb-1.5">
            <SliderRow
              label="Threshold"
              value={`${settings.feedbackThresholdDb}dB`}
              tooltip={settings.showTooltips ? 'Primary sensitivity. 4-6 dB sensitive (speech/monitors), 8-10 dB balanced (worship/outdoor), 12+ dB conservative (live music).' : undefined}
              min={2} max={20} step={1}
              sliderValue={settings.feedbackThresholdDb}
              onChange={(v) => onSettingsChange({ feedbackThresholdDb: v })}
            />
            <div className="flex items-center justify-end gap-1.5 mt-0.5">
              <label htmlFor="show-threshold-line" className="text-[0.5625rem] text-muted-foreground cursor-pointer">Show on RTA</label>
              <Switch
                id="show-threshold-line"
                checked={settings.showThresholdLine}
                onCheckedChange={(checked) => onSettingsChange({ showThresholdLine: checked })}
                className="h-3.5 w-7 [&>span]:size-2.5"
              />
            </div>
          </div>
          <div className="py-1.5">
            <SliderRow
              label="Ring"
              value={`${settings.ringThresholdDb}dB`}
              tooltip={settings.showTooltips ? 'Resonance detection. 2-3 dB ring out/monitors, 4-5 dB normal, 6+ dB live music/outdoor.' : undefined}
              min={1} max={12} step={0.5}
              sliderValue={settings.ringThresholdDb}
              onChange={(v) => onSettingsChange({ ringThresholdDb: v })}
            />
          </div>
          <div className="pt-1.5">
            <SliderRow
              label="Growth"
              value={`${settings.growthRateThreshold.toFixed(1)}dB/s`}
              tooltip={settings.showTooltips ? 'How fast feedback must grow. 0.5-1dB/s catches early, 3+dB/s only runaway.' : undefined}
              min={0.5} max={8} step={0.5}
              sliderValue={settings.growthRateThreshold}
              onChange={(v) => onSettingsChange({ growthRateThreshold: v })}
            />
          </div>
          {settings.autoGainEnabled && (
            <div className="pt-1.5">
              <SliderRow
                label="AG Target"
                value={`${settings.autoGainTargetDb} dBFS`}
                tooltip={settings.showTooltips ? 'Post-gain peak target. Lower = fewer false positives, less sensitivity. -12 hot (ring out), -18 balanced, -24 conservative (broadcast).' : undefined}
                min={-30} max={-6} step={1}
                sliderValue={settings.autoGainTargetDb}
                onChange={(v) => onSettingsChange({ autoGainTargetDb: v })}
              />
            </div>
          )}
          <div className="pt-1.5">
            <SliderRow
              label="Confidence"
              value={`${Math.round((settings.confidenceThreshold ?? 0.35) * 100)}%`}
              tooltip={settings.showTooltips ? 'Minimum confidence to flag an issue. 25-35% aggressive (ring out), 45-55% balanced, 60%+ conservative (live music).' : undefined}
              min={0.2} max={0.8} step={0.05}
              sliderValue={settings.confidenceThreshold ?? 0.35}
              onChange={(v) => onSettingsChange({ confidenceThreshold: v })}
            />
          </div>
          <div className="pt-1.5">
            <SliderRow
              label="Sustain"
              value={`${settings.sustainMs}ms`}
              tooltip={settings.showTooltips ? 'How long a peak must persist before flagging. 100-200ms aggressive, 300-500ms balanced, 600ms+ filters transients.' : undefined}
              min={100} max={1000} step={50}
              sliderValue={settings.sustainMs}
              onChange={(v) => onSettingsChange({ sustainMs: v })}
            />
          </div>
        </div>

        {/* Algorithm Mode toggle grid */}
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">Algorithm Mode</span>
          <button
            onClick={() => {
              if (settings.algorithmMode !== 'auto') {
                onSettingsChange({ algorithmMode: 'auto' as AlgorithmMode })
              } else {
                onSettingsChange({ algorithmMode: 'custom' as AlgorithmMode })
              }
            }}
            className={`w-full px-1.5 py-0.5 rounded text-[0.625rem] font-medium transition-colors ${
              settings.algorithmMode === 'auto'
                ? 'bg-primary/20 text-primary border border-primary/40'
                : 'text-muted-foreground hover:text-foreground border border-transparent hover:border-border'
            }`}
          >
            Auto
          </button>
          <div className={`grid grid-cols-3 gap-1 ${settings.algorithmMode === 'auto' ? 'opacity-40 pointer-events-none' : ''}`}>
            {([
              ['msd', 'MSD'], ['phase', 'Phase'], ['spectral', 'Spectral'],
              ['comb', 'Comb'], ['ihr', 'IHR'], ['ptmr', 'PTMR'],
            ] as const).map(([key, label]) => {
              const enabled = settings.enabledAlgorithms?.includes(key) ?? true
              return (
                <button
                  key={key}
                  onClick={() => {
                    const current = settings.enabledAlgorithms ?? ['msd', 'phase', 'spectral', 'comb', 'ihr', 'ptmr']
                    let next: Algorithm[]
                    if (enabled) {
                      next = current.filter(a => a !== key)
                      if (next.length === 0) {
                        onSettingsChange({ algorithmMode: 'auto' as AlgorithmMode })
                        return
                      }
                    } else {
                      next = [...current, key]
                    }
                    onSettingsChange({ enabledAlgorithms: next })
                  }}
                  className={`px-1 py-0.5 rounded text-[0.625rem] font-medium text-center transition-colors ${
                    enabled
                      ? 'bg-primary/20 text-primary border border-primary/40'
                      : 'text-muted-foreground hover:text-foreground border border-transparent hover:border-border'
                  }`}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>

        {/* A-Weighting toggle */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">A-Weight</span>
            {settings.showTooltips && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="w-3 h-3 text-muted-foreground/40 hover:text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-[200px] text-xs">
                  Apply IEC 61672-1 A-weighting. Emphasizes frequencies humans hear most (1-5kHz). Disable for flat response.
                </TooltipContent>
              </Tooltip>
            )}
          </div>
          <button
            role="switch"
            aria-checked={settings.aWeightingEnabled}
            aria-label="Toggle A-weighting"
            onClick={() => onSettingsChange({ aWeightingEnabled: !settings.aWeightingEnabled })}
            className={`relative inline-flex h-4 w-7 flex-shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
              settings.aWeightingEnabled ? 'bg-primary' : 'bg-muted'
            }`}
          >
            <span className={`inline-block h-3 w-3 transform rounded-full bg-background shadow transition-transform ${
              settings.aWeightingEnabled ? 'translate-x-3.5' : 'translate-x-0.5'
            }`} />
          </button>
        </div>

        {/* ─── Additional Controls ─────────────────────────────── */}
        <div className="border-t border-border pt-1.5 mt-1.5 space-y-1.5">

          {/* Operation Mode chips */}
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">Mode</span>
            <div className="flex items-center gap-1 flex-wrap">
              {([
                ['speech', 'Speech'],
                ['worship', 'Worship'],
                ['liveMusic', 'Live'],
                ['theater', 'Theater'],
                ['monitors', 'Monitors'],
                ['ringOut', 'Ring Out'],
                ['broadcast', 'Broadcast'],
                ['outdoor', 'Outdoor'],
              ] as const).map(([mode, label]) => {
                const isActive = settings.mode === mode
                return (
                  <button
                    key={mode}
                    onClick={() => onModeChange(mode)}
                    className={`px-1.5 py-0.5 rounded text-[0.625rem] font-medium transition-colors ${
                      isActive
                        ? 'bg-primary/20 text-primary border border-primary/40'
                        : 'text-muted-foreground hover:text-foreground border border-transparent hover:border-border'
                    }`}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Hold Time slider */}
          <SliderRow
            label="Hold"
            value={`${(settings.holdTimeMs / 1000).toFixed(1)}s`}
            tooltip={settings.showTooltips ? 'How long feedback stays flagged on screen. 0.5-1s fast workflow, 2-3s relaxed monitoring.' : undefined}
            min={500} max={5000} step={100}
            sliderValue={settings.holdTimeMs}
            onChange={(v) => onSettingsChange({ holdTimeMs: v })}
          />

          {/* Clear Time slider */}
          <SliderRow
            label="Clear"
            value={`${settings.clearMs}ms`}
            tooltip={settings.showTooltips ? 'How fast resolved issues disappear. 100-200ms snappy, 400-600ms smooth, 1000ms+ persistent.' : undefined}
            min={100} max={2000} step={50}
            sliderValue={settings.clearMs}
            onChange={(v) => onSettingsChange({ clearMs: v })}
          />

          {/* Max Issues slider */}
          <SliderRow
            label="Max Issues"
            value={`${settings.maxDisplayedIssues}`}
            tooltip={settings.showTooltips ? 'How many feedback issues display at once. 3-6 for focused work, 8-12 for full overview.' : undefined}
            min={3} max={12} step={1}
            sliderValue={settings.maxDisplayedIssues}
            onChange={(v) => onSettingsChange({ maxDisplayedIssues: v })}
          />

          {/* EQ Style chips */}
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">EQ Style</span>
            <div className="flex items-center gap-1 flex-wrap">
              {([
                ['surgical', 'Surgical'],
                ['heavy', 'Heavy'],
              ] as const).map(([style, label]) => {
                const isActive = settings.eqPreset === style
                return (
                  <button
                    key={style}
                    onClick={() => onSettingsChange({ eqPreset: style })}
                    className={`px-1.5 py-0.5 rounded text-[0.625rem] font-medium transition-colors ${
                      isActive
                        ? 'bg-primary/20 text-primary border border-primary/40'
                        : 'text-muted-foreground hover:text-foreground border border-transparent hover:border-border'
                    }`}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Harmonic Filter toggle */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Harmonics</span>
              {settings.showTooltips && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="w-3 h-3 text-muted-foreground/40 hover:text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-[200px] text-xs">
                    Filter harmonic series to reduce false positives from instruments. Disable for ring-out or monitors.
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
            <button
              role="switch"
              aria-checked={settings.harmonicFilterEnabled}
              aria-label="Toggle harmonic filter"
              onClick={() => onSettingsChange({ harmonicFilterEnabled: !settings.harmonicFilterEnabled })}
              className={`relative inline-flex h-4 w-7 flex-shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                settings.harmonicFilterEnabled ? 'bg-primary' : 'bg-muted'
              }`}
            >
              <span className={`inline-block h-3 w-3 transform rounded-full bg-background shadow transition-transform ${
                settings.harmonicFilterEnabled ? 'translate-x-3.5' : 'translate-x-0.5'
              }`} />
            </button>
          </div>

        </div>

      </div>
    </TooltipProvider>
  )
})

interface SliderRowProps {
  label: string
  value: string
  tooltip?: string
  min: number
  max: number
  step: number
  sliderValue: number
  onChange: (v: number) => void
}

function SliderRow({ label, value, tooltip, min, max, step, sliderValue, onChange }: SliderRowProps) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">{label}</span>
          {tooltip && (
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="w-3 h-3 text-muted-foreground/40 hover:text-muted-foreground cursor-help flex-shrink-0" />
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-[200px] text-xs">
                {tooltip}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
        <span className="text-xs font-mono text-foreground tabular-nums">{value}</span>
      </div>
      <Slider
        value={[sliderValue]}
        onValueChange={([v]) => onChange(v)}
        min={min} max={max} step={step}
      />
    </div>
  )
}
