// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useRtaFullscreenState } from '../useRtaFullscreenState'

describe('useRtaFullscreenState', () => {
  beforeEach(() => {
    Object.defineProperty(document, 'fullscreenElement', {
      value: null,
      writable: true,
      configurable: true,
    })
    document.exitFullscreen = vi.fn().mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('requests fullscreen for the first visible registered container', () => {
    const hiddenElement = document.createElement('div')
    document.body.appendChild(hiddenElement)
    Object.defineProperty(hiddenElement, 'offsetParent', { value: null })
    hiddenElement.requestFullscreen = vi.fn().mockResolvedValue(undefined)

    const visibleElement = document.createElement('div')
    document.body.appendChild(visibleElement)
    Object.defineProperty(visibleElement, 'offsetParent', { value: document.body })
    visibleElement.requestFullscreen = vi.fn().mockResolvedValue(undefined)

    const { result } = renderHook(() => useRtaFullscreenState())

    act(() => {
      result.current.rtaContainerRef(hiddenElement)
      result.current.rtaContainerRef(visibleElement)
      result.current.toggleRtaFullscreen()
    })

    expect(hiddenElement.requestFullscreen).not.toHaveBeenCalled()
    expect(visibleElement.requestFullscreen).toHaveBeenCalledTimes(1)
  })

  it('tracks fullscreenchange for registered RTA containers', () => {
    const visibleElement = document.createElement('div')
    document.body.appendChild(visibleElement)
    Object.defineProperty(visibleElement, 'offsetParent', { value: document.body })
    visibleElement.requestFullscreen = vi.fn().mockResolvedValue(undefined)

    const { result } = renderHook(() => useRtaFullscreenState())

    act(() => {
      result.current.rtaContainerRef(visibleElement)
      Object.defineProperty(document, 'fullscreenElement', {
        value: visibleElement,
        writable: true,
        configurable: true,
      })
      document.dispatchEvent(new Event('fullscreenchange'))
    })

    expect(result.current.isRtaFullscreen).toBe(true)
  })

  it('exits fullscreen when toggled off', () => {
    const visibleElement = document.createElement('div')
    document.body.appendChild(visibleElement)
    Object.defineProperty(visibleElement, 'offsetParent', { value: document.body })
    visibleElement.requestFullscreen = vi.fn().mockResolvedValue(undefined)

    const { result } = renderHook(() => useRtaFullscreenState())

    act(() => {
      result.current.rtaContainerRef(visibleElement)
      Object.defineProperty(document, 'fullscreenElement', {
        value: visibleElement,
        writable: true,
        configurable: true,
      })
      document.dispatchEvent(new Event('fullscreenchange'))
    })

    act(() => {
      result.current.toggleRtaFullscreen()
    })

    expect(document.exitFullscreen).toHaveBeenCalledTimes(1)
  })
})
