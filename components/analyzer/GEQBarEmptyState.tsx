'use client'

import { memo } from 'react'

interface GEQBarEmptyStateProps {
  isRunning: boolean
}

export const GEQBarEmptyState = memo(function GEQBarEmptyState({
  isRunning,
}: GEQBarEmptyStateProps) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-1">
      <span className="font-mono text-xs text-muted-foreground/50 tracking-wide text-center px-4">
        {isRunning ? 'All clear - no cuts needed' : 'Engage to see cuts'}
      </span>
    </div>
  )
})
