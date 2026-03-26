'use client'

import { memo } from 'react'
import { Button } from '@/components/ui/button'
import { GraduationCap } from 'lucide-react'
import { ConsoleSlider } from '@/components/ui/console-slider'
import { LEDToggle } from '@/components/ui/led-toggle'
import { PillToggle } from '@/components/ui/pill-toggle'
import { ChannelSection } from '@/components/ui/channel-section'

import type { DisplayPrefs } from '@/types/settings'
import { onboardingStorage } from '@/lib/storage/dwaStorage'

// ── Legacy compat: still accept TabSettingsProps for transition period ────
import type { TabSettingsProps } from './SettingsShared'

interface DisplayTabProps {
  settings: TabSettingsProps['settings']
  /** Semantic action: update display preferences */
  updateDisplay: (partial: Partial<DisplayPrefs>) => void
}

export const DisplayTab = memo(function DisplayTab({
  settings,
  updateDisplay,
}: DisplayTabProps) {
  const setDisplay = updateDisplay

  return (
    <div className="space-y-1 pt-1">

      {/* ═══ QUICK TOGGLES — always visible ═══ */}
      <div className="grid grid-cols-2 gap-x-4">
        <LEDToggle
          checked={settings.showAlgorithmScores}
          onChange={(checked) => setDisplay({ showAlgorithmScores: checked })}
          label="Algorithm Scores"
          tooltip={settings.showTooltips ? 'Show MSD, Phase, Spectral, Comb, IHR, PTMR, and ML scores on each advisory card for debugging.' : undefined}
        />
        <LEDToggle
          checked={settings.showPeqDetails}
          onChange={(checked) => setDisplay({ showPeqDetails: checked })}
          label="PEQ Details"
          tooltip={settings.showTooltips ? 'Show parametric EQ band numbers (Q, gain, frequency) on advisory cards.' : undefined}
        />
        <LEDToggle
          checked={settings.showFreqZones}
          onChange={(checked) => setDisplay({ showFreqZones: checked })}
          label="Frequency Zones"
          tooltip={settings.showTooltips ? 'Overlay colored bands (Sub, Low Mid, Mid, Presence, Air) on the RTA spectrum.' : undefined}
        />
        <LEDToggle
          checked={settings.showRoomModeLines}
          onChange={(checked) => setDisplay({ showRoomModeLines: checked })}
          label="Room Mode Lines"
          tooltip={settings.showTooltips ? 'Show predicted axial room mode frequencies as faint dashed lines on the RTA. Requires room dimensions in Setup > Room.' : undefined}
        />
        <LEDToggle
          checked={settings.spectrumWarmMode}
          onChange={(checked) => setDisplay({ spectrumWarmMode: checked })}
          label="Warm Spectrum"
          color="amber"
          tooltip={settings.showTooltips ? 'Switch RTA spectrum color to warm amber tones.' : undefined}
        />
        <LEDToggle
          checked={settings.swipeLabeling}
          onChange={(checked) => setDisplay({ swipeLabeling: checked })}
          label="Swipe to Label (Desktop)"
          tooltip={settings.showTooltips ? 'Enable swipe gestures on desktop issue cards: left = dismiss, right = confirm, long-press = false positive. Mobile always uses swipe for space.' : undefined}
        />
        <LEDToggle
          checked={settings.showThresholdLine}
          onChange={(checked) => setDisplay({ showThresholdLine: checked })}
          label="Show Threshold on RTA"
          tooltip={settings.showTooltips ? 'Display the detection threshold line on the spectrum. Drag the line to adjust sensitivity.' : undefined}
        />
      </div>

      {/* Fader mode + max issues — display-owned controls */}
      <div className="space-y-1 pt-1">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-mono uppercase tracking-wide">Fader:</span>
          <PillToggle
            checked={settings.faderMode === 'sensitivity'}
            onChange={(isSensitivity) => setDisplay({ faderMode: isSensitivity ? 'sensitivity' : 'gain' } as Partial<DisplayPrefs>)}
            labelOn="Sensitivity"
            labelOff="Input Gain"
            tooltip={settings.showTooltips ? 'Sensitivity adjusts detection threshold. Input Gain adjusts mic input level.' : undefined}
          />
        </div>
        {/* Max Issues — desktop only; mobile hard-caps to MOBILE_MAX_DISPLAYED_ISSUES */}
        <div className="hidden lg:block">
          <ConsoleSlider label="Max Issues" value={`${settings.maxDisplayedIssues}`}
            tooltip={settings.showTooltips ? 'How many feedback issues display at once (desktop only).' : undefined}
            min={3} max={12} step={1} sliderValue={settings.maxDisplayedIssues}
            onChange={(v) => setDisplay({ maxDisplayedIssues: v })} />
        </div>
      </div>

      {/* ═══ SECTION: Graph ═══ */}
      <ChannelSection title="Graph" defaultOpen>
        <div className="space-y-1">
          <ConsoleSlider label="RTA Range (Min)" value={`${settings.rtaDbMin} dB`}
            tooltip={settings.showTooltips ? 'Lower bound of the visible RTA amplitude range.' : undefined}
            min={-120} max={-60} step={5} sliderValue={settings.rtaDbMin}
            onChange={(v) => setDisplay({ rtaDbMin: v })} />

          <ConsoleSlider label="RTA Range (Max)" value={`${settings.rtaDbMax} dB`}
            tooltip={settings.showTooltips ? 'Upper bound of the visible RTA amplitude range.' : undefined}
            min={-20} max={0} step={5} sliderValue={settings.rtaDbMax}
            onChange={(v) => setDisplay({ rtaDbMax: v })} />

          <ConsoleSlider label="Line Width" value={`${settings.spectrumLineWidth.toFixed(1)} px`}
            tooltip={settings.showTooltips ? 'Spectrum curve thickness. Thinner for detail, thicker for distance.' : undefined}
            min={0.5} max={4} step={0.5} sliderValue={settings.spectrumLineWidth}
            onChange={(v) => setDisplay({ spectrumLineWidth: v })} />

          <ConsoleSlider label="Canvas FPS" value={`${settings.canvasTargetFps} fps`}
            tooltip={settings.showTooltips ? 'Target frame rate. Lower = less CPU/GPU usage.' : undefined}
            min={15} max={60} step={5} sliderValue={settings.canvasTargetFps}
            onChange={(v) => setDisplay({ canvasTargetFps: v })} />

          <ConsoleSlider label="Label Size" value={`${settings.graphFontSize} px`}
            tooltip={settings.showTooltips ? 'Font size for RTA/GEQ labels. Increase for distance viewing.' : undefined}
            min={8} max={26} step={1} sliderValue={settings.graphFontSize}
            onChange={(v) => setDisplay({ graphFontSize: v })} />

          {/* showThresholdLine and faderMode are now in the quick toggles section above */}
        </div>
      </ChannelSection>

      {/* ═══ SECTION: Preferences ═══ */}
      <ChannelSection title="Preferences">
        <div className="space-y-2">
          <LEDToggle
            checked={settings.showTooltips}
            onChange={(checked) => setDisplay({ showTooltips: checked })}
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
