import { useState, useEffect, useRef } from 'react'

/**
 * Debounced low-signal indicator with hysteresis.
 *
 * Raw `inputLevel < -45` toggles at ~50fps, causing the "Low Signal" /
 * "No Feedback" empty states to flicker distractingly. This hook requires
 * the signal to stay below threshold for ENTER_MS before showing "Low Signal",
 * and above threshold for EXIT_MS before clearing it.
 *
 * @param isRunning — analysis active
 * @param inputLevel — current input level in dBFS
 * @param thresholdDb — low signal threshold (default -45 dBFS)
 */
const ENTER_MS = 3500  // must be low for 3.5s before showing "Low Signal"
const EXIT_MS = 5000   // must be above for 5s before clearing

export function useLowSignal(isRunning: boolean, inputLevel: number, thresholdDb = -45): boolean {
  const [isLow, setIsLow] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const targetRef = useRef(false)

  useEffect(() => {
    if (!isRunning) {
      targetRef.current = false
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }

      const timeoutId = window.setTimeout(() => {
        setIsLow(false)
      }, 0)

      return () => window.clearTimeout(timeoutId)
    }

    const rawLow = inputLevel < thresholdDb
    if (rawLow === targetRef.current) return // no change in target

    targetRef.current = rawLow

    // Clear any pending transition
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }

    const delay = rawLow ? ENTER_MS : EXIT_MS
    timerRef.current = setTimeout(() => {
      setIsLow(rawLow)
      timerRef.current = null
    }, delay)
  }, [isRunning, inputLevel, thresholdDb])

  // Cleanup on unmount
  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [])

  return isLow
}
