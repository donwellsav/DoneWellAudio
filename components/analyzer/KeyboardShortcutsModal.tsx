'use client'

import { memo, useEffect, useRef, useState, useCallback } from 'react'
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
 *
 * Uses ref-based open check to avoid stale closures in the keydown listener.
 * Manages focus: autofocus on close button when opened, restore focus on close.
 */
export const KeyboardShortcutsModal = memo(function KeyboardShortcutsModal() {
  const [open, setOpen] = useState(false)
  const openRef = useRef(open)

  /** Element that had focus before modal opened — restored on close */
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    openRef.current = open
  }, [open])

  const handleClose = useCallback(() => {
    setOpen(false)
    // Restore focus to the element that was focused before the modal opened
    previousFocusRef.current?.focus()
    previousFocusRef.current = null
  }, [])

  // Single stable keydown listener — no dependency on `open` state
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault()
        if (!openRef.current) {
          // Save current focus before opening
          previousFocusRef.current = document.activeElement as HTMLElement | null
        }
        setOpen(prev => !prev)
        return
      }
      if (e.key === 'Escape' && openRef.current) {
        e.preventDefault()
        setOpen(false)
        previousFocusRef.current?.focus()
        previousFocusRef.current = null
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Autofocus close button when modal opens
  useEffect(() => {
    if (open) {
      // Small delay to ensure DOM is rendered
      requestAnimationFrame(() => closeButtonRef.current?.focus())
    }
  }, [open])

  // Focus trap: keep Tab cycling within the modal
  useEffect(() => {
    if (!open) return
    function handleTab(e: KeyboardEvent) {
      if (e.key !== 'Tab' || !dialogRef.current) return
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', handleTab)
    return () => window.removeEventListener('keydown', handleTab)
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
        ref={dialogRef}
        className="relative glass-card rounded-lg shadow-2xl max-w-xs w-full mx-4 p-5 animate-issue-enter"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-mono text-sm font-bold tracking-[0.15em] uppercase text-foreground">
            Keyboard Shortcuts
          </h2>
          <button
            ref={closeButtonRef}
            onClick={handleClose}
            className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none rounded"
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

        <p className="mt-4 text-dwa-sm font-mono text-muted-foreground/50 text-center">
          Press ? to toggle this panel
        </p>
      </div>
    </div>
  )
})
