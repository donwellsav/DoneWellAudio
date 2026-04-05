'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export interface RtaFullscreenState {
  rtaContainerRef: (node: HTMLDivElement | null) => void
  isRtaFullscreen: boolean
  toggleRtaFullscreen: () => void
}

function pruneDisconnectedElements(elements: Set<HTMLDivElement>): void {
  for (const element of elements) {
    if (!element.isConnected) {
      elements.delete(element)
    }
  }
}

export function useRtaFullscreenState(): RtaFullscreenState {
  const rtaContainerRefs = useRef<Set<HTMLDivElement>>(new Set())
  const [isRtaFullscreen, setIsRtaFullscreen] = useState(false)

  const rtaContainerRef = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      rtaContainerRefs.current.add(node)
    }
    pruneDisconnectedElements(rtaContainerRefs.current)
  }, [])

  const toggleRtaFullscreen = useCallback(() => {
    if (isRtaFullscreen) {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => setIsRtaFullscreen(false))
      } else {
        setIsRtaFullscreen(false)
      }
      return
    }

    for (const element of rtaContainerRefs.current) {
      if (element.offsetParent !== null && element.requestFullscreen) {
        element.requestFullscreen().catch(() => {})
        break
      }
    }
  }, [isRtaFullscreen])

  useEffect(() => {
    const onChange = () => {
      const fullscreenElement = document.fullscreenElement
      setIsRtaFullscreen(
        !!fullscreenElement &&
          rtaContainerRefs.current.has(fullscreenElement as HTMLDivElement),
      )
    }

    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  return useMemo(() => ({
    rtaContainerRef,
    isRtaFullscreen,
    toggleRtaFullscreen,
  }), [rtaContainerRef, isRtaFullscreen, toggleRtaFullscreen])
}
