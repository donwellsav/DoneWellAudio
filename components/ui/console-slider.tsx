'use client'

import { memo, useState, useCallback } from 'react'
import * as SliderPrimitive from '@radix-ui/react-slider'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { HelpCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Color config ─────────────────────────────────────────────────────────────
// Maps semantic color names to CSS variable references + rgba fill gradients.
// Inline styles are necessary here because Radix SliderPrimitive.Range ignores
// Tailwind class-based fills — the component applies its own style attribute.

type SliderColor = 'amber' | 'blue' | 'green'

const COLOR_CONFIG: Record<SliderColor, {
  rangeGradient: string
  rangeGlow: string
  thumbBorder: string
  thumbGlow: string
  text: string
}> = {
  amber: {
    rangeGradient: 'linear-gradient(90deg, rgba(var(--tint-r),var(--tint-g),var(--tint-b),0.30), rgba(var(--tint-r),var(--tint-g),var(--tint-b),0.70))',
    rangeGlow: '0 0 6px var(--console-amber-glow)',
    thumbBorder: 'var(--console-amber)',
    thumbGlow: '0 0 8px var(--console-amber-glow), 0 0 2px var(--console-amber-glow)',
    text: 'var(--console-amber)',
  },
  blue: {
    rangeGradient: 'linear-gradient(90deg, rgba(75,146,255,0.28), rgba(75,146,255,0.65))',
    rangeGlow: '0 0 6px var(--console-blue-glow)',
    thumbBorder: 'var(--console-blue)',
    thumbGlow: '0 0 8px var(--console-blue-glow), 0 0 2px var(--console-blue-glow)',
    text: 'var(--console-blue)',
  },
  green: {
    rangeGradient: 'linear-gradient(90deg, rgba(74,222,128,0.22), rgba(74,222,128,0.55))',
    rangeGlow: '0 0 6px var(--console-green-glow)',
    thumbBorder: 'var(--console-green)',
    thumbGlow: '0 0 8px var(--console-green-glow), 0 0 2px var(--console-green-glow)',
    text: 'var(--console-green)',
  },
}

// ── Props ────────────────────────────────────────────────────────────────────

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
  /**
   * Operator color group.
   * amber = detection controls (sensitivity, thresholds, algorithms)
   * blue  = scope controls (frequency range, timing, FFT)
   * cyan  = system controls (auto-gain, noise floor, track management)
   * Default: amber
   */
  color?: SliderColor
  className?: string
}

/**
 * Pro-audio console-style slider with recessed track, color-coded fill,
 * knob thumb with glow ring, and monospace LED value readout.
 *
 * Three semantic color groups mirror a real mixing console:
 *   amber = what triggers detection  (mode, sensitivity, thresholds)
 *   blue  = analysis scope / range   (freq range, timing windows, FFT)
 *   cyan  = signal processing system (auto-gain, noise floor, track mgmt)
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
  color = 'amber',
  className,
}: ConsoleSliderProps) {
  const c = COLOR_CONFIG[color]
  const [isDragging, setIsDragging] = useState(false)
  const handlePointerDown = useCallback(() => setIsDragging(true), [])
  const handlePointerUp = useCallback(() => setIsDragging(false), [])

  return (
    <TooltipProvider delayDuration={300}>
      <div className={cn('space-y-1', className)}>
        {/* Header: label + value readout */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <span className="section-label" style={{ color: c.text }}>{label}</span>
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
          <span className="console-readout" style={{ color: c.text, textShadow: `0 0 8px ${c.thumbBorder}40` }}>{value}</span>
        </div>

        {/* Slider track */}
        <SliderPrimitive.Root
          value={[sliderValue]}
          onValueChange={([v]) => onChange(v)}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
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
              style={{ background: c.rangeGradient, boxShadow: c.rangeGlow }}
            />
          </SliderPrimitive.Track>
          <Tooltip open={isDragging}>
            <TooltipTrigger asChild>
              <SliderPrimitive.Thumb
                className="console-thumb block shrink-0 rounded-full transition-[box-shadow,transform] duration-100 focus-visible:outline-hidden cursor-grab active:cursor-grabbing"
                style={{
                  width: 20, height: 20,
                  borderColor: c.thumbBorder,
                  boxShadow: c.thumbGlow,
                }}
              />
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs font-mono py-0.5 px-1.5" style={{ color: c.text }}>
              {value}
            </TooltipContent>
          </Tooltip>
        </SliderPrimitive.Root>
      </div>
    </TooltipProvider>
  )
})
