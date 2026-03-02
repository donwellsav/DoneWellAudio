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
import { ScrollArea } from '@/components/ui/scroll-area'
import { ResetConfirmDialog } from './ResetConfirmDialog'
import { Settings, RotateCcw, HelpCircle, BarChart3, Monitor, Download, FileJson, FileText, Sheet, Trash2, Ruler, X } from 'lucide-react'
import { getEventLogger, type LogEntry, type FeedbackIssueLog } from '@/lib/logging/eventLogger'
import { getRoomParametersFromDimensions, feetToMeters } from '@/lib/dsp/acousticUtils'
import type { DetectorSettings } from '@/types/advisory'

interface SettingsPanelProps {
  settings: DetectorSettings
  onSettingsChange: (settings: Partial<DetectorSettings>) => void
  onReset: () => void
}

// Room Modes Display Component
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
      
      {/* Axial Modes - Strongest */}
      {formatted.axial.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-destructive" />
            <span className="text-[9px] font-medium text-foreground">Axial (strongest)</span>
          </div>
          <div className="flex flex-wrap gap-1 pl-3.5">
            {formatted.axial.slice(0, 8).map((mode, i) => (
              <span
                key={i}
                className="px-1.5 py-0.5 text-[9px] font-mono bg-destructive/10 text-destructive rounded"
                title={`Mode ${mode.label}`}
              >
                {mode.hz}Hz
              </span>
            ))}
            {formatted.axial.length > 8 && (
              <span className="text-[9px] text-muted-foreground">+{formatted.axial.length - 8} more</span>
            )}
          </div>
        </div>
      )}

      {/* Tangential Modes - Medium */}
      {formatted.tangential.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-yellow-500" />
            <span className="text-[9px] font-medium text-foreground">Tangential (medium)</span>
          </div>
          <div className="flex flex-wrap gap-1 pl-3.5">
            {formatted.tangential.slice(0, 6).map((mode, i) => (
              <span
                key={i}
                className="px-1.5 py-0.5 text-[9px] font-mono bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 rounded"
                title={`Mode ${mode.label}`}
              >
                {mode.hz}Hz
              </span>
            ))}
            {formatted.tangential.length > 6 && (
              <span className="text-[9px] text-muted-foreground">+{formatted.tangential.length - 6} more</span>
            )}
          </div>
        </div>
      )}

      {/* Oblique Modes - Weakest */}
      {formatted.oblique.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-muted-foreground/50" />
            <span className="text-[9px] font-medium text-foreground">Oblique (weakest)</span>
          </div>
          <div className="flex flex-wrap gap-1 pl-3.5">
            {formatted.oblique.slice(0, 4).map((mode, i) => (
              <span
                key={i}
                className="px-1.5 py-0.5 text-[9px] font-mono bg-muted/50 text-muted-foreground rounded"
                title={`Mode ${mode.label}`}
              >
                {mode.hz}Hz
              </span>
            ))}
            {formatted.oblique.length > 4 && (
              <span className="text-[9px] text-muted-foreground">+{formatted.oblique.length - 4} more</span>
            )}
          </div>
        </div>
      )}

      <p className="text-[8px] text-muted-foreground/70 pt-1">
        Tip: If detected feedback matches a room mode, it may be a resonance rather than feedback.
      </p>
    </div>
  )
}

export function SettingsPanel({
  settings,
  onSettingsChange,
  onReset,
}: SettingsPanelProps) {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [hasSavedDefaults, setHasSavedDefaults] = useState(false)
  const [savedIndividualKeys, setSavedIndividualKeys] = useState<Set<string>>(new Set())
  const logger = getEventLogger()
  
  // Check if custom defaults exist on mount, and load individual saved settings
  useEffect(() => {
    const saved = localStorage.getItem('ktr-custom-defaults')
    setHasSavedDefaults(!!saved)
    
    // Load all individual saved settings keys
    const keys = new Set<string>()
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith('ktr-setting-')) {
        keys.add(key.replace('ktr-setting-', ''))
      }
    })
    setSavedIndividualKeys(keys)
  }, [])
  
  // Room dimension inputs (in feet for user convenience)
  const [roomDimensions, setRoomDimensions] = useState({
    lengthFt: 30,
    widthFt: 25,
    heightFt: 12,
    absorptionType: 'typical' as 'untreated' | 'typical' | 'treated' | 'studio',
    useMetric: false,
  })
  
  // Calculate room parameters from dimensions
  const calculateFromDimensions = () => {
    const lengthM = roomDimensions.useMetric ? roomDimensions.lengthFt : feetToMeters(roomDimensions.lengthFt)
    const widthM = roomDimensions.useMetric ? roomDimensions.widthFt : feetToMeters(roomDimensions.widthFt)
    const heightM = roomDimensions.useMetric ? roomDimensions.heightFt : feetToMeters(roomDimensions.heightFt)
    
    const params = getRoomParametersFromDimensions(lengthM, widthM, heightM, roomDimensions.absorptionType)
    
    // Apply calculated values
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

  const handleSaveSettingAsDefault = (key: string, value: any) => {
    localStorage.setItem(`ktr-setting-${key}`, JSON.stringify(value))
    setSavedIndividualKeys((prev) => new Set(prev).add(key))
    logger.logSettingsChanged({ action: `save_setting_${key}` })
  }

  const handleLoadSettingDefault = (key: string) => {
    const saved = localStorage.getItem(`ktr-setting-${key}`)
    if (saved) {
      try {
        const value = JSON.parse(saved)
        onSettingsChange({ [key]: value })
        logger.logSettingsChanged({ action: `load_setting_${key}` })
      } catch {
        alert(`Failed to load saved ${key}`)
      }
    }
  }

  const handleClearSettingDefault = (key: string) => {
    localStorage.removeItem(`ktr-setting-${key}`)
    setSavedIndividualKeys((prev) => { const n = new Set(prev); n.delete(key); return n })
    logger.logSettingsChanged({ action: `clear_setting_${key}` })
  }

  // Helper to render setting-specific save button
  const renderSettingDefaultButton = (settingKey: string, settingValue: any) => {
    const isSaved = savedIndividualKeys.has(settingKey)
    return (
      <div className="flex gap-1">
        <button
          onClick={() => handleSaveSettingAsDefault(settingKey, settingValue)}
          className="p-1 rounded hover:bg-muted/50 transition-colors"
          title={isSaved ? 'Update saved default' : 'Save this setting as default'}
        >
          <Download className={`w-3.5 h-3.5 ${isSaved ? 'text-primary' : 'text-muted-foreground'}`} />
        </button>
        {isSaved && (
          <button
            onClick={() => handleClearSettingDefault(settingKey)}
            className="p-1 rounded hover:bg-muted/50 transition-colors"
            title="Clear saved default for this setting"
          >
            <X className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
          </button>
        )}
      </div>
    )
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
            Advanced Settings
          </DialogTitle>
          <DialogDescription className="text-xs">
            Analysis engine, display preferences, and log export.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="analysis" className="mt-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="analysis" className="gap-1.5 text-xs">
              <BarChart3 className="w-3.5 h-3.5" />
              Analysis
            </TabsTrigger>
            <TabsTrigger value="display" className="gap-1.5 text-xs">
              <Monitor className="w-3.5 h-3.5" />
              Display
            </TabsTrigger>
            <TabsTrigger value="export" className="gap-1.5 text-xs">
              <Download className="w-3.5 h-3.5" />
              Export
              {issueLogs.length > 0 && (
                <span className="ml-1 px-1 py-px bg-primary/20 text-primary text-[9px] rounded-full font-medium leading-none">
                  {issueLogs.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="analysis" className="mt-4 space-y-5">
            <Section 
              title="FFT Size" 
              showTooltip={settings.showTooltips}
              tooltip="Controls frequency resolution vs response time. Higher FFT = better precision for low frequencies but slower updates. 4096 for fast response, 8192 for balanced PA use, 16384 for precise low-end analysis."
            >
              <Select
                value={settings.fftSize.toString()}
                onValueChange={(v) =>
                  onSettingsChange({ fftSize: parseInt(v) as 4096 | 8192 | 16384 })
                }
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
              tooltip="Averages spectral frames to reduce visual noise. 0-30% for detailed analysis, 50-70% for general use, 80%+ for presentation. Lower values show faster transients but more jitter."
            >
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Amount</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono">{(settings.smoothingTimeConstant * 100).toFixed(0)}%</span>
                    {renderSettingDefaultButton('smoothingTimeConstant', settings.smoothingTimeConstant)}
                  </div>
                </div>
                <Slider
                  value={[settings.smoothingTimeConstant]}
                  onValueChange={([v]) => onSettingsChange({ smoothingTimeConstant: v })}
                  min={0}
                  max={0.95}
                  step={0.05}
                />
                <div className="flex justify-between text-[9px] text-muted-foreground">
                  <span>Raw</span>
                  <span>Smooth</span>
                </div>
              </div>
            </Section>

            <Section 
              title="Hold Time" 
              showTooltip={settings.showTooltips}
              tooltip="How long detected issues stay visible after disappearing from spectrum. Longer times help reference issues while making EQ cuts. 1-2s for fast workflow, 3-4s for careful tuning."
            >
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Duration</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono">{(settings.holdTimeMs / 1000).toFixed(1)}s</span>
                    {renderSettingDefaultButton('holdTimeMs', settings.holdTimeMs)}
                  </div>
                </div>
                <Slider
                  value={[settings.holdTimeMs]}
                  onValueChange={([v]) => onSettingsChange({ holdTimeMs: v })}
                  min={500}
                  max={5000}
                  step={250}
                />
                <div className="flex justify-between text-[9px] text-muted-foreground">
                  <span>Quick</span>
                  <span>Long Hold</span>
                </div>
              </div>
            </Section>

            <Section
              title="A-Weighting"
              showTooltip={settings.showTooltips}
              tooltip="Applies IEC 61672-1 A-weighting curve to match human hearing sensitivity. Reduces low-frequency emphasis (below ~500Hz is attenuated). Enable for perceived-loudness analysis; disable for flat-response detection of all feedback regardless of audibility."
            >
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Apply A-weighting curve</span>
                <button
                  role="switch"
                  aria-checked={settings.aWeightingEnabled}
                  onClick={() => onSettingsChange({ aWeightingEnabled: !settings.aWeightingEnabled })}
                  className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                    settings.aWeightingEnabled ? 'bg-primary' : 'bg-muted'
                  }`}
                >
                  <span className={`inline-block h-3 w-3 transform rounded-full bg-background shadow transition-transform ${
                    settings.aWeightingEnabled ? 'translate-x-3.5' : 'translate-x-0.5'
                  }`} />
                </button>
              </div>
            </Section>

            <Section
              title="Harmonic Tolerance"
              showTooltip={settings.showTooltips}
              tooltip="Cents window used when matching overtones and sub-harmonics. Tighten for calibration in controlled rooms (25–35¢). Widen for live performance with reverb or temperature drift (65–100¢). Default 50¢ = half a semitone."
            >
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Window</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono">{settings.harmonicToleranceCents}¢</span>
                    {renderSettingDefaultButton('harmonicToleranceCents', settings.harmonicToleranceCents)}
                  </div>
                </div>
                <Slider
                  value={[settings.harmonicToleranceCents]}
                  onValueChange={([v]) => onSettingsChange({ harmonicToleranceCents: v })}
                  min={25}
                  max={100}
                  step={5}
                />
                <div className="flex justify-between text-[9px] text-muted-foreground">
                  <span>Tight (calibration)</span>
                  <span>Wide (live)</span>
                </div>
              </div>
            </Section>

            {/* Phase 1: Harmonic Series Filter Toggle */}
            <Section
              title="Harmonic Filter"
              showTooltip={settings.showTooltips}
              tooltip="When enabled, reduces false positives for instruments like bass guitar by detecting harmonic overtones. Feedback is typically a pure tone (no harmonics), while instruments have rich harmonic content."
            >
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <span className="text-xs font-medium">Filter Instruments</span>
                  <p className="text-[9px] text-muted-foreground">
                    Reduce bass/guitar false positives
                  </p>
                </div>
                <Switch
                  checked={settings.harmonicFilterEnabled ?? true}
                  onCheckedChange={(checked) => onSettingsChange({ harmonicFilterEnabled: checked })}
                />
              </div>
            </Section>

            <Section
              title="Confidence Threshold"
              showTooltip={settings.showTooltips}
              tooltip="Minimum confidence to display. LOWER = more alerts (better to catch everything). HIGHER = fewer alerts (may miss real feedback). 45% is aggressive - better safe than sorry!"
            >
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Min. Confidence</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono">{Math.round((settings.confidenceThreshold ?? 0.40) * 100)}%</span>
                    {renderSettingDefaultButton('confidenceThreshold', settings.confidenceThreshold ?? 0.40)}
                  </div>
                </div>
                <Slider
                  value={[(settings.confidenceThreshold ?? 0.40) * 100]}
                  onValueChange={([v]) => onSettingsChange({ confidenceThreshold: v / 100 })}
                  min={0}
                  max={100}
                  step={1}
                />
                <div className="flex justify-between text-[9px] text-muted-foreground">
                  <span>Catch everything</span>
                  <span>High confidence only</span>
                </div>
              </div>
            </Section>

            <Section
              title="Room Acoustics"
              showTooltip={settings.showTooltips}
              tooltip="Room parameters for automatic frequency-dependent thresholds. The Schroeder frequency (f_S = 2000√(T/V)) determines where room modes dominate. Select a preset or use Custom for manual control."
            >
              <div className="space-y-3">
                {/* Room Preset Selector */}
                <div className="space-y-2">
                  <span className="text-xs text-muted-foreground">Room Size Preset</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(['small', 'medium', 'large', 'custom'] as const).map((preset) => {
                      const presetLabels = {
                        small: 'Small',
                        medium: 'Medium',
                        large: 'Large',
                        custom: 'Custom',
                      }
                      const presetDescriptions = {
                        small: '10-20 people',
                        medium: '20-50 people',
                        large: '50-200 people',
                        custom: 'Manual',
                      }
                      const isSelected = (settings.roomPreset ?? 'medium') === preset
                      return (
                        <button
                          key={preset}
                          onClick={() => {
                            if (preset === 'custom') {
                              onSettingsChange({ roomPreset: 'custom' })
                            } else {
                              // AGGRESSIVE thresholds - better false positives than missing feedback!
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
                          <span className="text-xs font-medium">{presetLabels[preset]}</span>
                          <span className="text-[9px] text-muted-foreground">{presetDescriptions[preset]}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Manual controls - only show for Custom preset */}
                {(settings.roomPreset ?? 'medium') === 'custom' && (
                  <>
                    {/* Room Dimensions Calculator */}
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
                            min={1}
                            max={500}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] text-muted-foreground">Width</label>
                          <input
                            type="number"
                            value={roomDimensions.widthFt}
                            onChange={(e) => setRoomDimensions(d => ({ ...d, widthFt: parseFloat(e.target.value) || 0 }))}
                            className="w-full h-7 px-2 text-xs rounded border bg-background"
                            min={1}
                            max={500}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] text-muted-foreground">Height</label>
                          <input
                            type="number"
                            value={roomDimensions.heightFt}
                            onChange={(e) => setRoomDimensions(d => ({ ...d, heightFt: parseFloat(e.target.value) || 0 }))}
                            className="w-full h-7 px-2 text-xs rounded border bg-background"
                            min={1}
                            max={100}
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
                      
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={calculateFromDimensions}
                        className="w-full h-7 text-xs"
                      >
                        Calculate RT60 & Volume
                      </Button>
                    </div>
                    
                    {/* Manual RT60/Volume sliders */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-muted-foreground">RT60 (reverb time)</span>
                        <span className="text-xs font-mono">{(settings.roomRT60 ?? 0.7).toFixed(1)}s</span>
                      </div>
                      <Slider
                        value={[(settings.roomRT60 ?? 0.7) * 10]}
                        onValueChange={([v]) => onSettingsChange({ roomRT60: v / 10 })}
                        min={3}
                        max={30}
                        step={1}
                      />
                      <div className="flex justify-between text-[9px] text-muted-foreground">
                        <span>Dead (studio)</span>
                        <span>Live (cathedral)</span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-muted-foreground">Room Volume</span>
                        <span className="text-xs font-mono">{settings.roomVolume ?? 250}m³</span>
                      </div>
                      <Slider
                        value={[settings.roomVolume ?? 250]}
                        onValueChange={([v]) => onSettingsChange({ roomVolume: v })}
                        min={50}
                        max={5000}
                        step={50}
                      />
                      <div className="flex justify-between text-[9px] text-muted-foreground">
                        <span>Small room</span>
                        <span>Large venue</span>
                      </div>
                    </div>
                  </>
                )}

                {/* Schroeder frequency display */}
                <div className="text-[9px] text-muted-foreground bg-muted/50 rounded px-2 py-1 flex justify-between">
                  <span>Schroeder freq:</span>
                  <span className="font-mono">{Math.round(2000 * Math.sqrt((settings.roomRT60 ?? 0.7) / (settings.roomVolume ?? 250)))}Hz</span>
                </div>
              </div>
            </Section>

            {/* Phase 4: Room Mode Calculator */}
            <Section
              title="Room Modes"
              showTooltip={settings.showTooltips}
              tooltip="Calculate room mode frequencies from dimensions. Room modes are standing waves that can be confused with feedback. Enable to see which frequencies are room resonances vs potential feedback."
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="text-xs font-medium">Enable Mode Calculator</span>
                    <p className="text-[9px] text-muted-foreground">
                      Show room resonance frequencies
                    </p>
                  </div>
                  <Switch
                    checked={settings.roomModesEnabled ?? false}
                    onCheckedChange={(checked) => onSettingsChange({ roomModesEnabled: checked })}
                  />
                </div>

                {(settings.roomModesEnabled ?? false) && (
                  <div className="space-y-3 pt-2 border-t border-border/50">
                    {/* Unit selector */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Unit:</span>
                      <div className="flex gap-1">
                        {(['meters', 'feet'] as const).map((unit) => (
                          <button
                            key={unit}
                            onClick={() => onSettingsChange({ roomDimensionsUnit: unit })}
                            className={`px-2 py-0.5 text-xs rounded ${
                              (settings.roomDimensionsUnit ?? 'meters') === unit
                                ? 'bg-primary/20 text-primary'
                                : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                            }`}
                          >
                            {unit === 'meters' ? 'm' : 'ft'}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Dimension inputs */}
                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <label className="text-[9px] text-muted-foreground">Length</label>
                        <input
                          type="number"
                          value={settings.roomLengthM ?? 10}
                          onChange={(e) => onSettingsChange({ roomLengthM: parseFloat(e.target.value) || 10 })}
                          className="w-full px-2 py-1 text-xs bg-muted/50 border border-border rounded focus:outline-none focus:border-primary"
                          min={1}
                          max={100}
                          step={0.5}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] text-muted-foreground">Width</label>
                        <input
                          type="number"
                          value={settings.roomWidthM ?? 8}
                          onChange={(e) => onSettingsChange({ roomWidthM: parseFloat(e.target.value) || 8 })}
                          className="w-full px-2 py-1 text-xs bg-muted/50 border border-border rounded focus:outline-none focus:border-primary"
                          min={1}
                          max={100}
                          step={0.5}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] text-muted-foreground">Height</label>
                        <input
                          type="number"
                          value={settings.roomHeightM ?? 3}
                          onChange={(e) => onSettingsChange({ roomHeightM: parseFloat(e.target.value) || 3 })}
                          className="w-full px-2 py-1 text-xs bg-muted/50 border border-border rounded focus:outline-none focus:border-primary"
                          min={1}
                          max={30}
                          step={0.1}
                        />
                      </div>
                    </div>

                    {/* Calculated Room Modes Display */}
                    <RoomModesDisplay
                      lengthM={settings.roomDimensionsUnit === 'feet' 
                        ? (settings.roomLengthM ?? 10) * 0.3048 
                        : (settings.roomLengthM ?? 10)}
                      widthM={settings.roomDimensionsUnit === 'feet' 
                        ? (settings.roomWidthM ?? 8) * 0.3048 
                        : (settings.roomWidthM ?? 8)}
                      heightM={settings.roomDimensionsUnit === 'feet' 
                        ? (settings.roomHeightM ?? 3) * 0.3048 
                        : (settings.roomHeightM ?? 3)}
                    />
                  </div>
                )}
              </div>
            </Section>

          </TabsContent>

          <TabsContent value="display" className="mt-4 space-y-5">
            <Section
              title="Tooltips"
              showTooltip={settings.showTooltips}
              tooltip="Show contextual help on sliders and controls. Disable once you know the system."
            >
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Show help tooltips</span>
                <button
                  role="switch"
                  aria-checked={settings.showTooltips}
                  onClick={() => onSettingsChange({ showTooltips: !settings.showTooltips })}
                  className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                    settings.showTooltips ? 'bg-primary' : 'bg-muted'
                  }`}
                >
                  <span className={`inline-block h-3 w-3 transform rounded-full bg-background shadow transition-transform ${
                    settings.showTooltips ? 'translate-x-3.5' : 'translate-x-0.5'
                  }`} />
                </button>
              </div>
            </Section>
            <Section 
              title="Graph Label Size" 
              showTooltip={settings.showTooltips}
              tooltip="Font size for frequency, dB, and annotation labels inside the RTA, GEQ, and Waterfall graphs. Increase for high-DPI displays or viewing from a distance."
            >
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Size</span>
                  <span className="text-xs font-mono">{settings.graphFontSize}px</span>
                </div>
                <Slider
                  value={[settings.graphFontSize]}
                  onValueChange={([v]) => onSettingsChange({ graphFontSize: v })}
                  min={8}
                  max={26}
                  step={1}
                />
                <div className="flex justify-between text-[9px] text-muted-foreground">
                  <span>Small</span>
                  <span>Large</span>
                </div>
              </div>
            </Section>

            <Section 
              title="Max Issues Shown" 
              showTooltip={settings.showTooltips}
              tooltip="Limits how many feedback issues display at once. Default is 6 for focused work on worst problems; increase up to 12 for full system overview during calibration."
            >
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Limit</span>
                  <span className="text-xs font-mono">{settings.maxDisplayedIssues}</span>
                </div>
                <Slider
                  value={[settings.maxDisplayedIssues]}
                  onValueChange={([v]) => onSettingsChange({ maxDisplayedIssues: v })}
                  min={3}
                  max={12}
                  step={1}
                />
                <div className="flex justify-between text-[9px] text-muted-foreground">
                  <span>Focused</span>
                  <span>All Issues</span>
                </div>
              </div>
            </Section>

            <Section 
              title="EQ Recommendation Style" 
              showTooltip={settings.showTooltips}
              tooltip="Surgical: narrow Q (8-16), deep cuts for precise feedback removal. Heavy: wider Q (2-4), moderate cuts for broader tonal shaping and room mode control."
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
                <Button
                  variant="secondary"
                  size="sm"
                  className="flex-1"
                  onClick={handleSaveAsDefaults}
                >
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
              {(
                [
                  { format: 'csv'  as const, label: 'CSV',        desc: 'Open in Excel or Sheets for analysis',           icon: <Sheet    className="w-4 h-4" /> },
                  { format: 'json' as const, label: 'JSON',       desc: 'Complete data structure for programmatic use',   icon: <FileJson className="w-4 h-4" /> },
                  { format: 'text' as const, label: 'Plain Text', desc: 'Human-readable formatted report',                icon: <FileText className="w-4 h-4" /> },
                ] as const
              ).map(({ format, label, desc, icon }) => (
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

interface SectionProps {
  title: string
  tooltip?: string
  showTooltip?: boolean
  children: React.ReactNode
}

function Section({ title, tooltip, showTooltip = true, children }: SectionProps) {
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

