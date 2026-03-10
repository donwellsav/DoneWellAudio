'use client'

import { memo, useState, useCallback, useEffect, useRef } from 'react'
import type { FrequencyBand } from '@/types/calibration'

const BANDS: { value: FrequencyBand; label: string }[] = [
  { value: 'LOW', label: 'LOW' },
  { value: 'MID', label: 'MID' },
  { value: 'HIGH', label: 'HIGH' },
]

const DISMISS_MS = 3000

interface MissedFeedbackButtonProps {
  onMissed: (band: FrequencyBand | null) => void
}

export const MissedFeedbackButton = memo(function MissedFeedbackButton({
  onMissed,
}: MissedFeedbackButtonProps) {
  const [showBands, setShowBands] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  useEffect(() => () => clearTimer(), [clearTimer])

  const handleTap = useCallback(() => {
    if (showBands) {
      // Already showing — log without band and dismiss
      onMissed(null)
      setShowBands(false)
      clearTimer()
    } else {
      setShowBands(true)
      timerRef.current = setTimeout(() => {
        // Auto-dismiss: log without band after timeout
        onMissed(null)
        setShowBands(false)
      }, DISMISS_MS)
    }
  }, [showBands, onMissed, clearTimer])

  const handleBand = useCallback((band: FrequencyBand) => {
    onMissed(band)
    setShowBands(false)
    clearTimer()
  }, [onMissed, clearTimer])

  return (
    <div className="flex items-center justify-center gap-1.5 py-1">
      <button
        onClick={handleTap}
        className="px-3 py-1.5 text-xs font-mono font-bold tracking-wider rounded border border-amber-500/40 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors min-h-[36px]"
      >
        MISSED!
      </button>
      {showBands && BANDS.map(b => (
        <button
          key={b.value}
          onClick={() => handleBand(b.value)}
          className="px-2 py-1.5 text-xs font-mono font-bold rounded border border-amber-500/30 bg-amber-500/5 text-amber-300 hover:bg-amber-500/20 transition-colors min-h-[36px]"
        >
          {b.label}
        </button>
      ))}
    </div>
  )
})
