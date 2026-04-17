'use client'

import { memo } from 'react'
import { calculateSchroederFrequency } from '@/lib/dsp/acousticUtils'
import type { DetectorSettings, SpectrumSmoothingMode } from '@/types/advisory'
import { useEngine } from '@/contexts/EngineContext'
import { Section } from '@/components/analyzer/settings/SettingsShared'

interface MeasurementInterpretationSectionProps {
  settings: DetectorSettings
}

function formatModalBoundary(settings: DetectorSettings) {
  if (settings.roomPreset === 'none') {
    return 'roughly 300 Hz without room data'
  }

  return `about ${Math.round(calculateSchroederFrequency(settings.roomRT60, settings.roomVolume))} Hz in this room`
}

function getSpectrumViewRead(mode: SpectrumSmoothingMode) {
  if (mode === 'perceptual') {
    return 'Perceptual 1/3-octave smoothing - better for room and speech trends than one narrow ringing bin'
  }

  return 'Raw RTA trace - best for one narrow ringing frequency and repeat offender hunting'
}

export const MeasurementInterpretationSection = memo(function MeasurementInterpretationSection({
  settings,
}: MeasurementInterpretationSectionProps) {
  const { roomEstimate } = useEngine()
  const modalBoundary = formatModalBoundary(settings)
  const spectrumViewRead = getSpectrumViewRead(settings.spectrumSmoothingMode)
  const estimateSummary = roomEstimate
    ? `Measured estimate on screen: ${roomEstimate.seriesFound}/3 axes, ${Math.round(roomEstimate.confidence * 100)}% confidence. Use it for modal context only; moving the mic or source can change the result.`
    : 'No measured estimate on screen. Room presets and dimensions still help frame the modal region, but they do not explain reflections or speech smear by themselves.'

  return (
    <Section
      title="Interpret Measurements"
      showTooltip={settings.showTooltips}
      tooltip="Use the room tools to separate narrow feedback, low-frequency resonance, reflection-heavy speech, and broad tonal balance. The app does not yet compute a true early/late energy split."
    >
      <div className="space-y-3">
        <div className="grid grid-cols-1 @[340px]:grid-cols-2 gap-2">
          <div className="rounded border border-border/40 bg-card/40 px-3 py-2.5">
            <p className="text-xs font-mono uppercase tracking-wide text-[var(--console-amber)]">Narrow Feedback Risk</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Stable narrow peaks, usually above {modalBoundary}, with rising severity or repeat recurrence.
              Trust the raw RTA and the issue cards here.
            </p>
          </div>

          <div className="rounded border border-border/40 bg-card/40 px-3 py-2.5">
            <p className="text-xs font-mono uppercase tracking-wide text-[var(--console-blue)]">Reflection-Rich Speech</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Harsh, nasal, or blurry speech without a stable narrow ring is usually a placement, aim,
              or surface problem. This app does not yet separate direct, early, and late arrivals.
            </p>
          </div>

          <div className="rounded border border-border/40 bg-card/40 px-3 py-2.5">
            <p className="text-xs font-mono uppercase tracking-wide text-[var(--console-green)]">Room Resonance</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Recurring low peaks below {modalBoundary} or near predicted room modes are more likely room-driven
              and position-sensitive. Recheck placement before stacking more narrow cuts.
            </p>
          </div>

          <div className="rounded border border-border/40 bg-card/40 px-3 py-2.5">
            <p className="text-xs font-mono uppercase tracking-wide text-[var(--console-blue)]">Perceptual Tonal Balance</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Mud, boom, or harshness spread across a band is a broader EQ problem, not an emergency notch.
              Think in GEQ bands and smoothed trends instead of one narrow offender.
            </p>
          </div>
        </div>

        <div className="rounded border border-border/40 bg-card/40 px-3 py-2.5">
          <p className="text-sm font-mono text-foreground">
            Current spectrum view: {spectrumViewRead}.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Switch between Raw and Perceptual in Display - Graph. This changes the graph only; it does not change
            detector sensitivity or worker-side scoring.
          </p>
        </div>

        <div className="rounded border border-border/40 bg-card/40 px-3 py-2.5">
          <p className="text-sm text-muted-foreground">
            {estimateSummary}
          </p>
        </div>
      </div>
    </Section>
  )
})
