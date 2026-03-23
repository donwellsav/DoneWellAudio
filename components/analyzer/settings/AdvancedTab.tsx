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
import { PillToggle } from '@/components/ui/pill-toggle'
import { Database, Shield } from 'lucide-react'
import { Section, SettingsGrid, type TabSettingsProps } from './SettingsShared'
import type { ThresholdMode } from '@/types/advisory'
import type { ConsentStatus } from '@/types/data'

export interface AdvancedTabProps extends TabSettingsProps {
  /** Current data collection consent status */
  consentStatus?: ConsentStatus
  /** Whether collection is actively running */
  isCollecting?: boolean
  /** Called when user toggles collection on */
  onEnableCollection?: () => void
  /** Called when user toggles collection off */
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
  return (
    <div className="mt-4">
      <SettingsGrid>

      {/* ── Noise Floor ── */}
      <Section
        title="Noise Floor"
        showTooltip={settings.showTooltips}
        tooltip="Controls how the adaptive noise floor estimates and tracks ambient noise levels."
      >
        <div className="space-y-3">
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground font-mono tracking-wide">Decay Rate</span>
              <span className="text-sm font-mono tabular-nums">{settings.noiseFloorDecay.toFixed(3)}</span>
            </div>
            <Slider
              value={[settings.noiseFloorDecay]}
              onValueChange={([v]) => onSettingsChange({ noiseFloorDecay: v })}
              min={0.90} max={0.999} step={0.005}
            />
            <div className="flex justify-between text-sm text-muted-foreground font-mono">
              <span>Fast (dynamic)</span><span>Slow (stable)</span>
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground font-mono tracking-wide">Attack Time</span>
              <span className="text-sm font-mono tabular-nums">{settings.noiseFloorAttackMs}ms</span>
            </div>
            <Slider
              value={[settings.noiseFloorAttackMs]}
              onValueChange={([v]) => onSettingsChange({ noiseFloorAttackMs: v })}
              min={50} max={1000} step={25}
            />
            <div className="flex justify-between text-sm text-muted-foreground font-mono">
              <span>Fast response</span><span>Smooth</span>
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground font-mono tracking-wide">Release Time</span>
              <span className="text-sm font-mono tabular-nums">{settings.noiseFloorReleaseMs}ms</span>
            </div>
            <Slider
              value={[settings.noiseFloorReleaseMs]}
              onValueChange={([v]) => onSettingsChange({ noiseFloorReleaseMs: v })}
              min={200} max={5000} step={100}
            />
            <div className="flex justify-between text-sm text-muted-foreground font-mono">
              <span>Quick drop</span><span>Gradual</span>
            </div>
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
              <span className="text-sm text-muted-foreground font-mono tracking-wide">Peak Merge Window</span>
              <span className="text-sm font-mono tabular-nums">{settings.peakMergeCents}¢</span>
            </div>
            <Slider
              value={[settings.peakMergeCents]}
              onValueChange={([v]) => onSettingsChange({ peakMergeCents: v })}
              min={10} max={150} step={5}
            />
            <div className="flex justify-between text-sm text-muted-foreground font-mono">
              <span>Narrow (precise)</span><span>Wide (merged)</span>
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground font-mono tracking-wide">Sustain Time</span>
              <span className="text-sm font-mono tabular-nums">{settings.sustainMs}ms</span>
            </div>
            <Slider
              value={[settings.sustainMs]}
              onValueChange={([v]) => onSettingsChange({ sustainMs: v })}
              min={100} max={2000} step={50}
            />
            <div className="flex justify-between text-sm text-muted-foreground font-mono">
              <span>Fast confirm</span><span>Cautious</span>
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground font-mono tracking-wide">Clear Time</span>
              <span className="text-sm font-mono tabular-nums">{settings.clearMs}ms</span>
            </div>
            <Slider
              value={[settings.clearMs]}
              onValueChange={([v]) => onSettingsChange({ clearMs: v })}
              min={100} max={2000} step={50}
            />
            <div className="flex justify-between text-sm text-muted-foreground font-mono">
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
              <SelectTrigger className="h-8 text-sm">
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
              <span className="text-sm text-muted-foreground font-mono tracking-wide">Relative Threshold</span>
              <span className="text-sm font-mono tabular-nums">{settings.relativeThresholdDb}dB</span>
            </div>
            <Slider
              value={[settings.relativeThresholdDb]}
              onValueChange={([v]) => onSettingsChange({ relativeThresholdDb: v })}
              min={6} max={30} step={1}
            />
            <div className="flex justify-between text-sm text-muted-foreground font-mono">
              <span>Sensitive</span><span>Conservative</span>
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground font-mono tracking-wide">Prominence</span>
              <span className="text-sm font-mono tabular-nums">{settings.prominenceDb}dB</span>
            </div>
            <Slider
              value={[settings.prominenceDb]}
              onValueChange={([v]) => onSettingsChange({ prominenceDb: v })}
              min={4} max={30} step={1}
            />
            <div className="flex justify-between text-sm text-muted-foreground font-mono">
              <span>Sensitive</span><span>Only strong peaks</span>
            </div>
          </div>
        </div>
      </Section>

      {/* ── Data Collection ── */}
      {consentStatus !== undefined && (
        <Section
          title="Data Collection"
          showTooltip={settings.showTooltips}
          tooltip="Share anonymous frequency data to improve feedback detection. No audio, device IDs, or personal data is collected."
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-primary" />
                <span className="text-sm text-muted-foreground font-mono tracking-wide">
                  Share spectral data
                </span>
              </div>
              <PillToggle
                checked={consentStatus === 'accepted'}
                onChange={(checked) => {
                  if (checked) onEnableCollection?.()
                  else onDisableCollection?.()
                }}
              />
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
