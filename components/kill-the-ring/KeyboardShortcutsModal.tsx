'use client'

import { memo, useEffect, useState, useCallback } from 'react'
import { X } from 'lucide-react'

const SHORTCUTS = [
  { key: 'Space', description: 'Start / Stop analysis' },
  { key: 'P', description: 'Freeze / Unfreeze spectrum' },
  { key: 'F', description: 'Toggle fullscreen' },
  { key: '?', description: 'Show this shortcuts panel' },
  { key: 'Esc', description: 'Close overlay / Exit fullscreen' },
] as const

/**
 * Keyboard shortcuts modal — opens on `?` keypress, closes on Esc or backdrop click.
 * Renders as a centered overlay with all available keyboard shortcuts.
 */
export const KeyboardShortcutsModal = memo(function KeyboardShortcutsModal() {
  const [open, setOpen] = useState(false)

  const handleClose = useCallback(() => setOpen(false), [])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault()
        setOpen(prev => !prev)
      }
      if (e.key === 'Escape' && open) {
        e.preventDefault()
        setOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
    >
      <div
        className="relative glass-card rounded-lg shadow-2xl max-w-xs w-full mx-4 p-5 animate-issue-enter"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-mono text-sm font-bold tracking-[0.15em] uppercase text-foreground">
            Keyboard Shortcuts
          </h2>
          <button
            onClick={handleClose}
            className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            aria-label="Close shortcuts"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2">
          {SHORTCUTS.map(({ key, description }) => (
            <div key={key} className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">{description}</span>
              <kbd className="inline-flex items-center justify-center min-w-[28px] px-2 py-0.5 rounded bg-muted border border-border text-xs font-mono font-bold text-foreground">
                {key}
              </kbd>
            </div>
          ))}
        </div>

        <p className="mt-4 text-[10px] font-mono text-muted-foreground/50 text-center">
          Press ? to toggle this panel
        </p>
      </div>
    </div>
  )
})
