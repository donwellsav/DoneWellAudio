'use client'

import React, { useRef, useEffect, useCallback, useState, memo } from 'react'
import Image from 'next/image'
import { useAnimationFrame } from '@/hooks/useAnimationFrame'
import { freqToLogPosition, logPositionToFreq, roundFreqToNice, clamp } from '@/lib/utils/mathHelpers'
import { getSeverityColor } from '@/lib/dsp/eqAdvisor'
import { formatFrequency } from '@/lib/utils/pitchUtils'
import { CANVAS_SETTINGS, VIZ_COLORS } from '@/lib/dsp/constants'
import type { SpectrumData, Advisory } from '@/types/advisory'
import type { EarlyWarning } from '@/hooks/useAudioAnalyzer'

// ─── Types for drawing functions ───────────────────────────────────────────────

interface DbRange {
  dbMin: number
  dbMax: number
  freqMin: number
  freqMax: number
}

// ─── Pure drawing functions (module-level, no component state) ─────────────────

const DB_MAJOR = [-90, -60, -30, 0]
const DB_MINOR = [-80, -70, -50, -40, -20, -10]
const DB_ALL = [...DB_MAJOR, ...DB_MINOR].sort((a, b) => a - b)

function drawGrid(
  ctx: CanvasRenderingContext2D,
  plotWidth: number,
  plotHeight: number,
  range: DbRange,
) {
  // Background
  ctx.fillStyle = '#0c0c0c'
  ctx.fillRect(0, 0, plotWidth, plotHeight)

  // Minor dB grid (subtle, drawn first)
  ctx.strokeStyle = '#161616'
  ctx.lineWidth = 0.5
  ctx.beginPath()
  for (const db of DB_MINOR) {
    const y = ((range.dbMax - db) / (range.dbMax - range.dbMin)) * plotHeight
    ctx.moveTo(0, y)
    ctx.lineTo(plotWidth, y)
  }
  ctx.stroke()

  // Major dB grid (brighter, on top)
  ctx.strokeStyle = '#2a2a2a'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (const db of DB_MAJOR) {
    const y = ((range.dbMax - db) / (range.dbMax - range.dbMin)) * plotHeight
    ctx.moveTo(0, y)
    ctx.lineTo(plotWidth, y)
  }
  ctx.stroke()

  // Frequency grid
  ctx.strokeStyle = '#1e1e1e'
  ctx.lineWidth = 0.5
  ctx.beginPath()
  for (const freq of FREQ_LABELS) {
    const x = freqToLogPosition(freq, range.freqMin, range.freqMax) * plotWidth
    ctx.moveTo(x, 0)
    ctx.lineTo(x, plotHeight)
  }
  ctx.stroke()
}

function drawIndicatorLines(
  ctx: CanvasRenderingContext2D,
  plotWidth: number,
  plotHeight: number,
  range: DbRange,
  spectrum: SpectrumData | null,
  showThresholdLine: boolean,
  feedbackThresholdDb: number | undefined,
  fontSize: number,
) {
  // Noise floor
  if (spectrum?.noiseFloorDb !== null && spectrum?.noiseFloorDb !== undefined) {
    const floorY = ((range.dbMax - spectrum.noiseFloorDb) / (range.dbMax - range.dbMin)) * plotHeight
    ctx.strokeStyle = VIZ_COLORS.NOISE_FLOOR
    ctx.lineWidth = 1
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(0, floorY)
    ctx.lineTo(plotWidth, floorY)
    ctx.stroke()
    ctx.setLineDash([])
    // Right-aligned label
    ctx.font = `${Math.max(8, fontSize - 2)}px monospace`
    ctx.fillStyle = VIZ_COLORS.NOISE_FLOOR
    ctx.globalAlpha = 0.7
    ctx.textAlign = 'right'
    ctx.fillText('Floor', plotWidth - 4, floorY - 4)
    ctx.globalAlpha = 1
    ctx.textAlign = 'left'
  }

  // Effective threshold
  if (showThresholdLine && spectrum?.effectiveThresholdDb != null) {
    const threshY = ((range.dbMax - spectrum.effectiveThresholdDb) / (range.dbMax - range.dbMin)) * plotHeight
    ctx.strokeStyle = VIZ_COLORS.THRESHOLD
    ctx.globalAlpha = 0.5
    ctx.lineWidth = 1.5
    ctx.setLineDash([6, 6])
    ctx.beginPath()
    ctx.moveTo(0, threshY)
    ctx.lineTo(plotWidth, threshY)
    ctx.stroke()
    ctx.setLineDash([])
    // Right-aligned label
    const threshLabel = `Thresh +${feedbackThresholdDb ?? 0}dB`
    ctx.font = `${Math.max(8, fontSize - 2)}px monospace`
    ctx.fillStyle = VIZ_COLORS.THRESHOLD
    ctx.textAlign = 'right'
    ctx.fillText(threshLabel, plotWidth - 4, threshY - 4)
    ctx.globalAlpha = 1
    ctx.textAlign = 'left'
  }
}

function drawSpectrum(
  ctx: CanvasRenderingContext2D,
  plotWidth: number,
  plotHeight: number,
  range: DbRange,
  spectrum: SpectrumData | null,
  gradientRef: React.RefObject<CanvasGradient | null>,
  gradientHeightRef: React.RefObject<number>,
  spectrumLineWidth: number,
) {
  if (!spectrum?.freqDb || !spectrum.sampleRate || !spectrum.fftSize) return

  const freqDb = spectrum.freqDb
  const hzPerBin = spectrum.sampleRate / spectrum.fftSize
  const n = freqDb.length

  // Cached gradient fill — only recreated when plotHeight changes
  let gradient = gradientRef.current
  if (!gradient || gradientHeightRef.current !== plotHeight) {
    gradient = ctx.createLinearGradient(0, 0, 0, plotHeight)
    gradient.addColorStop(0, 'rgba(16, 185, 129, 0.85)')
    gradient.addColorStop(0.5, 'rgba(16, 185, 129, 0.35)')
    gradient.addColorStop(1, 'rgba(16, 185, 129, 0.05)')
    ;(gradientRef as React.MutableRefObject<CanvasGradient | null>).current = gradient
    ;(gradientHeightRef as React.MutableRefObject<number>).current = plotHeight
  }

  // Single pass: build stroke path, then derive fill from it
  const strokePath = new Path2D()
  const fillPath = new Path2D()
  let firstX = 0
  let lastX = 0
  let started = false

  for (let i = 1; i < n; i++) {
    const freq = i * hzPerBin
    if (freq < range.freqMin || freq > range.freqMax) continue

    const x = freqToLogPosition(freq, range.freqMin, range.freqMax) * plotWidth
    const db = clamp(freqDb[i], range.dbMin, range.dbMax)
    const y = ((range.dbMax - db) / (range.dbMax - range.dbMin)) * plotHeight

    if (!started) {
      firstX = x
      strokePath.moveTo(x, y)
      fillPath.moveTo(x, plotHeight)
      fillPath.lineTo(x, y)
      started = true
    } else {
      strokePath.lineTo(x, y)
      fillPath.lineTo(x, y)
    }
    lastX = x
  }

  // Complete fill path back to baseline
  fillPath.lineTo(lastX, plotHeight)
  fillPath.closePath()

  // Draw fill then stroke (with glow)
  ctx.fillStyle = gradient
  ctx.fill(fillPath)

  // Glow pass — wider, semi-transparent
  ctx.strokeStyle = VIZ_COLORS.SPECTRUM
  ctx.globalAlpha = 0.15
  ctx.lineWidth = spectrumLineWidth + 2
  ctx.stroke(strokePath)

  // Sharp pass — crisp line on top
  ctx.globalAlpha = 1
  ctx.lineWidth = spectrumLineWidth
  ctx.stroke(strokePath)
}

function drawFreqRangeOverlay(
  ctx: CanvasRenderingContext2D,
  plotWidth: number,
  plotHeight: number,
  range: DbRange,
  freqRange: { min: number; max: number },
) {
  const rangeMinX = freqToLogPosition(Math.max(freqRange.min, range.freqMin), range.freqMin, range.freqMax) * plotWidth
  const rangeMaxX = freqToLogPosition(Math.min(freqRange.max, range.freqMax), range.freqMin, range.freqMax) * plotWidth

  // Dim overlay outside detection range
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)'
  if (rangeMinX > 0) ctx.fillRect(0, 0, rangeMinX, plotHeight)
  if (rangeMaxX < plotWidth) ctx.fillRect(rangeMaxX, 0, plotWidth - rangeMaxX, plotHeight)

  // Vertical boundary lines
  const lineColor = '#3b82f6' // blue-500
  ctx.strokeStyle = lineColor
  ctx.lineWidth = 2
  ctx.globalAlpha = 0.85

  // Min line
  ctx.beginPath()
  ctx.moveTo(rangeMinX, 0)
  ctx.lineTo(rangeMinX, plotHeight)
  ctx.stroke()

  // Max line
  ctx.beginPath()
  ctx.moveTo(rangeMaxX, 0)
  ctx.lineTo(rangeMaxX, plotHeight)
  ctx.stroke()

  // Grab handles (small rounded rects at vertical center)
  const handleW = 6
  const handleH = 24
  const handleY = (plotHeight - handleH) / 2
  ctx.fillStyle = lineColor
  ctx.globalAlpha = 0.7

  // Min handle
  const minHandleRect = new Path2D()
  minHandleRect.roundRect(rangeMinX - handleW / 2, handleY, handleW, handleH, 3)
  ctx.fill(minHandleRect)

  // Max handle
  const maxHandleRect = new Path2D()
  maxHandleRect.roundRect(rangeMaxX - handleW / 2, handleY, handleW, handleH, 3)
  ctx.fill(maxHandleRect)

  ctx.globalAlpha = 1
}

function drawMarkers(
  ctx: CanvasRenderingContext2D,
  plotWidth: number,
  plotHeight: number,
  range: DbRange,
  earlyWarning: EarlyWarning | null | undefined,
  advisories: Advisory[],
  clearedIds: Set<string> | undefined,
  peakMarkerRadius: number,
  fontSize: number,
) {
  // Early warning predictions
  if (earlyWarning && earlyWarning.predictedFrequencies.length > 0) {
    const warningColor = '#f59e0b' // amber-500
    ctx.strokeStyle = warningColor
    ctx.lineWidth = 1.5
    ctx.setLineDash([6, 4])
    ctx.globalAlpha = 0.6

    for (const freq of earlyWarning.predictedFrequencies) {
      if (freq < range.freqMin || freq > range.freqMax) continue
      const x = freqToLogPosition(freq, range.freqMin, range.freqMax) * plotWidth

      // Vertical dashed line
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, plotHeight)
      ctx.stroke()

      // Warning triangle at top
      ctx.fillStyle = warningColor
      ctx.beginPath()
      ctx.moveTo(x, 8)
      ctx.lineTo(x - 5, 0)
      ctx.lineTo(x + 5, 0)
      ctx.closePath()
      ctx.fill()
    }

    ctx.setLineDash([])
    ctx.globalAlpha = 1
  }

  // Advisory peak markers (persist until cleared, cap at 7)
  const visibleAdvisories = advisories
    .filter(a => !clearedIds?.has(a.id))
    .slice(-7)
  for (const advisory of visibleAdvisories) {
    const freq = advisory.trueFrequencyHz
    const db = advisory.trueAmplitudeDb
    const x = freqToLogPosition(freq, range.freqMin, range.freqMax) * plotWidth
    const y = ((range.dbMax - clamp(db, range.dbMin, range.dbMax)) / (range.dbMax - range.dbMin)) * plotHeight
    const color = getSeverityColor(advisory.severity)

    // Vertical line
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.globalAlpha = 0.7
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x, plotHeight)
    ctx.stroke()
    ctx.globalAlpha = 1

    // Peak dot
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(x, y, peakMarkerRadius, 0, Math.PI * 2)
    ctx.fill()

    // Frequency label
    ctx.fillStyle = color
    ctx.font = `${fontSize + 3}px monospace`
    ctx.textAlign = 'center'
    ctx.fillText(formatFrequency(freq), x, y - 10)
  }
}

function drawAxisLabels(
  ctx: CanvasRenderingContext2D,
  padding: { top: number; left: number; right: number; bottom: number },
  plotWidth: number,
  plotHeight: number,
  range: DbRange,
  fontSize: number,
  width: number,
  height: number,
) {
  ctx.fillStyle = '#888'
  ctx.font = `${fontSize}px monospace`

  // Y-axis (dB)
  ctx.textAlign = 'right'
  for (const db of DB_ALL) {
    const y = padding.top + ((range.dbMax - db) / (range.dbMax - range.dbMin)) * plotHeight
    ctx.fillText(`${db}`, padding.left - 5, y + 3)
  }

  // X-axis (Hz)
  ctx.textAlign = 'center'
  for (const freq of FREQ_LABELS) {
    const x = padding.left + freqToLogPosition(freq, range.freqMin, range.freqMax) * plotWidth
    const label = freq >= 1000 ? `${freq / 1000}k` : `${freq}`
    ctx.fillText(label, x, height - 8)
  }
}

// ─── Component ─────────────────────────────────────────────────────────────────

interface SpectrumCanvasProps {
  spectrumRef: React.RefObject<SpectrumData | null>
  advisories: Advisory[]  // Keep as prop — changes infrequently, drives markers
  isRunning: boolean
  graphFontSize?: number
  onStart?: () => void
  earlyWarning?: EarlyWarning | null
  rtaDbMin?: number
  rtaDbMax?: number
  spectrumLineWidth?: number
  clearedIds?: Set<string>
  minFrequency?: number
  maxFrequency?: number
  onFreqRangeChange?: (min: number, max: number) => void
  showThresholdLine?: boolean
  feedbackThresholdDb?: number
}

const FREQ_LABELS = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]

const GRAB_THRESHOLD_PX = 22 // 44px total touch target per line

export const SpectrumCanvas = memo(function SpectrumCanvas({ spectrumRef, advisories, isRunning, graphFontSize = 11, onStart, earlyWarning, rtaDbMin: rtaDbMinProp, rtaDbMax: rtaDbMaxProp, spectrumLineWidth: spectrumLineWidthProp, clearedIds, minFrequency = 20, maxFrequency = 20000, onFreqRangeChange, showThresholdLine = false, feedbackThresholdDb }: SpectrumCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const dimensionsRef = useRef({ width: 0, height: 0 })
  const advisoriesRef = useRef(advisories)
  advisoriesRef.current = advisories
  const clearedIdsRef = useRef(clearedIds)
  clearedIdsRef.current = clearedIds

  // Freq range ref for 60fps reads during drag (avoids React re-renders)
  const freqRangeRef = useRef({ min: minFrequency, max: maxFrequency })
  useEffect(() => {
    freqRangeRef.current = { min: minFrequency, max: maxFrequency }
  }, [minFrequency, maxFrequency])

  // Drag state
  const dragRef = useRef<'min' | 'max' | null>(null)
  const paddingRef = useRef({ left: 0, top: 0, plotWidth: 0, plotHeight: 0 })
  const onFreqRangeChangeRef = useRef(onFreqRangeChange)
  onFreqRangeChangeRef.current = onFreqRangeChange

  // Cached per-frame objects — avoid recreating every frame
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null)
  const dprRef = useRef(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1)
  const gradientRef = useRef<CanvasGradient | null>(null)
  const gradientHeightRef = useRef(0)

  // Dirty-bit: skip canvas redraw when nothing has changed
  const lastSpectrumRef = useRef<SpectrumData | null>(null)
  const dirtyRef = useRef(true) // Start dirty to ensure first frame draws

  // Track whether analysis has ever started; once true the placeholder is gone for good
  const [hasEverStarted, setHasEverStarted] = useState(false)
  useEffect(() => {
    if (isRunning) setHasEverStarted(true)
  }, [isRunning])

  const showPlaceholder = !hasEverStarted

  // Handle resize
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        dimensionsRef.current = { width, height }

        const dpr = window.devicePixelRatio || 1
        dprRef.current = dpr

        // Invalidate cached objects on resize (canvas element may change)
        ctxRef.current = null
        gradientRef.current = null
        dirtyRef.current = true

        const canvas = canvasRef.current
        if (canvas) {
          canvas.width = Math.floor(width * dpr)
          canvas.height = Math.floor(height * dpr)
          canvas.style.width = `${width}px`
          canvas.style.height = `${height}px`
        }
      }
    })

    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  const render = useCallback(() => {
    const spectrum = spectrumRef.current

    // Dirty check: skip frame if nothing changed since last draw
    const spectrumChanged = spectrum !== lastSpectrumRef.current
    if (!spectrumChanged && !dirtyRef.current) return
    lastSpectrumRef.current = spectrum
    dirtyRef.current = false

    const canvas = canvasRef.current
    if (!canvas) return

    if (!ctxRef.current) ctxRef.current = canvas.getContext('2d')
    const ctx = ctxRef.current
    if (!ctx) return

    const dpr = dprRef.current
    const { width, height } = dimensionsRef.current
    if (width === 0 || height === 0) return

    // Clear
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, width, height)

    const padding = {
      top: Math.round(height * 0.05),
      right: Math.round(width * 0.035),
      bottom: Math.round(height * 0.075),
      left: Math.round(width * 0.044),
    }
    const plotWidth = width - padding.left - padding.right
    const plotHeight = height - padding.top - padding.bottom

    // Scale font size proportionally to canvas width, clamped to readable range
    const scaledFontSize = Math.max(9, Math.min(16, Math.round(width * 0.01)))
    const fontSize = Math.round((graphFontSize + scaledFontSize) / 2)
    const peakMarkerRadius = Math.max(3, Math.round(width * 0.005))

    const range: DbRange = {
      dbMin: rtaDbMinProp ?? CANVAS_SETTINGS.RTA_DB_MIN,
      dbMax: rtaDbMaxProp ?? CANVAS_SETTINGS.RTA_DB_MAX,
      freqMin: CANVAS_SETTINGS.RTA_FREQ_MIN,
      freqMax: CANVAS_SETTINGS.RTA_FREQ_MAX,
    }

    // ── Draw phases ──────────────────────────────────────────────
    ctx.save()
    ctx.translate(padding.left, padding.top)

    drawGrid(ctx, plotWidth, plotHeight, range)
    drawIndicatorLines(ctx, plotWidth, plotHeight, range, spectrum, showThresholdLine, feedbackThresholdDb, fontSize)
    drawSpectrum(ctx, plotWidth, plotHeight, range, spectrum, gradientRef, gradientHeightRef, spectrumLineWidthProp ?? 1.5)

    // Store padding for pointer event calculations
    paddingRef.current = { left: padding.left, top: padding.top, plotWidth, plotHeight }

    drawFreqRangeOverlay(ctx, plotWidth, plotHeight, range, freqRangeRef.current)
    drawMarkers(ctx, plotWidth, plotHeight, range, earlyWarning, advisoriesRef.current, clearedIdsRef.current, peakMarkerRadius, fontSize)

    ctx.restore()

    drawAxisLabels(ctx, padding, plotWidth, plotHeight, range, fontSize, width, height)

  }, [graphFontSize, earlyWarning, rtaDbMinProp, rtaDbMaxProp, spectrumLineWidthProp, showThresholdLine, feedbackThresholdDb])

  useAnimationFrame(render, isRunning || hasEverStarted)

  // Mark dirty when display props change (triggers redraw on next rAF tick)
  useEffect(() => { dirtyRef.current = true }, [graphFontSize, earlyWarning, rtaDbMinProp, rtaDbMaxProp, spectrumLineWidthProp, showThresholdLine, feedbackThresholdDb])
  useEffect(() => { dirtyRef.current = true }, [advisories, clearedIds])

  // Pointer event handlers for dragging frequency range lines
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !onFreqRangeChange) return

    const { RTA_FREQ_MIN, RTA_FREQ_MAX } = CANVAS_SETTINGS

    function clientXToFreq(clientX: number): number {
      const rect = canvas!.getBoundingClientRect()
      const { left: padLeft, plotWidth } = paddingRef.current
      const canvasX = clientX - rect.left - padLeft
      const pos = clamp(canvasX / plotWidth, 0, 1)
      return roundFreqToNice(logPositionToFreq(pos, RTA_FREQ_MIN, RTA_FREQ_MAX))
    }

    function getLineDistances(clientX: number): { minDist: number; maxDist: number } {
      const rect = canvas!.getBoundingClientRect()
      const { left: padLeft, plotWidth } = paddingRef.current
      const canvasX = clientX - rect.left - padLeft
      const minX = freqToLogPosition(freqRangeRef.current.min, RTA_FREQ_MIN, RTA_FREQ_MAX) * plotWidth
      const maxX = freqToLogPosition(freqRangeRef.current.max, RTA_FREQ_MIN, RTA_FREQ_MAX) * plotWidth
      return { minDist: Math.abs(canvasX - minX), maxDist: Math.abs(canvasX - maxX) }
    }

    function onPointerDown(e: PointerEvent) {
      const { minDist, maxDist } = getLineDistances(e.clientX)
      const closest = minDist <= maxDist ? 'min' : 'max'
      const dist = Math.min(minDist, maxDist)

      if (dist > GRAB_THRESHOLD_PX) return

      e.preventDefault()
      dragRef.current = closest
      canvas!.setPointerCapture(e.pointerId)
      canvas!.style.cursor = 'ew-resize'
    }

    function onPointerMove(e: PointerEvent) {
      if (dragRef.current) {
        const hz = clientXToFreq(e.clientX)
        const range = freqRangeRef.current
        dirtyRef.current = true // Force redraw during drag

        if (dragRef.current === 'min') {
          const newMin = Math.min(hz, range.max - 50)
          freqRangeRef.current = { min: newMin, max: range.max }
          onFreqRangeChangeRef.current?.(newMin, range.max)
        } else {
          const newMax = Math.max(hz, range.min + 50)
          freqRangeRef.current = { min: range.min, max: newMax }
          onFreqRangeChangeRef.current?.(range.min, newMax)
        }
      } else {
        // Hover cursor change
        const { minDist, maxDist } = getLineDistances(e.clientX)
        const nearLine = Math.min(minDist, maxDist) <= GRAB_THRESHOLD_PX
        canvas!.style.cursor = nearLine ? 'ew-resize' : 'default'
      }
    }

    function onPointerUp(e: PointerEvent) {
      if (dragRef.current) {
        dragRef.current = null
        canvas!.releasePointerCapture(e.pointerId)
        canvas!.style.cursor = 'default'
      }
    }

    function onPointerCancel(e: PointerEvent) {
      if (dragRef.current) {
        dragRef.current = null
        canvas!.releasePointerCapture(e.pointerId)
        canvas!.style.cursor = 'default'
      }
    }

    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointercancel', onPointerCancel)

    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerCancel)
    }
  }, [onFreqRangeChange])

  return (
    <div ref={containerRef} className="relative w-full h-full">
      <canvas ref={canvasRef} className="w-full h-full" role="img" aria-label="Real-time audio frequency spectrum display" />
      {showPlaceholder && (
        <div className="absolute inset-0">
          <Image
            src="/rta-placeholder.jpg"
            alt="RTA spectrum placeholder"
            fill
            className="object-fill"
            priority
            sizes="100vw"
          />
          <div
            className={`absolute inset-0 flex items-center justify-center ${onStart ? 'cursor-pointer' : 'pointer-events-none'}`}
            onClick={onStart}
            role={onStart ? 'button' : undefined}
            aria-label={onStart ? 'Start analysis' : undefined}
            tabIndex={onStart ? 0 : undefined}
            onKeyDown={onStart ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onStart(); } } : undefined}
          >
            <span className="flex items-center gap-2 px-4 py-2 rounded-md bg-black/60 text-sm text-neutral-300 font-medium tracking-wide backdrop-blur-sm pointer-events-none">
              Press
              {/* mini speaker button replica */}
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full border border-primary/60 flex-shrink-0">
                <svg className="w-3.5 h-3.5 text-primary/80" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.31-2.5-4.06v8.12c1.48-.75 2.5-2.29 2.5-4.06zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                </svg>
              </span>
              To Begin Analysis
            </span>
          </div>
        </div>
      )}
    </div>
  )
})
