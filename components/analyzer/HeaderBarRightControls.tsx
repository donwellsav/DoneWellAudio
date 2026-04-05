'use client'

import { memo, lazy, Suspense, useState } from 'react'
import { HeaderBarDesktopActions } from '@/components/analyzer/HeaderBarDesktopActions'
import { HeaderBarMobileMenu } from '@/components/analyzer/HeaderBarMobileMenu'
import { HeaderBarPA2Status } from '@/components/analyzer/HeaderBarPA2Status'
import { FeedbackHistoryPanel } from '@/components/analyzer/FeedbackHistoryPanel'

const LazyHelpMenu = lazy(() =>
  import('./HelpMenu').then((module) => ({ default: module.HelpMenu })),
)

interface HeaderBarRightControlsProps {
  pa2Enabled: boolean
  pa2Status: string
  pa2Error: string | null
  notchSlotsUsed: number
  notchSlotsAvailable: number
  isRunning: boolean
  isFrozen: boolean
  hasClearableContent: boolean
  resolvedTheme: string | undefined
  isFullscreen: boolean
  onToggleFreeze: () => void
  onClearDisplays: () => void
  onToggleTheme: () => void
  onResetLayout: () => void
  onToggleFullscreen: () => void
}

export const HeaderBarRightControls = memo(function HeaderBarRightControls({
  pa2Enabled,
  pa2Status,
  pa2Error,
  notchSlotsUsed,
  notchSlotsAvailable,
  isRunning,
  isFrozen,
  hasClearableContent,
  resolvedTheme,
  isFullscreen,
  onToggleFreeze,
  onClearDisplays,
  onToggleTheme,
  onResetLayout,
  onToggleFullscreen,
}: HeaderBarRightControlsProps) {
  const [mobileHelpOpen, setMobileHelpOpen] = useState(false)
  const [mobileHistoryOpen, setMobileHistoryOpen] = useState(false)

  return (
    <>
      <div className="flex items-center justify-end gap-0 sm:gap-1 text-sm text-muted-foreground flex-1 min-w-0">
        <HeaderBarPA2Status
          pa2Enabled={pa2Enabled}
          pa2Status={pa2Status}
          pa2Error={pa2Error}
          notchSlotsUsed={notchSlotsUsed}
          notchSlotsAvailable={notchSlotsAvailable}
        />

        <div
          className="hidden tablet:block w-px h-6 bg-[rgba(var(--tint-r),var(--tint-g),var(--tint-b),0.20)] mx-1 sm:mx-1.5 flex-shrink-0"
          aria-hidden="true"
        />

        <HeaderBarDesktopActions
          helpMenu={
            <Suspense
              fallback={
                <div className="h-10 w-10 rounded-md bg-muted/30 animate-pulse" />
              }
            >
              <LazyHelpMenu />
            </Suspense>
          }
          resolvedTheme={resolvedTheme}
          isFullscreen={isFullscreen}
          onToggleTheme={onToggleTheme}
          onResetLayout={onResetLayout}
          onToggleFullscreen={onToggleFullscreen}
        />

        <HeaderBarMobileMenu
          isRunning={isRunning}
          isFrozen={isFrozen}
          hasClearableContent={hasClearableContent}
          resolvedTheme={resolvedTheme}
          onToggleFreeze={onToggleFreeze}
          onClearDisplays={onClearDisplays}
          onToggleTheme={onToggleTheme}
          onResetLayout={onResetLayout}
          onOpenHistory={() => setMobileHistoryOpen(true)}
          onOpenHelp={() => setMobileHelpOpen(true)}
        />
      </div>

      <FeedbackHistoryPanel
        open={mobileHistoryOpen}
        onOpenChange={setMobileHistoryOpen}
      />
      <Suspense fallback={null}>
        <LazyHelpMenu open={mobileHelpOpen} onOpenChange={setMobileHelpOpen} />
      </Suspense>
    </>
  )
})
