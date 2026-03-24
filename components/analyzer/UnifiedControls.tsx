'use client'

import React, { memo, useCallback, useState, useEffect } from 'react'
import { HelpCircle, Save, Trash2, RotateCcw, Download, FileJson, BarChart3, Monitor, Ruler, Wrench, Crosshair, X } from 'lucide-react'
import { Slider } from '@/components/ui/slider'
import { PillToggle } from '@/components/ui/pill-toggle'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ResetConfirmDialog } from './ResetConfirmDialog'
import { DisplayTab } from './settings/DisplayTab'
import { RoomTab } from './settings/RoomTab'
import { AdvancedTab, type AdvancedTabProps } from './settings/AdvancedTab'
import { CalibrationTab } from './settings/CalibrationTab'
import { Section } from './settings/SettingsShared'
import type { DetectorSettings, OperationMode, AlgorithmMode, Algorithm } from '@/types/advisory'
import type { CalibrationTabProps } from './settings/CalibrationTab'
import { FREQ_RANGE_PRESETS } from '@/lib/dsp/constants'
import { roundFreqToNice } from '@/lib/utils/mathHelpers'
import { presetStorage, customDefaultsStorage } from '@/lib/storage/dwaStorage'

// ── Types ────────────────────────────────────────────────────────────────────

/** Data collection props forwarded to AdvancedTab */
export type DataCollectionTabProps = Pick<AdvancedTabProps, 'consentStatus' | 'isCollecting' | 'onEnableCollection' | 'onDisableCollection'>

type SubTab = 'detect' | 'display' | 'room' | 'advanced'

interface UnifiedControlsProps {
  settings: DetectorSettings
  onModeChange: (mode: OperationMode) => void
  onSettingsChange: (settings: Partial<DetectorSettings>) => void
  onReset: () => void
  calibration?: Omit<CalibrationTabProps, 'settings' | 'onSettingsChange'>
  dataCollection?: DataCollectionTabProps
}

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_CUSTOM_PRESETS = 5
const LOG_MIN = Math.log10(20)
const LOG_MAX = Math.log10(20000)

/**
 * Keys captured by custom presets — excludes display/graph/room/canvas settings.
 * Uses `satisfies` to get a compile-time error if a key doesn't exist in DetectorSettings.
 * When adding new detection settings, add them here to include in presets.
 */
const PRESET_KEYS = [
  'feedbackThresholdDb', 'ringThresholdDb', 'growthRateThreshold',
  'sustainMs', 'clearMs', 'confidenceThreshold',
  'minFrequency', 'maxFrequency', 'eqPreset', 'aWeightingEnabled',
  'algorithmMode', 'enabledAlgorithms', 'prominenceDb',
] as const satisfies readonly (keyof DetectorSettings)[]

const SUB_TABS: { id: SubTab; label: string; Icon: typeof BarChart3 }[] = [
  { id: 'detect', label: 'Detect', Icon: BarChart3 },
  { id: 'display', label: 'Display', Icon: Monitor },
  { id: 'room', label: 'Room', Icon: Ruler },
  { id: 'advanced', label: 'Advanced', Icon: Wrench },
]

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatFreqLabel(hz: number): string {
  if (hz >= 10000) return `${(hz / 1000).toFixed(0)}k`
  if (hz >= 1000) return `${(hz / 1000).toFixed(1)}k`
  return `${hz}`
}

// ── SliderRow ────────────────────────────────────────────────────────────────

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
          <span className="text-sm font-mono text-muted-foreground tracking-wide">{label}</span>
          {tooltip && (
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="w-3 h-3 text-muted-foreground/70 hover:text-muted-foreground cursor-help flex-shrink-0" />
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-[260px] text-sm">
                {tooltip}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
        <span className="text-sm font-mono text-foreground tabular-nums">{value}</span>
      </div>
      <Slider
        value={[sliderValue]}
        onValueChange={([v]) => onChange(v)}
        min={min} max={max} step={step}
      />
    </div>
  )
}

// ── UnifiedControls ──────────────────────────────────────────────────────────

export const UnifiedControls = memo(function UnifiedControls({
  settings,
  onModeChange,
  onSettingsChange,
  onReset,
  calibration,
  dataCollection,
}: UnifiedControlsProps) {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('detect')

  const handleFreqSliderChange = useCallback(([logMin, logMax]: number[]) => {
    const newMin = roundFreqToNice(Math.pow(10, logMin))
    const newMax = roundFreqToNice(Math.pow(10, logMax))
    onSettingsChange({ minFrequency: newMin, maxFrequency: newMax })
  }, [onSettingsChange])

  // ── Custom preset state ──────────────────────────────────────────────
  const [customPresets, setCustomPresets] = useState(() => {
    try { return presetStorage.load() } catch { return [] }
  })
  const [presetName, setPresetName] = useState('')
  const [showSaveInput, setShowSaveInput] = useState(false)

  const handleSavePreset = useCallback(() => {
    const name = presetName.trim()
    if (!name) return
    const snap = Object.fromEntries(
      PRESET_KEYS.map(key => [key, settings[key]])
    ) as Partial<DetectorSettings>
    const updated = [...customPresets.filter(p => p.name !== name), { name, settings: snap }].slice(-MAX_CUSTOM_PRESETS)
    setCustomPresets(updated)
    try { presetStorage.save(updated) } catch { /* quota exceeded — state still updates */ }
    setPresetName('')
    setShowSaveInput(false)
  }, [presetName, settings, customPresets])

  const handleDeletePreset = useCallback((name: string) => {
    const updated = customPresets.filter(p => p.name !== name)
    setCustomPresets(updated)
    try { presetStorage.save(updated) } catch { /* quota exceeded — state still updates */ }
  }, [customPresets])

  const handleLoadPreset = useCallback((preset: { name: string; settings: Partial<DetectorSettings> }) => {
    onSettingsChange(preset.settings)
  }, [onSettingsChange])

  // ── Save/Load defaults (from SettingsPanel) ──────────────────────────
  const [hasSavedDefaults, setHasSavedDefaults] = useState(false)

  useEffect(() => {
    const saved = customDefaultsStorage.load()
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time init from localStorage
    setHasSavedDefaults(saved !== null)
  }, [])

  const handleSaveAsDefaults = useCallback(() => {
    customDefaultsStorage.save(settings)
    setHasSavedDefaults(true)
  }, [settings])

  const handleLoadDefaults = useCallback(() => {
    const defaults = customDefaultsStorage.load()
    if (defaults) {
      // Backward compat: strip removed fields, add new ones
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = defaults as any
      delete d.roomModesEnabled
      if (d.micCalibrationEnabled !== undefined) {
        d.micCalibrationProfile = d.micCalibrationEnabled ? 'ecm8000' : 'none'
        delete d.micCalibrationEnabled
      }
      if (!defaults.roomTreatment) defaults.roomTreatment = 'typical'
      if (!defaults.roomPreset) defaults.roomPreset = 'none'
      if (defaults.algorithmMode && defaults.algorithmMode !== 'auto' && defaults.algorithmMode !== 'custom') {
        const allAlgos: Algorithm[] = ['msd', 'phase', 'spectral', 'comb', 'ihr', 'ptmr', 'ml']
        const modeMap: Record<string, Algorithm[]> = {
          msd: ['msd'], phase: ['phase'], combined: allAlgos, all: allAlgos,
        }
        defaults.enabledAlgorithms = modeMap[defaults.algorithmMode] ?? allAlgos
        defaults.algorithmMode = 'custom'
      }
      onSettingsChange(defaults)
    }
  }, [onSettingsChange])

  // Build sub-tabs list (add Calibrate if calibration prop is provided)
  const subTabs = calibration
    ? [...SUB_TABS, { id: 'calibrate' as SubTab, label: 'Cal', Icon: Crosshair }]
    : SUB_TABS

  return (
    <TooltipProvider delayDuration={400}>
      <div className="@container space-y-1.5">

        {/* Sub-tab strip — icon-only with tooltips */}
            <div className="flex justify-center gap-1 border-b border-border -mx-1 pb-px">
              {subTabs.map(({ id, label, Icon }) => (
                <Tooltip key={id}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setActiveSubTab(id as SubTab)}
                      aria-label={label}
                      className={`w-9 h-8 flex items-center justify-center rounded-t transition-all duration-200 border-b-2 cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 ${
                        activeSubTab === id
                          ? 'text-foreground border-primary bg-primary/5'
                          : 'text-muted-foreground border-transparent hover:text-foreground'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-sm">{label}</TooltipContent>
                </Tooltip>
              ))}
            </div>

            {/* ── Content ─────────────────────────────────────────────── */}

            {/* Detect sub-tab */}
            {activeSubTab === 'detect' && (
              <DetectContent
                settings={settings}
                onSettingsChange={onSettingsChange}
                onModeChange={onModeChange}
                handleFreqSliderChange={handleFreqSliderChange}
                customPresets={customPresets}
                showSaveInput={showSaveInput}
                setShowSaveInput={setShowSaveInput}
                presetName={presetName}
                setPresetName={setPresetName}
                handleSavePreset={handleSavePreset}
                handleDeletePreset={handleDeletePreset}
                handleLoadPreset={handleLoadPreset}
              />
            )}

            {/* Display sub-tab */}
            {activeSubTab === 'display' && (
              <DisplayTab settings={settings} onSettingsChange={onSettingsChange} />
            )}

            {/* Room sub-tab */}
            {activeSubTab === 'room' && (
              <RoomTab settings={settings} onSettingsChange={onSettingsChange} />
            )}

            {/* Advanced sub-tab */}
            {activeSubTab === 'advanced' && (
              <AdvancedTab settings={settings} onSettingsChange={onSettingsChange} {...dataCollection} />
            )}

            {/* Calibrate sub-tab */}
            {activeSubTab === ('calibrate' as SubTab) && calibration && (
              <div className="mt-2">
                <CalibrationTab settings={settings} onSettingsChange={onSettingsChange} {...calibration} />
              </div>
            )}

            {/* ── Footer: Reset / Save / Load ────────────────────────── */}
            <div className="border-t border-border/40 pt-2 mt-2 space-y-1.5">
              <ResetConfirmDialog
                onConfirm={onReset}
                trigger={
                  <Button variant="outline" size="sm" className="w-full h-8">
                    <RotateCcw className="h-3 w-3 mr-1.5" />
                    Reset Defaults
                  </Button>
                }
              />
              <div className="flex gap-1.5">
                <Button variant="secondary" size="sm" className="flex-1 h-7 text-xs" onClick={handleSaveAsDefaults}>
                  <Download className="h-3 w-3 mr-1" />
                  Save
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className="flex-1 h-7 text-xs"
                  onClick={handleLoadDefaults}
                  disabled={!hasSavedDefaults}
                  title={hasSavedDefaults ? 'Load your saved defaults' : 'No saved defaults yet'}
                >
                  <FileJson className="h-3 w-3 mr-1" />
                  Load
                </Button>
              </div>
            </div>
      </div>
    </TooltipProvider>
  )
})

// ── Mode chips (shared by SimpleSettings + DetectContent) ────────────────────

const MODES = [
  ['speech', 'Speech'], ['worship', 'Worship'], ['liveMusic', 'Live'], ['theater', 'Theater'],
  ['monitors', 'Monitors'], ['ringOut', 'Ring Out'], ['broadcast', 'Bcast'], ['outdoor', 'Outdoor'],
] as const

const ModeChips = memo(function ModeChips({ current, onModeChange }: { current: string; onModeChange: (mode: OperationMode) => void }) {
  return (
    <div className="grid grid-cols-2 gap-1">
      {MODES.map(([mode, label]) => (
        <button
          key={mode}
          onClick={() => onModeChange(mode)}
          className={`cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 px-1 py-0.5 rounded text-xs font-mono font-bold tracking-wide transition-colors ${
            current === mode
              ? 'bg-primary/20 text-primary border border-primary/40'
              : 'text-muted-foreground hover:text-foreground border border-transparent hover:border-border'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
})

const PresetsList = memo(function PresetsList({ presets, onLoad, onDelete }: {
  presets: { name: string; settings: Partial<DetectorSettings> }[]
  onLoad: (preset: { name: string; settings: Partial<DetectorSettings> }) => void
  onDelete: (name: string) => void
}) {
  if (presets.length === 0) return null
  return (
    <div className="space-y-1">
      <span className="section-label">Saved Presets</span>
      <div className="flex items-center gap-1 flex-wrap">
        {presets.map((preset) => (
          <div key={preset.name} className="inline-flex items-center gap-0.5">
            <button
              onClick={() => onLoad(preset)}
              className="cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 px-1.5 py-0.5 rounded text-sm font-medium text-muted-foreground hover:text-foreground border border-transparent hover:border-border transition-colors"
            >
              {preset.name}
            </button>
            <button
              onClick={() => onDelete(preset.name)}
              className="cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 text-muted-foreground/50 hover:text-red-400 transition-colors"
              aria-label={`Delete ${preset.name} preset`}
            >
              <Trash2 className="w-2.5 h-2.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
})

// ── DetectContent (extracted for readability) ────────────────────────────────

interface DetectContentProps {
  settings: DetectorSettings
  onSettingsChange: (settings: Partial<DetectorSettings>) => void
  onModeChange: (mode: OperationMode) => void
  handleFreqSliderChange: (values: number[]) => void
  customPresets: { name: string; settings: Partial<DetectorSettings> }[]
  showSaveInput: boolean
  setShowSaveInput: (v: boolean) => void
  presetName: string
  setPresetName: (v: string) => void
  handleSavePreset: () => void
  handleDeletePreset: (name: string) => void
  handleLoadPreset: (preset: { name: string; settings: Partial<DetectorSettings> }) => void
}

const DetectContent = memo(function DetectContent({
  settings, onSettingsChange, onModeChange,
  handleFreqSliderChange,
  customPresets, showSaveInput, setShowSaveInput,
  presetName, setPresetName, handleSavePreset, handleDeletePreset, handleLoadPreset,
}: DetectContentProps) {
  return (
    <>
      {/* ── Accordion sections — Sensitivity open by default ────────── */}
      <Accordion type="multiple" defaultValue={['sensitivity']} className="space-y-0">
          {/* ── Sensitivity & Range ────────────── */}
          <AccordionItem value="sensitivity" className="border-b border-border/40">
            <AccordionTrigger className="py-2 text-xs font-mono font-bold uppercase tracking-[0.15em] text-muted-foreground hover:text-foreground hover:no-underline">
              Sensitivity &amp; Range
            </AccordionTrigger>
            <AccordionContent className="pb-2 space-y-2">
              <div className="space-y-0.5">
                <span className="section-label">Fader Control</span>
                <PillToggle
                  checked={settings.faderMode === 'sensitivity'}
                  onChange={(isSensitivity) => onSettingsChange({ faderMode: isSensitivity ? 'sensitivity' : 'gain' })}
                  labelOn="Sensitivity"
                  labelOff="Input Gain"
                  tooltip={settings.showTooltips ? 'Sensitivity adjusts detection threshold. Input Gain adjusts mic input level.' : undefined}
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-1 flex-wrap">
                  {FREQ_RANGE_PRESETS.map((preset) => {
                    const isActive = settings.minFrequency === preset.minFrequency && settings.maxFrequency === preset.maxFrequency
                    return (
                      <button key={preset.label} onClick={() => onSettingsChange({ minFrequency: preset.minFrequency, maxFrequency: preset.maxFrequency })}
                        className={`cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 px-1.5 py-0.5 rounded text-sm font-mono font-bold tracking-wide transition-colors ${isActive ? 'bg-primary/20 text-primary border border-primary/40' : 'text-muted-foreground hover:text-foreground border border-transparent hover:border-border'}`}
                      >
                        {preset.label}
                        <span className="text-[10px] font-normal opacity-60 ml-1">{preset.shortRange}</span>
                      </button>
                    )
                  })}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-mono text-muted-foreground tracking-wide">Freq Range</span>
                  <span className="text-sm font-mono text-foreground tabular-nums">{formatFreqLabel(settings.minFrequency)}-{formatFreqLabel(settings.maxFrequency)}</span>
                </div>
                <Slider value={[Math.log10(Math.max(20, settings.minFrequency)), Math.log10(Math.min(20000, settings.maxFrequency))]} onValueChange={handleFreqSliderChange} min={LOG_MIN} max={LOG_MAX} step={0.005} minStepsBetweenThumbs={0.1} />
              </div>

              <SliderRow label="Sensitivity" value={`${settings.feedbackThresholdDb}dB`}
                tooltip={settings.showTooltips ? 'Adjust to match your room. Lower = more sensitive (catches subtle resonances). Higher = fewer false positives from HVAC/ambient noise. Also draggable on the RTA spectrum.' : undefined}
                min={2} max={50} step={1} sliderValue={52 - settings.feedbackThresholdDb} onChange={(v) => onSettingsChange({ feedbackThresholdDb: 52 - v })} />

              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Show on RTA</span>
                <PillToggle checked={settings.showThresholdLine} onChange={(checked) => onSettingsChange({ showThresholdLine: checked })}
                  tooltip={settings.showTooltips ? 'Show/hide the detection threshold line on the spectrum.' : undefined} />
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* ── Detection ────────────────────── */}
          <AccordionItem value="detection" className="border-b border-border/40">
            <AccordionTrigger className="py-2 text-xs font-mono font-bold uppercase tracking-[0.15em] text-muted-foreground hover:text-foreground hover:no-underline">
              Detection
            </AccordionTrigger>
            <AccordionContent className="pb-2 space-y-2">
              <SliderRow label="Ring" value={`${settings.ringThresholdDb}dB`}
                tooltip={settings.showTooltips ? 'Resonance detection. 2-3 dB ring out/monitors, 4-5 dB normal, 6+ dB live music/outdoor.' : undefined}
                min={1} max={12} step={0.5} sliderValue={settings.ringThresholdDb} onChange={(v) => onSettingsChange({ ringThresholdDb: v })} />

              <SliderRow label="Growth" value={`${settings.growthRateThreshold.toFixed(1)}dB/s`}
                tooltip={settings.showTooltips ? 'How fast feedback must grow. 0.5-1dB/s catches early, 3+dB/s only runaway.' : undefined}
                min={0.5} max={8} step={0.5} sliderValue={settings.growthRateThreshold} onChange={(v) => onSettingsChange({ growthRateThreshold: v })} />

              {settings.autoGainEnabled && (
                <SliderRow label="AG Target" value={`${settings.autoGainTargetDb} dBFS`}
                  tooltip={settings.showTooltips ? 'Post-gain peak target. -12 hot (ring out), -18 balanced, -24 conservative (broadcast).' : undefined}
                  min={-30} max={-6} step={1} sliderValue={settings.autoGainTargetDb} onChange={(v) => onSettingsChange({ autoGainTargetDb: v })} />
              )}

              <SliderRow label="Confidence" value={`${Math.round((settings.confidenceThreshold ?? 0.35) * 100)}%`}
                tooltip={settings.showTooltips ? 'Minimum confidence to flag an issue. 25-35% aggressive, 45-55% balanced, 60%+ conservative.' : undefined}
                min={0.2} max={0.8} step={0.05} sliderValue={settings.confidenceThreshold ?? 0.35} onChange={(v) => onSettingsChange({ confidenceThreshold: v })} />

              <SliderRow label="Sustain" value={`${settings.sustainMs}ms`}
                tooltip={settings.showTooltips ? 'How long a peak must persist before flagging. 100-200ms aggressive, 300-500ms balanced.' : undefined}
                min={100} max={1000} step={50} sliderValue={settings.sustainMs} onChange={(v) => onSettingsChange({ sustainMs: v })} />
            </AccordionContent>
          </AccordionItem>

          {/* ── Algorithms ───────────────────── */}
          <AccordionItem value="algorithms" className="border-b border-border/40">
            <AccordionTrigger className="py-2 text-xs font-mono font-bold uppercase tracking-[0.15em] text-muted-foreground hover:text-foreground hover:no-underline">
              Algorithms
            </AccordionTrigger>
            <AccordionContent className="pb-2 space-y-2">
              <div className="space-y-1">
                <button
                  onClick={() => onSettingsChange({ algorithmMode: (settings.algorithmMode !== 'auto' ? 'auto' : 'custom') as AlgorithmMode })}
                  className={`cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 w-full px-1.5 py-0.5 rounded text-sm font-mono font-bold tracking-wide transition-colors ${
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
                        className={`cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 px-1 py-0.5 rounded text-sm font-mono font-bold text-center transition-colors ${
                          isAuto ? 'text-primary/60 border border-primary/20 bg-transparent'
                            : enabled ? 'bg-primary/20 text-primary border border-primary/40'
                            : 'text-muted-foreground hover:text-foreground border border-transparent hover:border-border'
                        }`}
                      >{label}</button>
                    )
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm text-muted-foreground">A-Weight</span>
                  {settings.showTooltips && (
                    <Tooltip>
                      <TooltipTrigger asChild><HelpCircle className="w-3 h-3 text-muted-foreground/70 hover:text-muted-foreground cursor-help" /></TooltipTrigger>
                      <TooltipContent side="right" className="max-w-[260px] text-sm">Apply IEC 61672-1 A-weighting. Emphasizes 1-5kHz.</TooltipContent>
                    </Tooltip>
                  )}
                </div>
                <PillToggle checked={settings.aWeightingEnabled} onChange={(checked) => onSettingsChange({ aWeightingEnabled: checked })} />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Ignore whistle</span>
                <PillToggle checked={settings.ignoreWhistle} onChange={(checked) => onSettingsChange({ ignoreWhistle: checked })}
                  tooltip={settings.showTooltips ? 'Suppress alerts from deliberate whistling or single-tone test signals.' : undefined} />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Algo Scores</span>
                <PillToggle checked={settings.showAlgorithmScores} onChange={(checked) => onSettingsChange({ showAlgorithmScores: checked })}
                  tooltip={settings.showTooltips ? 'Show detection algorithm scores (MSD, Phase, etc.) on each advisory card.' : undefined} />
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* ── Timing & Limits ──────────────── */}
          <AccordionItem value="timing" className="border-b border-border/40">
            <AccordionTrigger className="py-2 text-xs font-mono font-bold uppercase tracking-[0.15em] text-muted-foreground hover:text-foreground hover:no-underline">
              Timing &amp; Limits
            </AccordionTrigger>
            <AccordionContent className="pb-2 space-y-2">
              <SliderRow label="Clear" value={`${settings.clearMs}ms`}
                tooltip={settings.showTooltips ? 'How fast resolved issues disappear.' : undefined}
                min={100} max={2000} step={50} sliderValue={settings.clearMs} onChange={(v) => onSettingsChange({ clearMs: v })} />

              <SliderRow label="Max Issues" value={`${settings.maxDisplayedIssues}`}
                tooltip={settings.showTooltips ? 'How many feedback issues display at once.' : undefined}
                min={3} max={12} step={1} sliderValue={settings.maxDisplayedIssues} onChange={(v) => onSettingsChange({ maxDisplayedIssues: v })} />

              <SliderRow label="Max Tracks" value={`${settings.maxTracks}`}
                tooltip={settings.showTooltips ? 'Maximum simultaneous frequency tracks.' : undefined}
                min={8} max={128} step={8} sliderValue={settings.maxTracks} onChange={(v) => onSettingsChange({ maxTracks: v })} />

              <SliderRow label="Track Timeout" value={`${settings.trackTimeoutMs}ms`}
                tooltip={settings.showTooltips ? 'How long a track stays alive without updates.' : undefined}
                min={200} max={5000} step={100} sliderValue={settings.trackTimeoutMs} onChange={(v) => onSettingsChange({ trackTimeoutMs: v })} />

              <Section title="FFT Size" showTooltip={settings.showTooltips}
                tooltip="4096 fast, 8192 balanced, 16384 high-res low-end.">
                <Select value={settings.fftSize.toString()} onValueChange={(v) => onSettingsChange({ fftSize: parseInt(v) as 4096 | 8192 | 16384 })}>
                  <SelectTrigger className="h-7 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="4096">4096 - Fast</SelectItem>
                    <SelectItem value="8192">8192 - Balanced</SelectItem>
                    <SelectItem value="16384">16384 - High Res</SelectItem>
                  </SelectContent>
                </Select>
              </Section>

              <SliderRow label="Smoothing" value={`${(settings.smoothingTimeConstant * 100).toFixed(0)}%`}
                tooltip={settings.showTooltips ? 'Averages spectral frames to reduce visual noise.' : undefined}
                min={0} max={0.95} step={0.05} sliderValue={settings.smoothingTimeConstant} onChange={(v) => onSettingsChange({ smoothingTimeConstant: v })} />

              <SliderRow label="Harmonic Tol." value={`${settings.harmonicToleranceCents}¢`}
                tooltip={settings.showTooltips ? 'Cents window for harmonic matching.' : undefined}
                min={25} max={400} step={25} sliderValue={settings.harmonicToleranceCents} onChange={(v) => onSettingsChange({ harmonicToleranceCents: v })} />
            </AccordionContent>
          </AccordionItem>

          {/* ── Presets & Mode ────────────────── */}
          <AccordionItem value="presets" className="border-b border-border/40">
            <AccordionTrigger className="py-2 text-xs font-mono font-bold uppercase tracking-[0.15em] text-muted-foreground hover:text-foreground hover:no-underline">
              Presets &amp; Mode
            </AccordionTrigger>
            <AccordionContent className="pb-2 space-y-2">
              <div className="space-y-1">
                <span className="section-label">Mode</span>
                <ModeChips current={settings.mode} onModeChange={onModeChange} />
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-1">
                  <span className="section-label">EQ Style</span>
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
                      className={`cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 px-1.5 py-0.5 rounded text-sm font-mono font-bold tracking-wide transition-colors ${
                        settings.eqPreset === style ? 'bg-primary/20 text-primary border border-primary/40' : 'text-muted-foreground hover:text-foreground border border-transparent hover:border-border'
                      }`}
                    >{label}</button>
                  ))}
                </div>
              </div>

              <PresetsList presets={customPresets} onLoad={handleLoadPreset} onDelete={handleDeletePreset} />

              {showSaveInput ? (
                <div className="flex items-center gap-1">
                  <input value={presetName} onChange={(e) => setPresetName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSavePreset()}
                    placeholder="Preset name..." autoFocus maxLength={20}
                    className="flex-1 px-1.5 py-0.5 rounded text-sm bg-muted border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                  <button onClick={handleSavePreset} disabled={!presetName.trim()}
                    className="cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 px-1.5 py-0.5 rounded text-sm font-medium bg-primary/20 text-primary border border-primary/40 disabled:opacity-40 transition-colors">Save</button>
                  <button onClick={() => { setShowSaveInput(false); setPresetName('') }}
                    className="cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 text-muted-foreground hover:text-foreground p-0.5"><X className="w-4 h-4" /></button>
                </div>
              ) : (
                customPresets.length < MAX_CUSTOM_PRESETS && (
                  <button onClick={() => setShowSaveInput(true)}
                    className="cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
                    <Save className="w-3 h-3" /> Save as Preset
                  </button>
                )
              )}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
    </>
  )
})
