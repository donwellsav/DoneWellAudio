'use client'

import React, { useState, useEffect, useRef } from 'react'
import { HelpCircle, ChevronDown, Download, X } from 'lucide-react'
import { Slider } from '@/components/ui/slider'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { DetectorSettings, OperationMode } from '@/types/advisory'
import { FREQ_RANGE_PRESETS, OPERATION_MODES } from '@/lib/dsp/constants'

const STORAGE_PREFIX = 'ktr-setting-'

const MODE_INFO: Record<OperationMode, { label: string; desc: string }> = {
  feedbackHunt: { label: 'Feedback Hunt', desc: 'Balanced detection' },
  vocalRing: { label: 'Vocal Ring', desc: 'Speech resonance' },
  musicAware: { label: 'Music-Aware', desc: 'Harmonic filtering' },
  aggressive: { label: 'Aggressive', desc: 'Maximum sensitivity' },
  calibration: { label: 'Calibration', desc: 'Room analysis' },
}

interface DetectionControlsProps {
  settings: DetectorSettings
  onModeChange: (mode: OperationMode) => void
  onSettingsChange: (settings: Partial<DetectorSettings>) => void
}

export function DetectionControls({ settings, onModeChange, onSettingsChange }: DetectionControlsProps) {
  const [modeOpen, setModeOpen] = useState(false)
  const [freqOpen, setFreqOpen] = useState(false)
  const [focusedModeIndex, setFocusedModeIndex] = useState(-1)
  const [focusedFreqIndex, setFocusedFreqIndex] = useState(-1)
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set())
  const modeRef = useRef<HTMLDivElement>(null)
  const freqRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const keys = new Set<string>()
    Object.keys(localStorage).forEach((k) => {
      if (k.startsWith(STORAGE_PREFIX)) keys.add(k.replace(STORAGE_PREFIX, ''))
    })
    setSavedKeys(keys)
  }, [])

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (modeRef.current && !modeRef.current.contains(e.target as Node)) { setModeOpen(false); setFocusedModeIndex(-1) }
      if (freqRef.current && !freqRef.current.contains(e.target as Node)) { setFreqOpen(false); setFocusedFreqIndex(-1) }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [])

  useEffect(() => {
    const modeKeys = Object.keys(OPERATION_MODES) as OperationMode[]
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setModeOpen(false)
        setFreqOpen(false)
        setFocusedModeIndex(-1)
        setFocusedFreqIndex(-1)
        return
      }

      if (modeOpen) {
        const count = modeKeys.length
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setFocusedModeIndex((prev) => (prev + 1) % count)
        } else if (e.key === 'ArrowUp') {
          e.preventDefault()
          setFocusedModeIndex((prev) => (prev - 1 + count) % count)
        } else if (e.key === 'Enter' && focusedModeIndex >= 0) {
          e.preventDefault()
          onModeChange(modeKeys[focusedModeIndex])
          setModeOpen(false)
          setFocusedModeIndex(-1)
        }
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
  }, [modeOpen, freqOpen, focusedModeIndex, focusedFreqIndex, onModeChange, onSettingsChange])

  const saveDefault = (key: string, value: unknown) => {
    localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(value))
    setSavedKeys((prev) => new Set(prev).add(key))
  }

  const clearDefault = (key: string) => {
    localStorage.removeItem(`${STORAGE_PREFIX}${key}`)
    setSavedKeys((prev) => { const n = new Set(prev); n.delete(key); return n })
  }

  const SaveButton = ({ settingKey, value }: { settingKey: string; value: unknown }) => {
    const isSaved = savedKeys.has(settingKey)
    return (
      <div className="flex items-center gap-0.5 flex-shrink-0">
        <button
          onClick={(e) => { e.stopPropagation(); saveDefault(settingKey, value) }}
          className="p-0.5 rounded hover:bg-muted/50 transition-colors"
          title={isSaved ? 'Update saved default' : 'Save as default'}
        >
          <Download className={`w-3 h-3 ${isSaved ? 'text-primary' : 'text-muted-foreground/50 hover:text-muted-foreground'}`} />
        </button>
        {isSaved && (
          <button
            onClick={(e) => { e.stopPropagation(); clearDefault(settingKey) }}
            className="p-0.5 rounded hover:bg-muted/50 transition-colors"
            title="Clear saved default"
          >
            <X className="w-3 h-3 text-muted-foreground/50 hover:text-destructive" />
          </button>
        )}
      </div>
    )
  }

  const currentModeInfo = MODE_INFO[settings.mode]
  const currentFreqPreset = FREQ_RANGE_PRESETS.find(
    p => p.minFrequency === settings.minFrequency && p.maxFrequency === settings.maxFrequency
  ) || { label: 'Custom', minFrequency: settings.minFrequency, maxFrequency: settings.maxFrequency }

  return (
    <TooltipProvider delayDuration={400}>
      <div className="space-y-1.5">

        {/* Mode selector */}
        <div className="relative" ref={modeRef}>
          <div className="flex items-center gap-1 px-2 py-1 rounded border border-border hover:border-primary/40 transition-colors">
            <button
              onClick={() => { setModeOpen(!modeOpen); setFreqOpen(false); setFocusedModeIndex(-1); setFocusedFreqIndex(-1) }}
              className="flex-1 flex items-center justify-between min-w-0"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs font-medium text-foreground truncate">{currentModeInfo.label}</span>
                <span className="text-[10px] text-muted-foreground truncate hidden sm:inline">{currentModeInfo.desc}</span>
              </div>
              <ChevronDown className={`w-3 h-3 text-muted-foreground transition-transform ${modeOpen ? 'rotate-180' : ''}`} />
            </button>
            <SaveButton settingKey="mode" value={settings.mode} />
          </div>
          {modeOpen && (
            <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-background border border-border rounded shadow-lg overflow-hidden">
              {(Object.keys(OPERATION_MODES) as OperationMode[]).map((mode, idx) => {
                const info = MODE_INFO[mode]
                const modeSettings = OPERATION_MODES[mode]
                const isActive = settings.mode === mode
                const isFocused = focusedModeIndex === idx
                return (
                  <button
                    key={mode}
                    onClick={() => { onModeChange(mode); setModeOpen(false); setFocusedModeIndex(-1) }}
                    className={`w-full flex items-center justify-between px-2 py-1.5 text-left transition-colors ${
                      isActive ? 'bg-primary/10 text-primary' : isFocused ? 'bg-muted text-foreground' : 'hover:bg-muted text-foreground'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-medium truncate">{info.label}</div>
                      <div className="text-[10px] text-muted-foreground truncate">{info.desc}</div>
                    </div>
                    <div className="text-[9px] font-mono text-muted-foreground flex-shrink-0 ml-2">
                      {modeSettings.feedbackThreshold}/{modeSettings.ringThreshold}/{modeSettings.growthRateThreshold}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Freq range */}
        <div className="relative" ref={freqRef}>
          <div className="flex items-center gap-1 px-2 py-1 rounded border border-border hover:border-primary/40 transition-colors">
            <button
              onClick={() => { setFreqOpen(!freqOpen); setModeOpen(false); setFocusedFreqIndex(-1); setFocusedModeIndex(-1) }}
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
            <SaveButton settingKey="freqRange" value={{ minFrequency: settings.minFrequency, maxFrequency: settings.maxFrequency }} />
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
          <div className="flex items-center gap-1.5">
            <SaveButton settingKey="autoMusicAware" value={settings.autoMusicAware} />
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
              settingKey="feedbackThresholdDb"
              savedKeys={savedKeys}
              onSave={saveDefault}
              onClear={clearDefault}
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
              settingKey="ringThresholdDb"
              savedKeys={savedKeys}
              onSave={saveDefault}
              onClear={clearDefault}
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
              settingKey="growthRateThreshold"
              savedKeys={savedKeys}
              onSave={saveDefault}
              onClear={clearDefault}
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
  settingKey: string
  savedKeys: Set<string>
  onSave: (key: string, value: unknown) => void
  onClear: (key: string) => void
}

function SliderRow({ label, value, tooltip, min, max, step, sliderValue, onChange, settingKey, savedKeys, onSave, onClear }: SliderRowProps) {
  const isSaved = savedKeys.has(settingKey)
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
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-mono text-foreground tabular-nums">{value}</span>
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => onSave(settingKey, sliderValue)}
              className="p-0.5 rounded hover:bg-muted/50 transition-colors"
              title={isSaved ? 'Update saved default' : 'Save as default'}
            >
              <Download className={`w-3 h-3 ${isSaved ? 'text-primary' : 'text-muted-foreground/50 hover:text-muted-foreground'}`} />
            </button>
            {isSaved && (
              <button
                onClick={() => onClear(settingKey)}
                className="p-0.5 rounded hover:bg-muted/50 transition-colors"
                title="Clear saved default"
              >
                <X className="w-3 h-3 text-muted-foreground/50 hover:text-destructive" />
              </button>
            )}
          </div>
        </div>
      </div>
      <Slider
        value={[sliderValue]}
        onValueChange={([v]) => onChange(v)}
        min={min} max={max} step={step}
      />
    </div>
  )
}
