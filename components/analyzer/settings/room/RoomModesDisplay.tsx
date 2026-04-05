'use client'

import { useMemo, memo } from 'react'
import { calculateRoomModes, formatRoomModesForDisplay } from '@/lib/dsp/acousticUtils'

interface RoomModesDisplayProps {
  lengthM: number
  widthM: number
  heightM: number
}

export const RoomModesDisplay = memo(function RoomModesDisplay({
  lengthM,
  widthM,
  heightM,
}: RoomModesDisplayProps) {
  const modes = useMemo(() => {
    if (lengthM <= 0 || widthM <= 0 || heightM <= 0) return null
    return calculateRoomModes(lengthM, widthM, heightM)
  }, [heightM, lengthM, widthM])

  const formatted = useMemo(() => {
    if (!modes) return null
    return formatRoomModesForDisplay(modes)
  }, [modes])

  if (!formatted || formatted.all.length === 0) {
    return (
      <p className="text-sm text-muted-foreground font-mono">
        Enter valid room dimensions to calculate modes.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground font-mono">
        Found {formatted.all.length} room modes below 300Hz:
      </p>

      {formatted.axial.length > 0 ? (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-destructive" />
            <span className="text-sm font-mono font-medium text-foreground">Axial (strongest)</span>
          </div>
          <div className="flex flex-wrap gap-1 pl-3.5">
            {formatted.axial.slice(0, 8).map((mode) => (
              <span
                key={`${mode.label}-${mode.hz}`}
                className="px-1.5 py-0.5 text-sm font-mono bg-destructive/10 text-destructive rounded"
                title={`Mode ${mode.label}`}
              >
                {mode.hz}Hz
              </span>
            ))}
            {formatted.axial.length > 8 ? (
              <span className="text-sm text-muted-foreground font-mono">+{formatted.axial.length - 8} more</span>
            ) : null}
          </div>
        </div>
      ) : null}

      {formatted.tangential.length > 0 ? (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-yellow-500" />
            <span className="text-sm font-mono font-medium text-foreground">Tangential (medium)</span>
          </div>
          <div className="flex flex-wrap gap-1 pl-3.5">
            {formatted.tangential.slice(0, 6).map((mode) => (
              <span
                key={`${mode.label}-${mode.hz}`}
                className="px-1.5 py-0.5 text-sm font-mono bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 rounded"
                title={`Mode ${mode.label}`}
              >
                {mode.hz}Hz
              </span>
            ))}
            {formatted.tangential.length > 6 ? (
              <span className="text-sm text-muted-foreground font-mono">+{formatted.tangential.length - 6} more</span>
            ) : null}
          </div>
        </div>
      ) : null}

      {formatted.oblique.length > 0 ? (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-muted-foreground/50" />
            <span className="text-sm font-mono font-medium text-foreground">Oblique (weakest)</span>
          </div>
          <div className="flex flex-wrap gap-1 pl-3.5">
            {formatted.oblique.slice(0, 4).map((mode) => (
              <span
                key={`${mode.label}-${mode.hz}`}
                className="px-1.5 py-0.5 text-sm font-mono bg-card/40 text-muted-foreground rounded"
                title={`Mode ${mode.label}`}
              >
                {mode.hz}Hz
              </span>
            ))}
            {formatted.oblique.length > 4 ? (
              <span className="text-sm text-muted-foreground font-mono">+{formatted.oblique.length - 4} more</span>
            ) : null}
          </div>
        </div>
      ) : null}

      <p className="text-sm text-muted-foreground pt-1">
        Tip: If detected feedback matches a room mode, it may be a resonance rather than feedback.
      </p>
    </div>
  )
})
