'use client'

import { useCallback, useState } from 'react'
import { swipeHintStorage } from '@/lib/storage/dwaStorage'

export interface SwipeHintState {
  showSwipeHint: boolean
  dismissSwipeHint: () => void
}

export function useSwipeHintState(enabled: boolean): SwipeHintState {
  const [showSwipeHint, setShowSwipeHint] = useState(() => {
    if (!enabled) return false
    return !swipeHintStorage.isSet()
  })

  const dismissSwipeHint = useCallback(() => {
    setShowSwipeHint(false)
    swipeHintStorage.set()
  }, [])

  return {
    showSwipeHint,
    dismissSwipeHint,
  }
}
