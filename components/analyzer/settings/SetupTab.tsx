'use client'

import React, { memo } from 'react'
import { HelpCircle, Save, Trash2, X } from 'lucide-react'
import { ConsoleSlider } from '@/components/ui/console-slider'
import { ChannelSection } from '@/components/ui/channel-section'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { RoomTab } from './RoomTab'
import { CalibrationTab } from './CalibrationTab'
import { useSettings } from '@/contexts/SettingsContext'
import { useEngine } from '@/contexts/EngineContext'
import type { DetectorSettings, OperationMode } from '@/types/advisory'
import type { CalibrationTabProps } from './CalibrationTab'

// ── Types ────────────────────────────────────────────────────────────────────

interface SetupTabProps {
  settings: DetectorSettings
  onSettingsChange: (settings: Partial<DetectorSettings>) => void
  onModeChange: (mode: OperationMode) => void
  calibration?: Omit<CalibrationTabProps, 'settings' | 'onSettingsChange'>
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

const MODES = [
  ['speech', 'Speech'], ['worship', 'Worship'], ['liveMusic', 'Live'], ['theater', 'Theater'],
  ['monitors', 'Monitors'], ['ringOut', 'Ring Out'], ['broadcast', 'Bcast'], ['outdoor', 'Outdoor'],
] as const

// ── SetupTab ─────────────────────────────────────────────────────────────────
// Soundcheck and pre-show controls: mode, EQ style, AG target, room,
// calibration, and rig presets.

export const SetupTab = memo(function SetupTab({
  settings, onSettingsChange, onModeChange,
  calibration,
  customPresets, showSaveInput, setShowSaveInput,
  presetName, setPresetName, handleSavePreset, handleDeletePreset, handleLoadPreset,
}: SetupTabProps) {
  const ctx = useSettings()
  const { isRunning } = useEngine()

  return (
    <div className="space-y-1">

      {/* Mode chips */}
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

      {/* EQ Style */}
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
            <button key={style} onClick={() => ctx.setEqStyle(style)}
              className={`min-h-11 flex-1 px-2 rounded text-xs font-mono font-bold tracking-wide transition-colors cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 ${
                settings.eqPreset === style ? 'bg-primary/20 text-primary border border-primary/40' : 'text-muted-foreground hover:text-foreground border border-transparent hover:border-border'
              }`}
            >{label}</button>
          ))}
        </div>
      </div>

      {/* Auto-gain target (visible when AG enabled) */}
      {settings.autoGainEnabled && (
        <ConsoleSlider label="AG Target" value={`${settings.autoGainTargetDb} dBFS`}
          tooltip={settings.showTooltips ? 'Post-gain peak target. -12 hot (ring out), -18 balanced, -24 conservative (broadcast).' : undefined}
          min={-30} max={-6} step={1} sliderValue={settings.autoGainTargetDb}
          onChange={(v) => ctx.setAutoGain(settings.autoGainEnabled, v)} />
      )}

      {/* Room */}
      <ChannelSection title="Room">
        <RoomTab settings={settings} onSettingsChange={onSettingsChange} setEnvironment={ctx.setEnvironment} />
      </ChannelSection>

      {/* Calibration */}
      {calibration && (
        <ChannelSection title="Calibration">
          <CalibrationTab settings={settings} onSettingsChange={onSettingsChange} {...calibration} />
        </ChannelSection>
      )}

      {/* Rig Presets */}
      <ChannelSection title="Rig Presets">
        <div className="space-y-1">
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
      </ChannelSection>

    </div>
  )
})
