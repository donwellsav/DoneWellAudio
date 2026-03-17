'use client'

import { memo, useCallback } from 'react'
import { Database, Shield, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DataConsentDialogProps {
  visible: boolean
  onAccept: () => void
  onDecline: () => void
}

/**
 * One-time consent dialog for anonymous spectral data collection.
 * Shown once when free-tier users start audio for the first time.
 *
 * Privacy guarantees displayed:
 *   - No audio recorded (magnitude spectrum only)
 *   - No device IDs, IP addresses, or geolocation
 *   - Session IDs are random UUIDs, never linked to accounts
 *   - Data used solely for ML model training
 */
export const DataConsentDialog = memo(function DataConsentDialog({
  visible,
  onAccept,
  onDecline,
}: DataConsentDialogProps) {
  const handleAccept = useCallback(() => onAccept(), [onAccept])
  const handleDecline = useCallback(() => onDecline(), [onDecline])

  if (!visible) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="consent-title"
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
    >
      <div className="bg-card/90 border border-border/40 rounded max-w-md w-full p-6 shadow-xl backdrop-blur-sm animate-in fade-in zoom-in-95 duration-200">
        {/* Icon */}
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 border border-primary/20 mb-4 mx-auto">
          <Database className="w-6 h-6 text-primary" />
        </div>

        {/* Title */}
        <h2
          id="consent-title"
          className="text-lg font-mono font-bold tracking-wide text-foreground text-center mb-2"
        >
          Help Improve Detection
        </h2>

        {/* Description */}
        <p className="text-sm text-muted-foreground text-center leading-relaxed mb-4">
          Share anonymous frequency data to help train better feedback detection models.
          You can change this anytime in Settings.
        </p>

        {/* Privacy bullets */}
        <div className="space-y-2 mb-5 px-2">
          {PRIVACY_POINTS.map((point, i) => (
            <div key={i} className="flex items-start gap-2">
              <Shield className={cn(
                'w-3.5 h-3.5 flex-shrink-0 mt-0.5',
                'text-emerald-500'
              )} />
              <span className="text-xs text-muted-foreground font-mono leading-snug">
                {point}
              </span>
            </div>
          ))}
        </div>

        {/* Buttons */}
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={handleDecline}
            className={cn(
              'inline-flex items-center gap-1 text-sm font-mono tracking-wide',
              'text-muted-foreground hover:text-foreground transition-colors',
              'px-3 py-2 rounded hover:bg-card/40',
              'cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring/50'
            )}
          >
            <X className="w-4 h-4" />
            No Thanks
          </button>

          <button
            onClick={handleAccept}
            className={cn(
              'inline-flex items-center gap-1 text-sm font-mono font-bold tracking-wide',
              'bg-primary text-primary-foreground px-4 py-2 rounded',
              'hover:bg-primary/90 transition-colors',
              'cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring/50'
            )}
          >
            <Database className="w-4 h-4" />
            Share Data
          </button>
        </div>
      </div>
    </div>
  )
})

const PRIVACY_POINTS = [
  'No audio recorded \u2014 only frequency magnitude data',
  'No device IDs, IP addresses, or location',
  'Random session IDs, never linked to you',
  'Used solely to improve detection accuracy',
]
