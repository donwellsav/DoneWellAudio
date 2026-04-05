'use client'

import { useCallback, useRef, useState } from 'react'

function getDefaultGraphHeightVh(): number {
  if (typeof window !== 'undefined' && window.innerHeight < 700) return 20
  return 28
}

export interface UseMobileGraphStateReturn {
  inlineGraphMode: 'rta' | 'geq'
  graphHeightVh: number
  setInlineGraphMode: (mode: 'rta' | 'geq') => void
  onGraphTouchStart: (event: React.TouchEvent) => void
  onGraphTouchEnd: (event: React.TouchEvent) => void
  onResizeStart: (event: React.TouchEvent) => void
  onResizeMove: (event: React.TouchEvent) => void
  onResizeEnd: () => void
  nudgeGraphHeight: (deltaVh: number) => void
}

export function useMobileGraphState(): UseMobileGraphStateReturn {
  const [inlineGraphMode, setInlineGraphMode] = useState<'rta' | 'geq'>('rta')
  const [graphHeightVh, setGraphHeightVh] = useState(getDefaultGraphHeightVh)

  const resizeDragRef = useRef<{ startY: number; startH: number } | null>(null)
  const graphTouchStart = useRef<{ x: number; y: number } | null>(null)

  const clampGraphHeight = useCallback((value: number) => {
    setGraphHeightVh(Math.min(40, Math.max(8, value)))
  }, [])

  const onGraphTouchStart = useCallback((event: React.TouchEvent) => {
    const point = event.touches[0] ?? event.changedTouches[0]
    if (!point) return

    graphTouchStart.current = { x: point.clientX, y: point.clientY }
  }, [])

  const onGraphTouchEnd = useCallback((event: React.TouchEvent) => {
    const start = graphTouchStart.current
    const point = event.changedTouches[0] ?? event.touches[0]
    graphTouchStart.current = null
    if (!start || !point) return

    const dx = point.clientX - start.x
    const dy = point.clientY - start.y
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return

    setInlineGraphMode(dx < 0 ? 'geq' : 'rta')
  }, [])

  const onResizeStart = useCallback((event: React.TouchEvent) => {
    const point = event.touches[0] ?? event.changedTouches[0]
    if (!point) return

    resizeDragRef.current = { startY: point.clientY, startH: graphHeightVh }
  }, [graphHeightVh])

  const onResizeMove = useCallback((event: React.TouchEvent) => {
    const current = resizeDragRef.current
    const point = event.touches[0] ?? event.changedTouches[0]
    if (!current || !point || typeof window === 'undefined') return

    const deltaY = point.clientY - current.startY
    const deltaVh = (deltaY / window.innerHeight) * 100
    clampGraphHeight(current.startH + deltaVh)
  }, [clampGraphHeight])

  const onResizeEnd = useCallback(() => {
    resizeDragRef.current = null
  }, [])

  const nudgeGraphHeight = useCallback((deltaVh: number) => {
    setGraphHeightVh((current) => Math.min(40, Math.max(8, current + deltaVh)))
  }, [])

  return {
    inlineGraphMode,
    graphHeightVh,
    setInlineGraphMode,
    onGraphTouchStart,
    onGraphTouchEnd,
    onResizeStart,
    onResizeMove,
    onResizeEnd,
    nudgeGraphHeight,
  }
}
