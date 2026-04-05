'use client'

import { useCallback, useEffect, useRef, type RefObject } from 'react'
import { useTheme } from 'next-themes'
import { meterBg, applyMeterStops } from '@/lib/canvas/canvasTokens'

interface UseInputMeterCanvasParams {
  level: number
  min: number
  max: number
  sliderRef: RefObject<HTMLDivElement | null>
}

export function useInputMeterCanvas({
  level,
  min,
  max,
  sliderRef,
}: UseInputMeterCanvasParams) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme !== 'light'
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dimensionsRef = useRef({ width: 0, height: 0 })
  const gradientRef = useRef<CanvasGradient | null>(null)
  const gradientWidthRef = useRef(0)
  const targetLevelRef = useRef(0)
  const smoothedLevelRef = useRef(0)
  const prevDrawnRef = useRef(-1)
  const rafIdRef = useRef(0)
  const normalizedLevel = Math.max(0, Math.min(1, (level + 60) / 60))

  useEffect(() => {
    targetLevelRef.current = normalizedLevel
  }, [normalizedLevel])

  useEffect(() => {
    const slider = sliderRef.current
    if (!slider) return

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

    observer.observe(slider)
    return () => observer.disconnect()
  }, [sliderRef])

  const drawMeter = useCallback((smoothed: number) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const context = canvas.getContext('2d')
    if (!context) return

    const dpr = window.devicePixelRatio || 1
    const { width, height } = dimensionsRef.current
    if (width === 0 || height === 0) return

    context.setTransform(1, 0, 0, 1, 0, 0)
    context.scale(dpr, dpr)
    context.clearRect(0, 0, width, height)

    context.fillStyle = meterBg(isDark)
    context.fillRect(0, 0, width, height)

    let gradient = gradientRef.current
    if (!gradient || gradientWidthRef.current !== width) {
      gradient = applyMeterStops(context.createLinearGradient(0, 0, width, 0))
      gradientRef.current = gradient
      gradientWidthRef.current = width
    }

    const meterWidth = width * smoothed
    context.fillStyle = gradient
    context.fillRect(0, 0, meterWidth, height)

    if (meterWidth > 2) {
      context.fillStyle = 'rgba(255,255,255,0.12)'
      context.fillRect(0, 0, meterWidth, Math.max(1, height * 0.2))
    }

    context.strokeStyle = 'rgba(255,255,255,0.10)'
    context.lineWidth = 0.5

    for (const db of [-30, -20, -10, 10, 20, 30]) {
      const x = ((db - min) / (max - min)) * width
      context.beginPath()
      context.moveTo(x, height * 0.65)
      context.lineTo(x, height)
      context.stroke()
    }

    const zeroPosition = ((0 - min) / (max - min)) * width
    context.strokeStyle = 'rgba(255,255,255,0.25)'
    context.lineWidth = 1
    context.beginPath()
    context.moveTo(zeroPosition, 0)
    context.lineTo(zeroPosition, height)
    context.stroke()
  }, [isDark, max, min])

  useEffect(() => {
    const ATTACK = 0.3
    const DECAY = 0.05

    const tick = () => {
      const target = targetLevelRef.current
      const current = smoothedLevelRef.current
      const coefficient = target > current ? ATTACK : DECAY
      const next = current + (target - current) * coefficient
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

  useEffect(() => {
    prevDrawnRef.current = -1
  }, [isDark])

  return { canvasRef }
}
