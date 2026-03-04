'use client'

import React, { useState, useEffect, useRef } from 'react'
import { HelpCircle, ChevronDown } from 'lucide-react'
import { Slider } from '@/components/ui/slider'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { DetectorSettings, OperationMode } from '@/types/advisory'
import { FREQ_RANGE_PRESETS } from '@/lib/dsp/constants'

interface DetectionControlsProps {
  settings: DetectorSettings
  onModeChange: (mode: OperationMode) => void
  onSettingsChange: (settings: Partial<DetectorSettings>) => void
}

export function DetectionControls({ settings, onModeChange, onSettingsChange }: DetectionControlsProps) {
  const [freqOpen, setFreqOpen] = useState(false)
  const [focusedFreqIndex, setFocusedFreqIndex] = useState(-1)
  const freqRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (freqRef.current && !freqRef.current.contains(e.target as Node)) { setFreqOpen(false); setFocusedFreqIndex(-1) }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setFreqOpen(false)
        setFocusedFreqIndex(-1)
        return
      }

      if (freqOpen) {
        const count = FREQ_RANGE_PRESETS.length
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setFocusedFreqIndex((prev) => (prev + 1) % count)
        } else if (e.key === 'ArrowUp') {
          e.preventDefault()
          setFocusedFreqIndex((prev) => (prev - 1 + count) % count)
        } else if (e.key === 'Enter' && focusedFreqIndex >= 0) {
          e.preventDefault()
          const preset = FREQ_RANGE_PRESETS[focusedFreqIndex]
          onSettingsChange({ minFrequency: preset.minFrequency, maxFrequency: preset.maxFrequency })
          setFreqOpen(false)
          setFocusedFreqIndex(-1)
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [freqOpen, focusedFreqIndex, onSettingsChange])

  const currentFreqPreset = FREQ_RANGE_PRESETS.find(
    p => p.minFrequency === settings.minFrequency && p.maxFrequency === settings.maxFrequency
  ) || { label: 'Custom', minFrequency: settings.minFrequency, maxFrequency: settings.maxFrequency }

  return (
    <TooltipProvider delayDuration={400}>
      <div className="space-y-1.5">

        {/* Freq range */}
        <div className="relative" ref={freqRef}>
          <div className="flex items-center gap-1 px-2 py-1 rounded border border-border hover:border-primary/40 transition-colors">
            <button
              onClick={() => { setFreqOpen(!freqOpen); setFocusedFreqIndex(-1) }}
              className="flex-1 flex items-center justify-between min-w-0"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs font-medium text-foreground">{currentFreqPreset.label}</span>
                <span className="text-[10px] text-muted-foreground font-mono">
                  {currentFreqPreset.minFrequency}-{currentFreqPreset.maxFrequency}Hz
                </span>
              </div>
              <ChevronDown className={`w-3 h-3 text-muted-foreground transition-transform ${freqOpen ? 'rotate-180' : ''}`} />
            </button>
          </div>
          {freqOpen && (
            <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-background border border-border rounded shadow-lg overflow-hidden">
              {FREQ_RANGE_PRESETS.map((preset, idx) => {
                const isActive = settings.minFrequency === preset.minFrequency && settings.maxFrequency === preset.maxFrequency
                const isFocused = focusedFreqIndex === idx
                return (
                  <button
                    key={preset.label}
                    onClick={() => { onSettingsChange({ minFrequency: preset.minFrequency, maxFrequency: preset.maxFrequency }); setFreqOpen(false); setFocusedFreqIndex(-1) }}
                    className={`w-full flex items-center justify-between px-2 py-1.5 text-left transition-colors ${
                      isActive ? 'bg-primary/10 text-primary' : isFocused ? 'bg-muted text-foreground' : 'hover:bg-muted text-foreground'
                    }`}
                  >
                    <span className="text-xs font-medium">{preset.label}</span>
                    <span className="text-[10px] font-mono text-muted-foreground">
                      {preset.minFrequency}-{preset.maxFrequency}Hz
                    </span>
                  </button>
                )
              })}
            </div>
          )}
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
              <span className={`px-1 py-px rounded text-[11px] font-medium border leading-4 ${
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
              tooltip={settings.showTooltips ? 'Primary sensitivity. 4-8dB aggressive, 10-14dB balanced, 16+dB conservative.' : undefined}
              min={2} max={20} step={1}
              sliderValue={settings.feedbackThresholdDb}
              onChange={(v) => onSettingsChange({ feedbackThresholdDb: v })}
            />
          </div>
          <div className="py-1.5">
            <SliderRow
              label="Ring"
              value={`${settings.ringThresholdDb}dB`}
              tooltip={settings.showTooltips ? 'Resonance detection. 2-4dB calibration, 5-7dB normal, 8+dB shows.' : undefined}
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
        </div>

      </div>
    </TooltipProvider>
  )
}

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
