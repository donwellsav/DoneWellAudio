'use client'

import { memo } from 'react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { HelpCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DetectorSettings } from '@/types/advisory'

// ── Shared prop types ────────────────────────────────────────────────────────

export interface TabSettingsProps {
  settings: DetectorSettings
  onSettingsChange: (settings: Partial<DetectorSettings>) => void
}

// ── Two-column grid wrapper for flat tabs ────────────────────────────────────

export const SettingsGrid = memo(function SettingsGrid({ children, className }: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('grid grid-cols-1 @sm:grid-cols-2 @3xl:grid-cols-3 gap-x-6 gap-y-3', className)}>
      {children}
    </div>
  )
})

// ── Section (flat, uniform) ──────────────────────────────────────────────────

export const Section = memo(function Section({ title, tooltip, showTooltip = true, fullWidth, children }: {
  title: string
  tooltip?: string
  showTooltip?: boolean
  fullWidth?: boolean
  children: React.ReactNode
}) {
  return (
    <TooltipProvider delayDuration={300}>
      <div className={cn('space-y-2', fullWidth && 'sm:col-span-full')}>
        <div className="flex items-center gap-1.5">
          <h3 className="section-label">{title}</h3>
          {tooltip && showTooltip && (
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-[280px] text-sm">
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

// ── SectionGroup (static header, two-column grid of children) ────────────────

export const SectionGroup = memo(function SectionGroup({ title, children }: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="py-1.5 section-label panel-groove">
        {title}
      </div>
      <div className="grid grid-cols-1 @sm:grid-cols-2 @3xl:grid-cols-3 gap-x-6 gap-y-3 pt-3">
        {children}
      </div>
    </div>
  )
})
