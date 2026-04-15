'use client'

import { memo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { deriveDefaultDetectorSettings } from '@/lib/settings/defaultDetectorSettings'
import { MODE_BASELINES } from '@/lib/settings/modeBaselines'
import type { ModeId } from '@/types/settings'
import { HelpGroup, HelpSection } from './HelpShared'

const MODE_ORDER: ModeId[] = [
  'speech',
  'worship',
  'liveMusic',
  'theater',
  'monitors',
  'ringOut',
  'broadcast',
  'outdoor',
]

const MODE_GUIDANCE: Record<ModeId, { useCase: string; operatorNote: string }> = {
  speech: {
    useCase: 'Corporate conferences, lecterns, spoken word PA',
    operatorNote: 'Startup mode and the safest default when the source is mostly speech.',
  },
  worship: {
    useCase: 'Reverberant sanctuaries and mixed vocal/instrument worship sets',
    operatorNote: 'More conservative thresholds and longer tracking for reflective rooms.',
  },
  liveMusic: {
    useCase: 'Concerts, clubs, dense backline, and louder musical stages',
    operatorNote: 'Higher thresholds and heavier EQ preset for harmonic material.',
  },
  theater: {
    useCase: 'Drama, musicals, lavaliers, and intelligibility-focused reinforcement',
    operatorNote: 'Wide spoken-word coverage with a little more gain support at startup.',
  },
  monitors: {
    useCase: 'Stage wedges, sidefills, and fast monitor-engineer intervention',
    operatorNote: 'Fastest practical response and the shortest track timeout.',
  },
  ringOut: {
    useCase: 'Controlled system tuning, notch finding, and pre-show ring-out',
    operatorNote: 'Most analysis detail, lowest ring threshold, and a hotter auto-gain target.',
  },
  broadcast: {
    useCase: 'Podcast, studio, and conservative spoken-word monitoring',
    operatorNote: 'Lower auto-gain target and tighter suppression of nuisance events.',
  },
  outdoor: {
    useCase: 'Open-air stages, festivals, and noisier environmental conditions',
    operatorNote: 'Stronger thresholds for wind, spill, and less stable open-air conditions.',
  },
}

function formatFrequency(hz: number): string {
  if (hz >= 1000) {
    const khz = hz / 1000
    return Number.isInteger(khz) ? `${khz} kHz` : `${khz.toFixed(1)} kHz`
  }
  return `${hz} Hz`
}

function formatRange(minHz: number, maxHz: number): string {
  return `${formatFrequency(minHz)}-${formatFrequency(maxHz)}`
}

export const ModesTab = memo(function ModesTab() {
  const modeCards = MODE_ORDER.map((modeId) => {
    const baseline = MODE_BASELINES[modeId]
    const defaults = deriveDefaultDetectorSettings(modeId)
    const guidance = MODE_GUIDANCE[modeId]

    return {
      modeId,
      label: baseline.label,
      description: baseline.description,
      guidance,
      defaults,
    }
  })

  return (
    <>
      <HelpGroup title="Operation Modes">
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 xl:grid-cols-4">
          {modeCards.map(({ modeId, label, description, guidance, defaults }) => (
            <Card
              key={modeId}
              className="gap-0 rounded border bg-card/80 py-0 shadow-none"
              style={{ borderLeftColor: 'rgba(var(--tint-r),var(--tint-g),var(--tint-b),0.40)', borderLeftWidth: '2px' }}
            >
              <CardHeader className="px-3 pt-3 pb-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="grid gap-0.5">
                    <CardTitle className="text-sm" style={{ color: 'var(--console-blue)' }}>
                      {label}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">{description}</p>
                  </div>
                  {modeId === 'speech' ? <Badge variant="outline" className="font-mono text-[10px]">Startup default</Badge> : null}
                </div>
              </CardHeader>
              <CardContent className="grid gap-1.5 px-3 pt-2 pb-3 text-xs text-muted-foreground">
                <p>{guidance.useCase}</p>
                <p className="font-mono text-muted-foreground/80">
                  Feedback {defaults.feedbackThresholdDb} dB | Ring {defaults.ringThresholdDb} dB | Growth {defaults.growthRateThreshold.toFixed(1)} dB/s
                </p>
                <p className="font-mono text-muted-foreground/80">
                  {defaults.fftSize} FFT | {formatRange(defaults.minFrequency, defaults.maxFrequency)} | Sustain {defaults.sustainMs} ms | Conf {Math.round(defaults.confidenceThreshold * 100)}%
                </p>
                <p className="font-mono text-muted-foreground/80">
                  AG {defaults.autoGainTargetDb} dBFS | Track {defaults.trackTimeoutMs} ms | {defaults.eqPreset === 'heavy' ? 'Heavy EQ' : 'Surgical EQ'}
                </p>
                <p>{guidance.operatorNote}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </HelpGroup>

      <HelpGroup title="How Mode Defaults Work">
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          <HelpSection title="Choosing A Mode" color="amber">
            <ul className="grid gap-2">
              <li>Speech for spoken word and day-one startup.</li>
              <li>Ring Out for controlled notch finding and system setup.</li>
              <li>Monitors for wedges and fast response monitor work.</li>
              <li>Worship or Theater for reflective rooms and voice-heavy reinforcement.</li>
              <li>Live Music or Outdoor when harmonic program material or environmental noise would make speech tuning too optimistic.</li>
              <li>Broadcast for conservative spoken-word monitoring in studio-style workflows.</li>
            </ul>
          </HelpSection>

          <HelpSection title="Ownership Rules" color="green">
            <ul className="grid gap-2">
              <li>Switching modes resets mode-owned controls to that mode's baseline, not to a frozen Speech-era number.</li>
              <li>Environment and live overrides stack on top of the mode baseline instead of replacing it wholesale.</li>
              <li>Display preferences such as canvas FPS, graph font size, and swipe labeling are global display defaults, not mode tuning.</li>
              <li>Advanced diagnostics can still override the baseline when you intentionally need expert-only behavior.</li>
            </ul>
          </HelpSection>

          <HelpSection title="Workflow Tips" color="amber">
            <ol className="grid gap-2 list-decimal list-inside">
              <li>Start with the correct mode before touching sensitivity.</li>
              <li>Use the footer readouts to confirm what kind of content the worker thinks it is hearing.</li>
              <li>Wait for enough MSD history before assuming a borderline peak is truly stable.</li>
              <li>Use Ring Out for deliberate setup work, then switch back to the operating mode you will actually run.</li>
              <li>Use labels and replay fixtures when you think the detector is drifting instead of tuning by memory.</li>
            </ol>
          </HelpSection>

          <HelpSection title="Common Feedback Zones" color="blue">
            <ul className="grid gap-2">
              <li><strong>200-500 Hz:</strong> boxiness, mud, and room buildup.</li>
              <li><strong>500 Hz-1 kHz:</strong> honk, nasal buildup, and vocal resonance.</li>
              <li><strong>1-3 kHz:</strong> intelligibility and many harsh vocal feedback problems.</li>
              <li><strong>3-6 kHz:</strong> presence, bite, and more piercing ring behavior.</li>
              <li><strong>6-8 kHz:</strong> air, brightness, and higher-frequency ringing.</li>
            </ul>
          </HelpSection>
        </div>
      </HelpGroup>
    </>
  )
})
