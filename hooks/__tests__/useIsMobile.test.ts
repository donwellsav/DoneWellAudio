// @vitest-environment jsdom
/**
 * Tests for useIsMobile.ts — responsive breakpoint hook.
 *
 * Threshold: 600px (tablet breakpoint). Devices < 600px are "mobile" (phones).
 * Tablets (≥ 600px) and desktops are NOT mobile — they get the desktop layout.
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
  it('returns true when width < 600 (phone)', () => {
    setInnerWidth(375)
    mockMatchMedia(true)
    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(true)
  })

  it('returns false when width >= 600 (tablet)', () => {
    setInnerWidth(768)
    mockMatchMedia(false)
    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(false)
  })

  it('returns false for tablet-width viewports (e.g. 700)', () => {
    setInnerWidth(700)
    mockMatchMedia(false)
    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(false)
  })

  it('updates on matchMedia change event', () => {
    setInnerWidth(1024)
    mockMatchMedia(false)
    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(false)

    // Simulate resize to phone width
    act(() => {
      setInnerWidth(400)
      if (changeHandler) changeHandler()
    })
    expect(result.current).toBe(true)
  })
})
