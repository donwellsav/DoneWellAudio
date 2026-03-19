'use client'

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
  type ReactNode,
  type RefObject,
} from 'react'
import { useFullscreen } from '@/hooks/useFullscreen'
import { useEngine } from '@/contexts/EngineContext'
import { clearPanelLayouts } from '@/lib/storage/ktrStorage'

// ── Context value ───────────────────────────────────────────────────────────

export interface UIContextValue {
  mobileTab: 'issues' | 'settings'
  setMobileTab: (tab: 'issues' | 'settings') => void
  isFrozen: boolean
  toggleFreeze: () => void
  isFullscreen: boolean
  toggleFullscreen: () => void
  layoutKey: number
  resetLayout: () => void
  /** Callback ref to attach to RTA container div(s) for element-level fullscreen */
  rtaContainerRef: (node: HTMLDivElement | null) => void
  isRtaFullscreen: boolean
  toggleRtaFullscreen: () => void
}

const UIContext = createContext<UIContextValue | null>(null)

// ── Provider props ──────────────────────────────────────────────────────────

interface UIProviderProps {
  /** Root element ref for fullscreen API */
  rootRef: RefObject<HTMLDivElement | null>
  children: ReactNode
}

// ── Provider ────────────────────────────────────────────────────────────────

export function UIProvider({ rootRef, children }: UIProviderProps) {
  const { isRunning } = useEngine()

  // ── Mobile tab ────────────────────────────────────────────────────────

  const [mobileTab, setMobileTab] = useState<'issues' | 'settings'>('issues')

  // ── Freeze ────────────────────────────────────────────────────────────

  const [isFrozen, setIsFrozen] = useState(false)
  const toggleFreeze = useCallback(() => setIsFrozen(prev => !prev), [])

  // Auto-unfreeze when stopping analysis
  useEffect(() => {
    if (!isRunning) setIsFrozen(false)
  }, [isRunning])

  // ── Fullscreen ────────────────────────────────────────────────────────

  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen(rootRef)

  // ── RTA fullscreen ───────────────────────────────────────────────────

  const rtaContainerRefs = useRef<Set<HTMLDivElement>>(new Set())
  const [isRtaFullscreen, setIsRtaFullscreen] = useState(false)

  /** Callback ref for RTA containers — multiple layouts can register their RTA div */
  const rtaContainerRef = useCallback((node: HTMLDivElement | null) => {
    // React calls with null on unmount, node on mount
    if (node) {
      rtaContainerRefs.current.add(node)
    }
    // Cleanup stale refs on each call
    for (const el of rtaContainerRefs.current) {
      if (!el.isConnected) rtaContainerRefs.current.delete(el)
    }
  }, [])

  const toggleRtaFullscreen = useCallback(() => {
    if (isRtaFullscreen) {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => setIsRtaFullscreen(false))
      } else {
        setIsRtaFullscreen(false)
      }
    } else {
      // Find the first visible RTA container
      for (const el of rtaContainerRefs.current) {
        if (el.offsetParent !== null && el.requestFullscreen) {
          el.requestFullscreen().catch(() => {})
          break
        }
      }
    }
  }, [isRtaFullscreen])

  // Sync RTA fullscreen state with browser events
  useEffect(() => {
    const onChange = () => {
      const fsEl = document.fullscreenElement
      setIsRtaFullscreen(!!fsEl && rtaContainerRefs.current.has(fsEl as HTMLDivElement))
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  // ── Layout key (forces re-mount of resizable panels on reset) ─────────

  const [layoutKey, setLayoutKey] = useState(0)

  const resetLayout = useCallback(() => {
    clearPanelLayouts()
    setLayoutKey(k => k + 1)
  }, [])

  // ── Memoized value ────────────────────────────────────────────────────

  const value = useMemo<UIContextValue>(() => ({
    mobileTab,
    setMobileTab,
    isFrozen,
    toggleFreeze,
    isFullscreen,
    toggleFullscreen,
    layoutKey,
    resetLayout,
    rtaContainerRef,
    isRtaFullscreen,
    toggleRtaFullscreen,
  }), [
    mobileTab,
    setMobileTab,
    isFrozen,
    toggleFreeze,
    isFullscreen,
    toggleFullscreen,
    layoutKey,
    resetLayout,
    isRtaFullscreen,
    toggleRtaFullscreen,
  ])

  return (
    <UIContext.Provider value={value}>
      {children}
    </UIContext.Provider>
  )
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useUI(): UIContextValue {
  const ctx = useContext(UIContext)
  if (!ctx) throw new Error('useUI must be used within <UIProvider>')
  return ctx
}
