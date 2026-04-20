'use client'

import { memo } from 'react'
import { DwaLogo } from './DwaLogo'
import { useSettings } from '@/contexts/SettingsContext'
import { formatFreqLabel } from '@/lib/utils/pitchUtils'

interface IssuesEmptyStateProps {
  isRunning?: boolean
  isLowSignal?: boolean
  onStart?: () => void
  onStartRingOut?: () => void
}

export const IssuesEmptyState = memo(function IssuesEmptyState({
  isRunning = false,
  isLowSignal = false,
  onStart,
  onStartRingOut,
}: IssuesEmptyStateProps) {
  const { settings } = useSettings()

  if (!isRunning && onStart) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 min-h-[120px] py-6 gap-3">
        <span className="flex items-center gap-1.5 font-mono text-dwa-sm font-bold tracking-[0.3em] uppercase text-[var(--console-amber)]/70 mb-1">
          <span
            className="inline-block w-1 h-1 rounded-full bg-[var(--console-amber)]/70 animate-led-pulse-amber flex-shrink-0"
            aria-hidden
          />
          Standby
        </span>

        <button
          onClick={onStart}
          aria-label="Start analysis"
          className="group relative flex flex-col items-center justify-center gap-3 w-full max-w-[220px] py-5 px-5 rounded-xl border border-primary/20 hover:border-primary/40 bg-primary/5 hover:bg-primary/10 active:scale-[0.97] transition-[box-shadow,transform] duration-300 cursor-pointer animate-start-glow focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary"
          style={{
            background:
              'radial-gradient(ellipse 100% 80% at 50% 60%, rgba(75, 146, 255, 0.14) 0%, rgba(75, 146, 255, 0.04) 55%, transparent 100%)',
          }}
        >

          <div
            className="relative flex items-center justify-center overflow-hidden rounded-full"
            style={{ width: 80, height: 80 }}
          >
            <div className="standby-glow-ring" />
            <div className="standby-glow-ring" style={{ animationDelay: '1.75s' }} />
            <div className="standby-sweep" aria-hidden />
            <DwaLogo className="relative z-10 w-20 h-20 text-foreground drop-shadow-[0_0_12px_var(--console-blue-glow)]" />
          </div>

          <div className="flex flex-col items-center gap-0.5">
            <span className="font-mono text-xs font-bold tracking-[0.15em] uppercase text-muted-foreground group-hover:text-foreground transition-colors">
              Start Analysis
            </span>
            <span className="hidden tablet:block font-mono text-dwa-xs text-muted-foreground/30 mt-1">
              Enter
            </span>
          </div>
        </button>

        {onStartRingOut ? (
          <>
            <div className="w-full max-w-[220px] h-px bg-border/40" />
            <button
              onClick={onStartRingOut}
              aria-label="Start ring-out wizard"
              className="group relative flex items-center justify-center gap-2 w-full max-w-[220px] min-h-[44px] py-2 px-4 rounded-lg border border-amber-500/15 hover:border-amber-500/30 bg-transparent hover:bg-amber-500/5 transition-[color,background-color,border-color] duration-300 cursor-pointer focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-amber-500"
            >
              <span className="font-mono text-dwa-sm font-bold tracking-[0.12em] uppercase text-amber-500/70 dark:text-amber-400/70 group-hover:text-amber-400">
                Ring Out Room
              </span>
            </button>
          </>
        ) : null}

        <div className="flex flex-col items-center gap-1 mt-3 max-w-[220px]">
          <div className="flex items-center gap-2 font-mono text-dwa-xs tracking-[0.12em] uppercase text-muted-foreground/65">
            <span>{settings.mode}</span>
            <span className="text-muted-foreground/25">.</span>
            <span>{settings.fftSize} FFT</span>
            <span className="text-muted-foreground/25">.</span>
            <span>
              {formatFreqLabel(settings.minFrequency)}-{formatFreqLabel(settings.maxFrequency)}
            </span>
          </div>
          <p className="text-dwa-sm font-mono text-muted-foreground/40 text-center">
            Adjust sensitivity with the fader or drag the threshold line on the spectrum
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex flex-col items-center justify-start flex-1 min-h-[80px] pt-10 gap-2">
      <div
        className="absolute inset-0 flex flex-col items-center justify-start pt-10 gap-2 transition-opacity duration-[2000ms] ease-in-out"
        style={{ opacity: isLowSignal ? 1 : 0, pointerEvents: isLowSignal ? 'auto' : 'none' }}
        aria-hidden={!isLowSignal}
      >
        <div
          className="relative flex items-center justify-center flex-shrink-0"
          style={{ width: 44, height: 44 }}
        >
          <div className="radar-ring" style={{ animationPlayState: isLowSignal ? 'running' : 'paused' }} />
          <div className="radar-ring" style={{ animationDelay: '1.4s', animationPlayState: isLowSignal ? 'running' : 'paused' }} />
          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0 bg-[var(--console-blue)]/50" />
        </div>
        <div className="font-mono text-dwa-sm font-bold tracking-[0.25em] uppercase text-[var(--console-blue)]/70">
          Low Signal
        </div>
        <div className="flex items-center gap-1.5 motion-safe:animate-pulse">
          <span className="text-[var(--console-blue)]/60 text-xs leading-none">▲</span>
          <span className="font-mono text-dwa-xs text-[var(--console-blue)]/50 tracking-wider uppercase">
            Increase gain
          </span>
        </div>
      </div>

      <div
        className="absolute inset-0 flex flex-col items-center justify-start pt-10 gap-2 transition-opacity duration-[2000ms] ease-in-out"
        style={{ opacity: isLowSignal ? 0 : 1, pointerEvents: isLowSignal ? 'none' : 'auto' }}
        aria-hidden={isLowSignal}
      >
        <div
          className="relative flex items-center justify-center flex-shrink-0"
          style={{ width: 56, height: 56 }}
        >
          <div className="radar-ring-green" style={{ animationPlayState: isLowSignal ? 'paused' : 'running' }} />
          <div className="radar-ring-green" style={{ animationDelay: '1.75s', animationPlayState: isLowSignal ? 'paused' : 'running' }} />
          <div
            className="w-3 h-3 rounded-full flex-shrink-0 bg-emerald-500/60"
            style={{ boxShadow: '0 0 10px var(--console-green-glow)' }}
          />
        </div>
        <div className="font-mono text-dwa-sm font-bold tracking-[0.2em] uppercase text-emerald-500/80">
          All Clear
        </div>
      </div>
    </div>
  )
})
