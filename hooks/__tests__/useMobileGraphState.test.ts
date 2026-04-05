// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useMobileGraphState } from '@/hooks/useMobileGraphState'

function makeTouchEvent(clientX: number, clientY: number): React.TouchEvent {
  return {
    touches: [{ clientX, clientY }] as unknown as React.TouchList,
    changedTouches: [{ clientX, clientY }] as unknown as React.TouchList,
  } as React.TouchEvent
}

describe('useMobileGraphState', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      writable: true,
      value: 680,
    })
  })

  it('uses the compact default height on short screens and responds to graph swipes', () => {
    const { result } = renderHook(() => useMobileGraphState())

    expect(result.current.graphHeightVh).toBe(20)
    expect(result.current.inlineGraphMode).toBe('rta')

    act(() => {
      result.current.onGraphTouchStart(makeTouchEvent(200, 100))
      result.current.onGraphTouchEnd(makeTouchEvent(120, 100))
    })

    expect(result.current.inlineGraphMode).toBe('geq')
  })

  it('resizes the graph and clamps height within limits', () => {
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      writable: true,
      value: 800,
    })

    const { result } = renderHook(() => useMobileGraphState())

    act(() => {
      result.current.onResizeStart(makeTouchEvent(0, 100))
      result.current.onResizeMove(makeTouchEvent(0, 300))
      result.current.onResizeEnd()
    })

    expect(result.current.graphHeightVh).toBe(40)

    act(() => {
      result.current.nudgeGraphHeight(-50)
    })

    expect(result.current.graphHeightVh).toBe(8)
  })
})
