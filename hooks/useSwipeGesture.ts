'use client'

import { useState, useRef, useCallback, useEffect } from 'react'

// ── Constants ────────────────────────────────────────────────────────
const DEFAULT_SWIPE_THRESHOLD = 60
const DEFAULT_SWIPE_VERTICAL_LIMIT = 40
const LONG_PRESS_MS = 500

// ── Types ────────────────────────────────────────────────────────────

export interface UseSwipeGestureConfig {
  /** Whether swipe gestures are active */
  enabled: boolean
  /** Minimum horizontal distance (px) to trigger a swipe action (default 60) */
  threshold?: number
  /** Maximum vertical distance (px) before gesture becomes a scroll (default 40) */
  verticalLimit?: number
  /** Called when user swipes left past the threshold */
  onSwipeLeft?: () => void
  /** Called when user swipes right past the threshold */
  onSwipeRight?: () => void
  /** Called on long-press (500ms hold). Fires haptic feedback (30ms vibrate). */
  onLongPress?: () => void
}

export interface UseSwipeGestureReturn {
  /** Current horizontal offset in px (positive = right, negative = left) */
  swipeX: number
  /** Whether user is actively swiping (past initial dead zone) */
  swiping: boolean
  /** Progress toward threshold, clamped 0–1 */
  swipeProgress: number
  /** Current swipe direction, or null if not swiping */
  swipeDirection: 'left' | 'right' | null
  /** Touch event handlers to spread onto the swipeable element */
  handlers: {
    onTouchStart: (e: React.TouchEvent) => void
    onTouchMove: (e: React.TouchEvent) => void
    onTouchEnd: () => void
  }
}

/**
 * Reusable swipe + long-press gesture hook for touch-friendly card interactions.
 *
 * Encapsulates horizontal swipe detection with vertical-scroll bailout,
 * long-press timer with haptic feedback, and threshold-crossing haptics.
 *
 * Note: React's synthetic onTouchMove is non-passive, so e.preventDefault()
 * works correctly to prevent scroll during horizontal swipes. If migrating to
 * raw addEventListener, use { passive: false } explicitly.
 */
export function useSwipeGesture(config: UseSwipeGestureConfig): UseSwipeGestureReturn {
  const {
    enabled,
    threshold = DEFAULT_SWIPE_THRESHOLD,
    verticalLimit = DEFAULT_SWIPE_VERTICAL_LIMIT,
    onSwipeLeft,
    onSwipeRight,
    onLongPress,
  } = config

  // ── State ────────────────────────────────────────────────────────
  const [swipeX, setSwipeX] = useState(0)
  const [swiping, setSwiping] = useState(false)

  // ── Refs (no re-render needed) ───────────────────────────────────
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const swipeLocked = useRef(false)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressed = useRef(false)
  const hapticFired = useRef(false)

  // ── Long-press cleanup ───────────────────────────────────────────
  const clearLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }, [])

  // Clean up timer on unmount
  useEffect(() => clearLongPress, [clearLongPress])

  // ── Touch handlers ───────────────────────────────────────────────
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (!enabled) return
    const t = e.touches[0]
    touchStart.current = { x: t.clientX, y: t.clientY }
    swipeLocked.current = false
    hapticFired.current = false
    longPressed.current = false
    setSwiping(false)

    // Start long-press timer
    clearLongPress()
    longPressTimer.current = setTimeout(() => {
      if (onLongPress) {
        onLongPress()
        longPressed.current = true
        navigator.vibrate?.(30)
      }
      touchStart.current = null
    }, LONG_PRESS_MS)
  }, [enabled, clearLongPress, onLongPress])

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!enabled || !touchStart.current) return
    const t = e.touches[0]
    const dx = t.clientX - touchStart.current.x
    const dy = t.clientY - touchStart.current.y

    // Any movement cancels long-press
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) clearLongPress()

    // If vertical movement dominates, bail — let the list scroll
    if (!swipeLocked.current) {
      if (Math.abs(dy) > verticalLimit) {
        touchStart.current = null
        setSwipeX(0)
        setSwiping(false)
        return
      }
      if (Math.abs(dx) > 10) swipeLocked.current = true
    }

    if (swipeLocked.current) {
      e.preventDefault()
      setSwipeX(dx)
      setSwiping(true)
      // Haptic feedback when crossing swipe threshold (fire once per gesture)
      if (!hapticFired.current && Math.abs(dx) >= threshold) {
        hapticFired.current = true
        navigator.vibrate?.(10)
      }
    }
  }, [enabled, clearLongPress, verticalLimit, threshold])

  const onTouchEnd = useCallback(() => {
    clearLongPress()
    if (!enabled || !touchStart.current || longPressed.current) {
      touchStart.current = null
      setSwipeX(0)
      setSwiping(false)
      swipeLocked.current = false
      longPressed.current = false
      return
    }
    // Swipe left or right past threshold
    if (swipeX < -threshold && onSwipeLeft) {
      onSwipeLeft()
    } else if (swipeX > threshold && onSwipeRight) {
      onSwipeRight()
    }
    touchStart.current = null
    setSwipeX(0)
    setSwiping(false)
    swipeLocked.current = false
  }, [enabled, swipeX, onSwipeLeft, onSwipeRight, clearLongPress, threshold])

  // ── Derived values ───────────────────────────────────────────────
  const swipeProgress = Math.min(Math.abs(swipeX) / threshold, 1)
  const swipeDirection: 'left' | 'right' | null =
    swipeX < 0 ? 'left' : swipeX > 0 ? 'right' : null

  return {
    swipeX,
    swiping,
    swipeProgress,
    swipeDirection,
    handlers: { onTouchStart, onTouchMove, onTouchEnd },
  }
}
