'use client'

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useEffect,
  type ReactNode,
  type RefObject,
} from 'react'
import { useFullscreen } from '@/hooks/useFullscreen'
import { useAudio } from '@/contexts/AudioAnalyzerContext'

// ── Context value ───────────────────────────────────────────────────────────

export interface UIContextValue {
  mobileTab: 'issues' | 'graph' | 'settings'
  setMobileTab: (tab: 'issues' | 'graph' | 'settings') => void
  isFrozen: boolean
  toggleFreeze: () => void
  isFullscreen: boolean
  toggleFullscreen: () => void
  layoutKey: number
  resetLayout: () => void
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
  const { isRunning } = useAudio()

  // ── Mobile tab ────────────────────────────────────────────────────────

  const [mobileTab, setMobileTab] = useState<'issues' | 'graph' | 'settings'>('issues')

  // ── Freeze ────────────────────────────────────────────────────────────

  const [isFrozen, setIsFrozen] = useState(false)
  const toggleFreeze = useCallback(() => setIsFrozen(prev => !prev), [])

  // Auto-unfreeze when stopping analysis
  useEffect(() => {
    if (!isRunning) setIsFrozen(false)
  }, [isRunning])

  // ── Fullscreen ────────────────────────────────────────────────────────

  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen(rootRef)

  // ── Layout key (forces re-mount of resizable panels on reset) ─────────

  const [layoutKey, setLayoutKey] = useState(0)

  const resetLayout = useCallback(() => {
    try {
      localStorage.removeItem('react-resizable-panels:ktr-layout-main')
      localStorage.removeItem('react-resizable-panels:ktr-layout-main-v2')
      localStorage.removeItem('react-resizable-panels:ktr-layout-main-v3')
      localStorage.removeItem('react-resizable-panels:ktr-layout-main-v4')
      localStorage.removeItem('react-resizable-panels:ktr-layout-vertical')
      localStorage.removeItem('react-resizable-panels:ktr-layout-bottom')
    } catch { /* ignore */ }
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
  }), [
    mobileTab,
    setMobileTab,
    isFrozen,
    toggleFreeze,
    isFullscreen,
    toggleFullscreen,
    layoutKey,
    resetLayout,
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
