'use client'

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type RefObject,
} from 'react'
import type { Advisory } from '@/types/advisory'
import {
  buildBandRecommendations,
  buildGEQAriaLabel,
  GEQ_BAND_LABELS,
  type BandRecommendation,
  type GEQHoverLayout,
} from '@/lib/canvas/geqBarViewShared'

interface UseGEQBarViewStateParams {
  advisories: readonly Advisory[]
  clearedIds?: ReadonlySet<string>
  isDark: boolean
  containerRef: RefObject<HTMLDivElement | null>
}

export interface GEQHoverState {
  hoverBand: number | null
  hoverLabel: string | null
  hoverRec: BandRecommendation | null
  hoverPos: { x: number; y: number }
}

export interface GEQBarViewState extends GEQHoverState {
  bandRecommendations: Map<number, BandRecommendation>
  hasRecommendations: boolean
  geqAriaLabel: string
  layoutRef: MutableRefObject<GEQHoverLayout>
  handleMouseMove: (clientX: number, clientY: number) => void
  handleMouseLeave: () => void
}

export function useGEQBarViewState({
  advisories,
  clearedIds,
  isDark,
  containerRef,
}: UseGEQBarViewStateParams): GEQBarViewState {
  const [hoverBand, setHoverBand] = useState<number | null>(null)
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 })
  const layoutRef = useRef<GEQHoverLayout>({
    paddingLeft: 0,
    barSpacing: 0,
    numBands: GEQ_BAND_LABELS.length,
  })

  const bandRecommendations = useMemo(
    () => buildBandRecommendations(advisories, clearedIds, isDark),
    [advisories, clearedIds, isDark],
  )

  const geqAriaLabel = useMemo(
    () => buildGEQAriaLabel(bandRecommendations),
    [bandRecommendations],
  )

  const handleMouseMove = useCallback((clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) {
      return
    }

    const x = clientX - rect.left
    const y = clientY - rect.top
    const { paddingLeft, barSpacing, numBands } = layoutRef.current
    const bandIndex = Math.floor((x - paddingLeft) / barSpacing)

    if (bandIndex >= 0 && bandIndex < numBands && bandRecommendations.has(bandIndex)) {
      setHoverBand(bandIndex)
      setHoverPos({ x, y })
      return
    }

    setHoverBand(null)
  }, [bandRecommendations, containerRef])

  const handleMouseLeave = useCallback(() => {
    setHoverBand(null)
  }, [])

  return {
    bandRecommendations,
    hasRecommendations: bandRecommendations.size > 0,
    geqAriaLabel,
    layoutRef,
    hoverBand,
    hoverLabel: hoverBand != null ? GEQ_BAND_LABELS[hoverBand] : null,
    hoverRec: hoverBand != null ? bandRecommendations.get(hoverBand) ?? null : null,
    hoverPos,
    handleMouseMove,
    handleMouseLeave,
  }
}
