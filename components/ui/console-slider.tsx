'use client'

import { memo } from 'react'
import * as SliderPrimitive from '@radix-ui/react-slider'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { HelpCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ConsoleSliderProps {
  label: string
  /** Formatted display value (e.g. "25 dB", "35%") */
  value: string
  /** Tooltip help text */
  tooltip?: string
  /** Whether to show tooltip (requires tooltip prop) */
  showTooltip?: boolean
  /** Numeric slider value */
  sliderValue: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  className?: string
}

/**
 * Pro-audio console-style slider with recessed track, amber fill,
 * knob thumb with glow ring, and monospace LED value readout.
 *
 * Drop-in replacement for the SliderRow pattern in UnifiedControls.
 */
export const ConsoleSlider = memo(function ConsoleSlider({
  label,
  value,
  tooltip,
  showTooltip = true,
  sliderValue,
  min,
  max,
  step,
  onChange,
  className,
}: ConsoleSliderProps) {
  return (
    <TooltipProvider delayDuration={300}>
      <div className={cn('space-y-1', className)}>
        {/* Header: label + value readout */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <span className="section-label text-muted-foreground">{label}</span>
            {tooltip && showTooltip && (
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
          <span className="console-readout">{value}</span>
        </div>

        {/* Slider track */}
        <SliderPrimitive.Root
          value={[sliderValue]}
          onValueChange={([v]) => onChange(v)}
          min={min}
          max={max}
          step={step}
          className="relative flex w-full touch-none items-center select-none h-5"
        >
          <SliderPrimitive.Track
            className="relative grow overflow-hidden rounded-full h-2 panel-recessed"
            style={{ background: '#0a0b0d' }}
          >
            <SliderPrimitive.Range
              className="absolute h-full"
              style={{
                background: 'linear-gradient(90deg, rgba(var(--console-amber-rgb, 245, 158, 11), 0.3), rgba(var(--console-amber-rgb, 245, 158, 11), 0.7))',
                boxShadow: '0 0 6px var(--console-amber-glow)',
              }}
            />
          </SliderPrimitive.Track>
          <SliderPrimitive.Thumb
            className="block shrink-0 rounded-full transition-shadow focus-visible:outline-hidden"
            style={{
              width: 20,
              height: 20,
              background: 'linear-gradient(135deg, #2a2d32, #1a1d22)',
              border: '2px solid var(--console-amber)',
              boxShadow: '0 0 8px var(--console-amber-glow), 0 2px 4px rgba(0,0,0,0.5)',
            }}
          />
        </SliderPrimitive.Root>
      </div>
    </TooltipProvider>
  )
})
