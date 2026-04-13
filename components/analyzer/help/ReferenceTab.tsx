'use client'

import { memo } from 'react'
import { HelpSection, HelpGroup } from './HelpShared'

export const ReferenceTab = memo(function ReferenceTab() {
  return (
    <>
      {/* Group: Quick Reference */}
      <HelpGroup title="Quick Reference">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          <HelpSection title="Keyboard Shortcuts" color="blue">
            <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <kbd className="font-mono bg-muted px-1.5 py-0.5 rounded text-sm">Space</kbd><span>Start / stop analysis</span>
              <kbd className="font-mono bg-muted px-1.5 py-0.5 rounded text-sm">P</kbd><span>Freeze / unfreeze spectrum display</span>
              <kbd className="font-mono bg-muted px-1.5 py-0.5 rounded text-sm">F</kbd><span>Toggle fullscreen</span>
            </div>
          </HelpSection>

          <HelpSection title="Severity Levels" color="amber">
            <ul className="space-y-2">
              <li><strong className="text-red-500">RUNAWAY:</strong> Active feedback rapidly increasing — address immediately</li>
              <li><strong className="text-orange-500">GROWING:</strong> Feedback building but not yet critical</li>
              <li><strong className="text-yellow-500">RESONANCE:</strong> Stable resonant peak that could become feedback</li>
              <li><strong className="text-purple-500">POSSIBLE RING:</strong> Subtle ring that may need attention</li>
              <li><strong className="text-cyan-500">WHISTLE:</strong> Detected whistle or sibilance</li>
              <li><strong className="text-green-500">INSTRUMENT:</strong> Likely musical content, not feedback</li>
            </ul>
          </HelpSection>
          <HelpSection title="Default Configuration (Speech Mode)" color="amber">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
              <span className="text-muted-foreground">Mode</span><span className="font-mono">Speech — Corporate &amp; Conference</span>
              <span className="text-muted-foreground">Frequency range</span><span className="font-mono">150 Hz – 10 kHz</span>
              <span className="text-muted-foreground">FFT size</span><span className="font-mono">8192 (5.86 Hz/bin @ 48 kHz)</span>
              <span className="text-muted-foreground">Smoothing</span><span className="font-mono">50%</span>
              <span className="text-muted-foreground">Feedback threshold</span><span className="font-mono">30 dB</span>
              <span className="text-muted-foreground">Ring threshold</span><span className="font-mono">5 dB</span>
              <span className="text-muted-foreground">Growth rate</span><span className="font-mono">1.0 dB/s</span>
              <span className="text-muted-foreground">Hold time</span><span className="font-mono">4 s</span>
              <span className="text-muted-foreground">Input gain</span><span className="font-mono">0 dB</span>
              <span className="text-muted-foreground">Confidence threshold</span><span className="font-mono">35%</span>
              <span className="text-muted-foreground">Algorithm mode</span><span className="font-mono">Auto (content-adaptive)</span>
              <span className="text-muted-foreground">A-weighting</span><span className="font-mono">Enabled</span>
              <span className="text-muted-foreground">Mic calibration</span><span className="font-mono">None (ECM8000 / RTA-M / Smartphone available)</span>
              <span className="text-muted-foreground">Sustain time</span><span className="font-mono">300 ms</span>
              <span className="text-muted-foreground">Clear time</span><span className="font-mono">400 ms</span>
              <span className="text-muted-foreground">Threshold mode</span><span className="font-mono">Hybrid</span>
              <span className="text-muted-foreground">Prominence</span><span className="font-mono">8 dB</span>
              <span className="text-muted-foreground">Max tracks</span><span className="font-mono">64</span>
              <span className="text-muted-foreground">Track timeout</span><span className="font-mono">1000 ms</span>
            </div>
          </HelpSection>
        </div>
      </HelpGroup>

      {/* Group: Technical Reference */}
      <HelpGroup title="Technical Reference">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          <HelpSection title="Frequency Bands" color="blue">
            <div className="space-y-2 text-sm">
              <div>
                <strong>LOW (20–300 Hz):</strong> Room modes, sub-bass. Prominence ×1.15, Sustain ×1.2, Q threshold ×0.6.
                Broadest peaks expected.
              </div>
              <div>
                <strong>MID (300–3000 Hz):</strong> Speech fundamentals and harmonics. Standard baseline (all multipliers ×1.0).
              </div>
              <div>
                <strong>HIGH (3000–20000 Hz):</strong> Sibilance, harmonics. Prominence ×0.85, Sustain ×0.8, Q threshold ×1.2.
                Narrowest peaks expected.
              </div>
            </div>
          </HelpSection>

          <HelpSection title="GEQ Band Mapping" color="blue">
            <p className="mb-2 text-sm">Detected frequencies map to nearest ISO 31-band (1/3 octave) center:</p>
            <p className="text-sm font-mono bg-background/80 p-2 rounded leading-relaxed border border-border/20 shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]">
              20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1k, 1.25k, 1.6k, 2k, 2.5k, 3.15k, 4k, 5k, 6.3k, 8k, 10k, 12.5k, 16k, 20k Hz
            </p>
          </HelpSection>

          <HelpSection title="EQ Presets" color="amber">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="font-medium text-foreground mb-1">Surgical</p>
                <p>Default Q: 30 | Runaway Q: 60</p>
                <p>RUNAWAY/GROWING: -18 dB | RESONANCE/RING: -9 dB</p>
              </div>
              <div>
                <p className="font-medium text-foreground mb-1">Heavy</p>
                <p>Default Q: 16 | Runaway Q: 30</p>
                <p>RUNAWAY/GROWING: -12 dB | RESONANCE/RING: -6 dB</p>
              </div>
            </div>
          </HelpSection>

          <HelpSection title="Room Presets" color="green">
            <div className="space-y-2 text-sm">
              <div>
                <strong>Small Room:</strong> RT60 0.4s, Volume 80m³, Schroeder 141 Hz.
                Boardrooms, huddle rooms, podcast booths (10–20 people).
              </div>
              <div>
                <strong>Medium Room:</strong> RT60 0.7s, Volume 300m³, Schroeder 97 Hz.
                Conference rooms, classrooms, training rooms (20–80 people).
              </div>
              <div>
                <strong>Large Venue:</strong> RT60 1.0s, Volume 1000m³, Schroeder 63 Hz.
                Ballrooms, auditoriums, theaters, town halls (80–500 people).
              </div>
              <div>
                <strong>Arena / Hall:</strong> RT60 1.8s, Volume 5000m³, Schroeder 38 Hz.
                Concert halls, arenas, convention centers (500+ people).
              </div>
              <div>
                <strong>Worship Space:</strong> RT60 2.0s, Volume 2000m³, Schroeder 63 Hz.
                Churches, cathedrals, temples (highly reverberant).
              </div>
            </div>
          </HelpSection>
          <HelpSection title="Browser Requirements" color="blue">
            <ul className="space-y-2 text-sm">
              <li><strong>Web Audio API + getUserMedia:</strong> Required for real-time audio processing</li>
              <li><strong>Supported:</strong> Chrome 74+, Firefox 76+, Safari 14.1+, Edge 79+</li>
              <li><strong>Sample rate:</strong> System default (typically 44.1 kHz or 48 kHz)</li>
              <li><strong>HTTPS:</strong> Required for microphone access in production</li>
            </ul>
          </HelpSection>
        </div>
      </HelpGroup>
    </>
  )
})
