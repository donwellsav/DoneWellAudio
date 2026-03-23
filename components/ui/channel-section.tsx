'use client'

import { memo } from 'react'
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion'
import { cn } from '@/lib/utils'

interface ChannelSectionProps {
  title: string
  /** Optional badge rendered after the title (e.g. "Expert" badge) */
  badge?: React.ReactNode
  /** If true, section is collapsible via accordion. Default: true */
  collapsible?: boolean
  /** If true, section starts expanded. Default: false */
  defaultOpen?: boolean
  children: React.ReactNode
  className?: string
}

/**
 * Pro-audio channel-strip section wrapper.
 * Uses `.panel-groove` top border and `.section-label` title.
 * Wraps shadcn Accordion for collapsible behavior.
 */
export const ChannelSection = memo(function ChannelSection({
  title,
  badge,
  collapsible = true,
  defaultOpen = false,
  children,
  className,
}: ChannelSectionProps) {
  if (!collapsible) {
    return (
      <div className={cn('channel-section-static', className)}>
        <div className="flex items-center gap-2 min-h-11 py-2 panel-groove">
          <span className="section-label">{title}</span>
          {badge}
        </div>
        <div className="py-2">{children}</div>
      </div>
    )
  }

  return (
    <Accordion
      type="multiple"
      defaultValue={defaultOpen ? [title] : []}
      className={className}
    >
      <AccordionItem value={title} className="border-b-0">
        <AccordionTrigger className="min-h-11 py-2 panel-groove hover:no-underline">
          <span className="flex items-center gap-2">
            <span className="section-label">{title}</span>
            {badge}
          </span>
        </AccordionTrigger>
        <AccordionContent className="pb-2 pt-0">
          {children}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
})
