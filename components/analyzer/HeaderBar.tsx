'use client'

import { memo, lazy, Suspense, useState, useMemo } from 'react'
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
import { ChevronDown, HelpCircle, History, LayoutGrid, Maximize2, Mic, Minimize2, Moon, MoreVertical, Pause, Play, Sun, Trash2 } from 'lucide-react'
import { useTheme } from 'next-themes'
import { DwaLogo } from './DwaLogo'
import { useAdvisories } from '@/contexts/AdvisoryContext'
import { useEngine } from '@/contexts/EngineContext'
import { usePA2 } from '@/contexts/PA2Context'
import { useMetering } from '@/contexts/MeteringContext'
import { useUI } from '@/contexts/UIContext'
import { useSignalTint } from '@/hooks/useSignalTint'
export const HeaderBar = memo(function HeaderBar() {
  useSignalTint()
  const { isRunning, start, stop, devices, selectedDeviceId, handleDeviceChange } = useEngine()
  const { inputLevel } = useMetering()
  const { resetLayout, isFullscreen, toggleFullscreen, isFrozen, toggleFreeze, isRtaFullscreen, toggleRtaFullscreen } = useUI()
  const { advisories, dismissedIds, onClearAll, onClearGEQ, onClearRTA, hasActiveGEQBars, hasActiveRTAMarkers } = useAdvisories()
  const { resolvedTheme, setTheme } = useTheme()
  const pa2 = usePA2()
  const [mobileHelpOpen, setMobileHelpOpen] = useState(false)
  const [mobileHistoryOpen, setMobileHistoryOpen] = useState(false)
  const hasClearableContent = useMemo(
    () => advisories.some(a => !dismissedIds.has(a.id)) || hasActiveGEQBars || hasActiveRTAMarkers,
    [advisories, dismissedIds, hasActiveGEQBars, hasActiveRTAMarkers],
  )

  return (
    <header className="header-glow relative flex flex-row items-center gap-2 sm:gap-4 py-1 channel-strip amber-panel-header border-b border-b-[rgba(var(--tint-r),var(--tint-g),var(--tint-b),0.20)] shadow-[0_1px_16px_rgba(0,0,0,0.15),0_2px_4px_rgba(0,0,0,0.1),0_1px_0_rgba(var(--tint-r),var(--tint-g),var(--tint-b),0.06)] dark:shadow-[0_1px_16px_rgba(0,0,0,0.55),0_2px_4px_rgba(0,0,0,0.3),0_1px_0_rgba(var(--tint-r),var(--tint-g),var(--tint-b),0.09)] sm:py-1" style={{ paddingLeft: 'max(0.75rem, var(--safe-left))', paddingRight: 'max(0.75rem, var(--safe-right))', paddingTop: 'max(0.25rem, var(--safe-top))' }}>

      {/* ── Left: Logo + text + device (flex-1 to balance center) ── */}
      <div className="flex items-center gap-2 sm:gap-2.5 flex-1 min-w-0">
        <div className="relative">
          <button
            onClick={isRunning ? stop : start}
            aria-label={isRunning ? 'Stop analysis' : 'Start analysis'}
            className="relative flex items-center justify-center flex-shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary rounded"
          >
            <DwaLogo
              className={`size-10 tablet:size-16 ${isRunning ? 'text-foreground drop-shadow-[0_0_8px_rgba(var(--tint-r),var(--tint-g),var(--tint-b),0.5)]' : 'text-foreground/70 hover:text-foreground'}`}
              audioLevel={isRunning ? Math.max(0, Math.min(1, (inputLevel + 60) / 60)) : undefined}
            />
          </button>
          {/* #1 Power LED — running state at a glance (mobile only, desktop has ENGAGE button) */}
          <div className={`absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-[5px] h-[5px] rounded-full tablet:hidden transition-colors duration-500 ${
            isRunning ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]' : 'bg-muted-foreground/20'
          }`} aria-hidden />
        </div>

        {/* Branding text moved to bottom info bar — removed from header */}

        {/* Audio source selector */}
        {devices.length > 0 && (
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11 text-foreground/70 hover:text-foreground btn-glow relative"
                    aria-label="Select audio input"
                  >
                    <Mic className="size-5 tablet:size-6" />
                    <ChevronDown className="absolute bottom-0.5 right-0.5 w-2.5 h-2.5 text-muted-foreground/50" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-sm">
                Audio input
              </TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="start" className="max-w-[min(360px,90vw)]">
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

      {/* ── Center: Transport strip (ENGAGE/STOP + PAUSE + CLEAR) ──── */}
      <div className="flex items-center gap-1 tablet:gap-2 flex-shrink-0">
        <button
          onClick={isRunning ? stop : start}
          aria-label={isRunning ? 'Stop analysis' : 'Engage analysis'}
          className={`
            inline-flex items-center justify-center
            relative min-w-[70px] tablet:min-w-[120px] h-9 tablet:h-11 px-2.5 tablet:px-5
            font-mono text-[10px] tablet:text-xs font-bold uppercase tracking-[0.2em] tablet:tracking-[0.3em]
            rounded-md cursor-pointer
            border transition-all duration-200
            focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary
            ${isRunning
              ? 'bg-red-100/80 border-red-300 text-red-700 shadow-[inset_0_1px_3px_rgba(0,0,0,0.1)] hover:border-red-400 dark:bg-red-950/50 dark:border-red-500/40 dark:text-red-400 dark:shadow-[inset_0_1px_4px_rgba(0,0,0,0.4),0_0_12px_rgba(239,68,68,0.15)] dark:hover:border-red-400/70 dark:hover:shadow-[inset_0_1px_4px_rgba(0,0,0,0.4),0_0_16px_rgba(239,68,68,0.25)]'
              : 'bg-emerald-100/80 border-emerald-300 text-emerald-700 shadow-[inset_0_1px_3px_rgba(0,0,0,0.1)] hover:border-emerald-400 dark:bg-emerald-950/40 dark:border-emerald-500/30 dark:text-emerald-400 dark:shadow-[inset_0_1px_4px_rgba(0,0,0,0.4),0_0_8px_rgba(52,211,153,0.1)] dark:hover:border-emerald-400/60 dark:hover:shadow-[inset_0_1px_4px_rgba(0,0,0,0.4),0_0_16px_rgba(52,211,153,0.2)]'
            }
          `}
        >
          {isRunning ? 'STOP' : 'ENGAGE'}
        </button>

        {isRunning && (
          <button
            onClick={toggleFreeze}
            aria-label={isFrozen ? 'Unfreeze spectrum' : 'Freeze spectrum'}
            aria-pressed={isFrozen}
            className={`
              hidden min-[420px]:inline-flex items-center justify-center
              relative min-w-[60px] tablet:min-w-[100px] h-9 tablet:h-11 px-2 tablet:px-4
              font-mono text-[10px] tablet:text-xs font-bold uppercase tracking-[0.2em] tablet:tracking-[0.3em]
              rounded-md cursor-pointer
              border transition-all duration-200
              focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary
              ${isFrozen
                ? 'bg-amber-100/80 border-amber-300 text-amber-700 shadow-[inset_0_1px_3px_rgba(0,0,0,0.1)] hover:border-amber-400 dark:bg-amber-950/40 dark:border-amber-500/40 dark:text-amber-400 dark:shadow-[inset_0_1px_4px_rgba(0,0,0,0.4),0_0_12px_rgba(245,158,11,0.15)] dark:hover:border-amber-400/70 dark:hover:shadow-[inset_0_1px_4px_rgba(0,0,0,0.4),0_0_16px_rgba(245,158,11,0.25)]'
                : 'bg-blue-100/80 border-blue-300 text-blue-700 shadow-[inset_0_1px_3px_rgba(0,0,0,0.1)] hover:border-blue-400 dark:bg-blue-950/30 dark:border-blue-500/30 dark:text-blue-400 dark:shadow-[inset_0_1px_4px_rgba(0,0,0,0.4),0_0_8px_rgba(75,146,255,0.1)] dark:hover:border-blue-400/60 dark:hover:shadow-[inset_0_1px_4px_rgba(0,0,0,0.4),0_0_16px_rgba(75,146,255,0.2)]'
              }
            `}
          >
            {isFrozen ? 'RESUME' : 'PAUSE'}
          </button>
        )}

        <button
          onClick={() => { onClearAll(); onClearGEQ(); onClearRTA() }}
          disabled={!hasClearableContent}
          aria-label="Clear all advisories, GEQ, and RTA markers"
          className={`
            hidden min-[420px]:inline-flex items-center justify-center
            relative min-w-[55px] tablet:min-w-[90px] h-9 tablet:h-11 px-2 tablet:px-4
            font-mono text-[10px] tablet:text-xs font-bold uppercase tracking-[0.2em] tablet:tracking-[0.3em]
            rounded-md
            border transition-all duration-200
            focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary
            ${hasClearableContent
              ? 'cursor-pointer bg-rose-100/80 border-rose-300 text-rose-700 shadow-[inset_0_1px_3px_rgba(0,0,0,0.1)] hover:border-rose-400 dark:bg-rose-950/30 dark:border-rose-500/30 dark:text-rose-400 dark:shadow-[inset_0_1px_4px_rgba(0,0,0,0.4),0_0_8px_rgba(244,63,94,0.1)] dark:hover:border-rose-400/60 dark:hover:shadow-[inset_0_1px_4px_rgba(0,0,0,0.4),0_0_16px_rgba(244,63,94,0.2)]'
              : 'cursor-default bg-muted/30 border-border/30 text-muted-foreground/25 dark:bg-muted/10 dark:border-border/20 dark:text-muted-foreground/20'
            }
          `}
        >
          CLEAR
        </button>
      </div>

      {/* ── Right: Action icons (flex-1 to balance center) ── */}
      <div className="flex items-center justify-end gap-0 sm:gap-1 text-sm text-muted-foreground flex-1 min-w-0">

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

        {/* ── Separator (desktop only) ────────────────── */}
        <div className="hidden tablet:block w-px h-6 bg-[rgba(var(--tint-r),var(--tint-g),var(--tint-b),0.20)] mx-1 sm:mx-1.5 flex-shrink-0" aria-hidden="true" />

        {/* ── Utility group (desktop: inline, mobile: overflow menu) ── */}
        <div className="hidden tablet:flex items-center gap-0 icon-cluster">
          <FeedbackHistoryPanel />
          <Suspense fallback={<div className="h-10 w-10 rounded-md bg-muted/30 animate-pulse" />}>
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

        {/* ── Separator before fullscreen ─────────────── */}
        <div className="hidden tablet:block w-px h-6 bg-border/40 mx-1 flex-shrink-0" aria-hidden="true" />

        {/* ── Fullscreen (far right, hidden on mobile — #2) ──────────────────── */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleFullscreen}
              className={`hidden tablet:flex h-10 w-10 btn-glow ${isFullscreen ? 'text-primary bg-primary/15 rounded-md' : 'text-muted-foreground hover:text-foreground'}`}
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
                className={`h-10 w-10 text-muted-foreground hover:text-foreground relative`}
                aria-label="More actions"
              >
                <MoreVertical className="size-5" />
                {isRunning && <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-emerald-400 motion-safe:animate-pulse" aria-hidden />}
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
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setMobileHistoryOpen(true)} className="text-sm gap-2 cursor-pointer">
                <History className="w-4 h-4" />
                History
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setMobileHelpOpen(true)} className="text-sm gap-2 cursor-pointer">
                <HelpCircle className="w-4 h-4" />
                Help
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Mobile-triggered Help & History sheets (controlled via overflow menu — no trigger buttons rendered) */}
      <FeedbackHistoryPanel open={mobileHistoryOpen} onOpenChange={setMobileHistoryOpen} />
      <Suspense fallback={null}>
        <LazyHelpMenu open={mobileHelpOpen} onOpenChange={setMobileHelpOpen} />
      </Suspense>
    </header>
  )
})
