'use client'

import { memo, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  LayoutGrid,
  Maximize2,
  Minimize2,
  Moon,
  Sun,
} from 'lucide-react'
import { FeedbackHistoryPanel } from '@/components/analyzer/FeedbackHistoryPanel'
import {
  getThemeTooltipLabel,
  isDarkResolvedTheme,
} from '@/components/analyzer/headerBarRightControlsUtils'

interface HeaderBarDesktopActionsProps {
  helpMenu: ReactNode
  resolvedTheme: string | undefined
  isFullscreen: boolean
  onToggleTheme: () => void
  onResetLayout: () => void
  onToggleFullscreen: () => void
}

export const HeaderBarDesktopActions = memo(function HeaderBarDesktopActions({
  helpMenu,
  resolvedTheme,
  isFullscreen,
  onToggleTheme,
  onResetLayout,
  onToggleFullscreen,
}: HeaderBarDesktopActionsProps) {
  const isDarkTheme = isDarkResolvedTheme(resolvedTheme)

  return (
    <>
      <div className="hidden tablet:flex items-center gap-0 icon-cluster">
        <FeedbackHistoryPanel />
        {helpMenu}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggleTheme}
              aria-label="Toggle theme"
              className="h-10 w-10 cursor-pointer text-muted-foreground hover:text-foreground"
            >
              {isDarkTheme ? (
                <Sun className="w-5 h-5" />
              ) : (
                <Moon className="w-5 h-5" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-sm">
            {getThemeTooltipLabel(resolvedTheme)}
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={onResetLayout}
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

      <div
        className="hidden tablet:block w-px h-6 bg-border/40 mx-1 flex-shrink-0"
        aria-hidden="true"
      />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleFullscreen}
            className={`hidden tablet:flex h-10 w-10 btn-glow ${
              isFullscreen
                ? 'text-primary bg-primary/15 rounded-md'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            aria-label={isFullscreen ? 'Exit App Fullscreen' : 'App Fullscreen'}
          >
            {isFullscreen ? (
              <Minimize2 className="size-6" />
            ) : (
              <Maximize2 className="size-6" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-sm">
          {isFullscreen ? 'Exit App Fullscreen' : 'App Fullscreen'}
        </TooltipContent>
      </Tooltip>
    </>
  )
})
