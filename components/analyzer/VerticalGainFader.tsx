'use client'

import { useRef, useEffect, useCallback, useState, useMemo, memo } from 'react'
import { useTheme } from 'next-themes'

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
  isRunning: boolean
  noiseFloorDb?: number | null
  // Dual-mode fader
  faderMode: 'gain' | 'sensitivity'
  onFaderModeChange: (mode: 'gain' | 'sensitivity') => void
  sensitivityValue: number // feedbackThresholdDb (2-50)
  onSensitivityChange: (db: number) => void
  activeAdvisoryCount: number
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
  isRunning,
  noiseFloorDb,
  faderMode,
  onFaderModeChange,
  sensitivityValue,
  onSensitivityChange,
  activeAdvisoryCount,
}: VerticalGainFaderProps) {
  const { resolvedTheme } = useTheme()
  const isDarkRef = useRef(true)
  isDarkRef.current = resolvedTheme !== 'light'
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

  // ── Fader guidance: coach the engineer toward the sweet spot ──────────────
  // Track "running with signal but zero detections" duration
  const noDetectionSecsRef = useRef(0)
  const [prolongedSilence, setProlongedSilence] = useState(false)

  useEffect(() => {
    if (!isRunning || !isSensitivity) {
      noDetectionSecsRef.current = 0
      setProlongedSilence(false)
      return
    }
    const id = setInterval(() => {
      if (activeAdvisoryCount > 0 || level < -45) {
        noDetectionSecsRef.current = 0
        if (prolongedSilence) setProlongedSilence(false)
      } else {
        noDetectionSecsRef.current++
        if (noDetectionSecsRef.current >= 2 && !prolongedSilence) setProlongedSilence(true)
      }
    }, 1000)
    return () => clearInterval(id)
  }, [isRunning, isSensitivity, activeAdvisoryCount, level, prolongedSilence])

  const guidance = useMemo(() => {
    if (!isSensitivity || !isRunning) return { direction: 'none' as const, urgency: 'none' as const }
    // Too many detections → back off (likely false positives)
    if (activeAdvisoryCount >= 3) return { direction: 'down' as const, urgency: 'warning' as const }
    // No detections for extended period → nudge up
    if (prolongedSilence && sensitivityValue > 20) return { direction: 'up' as const, urgency: 'hint' as const }
    // Positional: too conservative
    if (sensitivityValue > 35) return { direction: 'up' as const, urgency: sensitivityValue >= 42 ? 'warning' as const : 'hint' as const }
    // Positional: too aggressive
    if (sensitivityValue < 10) return { direction: 'down' as const, urgency: sensitivityValue <= 5 ? 'warning' as const : 'hint' as const }
    return { direction: 'none' as const, urgency: 'none' as const }
  }, [isSensitivity, isRunning, activeAdvisoryCount, prolongedSilence, sensitivityValue])

  const arrowColors = guidance.urgency === 'warning'
    ? ['text-red-500', 'text-red-500/70', 'text-red-500/40']
    : ['text-amber-400/80', 'text-amber-400/50', 'text-amber-400/25']
  const arrowAnim = guidance.urgency === 'warning'
    ? 'motion-safe:animate-arrow-flash'
    : 'motion-safe:animate-pulse'

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
    ctx.fillStyle = isDarkRef.current ? '#0e1012' : '#e8eaee'
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

    // Scale ticks — console-style etched markings
    const labelSize = Math.max(7, Math.min(9, w * 0.2))

    if (isSensitivity) {
      // Sensitivity mode: inverted scale (top=2 most sensitive, bottom=50 least)
      for (const db of [10, 20, 30, 40]) {
        const ratio = (50 - db) / 48 // Inverted: 50 at bottom (0%), 2 at top (100%)
        const y = h * (1 - ratio)

        ctx.strokeStyle = 'rgba(100,180,255,0.15)'
        ctx.lineWidth = 0.75
        ctx.beginPath()
        ctx.moveTo(w * 0.55, y)
        ctx.lineTo(w, y)
        ctx.stroke()

        ctx.fillStyle = 'rgba(100,180,255,0.25)'
        ctx.font = `${labelSize}px monospace`
        ctx.textAlign = 'right'
        ctx.textBaseline = 'middle'
        ctx.fillText(`${db}`, w * 0.48, y)
      }
      // Default (25dB) reference line
      const defRatio = (50 - 25) / 48
      const defY = h * (1 - defRatio)
      ctx.strokeStyle = 'rgba(100,180,255,0.35)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(0, defY)
      ctx.lineTo(w, defY)
      ctx.stroke()
      ctx.fillStyle = 'rgba(100,180,255,0.45)'
      ctx.font = `bold ${labelSize + 1}px monospace`
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      ctx.fillText('25', w * 0.48, defY)
    } else {
      // Gain mode: standard dB scale
      for (const db of [-30, -20, -10, 10, 20, 30]) {
        const ratio = (db - min) / (max - min)
        const y = h * (1 - ratio)

        ctx.strokeStyle = 'rgba(255,255,255,0.20)'
        ctx.lineWidth = 0.75
        ctx.beginPath()
        ctx.moveTo(w * 0.55, y)
        ctx.lineTo(w, y)
        ctx.stroke()

        ctx.fillStyle = 'rgba(255,255,255,0.30)'
        ctx.font = `${labelSize}px monospace`
        ctx.textAlign = 'right'
        ctx.textBaseline = 'middle'
        ctx.fillText(`${db}`, w * 0.48, y)
      }

      // Zero-dB (unity) reference — prominent double-line with label
      const zeroRatio = (0 - min) / (max - min)
      const zeroY = h * (1 - zeroRatio)
      ctx.strokeStyle = 'rgba(255,255,255,0.45)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(0, zeroY)
      ctx.lineTo(w, zeroY)
      ctx.stroke()
      ctx.strokeStyle = 'rgba(255,255,255,0.08)'
      ctx.lineWidth = 0.5
      ctx.beginPath()
      ctx.moveTo(0, zeroY + 1.5)
      ctx.lineTo(w, zeroY + 1.5)
      ctx.stroke()
      ctx.fillStyle = 'rgba(255,255,255,0.55)'
      ctx.font = `bold ${labelSize + 1}px monospace`
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      ctx.fillText('0', w * 0.48, zeroY)
    }
  }, [min, max, isSensitivity])

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

  // Force redraw on theme change
  useEffect(() => {
    prevDrawnRef.current = -1 // invalidate cache to force next tick to redraw
  }, [resolvedTheme])

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
      <div className="flex-shrink-0 flex flex-col w-full rounded-md overflow-hidden border border-border/60">
        <button
          onClick={() => onFaderModeChange('gain')}
          className={`flex-1 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 ${
            !isSensitivity
              ? 'bg-[var(--console-amber)]/10 text-[var(--console-amber)]'
              : 'bg-transparent text-muted-foreground hover:text-foreground/70'
          }`}
          title="Input gain fader"
        >
          Gain
        </button>
        <button
          onClick={() => onFaderModeChange('sensitivity')}
          className={`flex-1 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 ${
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
          className={`fader-readout font-mono text-center transition-colors cursor-text flex-shrink-0 tabular-nums text-sm leading-tight ${
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
          className={`flex-shrink-0 px-1 py-0.5 rounded text-sm font-bold uppercase tracking-wider transition-colors cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 ${
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
          className="relative flex-1 rounded-sm cursor-ns-resize overflow-hidden border border-white/[0.04]"
          style={{ touchAction: 'none', boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.5), inset 0 -1px 2px rgba(0,0,0,0.3), 0 1px 0 rgba(255,255,255,0.03)' }}
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
          {/* Fader slot — recessed groove like a real console fader */}
          <div className="absolute inset-y-2 left-1/2 -translate-x-1/2 w-[5px] pointer-events-none rounded-full" style={{ background: 'linear-gradient(to right, rgba(0,0,0,0.6), rgba(0,0,0,0.3), rgba(0,0,0,0.6))', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.8), inset 1px 0 1px rgba(0,0,0,0.4), inset -1px 0 1px rgba(0,0,0,0.4), 0 0 1px rgba(255,255,255,0.05)' }} />
          {/* Side rails — thin highlight edges framing the slot */}
          <div className="absolute inset-y-2 pointer-events-none" style={{ left: 'calc(50% - 5px)', width: '1px', background: 'linear-gradient(to bottom, transparent, rgba(255,255,255,0.06) 20%, rgba(255,255,255,0.06) 80%, transparent)' }} />
          <div className="absolute inset-y-2 pointer-events-none" style={{ left: 'calc(50% + 5px)', width: '1px', background: 'linear-gradient(to bottom, transparent, rgba(255,255,255,0.06) 20%, rgba(255,255,255,0.06) 80%, transparent)' }} />
          <canvas
            ref={canvasRef}
            className="w-full h-full"
          />
          {/* Fader thumb — console-style wide capsule knob with ridges + bevel */}
          <div
            className={`absolute left-1/2 -translate-x-1/2 translate-y-1/2 w-[52px] h-7 rounded-[6px] border-2 pointer-events-none transition-all duration-150 ${
              isSensitivity
                ? 'border-cyan-300/60 bg-gradient-to-b from-blue-700 via-blue-800 to-blue-950'
                : autoGainEnabled
                  ? 'border-primary bg-gradient-to-b from-primary/90 via-primary to-primary/80'
                  : 'border-white/80 bg-gradient-to-b from-gray-50 via-gray-200 to-gray-400'
            }`}
            style={{
              bottom: `${thumbBottom}%`,
              boxShadow: isSensitivity
                ? '0 3px 10px rgba(0,210,210,0.35), 0 1px 4px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.12)'
                : autoGainEnabled
                  ? '0 3px 10px rgba(75,146,255,0.35), 0 1px 4px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.15)'
                  : '0 3px 10px rgba(255,255,255,0.2), 0 1px 4px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.6)',
            }}
            aria-hidden="true"
          >
            {/* Top bevel highlight — 3D plastic edge */}
            <div className={`absolute inset-x-0 top-0 h-[2px] rounded-t-[4px] ${
              isSensitivity ? 'bg-cyan-200/15' : autoGainEnabled ? 'bg-white/20' : 'bg-white/50'
            }`} />
            {/* Groove ridges — console fader tactile lines */}
            <div className={`absolute inset-x-2.5 top-[6px] h-[1.5px] rounded-full ${isSensitivity ? 'bg-blue-400/30' : autoGainEnabled ? 'bg-white/25' : 'bg-gray-500/40'}`} />
            <div className={`absolute inset-x-2 top-1/2 -translate-y-1/2 h-[2px] rounded-full ${isSensitivity ? 'bg-cyan-300/50' : autoGainEnabled ? 'bg-white/40' : 'bg-gray-600/60'}`} />
            <div className={`absolute inset-x-2.5 bottom-[6px] h-[1.5px] rounded-full ${isSensitivity ? 'bg-blue-400/30' : autoGainEnabled ? 'bg-white/25' : 'bg-gray-500/40'}`} />
          </div>
          {/* Guidance arrows — coach engineer toward sensitivity sweet spot */}
          {guidance.direction === 'up' && (
            <div
              className="absolute inset-x-0 pointer-events-none flex flex-col items-center gap-1"
              style={{ bottom: `${Math.max(thumbBottom + 8, 15)}%` }}
              aria-hidden="true"
            >
              <span className={`${arrowColors[0]} text-xl font-bold font-mono leading-none ${arrowAnim}`}>▲</span>
              <span className={`${arrowColors[1]} text-lg font-mono leading-none`}>▲</span>
              <span className={`${arrowColors[2]} text-base font-mono leading-none`}>▲</span>
              <span className={`${arrowColors[0]} text-[10px] font-mono font-bold leading-tight text-center`}>Missing</span>
              <span className={`${arrowColors[0]} text-[10px] font-mono leading-tight text-center opacity-70`}>Boost ▲</span>
            </div>
          )}
          {guidance.direction === 'down' && (
            <div
              className="absolute inset-x-0 pointer-events-none flex flex-col items-center gap-1"
              style={{ top: `${Math.min(100 - thumbBottom + 8, 85)}%` }}
              aria-hidden="true"
            >
              <span className={`${arrowColors[0]} text-xl font-bold font-mono leading-none ${arrowAnim}`}>▼</span>
              <span className={`${arrowColors[1]} text-lg font-mono leading-none`}>▼</span>
              <span className={`${arrowColors[2]} text-base font-mono leading-none`}>▼</span>
              <span className={`${arrowColors[0]} text-[10px] font-mono font-bold leading-tight text-center`}>Noisy</span>
              <span className={`${arrowColors[0]} text-[10px] font-mono leading-tight text-center opacity-70`}>Back Off</span>
            </div>
          )}
          {/* Screen reader guidance announcement */}
          {guidance.direction !== 'none' && (
            <span className="sr-only" role="status">
              {guidance.direction === 'up' ? 'Not detecting feedback — increase sensitivity' : 'Too many detections — decrease sensitivity'}
            </span>
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

    </div>
  )
})
