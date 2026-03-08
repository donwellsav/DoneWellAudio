'use client'

import { useRef, useEffect, useCallback, useMemo, memo } from 'react'
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

// ─── Types ──────────────────────────────────────────────────────────────────────

type BandRecommendation = { suggestedDb: number; color: string; freq: number; clusterCount: number }

// ─── Pure drawing functions (module-level, no component state) ──────────────────

function drawGEQGrid(
  ctx: CanvasRenderingContext2D,
  plotWidth: number,
  plotHeight: number,
  centerY: number,
) {
  // Background
  ctx.fillStyle = '#0c0c0c'
  ctx.fillRect(0, 0, plotWidth, plotHeight)

  // Grid lines at ±6, ±12 dB (drawn first, underneath)
  ctx.strokeStyle = '#1e1e1e'
  ctx.lineWidth = 0.5
  ctx.setLineDash([2, 2])
  for (const db of [-12, -6, 6, 12]) {
    const y = centerY - (db / 18) * (plotHeight / 2)
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(plotWidth, y)
    ctx.stroke()
  }
  ctx.setLineDash([])

  // Center line (0 dB) — major reference line, on top
  ctx.strokeStyle = '#2a2a2a'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, centerY)
  ctx.lineTo(plotWidth, centerY)
  ctx.stroke()
}

function drawBars(
  ctx: CanvasRenderingContext2D,
  plotWidth: number,
  plotHeight: number,
  centerY: number,
  barSpacing: number,
  barWidth: number,
  maxCut: number,
  numBands: number,
  bandRecommendations: Map<number, BandRecommendation>,
  issueFontSize: number,
) {
  for (let i = 0; i < numBands; i++) {
    const x = i * barSpacing + (barSpacing - barWidth) / 2
    const recommendation = bandRecommendations.get(i)

    if (recommendation && recommendation.suggestedDb < 0) {
      // Active recommendation - draw cut indicator
      const cutDb = recommendation.suggestedDb
      const barHeight = Math.abs(cutDb / maxCut) * (plotHeight / 2)
      const y = centerY

      // Bar glow (wider, semi-transparent — same technique as RTA spectrum)
      ctx.strokeStyle = recommendation.color
      ctx.globalAlpha = 0.15
      ctx.lineWidth = 4
      ctx.strokeRect(x - 1, y - 1, barWidth + 2, barHeight + 2)

      // Bar fill
      ctx.fillStyle = recommendation.color
      ctx.globalAlpha = 0.8
      ctx.fillRect(x, y, barWidth, barHeight)
      ctx.globalAlpha = 1

      // Bar outline (sharp, on top of glow)
      ctx.strokeStyle = recommendation.color
      ctx.lineWidth = 2
      ctx.strokeRect(x, y, barWidth, barHeight)

      // Cut value label
      ctx.fillStyle = recommendation.color
      ctx.font = `bold ${issueFontSize}px monospace`
      ctx.textAlign = 'center'
      ctx.fillText(`${cutDb}`, x + barWidth / 2, y + barHeight + issueFontSize + 4)

      // Frequency label for active issue
      ctx.fillStyle = recommendation.color
      ctx.font = `bold ${issueFontSize}px monospace`
      ctx.textAlign = 'center'
      const freqLabel = GEQ_BAND_LABELS[i]
      ctx.fillText(freqLabel, x + barWidth / 2, y - 8)

      // Cluster count badge (if > 1 peak merged)
      if (recommendation.clusterCount > 1) {
        const badgeText = `+${recommendation.clusterCount - 1}`
        ctx.font = `bold ${issueFontSize - 2}px monospace`
        ctx.fillStyle = '#38bdf8' // sky-400
        ctx.textAlign = 'left'
        ctx.fillText(badgeText, x + barWidth + 4, y + 10)
      }
    } else {
      // Inactive - subtle bar slot (barely visible, reduces visual noise)
      ctx.strokeStyle = '#181818'
      ctx.lineWidth = 0.5
      ctx.strokeRect(x, centerY - (plotHeight / 2) + 5, barWidth, plotHeight - 10)
    }
  }
}

function drawGEQAxisLabels(
  ctx: CanvasRenderingContext2D,
  padding: { top: number; left: number; right: number; bottom: number },
  plotWidth: number,
  plotHeight: number,
  centerY: number,
  barSpacing: number,
  numBands: number,
  fontSize: number,
  width: number,
  height: number,
) {
  // Band labels (rotated vertical to fit)
  const labelFontSize = Math.min(Math.max(Math.floor(barSpacing * 0.85), 8), 13)
  ctx.fillStyle = '#888'
  ctx.font = `${labelFontSize}px monospace`
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
  ctx.fillStyle = '#888'
  ctx.font = `${fontSize}px monospace`
  ctx.fillText('0', padding.left - 5, padding.top + centerY + 3)
  ctx.fillText('-12', padding.left - 5, padding.top + centerY + (12 / 18) * (plotHeight / 2) + 3)
  ctx.fillText('+12', padding.left - 5, padding.top + centerY - (12 / 18) * (plotHeight / 2) + 3)
}

// ─── Component ──────────────────────────────────────────────────────────────────

interface GEQBarViewProps {
  advisories: Advisory[]
  graphFontSize?: number
  clearedIds?: Set<string>
}

export const GEQBarView = memo(function GEQBarView({ advisories, graphFontSize = 11, clearedIds }: GEQBarViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const dimensionsRef = useRef({ width: 0, height: 0 })

  // Cached per-frame objects — avoid recreating every frame
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null)
  const dprRef = useRef(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1)

  // Dirty-bit: skip canvas redraw when nothing has changed
  const dirtyRef = useRef(true) // Start dirty to ensure first frame draws

  // Build map of band recommendations — memoised so it only rebuilds when advisories change
  const bandRecommendations = useMemo(() => {
    const map = new Map<number, BandRecommendation>()
    for (const advisory of advisories) {
      if (clearedIds?.has(advisory.id)) continue
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
  }, [advisories, clearedIds])

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

        // Invalidate cached ctx on resize (canvas element may change)
        ctxRef.current = null
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
    // Dirty check: skip frame if nothing changed since last draw
    if (!dirtyRef.current) return
    dirtyRef.current = false

    const canvas = canvasRef.current
    if (!canvas) return

    if (!ctxRef.current) ctxRef.current = canvas.getContext('2d')
    const ctx = ctxRef.current
    if (!ctx) return

    const dpr = dprRef.current
    const { width, height } = dimensionsRef.current
    if (width === 0 || height === 0) return

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, width, height)

    const padding = {
      top: Math.round(height * 0.04),
      right: Math.round(width * 0.015),
      bottom: Math.round(height * 0.11),
      left: Math.round(width * 0.045),
    }
    const scaledFontSize = Math.max(8, Math.min(14, Math.round(width * 0.01)))
    const fontSize = Math.round((graphFontSize + scaledFontSize) / 2)
    const issueFontSize = Math.max(fontSize + 4, 14)
    const plotWidth = width - padding.left - padding.right
    const plotHeight = height - padding.top - padding.bottom

    const numBands = ISO_31_BANDS.length
    const barSpacing = plotWidth / numBands
    const barWidth = barSpacing * 0.7
    const maxCut = -18
    const centerY = plotHeight / 2

    // ── Draw phases ──────────────────────────────────────────────
    ctx.save()
    ctx.translate(padding.left, padding.top)

    drawGEQGrid(ctx, plotWidth, plotHeight, centerY)
    drawBars(ctx, plotWidth, plotHeight, centerY, barSpacing, barWidth, maxCut, numBands, bandRecommendations, issueFontSize)

    ctx.restore()

    drawGEQAxisLabels(ctx, padding, plotWidth, plotHeight, centerY, barSpacing, numBands, fontSize, width, height)

  }, [bandRecommendations, graphFontSize])

  useAnimationFrame(render)

  // Mark dirty when display data changes (triggers redraw on next rAF tick)
  useEffect(() => { dirtyRef.current = true }, [bandRecommendations, graphFontSize])

  return (
    <div ref={containerRef} className="relative w-full h-full">
      <canvas ref={canvasRef} className="w-full h-full" role="img" aria-label="Graphic equalizer band view with recommended cuts" />
    </div>
  )
})
