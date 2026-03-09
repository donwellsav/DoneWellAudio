'use client'

import { memo, useState } from 'react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { HelpCircle, ChevronDown } from 'lucide-react'
import type { DetectorSettings } from '@/types/advisory'

// ── Shared prop types ────────────────────────────────────────────────────────

export interface TabSettingsProps {
  settings: DetectorSettings
  onSettingsChange: (settings: Partial<DetectorSettings>) => void
}

// ── Section (flat, uniform) ──────────────────────────────────────────────────

export const Section = memo(function Section({ title, tooltip, showTooltip = true, children }: {
  title: string
  tooltip?: string
  showTooltip?: boolean
  children: React.ReactNode
}) {
  return (
    <TooltipProvider delayDuration={300}>
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <h3 className="text-sm font-medium text-foreground">{title}</h3>
          {tooltip && showTooltip && (
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-[220px] text-xs">
                {tooltip}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
        {children}
      </div>
    </TooltipProvider>
  )
})

// ── SectionGroup (collapsible, wraps multiple Sections) ──────────────────────

export const SectionGroup = memo(function SectionGroup({ title, defaultOpen = true, children }: {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 w-full py-1.5 text-xs font-semibold font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors">
        <span className="flex-1 text-left">{title}</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? '' : '-rotate-90'}`} />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-4 pt-2">
        {children}
      </CollapsibleContent>
    </Collapsible>
  )
})
