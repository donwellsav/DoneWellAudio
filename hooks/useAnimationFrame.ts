/**
 * useAnimationFrame — requestAnimationFrame loop with delta timing for canvas rendering.
 *
 * Provides a stable RAF loop that respects an optional targetFps throttle.
 * Callback receives deltaTime (ms since last frame) and raw timestamp.
 * Automatically cancels on unmount or when `enabled` transitions to false.
 */

import { useEffect, useRef } from 'react'
import { logError } from '@/lib/utils/logger'

export interface AnimationFrameCallback {
  (deltaTime: number, timestamp: number): void
}

export function useAnimationFrame(
  callback: AnimationFrameCallback,
  enabled: boolean = true,
  targetFps?: number,
): void {
  const callbackRef = useRef<AnimationFrameCallback>(callback)
  const rafIdRef = useRef<number>(0)
  const lastTimeRef = useRef<number>(0)
  const lastInvokeRef = useRef<number>(0)
  const targetFpsRef = useRef(targetFps)

  // Update refs on each render (avoids re-subscribing RAF)
  useEffect(() => {
    callbackRef.current = callback
  }, [callback])

  useEffect(() => {
    targetFpsRef.current = targetFps
  }, [targetFps])

  useEffect(() => {
    if (!enabled) {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = 0
      }
      lastTimeRef.current = 0
      lastInvokeRef.current = 0
      return
    }

    const loop = (timestamp: number) => {
      const fps = targetFpsRef.current
      const interval = fps ? 1000 / fps : 0

      // Gate callback behind elapsed-time check when targetFps is set
      if (!fps || timestamp - lastInvokeRef.current >= interval) {
        const deltaTime = lastTimeRef.current === 0 ? 0 : timestamp - lastTimeRef.current
        lastTimeRef.current = timestamp
        lastInvokeRef.current = timestamp

        try {
          callbackRef.current(deltaTime, timestamp)
        } catch (err) {
          logError('[useAnimationFrame] callback error:', err)
        }
      }

      rafIdRef.current = requestAnimationFrame(loop)
    }

    rafIdRef.current = requestAnimationFrame(loop)

    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = 0
      }
      lastTimeRef.current = 0
      lastInvokeRef.current = 0
    }
  }, [enabled])
}
