'use client'

import { memo } from 'react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { PillToggle } from '@/components/ui/pill-toggle'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { GraduationCap } from 'lucide-react'
import { Section, SettingsGrid, type TabSettingsProps } from './SettingsShared'
import { onboardingStorage } from '@/lib/storage/ktrStorage'

export const DisplayTab = memo(function DisplayTab({
  settings,
  onSettingsChange,
}: TabSettingsProps) {
  return (
    <div className="mt-4">
      <SettingsGrid>

      <Section
        title="EQ Recommendation Style"
        showTooltip={settings.showTooltips}
        tooltip="Surgical: narrow Q (8-16), deep cuts. Heavy: wider Q (2-4), moderate cuts."
      >
        <Select
          value={settings.eqPreset}
          onValueChange={(v) => onSettingsChange({ eqPreset: v as 'surgical' | 'heavy' })}
        >
          <SelectTrigger className="h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="surgical">Surgical - Narrow Q, Deep Cuts</SelectItem>
            <SelectItem value="heavy">Heavy - Wide Q, Moderate Cuts</SelectItem>
          </SelectContent>
        </Select>
      </Section>

      <Section
        title="Max Issues Shown"
        showTooltip={settings.showTooltips}
        tooltip="How many feedback issues display at once. 6 for focused work, 12 for full overview."
      >
        <div className="space-y-1">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground font-mono tracking-wide">Limit</span>
            <span className="text-sm font-mono tabular-nums">{settings.maxDisplayedIssues}</span>
          </div>
          <Slider
            value={[settings.maxDisplayedIssues]}
            onValueChange={([v]) => onSettingsChange({ maxDisplayedIssues: v })}
            min={3} max={12} step={1}
          />
          <div className="flex justify-between text-sm text-muted-foreground font-mono">
            <span>Focused</span><span>All Issues</span>
          </div>
        </div>
      </Section>

      <Section
        title="RTA dB Range"
        showTooltip={settings.showTooltips}
        tooltip="Adjusts the visible amplitude range on the RTA graph. Narrower range shows more detail in the visible portion."
      >
        <div className="space-y-3">
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground font-mono tracking-wide">Min</span>
              <span className="text-sm font-mono tabular-nums">{settings.rtaDbMin}dB</span>
            </div>
            <Slider
              value={[settings.rtaDbMin]}
              onValueChange={([v]) => onSettingsChange({ rtaDbMin: v })}
              min={-120} max={-60} step={5}
            />
          </div>
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground font-mono tracking-wide">Max</span>
              <span className="text-sm font-mono tabular-nums">{settings.rtaDbMax}dB</span>
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
            <span className="text-sm text-muted-foreground font-mono tracking-wide">Width</span>
            <span className="text-sm font-mono tabular-nums">{settings.spectrumLineWidth.toFixed(1)}px</span>
          </div>
          <Slider
            value={[settings.spectrumLineWidth]}
            onValueChange={([v]) => onSettingsChange({ spectrumLineWidth: v })}
            min={0.5} max={4} step={0.5}
          />
          <div className="flex justify-between text-sm text-muted-foreground font-mono">
            <span>Thin</span><span>Thick</span>
          </div>
        </div>
      </Section>

      <Section
        title="Canvas FPS"
        showTooltip={settings.showTooltips}
        tooltip="Target frame rate for spectrum display. Lower values reduce CPU/GPU usage and help with stuttering on older devices."
      >
        <div className="space-y-1">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground font-mono tracking-wide">FPS</span>
            <span className="text-sm font-mono tabular-nums">{settings.canvasTargetFps}</span>
          </div>
          <Slider
            value={[settings.canvasTargetFps]}
            onValueChange={([v]) => onSettingsChange({ canvasTargetFps: v })}
            min={15} max={60} step={5}
          />
          <div className="flex justify-between text-sm text-muted-foreground font-mono">
            <span>Battery saver</span><span>Smooth</span>
          </div>
        </div>
      </Section>

      <Section
        title="Graph Label Size"
        showTooltip={settings.showTooltips}
        tooltip="Font size for labels inside RTA and GEQ graphs. Increase for high-DPI displays or distance viewing."
      >
        <div className="space-y-1">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground font-mono tracking-wide">Size</span>
            <span className="text-sm font-mono tabular-nums">{settings.graphFontSize}px</span>
          </div>
          <Slider
            value={[settings.graphFontSize]}
            onValueChange={([v]) => onSettingsChange({ graphFontSize: v })}
            min={8} max={26} step={1}
          />
          <div className="flex justify-between text-sm text-muted-foreground font-mono">
            <span>Small</span><span>Large</span>
          </div>
        </div>
      </Section>

      <Section
        title="Tooltips"
        showTooltip={settings.showTooltips}
        tooltip="Show contextual help on controls. Disable once you know the system."
      >
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground font-mono tracking-wide">Show help tooltips</span>
          <PillToggle
            checked={settings.showTooltips}
            onChange={(checked) => onSettingsChange({ showTooltips: checked })}
          />
        </div>
      </Section>

      <Section
        title="Swipe to Label"
        showTooltip={settings.showTooltips}
        tooltip="Swipe issue cards left to flag as FALSE+, right to CONFIRM. Hides the label buttons for a cleaner card layout. Works with touch input on any screen size."
      >
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground font-mono tracking-wide">Swipe gestures</span>
          <PillToggle
            checked={settings.swipeLabeling}
            onChange={(checked) => onSettingsChange({ swipeLabeling: checked })}
          />
        </div>
      </Section>

      <Section
        title="Onboarding"
        showTooltip={settings.showTooltips}
        tooltip="Replay the first-run walkthrough that explains the core workflow."
      >
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => {
            onboardingStorage.clear()
            window.location.reload()
          }}
        >
          <GraduationCap className="h-3.5 w-3.5 mr-2" />
          Replay Onboarding
        </Button>
      </Section>

      </SettingsGrid>
    </div>
  )
})
