// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useMobileTabNavigation } from '@/hooks/useMobileTabNavigation'

function makeTouchEvent(clientX: number, clientY: number): React.TouchEvent {
  return {
    touches: [{ clientX, clientY }] as unknown as React.TouchList,
    changedTouches: [{ clientX, clientY }] as unknown as React.TouchList,
    preventDefault: vi.fn(),
  } as unknown as React.TouchEvent
}

function makeKeyEvent(key: string): React.KeyboardEvent {
  return {
    key,
    preventDefault: vi.fn(),
  } as unknown as React.KeyboardEvent
}

describe('useMobileTabNavigation', () => {
  it('moves between tabs with keyboard navigation', () => {
    const setMobileTab = vi.fn()
    const { result } = renderHook(() => useMobileTabNavigation({
      mobileTab: 'issues',
      setMobileTab,
    }))

    act(() => {
      result.current.handleTabKeyDown(makeKeyEvent('ArrowRight'))
    })

    expect(setMobileTab).toHaveBeenCalledWith('settings')
  })

  it('swipes from settings back to issues', () => {
    const setMobileTab = vi.fn()
    const { result } = renderHook(() => useMobileTabNavigation({
      mobileTab: 'settings',
      setMobileTab,
    }))

    act(() => {
      result.current.onTouchStart(makeTouchEvent(100, 100))
      result.current.onTouchEnd(makeTouchEvent(170, 100))
    })

    expect(setMobileTab).toHaveBeenCalledWith('issues')
  })

  it('does not swipe away from the issues tab', () => {
    const setMobileTab = vi.fn()
    const { result } = renderHook(() => useMobileTabNavigation({
      mobileTab: 'issues',
      setMobileTab,
    }))

    act(() => {
      result.current.onTouchStart(makeTouchEvent(100, 100))
      result.current.onTouchEnd(makeTouchEvent(20, 100))
    })

    expect(setMobileTab).not.toHaveBeenCalled()
  })
})
