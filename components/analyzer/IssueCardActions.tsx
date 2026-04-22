'use client'

import { memo } from 'react'
import { Check, Copy, ThumbsDown, ThumbsUp, X } from 'lucide-react'

const ACTION_BTN_DESKTOP = 'rounded text-dwa-xs font-mono font-bold tracking-wider transition-colors flex items-center justify-center px-1 cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 h-6 min-w-8'
const ACTION_BTN_MOBILE = 'rounded-sm text-[9px] font-mono font-bold tracking-wider leading-none transition-colors inline-flex items-center justify-center p-0 cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 min-w-0'
const LABEL_BTN_DESKTOP = 'rounded transition-colors flex items-center justify-center cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 h-6 w-6'
const LABEL_BTN_MOBILE = 'rounded-sm transition-colors inline-flex items-center justify-center p-0 cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50'
const COPY_BTN = 'rounded btn-glow flex items-center justify-center cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50'

// FALSE+/CONFIRM are ML training labels, not primary operator actions — they
// recede visually (icon-only, /55 muted tint) and light up on hover/active.
// Full semantic meaning preserved via aria-label + title for a11y.
const FP_ACTIVE = 'text-red-800 bg-red-100 border border-red-300 dark:text-red-400 dark:bg-red-500/20 dark:border-red-500/40'
const FP_INACTIVE = 'text-muted-foreground/55 hover:text-red-800 hover:bg-red-100 dark:hover:text-red-400 dark:hover:bg-red-500/10 border border-transparent'
const CONFIRM_ACTIVE = 'text-[var(--console-amber)] bg-[var(--console-amber)]/15 border border-[var(--console-amber)]/35'
const CONFIRM_INACTIVE = 'text-muted-foreground/55 hover:text-[var(--console-amber)] hover:bg-[var(--console-amber)]/10 border border-transparent'
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
        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
    )
  }

  if (layout === 'desktop') {
    return (
      <div className="flex items-center gap-0 flex-shrink-0 flex-wrap">
        {onFalsePositive ? (
          <button
            onClick={() => onFalsePositive(advisoryId)}
            aria-label={`${isFalsePositive ? 'Unflag' : 'Flag'} ${exactFreqStr} as false positive (training label)`}
            title={isFalsePositive ? 'Unflag as false positive' : 'Mark as false positive — training label'}
            className={`${LABEL_BTN_DESKTOP} ${isFalsePositive ? FP_ACTIVE : FP_INACTIVE}`}
          >
            <ThumbsDown className="w-3 h-3" aria-hidden />
          </button>
        ) : null}
        {onConfirmFeedback ? (
          <button
            onClick={() => onConfirmFeedback(advisoryId)}
            aria-label={`${isConfirmed ? 'Unconfirm' : 'Confirm'} ${exactFreqStr} as real feedback (training label)`}
            title={isConfirmed ? 'Unconfirm feedback' : 'Confirm as real feedback — training label'}
            className={`${LABEL_BTN_DESKTOP} ${isConfirmed ? CONFIRM_ACTIVE : CONFIRM_INACTIVE}`}
          >
            <ThumbsUp className="w-3 h-3" aria-hidden />
          </button>
        ) : null}
        {onDismiss ? (
          <button
            onClick={() => onDismiss(advisoryId)}
            aria-label={`Dismiss ${exactFreqStr}`}
            className="rounded flex items-center justify-center cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 text-muted-foreground/55 hover:text-muted-foreground hover:bg-muted/60 transition-colors w-6 h-6"
          >
            <X className="w-3 h-3" />
          </button>
        ) : null}
        <button
          onClick={onCopy}
          aria-label={`Copy ${exactFreqStr} frequency info`}
          className={`${COPY_BTN} h-6 w-6 ${
            copied
              ? 'text-[var(--console-amber)]'
              : 'text-muted-foreground/55 hover:text-muted-foreground hover:bg-muted/60'
          }`}
        >
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
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
    <div className="flex items-center justify-end gap-0 flex-nowrap leading-none">
      {onFalsePositive ? (
        <button
          onClick={() => onFalsePositive(advisoryId)}
          aria-label={`${isFalsePositive ? 'Unflag' : 'Flag'} ${exactFreqStr} as false positive (training label)`}
          title={isFalsePositive ? 'Unflag as false positive' : 'Mark as false positive — training label'}
          className={`${LABEL_BTN_MOBILE} ${isFalsePositive ? FP_ACTIVE : FP_INACTIVE}`}
        >
          <ThumbsDown className="w-3 h-3" aria-hidden />
        </button>
      ) : null}
      {onConfirmFeedback ? (
        <button
          onClick={() => onConfirmFeedback(advisoryId)}
          aria-label={`${isConfirmed ? 'Unconfirm' : 'Confirm'} ${exactFreqStr} as real feedback (training label)`}
          title={isConfirmed ? 'Unconfirm feedback' : 'Confirm as real feedback — training label'}
          className={`${LABEL_BTN_MOBILE} ${isConfirmed ? CONFIRM_ACTIVE : CONFIRM_INACTIVE}`}
        >
          <ThumbsUp className="w-3 h-3" aria-hidden />
        </button>
      ) : null}
      {onDismiss ? (
        <button
          onClick={() => onDismiss(advisoryId)}
          aria-label={`Dismiss ${exactFreqStr}`}
          className="rounded-sm inline-flex items-center justify-center p-0 cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 text-muted-foreground/55 hover:text-muted-foreground hover:bg-muted/60 transition-colors"
        >
          <X className="w-3 h-3" />
        </button>
      ) : null}
      <button
        onClick={onCopy}
        aria-label={`Copy ${exactFreqStr}`}
        className={`${COPY_BTN} p-0 ${
          copied
            ? 'text-[var(--console-amber)]'
            : 'text-muted-foreground/70 hover:text-muted-foreground hover:bg-muted/60'
        }`}
      >
        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
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
      {copied ? <span className="sr-only" role="status">Frequency info copied</span> : null}
    </div>
  )
})
