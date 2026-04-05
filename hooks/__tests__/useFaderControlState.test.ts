// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useFaderControlState } from '@/hooks/useFaderControlState'

describe('useFaderControlState', () => {
  it('uses the auto gain display value for gain mode', () => {
    const trackRef = { current: null as HTMLDivElement | null }

    const { result } = renderHook(() =>
      useFaderControlState({
        mode: 'gain',
        value: 5,
        onChange: vi.fn(),
        min: -40,
        max: 40,
        trackRef,
        autoGainEnabled: true,
        autoGainDb: 8,
      }),
    )

    expect(result.current.displayValue).toBe(8)
    expect(result.current.valueLabel).toBe('+8')
  })

  it('steps sensitivity in the inverted direction', () => {
    const onChange = vi.fn()
    const trackRef = { current: null as HTMLDivElement | null }

    const { result } = renderHook(() =>
      useFaderControlState({
        mode: 'sensitivity',
        value: 20,
        onChange,
        min: 2,
        max: 50,
        trackRef,
      }),
    )

    act(() => {
      result.current.handleKeyStep(1)
    })

    expect(onChange).toHaveBeenCalledWith(19)
  })

  it('clamps typed gain edits and disables auto gain first', () => {
    const onChange = vi.fn()
    const onAutoGainToggle = vi.fn()
    const trackRef = { current: null as HTMLDivElement | null }

    const { result } = renderHook(() =>
      useFaderControlState({
        mode: 'gain',
        value: 0,
        onChange,
        min: -40,
        max: 40,
        trackRef,
        autoGainEnabled: true,
        autoGainDb: 12,
        onAutoGainToggle,
      }),
    )

    act(() => {
      result.current.setEditing(true)
    })

    act(() => {
      result.current.commitEdit('99')
    })

    expect(onAutoGainToggle).toHaveBeenCalledWith(false)
    expect(onChange).toHaveBeenCalledWith(40)
    expect(result.current.editing).toBe(false)
  })
})
