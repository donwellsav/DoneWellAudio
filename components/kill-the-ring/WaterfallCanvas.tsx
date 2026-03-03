'use client'

import { useRef, useEffect, useCallback } from 'react'
import { useAnimationFrame } from '@/hooks/useAnimationFrame'
import { freqToLogPosition, clamp } from '@/lib/utils/mathHelpers'
import { CANVAS_SETTINGS } from '@/lib/dsp/constants'
import type { SpectrumData } from '@/types/advisory'

interface WaterfallCanvasProps {
  spectrum: SpectrumData | null
  isRunning: boolean
  graphFontSize?: number
}

// Increased history for smoother scrolling and better resolution
const HISTORY_SIZE = 256

export function WaterfallCanvas({ spectrum, isRunning, graphFontSize = 11 }: WaterfallCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const dimensionsRef = useRef({ width: 0, height: 0, dpr: 1 })
  const historyRef = useRef<Float32Array[]>([])
  const frameTimesRef = useRef<number[]>([])
  const lastSpectrumRef = useRef<number>(0)
  // Pre-computed ImageData for efficient rendering
  const imageDataRef = useRef<ImageData | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        const dpr = window.devicePixelRatio || 1
        dimensionsRef.current = { width, height, dpr }

        const canvas = canvasRef.current
        if (canvas) {
          // Set canvas resolution to match display pixels for crisp rendering
          canvas.width = Math.floor(width * dpr)
          canvas.height = Math.floor(height * dpr)
          canvas.style.width = `${width}px`
          canvas.style.height = `${height}px`
          // Reset ImageData cache on resize
          imageDataRef.current = null
        }
      }
    })

    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  // Update history
  useEffect(() => {
    if (!spectrum?.freqDb || !isRunning) return
    if (spectrum.timestamp === lastSpectrumRef.current) return

    lastSpectrumRef.current = spectrum.timestamp

    const copy = new Float32Array(spectrum.freqDb)
    historyRef.current.push(copy)
    frameTimesRef.current.push(Date.now())

    while (historyRef.current.length > HISTORY_SIZE) {
      historyRef.current.shift()
      frameTimesRef.current.shift()
    }
  }, [spectrum, isRunning])

  const render = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) return

    const { width, height, dpr } = dimensionsRef.current
    if (width === 0 || height === 0) return

    // Work in physical pixels for crisp rendering
    const canvasWidth = Math.floor(width * dpr)
    const canvasHeight = Math.floor(height * dpr)

    ctx.setTransform(1, 0, 0, 1, 0, 0)

    // Padding in physical pixels
    const padding = {
      top: Math.floor(10 * dpr),
      right: Math.floor(10 * dpr),
      bottom: Math.floor(20 * dpr),
      left: Math.floor(38 * dpr),
    }
    const plotWidth = canvasWidth - padding.left - padding.right
    const plotHeight = canvasHeight - padding.top - padding.bottom

    // Clear entire canvas
    ctx.fillStyle = '#0a0a0a'
    ctx.fillRect(0, 0, canvasWidth, canvasHeight)

    const history = historyRef.current
    const { RTA_DB_MIN, RTA_DB_MAX, RTA_FREQ_MIN, RTA_FREQ_MAX } = CANVAS_SETTINGS
    const currentSpectrum = spectrum

    if (history.length === 0 || !currentSpectrum?.sampleRate || !currentSpectrum?.fftSize) {
      // Draw placeholder state
      ctx.fillStyle = '#1a1a1a'
      ctx.fillRect(padding.left, padding.top, plotWidth, plotHeight)
      return
    }

    const hzPerBin = currentSpectrum.sampleRate / currentSpectrum.fftSize
    const n = history[0]?.length ?? 0

    // Use full plot width for columns (1:1 pixel mapping for sharpness)
    const numCols = plotWidth
    const numRows = history.length

    // Create or reuse ImageData for efficient pixel manipulation
    if (!imageDataRef.current || imageDataRef.current.width !== plotWidth || imageDataRef.current.height !== plotHeight) {
      imageDataRef.current = ctx.createImageData(plotWidth, plotHeight)
    }
    const imageData = imageDataRef.current
    const data = imageData.data

    // Clear to background color
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 10     // R
      data[i + 1] = 10 // G
      data[i + 2] = 10 // B
      data[i + 3] = 255 // A
    }

    // Pre-compute frequency to bin mapping for each column
    const logFreqMin = Math.log10(RTA_FREQ_MIN)
    const logFreqRange = Math.log10(RTA_FREQ_MAX) - logFreqMin

    // Draw waterfall using ImageData for performance
    for (let row = 0; row < numRows; row++) {
      const spectrumRow = history[numRows - 1 - row] // Newest at top
      if (!spectrumRow) continue

      // Scale row position to fit within plotHeight
      const yStart = Math.floor((row / HISTORY_SIZE) * plotHeight)
      const yEnd = Math.floor(((row + 1) / HISTORY_SIZE) * plotHeight)
      const rowPixelHeight = Math.max(1, yEnd - yStart)

      for (let col = 0; col < numCols; col++) {
        // Map column to frequency (logarithmic)
        const logPos = col / numCols
        const freq = Math.pow(10, logFreqMin + logPos * logFreqRange)
        const bin = Math.round(freq / hzPerBin)

        if (bin < 1 || bin >= n) continue

        const db = clamp(spectrumRow[bin], RTA_DB_MIN, RTA_DB_MAX)
        const normalized = (db - RTA_DB_MIN) / (RTA_DB_MAX - RTA_DB_MIN)

        // Improved color mapping: deep blue -> cyan -> green -> yellow -> red
        let r: number, g: number, b: number
        if (normalized < 0.2) {
          // Deep blue to blue
          const t = normalized / 0.2
          r = 0
          g = Math.floor(t * 50)
          b = Math.floor(80 + t * 100)
        } else if (normalized < 0.4) {
          // Blue to cyan
          const t = (normalized - 0.2) / 0.2
          r = 0
          g = Math.floor(50 + t * 150)
          b = Math.floor(180 - t * 30)
        } else if (normalized < 0.6) {
          // Cyan to green
          const t = (normalized - 0.4) / 0.2
          r = Math.floor(t * 80)
          g = Math.floor(200 + t * 55)
          b = Math.floor(150 - t * 150)
        } else if (normalized < 0.8) {
          // Green to yellow
          const t = (normalized - 0.6) / 0.2
          r = Math.floor(80 + t * 175)
          g = 255
          b = 0
        } else {
          // Yellow to red
          const t = (normalized - 0.8) / 0.2
          r = 255
          g = Math.floor(255 - t * 255)
          b = 0
        }

        // Fill all pixels in this cell
        for (let py = 0; py < rowPixelHeight; py++) {
          const pixelY = yStart + py
          if (pixelY >= plotHeight) break
          const idx = (pixelY * plotWidth + col) * 4
          data[idx] = r
          data[idx + 1] = g
          data[idx + 2] = b
          data[idx + 3] = 255
        }
      }
    }

    // Draw the waterfall image
    ctx.putImageData(imageData, padding.left, padding.top)

    // ── Axes (scaled by DPR) ──────────────────────────────────
    const times = frameTimesRef.current
    const numFrames = times.length
    const nowMs = times[numFrames - 1] ?? Date.now()
    const oldestMs = times[0] ?? nowMs
    const totalMs = Math.max(1, nowMs - oldestMs)

    ctx.fillStyle = '#666'
    ctx.font = `${Math.floor(graphFontSize * dpr)}px system-ui, sans-serif`
    ctx.textAlign = 'right'

    // "Now" label at top
    ctx.fillText('Now', padding.left - 4 * dpr, padding.top + 10 * dpr)

    // Time tick intervals
    const intervals = [1000, 2000, 5000, 10000, 30000]
    const targetTicks = 4
    let tickInterval = intervals[0]
    for (const iv of intervals) {
      if (totalMs / iv <= targetTicks) { tickInterval = iv; break }
      tickInterval = iv
    }

    let tickMs = Math.floor(nowMs / tickInterval) * tickInterval
    while (tickMs > oldestMs) {
      const age = nowMs - tickMs
      const rowFraction = numFrames > 1 ? age / totalMs : 0
      const y = padding.top + rowFraction * plotHeight

      if (y >= padding.top && y <= padding.top + plotHeight) {
        const ageS = Math.round(age / 1000)
        ctx.fillText(`${ageS}s`, padding.left - 4 * dpr, y + 4 * dpr)

        ctx.strokeStyle = '#222'
        ctx.lineWidth = dpr
        ctx.beginPath()
        ctx.moveTo(padding.left, y)
        ctx.lineTo(padding.left + plotWidth, y)
        ctx.stroke()
      }

      tickMs -= tickInterval
    }

    // Frequency axis (bottom)
    ctx.textAlign = 'center'
    const freqLabels = [100, 1000, 10000]
    for (const freq of freqLabels) {
      const x = padding.left + freqToLogPosition(freq, RTA_FREQ_MIN, RTA_FREQ_MAX) * plotWidth
      const label = freq >= 1000 ? `${freq / 1000}k` : `${freq}`
      ctx.fillText(label, x, canvasHeight - 4 * dpr)
    }

  }, [spectrum, graphFontSize])

  useAnimationFrame(render, isRunning || historyRef.current.length > 0)

  const showPlaceholder = !isRunning && historyRef.current.length === 0

  return (
    <div ref={containerRef} className="w-full h-full relative bg-[#0a0a0a]">
      {showPlaceholder ? (
        <div className="w-full h-full flex flex-col items-center justify-center gap-4">
          {/* Stylized waterfall preview */}
          <div className="w-48 h-32 rounded-lg overflow-hidden relative">
            <div 
              className="absolute inset-0"
              style={{
                background: `linear-gradient(to bottom, 
                  #0a0a0a 0%, 
                  #001428 15%, 
                  #002850 30%, 
                  #004080 45%, 
                  #006060 55%, 
                  #008040 65%, 
                  #40a020 75%, 
                  #80c000 85%, 
                  #c0a000 92%, 
                  #ff4000 100%
                )`,
              }}
            />
            {/* Simulated frequency lines */}
            <div className="absolute inset-0 opacity-30">
              {[...Array(8)].map((_, i) => (
                <div
                  key={i}
                  className="absolute h-full w-px bg-white/20"
                  style={{ left: `${12 + i * 12}%` }}
                />
              ))}
            </div>
          </div>
          <div className="text-center">
            <p className="text-muted-foreground text-sm font-medium">Waterfall Spectrogram</p>
            <p className="text-muted-foreground/60 text-xs mt-1">Press Start to begin analysis</p>
          </div>
        </div>
      ) : (
        <canvas 
          ref={canvasRef} 
          className="w-full h-full" 
          role="img" 
          aria-label="Waterfall spectrogram showing frequency changes over time" 
        />
      )}
    </div>
  )
}
