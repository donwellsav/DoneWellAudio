'use client'

import { memo } from 'react'
import { Button } from '@/components/ui/button'
import { GraduationCap } from 'lucide-react'
import { ConsoleSlider } from '@/components/ui/console-slider'
import { LEDToggle } from '@/components/ui/led-toggle'
import { ChannelSection } from '@/components/ui/channel-section'
import { PillToggle } from '@/components/ui/pill-toggle'
import type { TabSettingsProps } from './SettingsShared'
import { onboardingStorage } from '@/lib/storage/dwaStorage'

export const DisplayTab = memo(function DisplayTab({
  settings,
  onSettingsChange,
}: TabSettingsProps) {
  return (
    <div className="space-y-1 pt-1">

      {/* ═══ QUICK TOGGLES — always visible ═══ */}
      <div className="grid grid-cols-2 gap-x-4">
        <LEDToggle
          checked={settings.showAlgorithmScores}
          onChange={(checked) => onSettingsChange({ showAlgorithmScores: checked })}
          label="Algorithm Scores"
          tooltip={settings.showTooltips ? 'Show MSD, Phase, Spectral, Comb, IHR, PTMR, and ML scores on each advisory card for debugging.' : undefined}
        />
        <LEDToggle
          checked={settings.showPeqDetails}
          onChange={(checked) => onSettingsChange({ showPeqDetails: checked })}
          label="PEQ Details"
          tooltip={settings.showTooltips ? 'Show parametric EQ band numbers (Q, gain, frequency) on advisory cards.' : undefined}
        />
        <LEDToggle
          checked={settings.showFreqZones}
          onChange={(checked) => onSettingsChange({ showFreqZones: checked })}
          label="Frequency Zones"
          tooltip={settings.showTooltips ? 'Overlay colored bands (Sub, Low Mid, Mid, Presence, Air) on the RTA spectrum.' : undefined}
        />
        <LEDToggle
          checked={settings.spectrumWarmMode}
          onChange={(checked) => onSettingsChange({ spectrumWarmMode: checked })}
          label="Warm Spectrum"
          color="amber"
          tooltip={settings.showTooltips ? 'Switch RTA spectrum color to warm amber tones.' : undefined}
        />
        <LEDToggle
          checked={settings.swipeLabeling}
          onChange={(checked) => onSettingsChange({ swipeLabeling: checked })}
          label="Swipe to Label"
          tooltip={settings.showTooltips ? 'Enable swipe gestures on issue cards: left = dismiss, right = confirm, long-press = false positive.' : undefined}
        />
      </div>

      {/* ═══ SECTION: Graph ═══ */}
      <ChannelSection title="Graph" defaultOpen>
        <div className="space-y-1">
          <ConsoleSlider label="RTA Range (Min)" value={`${settings.rtaDbMin} dB`}
            tooltip={settings.showTooltips ? 'Lower bound of the visible RTA amplitude range.' : undefined}
            min={-120} max={-60} step={5} sliderValue={settings.rtaDbMin}
            onChange={(v) => onSettingsChange({ rtaDbMin: v })} />

          <ConsoleSlider label="RTA Range (Max)" value={`${settings.rtaDbMax} dB`}
            tooltip={settings.showTooltips ? 'Upper bound of the visible RTA amplitude range.' : undefined}
            min={-20} max={0} step={5} sliderValue={settings.rtaDbMax}
            onChange={(v) => onSettingsChange({ rtaDbMax: v })} />

          <ConsoleSlider label="Line Width" value={`${settings.spectrumLineWidth.toFixed(1)} px`}
            tooltip={settings.showTooltips ? 'Spectrum curve thickness. Thinner for detail, thicker for distance.' : undefined}
            min={0.5} max={4} step={0.5} sliderValue={settings.spectrumLineWidth}
            onChange={(v) => onSettingsChange({ spectrumLineWidth: v })} />

          <ConsoleSlider label="Canvas FPS" value={`${settings.canvasTargetFps} fps`}
            tooltip={settings.showTooltips ? 'Target frame rate. Lower = less CPU/GPU usage.' : undefined}
            min={15} max={60} step={5} sliderValue={settings.canvasTargetFps}
            onChange={(v) => onSettingsChange({ canvasTargetFps: v })} />

          <ConsoleSlider label="Label Size" value={`${settings.graphFontSize} px`}
            tooltip={settings.showTooltips ? 'Font size for RTA/GEQ labels. Increase for distance viewing.' : undefined}
            min={8} max={26} step={1} sliderValue={settings.graphFontSize}
            onChange={(v) => onSettingsChange({ graphFontSize: v })} />

          <LEDToggle
            checked={settings.showThresholdLine}
            onChange={(checked) => onSettingsChange({ showThresholdLine: checked })}
            label="Show Threshold Line"
            tooltip={settings.showTooltips ? 'Display the detection threshold as a dashed line on the RTA spectrum.' : undefined}
          />

          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-muted-foreground font-mono uppercase tracking-wide">Fader Mode</span>
            <PillToggle
              checked={settings.faderMode === 'sensitivity'}
              onChange={(isSensitivity) => onSettingsChange({ faderMode: isSensitivity ? 'sensitivity' : 'gain' })}
              labelOn="Sensitivity"
              labelOff="Input Gain"
              tooltip={settings.showTooltips ? 'Sensitivity adjusts detection threshold. Input Gain adjusts mic input level.' : undefined}
            />
          </div>
        </div>
      </ChannelSection>

      {/* ═══ SECTION: Preferences ═══ */}
      <ChannelSection title="Preferences">
        <div className="space-y-2">
          <LEDToggle
            checked={settings.showTooltips}
            onChange={(checked) => onSettingsChange({ showTooltips: checked })}
            label="Tooltips"
            tooltip="Show help icons with explanations next to controls. This tooltip will disappear when turned off."
          />
          <Button
            variant="outline"
            size="sm"
            className="w-full min-h-11"
            onClick={() => {
              onboardingStorage.clear()
              window.location.reload()
            }}
          >
            <GraduationCap className="h-3.5 w-3.5 mr-2" />
            Replay Onboarding
          </Button>
        </div>
      </ChannelSection>

    </div>
  )
})
