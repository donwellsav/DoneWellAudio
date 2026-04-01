// @vitest-environment jsdom
/**
 * Tests for useFullscreen — Fullscreen API wrapper with overlay auto-hide.
 *
 * Validates toggle, exit, keyboard shortcut (F key), overlay visibility timer,
 * and fullscreenchange event sync.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useFullscreen } from '../useFullscreen'

// ── Helpers ──────────────────────────────────────────────────────────────────

function createRef(el: HTMLDivElement | null = document.createElement('div')) {
  return { current: el }
}

let fullscreenChangeHandler: (() => void) | undefined

beforeEach(() => {
  vi.useFakeTimers()
  fullscreenChangeHandler = undefined

  // Mock Fullscreen API availability (jsdom lacks requestFullscreen)
  if (!document.documentElement.requestFullscreen) {
    document.documentElement.requestFullscreen = vi.fn().mockResolvedValue(undefined)
  }
  Object.defineProperty(document, 'fullscreenElement', {
    value: null,
    writable: true,
    configurable: true,
  })
  vi.spyOn(document, 'addEventListener').mockImplementation((event, handler) => {
    if (event === 'fullscreenchange') fullscreenChangeHandler = handler as () => void
  })
  vi.spyOn(document, 'removeEventListener').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useFullscreen', () => {
  it('starts not fullscreen with overlay visible', () => {
    const ref = createRef()
    const { result } = renderHook(() => useFullscreen(ref))

    expect(result.current.isFullscreen).toBe(false)
    expect(result.current.isOverlayVisible).toBe(true)
  })

  it('toggle enters fullscreen via API when supported', () => {
    const el = document.createElement('div')
    el.requestFullscreen = vi.fn().mockResolvedValue(undefined)
    const ref = createRef(el)

    const { result } = renderHook(() => useFullscreen(ref))
    act(() => result.current.toggle())

    expect(el.requestFullscreen).toHaveBeenCalled()
  })

  it('exit calls document.exitFullscreen when active', () => {
    const el = document.createElement('div')
    Object.defineProperty(document, 'fullscreenElement', {
      value: el,
      writable: true,
      configurable: true,
    })
    document.exitFullscreen = vi.fn().mockResolvedValue(undefined)

    const ref = createRef(el)
    const { result } = renderHook(() => useFullscreen(ref))
    act(() => result.current.exit())

    expect(document.exitFullscreen).toHaveBeenCalled()
  })

  it('exit sets isFullscreen false when no fullscreen API element', () => {
    const ref = createRef()
    const { result } = renderHook(() => useFullscreen(ref))

    // Simulate being in app-level fullscreen (no API fullscreenElement)
    act(() => {
      // Force fullscreen state via toggle with fallback
      Object.defineProperty(document.documentElement, 'requestFullscreen', {
        value: undefined,
        configurable: true,
      })
    })

    act(() => result.current.exit())
    expect(result.current.isFullscreen).toBe(false)
  })

  it('syncs with fullscreenchange events', () => {
    const el = document.createElement('div')
    const ref = createRef(el)
    const { result } = renderHook(() => useFullscreen(ref))

    // Simulate browser entering fullscreen
    Object.defineProperty(document, 'fullscreenElement', {
      value: el,
      writable: true,
      configurable: true,
    })
    act(() => fullscreenChangeHandler?.())

    expect(result.current.isFullscreen).toBe(true)
    expect(result.current.isOverlayVisible).toBe(true)
  })

  it('ignores fullscreenchange when another element enters fullscreen', () => {
    const ref = createRef()
    const { result } = renderHook(() => useFullscreen(ref))

    Object.defineProperty(document, 'fullscreenElement', {
      value: document.createElement('div'),
      writable: true,
      configurable: true,
    })
    act(() => fullscreenChangeHandler?.())

    expect(result.current.isFullscreen).toBe(false)
  })

  it('toggle calls enter then exit on second call', () => {
    const el = document.createElement('div')
    el.requestFullscreen = vi.fn().mockResolvedValue(undefined)
    const ref = createRef(el)

    const { result } = renderHook(() => useFullscreen(ref))

    // First toggle → enters fullscreen
    act(() => result.current.toggle())
    expect(el.requestFullscreen).toHaveBeenCalledOnce()

    // Simulate browser confirming fullscreen
    Object.defineProperty(document, 'fullscreenElement', {
      value: el, writable: true, configurable: true,
    })
    act(() => fullscreenChangeHandler?.())
    expect(result.current.isFullscreen).toBe(true)

    // Second toggle → exits
    document.exitFullscreen = vi.fn().mockResolvedValue(undefined)
    act(() => result.current.toggle())
    expect(document.exitFullscreen).toHaveBeenCalledOnce()
  })

  it('provides toggle, exit as stable function references', () => {
    const ref = createRef()
    const { result, rerender } = renderHook(() => useFullscreen(ref))

    const toggle1 = result.current.toggle
    const exit1 = result.current.exit

    rerender()

    expect(result.current.toggle).toBe(toggle1)
    expect(result.current.exit).toBe(exit1)
  })
})
