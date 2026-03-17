'use client'

import { memo, type ReactNode } from 'react'
import type { ChangeType } from '@/lib/changelog'

export const HelpSection = memo(function HelpSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="bg-card/80 rounded border p-3">
      <h3 className="section-label mb-2 text-primary">{title}</h3>
      <div className="text-sm text-muted-foreground leading-relaxed">{children}</div>
    </div>
  )
})

export const TYPE_STYLES: Record<ChangeType, { label: string; className: string }> = {
  feat: { label: 'Feature', className: 'bg-emerald-500/15 text-emerald-400' },
  fix: { label: 'Fix', className: 'bg-orange-500/15 text-orange-400' },
  perf: { label: 'Perf', className: 'bg-cyan-500/15 text-cyan-400' },
  refactor: { label: 'Refactor', className: 'bg-violet-500/15 text-violet-400' },
  ui: { label: 'UI', className: 'bg-pink-500/15 text-pink-400' },
}
