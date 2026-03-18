'use client'

import { memo, lazy, Suspense } from 'react'
import { FeedbackHistoryPanel } from './FeedbackHistoryPanel'

const LazyHelpMenu = lazy(() => import('./HelpMenu').then(m => ({ default: m.HelpMenu })))
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { LayoutGrid, Maximize2, Mic, Minimize2, Pause, Play, Trash2 } from 'lucide-react'
import { KtrLogo } from './KtrLogo'
import { useAdvisories } from '@/contexts/AdvisoryContext'
import { useEngine } from '@/contexts/EngineContext'
import { useUI } from '@/contexts/UIContext'
export const HeaderBar = memo(function HeaderBar() {
  const { isRunning, start, stop, devices, selectedDeviceId, handleDeviceChange } = useEngine()
  const { resetLayout, isFullscreen, toggleFullscreen, isFrozen, toggleFreeze, isRtaFullscreen, toggleRtaFullscreen } = useUI()
  const { advisories, dismissedIds, onClearAll, onClearGEQ, onClearRTA, hasActiveGEQBars, hasActiveRTAMarkers } = useAdvisories()
  const hasClearableContent = advisories.some(a => !dismissedIds.has(a.id)) || hasActiveGEQBars || hasActiveRTAMarkers

  return (
    <header className="relative flex flex-row items-center justify-between gap-2 sm:gap-4 px-3 py-1 border-b border-border bg-card/90 backdrop-blur-sm shadow-[0_1px_12px_rgba(0,0,0,0.5),0_1px_0_rgba(75,146,255,0.08)] sm:px-4 sm:py-1">

      {/* ── Logo + start button (responsive single block) ─────────── */}
      <div className="flex items-center gap-2 sm:gap-2.5 flex-shrink-0">
        <div className="relative">
          <button
            onClick={isRunning ? stop : start}
            aria-label={isRunning ? 'Stop analysis' : 'Start analysis'}
            className="relative flex items-center justify-center flex-shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
          >
            <KtrLogo
              className={`size-16 transition-colors duration-300 ${isRunning ? 'text-foreground drop-shadow-[0_0_8px_rgba(75,146,255,0.6)] animate-led-blink' : 'text-foreground/70 hover:text-foreground'}`}
            />
          </button>
        </div>

        <div className="flex flex-col justify-center gap-[2px] sm:gap-[3px] min-w-0">
          <div className="flex items-baseline gap-1 sm:gap-1.5 leading-none">
            <span className="font-mono text-sm sm:text-base font-black tracking-[0.15em] sm:tracking-[0.2em] text-foreground/90">KILL THE</span>
            <span className="font-mono text-base sm:text-lg font-black tracking-[0.15em] sm:tracking-[0.2em] text-primary drop-shadow-[0_0_10px_rgba(75,146,255,0.4)]">RING</span>
          </div>
          <span className="sm:hidden text-xs font-mono font-medium tracking-[0.2em] sm:tracking-[0.25em] text-muted-foreground uppercase leading-none">
            Don Wells AV
          </span>
          <span className="sm:hidden text-xs font-mono font-medium tracking-[0.2em] sm:tracking-[0.25em] text-muted-foreground uppercase leading-none">
            v{process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0'}
          </span>
          <span className="hidden sm:inline text-xs sm:text-sm font-mono font-medium tracking-[0.25em] text-muted-foreground uppercase leading-none">
            Don Wells AV v{process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0'}
          </span>
        </div>
      </div>

      {/* ── Action icons (right side) ──────────────────── */}
      <div className="flex items-center justify-end gap-0.5 sm:gap-2 text-sm text-muted-foreground flex-shrink-0">

        {/* Audio source selector */}
        {devices.length > 0 && (
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 text-muted-foreground hover:text-foreground transition-all duration-150 active:scale-95"
                    aria-label="Select audio input"
                  >
                    <Mic className="size-6" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-sm">
                Audio input
              </TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end" className="max-w-[360px]">
              <DropdownMenuRadioGroup value={selectedDeviceId} onValueChange={handleDeviceChange}>
                <DropdownMenuRadioItem value="" className="text-sm">
                  Default (System)
                </DropdownMenuRadioItem>
                {devices.map(d => (
                  <DropdownMenuRadioItem key={d.deviceId} value={d.deviceId} className="text-sm truncate">
                    {d.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={resetLayout}
              className="hidden tablet:flex tablet:landscape:hidden md:landscape:flex h-10 w-10 text-muted-foreground hover:text-foreground transition-all duration-150 active:scale-95"
              aria-label="Reset panel layout"
            >
              <LayoutGrid className="size-6" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-sm">
            Reset panel layout
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleRtaFullscreen}
              className="flex h-10 w-10 text-muted-foreground hover:text-foreground transition-all duration-150 active:scale-95"
              aria-label={isRtaFullscreen ? 'Exit RTA fullscreen' : 'RTA fullscreen'}
            >
              {isRtaFullscreen ? <Minimize2 className="size-6" /> : <Maximize2 className="size-6" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-sm">
            {isRtaFullscreen ? 'Exit RTA fullscreen' : 'RTA fullscreen'}
          </TooltipContent>
        </Tooltip>

        {isRunning && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleFreeze}
                className={`hidden tablet:flex tablet:landscape:hidden md:landscape:flex h-10 w-10 ${
                  isFrozen ? 'text-blue-400' : 'text-muted-foreground hover:text-foreground'
                }`}
                aria-label={isFrozen ? 'Unfreeze spectrum' : 'Freeze spectrum'}
                aria-pressed={isFrozen}
              >
                {isFrozen ? <Play className="size-6" /> : <Pause className="size-6" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-sm">
              {isFrozen ? 'Unfreeze (P)' : 'Freeze display (P)'}
            </TooltipContent>
          </Tooltip>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => { onClearAll(); onClearGEQ(); onClearRTA() }}
              disabled={!hasClearableContent}
              className={`h-10 w-10 transition-all duration-150 active:scale-95 ${
                hasClearableContent
                  ? 'text-muted-foreground hover:text-red-400'
                  : 'text-muted-foreground/30 cursor-default'
              }`}
              aria-label="Clear all advisories, GEQ, and RTA markers"
            >
              <Trash2 className="size-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-sm">
            Clear all
          </TooltipContent>
        </Tooltip>

        <FeedbackHistoryPanel />
        <Suspense fallback={<div className="h-10 w-10" />}>
          <LazyHelpMenu />
        </Suspense>
      </div>
    </header>
  )
})
