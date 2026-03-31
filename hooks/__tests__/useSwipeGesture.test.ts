// @vitest-environment jsdom
/**
 * Tests for useSwipeGesture — horizontal swipe + long-press detection for cards.
 *
 * Validates threshold crossing, vertical bailout, long-press timer,
 * direction detection, and progress calculations.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSwipeGesture } from '../useSwipeGesture'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeTouchEvent(clientX: number, clientY: number): React.TouchEvent {
  return {
    touches: [{ clientX, clientY }] as unknown as React.TouchList,
    preventDefault: vi.fn(),
  } as unknown as React.TouchEvent
}

beforeEach(() => {
  vi.restoreAllMocks()
  vi.useFakeTimers()
  // Stub navigator.vibrate so haptics don't throw
  vi.stubGlobal('navigator', { ...navigator, vibrate: vi.fn() })
})

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useSwipeGesture', () => {
  it('returns idle state when disabled', () => {
    const { result } = renderHook(() =>
      useSwipeGesture({ enabled: false }),
    )
    expect(result.current.swipeX).toBe(0)
    expect(result.current.swiping).toBe(false)
    expect(result.current.swipeProgress).toBe(0)
    expect(result.current.swipeDirection).toBeNull()
  })

  it('does not respond to touches when disabled', () => {
    const onSwipeLeft = vi.fn()
    const { result } = renderHook(() =>
      useSwipeGesture({ enabled: false, onSwipeLeft }),
    )

    act(() => result.current.handlers.onTouchStart(makeTouchEvent(200, 100)))
    act(() => result.current.handlers.onTouchMove(makeTouchEvent(100, 100)))
    act(() => result.current.handlers.onTouchEnd())

    expect(onSwipeLeft).not.toHaveBeenCalled()
    expect(result.current.swipeX).toBe(0)
  })

  it('detects left swipe past threshold', () => {
    const onSwipeLeft = vi.fn()
    const { result } = renderHook(() =>
      useSwipeGesture({ enabled: true, threshold: 60, onSwipeLeft }),
    )

    act(() => result.current.handlers.onTouchStart(makeTouchEvent(200, 100)))
    // Move past dead zone (>10px) to lock swipe
    act(() => result.current.handlers.onTouchMove(makeTouchEvent(185, 100)))
    // Move past threshold (60px)
    act(() => result.current.handlers.onTouchMove(makeTouchEvent(130, 100)))

    expect(result.current.swiping).toBe(true)
    expect(result.current.swipeDirection).toBe('left')
    expect(result.current.swipeX).toBe(-70)
    // swipeProgress is clamped to 1 via Math.min(abs/threshold, 1)
    expect(result.current.swipeProgress).toBe(1)

    act(() => result.current.handlers.onTouchEnd())
    expect(onSwipeLeft).toHaveBeenCalledOnce()
    // Resets after end
    expect(result.current.swipeX).toBe(0)
    expect(result.current.swiping).toBe(false)
  })

  it('detects right swipe past threshold', () => {
    const onSwipeRight = vi.fn()
    const { result } = renderHook(() =>
      useSwipeGesture({ enabled: true, threshold: 60, onSwipeRight }),
    )

    act(() => result.current.handlers.onTouchStart(makeTouchEvent(100, 100)))
    act(() => result.current.handlers.onTouchMove(makeTouchEvent(115, 100)))
    act(() => result.current.handlers.onTouchMove(makeTouchEvent(170, 100)))
    act(() => result.current.handlers.onTouchEnd())

    expect(onSwipeRight).toHaveBeenCalledOnce()
  })

  it('does not trigger swipe if threshold not reached', () => {
    const onSwipeLeft = vi.fn()
    const onSwipeRight = vi.fn()
    const { result } = renderHook(() =>
      useSwipeGesture({ enabled: true, threshold: 60, onSwipeLeft, onSwipeRight }),
    )

    act(() => result.current.handlers.onTouchStart(makeTouchEvent(200, 100)))
    act(() => result.current.handlers.onTouchMove(makeTouchEvent(185, 100)))
    act(() => result.current.handlers.onTouchMove(makeTouchEvent(160, 100)))
    act(() => result.current.handlers.onTouchEnd())

    expect(onSwipeLeft).not.toHaveBeenCalled()
    expect(onSwipeRight).not.toHaveBeenCalled()
  })

  it('bails out on vertical scroll (dy > verticalLimit)', () => {
    const onSwipeLeft = vi.fn()
    const { result } = renderHook(() =>
      useSwipeGesture({ enabled: true, verticalLimit: 40, onSwipeLeft }),
    )

    act(() => result.current.handlers.onTouchStart(makeTouchEvent(200, 100)))
    // Move vertically past limit before horizontal lock
    act(() => result.current.handlers.onTouchMove(makeTouchEvent(198, 145)))

    expect(result.current.swiping).toBe(false)
    expect(result.current.swipeX).toBe(0)
  })

  it('computes swipeProgress correctly (0–1)', () => {
    const { result } = renderHook(() =>
      useSwipeGesture({ enabled: true, threshold: 100 }),
    )

    act(() => result.current.handlers.onTouchStart(makeTouchEvent(200, 100)))
    act(() => result.current.handlers.onTouchMove(makeTouchEvent(185, 100)))
    act(() => result.current.handlers.onTouchMove(makeTouchEvent(150, 100)))

    // dx = -50, threshold = 100 → progress = 0.5
    expect(result.current.swipeProgress).toBeCloseTo(0.5, 1)
  })

  it('fires long-press callback after 500ms hold', () => {
    const onLongPress = vi.fn()
    const { result } = renderHook(() =>
      useSwipeGesture({ enabled: true, onLongPress }),
    )

    act(() => result.current.handlers.onTouchStart(makeTouchEvent(200, 100)))
    expect(onLongPress).not.toHaveBeenCalled()

    act(() => { vi.advanceTimersByTime(500) })
    expect(onLongPress).toHaveBeenCalledOnce()
  })

  it('cancels long-press if finger moves', () => {
    const onLongPress = vi.fn()
    const { result } = renderHook(() =>
      useSwipeGesture({ enabled: true, onLongPress }),
    )

    act(() => result.current.handlers.onTouchStart(makeTouchEvent(200, 100)))
    // Move more than 5px to cancel
    act(() => result.current.handlers.onTouchMove(makeTouchEvent(210, 100)))
    act(() => { vi.advanceTimersByTime(600) })

    expect(onLongPress).not.toHaveBeenCalled()
  })

  it('fires haptic on threshold crossing', () => {
    const vibrate = vi.fn()
    vi.stubGlobal('navigator', { ...navigator, vibrate })

    const { result } = renderHook(() =>
      useSwipeGesture({ enabled: true, threshold: 60 }),
    )

    act(() => result.current.handlers.onTouchStart(makeTouchEvent(200, 100)))
    act(() => result.current.handlers.onTouchMove(makeTouchEvent(185, 100)))
    // Cross threshold
    act(() => result.current.handlers.onTouchMove(makeTouchEvent(130, 100)))

    // Haptic fires once on threshold crossing (10ms vibrate)
    expect(vibrate).toHaveBeenCalledWith(10)
  })

  it('resets all state on touchEnd', () => {
    const { result } = renderHook(() =>
      useSwipeGesture({ enabled: true }),
    )

    act(() => result.current.handlers.onTouchStart(makeTouchEvent(200, 100)))
    act(() => result.current.handlers.onTouchMove(makeTouchEvent(185, 100)))
    act(() => result.current.handlers.onTouchMove(makeTouchEvent(150, 100)))
    act(() => result.current.handlers.onTouchEnd())

    expect(result.current.swipeX).toBe(0)
    expect(result.current.swiping).toBe(false)
    expect(result.current.swipeDirection).toBeNull()
  })
})
