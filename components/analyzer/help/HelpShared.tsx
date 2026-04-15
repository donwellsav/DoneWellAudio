'use client'

import { memo, type ReactNode } from 'react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { ChangeType } from '@/lib/changelog'

type HelpColor = 'amber' | 'blue' | 'green'

const COLOR_VAR: Record<HelpColor, string> = {
  amber: 'var(--console-amber)',
  blue: 'var(--console-blue)',
  green: 'var(--console-green)',
}

const BORDER_ALPHA: Record<HelpColor, string> = {
  amber: 'rgba(var(--tint-r),var(--tint-g),var(--tint-b),0.45)',
  blue: 'rgba(75,146,255,0.45)',
  green: 'rgba(74,222,128,0.45)',
}

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
    <Card className="gap-0 rounded border bg-card/80 py-0 shadow-none" style={borderStyle}>
      <CardHeader className="px-3 pt-3 pb-0">
        <CardTitle className="section-label" style={titleStyle ?? { color: 'var(--console-blue)' }}>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pt-2 pb-3 text-sm leading-relaxed text-muted-foreground">
        {children}
      </CardContent>
    </Card>
  )
})

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
        <AccordionTrigger className="py-1.5 px-2 panel-groove hover:no-underline hover:bg-[rgba(var(--tint-r),var(--tint-g),var(--tint-b),0.03)] data-[state=open]:border-l-2 data-[state=open]:border-[rgba(var(--tint-r),var(--tint-g),var(--tint-b),0.50)] data-[state=open]:pl-[calc(0.5rem-2px)] data-[state=open]:bg-[rgba(var(--tint-r),var(--tint-g),var(--tint-b),0.04)]">
          <span className="section-label text-[var(--console-blue)]">{title}</span>
        </AccordionTrigger>
        <AccordionContent className="pb-0 pt-3">
          {children}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
})

export const TYPE_STYLES: Record<ChangeType, { label: string; className: string }> = {
  feat: { label: 'Feature', className: 'border-[rgba(74,222,128,0.35)] bg-card/70 text-[var(--console-green)]' },
  fix: { label: 'Fix', className: 'border-[rgba(var(--tint-r),var(--tint-g),var(--tint-b),0.35)] bg-card/70 text-[var(--console-amber)]' },
  perf: { label: 'Perf', className: 'border-[rgba(75,146,255,0.35)] bg-card/70 text-[var(--console-blue)]' },
  refactor: { label: 'Refactor', className: 'border-border/50 bg-card/70 text-foreground' },
  ui: { label: 'UI', className: 'border-border/50 bg-muted/50 text-foreground' },
}

export const HelpTypeBadge = memo(function HelpTypeBadge({
  type,
}: {
  type: ChangeType
}) {
  const style = TYPE_STYLES[type]

  return (
    <Badge
      variant="outline"
      className={`mt-0.5 shrink-0 px-1.5 py-0.5 font-mono text-[10px] font-medium leading-none ${style.className}`}
    >
      {style.label}
    </Badge>
  )
})
