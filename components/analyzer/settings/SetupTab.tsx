'use client'

import React, { memo, useState, useCallback } from 'react'
import { HelpCircle, Save, Trash2, X, Download, FileText, FileJson, FileSpreadsheet, Loader2, ChevronDown } from 'lucide-react'
import { ConsoleSlider } from '@/components/ui/console-slider'
import { ChannelSection } from '@/components/ui/channel-section'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { RoomTab } from './RoomTab'
import { CalibrationTab } from './CalibrationTab'
import { useSettings } from '@/contexts/SettingsContext'
import { useEngine } from '@/contexts/EngineContext'
import { usePA2 } from '@/contexts/PA2Context'
import { buildCompanionUrl, type PA2AutoSendMode } from '@/types/pa2'
import { getFeedbackHistory } from '@/lib/dsp/feedbackHistory'
import { downloadFile } from '@/lib/export/downloadFile'
import { generateTxtReport } from '@/lib/export/exportTxt'
import { typedStorage } from '@/lib/storage/dwaStorage'
import type { DetectorSettings, OperationMode } from '@/types/advisory'
import type { CalibrationTabProps } from './CalibrationTab'
import type { ExportMetadata } from '@/types/export'

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

const metadataStorage = typedStorage<ExportMetadata>('dwa-export-metadata', {})

// ── Constants ────────────────────────────────────────────────────────────────

const MODES = [
  ['speech', 'Speech'], ['worship', 'Worship'], ['liveMusic', 'Live'], ['theater', 'Theater'],
  ['monitors', 'Monitors'], ['ringOut', 'Ring Out'], ['broadcast', 'Bcast'], ['outdoor', 'Outdoor'],
] as const

// ── SetupTab ─────────────────────────────────────────────────────────────────
// Soundcheck and pre-show controls: mode, EQ style, AG target, room,
// calibration, rig presets, and session export.

export const SetupTab = memo(function SetupTab({
  settings, onSettingsChange, onModeChange,
  calibration,
  customPresets, showSaveInput, setShowSaveInput,
  presetName, setPresetName, handleSavePreset, handleDeletePreset, handleLoadPreset,
}: SetupTabProps) {
  const ctx = useSettings()
  const { isRunning } = useEngine()
  const pa2 = usePA2()

  // Export metadata — persisted across sessions for same venue/engineer
  const [metadata, setMetadata] = useState<ExportMetadata>(() => metadataStorage.load())
  const [isExporting, setIsExporting] = useState(false)

  const updateMetadata = useCallback((patch: Partial<ExportMetadata>) => {
    setMetadata(prev => {
      const next = { ...prev, ...patch }
      metadataStorage.save(next)
      return next
    })
  }, [])

  const dateSlug = () => new Date().toISOString().slice(0, 10)

  const handleExportTxt = useCallback(() => {
    const history = getFeedbackHistory()
    const txt = generateTxtReport(history.getSessionSummary(), history.getHotspots(), metadata)
    downloadFile(new Blob([txt], { type: 'text/plain' }), `feedback-report-${dateSlug()}.txt`)
  }, [metadata])

  const handleExportCSV = useCallback(() => {
    const csv = getFeedbackHistory().exportToCSV()
    downloadFile(new Blob([csv], { type: 'text/csv' }), `feedback-history-${dateSlug()}.csv`)
  }, [])

  const handleExportJSON = useCallback(() => {
    const json = getFeedbackHistory().exportToJSON()
    downloadFile(new Blob([json], { type: 'application/json' }), `feedback-history-${dateSlug()}.json`)
  }, [])

  const handleExportPdf = useCallback(async () => {
    setIsExporting(true)
    try {
      const { generatePdfReport } = await import('@/lib/export/exportPdf')
      const history = getFeedbackHistory()
      const blob = await generatePdfReport(history.getSessionSummary(), history.getHotspots(), metadata)
      downloadFile(blob, `feedback-report-${dateSlug()}.pdf`)
    } finally {
      setIsExporting(false)
    }
  }, [metadata])

  return (
    <div className="space-y-1">

      {/* Mode chips */}
      <div className="grid grid-cols-4 gap-1 py-1">
        {MODES.map(([mode, label]) => (
          <button
            key={mode}
            onClick={() => onModeChange(mode)}
            className={`min-h-11 flex items-center justify-center overflow-hidden cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 px-1 rounded text-xs font-mono font-bold tracking-wide transition-all ${
              settings.mode === mode
                ? 'bg-[var(--console-amber)]/10 text-[var(--console-amber)] border border-[var(--console-amber)]/40 btn-glow'
                : 'text-muted-foreground hover:text-foreground border border-transparent hover:border-[rgba(245,158,11,0.18)]'
            }`}
          >
            <span className="truncate">{label}</span>
          </button>
        ))}
      </div>

      {/* EQ Style */}
      <div className="space-y-1 pt-1">
        <div className="flex items-center gap-1">
          <span className="section-label text-muted-foreground">EQ Style</span>
          {settings.showTooltips && (
            <Tooltip>
              <TooltipTrigger asChild><HelpCircle className="w-3 h-3 text-[rgba(245,158,11,0.45)] hover:text-[var(--console-amber)] cursor-help" /></TooltipTrigger>
              <TooltipContent side="right" className="max-w-[260px] text-sm">Surgical: narrow Q cuts for precision. Heavy: wider, deeper cuts for aggressive feedback.</TooltipContent>
            </Tooltip>
          )}
        </div>
        <div className="flex items-center gap-1">
          {([['surgical', 'Surgical'], ['heavy', 'Heavy']] as const).map(([style, label]) => (
            <button key={style} onClick={() => ctx.setEqStyle(style)}
              className={`min-h-11 flex-1 px-2 rounded text-xs font-mono font-bold tracking-wide transition-colors cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 ${
                settings.eqPreset === style ? 'bg-[rgba(245,158,11,0.12)] text-[var(--console-amber)] border border-[rgba(245,158,11,0.38)]' : 'text-muted-foreground hover:text-foreground border border-transparent hover:border-[rgba(245,158,11,0.18)]'
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
          onChange={(v) => ctx.setAutoGain(settings.autoGainEnabled, v)}
          color="green" />
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

      {/* PA2 Companion */}
      <ChannelSection title="PA2 Bridge">
        <div className="space-y-3">
          {/* Enable toggle */}
          <label className="flex items-center justify-between text-xs">
            <span>PA2 Bridge</span>
            <input
              type="checkbox"
              checked={pa2.settings.enabled}
              onChange={(e) => {
                const enabling = e.target.checked
                const update: Partial<typeof pa2.settings> = { enabled: enabling }
                // Auto-set hybrid mode when enabling for the first time
                if (enabling && pa2.settings.autoSend === 'off') {
                  update.autoSend = 'both'
                }
                pa2.updateSettings(update)
              }}
              className="h-4 w-4 rounded accent-[var(--console-amber)] cursor-pointer"
            />
          </label>

          {/* Companion IP */}
          <label className="block text-xs">
            <span className="text-muted-foreground">Companion IP Address</span>
            <input
              type="text"
              value={pa2.settings.companionIp}
              onChange={(e) => {
                const ip = e.target.value.replace(/^https?:\/\//, '').replace(/\/+$/, '')
                pa2.updateSettings({
                  companionIp: ip,
                  baseUrl: buildCompanionUrl(ip, pa2.settings.companionPort, pa2.settings.instanceLabel),
                })
              }}
              placeholder="192.168.0.100"
              className="mt-1 block w-full rounded border border-border bg-background px-2 py-1 text-xs font-mono"
            />
          </label>

          {/* Port + Instance label — side by side */}
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs">
              <span className="text-muted-foreground">Port</span>
              <input
                type="number"
                value={pa2.settings.companionPort}
                onChange={(e) => {
                  const port = parseInt(e.target.value) || 8000
                  pa2.updateSettings({
                    companionPort: port,
                    baseUrl: buildCompanionUrl(pa2.settings.companionIp, port, pa2.settings.instanceLabel),
                  })
                }}
                min={1} max={65535}
                className="mt-1 block w-full rounded border border-border bg-background px-2 py-1 text-xs font-mono"
              />
            </label>
            <label className="block text-xs">
              <span className="text-muted-foreground">Instance Label</span>
              <input
                type="text"
                value={pa2.settings.instanceLabel}
                onChange={(e) => {
                  const label = e.target.value
                  pa2.updateSettings({
                    instanceLabel: label,
                    baseUrl: buildCompanionUrl(pa2.settings.companionIp, pa2.settings.companionPort, label),
                  })
                }}
                placeholder="PA2"
                className="mt-1 block w-full rounded border border-border bg-background px-2 py-1 text-xs font-mono"
              />
            </label>
          </div>

          {/* Constructed URL (read-only) */}
          {pa2.settings.companionIp && (
            <div className="text-[10px] text-muted-foreground/60 font-mono bg-muted/50 rounded px-2 py-1 break-all">
              {pa2.settings.baseUrl || 'Enter IP above'}
            </div>
          )}

          {/* Quick-fill buttons */}
          <div className="text-[10px] text-muted-foreground/60 space-y-1">
            <p>Find port in Companion: Settings &rarr; HTTP API (must be enabled). Default: 8000.</p>
            <div className="flex gap-1.5 pt-0.5 flex-wrap">
              <button
                type="button"
                onClick={() => pa2.updateSettings({
                  companionIp: '192.168.0.108', companionPort: 8000, instanceLabel: 'PA2',
                  baseUrl: 'http://192.168.0.108:8000/instance/PA2',
                })}
                className="px-1.5 py-0.5 rounded bg-muted hover:bg-muted/80 text-[10px] font-mono cursor-pointer"
              >
                192.168.0.108
              </button>
              <button
                type="button"
                onClick={() => pa2.updateSettings({
                  companionIp: 'localhost', companionPort: 8000, instanceLabel: 'PA2',
                  baseUrl: 'http://localhost:8000/instance/PA2',
                })}
                className="px-1.5 py-0.5 rounded bg-muted hover:bg-muted/80 text-[10px] font-mono cursor-pointer"
              >
                localhost
              </button>
            </div>
          </div>

          {/* Connection status */}
          {pa2.settings.enabled && pa2.settings.baseUrl && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs">
                <div className={`h-2 w-2 rounded-full ${
                  pa2.status === 'connected' && pa2.pa2Connected ? 'bg-green-500' :
                  pa2.status === 'connected' && !pa2.pa2Connected ? 'bg-amber-500 animate-pulse' :
                  pa2.status === 'connecting' ? 'bg-yellow-500 animate-pulse' :
                  pa2.status === 'error' ? 'bg-red-500' : 'bg-muted-foreground'
                }`} />
                <span className="text-muted-foreground">
                  {pa2.status === 'connected' && pa2.pa2Connected
                    ? `PA2 Connected — PEQ ${pa2.notchSlotsUsed}/${pa2.notchSlotsAvailable + pa2.notchSlotsUsed} slots`
                    : pa2.status === 'connected' && !pa2.pa2Connected
                    ? 'Companion OK — PA2 not connected'
                    : pa2.status === 'connecting' ? 'Connecting...'
                    : pa2.status === 'error' ? (pa2.error ?? 'Connection error')
                    : 'Disconnected'}
                </span>
              </div>
              {pa2.status === 'connected' && !pa2.pa2Connected && (
                <p className="text-[10px] text-amber-500/80">
                  Check Companion: PA2 IP address and TCP connection (port 19272).
                </p>
              )}
              {pa2.status === 'error' && pa2.error?.includes('Mixed content') && (
                <a
                  href="http://localhost:3000"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-2 py-1 rounded bg-primary/20 text-primary text-[10px] font-mono font-bold hover:bg-primary/30 transition-colors"
                >
                  Open localhost:3000 (PA2 Bridge works here)
                </a>
              )}
              {/* Auto-send activity */}
              {pa2.status === 'connected' && pa2.settings.autoSend !== 'off' && (
                <div className="text-[10px] space-y-0.5">
                  {pa2.lastAutoSendError ? (
                    <span className="text-red-400">Auto-send failed: {pa2.lastAutoSendError}</span>
                  ) : pa2.lastAutoSendResult ? (
                    <span className="text-muted-foreground/70">
                      Sent {pa2.lastAutoSendResult.count} {pa2.lastAutoSendResult.type === 'both' ? 'PEQ+GEQ' : pa2.lastAutoSendResult.type.toUpperCase()} correction{pa2.lastAutoSendResult.count !== 1 ? 's' : ''}{' '}
                      {Math.round((Date.now() - pa2.lastAutoSendResult.timestamp) / 1000)}s ago
                    </span>
                  ) : pa2.pa2Connected ? (
                    <span className="text-muted-foreground/50">Listening — no feedback detected yet</span>
                  ) : null}
                  {pa2.autoSendDiag && pa2.autoSendDiag.aboveThreshold === 0 && pa2.autoSendDiag.active > 0 && (
                    <span className="text-amber-500/70">
                      {pa2.autoSendDiag.active} card{pa2.autoSendDiag.active !== 1 ? 's' : ''} active but 0 above {(pa2.effectiveConfidence * 100).toFixed(0)}% confidence{pa2.effectiveConfidence > pa2.settings.autoSendMinConfidence ? ` (raised by PA2 from ${(pa2.settings.autoSendMinConfidence * 100).toFixed(0)}%)` : ''} — lower the threshold
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Test button */}
          {pa2.status === 'connected' && (
            <button
              type="button"
              onClick={async () => {
                try {
                  await pa2.client?.detect({
                    frequencies: [{ hz: 2500, confidence: 0.99, type: 'feedback', q: 10 }],
                    source: 'donewellaudio-test',
                  })
                } catch { /* shown in status */ }
              }}
              className="w-full min-h-9 px-2 rounded bg-primary/20 text-primary text-xs font-mono font-bold hover:bg-primary/30 transition-colors cursor-pointer"
            >
              Test: Send 2.5kHz notch to PA2
            </button>
          )}

          {/* Auto-send mode */}
          <div>
            <label className="block text-xs">
              <span className="text-muted-foreground">Auto-send</span>
              <select
                value={pa2.settings.autoSend}
                onChange={(e) => pa2.updateSettings({ autoSend: e.target.value as PA2AutoSendMode })}
                className="mt-1 block w-full rounded border border-border bg-background px-2 py-1 text-xs"
              >
                <option value="off">Off (manual)</option>
                <option value="both">Both PEQ + GEQ (recommended)</option>
                <option value="peq">PEQ only (surgical notches)</option>
                <option value="geq">GEQ only (broad corrections)</option>
                <option value="hybrid">Hybrid (auto-pick per advisory)</option>
              </select>
            </label>
            <p className="text-[10px] text-muted-foreground/50 mt-0.5">How detected feedback is sent to PA2. Both = GEQ for broad + PEQ for surgical. Hybrid = auto-picks per detection.</p>
          </div>

          {/* Confidence threshold */}
          <div>
            <ConsoleSlider
              label="Min confidence"
              value={`${(pa2.settings.autoSendMinConfidence * 100).toFixed(0)}%`}
              sliderValue={pa2.settings.autoSendMinConfidence * 100}
              onChange={(v: number) => pa2.updateSettings({ autoSendMinConfidence: v / 100 })}
              min={20} max={100} step={5}
            />
            <p className="text-[10px] text-muted-foreground/50 mt-0.5">
              Only send detections above this confidence level. Higher = fewer false positives, lower = faster response.
              {pa2.effectiveConfidence > pa2.settings.autoSendMinConfidence && (
                <span className="text-amber-500/70"> PA2 requires {(pa2.effectiveConfidence * 100).toFixed(0)}%.</span>
              )}
            </p>
          </div>

          {/* Toggles */}
          <div>
            <label className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Ring-out auto-send</span>
              <input
                type="checkbox"
                checked={pa2.settings.ringOutAutoSend}
                onChange={(e) => pa2.updateSettings({ ringOutAutoSend: e.target.checked })}
                className="h-4 w-4 rounded accent-[var(--console-amber)] cursor-pointer"
              />
            </label>
            <p className="text-[10px] text-muted-foreground/50 mt-0.5">Auto-send ring-out detections to PA2 during calibration mode.</p>
          </div>
          <div>
            <label className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Panic mute on RUNAWAY</span>
              <input
                type="checkbox"
                checked={pa2.settings.panicMuteEnabled}
                onChange={(e) => pa2.updateSettings({ panicMuteEnabled: e.target.checked })}
                className="h-4 w-4 rounded accent-[var(--console-amber)] cursor-pointer"
              />
            </label>
            <p className="text-[10px] text-muted-foreground/50 mt-0.5">Instantly mute all PA2 outputs if runaway feedback is detected. Safety net for live shows.</p>
          </div>
          <div>
            <label className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Sync mode to PA2</span>
              <input
                type="checkbox"
                checked={pa2.settings.modeSyncEnabled}
                onChange={(e) => pa2.updateSettings({ modeSyncEnabled: e.target.checked })}
                className="h-4 w-4 rounded accent-[var(--console-amber)] cursor-pointer"
              />
            </label>
            <p className="text-[10px] text-muted-foreground/50 mt-0.5">When you switch modes (Speech, Worship, etc.), auto-configure PA2 AFS and compressor to match.</p>
          </div>
        </div>
      </ChannelSection>

      {/* Rig Presets */}
      <ChannelSection title="Rig Presets">
        <p className="text-[10px] text-muted-foreground/50 mb-1.5">Save and recall all current settings as named presets. Up to 5 presets for different venues or rigs.</p>
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

      {/* Session Export */}
      <ChannelSection title="Session Export">
        <p className="text-[10px] text-muted-foreground/50 mb-1.5">Export detection history and EQ recommendations for documentation or post-show review.</p>
        <div className="space-y-2">
          <input
            value={metadata.venueName ?? ''}
            onChange={(e) => updateMetadata({ venueName: e.target.value })}
            placeholder="Venue name (optional)"
            maxLength={60}
            className="w-full px-2 py-1.5 rounded text-sm bg-muted border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <input
            value={metadata.engineerName ?? ''}
            onChange={(e) => updateMetadata({ engineerName: e.target.value })}
            placeholder="Engineer (optional)"
            maxLength={40}
            className="w-full px-2 py-1.5 rounded text-sm bg-muted border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                disabled={isExporting}
                className="min-h-11 w-full cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 inline-flex items-center justify-center gap-1.5 px-3 rounded text-sm font-medium bg-primary/20 text-primary border border-primary/40 hover:bg-primary/30 disabled:opacity-40 transition-colors"
              >
                {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                Export Session
                <ChevronDown className="w-3 h-3 ml-auto" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuItem onClick={handleExportTxt}>
                <FileText className="w-4 h-4 mr-2" /> Plain Text (.txt)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportCSV}>
                <FileSpreadsheet className="w-4 h-4 mr-2" /> CSV (.csv)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportJSON}>
                <FileJson className="w-4 h-4 mr-2" /> JSON (.json)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportPdf} disabled={isExporting}>
                {isExporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />}
                PDF Report (.pdf)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </ChannelSection>

    </div>
  )
})
