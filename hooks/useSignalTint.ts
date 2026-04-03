'use client'

/**
 * useSignalTint — drives the console-wide tint color based on detection severity.
 *
 * Sets CSS custom properties (--tint-r, --tint-g, --tint-b) on <html> so that
 * every amber-tinted element (headers, sidebars, accordions, glow lines, labels)
 * shifts color together — like a real analog console's master bus clip indicator.
 *
 * Color progression:
 *   Idle (not running) → slate gray
 *   Listening (no detections) → console blue
 *   Low severity (WHISTLE/INSTRUMENT/POSSIBLE_RING) → console amber
 *   Mid severity (RESONANCE/GROWING) → orange
 *   RUNAWAY → red
 */

import { useMemo, useEffect, useState, useRef } from 'react'
import { useAdvisories } from '@/contexts/AdvisoryContext'
import { useEngine } from '@/contexts/EngineContext'
import { useMetering } from '@/contexts/MeteringContext'
import { useSettings } from '@/contexts/SettingsContext'
import { getSeverityUrgency } from '@/lib/dsp/severityUtils'

type RGB = [number, number, number]

const TINT_IDLE: RGB   = [100, 116, 139]  // slate gray
const TINT_BLUE: RGB   = [59, 130, 246]   // console blue (low/no signal)
const TINT_GREEN: RGB  = [34, 197, 94]    // healthy (good signal, no feedback)
const TINT_AMBER: RGB  = [245, 158, 11]   // console amber (low severity detection)
const TINT_ORANGE: RGB = [249, 115, 22]   // warning (growing)
const TINT_RED: RGB    = [239, 68, 68]    // RUNAWAY

/** Hold severity for 1s before allowing downgrade — prevents flicker */
const HOLD_MS = 1000

/** Low signal threshold — matches DesktopLayout/MobileLayout (inputLevel < -45) */
const LOW_SIGNAL_THRESHOLD_DB = -45

function tintForUrgency(urgency: number, running: boolean, isLowSignal: boolean): RGB {
  if (!running) return TINT_IDLE
  if (isLowSignal) return TINT_BLUE   // low/no signal — need more gain
  if (urgency === 0) return TINT_GREEN // good signal, no feedback — healthy
  if (urgency <= 2) return TINT_AMBER
  if (urgency <= 4) return TINT_ORANGE
  return TINT_RED
}

/**
 * Must be called inside AdvisoryProvider + EngineContext.
 * Reads advisories and engine state from context directly.
 *
 * Hysteresis: upgrades are instant, downgrades are held for HOLD_MS
 * to prevent flicker when advisories briefly disappear and return.
 */
export function useSignalTint(): void {
  const { advisories, dismissedIds } = useAdvisories()
  const { isRunning } = useEngine()
  const { inputLevel } = useMetering()
  const { settings } = useSettings()
  const enabled = settings.signalTintEnabled
  const isLowSignal = isRunning && inputLevel < LOW_SIGNAL_THRESHOLD_DB

  const rawUrgency = useMemo(() => {
    if (!isRunning) return 0
    let worst = 0
    for (const a of advisories) {
      if (!dismissedIds.has(a.id)) {
        worst = Math.max(worst, getSeverityUrgency(a.severity))
      }
    }
    return worst
  }, [isRunning, advisories, dismissedIds])

  // Hysteresis: upgrades instant, downgrades delayed
  const [displayedUrgency, setDisplayedUrgency] = useState(0)
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (rawUrgency >= displayedUrgency) {
      // Upgrade or same — apply immediately
      if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null }
      setDisplayedUrgency(rawUrgency)
    } else {
      // Downgrade — hold for HOLD_MS before applying
      if (!holdTimerRef.current) {
        holdTimerRef.current = setTimeout(() => {
          holdTimerRef.current = null
          setDisplayedUrgency(rawUrgency)
        }, HOLD_MS)
      }
    }
    return () => {
      if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null }
    }
  }, [rawUrgency, displayedUrgency])

  const [r, g, b] = enabled ? tintForUrgency(displayedUrgency, isRunning, isLowSignal) : TINT_IDLE
  const isRunaway = enabled && displayedUrgency >= 5

  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--tint-r', String(r))
    root.style.setProperty('--tint-g', String(g))
    root.style.setProperty('--tint-b', String(b))
    // Boost alpha for RUNAWAY — makes red actually visible at low tint alphas
    if (isRunaway) {
      root.classList.add('tint-runaway')
    } else {
      root.classList.remove('tint-runaway')
    }
    return () => {
      root.style.setProperty('--tint-r', String(TINT_IDLE[0]))
      root.style.setProperty('--tint-g', String(TINT_IDLE[1]))
      root.style.setProperty('--tint-b', String(TINT_IDLE[2]))
      root.classList.remove('tint-runaway')
    }
  }, [r, g, b, isRunaway])
}
