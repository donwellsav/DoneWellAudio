'use client'

import { useRef, useEffect, useCallback, useMemo } from 'react'
import { useAnimationFrame } from '@/hooks/useAnimationFrame'
import { ISO_31_BANDS } from '@/lib/dsp/constants'
import { getSeverityColor } from '@/lib/dsp/eqAdvisor'
import type { Advisory } from '@/types/advisory'

// ISO 31-band labels matching standard GEQ notation
const GEQ_BAND_LABELS = [
  '20', '25', '31.5', '40', '50', '63', '80', '100', '125', '160',
  '200', '250', '315', '400', '500', '630', '800', '1k', '1.25k', '1.6k',
  '2k', '2.5k', '3.15k', '4k', '5k', '6.3k', '8k', '10k', '12.5k', '16k', '20k',
] as const

interface GEQBarViewProps {
  advisories: Advisory[]
  graphFontSize?: number
}

export function GEQBarView({ advisories, graphFontSize = 11 }: GEQBarViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const dimensionsRef = useRef({ width: 0, height: 0 })

  // Build map of band recommendations — memoised so it only rebuilds when advisories change
  const bandRecommendations = useMemo(() => {
    const map = new Map<number, { suggestedDb: number; color: string; freq: number; clusterCount: number }>()
    for (const advisory of advisories) {
      if (!advisory.advisory?.geq) continue
      const bandIndex = advisory.advisory.geq.bandIndex
      const existing = map.get(bandIndex)
      const advisoryCluster = advisory.clusterCount ?? 1
      // Use deepest cut for this band, accumulate cluster counts
      if (!existing || advisory.advisory.geq.suggestedDb < existing.suggestedDb) {
        map.set(bandIndex, {
          suggestedDb: advisory.advisory.geq.suggestedDb,
          color: getSeverityColor(advisory.severity),
          freq: advisory.trueFrequencyHz,
          clusterCount: existing ? existing.clusterCount + advisoryCluster : advisoryCluster,
        })
      } else {
        // Even if this advisory doesn't win, add its cluster count
        existing.clusterCount += advisoryCluster
      }
    }
    return map
  }, [advisories])

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

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, width, height)

    const padding = { top: 15, right: 10, bottom: 45, left: 30 }
    const plotWidth = width - padding.left - padding.right
    const plotHeight = height - padding.top - padding.bottom

    const numBands = ISO_31_BANDS.length
    const barSpacing = plotWidth / numBands
    const barWidth = barSpacing * 0.7
    const maxCut = -18
    const centerY = plotHeight / 2

    ctx.save()
    ctx.translate(padding.left, padding.top)

    // Background
    ctx.fillStyle = '#0a0a0a'
    ctx.fillRect(0, 0, plotWidth, plotHeight)

    // Center line (0 dB)
    ctx.strokeStyle = '#333'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, centerY)
    ctx.lineTo(plotWidth, centerY)
    ctx.stroke()

    // Grid lines at ±6, ±12 dB
    ctx.strokeStyle = '#1a1a1a'
    ctx.setLineDash([2, 2])
    for (const db of [-12, -6, 6, 12]) {
      const y = centerY - (db / 18) * (plotHeight / 2)
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(plotWidth, y)
      ctx.stroke()
    }
    ctx.setLineDash([])

    // Draw bars
    for (let i = 0; i < numBands; i++) {
      const x = i * barSpacing + (barSpacing - barWidth) / 2
      const recommendation = bandRecommendations.get(i)

      if (recommendation && recommendation.suggestedDb < 0) {
        // Active recommendation - draw cut indicator
        const cutDb = recommendation.suggestedDb
        const barHeight = Math.abs(cutDb / maxCut) * (plotHeight / 2)
        const y = centerY

        // Bar fill
        ctx.fillStyle = recommendation.color
        ctx.globalAlpha = 0.8
        ctx.fillRect(x, y, barWidth, barHeight)
        ctx.globalAlpha = 1

        // Bar outline
        ctx.strokeStyle = recommendation.color
        ctx.lineWidth = 2
        ctx.strokeRect(x, y, barWidth, barHeight)

        // Cut value label
        ctx.fillStyle = recommendation.color
        ctx.font = `bold ${graphFontSize}px system-ui, sans-serif`
        ctx.textAlign = 'center'
        ctx.fillText(`${cutDb}`, x + barWidth / 2, y + barHeight + 12)

        // Frequency label for active issue
        ctx.fillStyle = recommendation.color
        ctx.font = `${graphFontSize - 1}px system-ui, sans-serif`
        ctx.textAlign = 'center'
        const freqLabel = recommendation.freq >= 1000 ? `${(recommendation.freq / 1000).toFixed(1)}k` : `${Math.round(recommendation.freq)}`
        ctx.fillText(freqLabel, x + barWidth / 2, y - 5)

        // Cluster count badge (if > 1 peak merged)
        if (recommendation.clusterCount > 1) {
          const badgeText = `+${recommendation.clusterCount - 1}`
          ctx.font = `bold ${graphFontSize - 3}px system-ui, sans-serif`
          ctx.fillStyle = '#38bdf8' // sky-400
          ctx.textAlign = 'left'
          ctx.fillText(badgeText, x + barWidth + 2, y + 10)
        }
      } else {
        // Inactive - draw empty bar slot
        ctx.strokeStyle = '#222'
        ctx.lineWidth = 1
        ctx.strokeRect(x, centerY - (plotHeight / 2) + 5, barWidth, plotHeight - 10)
      }
    }

    ctx.restore()

    // Draw all 31 ISO band labels (rotated vertical to fit)
    // Cap label font so labels don't overlap — each band gets barSpacing px of horizontal room
    const labelFontSize = Math.min(Math.max(Math.floor(barSpacing * 0.85), 8), 13)
    ctx.fillStyle = '#888'
    ctx.font = `${labelFontSize}px system-ui, sans-serif`
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'

    for (let i = 0; i < numBands; i++) {
      const x = padding.left + i * barSpacing + barSpacing / 2
      const label = GEQ_BAND_LABELS[i]
      ctx.save()
      ctx.translate(x, height - padding.bottom + 6)
      ctx.rotate(-Math.PI / 2)
      ctx.fillText(label, 0, 0)
      ctx.restore()
    }

    // Y-axis labels
    ctx.textAlign = 'right'
    ctx.fillStyle = '#555'
    ctx.font = `${graphFontSize}px system-ui, sans-serif`
    ctx.fillText('0', padding.left - 5, padding.top + centerY + 3)
    ctx.fillText('-12', padding.left - 5, padding.top + centerY + (12 / 18) * (plotHeight / 2) + 3)
    ctx.fillText('+12', padding.left - 5, padding.top + centerY - (12 / 18) * (plotHeight / 2) + 3)

  }, [bandRecommendations, graphFontSize])

  useAnimationFrame(render, true)

  return (
    <div ref={containerRef} className="w-full h-full">
      <canvas ref={canvasRef} className="w-full h-full" role="img" aria-label="Graphic equalizer band view with recommended cuts" />
    </div>
  )
}
