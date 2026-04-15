'use client'

import { memo } from 'react'
import { HelpCircle } from 'lucide-react'
import { ConsoleSlider } from '@/components/ui/console-slider'
import { ChannelSection } from '@/components/ui/channel-section'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { CalibrationTab } from './CalibrationTab'
import { RigPresetsSection } from './RigPresetsSection'
import { RoomTab } from './RoomTab'
import { SessionExportSection } from './SessionExportSection'
import { useSetupTabExport } from '@/hooks/useSetupTabExport'
import { useSettings } from '@/contexts/SettingsContext'
import { DEFAULT_LIVE_OVERRIDES } from '@/lib/settings/defaults'
import { deriveDefaultDetectorSettings } from '@/lib/settings/defaultDetectorSettings'
import type { DetectorSettings } from '@/types/advisory'
import type { CalibrationTabProps } from './CalibrationTab'

interface SetupTabProps {
  settings: DetectorSettings
  calibration?: Omit<CalibrationTabProps, 'settings'>
  customPresets: { id: string; name: string }[]
  canSavePreset: boolean
  showSaveInput: boolean
  setShowSaveInput: (value: boolean) => void
  presetName: string
  setPresetName: (value: string) => void
  handleSavePreset: () => void
  handleDeletePreset: (id: string) => void
  handleLoadPreset: (id: string) => void
}

const MODES = [
  ['speech', 'Speech'],
  ['worship', 'Worship'],
  ['liveMusic', 'Live'],
  ['theater', 'Theater'],
  ['monitors', 'Monitors'],
  ['ringOut', 'Ring Out'],
  ['broadcast', 'Bcast'],
  ['outdoor', 'Outdoor'],
] as const

export const SetupTab = memo(function SetupTab({
  settings,
  calibration,
  customPresets,
  canSavePreset,
  showSaveInput,
  setShowSaveInput,
  presetName,
  setPresetName,
  handleSavePreset,
  handleDeletePreset,
  handleLoadPreset,
}: SetupTabProps) {
  const ctx = useSettings()
  const modeDefaults = deriveDefaultDetectorSettings(ctx.session.modeId)
  const {
    metadata,
    isExporting,
    updateMetadata,
    handleExportTxt,
    handleExportCSV,
    handleExportJSON,
    handleExportPdf,
  } = useSetupTabExport()

  return (
    <div className="space-y-1">
      <div className="space-y-1 py-1">
        <div className="grid grid-cols-4 gap-1">
          {MODES.slice(0, 4).map(([mode, label]) => (
            <button
              key={mode}
              onClick={() => ctx.setMode(mode)}
              className={`min-h-11 flex items-center justify-center overflow-hidden cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 px-1 rounded text-xs font-mono font-bold tracking-wide transition-[color,background-color,border-color,box-shadow] ${
                settings.mode === mode
                  ? 'bg-[var(--console-amber)]/10 text-[var(--console-amber)] border border-[var(--console-amber)]/40 btn-glow'
                  : 'text-muted-foreground hover:text-foreground border border-transparent hover:border-[rgba(var(--tint-r),var(--tint-g),var(--tint-b),0.18)]'
              }`}
            >
              <span className="truncate">{label}</span>
            </button>
          ))}
        </div>
        <div className="panel-groove-subtle" />
        <div className="grid grid-cols-4 gap-1">
          {MODES.slice(4).map(([mode, label]) => (
            <button
              key={mode}
              onClick={() => ctx.setMode(mode)}
              className={`min-h-11 flex items-center justify-center overflow-hidden cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 px-1 rounded text-xs font-mono font-bold tracking-wide transition-[color,background-color,border-color,box-shadow] ${
                settings.mode === mode
                  ? 'bg-[var(--console-amber)]/10 text-[var(--console-amber)] border border-[var(--console-amber)]/40 btn-glow'
                  : 'text-muted-foreground hover:text-foreground border border-transparent hover:border-[rgba(var(--tint-r),var(--tint-g),var(--tint-b),0.18)]'
              }`}
            >
              <span className="truncate">{label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1 pt-1">
        <div className="flex items-center gap-1">
          <span className="section-label text-muted-foreground">EQ Style</span>
          {settings.showTooltips && (
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="w-3 h-3 text-[rgba(var(--tint-r),var(--tint-g),var(--tint-b),0.45)] hover:text-[var(--console-amber)] cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-[260px] text-sm">
                Surgical: narrow Q cuts for precision. Heavy: wider, deeper cuts for aggressive feedback.
              </TooltipContent>
            </Tooltip>
          )}
        </div>
        <ToggleGroup
          type="single"
          value={settings.eqPreset}
          onValueChange={(value) => {
            if (value) {
              ctx.setEqStyle(value as DetectorSettings['eqPreset'])
            }
          }}
          variant="outline"
          size="sm"
          aria-label="EQ Style"
          className="w-full gap-1"
        >
          {([['surgical', 'Surgical'], ['heavy', 'Heavy']] as const).map(([style, label]) => (
            <ToggleGroupItem
              key={style}
              value={style}
              className="min-h-11 flex-1 px-2 text-xs font-mono font-bold tracking-wide text-muted-foreground hover:text-foreground data-[state=on]:border-[rgba(var(--tint-r),var(--tint-g),var(--tint-b),0.38)] data-[state=on]:bg-[rgba(var(--tint-r),var(--tint-g),var(--tint-b),0.12)] data-[state=on]:text-[var(--console-amber)]"
            >
              {label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {settings.autoGainEnabled && (
        <ConsoleSlider
          label="AG Target"
          value={`${settings.autoGainTargetDb} dBFS`}
          tooltip={settings.showTooltips ? 'Post-gain peak target. -12 hot (ring out), -18 balanced, -24 conservative (broadcast).' : undefined}
          min={-30}
          max={-6}
          step={1}
          sliderValue={settings.autoGainTargetDb}
          onChange={(value) => ctx.setAutoGain(settings.autoGainEnabled, value)}
          color="green"
          defaultValue={modeDefaults.autoGainTargetDb}
          onResetToDefault={() => ctx.setAutoGain(settings.autoGainEnabled, DEFAULT_LIVE_OVERRIDES.autoGainTargetDb)}
        />
      )}

      <ChannelSection title="Room">
        <RoomTab settings={settings} setEnvironment={ctx.setEnvironment} />
      </ChannelSection>

      {calibration && (
        <ChannelSection title="Calibration">
          <CalibrationTab settings={settings} {...calibration} />
        </ChannelSection>
      )}

      <RigPresetsSection
        customPresets={customPresets}
        canSavePreset={canSavePreset}
        showSaveInput={showSaveInput}
        setShowSaveInput={setShowSaveInput}
        presetName={presetName}
        setPresetName={setPresetName}
        handleSavePreset={handleSavePreset}
        handleDeletePreset={handleDeletePreset}
        handleLoadPreset={handleLoadPreset}
      />

      <SessionExportSection
        metadata={metadata}
        isExporting={isExporting}
        updateMetadata={updateMetadata}
        handleExportTxt={handleExportTxt}
        handleExportCSV={handleExportCSV}
        handleExportJSON={handleExportJSON}
        handleExportPdf={handleExportPdf}
      />
    </div>
  )
})
