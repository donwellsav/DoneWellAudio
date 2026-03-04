'use client'

import { useState, useEffect, useMemo } from 'react'
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { ResetConfirmDialog } from './ResetConfirmDialog'
import { Settings, RotateCcw, HelpCircle, BarChart3, Monitor, Download, FileJson, FileText, Sheet, Trash2, Ruler, ChevronDown, Cpu } from 'lucide-react'
import { getEventLogger, type LogEntry } from '@/lib/logging/eventLogger'
import { getRoomParametersFromDimensions, feetToMeters } from '@/lib/dsp/acousticUtils'
import type { DetectorSettings, AlgorithmMode, OperationMode, ThresholdMode } from '@/types/advisory'

interface SettingsPanelProps {
  settings: DetectorSettings
  onSettingsChange: (settings: Partial<DetectorSettings>) => void
  onReset: () => void
}

// ── Collapsible Section ────────────────────────────────────────────────────────

function CollapsibleSection({ title, tooltip, showTooltip = true, defaultOpen = false, children }: {
  title: string
  tooltip?: string
  showTooltip?: boolean
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <TooltipProvider delayDuration={300}>
      <div className="border border-border/50 rounded-md overflow-hidden">
        <button
          onClick={() => setOpen(!open)}
          className="w-full flex items-center justify-between px-3 py-2 bg-muted/30 hover:bg-muted/50 transition-colors"
        >
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
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {open && (
          <div className="px-3 py-3 space-y-4">
            {children}
          </div>
        )}
      </div>
    </TooltipProvider>
  )
}

// ── Section (flat, non-collapsible) ────────────────────────────────────────────

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
      <p className="text-[9px] text-muted-foreground">
        Enter valid room dimensions to calculate modes.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-[9px] text-muted-foreground">
        Found {formatted.all.length} room modes below 300Hz:
      </p>
      {formatted.axial.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-destructive" />
            <span className="text-[9px] font-medium text-foreground">Axial (strongest)</span>
          </div>
          <div className="flex flex-wrap gap-1 pl-3.5">
            {formatted.axial.slice(0, 8).map((mode, i) => (
              <span key={i} className="px-1.5 py-0.5 text-[9px] font-mono bg-destructive/10 text-destructive rounded" title={`Mode ${mode.label}`}>
                {mode.hz}Hz
              </span>
            ))}
            {formatted.axial.length > 8 && <span className="text-[9px] text-muted-foreground">+{formatted.axial.length - 8} more</span>}
          </div>
        </div>
      )}
      {formatted.tangential.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-yellow-500" />
            <span className="text-[9px] font-medium text-foreground">Tangential (medium)</span>
          </div>
          <div className="flex flex-wrap gap-1 pl-3.5">
            {formatted.tangential.slice(0, 6).map((mode, i) => (
              <span key={i} className="px-1.5 py-0.5 text-[9px] font-mono bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 rounded" title={`Mode ${mode.label}`}>
                {mode.hz}Hz
              </span>
            ))}
            {formatted.tangential.length > 6 && <span className="text-[9px] text-muted-foreground">+{formatted.tangential.length - 6} more</span>}
          </div>
        </div>
      )}
      {formatted.oblique.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-muted-foreground/50" />
            <span className="text-[9px] font-medium text-foreground">Oblique (weakest)</span>
          </div>
          <div className="flex flex-wrap gap-1 pl-3.5">
            {formatted.oblique.slice(0, 4).map((mode, i) => (
              <span key={i} className="px-1.5 py-0.5 text-[9px] font-mono bg-muted/50 text-muted-foreground rounded" title={`Mode ${mode.label}`}>
                {mode.hz}Hz
              </span>
            ))}
            {formatted.oblique.length > 4 && <span className="text-[9px] text-muted-foreground">+{formatted.oblique.length - 4} more</span>}
          </div>
        </div>
      )}
      <p className="text-[8px] text-muted-foreground/70 pt-1">
        Tip: If detected feedback matches a room mode, it may be a resonance rather than feedback.
      </p>
    </div>
  )
}

// ── Main Settings Panel ────────────────────────────────────────────────────────

export function SettingsPanel({
  settings,
  onSettingsChange,
  onReset,
}: SettingsPanelProps) {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [hasSavedDefaults, setHasSavedDefaults] = useState(false)
  const logger = getEventLogger()

  useEffect(() => {
    const saved = localStorage.getItem('ktr-custom-defaults')
    setHasSavedDefaults(!!saved)
  }, [])

  // Room dimension inputs
  const [roomDimensions, setRoomDimensions] = useState({
    lengthFt: 30,
    widthFt: 25,
    heightFt: 12,
    absorptionType: 'typical' as 'untreated' | 'typical' | 'treated' | 'studio',
    useMetric: false,
  })

  const calculateFromDimensions = () => {
    const lengthM = roomDimensions.useMetric ? roomDimensions.lengthFt : feetToMeters(roomDimensions.lengthFt)
    const widthM = roomDimensions.useMetric ? roomDimensions.widthFt : feetToMeters(roomDimensions.widthFt)
    const heightM = roomDimensions.useMetric ? roomDimensions.heightFt : feetToMeters(roomDimensions.heightFt)
    const params = getRoomParametersFromDimensions(lengthM, widthM, heightM, roomDimensions.absorptionType)
    onSettingsChange({
      roomRT60: Math.round(params.rt60 * 10) / 10,
      roomVolume: Math.round(params.volume),
      roomPreset: 'custom',
    })
  }

  useEffect(() => {
    setLogs(logger.getLogs())
    const unsubscribe = logger.subscribe((updated) => setLogs(updated))
    return unsubscribe
  }, [logger])

  const handleExport = (format: 'csv' | 'json' | 'text') => {
    let content = ''
    let filename = `kill-the-ring-logs_${new Date().toISOString().split('T')[0]}`
    let mimeType = 'text/plain'
    switch (format) {
      case 'csv':  content = logger.exportAsCSV();  filename += '.csv';  mimeType = 'text/csv'; break
      case 'json': content = logger.exportAsJSON(); filename += '.json'; mimeType = 'application/json'; break
      case 'text': content = logger.exportAsText(); filename += '.txt';  mimeType = 'text/plain'; break
    }
    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = filename
    document.body.appendChild(a); a.click()
    document.body.removeChild(a); URL.revokeObjectURL(url)
    logger.logExport(format, logs.length)
  }

  const handleClearLogs = () => {
    if (confirm('Clear all logs? This cannot be undone.')) logger.clearLogs()
  }

  const handleSaveAsDefaults = () => {
    localStorage.setItem('ktr-custom-defaults', JSON.stringify(settings))
    setHasSavedDefaults(true)
    logger.logSettingsChanged({ action: 'save_as_defaults' })
  }

  const handleLoadDefaults = () => {
    const saved = localStorage.getItem('ktr-custom-defaults')
    if (saved) {
      try {
        const defaults = JSON.parse(saved)
        onSettingsChange(defaults)
        logger.logSettingsChanged({ action: 'load_saved_defaults' })
      } catch {
        alert('Failed to load saved defaults')
      }
    }
  }

  const issueLogs = logs.filter(l => l.type === 'issue_detected')

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground" aria-label="Settings">
          <Settings className="w-4 h-4" />
          <span className="hidden sm:inline text-xs">Settings</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Settings
          </DialogTitle>
          <DialogDescription className="text-xs">
            Detection engine, algorithms, display, and export.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="detection" className="mt-4">
          <TabsList className="grid w-full grid-cols-4">
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
            <TabsTrigger value="export" className="gap-1 text-xs">
              <Download className="w-3.5 h-3.5" />
              Export
              {issueLogs.length > 0 && (
                <span className="ml-1 px-1 py-px bg-primary/20 text-primary text-[9px] rounded-full font-medium leading-none">
                  {issueLogs.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ═══════════════════════════════════════════════════════════════════
              TAB 1: DETECTION
              ═══════════════════════════════════════════════════════════════════ */}
          <TabsContent value="detection" className="mt-4 space-y-4">

            <Section
              title="Operation Mode"
              showTooltip={settings.showTooltips}
              tooltip="Presets that adjust thresholds for different scenarios. Feedback Hunt: balanced PA. Vocal Ring: speech optimized. Music Aware: live performance. Aggressive: max sensitivity. Calibration: system ring-out."
            >
              <Select
                value={settings.mode}
                onValueChange={(v) => onSettingsChange({ mode: v as OperationMode })}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="feedbackHunt">Feedback Hunt - Balanced PA</SelectItem>
                  <SelectItem value="vocalRing">Vocal Ring - Speech Optimized</SelectItem>
                  <SelectItem value="musicAware">Music Aware - Live Performance</SelectItem>
                  <SelectItem value="aggressive">Aggressive - Max Sensitivity</SelectItem>
                  <SelectItem value="calibration">Calibration - System Ring-Out</SelectItem>
                </SelectContent>
              </Select>
            </Section>

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
                <div className="flex justify-between text-[9px] text-muted-foreground">
                  <span>Raw</span><span>Smooth</span>
                </div>
              </div>
            </Section>

            <Section
              title="Feedback Threshold"
              showTooltip={settings.showTooltips}
              tooltip="Primary sensitivity. 4-8dB aggressive, 10-14dB balanced, 16+dB conservative."
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
              </div>
            </Section>

            <Section
              title="Ring Threshold"
              showTooltip={settings.showTooltips}
              tooltip="Resonance detection. 2-4dB calibration, 5-7dB normal, 8+dB for shows."
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
                <div className="flex justify-between text-[9px] text-muted-foreground">
                  <span>Catch everything</span><span>High confidence only</span>
                </div>
              </div>
            </Section>

            <div className="flex items-center justify-between">
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
            </div>

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
              tooltip="Cents window for harmonic/sub-harmonic matching. 25-35 cents for calibration, 65-100 cents for live with reverb."
            >
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Window</span>
                  <span className="text-xs font-mono">{settings.harmonicToleranceCents}¢</span>
                </div>
                <Slider
                  value={[settings.harmonicToleranceCents]}
                  onValueChange={([v]) => onSettingsChange({ harmonicToleranceCents: v })}
                  min={25} max={100} step={5}
                />
                <div className="flex justify-between text-[9px] text-muted-foreground">
                  <span>Tight (calibration)</span><span>Wide (live)</span>
                </div>
              </div>
            </Section>

            {/* ── Noise Floor (collapsible) ── */}
            <CollapsibleSection
              title="Noise Floor"
              showTooltip={settings.showTooltips}
              tooltip="Controls how the adaptive noise floor estimates and tracks ambient noise levels."
            >
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
                <div className="flex justify-between text-[9px] text-muted-foreground">
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
            </CollapsibleSection>

            {/* ── Peak Detection (collapsible) ── */}
            <CollapsibleSection
              title="Peak Detection"
              showTooltip={settings.showTooltips}
              tooltip="Fine-tune how peaks are detected, confirmed, and cleared. Controls sustain timing, threshold modes, and peak merging."
            >
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
                <div className="flex justify-between text-[9px] text-muted-foreground">
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
                <div className="flex justify-between text-[9px] text-muted-foreground">
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
                <div className="flex justify-between text-[9px] text-muted-foreground">
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
                <div className="flex justify-between text-[9px] text-muted-foreground">
                  <span>Sensitive</span><span>Only strong peaks</span>
                </div>
              </div>
            </CollapsibleSection>

            {/* ── Room Acoustics (collapsible, merged) ── */}
            <CollapsibleSection
              title="Room Acoustics"
              showTooltip={settings.showTooltips}
              tooltip="Room parameters for frequency-dependent thresholds and room mode identification. The Schroeder frequency determines where room modes dominate."
            >
              {/* Room Preset Selector */}
              <div className="space-y-2">
                <span className="text-xs text-muted-foreground">Room Size Preset</span>
                <div className="grid grid-cols-2 gap-1.5">
                  {(['small', 'medium', 'large', 'custom'] as const).map((preset) => {
                    const labels = { small: 'Small', medium: 'Medium', large: 'Large', custom: 'Custom' }
                    const descs = { small: '10-20 people', medium: '20-50 people', large: '50-200 people', custom: 'Manual' }
                    const isSelected = settings.roomPreset === preset
                    return (
                      <button
                        key={preset}
                        onClick={() => {
                          if (preset === 'custom') {
                            onSettingsChange({ roomPreset: 'custom' })
                          } else {
                            const presetValues = {
                              small: { roomRT60: 0.5, roomVolume: 80, feedbackThresholdDb: 5, ringThresholdDb: 3 },
                              medium: { roomRT60: 0.7, roomVolume: 250, feedbackThresholdDb: 6, ringThresholdDb: 4 },
                              large: { roomRT60: 1.0, roomVolume: 1000, feedbackThresholdDb: 7, ringThresholdDb: 5 },
                            }[preset]
                            onSettingsChange({ roomPreset: preset, ...presetValues })
                          }
                        }}
                        className={`flex flex-col items-start px-2 py-1.5 rounded-md text-left transition-colors ${
                          isSelected
                            ? 'bg-primary/20 border border-primary/50 text-primary'
                            : 'bg-muted/50 border border-transparent hover:bg-muted'
                        }`}
                      >
                        <span className="text-xs font-medium">{labels[preset]}</span>
                        <span className="text-[9px] text-muted-foreground">{descs[preset]}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Custom room controls */}
              {settings.roomPreset === 'custom' && (
                <>
                  <div className="space-y-3 p-2 bg-muted/30 rounded-md border border-muted">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium flex items-center gap-1.5">
                        <Ruler className="w-3 h-3" />
                        Room Dimensions
                      </span>
                      <button
                        onClick={() => setRoomDimensions(d => ({ ...d, useMetric: !d.useMetric }))}
                        className="text-[9px] px-1.5 py-0.5 rounded bg-muted hover:bg-muted/80"
                      >
                        {roomDimensions.useMetric ? 'Meters' : 'Feet'}
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <label className="text-[9px] text-muted-foreground">Length</label>
                        <input
                          type="number"
                          value={roomDimensions.lengthFt}
                          onChange={(e) => setRoomDimensions(d => ({ ...d, lengthFt: parseFloat(e.target.value) || 0 }))}
                          className="w-full h-7 px-2 text-xs rounded border bg-background"
                          min={1} max={500}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] text-muted-foreground">Width</label>
                        <input
                          type="number"
                          value={roomDimensions.widthFt}
                          onChange={(e) => setRoomDimensions(d => ({ ...d, widthFt: parseFloat(e.target.value) || 0 }))}
                          className="w-full h-7 px-2 text-xs rounded border bg-background"
                          min={1} max={500}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] text-muted-foreground">Height</label>
                        <input
                          type="number"
                          value={roomDimensions.heightFt}
                          onChange={(e) => setRoomDimensions(d => ({ ...d, heightFt: parseFloat(e.target.value) || 0 }))}
                          className="w-full h-7 px-2 text-xs rounded border bg-background"
                          min={1} max={100}
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] text-muted-foreground">Room Treatment</label>
                      <Select
                        value={roomDimensions.absorptionType}
                        onValueChange={(v) => setRoomDimensions(d => ({
                          ...d,
                          absorptionType: v as 'untreated' | 'typical' | 'treated' | 'studio'
                        }))}
                      >
                        <SelectTrigger className="h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="untreated">Untreated (hard surfaces)</SelectItem>
                          <SelectItem value="typical">Typical (some carpet/curtains)</SelectItem>
                          <SelectItem value="treated">Treated (acoustic panels)</SelectItem>
                          <SelectItem value="studio">Studio (heavy treatment)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button size="sm" variant="secondary" onClick={calculateFromDimensions} className="w-full h-7 text-xs">
                      Calculate RT60 & Volume
                    </Button>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-muted-foreground">RT60 (reverb time)</span>
                      <span className="text-xs font-mono">{settings.roomRT60.toFixed(1)}s</span>
                    </div>
                    <Slider
                      value={[settings.roomRT60 * 10]}
                      onValueChange={([v]) => onSettingsChange({ roomRT60: v / 10 })}
                      min={3} max={30} step={1}
                    />
                    <div className="flex justify-between text-[9px] text-muted-foreground">
                      <span>Dead (studio)</span><span>Live (cathedral)</span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-muted-foreground">Room Volume</span>
                      <span className="text-xs font-mono">{settings.roomVolume}m³</span>
                    </div>
                    <Slider
                      value={[settings.roomVolume]}
                      onValueChange={([v]) => onSettingsChange({ roomVolume: v })}
                      min={50} max={5000} step={50}
                    />
                    <div className="flex justify-between text-[9px] text-muted-foreground">
                      <span>Small room</span><span>Large venue</span>
                    </div>
                  </div>
                </>
              )}

              {/* Schroeder frequency */}
              <div className="text-[9px] text-muted-foreground bg-muted/50 rounded px-2 py-1 flex justify-between">
                <span>Schroeder freq:</span>
                <span className="font-mono">{Math.round(2000 * Math.sqrt(settings.roomRT60 / settings.roomVolume))}Hz</span>
              </div>

              {/* Room Modes */}
              <div className="pt-2 border-t border-border/50 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="text-xs font-medium">Room Mode Calculator</span>
                    <p className="text-[9px] text-muted-foreground">Show room resonance frequencies</p>
                  </div>
                  <Switch
                    checked={settings.roomModesEnabled}
                    onCheckedChange={(checked) => onSettingsChange({ roomModesEnabled: checked })}
                  />
                </div>

                {settings.roomModesEnabled && (
                  <div className="space-y-3">
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

                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <label className="text-[9px] text-muted-foreground">Length</label>
                        <input
                          type="number"
                          value={settings.roomLengthM}
                          onChange={(e) => onSettingsChange({ roomLengthM: parseFloat(e.target.value) || 10 })}
                          className="w-full px-2 py-1 text-xs bg-muted/50 border border-border rounded focus:outline-none focus:border-primary"
                          min={1} max={100} step={0.5}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] text-muted-foreground">Width</label>
                        <input
                          type="number"
                          value={settings.roomWidthM}
                          onChange={(e) => onSettingsChange({ roomWidthM: parseFloat(e.target.value) || 8 })}
                          className="w-full px-2 py-1 text-xs bg-muted/50 border border-border rounded focus:outline-none focus:border-primary"
                          min={1} max={100} step={0.5}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] text-muted-foreground">Height</label>
                        <input
                          type="number"
                          value={settings.roomHeightM}
                          onChange={(e) => onSettingsChange({ roomHeightM: parseFloat(e.target.value) || 3 })}
                          className="w-full px-2 py-1 text-xs bg-muted/50 border border-border rounded focus:outline-none focus:border-primary"
                          min={1} max={30} step={0.1}
                        />
                      </div>
                    </div>

                    <RoomModesDisplay
                      lengthM={settings.roomDimensionsUnit === 'feet' ? settings.roomLengthM * 0.3048 : settings.roomLengthM}
                      widthM={settings.roomDimensionsUnit === 'feet' ? settings.roomWidthM * 0.3048 : settings.roomWidthM}
                      heightM={settings.roomDimensionsUnit === 'feet' ? settings.roomHeightM * 0.3048 : settings.roomHeightM}
                    />
                  </div>
                )}
              </div>
            </CollapsibleSection>
          </TabsContent>

          {/* ═══════════════════════════════════════════════════════════════════
              TAB 2: ALGORITHMS
              ═══════════════════════════════════════════════════════════════════ */}
          <TabsContent value="algorithms" className="mt-4 space-y-4">

            <Section
              title="Algorithm Mode"
              showTooltip={settings.showTooltips}
              tooltip="Auto: selects best combo based on content. MSD: Magnitude Slope Deviation (DAFx-16). Phase: Phase Coherence (KU Leuven). Combined: MSD + Phase. All: every algorithm including IHR, PTMR, Comb, Spectral."
            >
              <Select
                value={settings.algorithmMode}
                onValueChange={(v) => onSettingsChange({ algorithmMode: v as AlgorithmMode })}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto - Content Adaptive</SelectItem>
                  <SelectItem value="msd">MSD Only - Magnitude Slope</SelectItem>
                  <SelectItem value="phase">Phase Only - Coherence</SelectItem>
                  <SelectItem value="combined">Combined - MSD + Phase</SelectItem>
                  <SelectItem value="all">All Algorithms</SelectItem>
                </SelectContent>
              </Select>
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
                    <div className="flex justify-between text-[9px] text-muted-foreground">
                      <span>Sensitive (5dB)</span><span>Loud only (30dB)</span>
                    </div>
                  </div>
                )}
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
          </TabsContent>

          {/* ═══════════════════════════════════════════════════════════════════
              TAB 3: DISPLAY
              ═══════════════════════════════════════════════════════════════════ */}
          <TabsContent value="display" className="mt-4 space-y-4">

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
                <div className="flex justify-between text-[9px] text-muted-foreground">
                  <span>Small</span><span>Large</span>
                </div>
              </div>
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
                <div className="flex justify-between text-[9px] text-muted-foreground">
                  <span>Focused</span><span>All Issues</span>
                </div>
              </div>
            </Section>

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
                <div className="flex justify-between text-[9px] text-muted-foreground">
                  <span>Thin</span><span>Thick</span>
                </div>
              </div>
            </Section>

            <Section
              title="Input Gain"
              showTooltip={settings.showTooltips}
              tooltip="Current software gain applied to analysis. Adjustable from the main controls."
            >
              <div className="text-[9px] text-muted-foreground bg-muted/50 rounded px-2 py-1 flex justify-between">
                <span>Current gain:</span>
                <span className="font-mono">{settings.inputGainDb > 0 ? '+' : ''}{settings.inputGainDb}dB</span>
              </div>
            </Section>

            <div className="pt-3 border-t border-border space-y-2">
              <ResetConfirmDialog
                onConfirm={onReset}
                trigger={
                  <Button variant="outline" size="sm" className="w-full">
                    <RotateCcw className="h-3.5 w-3.5 mr-2" />
                    Reset to PA Defaults
                  </Button>
                }
              />
              <p className="text-[9px] text-muted-foreground text-center">
                Restores aggressive detection for corporate/conference PA
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
              <p className="text-[9px] text-muted-foreground text-center">
                {hasSavedDefaults ? 'Saved defaults available' : 'Save current settings to reuse later'}
              </p>
            </div>
          </TabsContent>

          {/* ═══════════════════════════════════════════════════════════════════
              TAB 4: EXPORT
              ═══════════════════════════════════════════════════════════════════ */}
          <TabsContent value="export" className="mt-4 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {logs.length} event{logs.length !== 1 ? 's' : ''} &bull; {issueLogs.length} issue{issueLogs.length !== 1 ? 's' : ''} detected
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearLogs}
                className="text-destructive hover:text-destructive h-7 text-xs gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear
              </Button>
            </div>

            <div className="space-y-2">
              {([
                { format: 'csv'  as const, label: 'CSV',        desc: 'Open in Excel or Sheets for analysis',           icon: <Sheet    className="w-4 h-4" /> },
                { format: 'json' as const, label: 'JSON',       desc: 'Complete data structure for programmatic use',   icon: <FileJson className="w-4 h-4" /> },
                { format: 'text' as const, label: 'Plain Text', desc: 'Human-readable formatted report',                icon: <FileText className="w-4 h-4" /> },
              ]).map(({ format, label, desc, icon }) => (
                <button
                  key={format}
                  onClick={() => handleExport(format)}
                  disabled={logs.length === 0}
                  className="w-full flex items-start gap-3 p-3 border border-border rounded-md hover:bg-muted/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-left"
                >
                  <div className="mt-0.5 text-muted-foreground">{icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground">{label}</div>
                    <div className="text-xs text-muted-foreground">{desc}</div>
                  </div>
                  <Download className="w-3.5 h-3.5 text-muted-foreground mt-1 flex-shrink-0" />
                </button>
              ))}
            </div>

            <p className="text-[10px] text-muted-foreground border-t border-border pt-3">
              Logs are stored in memory for this session. Export before closing the tab.
            </p>
          </TabsContent>

        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
