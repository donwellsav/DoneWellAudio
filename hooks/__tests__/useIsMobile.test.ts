// @vitest-environment jsdom
/**
 * Tests for useIsMobile.ts — responsive breakpoint hook.
 *
 * Mocks window.matchMedia and window.innerWidth to simulate
 * viewport changes.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useIsMobile } from '../use-mobile'

// ── matchMedia mock ───────────────────────────────────────────────────────────

let changeHandler: (() => void) | null = null

function mockMatchMedia(matches: boolean) {
  const mql = {
    matches,
    addEventListener: vi.fn((_event: string, handler: () => void) => {
      changeHandler = handler
    }),
    removeEventListener: vi.fn(),
  }
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mql))
  return mql
}

function setInnerWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { value: width, writable: true, configurable: true })
}

beforeEach(() => {
  changeHandler = null
  vi.restoreAllMocks()
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useIsMobile', () => {
  it('returns true when width < 768', () => {
    setInnerWidth(500)
    mockMatchMedia(true)
    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(true)
  })

  it('returns false when width >= 768', () => {
    setInnerWidth(1024)
    mockMatchMedia(false)
    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(false)
  })

  it('updates on matchMedia change event', () => {
    setInnerWidth(1024)
    mockMatchMedia(false)
    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(false)

    // Simulate resize to mobile
    act(() => {
      setInnerWidth(400)
      if (changeHandler) changeHandler()
    })
    expect(result.current).toBe(true)
  })
})
