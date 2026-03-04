'use client'

import { useRef, useEffect } from 'react'
import { freqToLogPosition } from '@/lib/utils/mathHelpers'
import { CANVAS_SETTINGS } from '@/lib/dsp/constants'
import type { FrequencyBin } from '@/lib/db/sessions'

interface FrequencyHistogramProps {
  bins: FrequencyBin[]
  height?: number
}

const SEVERITY_COLORS: Record<string, string> = {
  runaway:       '#ef4444',
  growing:       '#f97316',
  resonance:     '#eab308',
  possible_ring: '#a855f7',
  ring:          '#a855f7',
  whistle:       '#06b6d4',
  instrument:    '#22c55e',
  unknown:       '#6b7280',
}

const FREQ_MIN = CANVAS_SETTINGS.RTA_FREQ_MIN
const FREQ_MAX = CANVAS_SETTINGS.RTA_FREQ_MAX

export function FrequencyHistogram({ bins, height = 200 }: FrequencyHistogramProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const draw = (width: number) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`

      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.scale(dpr, dpr)
      ctx.clearRect(0, 0, width, height)

      const pad = {
        top: Math.round(height * 0.06),
        right: Math.round(width * 0.025),
        bottom: Math.round(height * 0.14),
        left: Math.round(width * 0.075),
      }
      const fontSize = Math.max(8, Math.min(13, Math.round(width * 0.01)))
      const plotW = width - pad.left - pad.right
      const plotH = height - pad.top - pad.bottom

      // Background
      ctx.fillStyle = '#0a0a0a'
      ctx.fillRect(pad.left, pad.top, plotW, plotH)

      if (bins.length === 0) {
        ctx.fillStyle = '#555'
        ctx.font = `${fontSize}px system-ui`
        ctx.textAlign = 'center'
        ctx.fillText('No detected issues in this session', pad.left + plotW / 2, pad.top + plotH / 2)
        return
      }

      const maxCount = Math.max(...bins.map((b) => b.count), 1)

      // Bar width: log-spaced — 2% of plot width per bar
      const BAR_HALF_W = Math.max(2, plotW * 0.008)

      for (const bin of bins) {
        const xNorm = freqToLogPosition(bin.bandHz, FREQ_MIN, FREQ_MAX)
        const x = pad.left + xNorm * plotW

        const barH = (bin.count / maxCount) * plotH
        const y = pad.top + plotH - barH

        // Pick color from dominant severity (keys may be UPPERCASE from DB)
        const dom = Object.entries(bin.severities).sort((a, b) => b[1] - a[1])[0]
        const color = dom ? (SEVERITY_COLORS[dom[0].toLowerCase()] ?? '#6b7280') : '#6b7280'

        ctx.fillStyle = color
        ctx.globalAlpha = 0.85
        ctx.fillRect(x - BAR_HALF_W, y, BAR_HALF_W * 2, barH)
        ctx.globalAlpha = 1
      }

      // Count axis (left)
      ctx.fillStyle = '#555'
      ctx.font = `${fontSize}px system-ui`
      ctx.textAlign = 'right'
      const steps = [0, 0.5, 1]
      for (const s of steps) {
        const y = pad.top + plotH - s * plotH
        const label = s === 0 ? '0' : s === 1 ? `${maxCount}` : `${Math.round(maxCount * 0.5)}`
        ctx.fillText(label, pad.left - 4, y + 3)
        // Grid line
        ctx.strokeStyle = '#1f1f1f'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(pad.left, y)
        ctx.lineTo(pad.left + plotW, y)
        ctx.stroke()
      }

      // Frequency axis (bottom)
      ctx.textAlign = 'center'
      const freqLabels = [100, 200, 500, 1000, 2000, 5000, 10000]
      for (const freq of freqLabels) {
        const x = pad.left + freqToLogPosition(freq, FREQ_MIN, FREQ_MAX) * plotW
        const label = freq >= 1000 ? `${freq / 1000}k` : `${freq}`
        ctx.fillStyle = '#555'
        ctx.fillText(label, x, height - 6)
        // Tick
        ctx.strokeStyle = '#333'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(x, pad.top + plotH)
        ctx.lineTo(x, pad.top + plotH + 4)
        ctx.stroke()
      }
    }

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        draw(entry.contentRect.width)
      }
    })
    ro.observe(container)
    draw(container.offsetWidth)
    return () => ro.disconnect()
  }, [bins, height])

  return (
    <div ref={containerRef} className="w-full" style={{ height }}>
      <canvas ref={canvasRef} className="w-full" style={{ height }} />
    </div>
  )
}
