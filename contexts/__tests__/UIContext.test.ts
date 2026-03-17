// @vitest-environment jsdom
/**
 * Tests for UIContext.tsx — UI state management context.
 *
 * Mocks useEngine() and useFullscreen() to isolate UI state logic.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { createElement, createRef, type ReactNode } from 'react'

// ── Mock dependencies ─────────────────────────────────────────────────────────

let mockIsRunning = false

vi.mock('@/contexts/EngineContext', () => ({
  useEngine: () => ({ isRunning: mockIsRunning }),
}))

vi.mock('@/hooks/useFullscreen', () => ({
  useFullscreen: () => ({ isFullscreen: false, toggle: vi.fn() }),
}))

vi.mock('@/lib/storage/ktrStorage', () => ({
  clearPanelLayouts: vi.fn(),
}))

import { UIProvider, useUI } from '../UIContext'
import { clearPanelLayouts } from '@/lib/storage/ktrStorage'

// ── Wrapper ───────────────────────────────────────────────────────────────────

function wrapper({ children }: { children: ReactNode }) {
  const rootRef = createRef<HTMLDivElement>()
  // eslint-disable-next-line react/no-children-prop
  return createElement(UIProvider, { rootRef, children })
}

beforeEach(() => {
  mockIsRunning = false
  vi.clearAllMocks()
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('UIContext', () => {
  it('provides initial state values', () => {
    const { result } = renderHook(() => useUI(), { wrapper })
    expect(result.current.mobileTab).toBe('issues')
    expect(result.current.isFrozen).toBe(false)
    expect(result.current.layoutKey).toBe(0)
    expect(result.current.isRtaFullscreen).toBe(false)
  })

  it('setMobileTab changes the active tab', () => {
    const { result } = renderHook(() => useUI(), { wrapper })
    act(() => result.current.setMobileTab('graph'))
    expect(result.current.mobileTab).toBe('graph')
  })

  it('toggleFreeze toggles frozen state', () => {
    const { result } = renderHook(() => useUI(), { wrapper })
    act(() => result.current.toggleFreeze())
    expect(result.current.isFrozen).toBe(true)
    act(() => result.current.toggleFreeze())
    expect(result.current.isFrozen).toBe(false)
  })

  it('resetLayout increments layoutKey and clears panel layouts', () => {
    const { result } = renderHook(() => useUI(), { wrapper })
    act(() => result.current.resetLayout())
    expect(result.current.layoutKey).toBe(1)
    expect(clearPanelLayouts).toHaveBeenCalledOnce()
  })

  it('throws when used outside UIProvider', () => {
    expect(() => {
      renderHook(() => useUI())
    }).toThrow('useUI must be used within <UIProvider>')
  })
})
