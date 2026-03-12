'use client'

import { useRef, useEffect, useCallback, useState, memo } from 'react'

// Sensitivity preset quick-access values
const SENSITIVITY_PRESETS = [[40, 'Safe'], [25, 'Norm'], [8, 'Hot']] as const

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
  noiseFloorDb?: number | null
  // Dual-mode fader
  faderMode: 'gain' | 'sensitivity'
  onFaderModeChange: (mode: 'gain' | 'sensitivity') => void
  sensitivityValue: number // feedbackThresholdDb (2-50)
  onSensitivityChange: (db: number) => void
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
  noiseFloorDb,
  faderMode,
  onFaderModeChange,
  sensitivityValue,
  onSensitivityChange,
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

  const isSensitivity = faderMode === 'sensitivity'
  const normalizedLevel = Math.max(0, Math.min(1, (level + 60) / 60))
  const displayValue = isSensitivity
    ? sensitivityValue
    : autoGainEnabled && autoGainDb != null ? autoGainDb : value

  // Sensitivity mode: effective min/max for the inverted range
  const effectiveMin = isSensitivity ? 2 : min
  const effectiveMax = isSensitivity ? 50 : max

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
    ctx.fillStyle = '#0e1012'
    ctx.fillRect(0, 0, w, h)

    // Cached vertical gradient — bottom-to-top
    let gradient = gradientRef.current
    if (!gradient || gradientHeightRef.current !== h) {
      gradient = ctx.createLinearGradient(0, h, 0, 0)
      gradient.addColorStop(0, '#4B92FF')
      gradient.addColorStop(0.6, '#4B92FF')
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
    ctx.strokeStyle = 'rgba(255,255,255,0.10)'
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
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'
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

  // Vertical drag: top = max, bottom = min (gain) OR top = 2, bottom = 50 (sensitivity, inverted)
  const updateValueFromY = (clientY: number) => {
    const track = trackRef.current
    if (!track) return
    const rect = track.getBoundingClientRect()
    const y = Math.max(0, Math.min(rect.height, clientY - rect.top))
    const ratio = 1 - y / rect.height // 0 = bottom, 1 = top

    if (isSensitivity) {
      // Inverted: top = 2 (most sensitive), bottom = 50 (least sensitive)
      const db = Math.round(50 - ratio * 48)
      pendingValueRef.current = Math.max(2, Math.min(50, db))
      if (!rafCoalesceRef.current) {
        rafCoalesceRef.current = requestAnimationFrame(() => {
          rafCoalesceRef.current = 0
          if (pendingValueRef.current !== null) {
            onSensitivityChange(pendingValueRef.current)
            pendingValueRef.current = null
          }
        })
      }
    } else {
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
  }

  const updateValueFromYRef = useRef(updateValueFromY)
  useEffect(() => { updateValueFromYRef.current = updateValueFromY })

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
      if (isSensitivity) {
        onSensitivityChange(Math.max(2, Math.min(50, parsed)))
      } else {
        if (autoGainEnabled && onAutoGainToggle) {
          onAutoGainToggle(false)
        }
        onChange(Math.max(min, Math.min(max, parsed)))
      }
    }
    setEditing(false)
  }

  // Display values differ per mode
  const valueLabel = isSensitivity
    ? `${sensitivityValue}`
    : `${displayValue > 0 ? '+' : ''}${displayValue}`

  // Thumb position: percentage from bottom
  const thumbBottom = isSensitivity
    ? ((50 - sensitivityValue) / 48) * 100  // Inverted: 50 at bottom (0%), 2 at top (100%)
    : ((displayValue - min) / (max - min)) * 100

  // Keyboard step handler
  const handleKeyStep = (direction: 1 | -1) => {
    if (isSensitivity) {
      // Up/Right = more sensitive (lower dB), Down/Left = less sensitive (higher dB)
      onSensitivityChange(Math.max(2, Math.min(50, sensitivityValue - direction)))
    } else {
      if (autoGainEnabled && onAutoGainToggle) onAutoGainToggle(false)
      onChange(Math.max(min, Math.min(max, value + direction)))
    }
  }

  return (
    <div className="flex flex-col h-full items-center py-2 gap-1.5 select-none">

      {/* Mode toggle — segmented pill */}
      <div className="flex-shrink-0 flex w-full rounded-md overflow-hidden border border-border/60">
        <button
          onClick={() => onFaderModeChange('gain')}
          className={`flex-1 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors ${
            !isSensitivity
              ? 'bg-white/15 text-foreground'
              : 'bg-transparent text-muted-foreground hover:text-foreground/70'
          }`}
          title="Input gain fader"
        >
          Gain
        </button>
        <button
          onClick={() => onFaderModeChange('sensitivity')}
          className={`flex-1 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors ${
            isSensitivity
              ? 'bg-blue-500/20 text-blue-400'
              : 'bg-transparent text-muted-foreground hover:text-foreground/70'
          }`}
          title="Detection sensitivity fader"
        >
          Sens
        </button>
      </div>

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
            if (e.key === 'ArrowUp') { e.preventDefault(); handleKeyStep(1) }
            if (e.key === 'ArrowDown') { e.preventDefault(); handleKeyStep(-1) }
          }}
        />
      ) : (
        <button
          className={`font-mono text-center transition-colors cursor-text flex-shrink-0 tabular-nums text-sm leading-tight ${
            isSensitivity
              ? 'text-blue-400 hover:text-blue-300'
              : autoGainEnabled ? 'text-primary hover:text-primary/80' : 'text-foreground hover:text-primary'
          }`}
          onClick={() => setEditing(true)}
          onWheel={(e) => {
            e.preventDefault()
            handleKeyStep(e.deltaY < 0 ? 1 : -1)
          }}
          title={
            isSensitivity
              ? `Sensitivity: ${sensitivityValue}dB threshold — click to type`
              : autoGainEnabled ? (autoGainLocked ? 'Gain locked — click to edit' : 'Calibrating — click to edit') : 'Click to type, scroll ±1dB'
          }
          aria-label={
            isSensitivity
              ? `Sensitivity ${sensitivityValue}dB, click to edit`
              : `Input gain ${valueLabel}dB, click to edit`
          }
        >
          {valueLabel}
          <span className={`block text-sm ${isSensitivity ? 'text-blue-400/60' : 'text-muted-foreground'}`}>
            {isSensitivity ? 'Sens' : 'dB'}
          </span>
        </button>
      )}

      {/* Auto/Manual toggle — gain mode only */}
      {!isSensitivity && onAutoGainToggle && (
        <button
          onClick={() => onAutoGainToggle(!autoGainEnabled)}
          className={`flex-shrink-0 px-1 py-0.5 rounded text-sm font-bold uppercase tracking-wider transition-colors ${
            autoGainEnabled
              ? autoGainLocked
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                : 'bg-amber-500/20 text-amber-400 border border-amber-500/40 motion-safe:animate-pulse'
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
          aria-valuemin={effectiveMin}
          aria-valuemax={effectiveMax}
          aria-valuenow={displayValue}
          aria-label={isSensitivity ? 'Detection sensitivity' : 'Input gain'}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp' || e.key === 'ArrowRight') handleKeyStep(1)
            if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') handleKeyStep(-1)
          }}
        >
          {/* Fader slot line — subtle center groove behind thumb */}
          <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-white/[0.04] pointer-events-none" />
          <canvas
            ref={canvasRef}
            className="w-full h-full"
          />
          {/* Fader thumb — console-style capsule knob with ridges */}
          <div
            className={`absolute left-1/2 -translate-x-1/2 translate-y-1/2 w-11 h-6 rounded-[5px] border-2 pointer-events-none transition-all duration-150 ${
              isSensitivity
                ? 'border-cyan-300/60 bg-gradient-to-b from-blue-800 to-blue-950'
                : autoGainEnabled
                  ? 'border-primary bg-gradient-to-b from-primary/90 to-primary'
                  : 'border-white/80 bg-gradient-to-b from-gray-100 to-gray-300'
            }`}
            style={{
              bottom: `${thumbBottom}%`,
              boxShadow: isSensitivity
                ? '0 2px 8px rgba(0,210,210,0.3), 0 1px 3px rgba(0,0,0,0.5)'
                : autoGainEnabled
                  ? '0 2px 8px rgba(139,92,246,0.3), 0 1px 3px rgba(0,0,0,0.4)'
                  : '0 2px 8px rgba(255,255,255,0.15), 0 1px 3px rgba(0,0,0,0.4)',
            }}
            aria-hidden="true"
          >
            {/* Groove ridges — console fader tactile lines */}
            <div className={`absolute inset-x-2 top-[5px] h-[1.5px] rounded-full ${isSensitivity ? 'bg-blue-400/25' : autoGainEnabled ? 'bg-white/25' : 'bg-gray-500/40'}`} />
            <div className={`absolute inset-x-1.5 top-1/2 -translate-y-1/2 h-[2px] rounded-full ${isSensitivity ? 'bg-cyan-300/50' : autoGainEnabled ? 'bg-white/40' : 'bg-gray-500/60'}`} />
            <div className={`absolute inset-x-2 bottom-[5px] h-[1.5px] rounded-full ${isSensitivity ? 'bg-blue-400/25' : autoGainEnabled ? 'bg-white/25' : 'bg-gray-500/40'}`} />
          </div>
          {/* Upward arrow hints — guide new engineers to push sensitivity up */}
          {isSensitivity && sensitivityValue >= 25 && (
            <div
              className={`absolute inset-x-0 pointer-events-none flex flex-col items-center gap-2 transition-opacity duration-500 ${
                sensitivityValue >= 35 ? 'opacity-100' : 'opacity-50'
              }`}
              style={{ bottom: `${Math.max(thumbBottom + 8, 15)}%` }}
              aria-hidden="true"
            >
              <span className="text-white/15 text-[10px] font-mono leading-none">▲</span>
              <span className="text-white/10 text-[10px] font-mono leading-none">▲</span>
            </div>
          )}
          {/* Noise floor overlay — gain mode only */}
          {!isSensitivity && noiseFloorDb != null && (
            <div className="absolute bottom-0 inset-x-0 flex flex-col items-center pb-1.5 pointer-events-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
              <span className="text-sm font-mono font-semibold text-white/70 leading-none">
                Floor
              </span>
              <span className="text-sm font-mono font-bold text-white leading-none">
                {noiseFloorDb.toFixed(0)}dB
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Quick presets — mode-dependent */}
      <div className="flex-shrink-0 flex flex-col items-center gap-1 w-full">
        {isSensitivity ? (
          // Sensitivity presets: Safe (40dB), Norm (25dB), Hot (8dB)
          SENSITIVITY_PRESETS.map(([db, label]) => (
            <button
              key={db}
              onClick={() => onSensitivityChange(db)}
              className={`w-full px-1 py-1.5 rounded font-mono text-sm font-bold uppercase tracking-[0.15em] transition-all duration-150 active:scale-95 ${
                sensitivityValue === db
                  ? 'bg-blue-500/20 border border-blue-500/50 text-blue-400'
                  : 'bg-card/40 border border-transparent text-muted-foreground hover:bg-muted'
              }`}
              title={`${label}: ${db}dB threshold`}
            >
              {label}
            </button>
          ))
        ) : (
          // Venue presets: Loud (-12), Med (-18), Quiet (-24)
          ([[-12, 'Loud'], [-18, 'Med'], [-24, 'Quiet']] as const).map(([db, label]) => (
            <button
              key={db}
              onClick={() => onAutoGainTargetChange(db)}
              className={`w-full px-1 py-1.5 rounded font-mono text-sm font-bold uppercase tracking-[0.15em] transition-all duration-150 active:scale-95 ${
                autoGainEnabled && autoGainTargetDb === db
                  ? 'bg-primary/20 border border-primary/50 text-primary'
                  : 'bg-card/40 border border-transparent text-muted-foreground hover:bg-muted'
              }`}
              title={`${label}: auto-gain target ${db} dBFS`}
            >
              {label}
            </button>
          ))
        )}
      </div>

      {/* Start/stop toggle */}
      <button
        onClick={onToggle}
        aria-label={isRunning ? 'Stop analysis' : 'Start analysis'}
        className="relative flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <div className={`absolute inset-0.5 rounded-full border-2 transition-colors duration-300 ${isRunning ? 'border-primary' : 'border-primary/50'}`} />
        {isRunning && (
          <div className="absolute inset-0.5 rounded-full border border-primary/40 animate-led-blink" />
        )}
        <svg
          className={`w-4 h-4 relative z-10 transition-colors duration-300 ${isRunning ? 'text-primary drop-shadow-[0_0_4px_rgba(75,146,255,0.4)]' : 'text-muted-foreground hover:text-primary'}`}
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.31-2.5-4.06v8.12c1.48-.75 2.5-2.29 2.5-4.06zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
        </svg>
      </button>
    </div>
  )
})
