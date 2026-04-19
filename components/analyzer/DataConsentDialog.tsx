'use client'

import { memo, useCallback } from 'react'
import { Database, Shield, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DataConsentDialogProps {
  visible: boolean
  onAccept: () => void
  onDecline: () => void
  /** When true, show GDPR-compliant disclosures required for EU/EEA/UK users */
  isEU?: boolean
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
  isEU = false,
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
      <div className="bg-card/90 border border-border/40 rounded max-w-[min(28rem,calc(100vw-2rem))] w-full p-6 shadow-xl backdrop-blur-sm animate-in fade-in zoom-in-95 duration-200">
        {/* Icon */}
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-[rgba(74,222,128,0.10)] border border-[rgba(74,222,128,0.20)] mb-4 mx-auto">
          <Database className="w-6 h-6" style={{ color: 'var(--console-green)' }} />
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

        {/* GDPR disclosures — EU/EEA/UK only */}
        {isEU && (
          <div className="border border-border/30 rounded bg-muted/20 px-3 py-3 mb-5 space-y-1.5">
            <p className="text-[10px] font-mono font-bold text-muted-foreground uppercase tracking-wider mb-2">
              GDPR Information
            </p>
            {GDPR_POINTS.map((point, i) => (
              <p key={i} className="text-[11px] text-muted-foreground font-mono leading-snug">
                {point}
              </p>
            ))}
          </div>
        )}

        {/* Buttons */}
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={handleDecline}
            className={cn(
              'inline-flex items-center gap-1 text-sm font-mono tracking-wide',
              'text-muted-foreground hover:text-foreground transition-colors',
              'px-3 py-2 rounded hover:bg-card/40',
              'cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50'
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
              'cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50'
            )}
          >
            <Database className="w-4 h-4" />
            {isEU ? 'Yes, share anonymous data' : 'Share anonymous data'}
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

const GDPR_POINTS = [
  '\u2022 Legal basis \u2014 your explicit consent (EU GDPR Article 6(1)(a))',
  '\u2022 Purpose \u2014 training our feedback detection models',
  '\u2022 Data \u2014 frequency magnitude only, ~2\u202fKB per batch (no audio)',
  '\u2022 Retention \u2014 up to 24 months, then deleted',
  '\u2022 Storage: Supabase infrastructure (US/EU regions)',
  '\u2022 Your rights \u2014 withdraw anytime in Settings \u2192 Advanced. Submitted data is fully anonymised (random session IDs, no device info), so individual access or deletion isn\u2019t technically possible; this is by design.',
]
