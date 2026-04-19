'use client'

import { memo } from 'react'
import { Check, Copy, X } from 'lucide-react'

const ACTION_BTN_DESKTOP = 'rounded text-[10px] font-mono font-bold tracking-wider transition-colors flex items-center justify-center px-1 cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 h-7 min-w-[36px]'
const ACTION_BTN_MOBILE = 'rounded text-xs font-mono font-bold tracking-wider transition-colors flex items-center justify-center px-2 cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 h-11 min-w-[44px]'
const COPY_BTN = 'rounded btn-glow flex items-center justify-center cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50'

// Per-state class strings with explicit dark:/light theme variants.
// Light-theme variants use *-700/800 hues for WCAG AA contrast on light canvas;
// dark-theme variants preserve the previous tonal tailwind shades behind dark:.
const FP_ACTIVE = 'text-red-800 bg-red-100 border border-red-300 dark:text-red-400 dark:bg-red-500/20 dark:border-red-500/40'
const FP_INACTIVE = 'text-muted-foreground/70 hover:text-red-800 hover:bg-red-100 dark:hover:text-red-400 dark:hover:bg-red-500/10 border border-transparent'
const SEND_DESKTOP = 'text-blue-700/80 hover:text-blue-800 hover:bg-blue-100 dark:text-blue-400/75 dark:hover:text-blue-400 dark:hover:bg-blue-500/10 border border-transparent'
const SEND_MOBILE = 'text-blue-700/85 hover:text-blue-800 hover:bg-blue-100 dark:text-blue-400/80 dark:hover:text-blue-400 dark:hover:bg-blue-500/10 border border-transparent'

export interface IssueCardActionsProps {
  advisoryId: string
  exactFreqStr: string
  onFalsePositive?: (id: string) => void
  isFalsePositive?: boolean
  onConfirmFeedback?: (id: string) => void
  isConfirmed?: boolean
  onDismiss?: (id: string) => void
  onCopy: () => void
  copied: boolean
  onSendToMixer?: () => void
  layout: 'desktop' | 'mobile' | 'copy-only'
}

export const IssueCardActions = memo(function IssueCardActions({
  advisoryId,
  exactFreqStr,
  onFalsePositive,
  isFalsePositive,
  onConfirmFeedback,
  isConfirmed,
  onDismiss,
  onCopy,
  copied,
  onSendToMixer,
  layout,
}: IssueCardActionsProps) {
  const actionButtonClass = layout === 'mobile' ? ACTION_BTN_MOBILE : ACTION_BTN_DESKTOP

  if (layout === 'copy-only') {
    return (
      <button
        onClick={onCopy}
        aria-label={`Copy ${exactFreqStr} frequency info`}
        className={`${COPY_BTN} size-11 flex-shrink-0 self-center ${
          copied
            ? 'text-[var(--console-amber)]'
            : 'text-muted-foreground/70 hover:text-muted-foreground hover:bg-muted/60'
        }`}
      >
        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
      </button>
    )
  }

  if (layout === 'desktop') {
    return (
      <div className="flex items-center gap-0.5 flex-shrink-0 flex-wrap">
        {onFalsePositive ? (
          <button
            onClick={() => onFalsePositive(advisoryId)}
            aria-label={`${isFalsePositive ? 'Unflag' : 'Flag'} ${exactFreqStr} as false positive`}
            className={`${actionButtonClass} ${isFalsePositive ? FP_ACTIVE : FP_INACTIVE}`}
          >
            FALSE+
          </button>
        ) : null}
        {onConfirmFeedback ? (
          <button
            onClick={() => onConfirmFeedback(advisoryId)}
            aria-label={`${isConfirmed ? 'Unconfirm' : 'Confirm'} ${exactFreqStr} as real feedback`}
            className={`${actionButtonClass} ${
              isConfirmed
                ? 'text-[var(--console-amber)] bg-[var(--console-amber)]/15 border border-[var(--console-amber)]/35'
                : 'text-muted-foreground/70 hover:text-[var(--console-amber)] hover:bg-[var(--console-amber)]/10 border border-transparent'
            }`}
          >
            <span className="flex flex-col items-center leading-[1.1]">
              <span>CONFIRM</span>
              <span className="text-[7px] tracking-wide opacity-60">FEEDBACK</span>
            </span>
          </button>
        ) : null}
        {onDismiss ? (
          <button
            onClick={() => onDismiss(advisoryId)}
            aria-label={`Dismiss ${exactFreqStr}`}
            className="rounded flex items-center justify-center cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 text-muted-foreground/55 hover:text-muted-foreground hover:bg-muted/60 transition-colors w-7 h-7"
          >
            <X className="w-3 h-3" />
          </button>
        ) : null}
        <button
          onClick={onCopy}
          aria-label={`Copy ${exactFreqStr} frequency info`}
          aria-pressed={copied}
          className={`${COPY_BTN} h-7 w-7 ${
            copied
              ? 'text-[var(--console-amber)]'
              : 'text-muted-foreground/55 hover:text-muted-foreground hover:bg-muted/60'
          }`}
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
        {onSendToMixer ? (
          <button
            onClick={onSendToMixer}
            aria-label={`Send ${exactFreqStr} EQ recommendation to mixer via Companion`}
            className={`${actionButtonClass} ${SEND_DESKTOP}`}
          >
            SEND
          </button>
        ) : null}
        {copied ? <span className="sr-only" role="status">Frequency info copied</span> : null}
      </div>
    )
  }

  return (
    <div className="flex flex-col items-end">
      <div className="flex items-center">
        {onFalsePositive ? (
          <button
            onClick={() => onFalsePositive(advisoryId)}
            aria-label={`${isFalsePositive ? 'Unflag' : 'Flag'} ${exactFreqStr} as false positive`}
            className={`${actionButtonClass} ${isFalsePositive ? FP_ACTIVE : FP_INACTIVE}`}
          >
            FALSE+
          </button>
        ) : null}
        {onDismiss ? (
          <button
            onClick={() => onDismiss(advisoryId)}
            aria-label={`Dismiss ${exactFreqStr}`}
            className="rounded flex items-center justify-center cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 text-muted-foreground/55 hover:text-muted-foreground hover:bg-muted/60 transition-colors min-h-[44px] min-w-[44px]"
          >
            <X className="w-4 h-4" />
          </button>
        ) : null}
      </div>
      <div className="flex items-center">
        {onConfirmFeedback ? (
          <button
            onClick={() => onConfirmFeedback(advisoryId)}
            aria-label={`${isConfirmed ? 'Unconfirm' : 'Confirm'} feedback`}
            className={`${actionButtonClass} ${
              isConfirmed
                ? 'text-[var(--console-amber)] bg-[var(--console-amber)]/15 border border-[var(--console-amber)]/35'
                : 'text-muted-foreground/70 hover:text-[var(--console-amber)] hover:bg-[var(--console-amber)]/10 border border-transparent'
            }`}
          >
            <span className="flex flex-col items-center leading-[1.1]">
              <span>CONFIRM</span>
              <span className="text-[7px] tracking-wide opacity-60">FEEDBACK</span>
            </span>
          </button>
        ) : null}
        <button
          onClick={onCopy}
          aria-label={`Copy ${exactFreqStr}`}
          aria-pressed={copied}
          className={`${COPY_BTN} min-w-[44px] min-h-[44px] ${
            copied
              ? 'text-[var(--console-amber)]'
              : 'text-muted-foreground/70 hover:text-muted-foreground hover:bg-muted/60'
          }`}
        >
          {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
        </button>
        {onSendToMixer ? (
          <button
            onClick={onSendToMixer}
            aria-label={`Send ${exactFreqStr} EQ recommendation to mixer via Companion`}
            className={`${actionButtonClass} ${SEND_MOBILE}`}
          >
            SEND
          </button>
        ) : null}
      </div>
      {copied ? <span className="sr-only" role="status">Frequency info copied</span> : null}
    </div>
  )
})
