'use client'

import { useRef, useEffect, useCallback, useState, memo } from 'react'

interface VerticalGainFaderProps {
  value: number
  onChange: (value: number) => void
  level: number
  min?: number
  max?: number
  autoGainEnabled?: boolean
  autoGainDb?: number
  autoGainLocked?: boolean
  onAutoGainToggle?: (enabled: boolean) => void
  autoGainTargetDb: number
  onAutoGainTargetChange: (db: number) => void
  isRunning: boolean
  onToggle: () => void
}

export const VerticalGainFader = memo(function VerticalGainFader({
  value,
  onChange,
  level,
  min = -40,
  max = 40,
  autoGainEnabled = false,
  autoGainDb,
  autoGainLocked = false,
  onAutoGainToggle,
  autoGainTargetDb,
  onAutoGainTargetChange,
  isRunning,
  onToggle,
}: VerticalGainFaderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)
  const [editing, setEditing] = useState(false)
  const dimensionsRef = useRef({ width: 0, height: 0 })
  const gradientRef = useRef<CanvasGradient | null>(null)
  const gradientHeightRef = useRef(0)
  const pendingValueRef = useRef<number | null>(null)
  const rafCoalesceRef = useRef(0)

  // Ballistic meter animation state
  const targetLevelRef = useRef(0)
  const smoothedLevelRef = useRef(0)
  const prevDrawnRef = useRef(-1)
  const rafIdRef = useRef(0)

  const normalizedLevel = Math.max(0, Math.min(1, (level + 60) / 60))
  const displayValue = autoGainEnabled && autoGainDb != null ? autoGainDb : value

  // Sync incoming prop to target ref
  useEffect(() => {
    targetLevelRef.current = normalizedLevel
  }, [normalizedLevel])

  // ResizeObserver for DPR-aware canvas sizing
  useEffect(() => {
    const track = trackRef.current
    if (!track) return

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
        prevDrawnRef.current = -1
      }
    })

    observer.observe(track)
    return () => observer.disconnect()
  }, [])

  // Canvas draw — vertical orientation
  const drawMeter = useCallback((smoothed: number) => {
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

    // Background
    ctx.fillStyle = '#161616'
    ctx.fillRect(0, 0, w, h)

    // Cached vertical gradient — bottom-to-top
    let gradient = gradientRef.current
    if (!gradient || gradientHeightRef.current !== h) {
      gradient = ctx.createLinearGradient(0, h, 0, 0)
      gradient.addColorStop(0, '#3b82f6')
      gradient.addColorStop(0.6, '#3b82f6')
      gradient.addColorStop(0.8, '#eab308')
      gradient.addColorStop(0.95, '#ef4444')
      gradient.addColorStop(1, '#ef4444')
      gradientRef.current = gradient
      gradientHeightRef.current = h
    }

    // Meter fill from bottom
    const meterHeight = h * smoothed
    ctx.fillStyle = gradient
    ctx.fillRect(0, h - meterHeight, w, meterHeight)

    // Side highlight on meter
    if (meterHeight > 2) {
      ctx.fillStyle = 'rgba(255,255,255,0.10)'
      ctx.fillRect(0, h - meterHeight, Math.max(1, w * 0.2), meterHeight)
    }

    // Scale ticks (horizontal lines at dB marks)
    ctx.strokeStyle = 'rgba(255,255,255,0.15)'
    ctx.lineWidth = 0.5
    for (const db of [-30, -20, -10, 10, 20, 30]) {
      const ratio = (db - min) / (max - min)
      const y = h * (1 - ratio)
      ctx.beginPath()
      ctx.moveTo(w * 0.65, y)
      ctx.lineTo(w, y)
      ctx.stroke()
    }

    // Zero-dB reference line — prominent
    const zeroRatio = (0 - min) / (max - min)
    const zeroY = h * (1 - zeroRatio)
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, zeroY)
    ctx.lineTo(w, zeroY)
    ctx.stroke()
  }, [min, max])

  // Ballistic animation loop
  useEffect(() => {
    const ATTACK = 0.3
    const DECAY = 0.05

    const tick = () => {
      const target = targetLevelRef.current
      const current = smoothedLevelRef.current
      const coeff = target > current ? ATTACK : DECAY
      const next = current + (target - current) * coeff
      const smoothed = Math.abs(next - target) < 0.001 ? target : next
      smoothedLevelRef.current = smoothed

      if (Math.abs(smoothed - prevDrawnRef.current) > 0.0005) {
        prevDrawnRef.current = smoothed
        drawMeter(smoothed)
      }

      rafIdRef.current = requestAnimationFrame(tick)
    }

    rafIdRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafIdRef.current)
  }, [drawMeter])

  // Vertical drag: top = max, bottom = min
  const updateValueFromY = (clientY: number) => {
    const track = trackRef.current
    if (!track) return
    const rect = track.getBoundingClientRect()
    const y = Math.max(0, Math.min(rect.height, clientY - rect.top))
    const ratio = 1 - y / rect.height
    if (autoGainEnabled && onAutoGainToggle) {
      onAutoGainToggle(false)
    }
    pendingValueRef.current = Math.round(min + ratio * (max - min))
    if (!rafCoalesceRef.current) {
      rafCoalesceRef.current = requestAnimationFrame(() => {
        rafCoalesceRef.current = 0
        if (pendingValueRef.current !== null) {
          onChange(pendingValueRef.current)
          pendingValueRef.current = null
        }
      })
    }
  }

  const updateValueFromYRef = useRef(updateValueFromY)
  updateValueFromYRef.current = updateValueFromY

  const handleMouseDown = (e: React.MouseEvent) => {
    if (editing) return
    isDragging.current = true
    updateValueFromYRef.current(e.clientY)
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    if (editing) return
    isDragging.current = true
    updateValueFromYRef.current(e.touches[0].clientY)
  }

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return
      updateValueFromYRef.current(e.clientY)
    }
    const handleMouseUp = () => { isDragging.current = false }
    const handleTouchMove = (e: TouchEvent) => {
      if (!isDragging.current) return
      e.preventDefault()
      updateValueFromYRef.current(e.touches[0].clientY)
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
      if (rafCoalesceRef.current) cancelAnimationFrame(rafCoalesceRef.current)
    }
  }, [])

  const commitEdit = (raw: string) => {
    const parsed = parseInt(raw, 10)
    if (!isNaN(parsed)) {
      if (autoGainEnabled && onAutoGainToggle) {
        onAutoGainToggle(false)
      }
      onChange(Math.max(min, Math.min(max, parsed)))
    }
    setEditing(false)
  }

  const valueLabel = `${displayValue > 0 ? '+' : ''}${displayValue}`

  // Thumb position: percentage from bottom
  const thumbBottom = ((displayValue - min) / (max - min)) * 100

  return (
    <div className="flex flex-col h-full items-center py-2 gap-1.5 select-none">

      {/* dB readout — click to edit */}
      {editing ? (
        <input
          autoFocus
          type="text"
          defaultValue={String(displayValue)}
          className="font-mono bg-input border border-primary rounded px-0.5 text-center text-foreground focus-visible:outline-none text-sm w-12 h-6 flex-shrink-0"
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
          className={`font-mono text-center transition-colors cursor-text flex-shrink-0 tabular-nums text-sm leading-tight ${
            autoGainEnabled ? 'text-primary hover:text-primary/80' : 'text-foreground hover:text-primary'
          }`}
          onClick={() => setEditing(true)}
          onWheel={(e) => {
            e.preventDefault()
            if (autoGainEnabled && onAutoGainToggle) onAutoGainToggle(false)
            onChange(e.deltaY < 0 ? Math.min(max, value + 1) : Math.max(min, value - 1))
          }}
          title={autoGainEnabled ? (autoGainLocked ? 'Gain locked — click to edit' : 'Calibrating — click to edit') : 'Click to type, scroll ±1dB'}
          aria-label={`Input gain ${valueLabel}dB, click to edit`}
        >
          {valueLabel}
          <span className="block text-[0.5625rem] text-muted-foreground/60">dB</span>
        </button>
      )}

      {/* Auto/Manual toggle */}
      {onAutoGainToggle && (
        <button
          onClick={() => onAutoGainToggle(!autoGainEnabled)}
          className={`flex-shrink-0 px-1 py-0.5 rounded text-[0.5rem] font-bold uppercase tracking-wider transition-colors ${
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

      {/* Vertical fader track + canvas */}
      <div className="relative flex-1 min-h-0 w-full flex flex-col">
        <div
          ref={trackRef}
          className="relative flex-1 rounded cursor-ns-resize overflow-hidden"
          style={{ touchAction: 'none' }}
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
          role="slider"
          aria-orientation="vertical"
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={displayValue}
          aria-label="Input gain"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
              if (autoGainEnabled && onAutoGainToggle) onAutoGainToggle(false)
              onChange(Math.min(max, value + 1))
            }
            if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
              if (autoGainEnabled && onAutoGainToggle) onAutoGainToggle(false)
              onChange(Math.max(min, value - 1))
            }
          }}
        >
          <canvas
            ref={canvasRef}
            className="w-full h-full"
          />
          {/* Gain thumb — horizontal bar */}
          <div
            className={`absolute left-1/2 -translate-x-1/2 translate-y-1/2 w-12 h-3 rounded-sm border-2 shadow-md pointer-events-none transition-[box-shadow] ${
              autoGainEnabled ? 'border-primary bg-primary/90' : 'border-background bg-white'
            }`}
            style={{ bottom: `${thumbBottom}%` }}
            aria-hidden="true"
          />
        </div>
      </div>

      {/* Venue quick-cal pills */}
      <div className="flex-shrink-0 flex flex-col items-center gap-1 w-full">
        {([[-12, 'Loud'], [-18, 'Med'], [-24, 'Quiet']] as const).map(([db, label]) => (
          <button
            key={db}
            onClick={() => onAutoGainTargetChange(db)}
            className={`w-full px-1 py-1.5 rounded-md text-[0.5625rem] font-bold uppercase tracking-wider transition-colors ${
              autoGainEnabled && autoGainTargetDb === db
                ? 'bg-primary/20 border border-primary/50 text-primary'
                : 'bg-muted/50 border border-transparent text-muted-foreground hover:bg-muted'
            }`}
            title={`${label}: auto-gain target ${db} dBFS`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Start/stop toggle */}
      <button
        onClick={onToggle}
        aria-label={isRunning ? 'Stop analysis' : 'Start analysis'}
        className="relative flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <div className={`absolute inset-0.5 rounded-full border-2 transition-colors duration-300 ${isRunning ? 'border-primary' : 'border-primary/50'}`} />
        {isRunning && (
          <div className="absolute inset-0.5 rounded-full border-2 border-primary animate-ping opacity-30" />
        )}
        <svg
          className={`w-4 h-4 relative z-10 transition-colors duration-300 ${isRunning ? 'text-primary' : 'text-primary/60 hover:text-primary'}`}
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.31-2.5-4.06v8.12c1.48-.75 2.5-2.29 2.5-4.06zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
        </svg>
      </button>
    </div>
  )
})
