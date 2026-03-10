'use client'

import { memo } from 'react'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Section, SectionGroup, type TabSettingsProps } from './SettingsShared'
import type { OperationMode } from '@/types/advisory'

interface DetectionTabProps extends TabSettingsProps {
  onModeChange: (mode: OperationMode) => void
}

export const DetectionTab = memo(function DetectionTab({
  settings,
  onSettingsChange,
  onModeChange,
}: DetectionTabProps) {
  return (
    <div className="mt-4 space-y-4">

      <SectionGroup title="Sensitivity">
        <Section
          title="Operation Mode"
          showTooltip={settings.showTooltips}
          tooltip="Professional presets that configure detection for specific live sound scenarios. Each preset adjusts thresholds, frequency range, timing, and sensitivity."
        >
          <Select
            value={settings.mode}
            onValueChange={(v) => onModeChange(v as OperationMode)}
          >
            <SelectTrigger className="h-8 text-sm">
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
          title="Feedback Sensitivity"
          showTooltip={settings.showTooltips}
          tooltip="Detection sensitivity. Slide right for more sensitive (catches early feedback). Slide left for less sensitive (ignores weak peaks)."
        >
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground font-mono tracking-wide">Sensitivity</span>
              <span className="text-sm font-mono tabular-nums">{settings.feedbackThresholdDb}dB</span>
            </div>
            <Slider
              value={[52 - settings.feedbackThresholdDb]}
              onValueChange={([v]) => onSettingsChange({ feedbackThresholdDb: 52 - v })}
              min={2} max={50} step={1}
            />
            <div className="flex justify-between text-sm text-muted-foreground font-mono">
              <span>Conservative</span><span>Aggressive</span>
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
              <span className="text-sm text-muted-foreground font-mono tracking-wide">Threshold</span>
              <span className="text-sm font-mono tabular-nums">{settings.ringThresholdDb}dB</span>
            </div>
            <Slider
              value={[settings.ringThresholdDb]}
              onValueChange={([v]) => onSettingsChange({ ringThresholdDb: v })}
              min={1} max={12} step={0.5}
            />
            <div className="flex justify-between text-sm text-muted-foreground font-mono">
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
              <span className="text-sm text-muted-foreground font-mono tracking-wide">Rate</span>
              <span className="text-sm font-mono tabular-nums">{settings.growthRateThreshold.toFixed(1)}dB/s</span>
            </div>
            <Slider
              value={[settings.growthRateThreshold]}
              onValueChange={([v]) => onSettingsChange({ growthRateThreshold: v })}
              min={0.5} max={8} step={0.5}
            />
            <div className="flex justify-between text-sm text-muted-foreground font-mono">
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
              <span className="text-sm text-muted-foreground font-mono tracking-wide">Min. Confidence</span>
              <span className="text-sm font-mono tabular-nums">{Math.round(settings.confidenceThreshold * 100)}%</span>
            </div>
            <Slider
              value={[settings.confidenceThreshold * 100]}
              onValueChange={([v]) => onSettingsChange({ confidenceThreshold: v / 100 })}
              min={0} max={100} step={1}
            />
            <div className="flex justify-between text-sm text-muted-foreground font-mono">
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
              <span className="text-sm text-muted-foreground font-mono tracking-wide">Duration</span>
              <span className="text-sm font-mono tabular-nums">{(settings.holdTimeMs / 1000).toFixed(1)}s</span>
            </div>
            <Slider
              value={[settings.holdTimeMs]}
              onValueChange={([v]) => onSettingsChange({ holdTimeMs: v })}
              min={500} max={5000} step={250}
            />
            <div className="flex justify-between text-sm text-muted-foreground font-mono">
              <span>Quick</span><span>Persistent</span>
            </div>
          </div>
        </Section>
      </SectionGroup>

      <div className="border-t border-border/40" />

      <SectionGroup title="Analysis">
        <Section
          title="FFT Size"
          showTooltip={settings.showTooltips}
          tooltip="Controls frequency resolution vs response time. 4096 for fast response, 8192 for balanced PA use, 16384 for precise low-end analysis."
        >
          <Select
            value={settings.fftSize.toString()}
            onValueChange={(v) => onSettingsChange({ fftSize: parseInt(v) as 4096 | 8192 | 16384 })}
          >
            <SelectTrigger className="h-8 text-sm">
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
              <span className="text-sm text-muted-foreground font-mono tracking-wide">Amount</span>
              <span className="text-sm font-mono tabular-nums">{(settings.smoothingTimeConstant * 100).toFixed(0)}%</span>
            </div>
            <Slider
              value={[settings.smoothingTimeConstant]}
              onValueChange={([v]) => onSettingsChange({ smoothingTimeConstant: v })}
              min={0} max={0.95} step={0.05}
            />
            <div className="flex justify-between text-sm text-muted-foreground font-mono">
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
            <span className="text-sm text-muted-foreground font-mono tracking-wide">Apply A-weighting curve</span>
            <Switch
              checked={settings.aWeightingEnabled}
              onCheckedChange={(checked) => onSettingsChange({ aWeightingEnabled: checked })}
            />
          </div>
        </Section>
      </SectionGroup>

      <div className="border-t border-border/40" />

      <SectionGroup title="Filtering">
        <Section
          title="Harmonic Filter"
          showTooltip={settings.showTooltips}
          tooltip="Detects harmonic overtones to reduce false positives for instruments like bass guitar."
        >
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground font-mono tracking-wide">Filter instruments</span>
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
              <span className="text-sm text-muted-foreground font-mono tracking-wide">Window</span>
              <span className="text-sm font-mono tabular-nums">{settings.harmonicToleranceCents}¢</span>
            </div>
            <Slider
              value={[settings.harmonicToleranceCents]}
              onValueChange={([v]) => onSettingsChange({ harmonicToleranceCents: v })}
              min={25} max={400} step={25}
            />
            <div className="flex justify-between text-sm text-muted-foreground font-mono">
              <span>Tight (ring out)</span><span>Wide (live)</span>
            </div>
          </div>
        </Section>
      </SectionGroup>
    </div>
  )
})
