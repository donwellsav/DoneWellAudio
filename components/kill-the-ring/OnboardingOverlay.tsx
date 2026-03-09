'use client'

import { useState, useEffect, useCallback, memo } from 'react'
import { Mic, BarChart3, AlertTriangle, SlidersHorizontal, Keyboard, ChevronRight, ChevronLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

const STORAGE_KEY = 'ktr-onboarding-seen'

interface Step {
  title: string
  description: string
  icon: LucideIcon
}

const STEPS: Step[] = [
  {
    title: 'Welcome to Kill The Ring',
    description:
      'Kill The Ring detects acoustic feedback in real time and tells you exactly where to cut. Walk through these 5 steps to get started.',
    icon: SlidersHorizontal,
  },
  {
    title: 'Start Monitoring',
    description:
      'Press the mic button or hit Space to begin. Pick a venue pill — Quiet, Med, or Loud — to auto-calibrate gain for your environment. Press F for fullscreen RTA.',
    icon: Mic,
  },
  {
    title: 'Read the Spectrum',
    description:
      'The RTA graph shows live frequencies. Feedback appears as sharp, sustained peaks that rise above the noise floor. Watch for spikes that persist.',
    icon: BarChart3,
  },
  {
    title: 'Follow the Recommendations',
    description:
      'Issue cards show the problem frequency, severity, and exact EQ cuts — both GEQ band and PEQ Q value. Apply cuts on your mixer to kill the ring.',
    icon: AlertTriangle,
  },
  {
    title: 'Keyboard Shortcuts',
    description:
      'Space — start/stop monitoring. F — toggle fullscreen RTA. Click a graph marker to dismiss it. Swipe left/right on mobile to switch tabs.',
    icon: Keyboard,
  },
]

export const OnboardingOverlay = memo(function OnboardingOverlay() {
  const [visible, setVisible] = useState(false)
  const [step, setStep] = useState(0)

  useEffect(() => {
    // Only show on first visit
    try {
      if (!localStorage.getItem(STORAGE_KEY)) {
        setVisible(true)
      }
    } catch {
      // localStorage unavailable (incognito, etc.) — skip onboarding
    }
  }, [])

  const dismiss = useCallback(() => {
    setVisible(false)
    try {
      localStorage.setItem(STORAGE_KEY, 'true')
    } catch {
      // Ignore storage errors
    }
  }, [])

  const next = useCallback(() => {
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1)
    } else {
      dismiss()
    }
  }, [step, dismiss])

  const back = useCallback(() => {
    setStep((s) => Math.max(0, s - 1))
  }, [])

  if (!visible) return null

  const current = STEPS[step]
  const Icon = current.icon
  const isLast = step === STEPS.length - 1

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
    >
      <div className="bg-card border border-border rounded-lg max-w-md w-full p-6 shadow-xl animate-in fade-in zoom-in-95 duration-200">
        {/* Icon */}
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 border border-primary/20 mb-4 mx-auto">
          <Icon className="w-6 h-6 text-primary" />
        </div>

        {/* Content */}
        <h2 id="onboarding-title" className="text-lg font-bold text-foreground text-center mb-2">
          {current.title}
        </h2>
        <p className="text-sm text-muted-foreground text-center leading-relaxed mb-6">
          {current.description}
        </p>

        {/* Step indicator dots */}
        <div className="flex items-center justify-center gap-1.5 mb-5">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={cn(
                'w-2 h-2 rounded-full transition-colors duration-200',
                i === step ? 'bg-primary' : 'bg-muted-foreground/30'
              )}
            />
          ))}
        </div>

        {/* Navigation buttons */}
        <div className="flex items-center justify-between gap-2">
          {/* Left: Skip or Back */}
          {step === 0 ? (
            <button
              onClick={dismiss}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-2 rounded-md hover:bg-muted/50"
            >
              Skip
            </button>
          ) : (
            <button
              onClick={back}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-2 rounded-md hover:bg-muted/50"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </button>
          )}

          {/* Right: Next or Get Started */}
          <button
            onClick={next}
            className="inline-flex items-center gap-1 text-sm font-medium bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 transition-colors"
          >
            {isLast ? 'Get Started' : 'Next'}
            {!isLast && <ChevronRight className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  )
})
