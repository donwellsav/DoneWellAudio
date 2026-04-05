'use client'

import { memo } from 'react'
import { Input } from '@/components/ui/input'
import type { PA2Settings } from '@/types/pa2'

interface PA2BridgeConnectionFieldsProps {
  settings: PA2Settings
  onEnabledChange: (enabled: boolean) => void
  onCompanionIpChange: (value: string) => void
  onCompanionPortChange: (value: string) => void
  onInstanceLabelChange: (value: string) => void
  onApplyQuickTarget: (companionIp: string) => void
}

export const PA2BridgeConnectionFields = memo(function PA2BridgeConnectionFields({
  settings,
  onEnabledChange,
  onCompanionIpChange,
  onCompanionPortChange,
  onInstanceLabelChange,
  onApplyQuickTarget,
}: PA2BridgeConnectionFieldsProps) {
  return (
    <>
      <label className="flex items-center justify-between text-xs">
        <span>PA2 Bridge</span>
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={(event) => onEnabledChange(event.target.checked)}
          className="h-4 w-4 rounded accent-[var(--console-amber)] cursor-pointer"
        />
      </label>

      <label className="block text-xs">
        <span className="text-muted-foreground">Companion IP Address</span>
        <input
          type="text"
          value={settings.companionIp}
          onChange={(event) => onCompanionIpChange(event.target.value)}
          placeholder="192.168.0.100"
          className="mt-1 block w-full rounded border border-border bg-background px-2 py-1 text-xs font-mono"
        />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="block text-xs">
          <span className="text-muted-foreground">Port</span>
          <Input
            type="number"
            value={settings.companionPort}
            onChange={(event) => onCompanionPortChange(event.target.value)}
            min={1}
            max={65535}
            className="mt-1 block w-full rounded border border-border bg-background px-2 py-1 text-xs font-mono h-auto"
          />
        </label>
        <label className="block text-xs">
          <span className="text-muted-foreground">Instance Label</span>
          <input
            type="text"
            value={settings.instanceLabel}
            onChange={(event) => onInstanceLabelChange(event.target.value)}
            placeholder="PA2"
            className="mt-1 block w-full rounded border border-border bg-background px-2 py-1 text-xs font-mono"
          />
        </label>
      </div>

      {settings.companionIp ? (
        <div className="text-[10px] text-muted-foreground/60 font-mono bg-muted/50 rounded px-2 py-1 break-all">
          {settings.baseUrl || 'Enter IP above'}
        </div>
      ) : null}

      <div className="text-[10px] text-muted-foreground/60 space-y-1">
        <p>Find port in Companion: Settings -&gt; HTTP API (must be enabled). Default: 8000.</p>
        <div className="flex gap-1.5 pt-0.5 flex-wrap">
          <button
            type="button"
            onClick={() => onApplyQuickTarget('192.168.0.108')}
            className="px-1.5 py-0.5 rounded bg-muted hover:bg-muted/80 text-[10px] font-mono cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            192.168.0.108
          </button>
          <button
            type="button"
            onClick={() => onApplyQuickTarget('localhost')}
            className="px-1.5 py-0.5 rounded bg-muted hover:bg-muted/80 text-[10px] font-mono cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            localhost
          </button>
        </div>
      </div>
    </>
  )
})
