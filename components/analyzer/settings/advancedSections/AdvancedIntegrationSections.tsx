'use client'

import { memo } from 'react'
import { Database, Shield } from 'lucide-react'
import { ConsoleSlider } from '@/components/ui/console-slider'
import { LEDToggle } from '@/components/ui/led-toggle'
import { PillToggle } from '@/components/ui/pill-toggle'
import { Section } from '@/components/analyzer/settings/SettingsShared'
import { useCompanion } from '@/hooks/useCompanion'
import { PRIVACY_SUMMARY, type AdvancedDataCollectionSectionProps } from './shared'

export const AdvancedDataCollectionSection = memo(function AdvancedDataCollectionSection({
  consentStatus,
  isCollecting,
  showTooltips,
  handleCollectionToggle,
}: AdvancedDataCollectionSectionProps) {
  return (
    <Section
      title="Data Collection"
      showTooltip={showTooltips}
      tooltip="Share anonymous frequency data to improve feedback detection. No audio, device IDs, or personal data is collected."
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4" style={{ color: 'var(--console-green)' }} />
            <span className="text-sm text-muted-foreground font-mono tracking-wide">Share spectral data</span>
          </div>
          <PillToggle
            checked={consentStatus === 'accepted'}
            onChange={handleCollectionToggle}
            label="spectral data sharing"
          />
        </div>
        {isCollecting ? (
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs text-emerald-500 font-mono">Collecting</span>
          </div>
        ) : null}
        <div className="space-y-1.5">
          {PRIVACY_SUMMARY.map((point) => (
            <div key={point} className="flex items-start gap-1.5">
              <Shield className="w-3 h-3 flex-shrink-0 mt-0.5 text-emerald-500/60" />
              <span className="text-xs text-muted-foreground/70 font-mono leading-snug">{point}</span>
            </div>
          ))}
        </div>
      </div>
    </Section>
  )
})

export const AdvancedCompanionSection = memo(function AdvancedCompanionSection({
  showTooltips,
}: {
  showTooltips: boolean
}) {
  const { settings, updateSettings, connected, lastError, checkConnection, regenerateCode } = useCompanion()

  return (
    <Section
      title="Companion"
      fullWidth
      showTooltip={showTooltips}
      tooltip="Send EQ recommendations to Bitfocus Companion for hardware mixer control. Companion routes commands to your mixer module (X32, Yamaha, dbx, and more)."
    >
      <div className="space-y-1.5">
        <LEDToggle
          checked={settings.enabled}
          onChange={(checked) => updateSettings({ enabled: checked })}
          label="Enable Companion Bridge"
          tooltip={showTooltips ? 'Send detected feedback EQ recommendations to Bitfocus Companion.' : undefined}
        />

        {settings.enabled ? (
          <>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground font-mono">Pairing Code</label>
              <div className="flex items-center gap-2">
                <div className="flex-1 rounded bg-muted border border-border px-3 py-1.5 text-sm font-mono font-bold tracking-[0.2em] text-center select-all">
                  {settings.pairingCode}
                </div>
                <button
                  type="button"
                  onClick={regenerateCode}
                  className="text-xs font-mono text-muted-foreground hover:text-foreground cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 rounded px-1.5 py-1 border border-border"
                >
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
              <button
                type="button"
                onClick={() => checkConnection()}
                className="ml-auto text-xs font-mono text-muted-foreground hover:text-foreground cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 rounded px-1.5 py-0.5 border border-border"
              >
                Test
              </button>
            </div>

            <ConsoleSlider
              label="Min Confidence"
              value={`${Math.round(settings.minConfidence * 100)}%`}
              tooltip={showTooltips ? 'Only send advisories above this confidence threshold to Companion.' : undefined}
              min={0.3}
              max={0.95}
              step={0.05}
              sliderValue={settings.minConfidence}
              onChange={(value) => updateSettings({ minConfidence: value })}
              defaultValue={0.5}
            />

            <LEDToggle
              checked={settings.autoSend}
              onChange={(checked) => updateSettings({ autoSend: checked })}
              label="Auto-Send Advisories"
              tooltip={showTooltips ? 'Automatically send every advisory to Companion. When off, use the Send to Mixer button on each card.' : undefined}
            />

            <LEDToggle
              checked={settings.ringOutAutoSend}
              onChange={(checked) => updateSettings({ ringOutAutoSend: checked })}
              label="Ring-Out Auto-Send"
              tooltip={showTooltips ? 'Automatically send each ring-out step to Companion when in ring-out mode.' : undefined}
            />
          </>
        ) : null}
      </div>
    </Section>
  )
})
