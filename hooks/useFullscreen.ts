'use client'

/**
 * useFullscreen — Fullscreen API wrapper with overlay auto-hide and keyboard shortcut.
 *
 * Wraps the browser Fullscreen API with iOS PWA fallback (CSS-only fullscreen).
 * Auto-hides an overlay after 3s of inactivity in fullscreen mode. F key toggles.
 * Syncs with browser fullscreenchange events for external exit (Escape key).
 */

import { useState, useEffect, useCallback, useRef, type RefObject } from 'react'

const OVERLAY_TIMEOUT_MS = 3000

export interface UseFullscreenReturn {
  isFullscreen: boolean
  isOverlayVisible: boolean
  toggle: () => void
  exit: () => void
}

export function useFullscreen(elementRef: RefObject<HTMLDivElement | null>): UseFullscreenReturn {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isOverlayVisible, setIsOverlayVisible] = useState(true)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Fullscreen API helpers ──────────────────────────────
  const isApiSupported = typeof document !== 'undefined' && !!document.documentElement?.requestFullscreen
  const isTrackedElementFullscreen = useCallback(() => (
    document.fullscreenElement !== null && document.fullscreenElement === elementRef.current
  ), [elementRef])

  const enter = useCallback(() => {
    const el = elementRef.current
    if (!el) return

    if (isApiSupported) {
      if (document.fullscreenElement && document.fullscreenElement !== el) {
        document.exitFullscreen()
          .catch(() => undefined)
          .finally(() => {
            el.requestFullscreen().catch(() => {
              // iOS Safari fallback — hide header/nav only
              setIsOverlayVisible(true)
              setIsFullscreen(true)
            })
          })
        return
      }
      el.requestFullscreen().catch(() => {
        // iOS Safari fallback — hide header/nav only
        setIsOverlayVisible(true)
        setIsFullscreen(true)
      })
    } else {
      // No Fullscreen API (iOS PWA) — app-level fullscreen
      setIsOverlayVisible(true)
      setIsFullscreen(true)
    }
  }, [elementRef, isApiSupported])

  const exit = useCallback(() => {
    if (isTrackedElementFullscreen()) {
      document.exitFullscreen().catch(() => {
        setIsFullscreen(false)
      })
    } else {
      setIsFullscreen(false)
    }
  }, [isTrackedElementFullscreen])

  const toggle = useCallback(() => {
    if (isFullscreen) {
      exit()
    } else {
      enter()
    }
  }, [isFullscreen, enter, exit])

  // ── Sync with browser fullscreen events ─────────────────
  useEffect(() => {
    const onChange = () => {
      const active = isTrackedElementFullscreen()
      setIsFullscreen(active)
      if (active) setIsOverlayVisible(true)
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [isTrackedElementFullscreen])

  // ── Keyboard shortcut: F key ────────────────────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'f' || e.key === 'F') {
        const tag = (e.target as HTMLElement)?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement)?.isContentEditable) return
        e.preventDefault()
        toggle()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [toggle])

  // ── Auto-hide overlay after inactivity ──────────────────
  const resetHideTimer = useCallback(() => {
    setIsOverlayVisible(true)
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    hideTimerRef.current = setTimeout(() => setIsOverlayVisible(false), OVERLAY_TIMEOUT_MS)
  }, [])

  useEffect(() => {
    if (!isFullscreen) {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
      return
    }

    const initialTimerId = window.setTimeout(() => {
      resetHideTimer()
    }, 0)
    const onActivity = () => resetHideTimer()

    window.addEventListener('mousemove', onActivity)
    window.addEventListener('touchstart', onActivity)
    window.addEventListener('keydown', onActivity)

    return () => {
      window.removeEventListener('mousemove', onActivity)
      window.removeEventListener('touchstart', onActivity)
      window.removeEventListener('keydown', onActivity)
      window.clearTimeout(initialTimerId)
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    }
  }, [isFullscreen, resetHideTimer])

  const effectiveOverlayVisible = !isFullscreen || isOverlayVisible

  return { isFullscreen, isOverlayVisible: effectiveOverlayVisible, toggle, exit }
}
