'use client'

import { memo } from 'react'
import type { PA2AutoSendMode } from '@/types/pa2'
import type { PA2StatusSummary } from '@/components/analyzer/settings/pa2BridgeSectionUtils'

interface PA2BridgeStatusProps {
  autoSend: PA2AutoSendMode
  autoSendSummary: { toneClassName: string; text: string } | null
  baseUrl: string
  enabled: boolean
  status: string
  statusSummary: PA2StatusSummary
  onTestNotch: () => Promise<void>
}

export const PA2BridgeStatus = memo(function PA2BridgeStatus({
  autoSend,
  autoSendSummary,
  baseUrl,
  enabled,
  status,
  statusSummary,
  onTestNotch,
}: PA2BridgeStatusProps) {
  if (!enabled || !baseUrl) {
    return null
  }

  return (
    <>
      <div className="space-y-1.5">
        <div className="flex items-center gap-2 text-xs">
          <div className={`h-2 w-2 rounded-full ${statusSummary.indicatorClassName}`} />
          <span className="text-muted-foreground">{statusSummary.message}</span>
        </div>
        {statusSummary.helperText ? (
          <p className="text-[10px] text-amber-500/80">{statusSummary.helperText}</p>
        ) : null}
        {statusSummary.showMixedContentLink ? (
          <a
            href="http://localhost:3000"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-primary/20 text-primary text-[10px] font-mono font-bold hover:bg-primary/30 transition-colors"
          >
            Open localhost:3000 (PA2 Bridge works here)
          </a>
        ) : null}
        {status === 'connected' && autoSend !== 'off' && autoSendSummary ? (
          <div className="text-[10px]">
            <span className={autoSendSummary.toneClassName}>{autoSendSummary.text}</span>
          </div>
        ) : null}
      </div>

      {status === 'connected' ? (
        <button
          type="button"
          onClick={() => {
            void onTestNotch()
          }}
          className="w-full min-h-9 px-2 rounded bg-primary/20 text-primary text-xs font-mono font-bold hover:bg-primary/30 transition-colors cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          Test: Send 2.5kHz notch to PA2
        </button>
      ) : null}
    </>
  )
})
