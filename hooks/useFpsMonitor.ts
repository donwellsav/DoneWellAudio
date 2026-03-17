// Lightweight FPS monitor — runs its own RAF loop to measure actual frame rate
// and detect dropped frames. Does no rendering work, just timestamps frames.

import { useEffect, useRef, useState } from 'react'

export interface FpsStats {
  /** Smoothed actual FPS (rolling average over window) */
  actualFps: number
  /** Percentage of frames that were dropped (elapsed > 2× target) in the window */
  droppedPercent: number
}

const WINDOW_SIZE = 60 // frames to track
const CAPACITY = WINDOW_SIZE + 1 // need N+1 timestamps to measure N intervals
const UPDATE_INTERVAL_MS = 500 // How often to push state updates (avoid re-render every frame)

/** O(1) push circular buffer — avoids Array.splice overhead at 60fps */
export class CircularTimestampBuffer {
  private readonly buf = new Float64Array(CAPACITY)
  private head = 0
  private _count = 0

  get count() { return this._count }

  push(value: number) {
    const idx = (this.head + this._count) % CAPACITY
    this.buf[idx] = value
    if (this._count < CAPACITY) {
      this._count++
    } else {
      this.head = (this.head + 1) % CAPACITY // overwrite oldest
    }
  }

  get(i: number): number {
    return this.buf[(this.head + i) % CAPACITY]
  }

  oldest(): number { return this.get(0) }
  newest(): number { return this.get(this._count - 1) }

  reset() {
    this.head = 0
    this._count = 0
  }
}

export function useFpsMonitor(enabled: boolean, targetFps?: number): FpsStats {
  const [stats, setStats] = useState<FpsStats>({ actualFps: 0, droppedPercent: 0 })
  const bufRef = useRef(new CircularTimestampBuffer())
  const rafRef = useRef(0)
  const lastUpdateRef = useRef(0)

  useEffect(() => {
    if (!enabled) {
      bufRef.current.reset()
      lastUpdateRef.current = 0
      setStats({ actualFps: 0, droppedPercent: 0 })
      return
    }

    const loop = (now: number) => {
      const buf = bufRef.current
      buf.push(now)

      // Only update React state at throttled interval to avoid churn
      if (buf.count >= 2 && now - lastUpdateRef.current >= UPDATE_INTERVAL_MS) {
        lastUpdateRef.current = now

        // Calculate actual FPS from total window span
        const span = buf.newest() - buf.oldest()
        const frameCount = buf.count - 1
        const actualFps = span > 0 ? (frameCount / span) * 1000 : 0

        // Count dropped frames: any gap > 2× the expected interval
        const expectedInterval = targetFps ? 1000 / targetFps : span / frameCount
        const dropThreshold = expectedInterval * 2
        let dropped = 0
        for (let i = 1; i < buf.count; i++) {
          if (buf.get(i) - buf.get(i - 1) > dropThreshold) dropped++
        }
        const droppedPercent = frameCount > 0 ? (dropped / frameCount) * 100 : 0

        setStats({ actualFps: Math.round(actualFps), droppedPercent: Math.round(droppedPercent) })
      }

      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
      bufRef.current.reset()
      lastUpdateRef.current = 0
    }
  }, [enabled, targetFps])

  return stats
}
