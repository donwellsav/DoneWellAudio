'use client'

import { useCallback, useRef } from 'react'

export const MOBILE_TAB_ORDER = ['issues', 'settings'] as const

export type MobileTabId = (typeof MOBILE_TAB_ORDER)[number]

interface UseMobileTabNavigationParams {
  mobileTab: MobileTabId
  setMobileTab: (tab: MobileTabId) => void
}

export interface UseMobileTabNavigationReturn {
  tabIndex: number
  tabRefs: React.MutableRefObject<(HTMLButtonElement | null)[]>
  handleTabKeyDown: (event: React.KeyboardEvent) => void
  onTouchStart: (event: React.TouchEvent) => void
  onTouchEnd: (event: React.TouchEvent) => void
}

export function useMobileTabNavigation({
  mobileTab,
  setMobileTab,
}: UseMobileTabNavigationParams): UseMobileTabNavigationReturn {
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([null, null])

  const handleTabKeyDown = useCallback((event: React.KeyboardEvent) => {
    const currentIndex = MOBILE_TAB_ORDER.indexOf(mobileTab)
    let nextIndex = currentIndex

    switch (event.key) {
      case 'ArrowLeft':
        nextIndex = currentIndex > 0 ? currentIndex - 1 : MOBILE_TAB_ORDER.length - 1
        break
      case 'ArrowRight':
        nextIndex = currentIndex < MOBILE_TAB_ORDER.length - 1 ? currentIndex + 1 : 0
        break
      case 'Home':
        nextIndex = 0
        break
      case 'End':
        nextIndex = MOBILE_TAB_ORDER.length - 1
        break
      default:
        return
    }

    event.preventDefault()
    setMobileTab(MOBILE_TAB_ORDER[nextIndex])
    tabRefs.current[nextIndex]?.focus()
  }, [mobileTab, setMobileTab])

  const onTouchStart = useCallback((event: React.TouchEvent) => {
    const touch = event.touches[0]
    if (!touch) return

    touchStartRef.current = { x: touch.clientX, y: touch.clientY }
  }, [])

  const onTouchEnd = useCallback((event: React.TouchEvent) => {
    const start = touchStartRef.current
    touchStartRef.current = null
    if (!start) return

    if (mobileTab === 'issues') return

    const touch = event.changedTouches[0]
    if (!touch) return

    const deltaX = touch.clientX - start.x
    const deltaY = touch.clientY - start.y
    if (Math.abs(deltaX) < 50 || Math.abs(deltaX) < Math.abs(deltaY)) return

    const currentIndex = MOBILE_TAB_ORDER.indexOf(mobileTab)
    if (deltaX < 0 && currentIndex < MOBILE_TAB_ORDER.length - 1) {
      setMobileTab(MOBILE_TAB_ORDER[currentIndex + 1])
      return
    }

    if (deltaX > 0 && currentIndex > 0) {
      setMobileTab(MOBILE_TAB_ORDER[currentIndex - 1])
    }
  }, [mobileTab, setMobileTab])

  return {
    tabIndex: MOBILE_TAB_ORDER.indexOf(mobileTab),
    tabRefs,
    handleTabKeyDown,
    onTouchStart,
    onTouchEnd,
  }
}
