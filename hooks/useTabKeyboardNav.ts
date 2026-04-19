'use client'

import { useCallback, type KeyboardEvent } from 'react'

/**
 * WAI-ARIA tablist keyboard navigation for custom tab bars that don't use
 * Radix Tabs (e.g. DesktopLayout primary + secondary tab rails).
 *
 * Attach the returned handler to every tab `<button>` inside the same
 * container. The container should have `role="tablist"`; each button
 * should have `role="tab"`, `aria-selected`, and a focus ring.
 *
 * Keys handled:
 *   ArrowLeft  — focus previous enabled tab (wraps)
 *   ArrowRight — focus next enabled tab (wraps)
 *   Home       — focus first enabled tab
 *   End        — focus last enabled tab
 */
export function useTabKeyboardNav() {
  return useCallback((event: KeyboardEvent<HTMLButtonElement>) => {
    const key = event.key
    if (key !== 'ArrowLeft' && key !== 'ArrowRight' && key !== 'Home' && key !== 'End') {
      return
    }

    const current = event.currentTarget
    const container = current.parentElement
    if (!container) return

    const tabs = Array.from(
      container.querySelectorAll<HTMLButtonElement>('button:not([disabled])'),
    )
    if (tabs.length === 0) return

    const currentIndex = tabs.indexOf(current)
    if (currentIndex === -1) return

    event.preventDefault()

    let nextIndex: number
    if (key === 'ArrowLeft') {
      nextIndex = currentIndex === 0 ? tabs.length - 1 : currentIndex - 1
    } else if (key === 'ArrowRight') {
      nextIndex = currentIndex === tabs.length - 1 ? 0 : currentIndex + 1
    } else if (key === 'Home') {
      nextIndex = 0
    } else {
      nextIndex = tabs.length - 1
    }

    tabs[nextIndex]?.focus()
  }, [])
}
