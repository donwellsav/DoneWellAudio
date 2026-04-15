'use client'

import { memo } from 'react'
import { Badge } from '@/components/ui/badge'
import { DEFAULT_SETTINGS } from '@/lib/dsp/constants'
import { getSeverityColor } from '@/lib/utils/advisoryDisplay'
import { HelpGroup, HelpSection } from './HelpShared'

const SEVERITY_LEVELS = [
  ['RUNAWAY', 'Active feedback rapidly increasing - address immediately'],
  ['GROWING', 'Feedback building but not yet critical'],
  ['RESONANCE', 'Stable resonant peak that could become feedback'],
  ['POSSIBLE_RING', 'Subtle ring that may need attention'],
  ['WHISTLE', 'Detected whistle or sibilance'],
  ['INSTRUMENT', 'Likely musical content, not feedback'],
] as const

export const ReferenceTab = memo(function ReferenceTab() {
  const formatHz = (value: number) => (value >= 1000 ? `${value / 1000} kHz` : `${value} Hz`)
  const smoothingPercent = Math.round(DEFAULT_SETTINGS.smoothingTimeConstant * 100)
  const fftBinWidthHz = (48_000 / DEFAULT_SETTINGS.fftSize).toFixed(2)

  return (
    <>
      <HelpGroup title="Quick Reference">
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          <HelpSection title="Keyboard Shortcuts" color="blue">
            <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">Space</kbd><span>Start / stop analysis</span>
              <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">P</kbd><span>Freeze / unfreeze spectrum display</span>
              <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">F</kbd><span>Toggle fullscreen</span>
            </div>
          </HelpSection>

          <HelpSection title="Severity Levels" color="amber">
            <ul className="flex flex-col gap-2">
              {SEVERITY_LEVELS.map(([severity, description]) => {
                const color = getSeverityColor(severity)

                return (
                  <li key={severity} className="flex items-start gap-2">
                    <Badge
                      variant="outline"
                      className="shrink-0 bg-card/60 px-1.5 py-0.5 font-mono text-[10px] leading-none"
                      style={{ color, borderColor: color }}
                    >
                      {severity}
                    </Badge>
                    <span>{description}</span>
                  </li>
                )
              })}
            </ul>
          </HelpSection>

          <HelpSection title="Startup Defaults" color="amber">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
              <span className="text-muted-foreground">Mode</span><span className="font-mono">Speech</span>
              <span className="text-muted-foreground">Frequency range</span><span className="font-mono">{`${formatHz(DEFAULT_SETTINGS.minFrequency)} - ${formatHz(DEFAULT_SETTINGS.maxFrequency)}`}</span>
              <span className="text-muted-foreground">FFT size</span><span className="font-mono">{`${DEFAULT_SETTINGS.fftSize} (${fftBinWidthHz} Hz/bin @ 48 kHz)`}</span>
              <span className="text-muted-foreground">Smoothing</span><span className="font-mono">{`${smoothingPercent}%`}</span>
              <span className="text-muted-foreground">Feedback threshold</span><span className="font-mono">{`${DEFAULT_SETTINGS.feedbackThresholdDb} dB`}</span>
              <span className="text-muted-foreground">Ring threshold</span><span className="font-mono">{`${DEFAULT_SETTINGS.ringThresholdDb} dB`}</span>
              <span className="text-muted-foreground">Growth rate</span><span className="font-mono">{`${DEFAULT_SETTINGS.growthRateThreshold.toFixed(1)} dB/s`}</span>
              <span className="text-muted-foreground">Sustain / clear</span><span className="font-mono">{`${DEFAULT_SETTINGS.sustainMs} ms / ${DEFAULT_SETTINGS.clearMs} ms`}</span>
              <span className="text-muted-foreground">Input gain</span><span className="font-mono">{`${DEFAULT_SETTINGS.inputGainDb} dB`}</span>
              <span className="text-muted-foreground">Auto gain</span><span className="font-mono">Off by default</span>
              <span className="text-muted-foreground">Confidence threshold</span><span className="font-mono">{`${Math.round(DEFAULT_SETTINGS.confidenceThreshold * 100)}%`}</span>
              <span className="text-muted-foreground">Algorithm mode</span><span className="font-mono">Auto (content-adaptive)</span>
              <span className="text-muted-foreground">A-weighting</span><span className="font-mono">Enabled</span>
              <span className="text-muted-foreground">Mic calibration</span><span className="font-mono">None (ECM8000 / RTA-M / Smartphone available)</span>
              <span className="text-muted-foreground">Threshold mode</span><span className="font-mono">Hybrid</span>
              <span className="text-muted-foreground">Prominence</span><span className="font-mono">{`${DEFAULT_SETTINGS.prominenceDb} dB`}</span>
              <span className="text-muted-foreground">Max tracks</span><span className="font-mono">{DEFAULT_SETTINGS.maxTracks}</span>
              <span className="text-muted-foreground">Track timeout</span><span className="font-mono">{`${DEFAULT_SETTINGS.trackTimeoutMs} ms`}</span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              These values describe the fresh-start Speech profile. Switching modes changes mode-owned defaults such as thresholds, timing, and track timeout.
            </p>
          </HelpSection>
        </div>
      </HelpGroup>

      <HelpGroup title="Technical Reference">
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          <HelpSection title="Frequency Bands" color="blue">
            <div className="flex flex-col gap-2 text-sm">
              <div>
                <strong>LOW (20-300 Hz):</strong> Room modes, sub-bass. Prominence x1.15, Sustain x1.2, Q threshold x0.6.
                Broadest peaks expected.
              </div>
              <div>
                <strong>MID (300-3000 Hz):</strong> Speech fundamentals and harmonics. Standard baseline (all multipliers x1.0).
              </div>
              <div>
                <strong>HIGH (3000-20000 Hz):</strong> Sibilance, harmonics. Prominence x0.85, Sustain x0.8, Q threshold x1.2.
                Narrowest peaks expected.
              </div>
            </div>
          </HelpSection>

          <HelpSection title="GEQ Band Mapping" color="blue">
            <p className="mb-2 text-sm">Detected frequencies map to nearest ISO 31-band (1/3 octave) center:</p>
            <p className="rounded border border-border/20 bg-background/80 p-2 font-mono text-sm leading-relaxed shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]">
              20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1k, 1.25k, 1.6k, 2k, 2.5k, 3.15k, 4k, 5k, 6.3k, 8k, 10k, 12.5k, 16k, 20k Hz
            </p>
          </HelpSection>

          <HelpSection title="EQ Presets" color="amber">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="mb-1 font-medium text-foreground">Surgical</p>
                <p>Default Q: 30 | Runaway Q: 60</p>
                <p>RUNAWAY/GROWING: -18 dB | RESONANCE/RING: -9 dB</p>
              </div>
              <div>
                <p className="mb-1 font-medium text-foreground">Heavy</p>
                <p>Default Q: 16 | Runaway Q: 30</p>
                <p>RUNAWAY/GROWING: -12 dB | RESONANCE/RING: -6 dB</p>
              </div>
            </div>
          </HelpSection>

          <HelpSection title="Room Presets" color="green">
            <div className="flex flex-col gap-2 text-sm">
              <div>
                <strong>Small Room:</strong> RT60 0.4s, Volume 80 m^3, Schroeder 141 Hz.
                Boardrooms, huddle rooms, podcast booths (10-20 people).
              </div>
              <div>
                <strong>Medium Room:</strong> RT60 0.7s, Volume 300 m^3, Schroeder 97 Hz.
                Conference rooms, classrooms, training rooms (20-80 people).
              </div>
              <div>
                <strong>Large Venue:</strong> RT60 1.0s, Volume 1000 m^3, Schroeder 63 Hz.
                Ballrooms, auditoriums, theaters, town halls (80-500 people).
              </div>
              <div>
                <strong>Arena / Hall:</strong> RT60 1.8s, Volume 5000 m^3, Schroeder 38 Hz.
                Concert halls, arenas, convention centers (500+ people).
              </div>
              <div>
                <strong>Worship Space:</strong> RT60 2.0s, Volume 2000 m^3, Schroeder 63 Hz.
                Churches, cathedrals, temples (highly reverberant).
              </div>
            </div>
          </HelpSection>

          <HelpSection title="Browser Requirements" color="blue">
            <ul className="flex flex-col gap-2 text-sm">
              <li><strong>Web Audio API + getUserMedia:</strong> Required for real-time audio processing</li>
              <li><strong>Supported:</strong> Modern Chromium browsers, Firefox 76+, Safari 14.1+, Edge 89+</li>
              <li><strong>Sample rate:</strong> System default (typically 44.1 kHz or 48 kHz)</li>
              <li><strong>HTTPS:</strong> Required for microphone access in production</li>
            </ul>
          </HelpSection>
        </div>
      </HelpGroup>
    </>
  )
})
