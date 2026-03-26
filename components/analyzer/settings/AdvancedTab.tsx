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

      {/* Detection Policy — ring, growth, confidence, A-weight, whistle */}
      <Section title="Detection Policy" showTooltip={settings.showTooltips}
        tooltip="Expert tuning for detection thresholds, timing, and filtering. Changes affect detection accuracy across all modes.">
        <div className="space-y-1">
          <ConsoleSlider label="Ring" value={`${settings.ringThresholdDb}dB`}
            tooltip={settings.showTooltips ? 'Resonance detection. 2-3 dB ring out/monitors, 4-5 dB normal, 6+ dB live music/outdoor.' : undefined}
            min={1} max={12} step={0.5} sliderValue={settings.ringThresholdDb}
            onChange={(v) => diag('ringThresholdDbOverride', v)} />
          <ConsoleSlider label="Growth" value={`${settings.growthRateThreshold.toFixed(1)}dB/s`}
            tooltip={settings.showTooltips ? 'How fast feedback must grow. 0.5-1dB/s catches early, 3+dB/s only runaway.' : undefined}
            min={0.5} max={8} step={0.5} sliderValue={settings.growthRateThreshold}
            onChange={(v) => diag('growthRateThresholdOverride', v)} />
          <ConsoleSlider label="Confidence" value={`${Math.round((settings.confidenceThreshold ?? 0.35) * 100)}%`}
            tooltip={settings.showTooltips ? 'Minimum confidence to flag. 25-35% aggressive, 45-55% balanced, 60%+ conservative.' : undefined}
            min={0.2} max={0.8} step={0.05} sliderValue={settings.confidenceThreshold ?? 0.35}
            onChange={(v) => diag('confidenceThresholdOverride', v)} />
          <LEDToggle checked={settings.aWeightingEnabled} onChange={(checked) => diag('aWeightingOverride', checked)} label="A-Weighting (IEC 61672-1)"
            tooltip={settings.showTooltips ? 'Apply IEC 61672-1 A-weighting curve. Emphasizes 1-5 kHz where hearing is most sensitive.' : undefined} />
          <LEDToggle checked={settings.ignoreWhistle} onChange={(checked) => diag('ignoreWhistleOverride', checked)} label="Ignore Whistle"
            tooltip={settings.showTooltips ? 'Suppress alerts from deliberate whistling or single-tone test signals.' : undefined} />
        </div>
      </Section>

      {/* Timing — sustain, clear */}
      <Section title="Timing" showTooltip={settings.showTooltips}
        tooltip="Controls how long peaks must persist before flagging and how fast resolved issues disappear.">
        <div className="space-y-3">
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground font-mono tracking-wide">Sustain Time</span>
              <span className="text-sm font-mono tabular-nums">{settings.sustainMs}ms</span>
            </div>
            <Slider value={[settings.sustainMs]} onValueChange={([v]) => diag('sustainMsOverride', v)} min={100} max={2000} step={50} />
            <div className="flex justify-between text-sm text-muted-foreground font-mono"><span>Fast confirm</span><span>Cautious</span></div>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground font-mono tracking-wide">Clear Time</span>
              <span className="text-sm font-mono tabular-nums">{settings.clearMs}ms</span>
            </div>
            <Slider value={[settings.clearMs]} onValueChange={([v]) => diag('clearMsOverride', v)} min={100} max={2000} step={50} />
            <div className="flex justify-between text-sm text-muted-foreground font-mono"><span>Quick clear</span><span>Persistent</span></div>
          </div>
        </div>
      </Section>

      {/* Algorithms — ML toggle + algorithm grid */}
      <Section title="Algorithms" showTooltip={settings.showTooltips}
        tooltip="ML scoring and algorithm selection for detection fusion. Auto mode uses all 7 algorithms with content-adaptive weights.">
        <div className="space-y-2">
          <LEDToggle checked={settings.mlEnabled} onChange={(checked) => diag('mlEnabled', checked)} label="ML Scoring"
            tooltip={settings.showTooltips ? 'Enable machine learning false-positive filter (7th algorithm). Disable for deterministic 6-algorithm detection.' : undefined} />
          <div className="space-y-1">
            <button onClick={() => diag('algorithmMode', settings.algorithmMode !== 'auto' ? 'auto' : 'custom')}
              className={`min-h-11 cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 w-full px-1.5 rounded text-xs font-mono font-bold tracking-wide transition-colors ${
                settings.algorithmMode === 'auto' ? 'bg-primary/20 text-primary border border-primary/40' : 'text-muted-foreground hover:text-foreground border border-transparent hover:border-border'
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
                      isAuto ? 'text-primary/60 border border-primary/20 bg-transparent'
                        : enabled ? 'bg-primary/20 text-primary border border-primary/40'
                        : 'text-muted-foreground hover:text-foreground border border-transparent hover:border-border'
                    }`}>{label}</button>
                )
              })}
            </div>
          </div>
        </div>
      </Section>

      {/* Noise Floor */}
      <Section title="Noise Floor" showTooltip={settings.showTooltips}
        tooltip="Controls how the adaptive noise floor estimates and tracks ambient noise levels.">
        <div className="space-y-3">
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground font-mono tracking-wide">Attack Time</span>
              <span className="text-sm font-mono tabular-nums">{settings.noiseFloorAttackMs}ms</span>
            </div>
            <Slider value={[settings.noiseFloorAttackMs]} onValueChange={([v]) => diag('noiseFloorAttackMs', v)} min={50} max={1000} step={25} />
            <div className="flex justify-between text-sm text-muted-foreground font-mono"><span>Fast response</span><span>Smooth</span></div>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground font-mono tracking-wide">Release Time</span>
              <span className="text-sm font-mono tabular-nums">{settings.noiseFloorReleaseMs}ms</span>
            </div>
            <Slider value={[settings.noiseFloorReleaseMs]} onValueChange={([v]) => diag('noiseFloorReleaseMs', v)} min={200} max={5000} step={100} />
            <div className="flex justify-between text-sm text-muted-foreground font-mono"><span>Quick drop</span><span>Gradual</span></div>
          </div>
        </div>
      </Section>

      {/* Peak Detection */}
      <Section title="Peak Detection" showTooltip={settings.showTooltips}
        tooltip="Fine-tune peak merging, threshold modes, and minimum prominence for peak identification.">
        <div className="space-y-3">
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground font-mono tracking-wide">Peak Merge Window</span>
              <span className="text-sm font-mono tabular-nums">{settings.peakMergeCents}¢</span>
            </div>
            <Slider value={[settings.peakMergeCents]} onValueChange={([v]) => diag('peakMergeCents', v)} min={10} max={150} step={5} />
            <div className="flex justify-between text-sm text-muted-foreground font-mono"><span>Narrow (precise)</span><span>Wide (merged)</span></div>
          </div>
          <Section title="Threshold Mode" showTooltip={settings.showTooltips}
            tooltip="Absolute: fixed dB threshold. Relative: above noise floor. Hybrid: uses both (recommended).">
            <Select value={settings.thresholdMode} onValueChange={(v) => diag('thresholdMode', v)}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="absolute">Absolute - Fixed dB</SelectItem>
                <SelectItem value="relative">Relative - Above Noise</SelectItem>
                <SelectItem value="hybrid">Hybrid - Both (Recommended)</SelectItem>
              </SelectContent>
            </Select>
          </Section>
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground font-mono tracking-wide">Prominence</span>
              <span className="text-sm font-mono tabular-nums">{settings.prominenceDb}dB</span>
            </div>
            <Slider value={[settings.prominenceDb]} onValueChange={([v]) => diag('prominenceDbOverride', v)} min={4} max={30} step={1} />
            <div className="flex justify-between text-sm text-muted-foreground font-mono"><span>Sensitive</span><span>Only strong peaks</span></div>
          </div>
        </div>
      </Section>

      {/* Track Management */}
      <Section title="Track Management" showTooltip={settings.showTooltips}
        tooltip="Controls for frequency tracker limits, timeout, and harmonic association tolerance.">
        <div className="space-y-3">
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground font-mono tracking-wide">Max Tracks</span>
              <span className="text-sm font-mono tabular-nums">{settings.maxTracks}</span>
            </div>
            <Slider value={[settings.maxTracks]} onValueChange={([v]) => diag('maxTracks', v)} min={8} max={128} step={8} />
          </div>
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground font-mono tracking-wide">Track Timeout</span>
              <span className="text-sm font-mono tabular-nums">{settings.trackTimeoutMs}ms</span>
            </div>
            <Slider value={[settings.trackTimeoutMs]} onValueChange={([v]) => diag('trackTimeoutMs', v)} min={200} max={5000} step={100} />
          </div>
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground font-mono tracking-wide">Harmonic Tolerance</span>
              <span className="text-sm font-mono tabular-nums">{settings.harmonicToleranceCents}¢</span>
            </div>
            <Slider value={[settings.harmonicToleranceCents]} onValueChange={([v]) => diag('harmonicToleranceCents', v)} min={25} max={400} step={25} />
          </div>
        </div>
      </Section>

      {/* DSP */}
      <Section title="DSP" showTooltip={settings.showTooltips}
        tooltip="FFT resolution, spectral smoothing, and frequency analysis parameters.">
        <div className="space-y-3">
          <Section title="FFT Size" showTooltip={settings.showTooltips} tooltip="4096 fast, 8192 balanced, 16384 high-res low-end.">
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
              <span className="text-sm text-muted-foreground font-mono tracking-wide">Smoothing</span>
              <span className="text-sm font-mono tabular-nums">{(settings.smoothingTimeConstant * 100).toFixed(0)}%</span>
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
                <Database className="w-4 h-4 text-primary" />
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

      </SettingsGrid>
    </div>
  )
})

const PRIVACY_SUMMARY = [
  'Magnitude spectrum only \u2014 no audio',
  'No device IDs or IP addresses',
  'Random session IDs, never linked to accounts',
]
