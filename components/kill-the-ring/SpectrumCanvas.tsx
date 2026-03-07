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
}

const FREQ_LABELS = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]

const GRAB_THRESHOLD_PX = 22 // 44px total touch target per line

export const SpectrumCanvas = memo(function SpectrumCanvas({ spectrumRef, advisories, isRunning, graphFontSize = 11, onStart, earlyWarning, rtaDbMin: rtaDbMinProp, rtaDbMax: rtaDbMaxProp, spectrumLineWidth: spectrumLineWidthProp, clearedIds, minFrequency = 20, maxFrequency = 20000, onFreqRangeChange }: SpectrumCanvasProps) {
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
  // Dirty-bit: skip redraw when spectrum + advisories haven't changed
  const lastRenderedTimestampRef = useRef(-1)
  const lastAdvisorySignatureRef = useRef('')

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

    const canvas = canvasRef.current
    if (!canvas) return

    // Dirty-bit check: skip redraw when nothing changed
    const advs = advisoriesRef.current
    const advSig = advs.length > 0 ? `${advs.length}:${advs[0].id}:${advs[advs.length - 1].id}` : ''
    const specTs = spectrum?.timestamp ?? -1
    const isDragging = dragRef.current !== null
    if (
      specTs === lastRenderedTimestampRef.current &&
      advSig === lastAdvisorySignatureRef.current &&
      !isDragging
    ) {
      return // Nothing changed, skip redraw
    }
    lastRenderedTimestampRef.current = specTs
    lastAdvisorySignatureRef.current = advSig

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

    const { RTA_FREQ_MIN, RTA_FREQ_MAX } = CANVAS_SETTINGS
    const RTA_DB_MIN = rtaDbMinProp ?? CANVAS_SETTINGS.RTA_DB_MIN
    const RTA_DB_MAX = rtaDbMaxProp ?? CANVAS_SETTINGS.RTA_DB_MAX

    // Draw grid
    ctx.save()
    ctx.translate(padding.left, padding.top)

    // Background
    ctx.fillStyle = '#0a0a0a'
    ctx.fillRect(0, 0, plotWidth, plotHeight)

    // Grid lines
    ctx.strokeStyle = '#1a1a1a'
    ctx.lineWidth = 1

    // Horizontal grid (dB)
    const dbSteps = [-90, -80, -70, -60, -50, -40, -30, -20, -10, 0]
    ctx.beginPath()
    for (const db of dbSteps) {
      const y = ((RTA_DB_MAX - db) / (RTA_DB_MAX - RTA_DB_MIN)) * plotHeight
      ctx.moveTo(0, y)
      ctx.lineTo(plotWidth, y)
    }
    ctx.stroke()

    // Vertical grid (frequency)
    ctx.beginPath()
    for (const freq of FREQ_LABELS) {
      const x = freqToLogPosition(freq, RTA_FREQ_MIN, RTA_FREQ_MAX) * plotWidth
      ctx.moveTo(x, 0)
      ctx.lineTo(x, plotHeight)
    }
    ctx.stroke()

    // Draw noise floor
    if (spectrum?.noiseFloorDb !== null && spectrum?.noiseFloorDb !== undefined) {
      const floorY = ((RTA_DB_MAX - spectrum.noiseFloorDb) / (RTA_DB_MAX - RTA_DB_MIN)) * plotHeight
      ctx.strokeStyle = VIZ_COLORS.NOISE_FLOOR
      ctx.lineWidth = 1
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      ctx.moveTo(0, floorY)
      ctx.lineTo(plotWidth, floorY)
      ctx.stroke()
      ctx.setLineDash([])
    }

    // Draw spectrum
    if (spectrum?.freqDb && spectrum.sampleRate && spectrum.fftSize) {
      const freqDb = spectrum.freqDb
      const hzPerBin = spectrum.sampleRate / spectrum.fftSize
      const n = freqDb.length

      // Cached gradient fill — only recreated when plotHeight changes
      let gradient = gradientRef.current
      if (!gradient || gradientHeightRef.current !== plotHeight) {
        gradient = ctx.createLinearGradient(0, 0, 0, plotHeight)
        gradient.addColorStop(0, 'rgba(16, 185, 129, 0.8)')
        gradient.addColorStop(0.5, 'rgba(16, 185, 129, 0.3)')
        gradient.addColorStop(1, 'rgba(16, 185, 129, 0.05)')
        gradientRef.current = gradient
        gradientHeightRef.current = plotHeight
      }

      // Single pass: build stroke path, then derive fill from it
      const strokePath = new Path2D()
      const fillPath = new Path2D()
      let firstX = 0
      let lastX = 0
      let started = false

      for (let i = 1; i < n; i++) {
        const freq = i * hzPerBin
        if (freq < RTA_FREQ_MIN || freq > RTA_FREQ_MAX) continue

        const x = freqToLogPosition(freq, RTA_FREQ_MIN, RTA_FREQ_MAX) * plotWidth
        const db = clamp(freqDb[i], RTA_DB_MIN, RTA_DB_MAX)
        const y = ((RTA_DB_MAX - db) / (RTA_DB_MAX - RTA_DB_MIN)) * plotHeight

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

      // Draw fill then stroke
      ctx.fillStyle = gradient
      ctx.fill(fillPath)

      ctx.strokeStyle = VIZ_COLORS.SPECTRUM
      ctx.lineWidth = spectrumLineWidthProp ?? 1.5
      ctx.stroke(strokePath)
    }

    // Store padding for pointer event calculations
    paddingRef.current = { left: padding.left, top: padding.top, plotWidth, plotHeight }

    // Draw frequency range overlay + draggable lines
    const rangeMinHz = freqRangeRef.current.min
    const rangeMaxHz = freqRangeRef.current.max
    const rangeMinX = freqToLogPosition(Math.max(rangeMinHz, RTA_FREQ_MIN), RTA_FREQ_MIN, RTA_FREQ_MAX) * plotWidth
    const rangeMaxX = freqToLogPosition(Math.min(rangeMaxHz, RTA_FREQ_MAX), RTA_FREQ_MIN, RTA_FREQ_MAX) * plotWidth

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

    // Draw early warning predictions (predicted feedback frequencies)
    if (earlyWarning && earlyWarning.predictedFrequencies.length > 0) {
      const warningColor = '#f59e0b' // amber-500 for early warnings
      ctx.strokeStyle = warningColor
      ctx.lineWidth = 1.5
      ctx.setLineDash([6, 4]) // Dashed line for predictions
      ctx.globalAlpha = 0.6

      for (const freq of earlyWarning.predictedFrequencies) {
        if (freq < RTA_FREQ_MIN || freq > RTA_FREQ_MAX) continue
        const x = freqToLogPosition(freq, RTA_FREQ_MIN, RTA_FREQ_MAX) * plotWidth

        // Draw vertical dashed line
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, plotHeight)
        ctx.stroke()

        // Draw small warning triangle at top
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

    // Draw peak markers for advisories (persist until cleared, cap at 7)
    const visibleAdvisories = advisoriesRef.current
      .filter(a => !clearedIdsRef.current?.has(a.id))
      .slice(-7)
    for (const advisory of visibleAdvisories) {
      const freq = advisory.trueFrequencyHz
      const db = advisory.trueAmplitudeDb
      const x = freqToLogPosition(freq, RTA_FREQ_MIN, RTA_FREQ_MAX) * plotWidth
      const y = ((RTA_DB_MAX - clamp(db, RTA_DB_MIN, RTA_DB_MAX)) / (RTA_DB_MAX - RTA_DB_MIN)) * plotHeight
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

      // Peak marker
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(x, y, peakMarkerRadius, 0, Math.PI * 2)
      ctx.fill()

      // Label
      ctx.fillStyle = color
      ctx.font = `${fontSize + 3}px system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.fillText(formatFrequency(freq), x, y - 10)
    }

    ctx.restore()

    // Draw axis labels
    ctx.fillStyle = '#666'
    ctx.font = `${fontSize}px system-ui, sans-serif`

    // Y-axis (dB)
    ctx.textAlign = 'right'
    for (const db of dbSteps) {
      const y = padding.top + ((RTA_DB_MAX - db) / (RTA_DB_MAX - RTA_DB_MIN)) * plotHeight
      ctx.fillText(`${db}`, padding.left - 5, y + 3)
    }

    // X-axis (Hz)
    ctx.textAlign = 'center'
    for (const freq of FREQ_LABELS) {
      const x = padding.left + freqToLogPosition(freq, RTA_FREQ_MIN, RTA_FREQ_MAX) * plotWidth
      const label = freq >= 1000 ? `${freq / 1000}k` : `${freq}`
      ctx.fillText(label, x, height - 8)
    }

    // Axis titles
    ctx.save()
    ctx.translate(12, height / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.textAlign = 'center'
    ctx.fillStyle = '#666'
    ctx.fillText('dB', 0, 0)
    ctx.restore()

    ctx.fillStyle = '#666'
    ctx.textAlign = 'center'
    ctx.fillText('Hz', width / 2, height - 2)

  }, [graphFontSize, earlyWarning, rtaDbMinProp, rtaDbMaxProp, spectrumLineWidthProp])

  useAnimationFrame(render, isRunning || hasEverStarted)

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
