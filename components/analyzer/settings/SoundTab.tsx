'use client'

import React, { memo, useCallback } from 'react'
import { HelpCircle, Save, Trash2, X } from 'lucide-react'
import { Slider } from '@/components/ui/slider'
import { ConsoleSlider } from '@/components/ui/console-slider'
import { LEDToggle } from '@/components/ui/led-toggle'
import { ChannelSection } from '@/components/ui/channel-section'
import { PillToggle } from '@/components/ui/pill-toggle'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { RoomTab } from './RoomTab'
import { CalibrationTab } from './CalibrationTab'
import { AdvancedTab, type AdvancedTabProps } from './AdvancedTab'
import { Section } from './SettingsShared'
import type { DetectorSettings, OperationMode, AlgorithmMode, Algorithm } from '@/types/advisory'
import type { CalibrationTabProps } from './CalibrationTab'
import { FREQ_RANGE_PRESETS } from '@/lib/dsp/constants'
import { roundFreqToNice } from '@/lib/utils/mathHelpers'

// ── Types ────────────────────────────────────────────────────────────────────

type DataCollectionTabProps = Pick<AdvancedTabProps, 'consentStatus' | 'isCollecting' | 'onEnableCollection' | 'onDisableCollection'>

interface SoundTabProps {
  settings: DetectorSettings
  onSettingsChange: (settings: Partial<DetectorSettings>) => void
  onModeChange: (mode: OperationMode) => void
  calibration?: Omit<CalibrationTabProps, 'settings' | 'onSettingsChange'>
  dataCollection?: DataCollectionTabProps
  customPresets: { name: string; settings: Partial<DetectorSettings> }[]
  showSaveInput: boolean
  setShowSaveInput: (v: boolean) => void
  presetName: string
  setPresetName: (v: string) => void
  handleSavePreset: () => void
  handleDeletePreset: (name: string) => void
  handleLoadPreset: (preset: { name: string; settings: Partial<DetectorSettings> }) => void
}

// ── Constants ────────────────────────────────────────────────────────────────

const LOG_MIN = Math.log10(20)
const LOG_MAX = Math.log10(20000)

const MODES = [
  ['speech', 'Speech'], ['worship', 'Worship'], ['liveMusic', 'Live'], ['theater', 'Theater'],
  ['monitors', 'Monitors'], ['ringOut', 'Ring Out'], ['broadcast', 'Bcast'], ['outdoor', 'Outdoor'],
] as const

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatFreqLabel(hz: number): string {
  if (hz >= 10000) return `${(hz / 1000).toFixed(0)}k`
  if (hz >= 1000) return `${(hz / 1000).toFixed(1)}k`
  return `${hz}`
}

// ── SoundTab ─────────────────────────────────────────────────────────────────

export const SoundTab = memo(function SoundTab({
  settings, onSettingsChange, onModeChange,
  calibration, dataCollection,
  customPresets, showSaveInput, setShowSaveInput,
  presetName, setPresetName, handleSavePreset, handleDeletePreset, handleLoadPreset,
}: SoundTabProps) {

  const handleFreqSliderChange = useCallback(([logMin, logMax]: number[]) => {
    const newMin = roundFreqToNice(Math.pow(10, logMin))
    const newMax = roundFreqToNice(Math.pow(10, logMax))
    onSettingsChange({ minFrequency: newMin, maxFrequency: newMax })
  }, [onSettingsChange])

  return (
    <div className="space-y-1">

      {/* ═══ ALWAYS VISIBLE: Mode chips ═══ */}
      <div className="grid grid-cols-4 gap-1 py-1">
        {MODES.map(([mode, label]) => (
          <button
            key={mode}
            onClick={() => onModeChange(mode)}
            className={`min-h-11 flex items-center justify-center cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 px-1 rounded text-xs font-mono font-bold tracking-wide transition-all ${
              settings.mode === mode
                ? 'bg-[var(--console-amber)]/10 text-[var(--console-amber)] border border-[var(--console-amber)]/40 btn-glow'
                : 'text-muted-foreground hover:text-foreground border border-transparent hover:border-border'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ═══ ALWAYS VISIBLE: Sensitivity slider (hero control) ═══ */}
      <ConsoleSlider
        label="Sensitivity"
        value={`${settings.feedbackThresholdDb}dB`}
        tooltip={settings.showTooltips ? 'Fader up = picks up more. Lower = catches subtle resonances. Higher = fewer false positives. Also draggable on the RTA spectrum.' : undefined}
        showTooltip={settings.showTooltips}
        min={2} max={50} step={1}
        sliderValue={52 - settings.feedbackThresholdDb}
        onChange={(v) => onSettingsChange({ feedbackThresholdDb: 52 - v })}
      />

      {/* ═══ ALWAYS VISIBLE: Fader control + Show on RTA ═══ */}
      <div className="flex items-center justify-between gap-2 py-1">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-mono uppercase tracking-wide">Fader:</span>
          <PillToggle
            checked={settings.faderMode === 'sensitivity'}
            onChange={(isSensitivity) => onSettingsChange({ faderMode: isSensitivity ? 'sensitivity' : 'gain' })}
            labelOn="Sensitivity"
            labelOff="Input Gain"
            tooltip={settings.showTooltips ? 'Sensitivity adjusts detection threshold. Input Gain adjusts mic input level.' : undefined}
          />
        </div>
        <LEDToggle
          checked={settings.showThresholdLine}
          onChange={(checked) => onSettingsChange({ showThresholdLine: checked })}
          label="Show on RTA"
          tooltip={settings.showTooltips ? 'Display the detection threshold line on the spectrum.' : undefined}
          className="w-auto"
        />
      </div>

      {/* ═══ ALWAYS VISIBLE: Frequency range presets + slider ═══ */}
      <div className="space-y-1 py-1">
        <div className="flex items-center gap-1 flex-wrap">
          {FREQ_RANGE_PRESETS.map((preset) => {
            const isActive = settings.minFrequency === preset.minFrequency && settings.maxFrequency === preset.maxFrequency
            return (
              <button key={preset.label} onClick={() => onSettingsChange({ minFrequency: preset.minFrequency, maxFrequency: preset.maxFrequency })}
                className={`min-h-11 px-3 rounded text-xs font-mono font-bold tracking-wide transition-all cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 ${
                  isActive
                    ? 'bg-primary/20 text-primary border border-primary/40 btn-glow'
                    : 'text-muted-foreground hover:text-foreground border border-transparent hover:border-border'
                }`}
              >
                {preset.label}
                <span className="text-[10px] font-normal opacity-60 ml-1">{preset.shortRange}</span>
              </button>
            )
          })}
        </div>
        <div className="flex items-center justify-between">
          <span className="section-label text-muted-foreground">Freq Range</span>
          <span className="console-readout">{formatFreqLabel(settings.minFrequency)}-{formatFreqLabel(settings.maxFrequency)}</span>
        </div>
        <Slider value={[Math.log10(Math.max(20, settings.minFrequency)), Math.log10(Math.min(20000, settings.maxFrequency))]} onValueChange={handleFreqSliderChange} min={LOG_MIN} max={LOG_MAX} step={0.005} minStepsBetweenThumbs={0.1} />
      </div>

      {/* ═══ SECTION: Detection ═══ */}
      <ChannelSection title="Detection" defaultOpen>
        <div className="space-y-1">
          <ConsoleSlider label="Ring" value={`${settings.ringThresholdDb}dB`}
            tooltip={settings.showTooltips ? 'Resonance detection. 2-3 dB ring out/monitors, 4-5 dB normal, 6+ dB live music/outdoor.' : undefined}
            min={1} max={12} step={0.5} sliderValue={settings.ringThresholdDb}
            onChange={(v) => onSettingsChange({ ringThresholdDb: v })} />

          <ConsoleSlider label="Growth" value={`${settings.growthRateThreshold.toFixed(1)}dB/s`}
            tooltip={settings.showTooltips ? 'How fast feedback must grow. 0.5-1dB/s catches early, 3+dB/s only runaway.' : undefined}
            min={0.5} max={8} step={0.5} sliderValue={settings.growthRateThreshold}
            onChange={(v) => onSettingsChange({ growthRateThreshold: v })} />

          {settings.autoGainEnabled && (
            <ConsoleSlider label="AG Target" value={`${settings.autoGainTargetDb} dBFS`}
              tooltip={settings.showTooltips ? 'Post-gain peak target. -12 hot (ring out), -18 balanced, -24 conservative (broadcast).' : undefined}
              min={-30} max={-6} step={1} sliderValue={settings.autoGainTargetDb}
              onChange={(v) => onSettingsChange({ autoGainTargetDb: v })} />
          )}

          <ConsoleSlider label="Confidence" value={`${Math.round((settings.confidenceThreshold ?? 0.35) * 100)}%`}
            tooltip={settings.showTooltips ? 'Minimum confidence to flag. 25-35% aggressive, 45-55% balanced, 60%+ conservative.' : undefined}
            min={0.2} max={0.8} step={0.05} sliderValue={settings.confidenceThreshold ?? 0.35}
            onChange={(v) => onSettingsChange({ confidenceThreshold: v })} />

          {/* EQ style */}
          <div className="space-y-1 pt-1">
            <div className="flex items-center gap-1">
              <span className="section-label text-muted-foreground">EQ Style</span>
              {settings.showTooltips && (
                <Tooltip>
                  <TooltipTrigger asChild><HelpCircle className="w-3 h-3 text-muted-foreground/70 hover:text-muted-foreground cursor-help" /></TooltipTrigger>
                  <TooltipContent side="right" className="max-w-[260px] text-sm">Surgical: narrow Q cuts for precision. Heavy: wider, deeper cuts for aggressive feedback.</TooltipContent>
                </Tooltip>
              )}
            </div>
            <div className="flex items-center gap-1">
              {([['surgical', 'Surgical'], ['heavy', 'Heavy']] as const).map(([style, label]) => (
                <button key={style} onClick={() => onSettingsChange({ eqPreset: style })}
                  className={`min-h-11 flex-1 px-2 rounded text-xs font-mono font-bold tracking-wide transition-colors cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 ${
                    settings.eqPreset === style ? 'bg-primary/20 text-primary border border-primary/40' : 'text-muted-foreground hover:text-foreground border border-transparent hover:border-border'
                  }`}
                >{label}</button>
              ))}
            </div>
          </div>

          <LEDToggle checked={settings.aWeightingEnabled} onChange={(checked) => onSettingsChange({ aWeightingEnabled: checked })} label="A-Weighting (IEC 61672-1)"
            tooltip={settings.showTooltips ? 'Apply IEC 61672-1 A-weighting curve. Emphasizes 1–5 kHz where hearing is most sensitive.' : undefined} />
          <LEDToggle checked={settings.ignoreWhistle} onChange={(checked) => onSettingsChange({ ignoreWhistle: checked })} label="Ignore Whistle"
            tooltip={settings.showTooltips ? 'Suppress alerts from deliberate whistling or single-tone test signals.' : undefined} />
        </div>
      </ChannelSection>

      {/* ═══ SECTION: Timing (single source of truth — no duplicates) ═══ */}
      <ChannelSection title="Timing">
        <div className="space-y-1">
          <ConsoleSlider label="Sustain" value={`${settings.sustainMs}ms`}
            tooltip={settings.showTooltips ? 'How long a peak must persist before flagging. 100-200ms aggressive, 300-500ms balanced.' : undefined}
            min={100} max={1000} step={50} sliderValue={settings.sustainMs}
            onChange={(v) => onSettingsChange({ sustainMs: v })} />

          <ConsoleSlider label="Clear" value={`${settings.clearMs}ms`}
            tooltip={settings.showTooltips ? 'How fast resolved issues disappear.' : undefined}
            min={100} max={2000} step={50} sliderValue={settings.clearMs}
            onChange={(v) => onSettingsChange({ clearMs: v })} />

          <ConsoleSlider label="Max Issues" value={`${settings.maxDisplayedIssues}`}
            tooltip={settings.showTooltips ? 'How many feedback issues display at once.' : undefined}
            min={3} max={12} step={1} sliderValue={settings.maxDisplayedIssues}
            onChange={(v) => onSettingsChange({ maxDisplayedIssues: v })} />
        </div>
      </ChannelSection>

      {/* ═══ SECTION: Room (absorbs old RoomTab) ═══ */}
      <ChannelSection title="Room">
        <RoomTab settings={settings} onSettingsChange={onSettingsChange} />
      </ChannelSection>

      {/* ═══ SECTION: Calibration (conditional) ═══ */}
      {calibration && (
        <ChannelSection title="Calibration">
          <CalibrationTab settings={settings} onSettingsChange={onSettingsChange} {...calibration} />
        </ChannelSection>
      )}

      {/* ═══ SECTION: Advanced (collapsed, expert badge) ═══ */}
      <ChannelSection
        title="Advanced"
        badge={<span className="expert-badge">Expert</span>}
      >
        <div className="space-y-2">
          {/* Algorithms */}
          <div className="space-y-1">
            <span className="section-label text-muted-foreground">Algorithms</span>
            <button
              onClick={() => onSettingsChange({ algorithmMode: (settings.algorithmMode !== 'auto' ? 'auto' : 'custom') as AlgorithmMode })}
              className={`min-h-11 cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 w-full px-1.5 rounded text-xs font-mono font-bold tracking-wide transition-colors ${
                settings.algorithmMode === 'auto' ? 'bg-primary/20 text-primary border border-primary/40' : 'text-muted-foreground hover:text-foreground border border-transparent hover:border-border'
              }`}
            >Auto</button>
            <div className={`grid grid-cols-3 gap-1 ${settings.algorithmMode === 'auto' ? 'pointer-events-none' : ''}`}>
              {([['msd', 'MSD'], ['phase', 'Phase'], ['spectral', 'Spectral'], ['comb', 'Comb'], ['ihr', 'IHR'], ['ptmr', 'PTMR'], ['ml', 'ML']] as const).map(([key, label]) => {
                const isAuto = settings.algorithmMode === 'auto'
                const enabled = isAuto || (settings.enabledAlgorithms?.includes(key) ?? true)
                return (
                  <button key={key}
                    onClick={() => {
                      if (isAuto) return
                      const current = settings.enabledAlgorithms ?? ['msd', 'phase', 'spectral', 'comb', 'ihr', 'ptmr', 'ml']
                      let next: Algorithm[]
                      if (enabled) { next = current.filter(a => a !== key); if (next.length === 0) { onSettingsChange({ algorithmMode: 'auto' as AlgorithmMode }); return } }
                      else { next = [...current, key] }
                      onSettingsChange({ enabledAlgorithms: next })
                    }}
                    className={`min-h-11 cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 px-1 rounded text-xs font-mono font-bold text-center transition-colors ${
                      isAuto ? 'text-primary/60 border border-primary/20 bg-transparent'
                        : enabled ? 'bg-primary/20 text-primary border border-primary/40'
                        : 'text-muted-foreground hover:text-foreground border border-transparent hover:border-border'
                    }`}
                  >{label}</button>
                )
              })}
            </div>
          </div>

          {/* Noise Floor */}
          <div className="space-y-1 pt-1 panel-groove">
            <span className="section-label text-muted-foreground">Noise Floor</span>
            <ConsoleSlider label="Attack" value={`${settings.noiseFloorAttackMs}ms`}
              min={50} max={1000} step={25} sliderValue={settings.noiseFloorAttackMs}
              onChange={(v) => onSettingsChange({ noiseFloorAttackMs: v })} />
            <ConsoleSlider label="Release" value={`${settings.noiseFloorReleaseMs}ms`}
              min={200} max={5000} step={100} sliderValue={settings.noiseFloorReleaseMs}
              onChange={(v) => onSettingsChange({ noiseFloorReleaseMs: v })} />
          </div>

          {/* Peak Detection */}
          <div className="space-y-1 pt-1 panel-groove">
            <span className="section-label text-muted-foreground">Peak Detection</span>
            <ConsoleSlider label="Merge Window" value={`${settings.peakMergeCents}¢`}
              min={10} max={150} step={5} sliderValue={settings.peakMergeCents}
              onChange={(v) => onSettingsChange({ peakMergeCents: v })} />

            <Section title="Threshold Mode" showTooltip={settings.showTooltips}
              tooltip="Absolute: fixed dB. Relative: above noise floor. Hybrid: both (recommended).">
              <Select value={settings.thresholdMode}
                onValueChange={(v) => onSettingsChange({ thresholdMode: v as DetectorSettings['thresholdMode'] })}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="absolute">Absolute - Fixed dB</SelectItem>
                  <SelectItem value="relative">Relative - Above Noise</SelectItem>
                  <SelectItem value="hybrid">Hybrid - Both (Recommended)</SelectItem>
                </SelectContent>
              </Select>
            </Section>

            <ConsoleSlider label="Prominence" value={`${settings.prominenceDb}dB`}
              min={4} max={30} step={1} sliderValue={settings.prominenceDb}
              onChange={(v) => onSettingsChange({ prominenceDb: v })} />
          </div>

          {/* Track Management */}
          <div className="space-y-1 pt-1 panel-groove">
            <span className="section-label text-muted-foreground">Track Management</span>
            <ConsoleSlider label="Max Tracks" value={`${settings.maxTracks}`}
              min={8} max={128} step={8} sliderValue={settings.maxTracks}
              onChange={(v) => onSettingsChange({ maxTracks: v })} />
            <ConsoleSlider label="Track Timeout" value={`${settings.trackTimeoutMs}ms`}
              min={200} max={5000} step={100} sliderValue={settings.trackTimeoutMs}
              onChange={(v) => onSettingsChange({ trackTimeoutMs: v })} />
          </div>

          {/* FFT / Smoothing / Harmonic Tolerance */}
          <div className="space-y-1 pt-1 panel-groove">
            <span className="section-label text-muted-foreground">DSP</span>
            <Section title="FFT Size" showTooltip={settings.showTooltips}
              tooltip="4096 fast, 8192 balanced, 16384 high-res low-end.">
              <Select value={settings.fftSize.toString()} onValueChange={(v) => onSettingsChange({ fftSize: parseInt(v) as 4096 | 8192 | 16384 })}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="4096">4096 - Fast</SelectItem>
                  <SelectItem value="8192">8192 - Balanced</SelectItem>
                  <SelectItem value="16384">16384 - High Res</SelectItem>
                </SelectContent>
              </Select>
            </Section>
            <ConsoleSlider label="Smoothing" value={`${(settings.smoothingTimeConstant * 100).toFixed(0)}%`}
              min={0} max={0.95} step={0.05} sliderValue={settings.smoothingTimeConstant}
              onChange={(v) => onSettingsChange({ smoothingTimeConstant: v })} />
            <ConsoleSlider label="Harmonic Tol." value={`${settings.harmonicToleranceCents}¢`}
              min={25} max={400} step={25} sliderValue={settings.harmonicToleranceCents}
              onChange={(v) => onSettingsChange({ harmonicToleranceCents: v })} />
          </div>

          {/* Data Collection (from old AdvancedTab) */}
          {dataCollection?.consentStatus !== undefined && (
            <div className="pt-1 panel-groove">
              <AdvancedTab settings={settings} onSettingsChange={onSettingsChange} {...dataCollection} />
            </div>
          )}

          {/* Presets save/load */}
          <div className="space-y-1 pt-1 panel-groove">
            <span className="section-label text-muted-foreground">Custom Presets</span>
            {customPresets.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap">
                {customPresets.map((preset) => (
                  <div key={preset.name} className="inline-flex items-center gap-0.5">
                    <button
                      onClick={() => handleLoadPreset(preset)}
                      className="min-h-11 cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 px-2 rounded text-sm font-medium text-muted-foreground hover:text-foreground border border-transparent hover:border-border transition-colors"
                    >
                      {preset.name}
                    </button>
                    <button
                      onClick={() => handleDeletePreset(preset.name)}
                      className="cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 text-muted-foreground/50 hover:text-red-400 transition-colors p-1"
                      aria-label={`Delete ${preset.name} preset`}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {showSaveInput ? (
              <div className="flex items-center gap-1">
                <input value={presetName} onChange={(e) => setPresetName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSavePreset()}
                  placeholder="Preset name..." autoFocus maxLength={20}
                  className="flex-1 px-2 py-1.5 rounded text-sm bg-muted border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                <button onClick={handleSavePreset} disabled={!presetName.trim()}
                  className="min-h-11 cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 px-2 rounded text-sm font-medium bg-primary/20 text-primary border border-primary/40 disabled:opacity-40 transition-colors">Save</button>
                <button onClick={() => { setShowSaveInput(false); setPresetName('') }}
                  className="cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 text-muted-foreground hover:text-foreground p-1"><X className="w-4 h-4" /></button>
              </div>
            ) : (
              customPresets.length < 5 && (
                <button onClick={() => setShowSaveInput(true)}
                  className="min-h-11 cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
                  <Save className="w-3 h-3" /> Save as Preset
                </button>
              )
            )}
          </div>
        </div>
      </ChannelSection>

    </div>
  )
})
