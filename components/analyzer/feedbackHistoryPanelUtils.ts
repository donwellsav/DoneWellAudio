import type { FrequencyHotspot } from '@/lib/dsp/feedbackHistory'

export interface FeedbackHistoryLayout {
  columnCount: 1 | 2 | 3
  gridClassName: string
  maxWidthClassName: string
}

export function buildFeedbackHistoryLayout(hotspots: readonly FrequencyHotspot[]): FeedbackHistoryLayout {
  const hotspotCount = hotspots.length
  const columnCount = hotspotCount >= 12 ? 3 : hotspotCount >= 6 ? 2 : 1

  if (columnCount === 3) {
    return {
      columnCount,
      gridClassName: 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-1.5',
      maxWidthClassName: 'sm:max-w-7xl',
    }
  }

  if (columnCount === 2) {
    return {
      columnCount,
      gridClassName: 'grid grid-cols-1 sm:grid-cols-2 gap-1.5',
      maxWidthClassName: 'sm:max-w-4xl',
    }
  }

  return {
    columnCount,
    gridClassName: 'space-y-2',
    maxWidthClassName: 'sm:max-w-xl',
  }
}

export function formatHistoryFrequency(hz: number): string {
  if (hz >= 1000) return `${(hz / 1000).toFixed(1)}kHz`
  return `${Math.round(hz)}Hz`
}
