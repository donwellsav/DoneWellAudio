'use client'

import { memo, useRef, useEffect, useMemo } from 'react'
import { getFeedbackHistory, type FrequencyHotspot } from '@/lib/dsp/feedbackHistory'
import { calculateRoomModes, calculateSchroederFrequency } from '@/lib/dsp/acousticUtils'

// ── Types ────────────────────────────────────────────────────────────────────

interface RoomAnalysisViewProps {
  /** Room dimensions in meters */
  lengthM: number
  widthM: number
  heightM: number
  /** Reverberation time in seconds */
  rt60: number
  /** Room volume in m³ */
  volume: number
  /** Whether analysis is running (triggers periodic refresh) */
  isRunning: boolean
}

// ── Constants ────────────────────────────────────────────────────────────────

const CANVAS_HEIGHT = 200
const PADDING = { top: 20, right: 16, bottom: 32, left: 40 }
const MIN_FREQ = 20
const MAX_FREQ = 500 // Room modes are below ~300 Hz; show to 500 for context
const BAR_WIDTH_PX = 4
const HOTSPOT_MIN_OCCURRENCES = 2 // Minimum occurrences to show a bar
const REFRESH_INTERVAL_MS = 2000 // Refresh hotspot data every 2 seconds

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Convert frequency to x position on log scale */
function freqToX(freq: number, plotWidth: number): number {
  const logMin = Math.log10(MIN_FREQ)
  const logMax = Math.log10(MAX_FREQ)
  const logF = Math.log10(Math.max(MIN_FREQ, Math.min(MAX_FREQ, freq)))
  return PADDING.left + ((logF - logMin) / (logMax - logMin)) * plotWidth
}

/** Format frequency for axis labels */
function formatFreq(hz: number): string {
  if (hz >= 1000) return `${(hz / 1000).toFixed(1)}k`
  return `${Math.round(hz)}`
}

// ── Component ────────────────────────────────────────────────────────────────

/**
 * Room Analysis View — canvas-based frequency histogram showing observed
 * hotspots overlaid with predicted room modes and Schroeder frequency.
 *
 * Data sources (all available in React, no worker plumbing):
 * - feedbackHistory.getHotspots() for observed frequency occurrences
 * - calculateRoomModes() for predicted axial/tangential/oblique modes
 * - calculateSchroederFrequency() for modal/diffuse transition
 */
export const RoomAnalysisView = memo(function RoomAnalysisView({
  lengthM, widthM, heightM, rt60, volume, isRunning,
}: RoomAnalysisViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const hotspotsRef = useRef<FrequencyHotspot[]>([])

  // Compute room modes (pure function, stable unless dimensions change)
  const roomModes = useMemo(() => {
    if (lengthM <= 0 || widthM <= 0 || heightM <= 0) return null
    return calculateRoomModes(lengthM, widthM, heightM, MAX_FREQ)
  }, [lengthM, widthM, heightM])

  const schroederFreq = useMemo(() => {
    if (rt60 <= 0 || volume <= 0) return 0
    return calculateSchroederFrequency(rt60, volume)
  }, [rt60, volume])

  // Refresh hotspot data periodically when running
  useEffect(() => {
    const refresh = () => {
      hotspotsRef.current = getFeedbackHistory().getHotspots()
        .filter(h => h.occurrences >= HOTSPOT_MIN_OCCURRENCES && h.centerFrequencyHz <= MAX_FREQ)
    }
    refresh()
    if (!isRunning) return
    const id = setInterval(refresh, REFRESH_INTERVAL_MS)
    return () => clearInterval(id)
  }, [isRunning])

  // Draw canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Handle DPR
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = CANVAS_HEIGHT * dpr
    ctx.scale(dpr, dpr)

    const w = rect.width
    const h = CANVAS_HEIGHT
    const plotW = w - PADDING.left - PADDING.right
    const plotH = h - PADDING.top - PADDING.bottom

    // Get computed styles for theme awareness
    const style = getComputedStyle(canvas)
    const textColor = style.getPropertyValue('color') || '#888'
    const bgColor = style.getPropertyValue('--card') || '#1a1a2e'
    const accentColor = style.getPropertyValue('--console-amber') || '#f59e0b'
    const mutedColor = style.getPropertyValue('--muted-foreground') || '#666'

    // Clear
    ctx.fillStyle = bgColor
    ctx.fillRect(0, 0, w, h)

    // ── Frequency axis (bottom) ──────────────────────────────────────
    const freqTicks = [20, 50, 100, 200, 500]
    ctx.font = '10px monospace'
    ctx.textAlign = 'center'
    ctx.fillStyle = mutedColor
    for (const f of freqTicks) {
      const x = freqToX(f, plotW)
      ctx.fillText(formatFreq(f), x, h - 8)
      // Tick line
      ctx.strokeStyle = mutedColor + '30'
      ctx.beginPath()
      ctx.moveTo(x, PADDING.top)
      ctx.lineTo(x, h - PADDING.bottom)
      ctx.stroke()
    }

    // ── Count axis (left) ────────────────────────────────────────────
    const hotspots = hotspotsRef.current
    const maxCount = Math.max(5, ...hotspots.map(h => h.occurrences))
    const countToY = (count: number) => PADDING.top + plotH * (1 - count / maxCount)

    ctx.textAlign = 'right'
    ctx.fillStyle = mutedColor
    for (let c = 0; c <= maxCount; c += Math.ceil(maxCount / 4)) {
      const y = countToY(c)
      ctx.fillText(`${c}`, PADDING.left - 6, y + 3)
      ctx.strokeStyle = mutedColor + '20'
      ctx.beginPath()
      ctx.moveTo(PADDING.left, y)
      ctx.lineTo(w - PADDING.right, y)
      ctx.stroke()
    }

    // ── Room mode reference lines (dashed) ───────────────────────────
    if (roomModes) {
      for (const mode of roomModes.all) {
        if (mode.frequency < MIN_FREQ || mode.frequency > MAX_FREQ) continue
        const x = freqToX(mode.frequency, plotW)
        ctx.save()
        ctx.setLineDash([3, 3])
        ctx.strokeStyle = mode.type === 'axial' ? '#4488ff60'
          : mode.type === 'tangential' ? '#44ff8860'
          : '#ff884440'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(x, PADDING.top)
        ctx.lineTo(x, h - PADDING.bottom)
        ctx.stroke()
        ctx.restore()
      }
    }

    // ── Schroeder frequency marker ───────────────────────────────────
    if (schroederFreq > MIN_FREQ && schroederFreq < MAX_FREQ) {
      const x = freqToX(schroederFreq, plotW)
      ctx.save()
      ctx.setLineDash([6, 4])
      ctx.strokeStyle = '#ff444488'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(x, PADDING.top)
      ctx.lineTo(x, h - PADDING.bottom)
      ctx.stroke()
      // Label
      ctx.setLineDash([])
      ctx.font = '9px monospace'
      ctx.textAlign = 'center'
      ctx.fillStyle = '#ff4444'
      ctx.fillText(`Schroeder ${Math.round(schroederFreq)}Hz`, x, PADDING.top - 4)
      ctx.restore()
    }

    // ── Hotspot bars ─────────────────────────────────────────────────
    for (const hotspot of hotspots) {
      const x = freqToX(hotspot.centerFrequencyHz, plotW)
      const barH = plotH * (hotspot.occurrences / maxCount)
      const y = PADDING.top + plotH - barH

      // Repeat offenders (3+) get accent color, others get muted
      const isRepeat = hotspot.isRepeatOffender
      ctx.fillStyle = isRepeat ? accentColor : mutedColor + '80'
      ctx.fillRect(x - BAR_WIDTH_PX / 2, y, BAR_WIDTH_PX, barH)

      // Frequency label on top of tall bars
      if (hotspot.occurrences >= 3) {
        ctx.font = '8px monospace'
        ctx.textAlign = 'center'
        ctx.fillStyle = isRepeat ? accentColor : textColor
        ctx.fillText(`${Math.round(hotspot.centerFrequencyHz)}`, x, y - 4)
      }
    }

    // ── Legend ────────────────────────────────────────────────────────
    const legendY = PADDING.top + 2
    const legendX = w - PADDING.right - 8
    ctx.font = '8px monospace'
    ctx.textAlign = 'right'

    ctx.fillStyle = '#4488ff60'
    ctx.fillRect(legendX - 48, legendY, 8, 8)
    ctx.fillStyle = mutedColor
    ctx.fillText('Axial', legendX, legendY + 7)

    ctx.fillStyle = '#44ff8860'
    ctx.fillRect(legendX - 48, legendY + 12, 8, 8)
    ctx.fillStyle = mutedColor
    ctx.fillText('Tang.', legendX, legendY + 19)

    ctx.fillStyle = '#ff884440'
    ctx.fillRect(legendX - 48, legendY + 24, 8, 8)
    ctx.fillStyle = mutedColor
    ctx.fillText('Obliq.', legendX, legendY + 31)

  }, [roomModes, schroederFreq, isRunning])

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="section-label text-muted-foreground">Room Analysis</span>
        <span className="text-[10px] font-mono text-muted-foreground/60">
          {hotspotsRef.current.length > 0 ? `${hotspotsRef.current.length} hotspots` : 'Waiting for data...'}
        </span>
      </div>
      <canvas
        ref={canvasRef}
        className="w-full rounded border border-border/40 text-foreground"
        style={{ height: CANVAS_HEIGHT }}
      />
      <div className="flex items-center gap-3 text-[9px] font-mono text-muted-foreground/60">
        <span>Dashed lines = predicted room modes</span>
        <span className="text-red-400">Red = Schroeder frequency</span>
        <span className="text-[var(--console-amber)]">Amber bars = repeat offenders (3+)</span>
      </div>
    </div>
  )
})
