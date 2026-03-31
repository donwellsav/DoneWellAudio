'use client'

import { memo } from 'react'
import { Slider } from '@/components/ui/slider'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { LEDToggle } from '@/components/ui/led-toggle'
import { ConsoleSlider } from '@/components/ui/console-slider'
import { PillToggle } from '@/components/ui/pill-toggle'
import { Database, Shield } from 'lucide-react'
import { Section, SettingsGrid, type TabSettingsProps } from './SettingsShared'
import { useSettings } from '@/contexts/SettingsContext'
import type { AlgorithmMode, Algorithm } from '@/types/advisory'
import type { ConsentStatus } from '@/types/data'
import { useCompanion } from '@/hooks/useCompanion'

export interface AdvancedTabProps extends TabSettingsProps {
  consentStatus?: ConsentStatus
  isCollecting?: boolean
  onEnableCollection?: () => void
  onDisableCollection?: () => void
}

export const AdvancedTab = memo(function AdvancedTab({
  settings,
  onSettingsChange,
  consentStatus,
  isCollecting,
  onEnableCollection,
  onDisableCollection,
}: AdvancedTabProps) {
  const ctx = useSettings()
  const diag = (field: string, value: unknown) => {
    ctx.updateDiagnostics({ [field]: value } as Record<string, unknown>)
  }

  return (
    <div className="space-y-1">
      <SettingsGrid>

      {/* Fader Link — ratio and center positions for dual fader coupling */}
      <Section title="Fader Link" color="green" showTooltip={settings.showTooltips}
        tooltip="Configure the dual fader strip coupling. Ratio controls how fast sensitivity moves relative to gain. Center values set the Home button positions.">
        <div className="space-y-1">
          <ConsoleSlider label="Link Ratio" color="green" value={`${settings.faderLinkRatio.toFixed(1)}:1`}
            tooltip={settings.showTooltips ? 'Sensitivity-to-gain visual ratio. 1.0 = equal travel. 2.0 = sensitivity moves twice as fast.' : undefined}
            min={0.5} max={2} step={0.1} sliderValue={settings.faderLinkRatio}
            onChange={(v) => ctx.updateDisplay({ faderLinkRatio: v })} />
          <ConsoleSlider label="Center Gain" color="green" value={`${settings.faderLinkCenterGainDb}dB`}
            tooltip={settings.showTooltips ? 'Home position for gain fader. Default 0dB (unity).' : undefined}
            min={-20} max={20} step={1} sliderValue={settings.faderLinkCenterGainDb}
            onChange={(v) => ctx.updateDisplay({ faderLinkCenterGainDb: v })} />
          <ConsoleSlider label="Center Sens" color="green" value={`${settings.faderLinkCenterSensDb}dB`}
            tooltip={settings.showTooltips ? 'Home position for sensitivity fader. Default 25dB threshold.' : undefined}
            min={5} max={40} step={1} sliderValue={settings.faderLinkCenterSensDb}
            onChange={(v) => ctx.updateDisplay({ faderLinkCenterSensDb: v })} />
        </div>
      </Section>

      {/* Detection Policy — ring, growth, confidence, A-weight, whistle */}
      <Section title="Detection Policy" color="amber" showTooltip={settings.showTooltips}
        tooltip="Expert tuning for detection thresholds, timing, and filtering. Changes affect detection accuracy across all modes.">
        <div className="space-y-1">
          <ConsoleSlider label="Ring" color="amber" value={`${settings.ringThresholdDb}dB`}
            tooltip={settings.showTooltips ? 'Resonance detection. 2-3 dB ring out/monitors, 4-5 dB normal, 6+ dB live music/outdoor.' : undefined}
            min={1} max={12} step={0.5} sliderValue={settings.ringThresholdDb}
            onChange={(v) => diag('ringThresholdDbOverride', v)} />
          <ConsoleSlider label="Growth" color="amber" value={`${settings.growthRateThreshold.toFixed(1)}dB/s`}
            tooltip={settings.showTooltips ? 'How fast feedback must grow. 0.5-1dB/s catches early, 3+dB/s only runaway.' : undefined}
            min={0.5} max={8} step={0.5} sliderValue={settings.growthRateThreshold}
            onChange={(v) => diag('growthRateThresholdOverride', v)} />
          <ConsoleSlider label="Confidence" color="amber" value={`${Math.round((settings.confidenceThreshold ?? 0.35) * 100)}%`}
            tooltip={settings.showTooltips ? 'Minimum confidence to flag. 25-35% aggressive, 45-55% balanced, 60%+ conservative.' : undefined}
            min={0.2} max={0.8} step={0.05} sliderValue={settings.confidenceThreshold ?? 0.35}
            onChange={(v) => diag('confidenceThresholdOverride', v)} />
          <LEDToggle color="amber" checked={settings.aWeightingEnabled} onChange={(checked) => diag('aWeightingOverride', checked)} label="A-Weighting (IEC 61672-1)"
            tooltip={settings.showTooltips ? 'Apply IEC 61672-1 A-weighting curve. Emphasizes 1-5 kHz where hearing is most sensitive.' : undefined} />
          <LEDToggle color="amber" checked={settings.ignoreWhistle} onChange={(checked) => diag('ignoreWhistleOverride', checked)} label="Ignore Whistle"
            tooltip={settings.showTooltips ? 'Suppress alerts from deliberate whistling or single-tone test signals.' : undefined} />
        </div>
      </Section>

      {/* Timing — sustain, clear */}
      <Section title="Timing" color="blue" showTooltip={settings.showTooltips}
        tooltip="Controls how long peaks must persist before flagging and how fast resolved issues disappear.">
        <div className="space-y-3">
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-sm font-mono tracking-wide" style={{ color: 'var(--console-blue)' }}>Sustain Time</span>
              <span className="text-sm font-mono tabular-nums" style={{ color: 'var(--console-blue)' }}>{settings.sustainMs}ms</span>
            </div>
            <Slider value={[settings.sustainMs]} onValueChange={([v]) => diag('sustainMsOverride', v)} min={100} max={2000} step={50} />
            <div className="flex justify-between text-xs text-muted-foreground font-mono"><span className="flex-shrink-0">Fast confirm</span><span className="text-right">Cautious</span></div>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-sm font-mono tracking-wide" style={{ color: 'var(--console-blue)' }}>Clear Time</span>
              <span className="text-sm font-mono tabular-nums" style={{ color: 'var(--console-blue)' }}>{settings.clearMs}ms</span>
            </div>
            <Slider value={[settings.clearMs]} onValueChange={([v]) => diag('clearMsOverride', v)} min={100} max={2000} step={50} />
            <div className="flex justify-between text-xs text-muted-foreground font-mono"><span className="flex-shrink-0">Quick clear</span><span className="text-right">Persistent</span></div>
          </div>
        </div>
      </Section>

      {/* Algorithms — ML toggle + algorithm grid */}
      <Section title="Algorithms" color="amber" showTooltip={settings.showTooltips}
        tooltip="ML scoring and algorithm selection for detection fusion. Auto mode uses all 7 algorithms with content-adaptive weights.">
        <div className="space-y-2">
          <LEDToggle color="amber" checked={settings.mlEnabled} onChange={(checked) => diag('mlEnabled', checked)} label="ML Scoring"
            tooltip={settings.showTooltips ? 'Enable machine learning false-positive filter (7th algorithm). Disable for deterministic 6-algorithm detection.' : undefined} />
          <LEDToggle color="amber" checked={settings.adaptivePhaseSkip} onChange={(checked) => diag('adaptivePhaseSkip', checked)} label="Adaptive Phase Skip"
            tooltip={settings.showTooltips ? 'Skip phase FFT when MSD is decisive. Saves CPU in speech/monitor modes. Always runs full phase in music/worship.' : undefined} />
          <div className="space-y-1">
            <button onClick={() => diag('algorithmMode', settings.algorithmMode !== 'auto' ? 'auto' : 'custom')}
              className={`min-h-11 cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 w-full px-1.5 rounded text-xs font-mono font-bold tracking-wide transition-colors ${
                settings.algorithmMode === 'auto' ? 'bg-[var(--console-amber)]/15 text-[var(--console-amber)] border border-[var(--console-amber)]/35' : 'text-muted-foreground hover:text-foreground border border-transparent hover:border-border'
              }`}>Auto</button>
            <div className={`grid grid-cols-3 gap-1 ${settings.algorithmMode === 'auto' ? 'pointer-events-none' : ''}`}>
              {([['msd', 'MSD'], ['phase', 'Phase'], ['spectral', 'Spectral'], ['comb', 'Comb'], ['ihr', 'IHR'], ['ptmr', 'PTMR'], ['ml', 'ML']] as const).map(([key, label]) => {
                const isAuto = settings.algorithmMode === 'auto'
                const enabled = isAuto || (settings.enabledAlgorithms?.includes(key) ?? true)
                return (
                  <button key={key} onClick={() => {
                    if (isAuto) return
                    const current = settings.enabledAlgorithms ?? ['msd', 'phase', 'spectral', 'comb', 'ihr', 'ptmr', 'ml']
                    let next: Algorithm[]
                    if (enabled) { next = current.filter(a => a !== key); if (next.length === 0) { diag('algorithmMode', 'auto' as AlgorithmMode); return } }
                    else { next = [...current, key] }
                    diag('enabledAlgorithms', next)
                  }}
                    className={`min-h-11 cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 px-1 rounded text-xs font-mono font-bold text-center transition-colors ${
                      isAuto ? 'text-[var(--console-amber)]/50 border border-[var(--console-amber)]/20 bg-transparent'
                        : enabled ? 'bg-[var(--console-amber)]/15 text-[var(--console-amber)] border border-[var(--console-amber)]/35'
                        : 'text-muted-foreground hover:text-foreground border border-transparent hover:border-border'
                    }`}>{label}</button>
                )
              })}
            </div>
          </div>
        </div>
      </Section>

      {/* Noise Floor */}
      <Section title="Noise Floor" color="green" showTooltip={settings.showTooltips}
        tooltip="Controls how the adaptive noise floor estimates and tracks ambient noise levels.">
        <div className="space-y-3">
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-sm font-mono tracking-wide" style={{ color: 'var(--console-green)' }}>Attack Time</span>
              <span className="text-sm font-mono tabular-nums" style={{ color: 'var(--console-green)' }}>{settings.noiseFloorAttackMs}ms</span>
            </div>
            <Slider value={[settings.noiseFloorAttackMs]} onValueChange={([v]) => diag('noiseFloorAttackMs', v)} min={50} max={1000} step={25} />
            <div className="flex justify-between text-xs text-muted-foreground font-mono"><span className="flex-shrink-0">Fast response</span><span className="text-right">Smooth</span></div>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-sm font-mono tracking-wide" style={{ color: 'var(--console-green)' }}>Release Time</span>
              <span className="text-sm font-mono tabular-nums" style={{ color: 'var(--console-green)' }}>{settings.noiseFloorReleaseMs}ms</span>
            </div>
            <Slider value={[settings.noiseFloorReleaseMs]} onValueChange={([v]) => diag('noiseFloorReleaseMs', v)} min={200} max={5000} step={100} />
            <div className="flex justify-between text-xs text-muted-foreground font-mono"><span className="flex-shrink-0">Quick drop</span><span className="text-right">Gradual</span></div>
          </div>
        </div>
      </Section>

      {/* Peak Detection */}
      <Section title="Peak Detection" color="blue" showTooltip={settings.showTooltips}
        tooltip="Fine-tune peak merging, threshold modes, and minimum prominence for peak identification.">
        <div className="space-y-3">
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-sm font-mono tracking-wide" style={{ color: 'var(--console-blue)' }}>Peak Merge Window</span>
              <span className="text-sm font-mono tabular-nums" style={{ color: 'var(--console-blue)' }}>{settings.peakMergeCents}¢</span>
            </div>
            <Slider value={[settings.peakMergeCents]} onValueChange={([v]) => diag('peakMergeCents', v)} min={10} max={150} step={5} />
            <div className="flex justify-between text-xs text-muted-foreground font-mono"><span className="flex-shrink-0">Narrow (precise)</span><span>Wide</span></div>
          </div>
          <Section title="Threshold Mode" color="blue" showTooltip={settings.showTooltips}
            tooltip="Absolute: fixed dB threshold. Relative: above noise floor. Hybrid: uses both (recommended).">
            <Select value={settings.thresholdMode} onValueChange={(v) => diag('thresholdMode', v)}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="absolute">Absolute - Fixed dB</SelectItem>
                <SelectItem value="relative">Relative - Above Noise</SelectItem>
                <SelectItem value="hybrid">Hybrid (Recommended)</SelectItem>
              </SelectContent>
            </Select>
          </Section>
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-sm font-mono tracking-wide" style={{ color: 'var(--console-blue)' }}>Prominence</span>
              <span className="text-sm font-mono tabular-nums" style={{ color: 'var(--console-blue)' }}>{settings.prominenceDb}dB</span>
            </div>
            <Slider value={[settings.prominenceDb]} onValueChange={([v]) => diag('prominenceDbOverride', v)} min={4} max={30} step={1} />
            <div className="flex justify-between text-xs text-muted-foreground font-mono"><span className="flex-shrink-0">Sensitive</span><span>Strong peaks</span></div>
          </div>
        </div>
      </Section>

      {/* Track Management */}
      <Section title="Track Management" color="green" showTooltip={settings.showTooltips}
        tooltip="Controls for frequency tracker limits, timeout, and harmonic association tolerance.">
        <div className="space-y-3">
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-sm font-mono tracking-wide" style={{ color: 'var(--console-green)' }}>Max Tracks</span>
              <span className="text-sm font-mono tabular-nums" style={{ color: 'var(--console-green)' }}>{settings.maxTracks}</span>
            </div>
            <Slider value={[settings.maxTracks]} onValueChange={([v]) => diag('maxTracks', v)} min={8} max={128} step={8} />
          </div>
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-sm font-mono tracking-wide" style={{ color: 'var(--console-green)' }}>Track Timeout</span>
              <span className="text-sm font-mono tabular-nums" style={{ color: 'var(--console-green)' }}>{settings.trackTimeoutMs}ms</span>
            </div>
            <Slider value={[settings.trackTimeoutMs]} onValueChange={([v]) => diag('trackTimeoutMs', v)} min={200} max={5000} step={100} />
          </div>
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-sm font-mono tracking-wide" style={{ color: 'var(--console-blue)' }}>Harmonic Tolerance</span>
              <span className="text-sm font-mono tabular-nums" style={{ color: 'var(--console-blue)' }}>{settings.harmonicToleranceCents}¢</span>
            </div>
            <Slider value={[settings.harmonicToleranceCents]} onValueChange={([v]) => diag('harmonicToleranceCents', v)} min={25} max={400} step={25} />
          </div>
        </div>
      </Section>

      {/* DSP */}
      <Section title="DSP" color="blue" showTooltip={settings.showTooltips}
        tooltip="FFT resolution, spectral smoothing, and frequency analysis parameters.">
        <div className="space-y-3">
          <Section title="FFT Size" color="blue" showTooltip={settings.showTooltips} tooltip="4096 fast, 8192 balanced, 16384 high-res low-end.">
            <Select value={settings.fftSize.toString()} onValueChange={(v) => diag('fftSizeOverride', parseInt(v))}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="4096">4096 - Fast</SelectItem>
                <SelectItem value="8192">8192 - Balanced</SelectItem>
                <SelectItem value="16384">16384 - High Res</SelectItem>
              </SelectContent>
            </Select>
          </Section>
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-sm font-mono tracking-wide" style={{ color: 'var(--console-blue)' }}>Smoothing</span>
              <span className="text-sm font-mono tabular-nums" style={{ color: 'var(--console-blue)' }}>{(settings.smoothingTimeConstant * 100).toFixed(0)}%</span>
            </div>
            <Slider value={[settings.smoothingTimeConstant]} onValueChange={([v]) => diag('smoothingTimeConstantOverride', v)} min={0} max={0.95} step={0.05} />
          </div>
        </div>
      </Section>

      {/* Data Collection */}
      {consentStatus !== undefined && (
        <Section title="Data Collection" showTooltip={settings.showTooltips}
          tooltip="Share anonymous frequency data to improve feedback detection. No audio, device IDs, or personal data is collected.">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4" style={{ color: 'var(--console-green)' }} />
                <span className="text-sm text-muted-foreground font-mono tracking-wide">Share spectral data</span>
              </div>
              <PillToggle checked={consentStatus === 'accepted'} onChange={(checked) => { if (checked) onEnableCollection?.(); else onDisableCollection?.() }} />
            </div>
            {isCollecting && (
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs text-emerald-500 font-mono">Collecting</span>
              </div>
            )}
            <div className="space-y-1.5">
              {PRIVACY_SUMMARY.map((point, i) => (
                <div key={i} className="flex items-start gap-1.5">
                  <Shield className="w-3 h-3 flex-shrink-0 mt-0.5 text-emerald-500/60" />
                  <span className="text-xs text-muted-foreground/70 font-mono leading-snug">{point}</span>
                </div>
              ))}
            </div>
          </div>
        </Section>
      )}

      {/* Companion — Bitfocus Companion integration */}
      <CompanionSection showTooltips={settings.showTooltips} />

      </SettingsGrid>
    </div>
  )
})

// ── Companion Section (extracted for clarity) ──────────────────────────────

const CompanionSection = memo(function CompanionSection({ showTooltips }: { showTooltips: boolean }) {
  const { settings: cs, updateSettings, connected, lastError, checkConnection, regenerateCode } = useCompanion()

  return (
    <Section title="Companion" fullWidth showTooltip={showTooltips}
      tooltip="Send EQ recommendations to Bitfocus Companion for hardware mixer control. Companion routes commands to your mixer module (X32, Yamaha, dbx, etc).">
      <div className="space-y-1.5">
        <LEDToggle checked={cs.enabled} onChange={(checked) => updateSettings({ enabled: checked })}
          label="Enable Companion Bridge"
          tooltip={showTooltips ? 'Send detected feedback EQ recommendations to Bitfocus Companion.' : undefined} />

        {cs.enabled && (
          <>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground font-mono">Pairing Code</label>
              <div className="flex items-center gap-2">
                <div className="flex-1 rounded bg-muted border border-border px-3 py-1.5 text-sm font-mono font-bold tracking-[0.2em] text-center select-all">
                  {cs.pairingCode}
                </div>
                <button type="button" onClick={regenerateCode}
                  className="text-xs font-mono text-muted-foreground hover:text-foreground cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 rounded px-1.5 py-1 border border-border">
                  New Code
                </button>
              </div>
              <p className="text-xs text-muted-foreground/60 font-mono">Enter this code in the Companion module to pair.</p>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <div className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-red-500'}`} />
              <span className={`text-xs font-mono ${connected ? 'text-emerald-500' : 'text-red-500'}`}>
                {connected ? 'Relay active' : lastError ?? 'Disconnected'}
              </span>
              <button type="button" onClick={() => checkConnection()}
                className="ml-auto text-xs font-mono text-muted-foreground hover:text-foreground cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 rounded px-1.5 py-0.5 border border-border">
                Test
              </button>
            </div>

            <ConsoleSlider label="Min Confidence" value={`${Math.round(cs.minConfidence * 100)}%`}
              tooltip={showTooltips ? 'Only send advisories above this confidence threshold to Companion.' : undefined}
              min={0.3} max={0.95} step={0.05} sliderValue={cs.minConfidence}
              onChange={(v) => updateSettings({ minConfidence: v })} />

            <LEDToggle checked={cs.autoSend} onChange={(checked) => updateSettings({ autoSend: checked })}
              label="Auto-Send Advisories"
              tooltip={showTooltips ? 'Automatically send every advisory to Companion. When off, use the Send to Mixer button on each card.' : undefined} />

            <LEDToggle checked={cs.ringOutAutoSend} onChange={(checked) => updateSettings({ ringOutAutoSend: checked })}
              label="Ring-Out Auto-Send"
              tooltip={showTooltips ? 'Automatically send each ring-out step to Companion when in ring-out mode.' : undefined} />
          </>
        )}
      </div>
    </Section>
  )
})

const PRIVACY_SUMMARY = [
  'Magnitude spectrum only \u2014 no audio',
  'No device IDs or IP addresses',
  'Random session IDs, never linked to accounts',
]
