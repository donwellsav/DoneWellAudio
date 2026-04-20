'use client'

import { useEffect, useState } from 'react'

/**
 * Returns a Date.now() value that re-renders every `intervalMs` while `enabled` is true.
 * Used for "X seconds ago" age displays — see IssueCard, useEarlyWarningPanelState.
 *
 * When disabled, the timer is not scheduled and the returned value freezes at its
 * last update. Re-enabling resumes ticking from the next interval boundary.
 */
export function useTickingNow(enabled: boolean, intervalMs: number = 1000): number {
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    if (!enabled) return
    const intervalId = window.setInterval(() => {
      setNowMs(Date.now())
    }, intervalMs)
    return () => window.clearInterval(intervalId)
  }, [enabled, intervalMs])

  return nowMs
}
