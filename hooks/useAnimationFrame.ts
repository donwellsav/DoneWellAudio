// KillTheRing2 Animation Frame Hook - RAF with delta timing for canvas rendering

import { useEffect, useRef } from 'react'

export interface AnimationFrameCallback {
  (deltaTime: number, timestamp: number): void
}

export function useAnimationFrame(
  callback: AnimationFrameCallback,
  enabled: boolean = true
): void {
  const callbackRef = useRef<AnimationFrameCallback>(callback)
  const rafIdRef = useRef<number>(0)
  const lastTimeRef = useRef<number>(0)

  // Update callback ref on each render
  useEffect(() => {
    callbackRef.current = callback
  }, [callback])

  useEffect(() => {
    if (!enabled) {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = 0
      }
      lastTimeRef.current = 0
      return
    }

    const loop = (timestamp: number) => {
      const deltaTime = lastTimeRef.current === 0 ? 0 : timestamp - lastTimeRef.current
      lastTimeRef.current = timestamp

      callbackRef.current(deltaTime, timestamp)

      rafIdRef.current = requestAnimationFrame(loop)
    }

    rafIdRef.current = requestAnimationFrame(loop)

    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = 0
      }
      lastTimeRef.current = 0
    }
  }, [enabled])
}
