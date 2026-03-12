'use client'

import { memo, lazy, Suspense } from 'react'
import { FeedbackHistoryPanel } from './FeedbackHistoryPanel'

const LazyHelpMenu = lazy(() => import('./HelpMenu').then(m => ({ default: m.HelpMenu })))
const LazySettingsPanel = lazy(() => import('./SettingsPanel').then(m => ({ default: m.SettingsPanel })))
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
import { useDetection } from '@/contexts/DetectionContext'
import type { OperationMode, DetectorSettings } from '@/types/advisory'
import type { AudioDevice } from '@/hooks/useAudioDevices'
import type { CalibrationTabProps } from './settings/CalibrationTab'
import type { DataCollectionTabProps } from './SettingsPanel'

interface HeaderBarProps {
  isRunning: boolean
  start: () => void
  stop: () => void
  settings: DetectorSettings
  onSettingsChange: (s: Partial<DetectorSettings>) => void
  onModeChange: (mode: OperationMode) => void
  onReset: () => void
  resetLayout: () => void
  isFullscreen: boolean
  toggleFullscreen: () => void
  isFrozen: boolean
  toggleFreeze: () => void
  devices: AudioDevice[]
  selectedDeviceId: string
  onDeviceChange: (deviceId: string) => void
  calibration?: Omit<CalibrationTabProps, 'settings' | 'onSettingsChange'>
  dataCollection?: DataCollectionTabProps
}

export const HeaderBar = memo(function HeaderBar({
  isRunning, start, stop,
  settings, onSettingsChange, onModeChange, onReset,
  resetLayout, isFullscreen, toggleFullscreen,
  isFrozen, toggleFreeze,
  devices, selectedDeviceId, onDeviceChange,
  calibration,
  dataCollection,
}: HeaderBarProps) {
  const { advisories, dismissedIds, onClearAll } = useDetection()
  const hasAdvisories = isRunning && advisories.some(a => !dismissedIds.has(a.id))

  return (
    <header className="relative flex flex-row items-center justify-between gap-2 sm:gap-4 px-3 py-2 border-b border-border bg-card/90 backdrop-blur-sm shadow-[0_1px_12px_rgba(0,0,0,0.5),0_1px_0_rgba(75,146,255,0.08)] sm:px-4 sm:py-2">

      {/* ── Logo + start button (responsive single block) ─────────── */}
      <div className="flex items-center gap-2 sm:gap-2.5 flex-shrink-0">
        <div className="relative">
          <button
            onClick={isRunning ? stop : start}
            aria-label={isRunning ? 'Stop analysis' : 'Start analysis'}
            className="relative w-12 h-12 flex items-center justify-center flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-full ring-1 ring-primary/20 shadow-[0_0_8px_rgba(75,146,255,0.15)]"
          >
            <div className={`absolute inset-1 rounded-full border-2 transition-colors duration-300 ${isRunning ? 'border-primary' : 'border-primary/50'}`} />
            {isRunning && (
              <div className="absolute inset-1 rounded-full border border-primary/40 animate-led-blink" />
            )}
            <svg
              className={`size-6 relative z-10 transition-colors duration-300 ${isRunning ? 'text-primary drop-shadow-[0_0_4px_rgba(75,146,255,0.4)]' : 'text-muted-foreground hover:text-primary'}`}
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.31-2.5-4.06v8.12c1.48-.75 2.5-2.29 2.5-4.06zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
            </svg>
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
              <DropdownMenuRadioGroup value={selectedDeviceId} onValueChange={onDeviceChange}>
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
              className="hidden landscape:flex h-10 w-10 text-muted-foreground hover:text-foreground transition-all duration-150 active:scale-95"
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
              onClick={toggleFullscreen}
              className="hidden landscape:flex h-10 w-10 text-muted-foreground hover:text-foreground transition-all duration-150 active:scale-95"
              aria-label="Toggle fullscreen"
            >
              {isFullscreen ? <Minimize2 className="size-6" /> : <Maximize2 className="size-6" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-sm">
            {isFullscreen ? 'Exit fullscreen (F)' : 'Fullscreen (F)'}
          </TooltipContent>
        </Tooltip>

        {isRunning && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleFreeze}
                className={`hidden landscape:flex h-10 w-10 ${
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

        {hasAdvisories && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClearAll}
                className="h-10 w-10 text-muted-foreground hover:text-red-400 transition-all duration-150 active:scale-95"
                aria-label="Clear all advisories"
              >
                <Trash2 className="size-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-sm">
              Clear all
            </TooltipContent>
          </Tooltip>
        )}

        <FeedbackHistoryPanel />
        <Suspense fallback={<div className="h-10 w-10" />}>
          <LazyHelpMenu />
        </Suspense>
        <Suspense fallback={<div className="h-10 w-10" />}>
          <LazySettingsPanel
            settings={settings}
            onSettingsChange={onSettingsChange}
            onModeChange={onModeChange}
            onReset={onReset}
            calibration={calibration}
            dataCollection={dataCollection}
          />
        </Suspense>
      </div>
    </header>
  )
})
