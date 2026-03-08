'use client'

import { useState, useEffect, useMemo, memo } from 'react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { calculateRoomModes, formatRoomModesForDisplay } from '@/lib/dsp/acousticUtils'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { ResetConfirmDialog } from './ResetConfirmDialog'
import { Settings, RotateCcw, HelpCircle, BarChart3, Monitor, Download, FileJson, Ruler, Cpu, Wrench, ChevronDown } from 'lucide-react'
import { getRoomParametersFromDimensions, feetToMeters, calculateSchroederFrequency } from '@/lib/dsp/acousticUtils'
import { ROOM_PRESETS } from '@/lib/dsp/constants'
import type { RoomPresetKey } from '@/lib/dsp/constants'
import type { DetectorSettings, AlgorithmMode, Algorithm, OperationMode, ThresholdMode } from '@/types/advisory'

interface SettingsPanelProps {
  settings: DetectorSettings
  onSettingsChange: (settings: Partial<DetectorSettings>) => void
  onModeChange: (mode: OperationMode) => void
  onReset: () => void
}

// ── Section (flat, uniform) ──────────────────────────────────────────────────

function Section({ title, tooltip, showTooltip = true, children }: {
  title: string
  tooltip?: string
  showTooltip?: boolean
  children: React.ReactNode
}) {
  return (
    <TooltipProvider delayDuration={300}>
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <h3 className="text-sm font-medium text-foreground">{title}</h3>
          {tooltip && showTooltip && (
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-[220px] text-xs">
                {tooltip}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
        {children}
      </div>
    </TooltipProvider>
  )
}

// ── SectionGroup (collapsible, wraps multiple Sections) ──────────────────────

function SectionGroup({ title, defaultOpen = true, children }: {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 w-full py-1.5 text-xs font-semibold font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors">
        <span className="flex-1 text-left">{title}</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? '' : '-rotate-90'}`} />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-4 pt-2">
        {children}
      </CollapsibleContent>
    </Collapsible>
  )
}

// ── Room Modes Display ─────────────────────────────────────────────────────────

function RoomModesDisplay({ lengthM, widthM, heightM }: { lengthM: number; widthM: number; heightM: number }) {
  const modes = useMemo(() => {
    if (lengthM <= 0 || widthM <= 0 || heightM <= 0) return null
    return calculateRoomModes(lengthM, widthM, heightM)
  }, [lengthM, widthM, heightM])

  const formatted = useMemo(() => {
    if (!modes) return null
    return formatRoomModesForDisplay(modes)
  }, [modes])

  if (!formatted || formatted.all.length === 0) {
    return (
      <p className="text-[0.5625rem] text-muted-foreground">
        Enter valid room dimensions to calculate modes.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-[0.5625rem] text-muted-foreground">
        Found {formatted.all.length} room modes below 300Hz:
      </p>
      {formatted.axial.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-destructive" />
            <span className="text-[0.5625rem] font-medium text-foreground">Axial (strongest)</span>
          </div>
          <div className="flex flex-wrap gap-1 pl-3.5">
            {formatted.axial.slice(0, 8).map((mode, i) => (
              <span key={i} className="px-1.5 py-0.5 text-[0.5625rem] font-mono bg-destructive/10 text-destructive rounded" title={`Mode ${mode.label}`}>
                {mode.hz}Hz
              </span>
            ))}
            {formatted.axial.length > 8 && <span className="text-[0.5625rem] text-muted-foreground">+{formatted.axial.length - 8} more</span>}
          </div>
        </div>
      )}
      {formatted.tangential.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-yellow-500" />
            <span className="text-[0.5625rem] font-medium text-foreground">Tangential (medium)</span>
          </div>
          <div className="flex flex-wrap gap-1 pl-3.5">
            {formatted.tangential.slice(0, 6).map((mode, i) => (
              <span key={i} className="px-1.5 py-0.5 text-[0.5625rem] font-mono bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 rounded" title={`Mode ${mode.label}`}>
                {mode.hz}Hz
              </span>
            ))}
            {formatted.tangential.length > 6 && <span className="text-[0.5625rem] text-muted-foreground">+{formatted.tangential.length - 6} more</span>}
          </div>
        </div>
      )}
      {formatted.oblique.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-muted-foreground/50" />
            <span className="text-[0.5625rem] font-medium text-foreground">Oblique (weakest)</span>
          </div>
          <div className="flex flex-wrap gap-1 pl-3.5">
            {formatted.oblique.slice(0, 4).map((mode, i) => (
              <span key={i} className="px-1.5 py-0.5 text-[0.5625rem] font-mono bg-muted/50 text-muted-foreground rounded" title={`Mode ${mode.label}`}>
                {mode.hz}Hz
              </span>
            ))}
            {formatted.oblique.length > 4 && <span className="text-[0.5625rem] text-muted-foreground">+{formatted.oblique.length - 4} more</span>}
          </div>
        </div>
      )}
      <p className="text-[0.5rem] text-muted-foreground/70 pt-1">
        Tip: If detected feedback matches a room mode, it may be a resonance rather than feedback.
      </p>
    </div>
  )
}

// ── Main Settings Panel ────────────────────────────────────────────────────────

export const SettingsPanel = memo(function SettingsPanel({
  settings,
  onSettingsChange,
  onModeChange,
  onReset,
}: SettingsPanelProps) {
  const [hasSavedDefaults, setHasSavedDefaults] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('ktr-custom-defaults')
    setHasSavedDefaults(!!saved)
  }, [])

  // Auto-derive RT60 and Volume from dimensions + treatment whenever they change
  useEffect(() => {
    if (settings.roomPreset === 'none') return // No auto-derivation for 'none'
    const l = settings.roomLengthM
    const w = settings.roomWidthM
    const h = settings.roomHeightM
    if (l <= 0 || w <= 0 || h <= 0) return
    // Convert from display unit to meters for calculation
    const lM = settings.roomDimensionsUnit === 'feet' ? feetToMeters(l) : l
    const wM = settings.roomDimensionsUnit === 'feet' ? feetToMeters(w) : w
    const hM = settings.roomDimensionsUnit === 'feet' ? feetToMeters(h) : h
    const params = getRoomParametersFromDimensions(lM, wM, hM, settings.roomTreatment)
    onSettingsChange({
      roomRT60: Math.round(params.rt60 * 10) / 10,
      roomVolume: Math.round(params.volume),
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.roomLengthM, settings.roomWidthM, settings.roomHeightM, settings.roomTreatment, settings.roomDimensionsUnit, settings.roomPreset])

  const handleSaveAsDefaults = () => {
    localStorage.setItem('ktr-custom-defaults', JSON.stringify(settings))
    setHasSavedDefaults(true)
  }

  const handleLoadDefaults = () => {
    const saved = localStorage.getItem('ktr-custom-defaults')
    if (saved) {
      try {
        const defaults = JSON.parse(saved)
        // Backward compat: strip removed fields, add new ones
        delete defaults.roomModesEnabled
        if (!defaults.roomTreatment) defaults.roomTreatment = 'typical'
        if (!defaults.roomPreset) defaults.roomPreset = 'none'
        // Migrate legacy algorithm modes to custom + enabledAlgorithms
        if (defaults.algorithmMode && defaults.algorithmMode !== 'auto' && defaults.algorithmMode !== 'custom') {
          const allAlgos: Algorithm[] = ['msd', 'phase', 'spectral', 'comb', 'ihr', 'ptmr']
          const modeMap: Record<string, Algorithm[]> = {
            msd: ['msd'],
            phase: ['phase'],
            combined: allAlgos,
            all: allAlgos,
          }
          defaults.enabledAlgorithms = modeMap[defaults.algorithmMode] ?? allAlgos
          defaults.algorithmMode = 'custom'
        }
        onSettingsChange(defaults)
      } catch {
        alert('Failed to load saved defaults')
      }
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground h-14 w-14 p-0 sm:h-auto sm:w-auto sm:px-3" aria-label="Settings">
          <Settings className="w-7 h-7 sm:w-4 sm:h-4" />
          <span className="hidden sm:inline text-xs">Settings</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold tracking-tight flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Settings
          </DialogTitle>
          <DialogDescription className="text-xs">
            Detection, algorithms, display, room acoustics, and advanced tuning.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="detection" className="mt-4">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="detection" className="gap-1 text-xs">
              <BarChart3 className="w-3.5 h-3.5" />
              Detection
            </TabsTrigger>
            <TabsTrigger value="algorithms" className="gap-1 text-xs">
              <Cpu className="w-3.5 h-3.5" />
              Algorithms
            </TabsTrigger>
            <TabsTrigger value="display" className="gap-1 text-xs">
              <Monitor className="w-3.5 h-3.5" />
              Display
            </TabsTrigger>
            <TabsTrigger value="room" className="gap-1 text-xs">
              <Ruler className="w-3.5 h-3.5" />
              Room
            </TabsTrigger>
            <TabsTrigger value="advanced" className="gap-1 text-xs">
              <Wrench className="w-3.5 h-3.5" />
              Advanced
            </TabsTrigger>
          </TabsList>

          {/* ═══════════════════════════════════════════════════════════════════
              TAB 1: DETECTION — ordered high → low impact
              ═══════════════════════════════════════════════════════════════════ */}
          <TabsContent value="detection" className="mt-4 space-y-4">

            <SectionGroup title="Sensitivity" defaultOpen={true}>
              <Section
                title="Operation Mode"
                showTooltip={settings.showTooltips}
                tooltip="Professional presets that configure detection for specific live sound scenarios. Each preset adjusts thresholds, frequency range, timing, and sensitivity."
              >
                <Select
                  value={settings.mode}
                  onValueChange={(v) => onModeChange(v as OperationMode)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="speech">Speech - Corporate & Conference</SelectItem>
                    <SelectItem value="worship">Worship - House of Worship</SelectItem>
                    <SelectItem value="liveMusic">Live Music - Concerts & Events</SelectItem>
                    <SelectItem value="theater">Theater - Drama & Musicals</SelectItem>
                    <SelectItem value="monitors">Monitors - Stage Wedges</SelectItem>
                    <SelectItem value="ringOut">Ring Out - System Calibration</SelectItem>
                    <SelectItem value="broadcast">Broadcast - Studio & Podcast</SelectItem>
                    <SelectItem value="outdoor">Outdoor - Open Air & Festivals</SelectItem>
                  </SelectContent>
                </Select>
              </Section>

              <Section
                title="Feedback Threshold"
                showTooltip={settings.showTooltips}
                tooltip="Primary sensitivity. 4-6 dB sensitive (speech/monitors), 8-10 dB balanced (worship/outdoor), 12+ dB conservative (live music)."
              >
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Threshold</span>
                    <span className="text-xs font-mono">{settings.feedbackThresholdDb}dB</span>
                  </div>
                  <Slider
                    value={[settings.feedbackThresholdDb]}
                    onValueChange={([v]) => onSettingsChange({ feedbackThresholdDb: v })}
                    min={2} max={20} step={1}
                  />
                  <div className="flex justify-between text-[0.5625rem] text-muted-foreground">
                    <span>Aggressive</span><span>Conservative</span>
                  </div>
                </div>
              </Section>

              <Section
                title="Ring Threshold"
                showTooltip={settings.showTooltips}
                tooltip="Resonance detection. 2-3 dB ring out/monitors, 4-5 dB normal, 6+ dB live music/outdoor."
              >
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Threshold</span>
                    <span className="text-xs font-mono">{settings.ringThresholdDb}dB</span>
                  </div>
                  <Slider
                    value={[settings.ringThresholdDb]}
                    onValueChange={([v]) => onSettingsChange({ ringThresholdDb: v })}
                    min={1} max={12} step={0.5}
                  />
                  <div className="flex justify-between text-[0.5625rem] text-muted-foreground">
                    <span>Sensitive</span><span>Tolerant</span>
                  </div>
                </div>
              </Section>

              <Section
                title="Growth Rate"
                showTooltip={settings.showTooltips}
                tooltip="How fast feedback must grow. 0.5-1dB/s catches early, 3+dB/s only runaway."
              >
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Rate</span>
                    <span className="text-xs font-mono">{settings.growthRateThreshold.toFixed(1)}dB/s</span>
                  </div>
                  <Slider
                    value={[settings.growthRateThreshold]}
                    onValueChange={([v]) => onSettingsChange({ growthRateThreshold: v })}
                    min={0.5} max={8} step={0.5}
                  />
                  <div className="flex justify-between text-[0.5625rem] text-muted-foreground">
                    <span>Early catch</span><span>Runaway only</span>
                  </div>
                </div>
              </Section>

              <Section
                title="Confidence Threshold"
                showTooltip={settings.showTooltips}
                tooltip="Minimum confidence to display. Lower = more alerts (catch everything). Higher = fewer alerts (may miss feedback)."
              >
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Min. Confidence</span>
                    <span className="text-xs font-mono">{Math.round(settings.confidenceThreshold * 100)}%</span>
                  </div>
                  <Slider
                    value={[settings.confidenceThreshold * 100]}
                    onValueChange={([v]) => onSettingsChange({ confidenceThreshold: v / 100 })}
                    min={0} max={100} step={1}
                  />
                  <div className="flex justify-between text-[0.5625rem] text-muted-foreground">
                    <span>Catch everything</span><span>High confidence only</span>
                  </div>
                </div>
              </Section>

              <Section
                title="Hold Time"
                showTooltip={settings.showTooltips}
                tooltip="How long detected issues stay visible after disappearing. 1-2s for fast workflow, 3-4s for careful tuning."
              >
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Duration</span>
                    <span className="text-xs font-mono">{(settings.holdTimeMs / 1000).toFixed(1)}s</span>
                  </div>
                  <Slider
                    value={[settings.holdTimeMs]}
                    onValueChange={([v]) => onSettingsChange({ holdTimeMs: v })}
                    min={500} max={5000} step={250}
                  />
                  <div className="flex justify-between text-[0.5625rem] text-muted-foreground">
                    <span>Quick</span><span>Persistent</span>
                  </div>
                </div>
              </Section>
            </SectionGroup>

            <div className="border-t border-border/30" />

            <SectionGroup title="Analysis" defaultOpen={false}>
              <Section
                title="FFT Size"
                showTooltip={settings.showTooltips}
                tooltip="Controls frequency resolution vs response time. 4096 for fast response, 8192 for balanced PA use, 16384 for precise low-end analysis."
              >
                <Select
                  value={settings.fftSize.toString()}
                  onValueChange={(v) => onSettingsChange({ fftSize: parseInt(v) as 4096 | 8192 | 16384 })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="4096">4096 - Fast (~12Hz res @ 48kHz)</SelectItem>
                    <SelectItem value="8192">8192 - Balanced (~6Hz res)</SelectItem>
                    <SelectItem value="16384">16384 - High Res (~3Hz res)</SelectItem>
                  </SelectContent>
                </Select>
              </Section>

              <Section
                title="Spectrum Smoothing"
                showTooltip={settings.showTooltips}
                tooltip="Averages spectral frames to reduce visual noise. 0-30% for detailed analysis, 50-70% for general use, 80%+ for presentation."
              >
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Amount</span>
                    <span className="text-xs font-mono">{(settings.smoothingTimeConstant * 100).toFixed(0)}%</span>
                  </div>
                  <Slider
                    value={[settings.smoothingTimeConstant]}
                    onValueChange={([v]) => onSettingsChange({ smoothingTimeConstant: v })}
                    min={0} max={0.95} step={0.05}
                  />
                  <div className="flex justify-between text-[0.5625rem] text-muted-foreground">
                    <span>Raw</span><span>Smooth</span>
                  </div>
                </div>
              </Section>

              <Section
                title="A-Weighting"
                showTooltip={settings.showTooltips}
                tooltip="IEC 61672-1 A-weighting curve matching human hearing sensitivity. Reduces low-frequency emphasis."
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Apply A-weighting curve</span>
                  <Switch
                    checked={settings.aWeightingEnabled}
                    onCheckedChange={(checked) => onSettingsChange({ aWeightingEnabled: checked })}
                  />
                </div>
              </Section>
            </SectionGroup>

            <div className="border-t border-border/30" />

            <SectionGroup title="Filtering" defaultOpen={false}>
              <Section
                title="Harmonic Filter"
                showTooltip={settings.showTooltips}
                tooltip="Detects harmonic overtones to reduce false positives for instruments like bass guitar."
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Filter instruments</span>
                  <Switch
                    checked={settings.harmonicFilterEnabled}
                    onCheckedChange={(checked) => onSettingsChange({ harmonicFilterEnabled: checked })}
                  />
                </div>
              </Section>

              <Section
                title="Harmonic Tolerance"
                showTooltip={settings.showTooltips}
                tooltip="Cents window for harmonic/sub-harmonic matching. 25-50 cents for ring out, 100-200 cents for live with reverb, 300+ for highly reverberant rooms."
              >
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Window</span>
                    <span className="text-xs font-mono">{settings.harmonicToleranceCents}¢</span>
                  </div>
                  <Slider
                    value={[settings.harmonicToleranceCents]}
                    onValueChange={([v]) => onSettingsChange({ harmonicToleranceCents: v })}
                    min={25} max={400} step={25}
                  />
                  <div className="flex justify-between text-[0.5625rem] text-muted-foreground">
                    <span>Tight (ring out)</span><span>Wide (live)</span>
                  </div>
                </div>
              </Section>
            </SectionGroup>
          </TabsContent>

          {/* ═══════════════════════════════════════════════════════════════════
              TAB 2: ALGORITHMS — ordered high → low impact
              ═══════════════════════════════════════════════════════════════════ */}
          <TabsContent value="algorithms" className="mt-4 space-y-4">

            <Section
              title="Algorithm Mode"
              showTooltip={settings.showTooltips}
              tooltip="Auto: content-adaptive selection. Custom: toggle individual algorithms on/off. MSD: growth detection. Phase: coherence. Spectral: flatness. Comb: feedback-loop harmonics. IHR: inter-harmonic ratio. PTMR: peak sharpness."
            >
              <div className="space-y-2">
                {/* Auto toggle */}
                <button
                  onClick={() => {
                    if (settings.algorithmMode !== 'auto') {
                      onSettingsChange({ algorithmMode: 'auto' as AlgorithmMode })
                    } else {
                      onSettingsChange({ algorithmMode: 'custom' as AlgorithmMode })
                    }
                  }}
                  className={`w-full px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                    settings.algorithmMode === 'auto'
                      ? 'bg-primary/20 border border-primary/50 text-primary'
                      : 'bg-muted/50 border border-transparent text-muted-foreground hover:bg-muted'
                  }`}
                >
                  Auto — Content Adaptive
                </button>

                {/* Individual algorithm toggles */}
                <div className={`grid grid-cols-3 gap-1 ${settings.algorithmMode === 'auto' ? 'opacity-40 pointer-events-none' : ''}`}>
                  {([
                    ['msd', 'MSD', 'Magnitude Slope'],
                    ['phase', 'Phase', 'Coherence'],
                    ['spectral', 'Spectral', 'Flatness'],
                    ['comb', 'Comb', 'Loop Pattern'],
                    ['ihr', 'IHR', 'Harmonics'],
                    ['ptmr', 'PTMR', 'Peak Shape'],
                  ] as const).map(([key, label, desc]) => {
                    const enabled = settings.enabledAlgorithms?.includes(key) ?? true
                    return (
                      <button
                        key={key}
                        onClick={() => {
                          const current = settings.enabledAlgorithms ?? ['msd', 'phase', 'spectral', 'comb', 'ihr', 'ptmr']
                          let next: Algorithm[]
                          if (enabled) {
                            next = current.filter(a => a !== key)
                            // If all toggled off, force back to auto
                            if (next.length === 0) {
                              onSettingsChange({ algorithmMode: 'auto' as AlgorithmMode })
                              return
                            }
                          } else {
                            next = [...current, key]
                          }
                          onSettingsChange({ enabledAlgorithms: next })
                        }}
                        className={`flex flex-col items-center px-1 py-0.5 rounded-md transition-colors ${
                          enabled
                            ? 'bg-primary/20 border border-primary/50 text-primary'
                            : 'bg-muted/50 border border-transparent text-muted-foreground hover:bg-muted'
                        }`}
                      >
                        <span className="text-xs font-medium">{label}</span>
                        <span className="text-[0.5rem] text-muted-foreground">{desc}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </Section>

            <Section
              title="Music-Aware Mode"
              showTooltip={settings.showTooltips}
              tooltip="Auto-activates higher thresholds when signal rises above noise floor. Reduces false positives during live music."
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Auto Music-Aware</span>
                  <Switch
                    checked={settings.autoMusicAware}
                    onCheckedChange={(checked) => onSettingsChange({ autoMusicAware: checked })}
                  />
                </div>
                {settings.autoMusicAware && (
                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-muted-foreground">Trigger Level</span>
                      <span className="text-xs font-mono">{settings.autoMusicAwareHysteresisDb}dB</span>
                    </div>
                    <Slider
                      value={[settings.autoMusicAwareHysteresisDb]}
                      onValueChange={([v]) => onSettingsChange({ autoMusicAwareHysteresisDb: v })}
                      min={5} max={30} step={1}
                    />
                    <div className="flex justify-between text-[0.5625rem] text-muted-foreground">
                      <span>Sensitive (5dB)</span><span>Loud only (30dB)</span>
                    </div>
                  </div>
                )}
              </div>
            </Section>

            <Section
              title="Whistle Suppression"
              showTooltip={settings.showTooltips}
              tooltip="When enabled, whistle classifications are suppressed from results. Disable if you want to detect human whistling or whistle-like feedback."
            >
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Ignore whistle</span>
                <Switch
                  checked={settings.ignoreWhistle}
                  onCheckedChange={(checked) => onSettingsChange({ ignoreWhistle: checked })}
                />
              </div>
            </Section>

            <Section
              title="Max Tracks"
              showTooltip={settings.showTooltips}
              tooltip="Maximum simultaneous frequency tracks. Higher = more peaks tracked at once. Lower = less CPU usage."
            >
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Limit</span>
                  <span className="text-xs font-mono">{settings.maxTracks}</span>
                </div>
                <Slider
                  value={[settings.maxTracks]}
                  onValueChange={([v]) => onSettingsChange({ maxTracks: v })}
                  min={8} max={128} step={8}
                />
                <div className="flex justify-between text-[0.5625rem] text-muted-foreground">
                  <span>Fewer</span><span>More</span>
                </div>
              </div>
            </Section>

            <Section
              title="Track Timeout"
              showTooltip={settings.showTooltips}
              tooltip="How long a track stays alive without updates before being removed. Shorter = more responsive, longer = more tolerant of intermittent signals."
            >
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Timeout</span>
                  <span className="text-xs font-mono">{settings.trackTimeoutMs}ms</span>
                </div>
                <Slider
                  value={[settings.trackTimeoutMs]}
                  onValueChange={([v]) => onSettingsChange({ trackTimeoutMs: v })}
                  min={200} max={5000} step={100}
                />
                <div className="flex justify-between text-[0.5625rem] text-muted-foreground">
                  <span>Responsive</span><span>Tolerant</span>
                </div>
              </div>
            </Section>

            <Section
              title="Algorithm Scores"
              showTooltip={settings.showTooltips}
              tooltip="Shows live algorithm scoring in the status bar. Useful for diagnosing detection behavior."
            >
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Show live scores</span>
                <Switch
                  checked={settings.showAlgorithmScores}
                  onCheckedChange={(checked) => onSettingsChange({ showAlgorithmScores: checked })}
                />
              </div>
            </Section>
          </TabsContent>

          {/* ═══════════════════════════════════════════════════════════════════
              TAB 3: DISPLAY — ordered high → low impact
              ═══════════════════════════════════════════════════════════════════ */}
          <TabsContent value="display" className="mt-4 space-y-4">

            <Section
              title="EQ Recommendation Style"
              showTooltip={settings.showTooltips}
              tooltip="Surgical: narrow Q (8-16), deep cuts. Heavy: wider Q (2-4), moderate cuts."
            >
              <Select
                value={settings.eqPreset}
                onValueChange={(v) => onSettingsChange({ eqPreset: v as 'surgical' | 'heavy' })}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="surgical">Surgical - Narrow Q, Deep Cuts</SelectItem>
                  <SelectItem value="heavy">Heavy - Wide Q, Moderate Cuts</SelectItem>
                </SelectContent>
              </Select>
            </Section>

            <Section
              title="Max Issues Shown"
              showTooltip={settings.showTooltips}
              tooltip="How many feedback issues display at once. 6 for focused work, 12 for full overview."
            >
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Limit</span>
                  <span className="text-xs font-mono">{settings.maxDisplayedIssues}</span>
                </div>
                <Slider
                  value={[settings.maxDisplayedIssues]}
                  onValueChange={([v]) => onSettingsChange({ maxDisplayedIssues: v })}
                  min={3} max={12} step={1}
                />
                <div className="flex justify-between text-[0.5625rem] text-muted-foreground">
                  <span>Focused</span><span>All Issues</span>
                </div>
              </div>
            </Section>

            <Section
              title="RTA dB Range"
              showTooltip={settings.showTooltips}
              tooltip="Adjusts the visible amplitude range on the RTA graph. Narrower range shows more detail in the visible portion."
            >
              <div className="space-y-3">
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Min</span>
                    <span className="text-xs font-mono">{settings.rtaDbMin}dB</span>
                  </div>
                  <Slider
                    value={[settings.rtaDbMin]}
                    onValueChange={([v]) => onSettingsChange({ rtaDbMin: v })}
                    min={-120} max={-60} step={5}
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Max</span>
                    <span className="text-xs font-mono">{settings.rtaDbMax}dB</span>
                  </div>
                  <Slider
                    value={[settings.rtaDbMax]}
                    onValueChange={([v]) => onSettingsChange({ rtaDbMax: v })}
                    min={-20} max={0} step={5}
                  />
                </div>
              </div>
            </Section>

            <Section
              title="Spectrum Line Width"
              showTooltip={settings.showTooltips}
              tooltip="Thickness of the RTA spectrum line. Thinner for detailed analysis, thicker for visibility from a distance."
            >
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Width</span>
                  <span className="text-xs font-mono">{settings.spectrumLineWidth.toFixed(1)}px</span>
                </div>
                <Slider
                  value={[settings.spectrumLineWidth]}
                  onValueChange={([v]) => onSettingsChange({ spectrumLineWidth: v })}
                  min={0.5} max={4} step={0.5}
                />
                <div className="flex justify-between text-[0.5625rem] text-muted-foreground">
                  <span>Thin</span><span>Thick</span>
                </div>
              </div>
            </Section>

            <Section
              title="Graph Label Size"
              showTooltip={settings.showTooltips}
              tooltip="Font size for labels inside RTA and GEQ graphs. Increase for high-DPI displays or distance viewing."
            >
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Size</span>
                  <span className="text-xs font-mono">{settings.graphFontSize}px</span>
                </div>
                <Slider
                  value={[settings.graphFontSize]}
                  onValueChange={([v]) => onSettingsChange({ graphFontSize: v })}
                  min={8} max={26} step={1}
                />
                <div className="flex justify-between text-[0.5625rem] text-muted-foreground">
                  <span>Small</span><span>Large</span>
                </div>
              </div>
            </Section>

            <Section
              title="Tooltips"
              showTooltip={settings.showTooltips}
              tooltip="Show contextual help on controls. Disable once you know the system."
            >
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Show help tooltips</span>
                <Switch
                  checked={settings.showTooltips}
                  onCheckedChange={(checked) => onSettingsChange({ showTooltips: checked })}
                />
              </div>
            </Section>

          </TabsContent>

          {/* ═══════════════════════════════════════════════════════════════════
              TAB 4: ADVANCED — Noise Floor, Peak Detection
              ═══════════════════════════════════════════════════════════════════ */}
          <TabsContent value="advanced" className="mt-4 space-y-4">

            {/* ── Noise Floor ── */}
            <Section
              title="Noise Floor"
              showTooltip={settings.showTooltips}
              tooltip="Controls how the adaptive noise floor estimates and tracks ambient noise levels."
            >
              <div className="space-y-3">
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Decay Rate</span>
                    <span className="text-xs font-mono">{settings.noiseFloorDecay.toFixed(3)}</span>
                  </div>
                  <Slider
                    value={[settings.noiseFloorDecay]}
                    onValueChange={([v]) => onSettingsChange({ noiseFloorDecay: v })}
                    min={0.90} max={0.999} step={0.005}
                  />
                  <div className="flex justify-between text-[0.5625rem] text-muted-foreground">
                    <span>Fast (dynamic)</span><span>Slow (stable)</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Attack Time</span>
                    <span className="text-xs font-mono">{settings.noiseFloorAttackMs}ms</span>
                  </div>
                  <Slider
                    value={[settings.noiseFloorAttackMs]}
                    onValueChange={([v]) => onSettingsChange({ noiseFloorAttackMs: v })}
                    min={50} max={1000} step={25}
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Release Time</span>
                    <span className="text-xs font-mono">{settings.noiseFloorReleaseMs}ms</span>
                  </div>
                  <Slider
                    value={[settings.noiseFloorReleaseMs]}
                    onValueChange={([v]) => onSettingsChange({ noiseFloorReleaseMs: v })}
                    min={200} max={5000} step={100}
                  />
                </div>
              </div>
            </Section>

            {/* ── Peak Detection ── */}
            <Section
              title="Peak Detection"
              showTooltip={settings.showTooltips}
              tooltip="Fine-tune how peaks are detected, confirmed, and cleared. Controls sustain timing, threshold modes, and peak merging."
            >
              <div className="space-y-3">
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Peak Merge Window</span>
                    <span className="text-xs font-mono">{settings.peakMergeCents}¢</span>
                  </div>
                  <Slider
                    value={[settings.peakMergeCents]}
                    onValueChange={([v]) => onSettingsChange({ peakMergeCents: v })}
                    min={10} max={150} step={5}
                  />
                  <div className="flex justify-between text-[0.5625rem] text-muted-foreground">
                    <span>Narrow (precise)</span><span>Wide (merged)</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Sustain Time</span>
                    <span className="text-xs font-mono">{settings.sustainMs}ms</span>
                  </div>
                  <Slider
                    value={[settings.sustainMs]}
                    onValueChange={([v]) => onSettingsChange({ sustainMs: v })}
                    min={100} max={2000} step={50}
                  />
                  <div className="flex justify-between text-[0.5625rem] text-muted-foreground">
                    <span>Fast confirm</span><span>Cautious</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Clear Time</span>
                    <span className="text-xs font-mono">{settings.clearMs}ms</span>
                  </div>
                  <Slider
                    value={[settings.clearMs]}
                    onValueChange={([v]) => onSettingsChange({ clearMs: v })}
                    min={100} max={2000} step={50}
                  />
                  <div className="flex justify-between text-[0.5625rem] text-muted-foreground">
                    <span>Quick clear</span><span>Persistent</span>
                  </div>
                </div>

                <Section
                  title="Threshold Mode"
                  showTooltip={settings.showTooltips}
                  tooltip="Absolute: fixed dB threshold. Relative: above noise floor. Hybrid: uses both (recommended)."
                >
                  <Select
                    value={settings.thresholdMode}
                    onValueChange={(v) => onSettingsChange({ thresholdMode: v as ThresholdMode })}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="absolute">Absolute - Fixed dB</SelectItem>
                      <SelectItem value="relative">Relative - Above Noise</SelectItem>
                      <SelectItem value="hybrid">Hybrid - Both (Recommended)</SelectItem>
                    </SelectContent>
                  </Select>
                </Section>

                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Relative Threshold</span>
                    <span className="text-xs font-mono">{settings.relativeThresholdDb}dB</span>
                  </div>
                  <Slider
                    value={[settings.relativeThresholdDb]}
                    onValueChange={([v]) => onSettingsChange({ relativeThresholdDb: v })}
                    min={6} max={30} step={1}
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Prominence</span>
                    <span className="text-xs font-mono">{settings.prominenceDb}dB</span>
                  </div>
                  <Slider
                    value={[settings.prominenceDb]}
                    onValueChange={([v]) => onSettingsChange({ prominenceDb: v })}
                    min={4} max={30} step={1}
                  />
                  <div className="flex justify-between text-[0.5625rem] text-muted-foreground">
                    <span>Sensitive</span><span>Only strong peaks</span>
                  </div>
                </div>
              </div>
            </Section>

          </TabsContent>

          {/* ═══════════════════════════════════════════════════════════════════
              TAB 5: ROOM — Unified room acoustics + mode calculator
              ═══════════════════════════════════════════════════════════════════ */}
          <TabsContent value="room" className="mt-4 space-y-4">

            <Section
              title="Room Physics"
              showTooltip={settings.showTooltips}
              tooltip="Room dimensions configure frequency-dependent thresholds, Schroeder boundary, room mode identification, and reverberation analysis. Select 'None' for raw detection without room modeling."
            >
              <div className="space-y-4">
                {/* Preset grid */}
                <div className="space-y-2">
                  <span className="text-xs text-muted-foreground">Room Preset</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(Object.keys(ROOM_PRESETS) as RoomPresetKey[]).map((key) => {
                      const preset = ROOM_PRESETS[key]
                      const isSelected = settings.roomPreset === key
                      return (
                        <button
                          key={key}
                          onClick={() => {
                            const updates: Partial<DetectorSettings> = {
                              roomPreset: key,
                              feedbackThresholdDb: preset.feedbackThresholdDb,
                              ringThresholdDb: preset.ringThresholdDb,
                            }
                            if (key !== 'none') {
                              updates.roomLengthM = preset.lengthM
                              updates.roomWidthM = preset.widthM
                              updates.roomHeightM = preset.heightM
                              updates.roomTreatment = preset.treatment
                            }
                            onSettingsChange(updates)
                          }}
                          className={`flex flex-col items-start px-2 py-1.5 rounded-md text-left transition-colors ${
                            isSelected
                              ? 'bg-primary/20 border border-primary/50 text-primary'
                              : 'bg-muted/50 border border-transparent hover:bg-muted'
                          }`}
                        >
                          <span className="text-xs font-medium">{preset.label}</span>
                          <span className="text-[0.5625rem] text-muted-foreground">{preset.description}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* All controls below are only shown when preset !== 'none' */}
                {settings.roomPreset !== 'none' && (
                  <>
                    {/* Unit toggle */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Unit:</span>
                      <div className="flex gap-1">
                        {(['meters', 'feet'] as const).map((unit) => (
                          <button
                            key={unit}
                            onClick={() => onSettingsChange({ roomDimensionsUnit: unit })}
                            className={`px-2 py-0.5 text-xs rounded ${
                              settings.roomDimensionsUnit === unit
                                ? 'bg-primary/20 text-primary'
                                : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                            }`}
                          >
                            {unit === 'meters' ? 'm' : 'ft'}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Shared dimension inputs */}
                    <div className="grid grid-cols-3 gap-2">
                      {([
                        ['Length', 'roomLengthM', 100] as const,
                        ['Width', 'roomWidthM', 100] as const,
                        ['Height', 'roomHeightM', 30] as const,
                      ]).map(([label, field, max]) => (
                        <div key={field} className="space-y-1">
                          <label className="text-[0.5625rem] text-muted-foreground">{label}</label>
                          <input
                            type="number"
                            value={settings[field]}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || 1
                              const update: Partial<DetectorSettings> = { [field]: val }
                              // Auto-switch to 'custom' if editing dimensions on a named preset
                              if (settings.roomPreset !== 'custom') {
                                update.roomPreset = 'custom'
                              }
                              onSettingsChange(update)
                            }}
                            className="w-full h-7 px-2 text-xs rounded border border-border bg-background focus:outline-none focus:border-primary"
                            min={1} max={max} step={0.5}
                          />
                        </div>
                      ))}
                    </div>

                    {/* Treatment selector */}
                    <div className="space-y-1">
                      <label className="text-[0.5625rem] text-muted-foreground">Acoustic Treatment</label>
                      <div className="flex gap-1">
                        {([
                          ['untreated', 'Untreated'],
                          ['typical', 'Typical'],
                          ['treated', 'Treated'],
                        ] as const).map(([val, label]) => (
                          <button
                            key={val}
                            onClick={() => {
                              const update: Partial<DetectorSettings> = { roomTreatment: val }
                              if (settings.roomPreset !== 'custom') update.roomPreset = 'custom'
                              onSettingsChange(update)
                            }}
                            className={`flex-1 px-2 py-1 text-xs rounded ${
                              settings.roomTreatment === val
                                ? 'bg-primary/20 text-primary'
                                : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Auto-derived readouts */}
                    <div className="grid grid-cols-3 gap-2 text-[0.5625rem] text-muted-foreground">
                      <div className="bg-muted/50 rounded px-2 py-1.5 text-center">
                        <div className="font-mono font-medium text-foreground">{settings.roomRT60.toFixed(1)}s</div>
                        <div>RT60</div>
                      </div>
                      <div className="bg-muted/50 rounded px-2 py-1.5 text-center">
                        <div className="font-mono font-medium text-foreground">{settings.roomVolume}m³</div>
                        <div>Volume</div>
                      </div>
                      <div className="bg-muted/50 rounded px-2 py-1.5 text-center">
                        <div className="font-mono font-medium text-foreground">{Math.round(calculateSchroederFrequency(settings.roomRT60, settings.roomVolume))}Hz</div>
                        <div>Schroeder</div>
                      </div>
                    </div>

                    {/* Room Modes */}
                    <div className="pt-2 border-t border-border/50">
                      <RoomModesDisplay
                        lengthM={settings.roomDimensionsUnit === 'feet' ? settings.roomLengthM * 0.3048 : settings.roomLengthM}
                        widthM={settings.roomDimensionsUnit === 'feet' ? settings.roomWidthM * 0.3048 : settings.roomWidthM}
                        heightM={settings.roomDimensionsUnit === 'feet' ? settings.roomHeightM * 0.3048 : settings.roomHeightM}
                      />
                    </div>
                  </>
                )}
              </div>
            </Section>
          </TabsContent>

        </Tabs>

        <div className="pt-3 mt-2 border-t border-border space-y-2">
          <ResetConfirmDialog
            onConfirm={onReset}
            trigger={
              <Button variant="outline" size="sm" className="w-full">
                <RotateCcw className="h-3.5 w-3.5 mr-2" />
                Reset to PA Defaults
              </Button>
            }
          />
          <p className="text-[0.5625rem] text-muted-foreground text-center">
            Restores Speech mode defaults for corporate/conference PA
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" className="flex-1" onClick={handleSaveAsDefaults}>
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Save as Default
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="flex-1"
              onClick={handleLoadDefaults}
              disabled={!hasSavedDefaults}
              title={hasSavedDefaults ? 'Load your saved defaults' : 'No saved defaults yet'}
            >
              <FileJson className="h-3.5 w-3.5 mr-1.5" />
              Load Saved
            </Button>
          </div>
          <p className="text-[0.5625rem] text-muted-foreground text-center">
            {hasSavedDefaults ? 'Saved defaults available' : 'Save current settings to reuse later'}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
})
