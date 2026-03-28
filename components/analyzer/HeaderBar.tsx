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
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { LayoutGrid, Maximize2, Mic, Minimize2, Moon, MoreVertical, Pause, Play, Sun, Trash2 } from 'lucide-react'
import { useTheme } from 'next-themes'
import { DwaLogo } from './DwaLogo'
import { useAdvisories } from '@/contexts/AdvisoryContext'
import { useEngine } from '@/contexts/EngineContext'
import { usePA2 } from '@/contexts/PA2Context'
import { useMetering } from '@/contexts/MeteringContext'
import { useUI } from '@/contexts/UIContext'
export const HeaderBar = memo(function HeaderBar() {
  const { isRunning, start, stop, devices, selectedDeviceId, handleDeviceChange } = useEngine()
  const { inputLevel } = useMetering()
  const { resetLayout, isFullscreen, toggleFullscreen, isFrozen, toggleFreeze, isRtaFullscreen, toggleRtaFullscreen } = useUI()
  const { advisories, dismissedIds, onClearAll, onClearGEQ, onClearRTA, hasActiveGEQBars, hasActiveRTAMarkers } = useAdvisories()
  const { resolvedTheme, setTheme } = useTheme()
  const pa2 = usePA2()
  const hasClearableContent = advisories.some(a => !dismissedIds.has(a.id)) || hasActiveGEQBars || hasActiveRTAMarkers

  return (
    <header className="header-glow relative flex flex-row items-center justify-between gap-2 sm:gap-4 px-3 py-1 border-b-0 bg-card/90 backdrop-blur-sm shadow-[0_1px_16px_rgba(0,0,0,0.15),0_2px_4px_rgba(0,0,0,0.1),0_1px_0_rgba(37,99,235,0.06)] dark:shadow-[0_1px_16px_rgba(0,0,0,0.55),0_2px_4px_rgba(0,0,0,0.3),0_1px_0_rgba(75,146,255,0.08)] sm:px-4 sm:py-1">

      {/* ── Logo + start button (responsive single block) ─────────── */}
      <div className="flex items-center gap-2 sm:gap-2.5 flex-shrink-0">
        <div className="relative">
          <button
            onClick={isRunning ? stop : start}
            aria-label={isRunning ? 'Stop analysis' : 'Start analysis'}
            className="relative flex items-center justify-center flex-shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary rounded"
          >
            <DwaLogo
              className={`size-16 ${isRunning ? 'text-foreground drop-shadow-[0_0_8px_rgba(75,146,255,0.6)]' : 'text-foreground/70 hover:text-foreground'}`}
              audioLevel={isRunning ? Math.max(0, Math.min(1, (inputLevel + 60) / 60)) : undefined}
            />
          </button>
        </div>

        <div className="flex flex-col justify-center min-w-0" style={{ gap: '2px' }}>
          <span className="font-mono text-[8px] font-bold tracking-[0.25em] text-foreground/80 uppercase leading-none">Donewell</span>
          <span className="font-mono text-[10px] font-normal tracking-[0.2em] text-muted-foreground/35 leading-none">
            V{(process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0').toUpperCase()}
          </span>
        </div>

        {/* Audio source selector */}
        {devices.length > 0 && (
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11 text-foreground/70 hover:text-foreground btn-glow"
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
            <DropdownMenuContent align="start" className="max-w-[360px]">
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
      </div>

      {/* ── Action icons (right side) ──────────────────── */}
      <div className="flex items-center justify-end gap-0 sm:gap-1 text-sm text-muted-foreground flex-shrink-0">

        {/* ── PA2 status badge ─────────────────────────── */}
        {pa2.settings.enabled && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-medium cursor-default">
                <div className={`h-1.5 w-1.5 rounded-full ${
                  pa2.status === 'connected' ? 'bg-green-500' :
                  pa2.status === 'connecting' ? 'bg-yellow-500 animate-pulse' :
                  pa2.status === 'error' ? 'bg-red-500' : 'bg-muted-foreground'
                }`} />
                <span className="hidden sm:inline text-muted-foreground">PA2</span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {pa2.status === 'connected'
                ? `PA2 connected — PEQ ${pa2.notchSlotsUsed}/${pa2.notchSlotsAvailable + pa2.notchSlotsUsed} slots`
                : pa2.status === 'error'
                  ? `PA2 error: ${pa2.error ?? 'connection failed'}`
                  : `PA2 ${pa2.status}`}
            </TooltipContent>
          </Tooltip>
        )}

        {/* ── Primary actions group ───────────────────── */}
        <div className="flex items-center gap-0">

        {isRunning && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleFreeze}
                className={`hidden tablet:flex tablet:landscape:hidden md:landscape:flex h-10 w-10 btn-glow ${
                  isFrozen ? 'text-primary bg-primary/15 rounded-md' : 'text-muted-foreground hover:text-foreground'
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
              className={`relative h-10 w-10 btn-glow ${
                hasClearableContent
                  ? 'text-muted-foreground hover:text-red-400'
                  : 'text-muted-foreground/30 cursor-default'
              }`}
              aria-label="Clear all advisories, GEQ, and RTA markers"
            >
              <Trash2 className="size-5" />
              {hasClearableContent && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-400/80" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-sm">
            Clear all
          </TooltipContent>
        </Tooltip>

        </div>

        {/* ── Separator (desktop only) ────────────────── */}
        <div className="hidden tablet:block w-px h-6 bg-border/40 mx-1 sm:mx-1.5 flex-shrink-0" aria-hidden="true" />

        {/* ── Utility group (desktop: inline, mobile: overflow menu) ── */}
        <div className="hidden tablet:flex items-center gap-0">
          <FeedbackHistoryPanel />
          <Suspense fallback={<div className="h-10 w-10" />}>
            <LazyHelpMenu />
          </Suspense>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
                aria-label="Toggle theme"
                className="h-10 w-10 cursor-pointer text-muted-foreground hover:text-foreground"
              >
                {resolvedTheme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-sm">
              {resolvedTheme === 'dark' ? 'Light mode' : 'Dark mode'}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={resetLayout}
                className="h-10 w-10 text-muted-foreground hover:text-foreground btn-glow"
                aria-label="Reset panel layout"
              >
                <LayoutGrid className="size-6" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-sm">
              Reset panel layout
            </TooltipContent>
          </Tooltip>
        </div>

        {/* ── Fullscreen (far right) ──────────────────── */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleFullscreen}
              className={`h-10 w-10 btn-glow ${isFullscreen ? 'text-primary bg-primary/15 rounded-md' : 'text-muted-foreground hover:text-foreground'}`}
              aria-label={isFullscreen ? 'Exit App Fullscreen' : 'App Fullscreen'}
            >
              {isFullscreen ? <Minimize2 className="size-6" /> : <Maximize2 className="size-6" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-sm">
            {isFullscreen ? 'Exit App Fullscreen' : 'App Fullscreen'}
          </TooltipContent>
        </Tooltip>

        {/* ── Mobile overflow menu (< tablet breakpoint) ────────────── */}
        <div className="flex tablet:hidden items-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 text-muted-foreground hover:text-foreground"
                aria-label="More actions"
              >
                <MoreVertical className="size-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[180px]">
              {isRunning && (
                <DropdownMenuItem onClick={toggleFreeze} className="text-sm gap-2 cursor-pointer">
                  {isFrozen ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                  {isFrozen ? 'Unfreeze (P)' : 'Freeze (P)'}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={() => { onClearAll(); onClearGEQ(); onClearRTA() }}
                disabled={!hasClearableContent}
                className="text-sm gap-2 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                Clear All
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
                className="text-sm gap-2 cursor-pointer"
              >
                {resolvedTheme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                {resolvedTheme === 'dark' ? 'Light Mode' : 'Dark Mode'}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={resetLayout} className="text-sm gap-2 cursor-pointer">
                <LayoutGrid className="w-4 h-4" />
                Reset Layout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
})
