'use client'

import { memo } from 'react'
import { HelpCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

type LEDColor = 'green' | 'amber' | 'cyan'

interface LEDToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  /** LED color when active. Default: green */
  color?: LEDColor
  /** Optional tooltip text shown via HelpCircle icon */
  tooltip?: string
  className?: string
}

/**
 * LED-style toggle with a circular indicator dot and label.
 * Replaces PillToggle with a pro-audio aesthetic.
 * Full 44px row height for WCAG touch target compliance.
 *
 * LED colors use CSS variables defined in globals.css:
 * --console-green, --console-green-glow (green)
 * --console-amber, --console-amber-glow (amber)
 * --console-cyan, --console-cyan-glow (cyan)
 *
 * The animate-led-blink animation is defined in globals.css:250.
 */
export const LEDToggle = memo(function LEDToggle({
  checked,
  onChange,
  label,
  color = 'green',
  tooltip,
  className,
}: LEDToggleProps) {
  return (
    <div className={cn('flex items-center gap-2.5 min-h-11 py-2 w-full group', className)}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className="flex items-center gap-2.5 cursor-pointer flex-1 text-left"
      >
        {/* LED dot — uses console color variables from globals.css */}
        <span
          className={cn(
            'w-2 h-2 rounded-full flex-shrink-0 transition-all duration-200',
            checked ? 'animate-led-blink' : 'bg-muted',
          )}
          style={checked ? {
            backgroundColor: `var(--console-${color})`,
            boxShadow: `0 0 6px var(--console-${color}-glow), 0 0 2px var(--console-${color}-glow)`,
          } : undefined}
        />
        {/* Label */}
        <span className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors">
          {label}
        </span>
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
