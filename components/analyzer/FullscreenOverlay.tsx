'use client'

import { memo } from 'react'
import { Minimize2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface FullscreenOverlayProps {
  isRunning: boolean
  activeAdvisoryCount: number
  isOverlayVisible: boolean
  onStartStop: () => void
  onExitFullscreen: () => void
}

export const FullscreenOverlay = memo(function FullscreenOverlay({
  isRunning,
  activeAdvisoryCount,
  isOverlayVisible,
  onStartStop,
  onExitFullscreen,
}: FullscreenOverlayProps) {
  return (
    <div
      className="fixed top-3 right-3 z-50 flex items-center gap-2 px-2.5 py-1.5 rounded bg-card/80 backdrop-blur-sm border border-border/40 transition-opacity duration-300"
      style={{
        opacity: isOverlayVisible ? 1 : 0,
        pointerEvents: isOverlayVisible ? 'auto' : 'none',
      }}
    >
      {/* Compact start/stop button */}
      <button
        onClick={onStartStop}
        aria-label={isRunning ? 'Stop analysis' : 'Start analysis'}
        className="relative w-8 h-8 flex items-center justify-center flex-shrink-0 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary rounded-full"
      >
        <div className={`absolute inset-0.5 rounded-full border-2 transition-colors duration-300 ${isRunning ? 'border-primary' : 'border-primary/50'}`} />
        {isRunning && (
          <div className="absolute inset-0.5 rounded-full border-2 border-primary animate-ping opacity-30" />
        )}
        <svg
          className={`w-4 h-4 relative z-10 transition-colors duration-300 ${isRunning ? 'text-primary' : 'text-primary/60 hover:text-primary'}`}
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.31-2.5-4.06v8.12c1.48-.75 2.5-2.29 2.5-4.06zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
        </svg>
      </button>

      {/* Active issue count badge */}
      {activeAdvisoryCount > 0 && (
        <span className="bg-primary text-primary-foreground text-xs rounded-full min-w-[20px] h-[20px] flex items-center justify-center font-mono font-bold leading-none px-1">
          {activeAdvisoryCount}
        </span>
      )}

      {/* Exit fullscreen */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onExitFullscreen}
        className="h-7 w-7 p-0 text-white/70 hover:text-white hover:bg-accent/20"
        aria-label="Exit fullscreen"
      >
        <Minimize2 className="w-3.5 h-3.5" />
      </Button>
    </div>
  )
})
