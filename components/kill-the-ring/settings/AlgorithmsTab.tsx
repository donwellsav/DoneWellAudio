'use client'

import { memo } from 'react'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Section, SettingsGrid, type TabSettingsProps } from './SettingsShared'
import type { AlgorithmMode, Algorithm } from '@/types/advisory'

export const AlgorithmsTab = memo(function AlgorithmsTab({
  settings,
  onSettingsChange,
}: TabSettingsProps) {
  return (
    <div className="mt-4">
      <SettingsGrid>

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
            className={`w-full px-2 py-1 rounded text-sm font-mono font-bold tracking-wide transition-colors ${
              settings.algorithmMode === 'auto'
                ? 'bg-primary/20 border border-primary/50 text-primary'
                : 'bg-card/40 border border-transparent text-muted-foreground hover:bg-muted'
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
                  className={`flex flex-col items-center px-1 py-0.5 rounded transition-colors ${
                    enabled
                      ? 'bg-primary/20 border border-primary/50 text-primary'
                      : 'bg-card/40 border border-transparent text-muted-foreground hover:bg-muted'
                  }`}
                >
                  <span className="text-sm font-mono font-bold">{label}</span>
                  <span className="text-sm text-muted-foreground">{desc}</span>
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
            <span className="text-sm text-muted-foreground font-mono tracking-wide">Auto Music-Aware</span>
            <Switch
              checked={settings.autoMusicAware}
              onCheckedChange={(checked) => onSettingsChange({ autoMusicAware: checked })}
            />
          </div>
          {settings.autoMusicAware && (
            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground font-mono tracking-wide">Trigger Level</span>
                <span className="text-sm font-mono tabular-nums">{settings.autoMusicAwareHysteresisDb}dB</span>
              </div>
              <Slider
                value={[settings.autoMusicAwareHysteresisDb]}
                onValueChange={([v]) => onSettingsChange({ autoMusicAwareHysteresisDb: v })}
                min={5} max={30} step={1}
              />
              <div className="flex justify-between text-sm text-muted-foreground font-mono">
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
          <span className="text-sm text-muted-foreground font-mono tracking-wide">Ignore whistle</span>
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
            <span className="text-sm text-muted-foreground font-mono tracking-wide">Limit</span>
            <span className="text-sm font-mono tabular-nums">{settings.maxTracks}</span>
          </div>
          <Slider
            value={[settings.maxTracks]}
            onValueChange={([v]) => onSettingsChange({ maxTracks: v })}
            min={8} max={128} step={8}
          />
          <div className="flex justify-between text-sm text-muted-foreground font-mono">
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
            <span className="text-sm text-muted-foreground font-mono tracking-wide">Timeout</span>
            <span className="text-sm font-mono tabular-nums">{settings.trackTimeoutMs}ms</span>
          </div>
          <Slider
            value={[settings.trackTimeoutMs]}
            onValueChange={([v]) => onSettingsChange({ trackTimeoutMs: v })}
            min={200} max={5000} step={100}
          />
          <div className="flex justify-between text-sm text-muted-foreground font-mono">
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
          <span className="text-sm text-muted-foreground font-mono tracking-wide">Show live scores</span>
          <Switch
            checked={settings.showAlgorithmScores}
            onCheckedChange={(checked) => onSettingsChange({ showAlgorithmScores: checked })}
          />
        </div>
      </Section>
      </SettingsGrid>
    </div>
  )
})
