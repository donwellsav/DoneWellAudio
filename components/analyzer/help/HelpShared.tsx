'use client'

import { memo, type ReactNode } from 'react'
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion'
import type { ChangeType } from '@/lib/changelog'

// ── Color vocabulary (mirrors controls sidecar) ───────────────────────────────
// amber = detection  |  blue = scope/range  |  green = system/processing

type HelpColor = 'amber' | 'blue' | 'green'

const COLOR_VAR: Record<HelpColor, string> = {
  amber: 'var(--console-amber)',
  blue:  'var(--console-blue)',
  green: 'var(--console-green)',
}

const BORDER_ALPHA: Record<HelpColor, string> = {
  amber: 'rgba(var(--tint-r),var(--tint-g),var(--tint-b),0.45)',
  blue:  'rgba(75,146,255,0.45)',
  green: 'rgba(74,222,128,0.45)',
}

// ── HelpSection ───────────────────────────────────────────────────────────────
// Card with optional operator-color title + left-border accent.

export const HelpSection = memo(function HelpSection({
  title,
  color,
  children,
}: {
  title: string
  color?: HelpColor
  children: ReactNode
}) {
  const titleStyle = color ? { color: COLOR_VAR[color] } : undefined
  const borderStyle = color
    ? { borderLeftColor: BORDER_ALPHA[color], borderLeftWidth: '2px' }
    : undefined

  return (
    <div className="bg-card/80 rounded border p-3" style={borderStyle}>
      <h3 className="section-label mb-2" style={titleStyle ?? { color: 'var(--console-blue)' }}>
        {title}
      </h3>
      <div className="text-sm text-muted-foreground leading-relaxed">{children}</div>
    </div>
  )
})

// ── HelpGroup ─────────────────────────────────────────────────────────────────
// Collapsible accordion group header — panel-groove style matching the controls
// sidecar: amber glow on groove, left-bar accent when open.

export const HelpGroup = memo(function HelpGroup({
  title,
  defaultOpen = true,
  children,
}: {
  title: string
  defaultOpen?: boolean
  children: ReactNode
}) {
  return (
    <Accordion
      type="multiple"
      defaultValue={defaultOpen ? [title] : []}
    >
      <AccordionItem value={title} className="border-b-0">
        <AccordionTrigger className="py-1.5 px-2 panel-groove hover:no-underline hover:bg-[rgba(var(--tint-r),var(--tint-g),var(--tint-b),0.03)] data-[state=open]:shadow-[inset_2px_0_0_0_rgba(var(--tint-r),var(--tint-g),var(--tint-b),0.50)] data-[state=open]:bg-[rgba(var(--tint-r),var(--tint-g),var(--tint-b),0.04)]">
          <span className="section-label text-[var(--console-blue)]">{title}</span>
        </AccordionTrigger>
        <AccordionContent className="pb-0 pt-3">
          {children}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
})

// ── Changelog type badge styles ────────────────────────────────────────────────

export const TYPE_STYLES: Record<ChangeType, { label: string; className: string }> = {
  feat:     { label: 'Feature',  className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-400' },
  fix:      { label: 'Fix',      className: 'bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-400' },
  perf:     { label: 'Perf',     className: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-500/15 dark:text-cyan-400' },
  refactor: { label: 'Refactor', className: 'bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-400' },
  ui:       { label: 'UI',       className: 'bg-pink-100 text-pink-800 dark:bg-pink-500/15 dark:text-pink-400' },
}
