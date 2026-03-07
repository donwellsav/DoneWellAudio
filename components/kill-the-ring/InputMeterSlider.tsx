'use client'

import { useRef, useEffect, useState, memo } from 'react'

interface InputMeterSliderProps {
  value: number
  onChange: (value: number) => void
  level: number
  min?: number
  max?: number
  fullWidth?: boolean
  compact?: boolean
  autoGainEnabled?: boolean
  autoGainDb?: number
  autoGainLocked?: boolean
  onAutoGainToggle?: (enabled: boolean) => void
}

export const InputMeterSlider = memo(function InputMeterSlider({
  value,
  onChange,
  level,
  min = -40,
  max = 40,
  fullWidth = false,
  compact = false,
  autoGainEnabled = false,
  autoGainDb,
  autoGainLocked = false,
  onAutoGainToggle,
}: InputMeterSliderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sliderRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)
  const [editing, setEditing] = useState(false)
  const dimensionsRef = useRef({ width: 0, height: 0 })
  const gradientRef = useRef<CanvasGradient | null>(null)
  const gradientWidthRef = useRef(0)

  const normalizedLevel = Math.max(0, Math.min(1, (level + 60) / 60))

  // Display value: when auto-gain is active, show the auto-computed gain
  const displayValue = autoGainEnabled && autoGainDb != null ? autoGainDb : value

  // ResizeObserver to track container size + DPR scaling
  useEffect(() => {
    const slider = sliderRef.current
    if (!slider) return

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        dimensionsRef.current = { width, height }
        const canvas = canvasRef.current
        if (canvas) {
          const dpr = window.devicePixelRatio || 1
          canvas.width = Math.floor(width * dpr)
          canvas.height = Math.floor(height * dpr)
        }
      }
    })

    observer.observe(slider)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const { width: w, height: h } = dimensionsRef.current
    if (w === 0 || h === 0) return

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, w, h)

    ctx.fillStyle = 'rgba(255,255,255,0.08)'
    ctx.fillRect(0, 0, w, h)

    const meterWidth = w * normalizedLevel
    // Cache gradient — only recreate when canvas width changes
    if (!gradientRef.current || gradientWidthRef.current !== w) {
      const gradient = ctx.createLinearGradient(0, 0, w, 0)
      gradient.addColorStop(0, '#22c55e')
      gradient.addColorStop(0.6, '#22c55e')
      gradient.addColorStop(0.8, '#eab308')
      gradient.addColorStop(0.95, '#ef4444')
      gradient.addColorStop(1, '#ef4444')
      gradientRef.current = gradient
      gradientWidthRef.current = w
    }
    ctx.fillStyle = gradientRef.current
    ctx.fillRect(0, 0, meterWidth, h)

    // Zero-dB tick mark
    const zeroPos = ((0 - min) / (max - min)) * w
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'
    ctx.lineWidth = 1
    ctx.setLineDash([2, 2])
    ctx.beginPath()
    ctx.moveTo(zeroPos, 0)
    ctx.lineTo(zeroPos, h)
    ctx.stroke()
    ctx.setLineDash([])
  }, [normalizedLevel, displayValue, min, max])

  const updateValueFromX = (clientX: number) => {
    const slider = sliderRef.current
    if (!slider) return
    const rect = slider.getBoundingClientRect()
    const x = Math.max(0, Math.min(rect.width, clientX - rect.left))
    const ratio = x / rect.width
    // When user drags in auto mode, switch to manual
    if (autoGainEnabled && onAutoGainToggle) {
      onAutoGainToggle(false)
    }
    onChange(Math.round(min + ratio * (max - min)))
  }

  // Keep a ref to the latest updateValueFromX so window listeners
  // always call through the current closure without re-registering.
  const updateValueFromXRef = useRef(updateValueFromX)
  updateValueFromXRef.current = updateValueFromX

  const handleMouseDown = (e: React.MouseEvent) => {
    if (editing) return
    isDragging.current = true
    updateValueFromXRef.current(e.clientX)
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    if (editing) return
    isDragging.current = true
    updateValueFromXRef.current(e.touches[0].clientX)
  }

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return
      updateValueFromXRef.current(e.clientX)
    }
    const handleMouseUp = () => { isDragging.current = false }
    const handleTouchMove = (e: TouchEvent) => {
      if (!isDragging.current) return
      e.preventDefault()
      updateValueFromXRef.current(e.touches[0].clientX)
    }
    const handleTouchEnd = () => { isDragging.current = false }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    window.addEventListener('touchmove', handleTouchMove, { passive: false })
    window.addEventListener('touchend', handleTouchEnd)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('touchend', handleTouchEnd)
    }
  }, [])

  const commitEdit = (raw: string) => {
    const parsed = parseInt(raw, 10)
    if (!isNaN(parsed)) {
      // Switch to manual if editing in auto mode
      if (autoGainEnabled && onAutoGainToggle) {
        onAutoGainToggle(false)
      }
      onChange(Math.max(min, Math.min(max, parsed)))
    }
    setEditing(false)
  }

  const valueLabel = `${displayValue > 0 ? '+' : ''}${displayValue}dB`

  return (
    <div className={`flex items-center gap-2 ${fullWidth ? 'w-full' : ''}`}>

      {/* Auto/Manual toggle — shows calibration state */}
      {onAutoGainToggle && (
        <button
          onClick={() => onAutoGainToggle(!autoGainEnabled)}
          className={`flex-shrink-0 px-1.5 py-0.5 rounded text-[0.5625rem] font-bold uppercase tracking-wider transition-colors ${
            autoGainEnabled
              ? autoGainLocked
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                : 'bg-amber-500/20 text-amber-400 border border-amber-500/40 animate-pulse'
              : 'bg-muted/40 text-muted-foreground border border-border hover:text-foreground'
          }`}
          title={
            autoGainEnabled
              ? autoGainLocked
                ? `Gain locked at ${autoGainDb ?? 0}dB — click for manual`
                : 'Calibrating auto-gain… click for manual'
              : 'Manual gain — click for auto'
          }
          aria-label={
            autoGainEnabled
              ? autoGainLocked
                ? 'Auto gain locked, switch to manual gain'
                : 'Auto gain calibrating, switch to manual gain'
              : 'Switch to auto gain'
          }
        >
          {autoGainEnabled ? (autoGainLocked ? 'Lock' : 'Cal') : 'Man'}
        </button>
      )}

      {/* Slider track + 0dB label */}
      <div className="relative flex-1 flex flex-col">
        <div
          ref={sliderRef}
          className={`relative rounded cursor-ew-resize overflow-hidden w-full ${compact ? 'h-4' : 'h-5'}`}
          style={{ touchAction: 'none' }}
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
          role="slider"
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={displayValue}
          aria-label="Input gain"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
              if (autoGainEnabled && onAutoGainToggle) onAutoGainToggle(false)
              onChange(Math.min(max, value + 1))
            }
            if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
              if (autoGainEnabled && onAutoGainToggle) onAutoGainToggle(false)
              onChange(Math.max(min, value - 1))
            }
          }}
        >
          <canvas
            ref={canvasRef}
            className="w-full h-full"
          />
          {/* Gain thumb — white circle matching shadcn Slider thumb */}
          <div
            className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 size-7 rounded-full border-2 shadow-md ring-offset-background transition-[box-shadow] hover:ring-4 hover:ring-ring/50 focus-visible:ring-4 focus-visible:ring-ring/50 pointer-events-none ${
              autoGainEnabled ? 'border-primary bg-primary/90' : 'border-background bg-white'
            }`}
            style={{ left: `${((displayValue - min) / (max - min)) * 100}%` }}
            aria-hidden="true"
          />
        </div>
        {/* 0dB unity label — positioned at the center (50%) of the range */}
        {!compact && (
          <div className="absolute top-full left-1/2 -translate-x-1/2 mt-0.5 pointer-events-none">
            <span className="text-[0.5rem] text-muted-foreground/60 font-mono leading-none">0</span>
          </div>
        )}
      </div>

      {/* Value display — click to edit */}
      {editing ? (
        <input
          autoFocus
          type="text"
          defaultValue={String(displayValue)}
          className={`font-mono bg-input border border-primary rounded px-1 text-center text-foreground focus-visible:outline-none flex-shrink-0 ${compact ? 'text-[0.5rem] w-9 h-4' : 'text-xs w-12 h-5'}`}
          onBlur={(e) => commitEdit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitEdit((e.target as HTMLInputElement).value)
            if (e.key === 'Escape') setEditing(false)
            if (e.key === 'ArrowUp') { e.preventDefault(); onChange(Math.min(max, value + 1)) }
            if (e.key === 'ArrowDown') { e.preventDefault(); onChange(Math.max(min, value - 1)) }
          }}
        />
      ) : (
        <button
          className={`font-mono text-right transition-colors cursor-text flex-shrink-0 tabular-nums ${compact ? 'text-[0.5rem] w-9' : 'text-xs w-12'} ${
            autoGainEnabled ? 'text-primary hover:text-primary/80' : 'text-foreground hover:text-primary'
          }`}
          onClick={() => setEditing(true)}
          onWheel={(e) => {
            e.preventDefault()
            if (autoGainEnabled && onAutoGainToggle) onAutoGainToggle(false)
            onChange(e.deltaY < 0 ? Math.min(max, value + 1) : Math.max(min, value - 1))
          }}
          title={autoGainEnabled ? (autoGainLocked ? 'Gain locked — click to edit (switches to manual)' : 'Calibrating — click to edit (switches to manual)') : 'Click to type, scroll to step ±1dB'}
          aria-label={`Input gain ${valueLabel}${autoGainEnabled ? (autoGainLocked ? ' (locked)' : ' (calibrating)') : ''}, click to edit`}
        >
          {valueLabel}
        </button>
      )}
    </div>
  )
})
