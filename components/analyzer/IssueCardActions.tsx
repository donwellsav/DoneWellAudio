'use client'

import { memo } from 'react'
import { Copy, Check, X } from 'lucide-react'
import type { Advisory } from '@/types/advisory'

// ── Types ────────────────────────────────────────────────────────────

export interface IssueCardActionsProps {
  advisoryId: string
  advisory: Advisory
  exactFreqStr: string
  // Labeling callbacks
  onFalsePositive?: (id: string) => void
  isFalsePositive?: boolean
  onConfirmFeedback?: (id: string) => void
  isConfirmed?: boolean
  onDismiss?: (id: string) => void
  // Copy
  onCopy: () => void
  copied: boolean
  // Mixer integration
  onSendToMixer?: (advisory: Advisory) => void
  onSendToPA2?: () => Promise<void>
  pa2Connected?: boolean
  /**
   * Layout mode:
   * - 'desktop': Full action grid (FALSE+, X, CONFIRM, Copy, SEND, PA2)
   * - 'mobile': Touch-sized buttons (FALSE+, X, CONFIRM, Copy)
   * - 'copy-only': Just the copy button (desktop + swipe labeling on)
   */
  layout: 'desktop' | 'mobile' | 'copy-only'
}

/**
 * Unified action buttons for issue cards.
 * Three layout modes preserve the exact sizing, spacing, and aria-labels
 * from the original desktop and mobile branches.
 */
export const IssueCardActions = memo(function IssueCardActions({
  advisoryId, advisory, exactFreqStr,
  onFalsePositive, isFalsePositive,
  onConfirmFeedback, isConfirmed,
  onDismiss, onCopy, copied,
  onSendToMixer, onSendToPA2, pa2Connected,
  layout,
}: IssueCardActionsProps) {

  // ── Copy-only mode (desktop + swipe labeling) ────────────────────
  if (layout === 'copy-only') {
    return (
      <button
        onClick={onCopy}
        aria-label={`Copy ${exactFreqStr} frequency info`}
        className={`rounded btn-glow flex items-center justify-center cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 w-8 h-8 flex-shrink-0 self-center ${
          copied ? 'text-[var(--console-amber)]' : 'text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/60'
        }`}
      >
        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
      </button>
    )
  }

  // ── Desktop mode (full action grid) ──────────────────────────────
  if (layout === 'desktop') {
    return (
      <div className="flex flex-col items-end flex-shrink-0 self-center">
        {/* Row 1: FALSE+ | X */}
        <div className="flex items-center">
          {onFalsePositive && (
            <button
              onClick={() => onFalsePositive(advisoryId)}
              aria-label={`${isFalsePositive ? 'Unflag' : 'Flag'} ${exactFreqStr} as false positive`}
              className={`rounded text-xs font-mono font-bold tracking-wider transition-colors flex items-center justify-center px-1.5 cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 h-8 min-w-[44px] ${
                isFalsePositive ? 'text-red-400 bg-red-500/20 border border-red-500/40' : 'text-muted-foreground/50 hover:text-red-400 hover:bg-red-500/10 border border-transparent'
              }`}
            >
              FALSE+
            </button>
          )}
          {onDismiss && (
            <button
              onClick={() => onDismiss(advisoryId)}
              aria-label={`Dismiss ${exactFreqStr}`}
              className="rounded flex items-center justify-center cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 text-muted-foreground/30 hover:text-muted-foreground hover:bg-muted/60 transition-colors min-h-[44px] min-w-[44px]"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {/* Row 2: CONFIRM | Copy */}
        <div className="flex items-center">
          {onConfirmFeedback && (
            <button
              onClick={() => onConfirmFeedback(advisoryId)}
              aria-label={`${isConfirmed ? 'Unconfirm' : 'Confirm'} ${exactFreqStr} as real feedback`}
              className={`rounded text-xs font-mono font-bold tracking-wider transition-colors flex items-center justify-center px-1.5 cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 h-8 min-w-[44px] ${
                isConfirmed ? 'text-[var(--console-amber)] bg-[var(--console-amber)]/15 border border-[var(--console-amber)]/35' : 'text-muted-foreground/50 hover:text-[var(--console-amber)] hover:bg-[var(--console-amber)]/10 border border-transparent'
              }`}
            >
              CONFIRM
            </button>
          )}
          <button
            onClick={onCopy}
            aria-label={`Copy ${exactFreqStr} frequency info`}
            className={`rounded btn-glow flex items-center justify-center cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 h-8 w-8 ${
              copied ? 'text-[var(--console-amber)]' : 'text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/60'
            }`}
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
        {/* Row 3: Send to Mixer (Companion) / PA2 */}
        {(onSendToMixer || pa2Connected) && (
          <div className="flex items-center gap-1">
            {onSendToMixer && (
              <button
                onClick={() => onSendToMixer(advisory)}
                aria-label={`Send ${exactFreqStr} EQ recommendation to mixer via Companion`}
                className="rounded text-xs font-mono font-bold tracking-wider transition-colors flex items-center justify-center px-1.5 cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 h-8 min-w-[44px] text-blue-400/60 hover:text-blue-400 hover:bg-blue-500/10 border border-transparent"
              >
                SEND
              </button>
            )}
            {pa2Connected && onSendToPA2 && (
              <button
                onClick={() => onSendToPA2()}
                aria-label={`Send ${exactFreqStr} to PA2 via Companion`}
                className="rounded text-xs font-mono font-bold tracking-wider transition-colors flex items-center justify-center px-1.5 cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 h-8 min-w-[44px] text-cyan-400/60 hover:text-cyan-400 hover:bg-cyan-500/10 border border-transparent"
              >
                PA2
              </button>
            )}
          </div>
        )}
        {copied && <span className="sr-only" role="status">Frequency info copied</span>}
      </div>
    )
  }

  // ── Mobile mode (touch-sized buttons) ────────────────────────────
  return (
    <div className="flex flex-col items-end">
      {/* Row 1: FALSE+ | X */}
      <div className="flex items-center">
        {onFalsePositive && (
          <button
            onClick={() => onFalsePositive(advisoryId)}
            aria-label={`${isFalsePositive ? 'Unflag' : 'Flag'} false positive`}
            className={`rounded text-xs font-mono font-bold tracking-wider transition-colors flex items-center justify-center px-2 cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 h-8 min-w-[44px] ${
              isFalsePositive ? 'text-red-400 bg-red-500/20 border border-red-500/40' : 'text-muted-foreground/50 hover:text-red-400 hover:bg-red-500/10 border border-transparent'
            }`}
          >
            FALSE+
          </button>
        )}
        {onDismiss && (
          <button
            onClick={() => onDismiss(advisoryId)}
            aria-label={`Dismiss ${exactFreqStr}`}
            className="rounded flex items-center justify-center cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 text-muted-foreground/30 hover:text-muted-foreground hover:bg-muted/60 transition-colors min-h-[44px] min-w-[44px]"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      {/* Row 2: CONFIRM | Copy */}
      <div className="flex items-center">
        {onConfirmFeedback && (
          <button
            onClick={() => onConfirmFeedback(advisoryId)}
            aria-label={`${isConfirmed ? 'Unconfirm' : 'Confirm'} feedback`}
            className={`rounded text-xs font-mono font-bold tracking-wider transition-colors flex items-center justify-center px-2 cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 h-8 min-w-[44px] ${
              isConfirmed ? 'text-[var(--console-amber)] bg-[var(--console-amber)]/15 border border-[var(--console-amber)]/35' : 'text-muted-foreground/50 hover:text-[var(--console-amber)] hover:bg-[var(--console-amber)]/10 border border-transparent'
            }`}
          >
            CONFIRM
          </button>
        )}
        <button
          onClick={onCopy}
          aria-label={`Copy ${exactFreqStr}`}
          className={`rounded btn-glow flex items-center justify-center cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 w-9 h-8 ${
            copied ? 'text-[var(--console-amber)]' : 'text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/60'
          }`}
        >
          {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
        </button>
      </div>
      {copied && <span className="sr-only" role="status">Frequency info copied</span>}
    </div>
  )
})
