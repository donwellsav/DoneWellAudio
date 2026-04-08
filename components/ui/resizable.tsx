'use client'

import * as React from 'react'
import { GripVerticalIcon } from 'lucide-react'
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels'
import type { ImperativePanelHandle } from 'react-resizable-panels'

import { cn } from '@/lib/utils'

function ResizablePanelGroup({
  className,
  ...props
}: React.ComponentProps<typeof PanelGroup>) {
  return (
    <PanelGroup
      data-slot="resizable-panel-group"
      className={cn(
        'h-full w-full overflow-hidden',
        className,
      )}
      {...props}
    />
  )
}

function ResizablePanel({
  ...props
}: React.ComponentProps<typeof Panel>) {
  return <Panel data-slot="resizable-panel" {...props} />
}

function ResizableHandle({
  withHandle,
  className,
  ...props
}: React.ComponentProps<typeof PanelResizeHandle> & {
  withHandle?: boolean
}) {
  return (
    <PanelResizeHandle
      data-slot="resizable-handle"
      className={cn(
        'bg-[rgba(var(--tint-r),var(--tint-g),var(--tint-b),0.12)] focus-visible:ring-ring relative flex w-px items-center justify-center after:absolute after:inset-y-0 after:left-1/2 after:w-2 after:-translate-x-1/2 focus-visible:ring-1 focus-visible:ring-offset-1 focus-visible:outline-hidden aria-[orientation=horizontal]:h-px aria-[orientation=horizontal]:w-full aria-[orientation=horizontal]:after:left-0 aria-[orientation=horizontal]:after:h-2 aria-[orientation=horizontal]:after:w-full aria-[orientation=horizontal]:after:translate-x-0 aria-[orientation=horizontal]:after:-translate-y-1/2 [&[aria-orientation=horizontal]>div]:rotate-90',
        className,
      )}
      {...props}
    >
      {withHandle && (
        <div className="bg-border z-10 flex h-5 w-4 items-center justify-center rounded-xs border border-[rgba(var(--tint-r),var(--tint-g),var(--tint-b),0.15)]">
          <GripVerticalIcon className="size-3 text-[rgba(var(--tint-r),var(--tint-g),var(--tint-b),0.45)]" />
        </div>
      )}
    </PanelResizeHandle>
  )
}

export { ResizablePanelGroup, ResizablePanel, ResizableHandle }
export type { ImperativePanelHandle }
