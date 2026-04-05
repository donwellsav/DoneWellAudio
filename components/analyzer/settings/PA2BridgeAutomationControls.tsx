'use client'

import { memo } from 'react'
import { ConsoleSlider } from '@/components/ui/console-slider'
import type { PA2AutoSendMode, PA2Settings } from '@/types/pa2'

interface PA2BridgeAutomationControlsProps {
  effectiveConfidence: number
  onAutoSendChange: (autoSend: PA2AutoSendMode) => void
  onToggleSetting: <K extends 'ringOutAutoSend' | 'panicMuteEnabled' | 'modeSyncEnabled'>(
    key: K,
    value: PA2Settings[K],
  ) => void
  settings: PA2Settings
  updateSettings: (partial: Partial<PA2Settings>) => void
}

export const PA2BridgeAutomationControls = memo(function PA2BridgeAutomationControls({
  effectiveConfidence,
  onAutoSendChange,
  onToggleSetting,
  settings,
  updateSettings,
}: PA2BridgeAutomationControlsProps) {
  return (
    <>
      <div>
        <label className="block text-xs">
          <span className="text-muted-foreground">Auto-send</span>
          <select
            value={settings.autoSend}
            onChange={(event) => onAutoSendChange(event.target.value as PA2AutoSendMode)}
            className="mt-1 block w-full rounded border border-border bg-background px-2 py-1 text-xs"
          >
            <option value="off">Off (manual)</option>
            <option value="both">Both PEQ + GEQ (recommended)</option>
            <option value="peq">PEQ only (surgical notches)</option>
            <option value="geq">GEQ only (broad corrections)</option>
            <option value="hybrid">Hybrid (auto-pick per advisory)</option>
          </select>
        </label>
        <p className="text-[10px] text-muted-foreground/50 mt-0.5">
          How detected feedback is sent to PA2. Both = GEQ for broad + PEQ for surgical. Hybrid = auto-picks per detection.
        </p>
      </div>

      <div>
        <ConsoleSlider
          label="Min confidence"
          value={`${(settings.autoSendMinConfidence * 100).toFixed(0)}%`}
          sliderValue={settings.autoSendMinConfidence * 100}
          onChange={(value: number) => updateSettings({ autoSendMinConfidence: value / 100 })}
          min={20}
          max={100}
          step={5}
          defaultValue={50}
        />
        <p className="text-[10px] text-muted-foreground/50 mt-0.5">
          Only send detections above this confidence level. Higher = fewer false positives, lower = faster response.
          {effectiveConfidence > settings.autoSendMinConfidence ? (
            <span className="text-amber-500/70"> PA2 requires {(effectiveConfidence * 100).toFixed(0)}%.</span>
          ) : null}
        </p>
      </div>

      <div>
        <label className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Ring-out auto-send</span>
          <input
            type="checkbox"
            checked={settings.ringOutAutoSend}
            onChange={(event) => onToggleSetting('ringOutAutoSend', event.target.checked)}
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
            checked={settings.panicMuteEnabled}
            onChange={(event) => onToggleSetting('panicMuteEnabled', event.target.checked)}
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
            checked={settings.modeSyncEnabled}
            onChange={(event) => onToggleSetting('modeSyncEnabled', event.target.checked)}
            className="h-4 w-4 rounded accent-[var(--console-amber)] cursor-pointer"
          />
        </label>
        <p className="text-[10px] text-muted-foreground/50 mt-0.5">When you switch modes (Speech, Worship, etc.), auto-configure PA2 AFS and compressor to match.</p>
      </div>
    </>
  )
})
