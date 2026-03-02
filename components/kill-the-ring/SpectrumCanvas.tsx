'use client'

import { useRef, useEffect, useCallback, useState } from 'react'
import Image from 'next/image'
import { useAnimationFrame } from '@/hooks/useAnimationFrame'
import { freqToLogPosition, clamp } from '@/lib/utils/mathHelpers'
import { getSeverityColor } from '@/lib/dsp/eqAdvisor'
import { formatFrequency } from '@/lib/utils/pitchUtils'
import { CANVAS_SETTINGS, VIZ_COLORS } from '@/lib/dsp/constants'
import type { SpectrumData, Advisory } from '@/types/advisory'

interface SpectrumCanvasProps {
  spectrum: SpectrumData | null
  advisories: Advisory[]
  isRunning: boolean
  graphFontSize?: number
}

const FREQ_LABELS = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]

export function SpectrumCanvas({ spectrum, advisories, isRunning, graphFontSize = 11 }: SpectrumCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const dimensionsRef = useRef({ width: 0, height: 0 })

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

        const canvas = canvasRef.current
        if (canvas) {
          const dpr = window.devicePixelRatio || 1
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
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const { width, height } = dimensionsRef.current
    if (width === 0 || height === 0) return

    // Clear
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, width, height)

    const padding = { top: 20, right: 40, bottom: 30, left: 50 }
    const plotWidth = width - padding.left - padding.right
    const plotHeight = height - padding.top - padding.bottom

    const { RTA_DB_MIN, RTA_DB_MAX, RTA_FREQ_MIN, RTA_FREQ_MAX } = CANVAS_SETTINGS

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

      // Gradient fill
      const gradient = ctx.createLinearGradient(0, 0, 0, plotHeight)
      gradient.addColorStop(0, 'rgba(16, 185, 129, 0.8)')
      gradient.addColorStop(0.5, 'rgba(16, 185, 129, 0.3)')
      gradient.addColorStop(1, 'rgba(16, 185, 129, 0.05)')

      ctx.beginPath()
      ctx.moveTo(0, plotHeight)

      for (let i = 1; i < n; i++) {
        const freq = i * hzPerBin
        if (freq < RTA_FREQ_MIN || freq > RTA_FREQ_MAX) continue

        const x = freqToLogPosition(freq, RTA_FREQ_MIN, RTA_FREQ_MAX) * plotWidth
        const db = clamp(freqDb[i], RTA_DB_MIN, RTA_DB_MAX)
        const y = ((RTA_DB_MAX - db) / (RTA_DB_MAX - RTA_DB_MIN)) * plotHeight

        if (i === 1) {
          ctx.moveTo(x, plotHeight)
          ctx.lineTo(x, y)
        } else {
          ctx.lineTo(x, y)
        }
      }

      ctx.lineTo(plotWidth, plotHeight)
      ctx.closePath()
      ctx.fillStyle = gradient
      ctx.fill()

      // Spectrum line
      ctx.strokeStyle = VIZ_COLORS.SPECTRUM
      ctx.lineWidth = 1.5
      ctx.beginPath()

      let started = false
      for (let i = 1; i < n; i++) {
        const freq = i * hzPerBin
        if (freq < RTA_FREQ_MIN || freq > RTA_FREQ_MAX) continue

        const x = freqToLogPosition(freq, RTA_FREQ_MIN, RTA_FREQ_MAX) * plotWidth
        const db = clamp(freqDb[i], RTA_DB_MIN, RTA_DB_MAX)
        const y = ((RTA_DB_MAX - db) / (RTA_DB_MAX - RTA_DB_MIN)) * plotHeight

        if (!started) {
          ctx.moveTo(x, y)
          started = true
        } else {
          ctx.lineTo(x, y)
        }
      }
      ctx.stroke()
    }

    // Draw peak markers for advisories
    for (const advisory of advisories) {
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
      ctx.arc(x, y, 5, 0, Math.PI * 2)
      ctx.fill()

      // Label
      ctx.fillStyle = color
      ctx.font = `${graphFontSize + 3}px system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.fillText(formatFrequency(freq), x, y - 10)
    }

    ctx.restore()

    // Draw axis labels
    ctx.fillStyle = '#666'
    ctx.font = `${graphFontSize}px system-ui, sans-serif`

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

  }, [spectrum, advisories, graphFontSize])

  useAnimationFrame(render, isRunning || spectrum !== null)

  return (
    <div ref={containerRef} className="relative w-full h-full">
      <canvas ref={canvasRef} className="w-full h-full" role="img" aria-label="Real-time audio frequency spectrum display" />
      {showPlaceholder && (
        <div className="absolute inset-0 pointer-events-none">
          <Image
            src="/rta-placeholder.jpg"
            alt="RTA spectrum placeholder"
            fill
            className="object-fill"
            priority
            sizes="100vw"
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="px-4 py-2 rounded-md bg-black/60 text-sm text-neutral-300 font-medium tracking-wide backdrop-blur-sm">
              Press Start to begin analysis
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
