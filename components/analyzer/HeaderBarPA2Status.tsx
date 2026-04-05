'use client'

import { memo } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  getPA2StatusDotClass,
  getPA2TooltipText,
} from '@/components/analyzer/headerBarRightControlsUtils'

interface HeaderBarPA2StatusProps {
  pa2Enabled: boolean
  pa2Status: string
  pa2Error: string | null
  notchSlotsUsed: number
  notchSlotsAvailable: number
}

export const HeaderBarPA2Status = memo(function HeaderBarPA2Status({
  pa2Enabled,
  pa2Status,
  pa2Error,
  notchSlotsUsed,
  notchSlotsAvailable,
}: HeaderBarPA2StatusProps) {
  if (!pa2Enabled) return null

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-medium cursor-default">
          <div
            className={`h-1.5 w-1.5 rounded-full ${getPA2StatusDotClass(pa2Status)}`}
          />
          <span className="hidden sm:inline text-muted-foreground">PA2</span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        {getPA2TooltipText({
          status: pa2Status,
          error: pa2Error,
          notchSlotsUsed,
          notchSlotsAvailable,
        })}
      </TooltipContent>
    </Tooltip>
  )
})
