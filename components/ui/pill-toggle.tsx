'use client'

import { memo } from 'react'
import { HelpCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

interface PillToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  labelOn?: string
  labelOff?: string
  /** Optional tooltip text shown via HelpCircle icon */
  tooltip?: string
  /**
   * Accessible name describing what this toggle controls (e.g. "Spectral data sharing").
   * Used to build `aria-label` on each button so screen readers announce context,
   * not just "ON" / "OFF".
   */
  label?: string
  className?: string
}

const activeClass = 'bg-[var(--console-amber)]/15 text-[var(--console-amber)] border border-[var(--console-amber)]/35'
const inactiveClass = 'text-muted-foreground hover:text-foreground border border-transparent hover:border-border'
const baseClass = 'px-2 py-0.5 rounded text-sm font-mono font-bold tracking-wide transition-colors cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50'

export const PillToggle = memo(function PillToggle({
  checked,
  onChange,
  labelOn = 'ON',
  labelOff = 'OFF',
  tooltip,
  label,
  className,
}: PillToggleProps) {
  const onAria = label ? `Turn ${label} ${labelOn.toLowerCase()}` : undefined
  const offAria = label ? `Turn ${label} ${labelOff.toLowerCase()}` : undefined
  return (
    <div className={cn('flex items-center gap-1', className)}>
      <button
        aria-pressed={checked}
        aria-label={onAria}
        onClick={() => onChange(true)}
        className={`${baseClass} ${checked ? activeClass : inactiveClass}`}
      >
        {labelOn}
      </button>
      <button
        aria-pressed={!checked}
        aria-label={offAria}
        onClick={() => onChange(false)}
        className={`${baseClass} ${!checked ? activeClass : inactiveClass}`}
      >
        {labelOff}
      </button>
      {tooltip && (
        <Tooltip>
          <TooltipTrigger asChild>
            <HelpCircle className="w-3 h-3 text-muted-foreground/70 hover:text-muted-foreground cursor-help flex-shrink-0" />
          </TooltipTrigger>
          <TooltipContent side="right" className="max-w-[260px] text-sm">
            {tooltip}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  )
})
