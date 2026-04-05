'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type RefObject,
} from 'react'
import { useFullscreen } from '@/hooks/useFullscreen'
import { clearPanelLayouts } from '@/lib/storage/dwaStorage'

export interface GeneralUIState {
  mobileTab: 'issues' | 'settings'
  setMobileTab: (tab: 'issues' | 'settings') => void
  isFrozen: boolean
  toggleFreeze: () => void
  isFullscreen: boolean
  toggleFullscreen: () => void
  layoutKey: number
  resetLayout: () => void
}

export function useGeneralUIState(
  rootRef: RefObject<HTMLDivElement | null>,
  isRunning: boolean,
): GeneralUIState {
  const [mobileTab, setMobileTab] = useState<'issues' | 'settings'>('issues')
  const [isFrozen, setIsFrozen] = useState(false)
  const [layoutKey, setLayoutKey] = useState(0)
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen(rootRef)

  const toggleFreeze = useCallback(() => {
    setIsFrozen((previous) => !previous)
  }, [])

  useEffect(() => {
    if (!isRunning) {
      setIsFrozen(false)
    }
  }, [isRunning])

  const resetLayout = useCallback(() => {
    clearPanelLayouts()
    setLayoutKey((current) => current + 1)
  }, [])

  return useMemo(() => ({
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
}
