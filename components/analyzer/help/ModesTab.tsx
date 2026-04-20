'use client'

import { memo } from 'react'
import { HelpSection, HelpGroup } from './HelpShared'

export const ModesTab = memo(function ModesTab() {
  return (
    <>
      <HelpGroup title="Operation Modes">
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 xl:grid-cols-4">
          <div className="bg-card/80 rounded border p-3 shadow-[inset_2px_0_0_0_rgba(var(--tint-r),var(--tint-g),var(--tint-b),0.40)]">
            <div className="text-sm font-medium" style={{ color: 'var(--console-blue)' }}>Speech</div>
            <div className="text-xs text-muted-foreground mt-0.5">Default - corporate conferences, lectures</div>
            <div className="text-xs font-mono text-muted-foreground/80 mt-1.5 pt-1.5 border-t border-border/30">
              20dB - Ring 5dB - 1.0dB/s - 8192 FFT - 150-10kHz
            </div>
          </div>
          <div className="bg-card/80 rounded border p-3 shadow-[inset_2px_0_0_0_rgba(var(--tint-r),var(--tint-g),var(--tint-b),0.40)]">
            <div className="text-sm font-medium" style={{ color: 'var(--console-blue)' }}>Worship</div>
            <div className="text-xs text-muted-foreground mt-0.5">Churches, reverberant spaces</div>
            <div className="text-xs font-mono text-muted-foreground/80 mt-1.5 pt-1.5 border-t border-border/30">
              35dB - Ring 5dB - 2.0dB/s - 8192 FFT - 100-12kHz
            </div>
          </div>
          <div className="bg-card/80 rounded border p-3 shadow-[inset_2px_0_0_0_rgba(var(--tint-r),var(--tint-g),var(--tint-b),0.40)]">
            <div className="text-sm font-medium" style={{ color: 'var(--console-blue)' }}>Live Music</div>
            <div className="text-xs text-muted-foreground mt-0.5">Concerts, clubs, festivals</div>
            <div className="text-xs font-mono text-muted-foreground/80 mt-1.5 pt-1.5 border-t border-border/30">
              42dB - Ring 8dB - 4.0dB/s - 4096 FFT - 60-16kHz
            </div>
          </div>
          <div className="bg-card/80 rounded border p-3 shadow-[inset_2px_0_0_0_rgba(var(--tint-r),var(--tint-g),var(--tint-b),0.40)]">
            <div className="text-sm font-medium" style={{ color: 'var(--console-blue)' }}>Theater</div>
            <div className="text-xs text-muted-foreground mt-0.5">Drama, musicals, body mics</div>
            <div className="text-xs font-mono text-muted-foreground/80 mt-1.5 pt-1.5 border-t border-border/30">
              28dB - Ring 4dB - 1.5dB/s - 8192 FFT - 150-10kHz
            </div>
          </div>
          <div className="bg-card/80 rounded border p-3 shadow-[inset_2px_0_0_0_rgba(var(--tint-r),var(--tint-g),var(--tint-b),0.40)]">
            <div className="text-sm font-medium" style={{ color: 'var(--console-blue)' }}>Monitors</div>
            <div className="text-xs text-muted-foreground mt-0.5">Stage wedges, sidefills</div>
            <div className="text-xs font-mono text-muted-foreground/80 mt-1.5 pt-1.5 border-t border-border/30">
              15dB - Ring 3dB - 0.8dB/s - 4096 FFT - 200-6kHz
            </div>
          </div>
          <div className="bg-card/80 rounded border p-3 shadow-[inset_2px_0_0_0_rgba(var(--tint-r),var(--tint-g),var(--tint-b),0.40)]">
            <div className="text-sm font-medium" style={{ color: 'var(--console-blue)' }}>Ring Out</div>
            <div className="text-xs text-muted-foreground mt-0.5">Pre-show system calibration, sound check</div>
            <div className="text-xs font-mono text-muted-foreground/80 mt-1.5 pt-1.5 border-t border-border/30">
              27dB - Ring 2dB - 0.5dB/s - 16384 FFT - 60-16kHz
            </div>
          </div>
          <div className="bg-card/80 rounded border p-3 shadow-[inset_2px_0_0_0_rgba(var(--tint-r),var(--tint-g),var(--tint-b),0.40)]">
            <div className="text-sm font-medium" style={{ color: 'var(--console-blue)' }}>Broadcast</div>
            <div className="text-xs text-muted-foreground mt-0.5">Studio, podcast, radio</div>
            <div className="text-xs font-mono text-muted-foreground/80 mt-1.5 pt-1.5 border-t border-border/30">
              22dB - Ring 3dB - 1.0dB/s - 8192 FFT - 80-12kHz
            </div>
          </div>
          <div className="bg-card/80 rounded border p-3 shadow-[inset_2px_0_0_0_rgba(var(--tint-r),var(--tint-g),var(--tint-b),0.40)]">
            <div className="text-sm font-medium" style={{ color: 'var(--console-blue)' }}>Outdoor</div>
            <div className="text-xs text-muted-foreground mt-0.5">Open air, festivals</div>
            <div className="text-xs font-mono text-muted-foreground/80 mt-1.5 pt-1.5 border-t border-border/30">
              38dB - Ring 6dB - 2.5dB/s - 4096 FFT - 100-12kHz
            </div>
          </div>
        </div>
      </HelpGroup>

      <HelpGroup title="Usage Tips">
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          <HelpSection title="Choosing a Mode" color="amber">
            <ul className="space-y-2">
              <li>Corporate conference or lecture - <strong>Speech</strong> (default)</li>
              <li>Initial system ring-out or sound check - <strong>Ring Out</strong></li>
              <li>Stage wedge tuning - <strong>Monitors</strong></li>
              <li>Church or reverberant space - <strong>Worship</strong></li>
              <li>Concert or festival - <strong>Live Music</strong> or <strong>Outdoor</strong></li>
              <li>Drama, musical, or body mics - <strong>Theater</strong></li>
              <li>Studio, podcast, or radio - <strong>Broadcast</strong></li>
            </ul>
          </HelpSection>

          <HelpSection title="How Modes Shift Detection" color="green">
            <p>
              Modes do more than change one threshold. They shift the usable frequency range, FFT size,
              sustain and clear timing, confidence requirements, and whether the detector should be more willing
              to suppress voiced or instrument-like content.
            </p>
            <p className="mt-2">
              A brand-new session still starts from the historical 25 dB fresh-start speech snapshot, but explicitly
              choosing Speech uses its 20 dB mode baseline. Do not treat those as the same thing.
            </p>
          </HelpSection>

          <HelpSection title="Workflow Best Practices" color="amber">
            <ol className="list-decimal list-inside space-y-2">
              <li>Start with <strong>Ring Out</strong> mode during initial system setup, not as a substitute for live emergency handling</li>
              <li>Ring out with performers, wedges, and open mics in realistic positions when possible</li>
              <li>Finish mute cleanup, placement, and broad EQ before chasing more narrow notches</li>
              <li>If the same band keeps returning, treat it as a setup, reflection, or broad-EQ problem before stacking cuts</li>
              <li>Watch the <strong>lower info bar</strong> - it shows algorithm mode, content type, MSD frames, and FPS</li>
              <li>Watch the <strong>MSD frame count</strong> - wait for 15+ frames before trusting results</li>
              <li>If the lower info bar shows <strong>COMPRESSED</strong>, lean harder on phase plus corroborating shape cues</li>
              <li>Use <strong>Comb Pattern</strong> predictions to preemptively address upcoming feedback frequencies</li>
              <li>Switch to <strong>Speech</strong> for general PA monitoring</li>
              <li>Use <strong>CONFIRM</strong> and <strong>Missed Feedback</strong> during tuning when the detector is too conservative</li>
              <li>Apply cuts conservatively - start with 3 dB and increase only if needed</li>
            </ol>
          </HelpSection>

          <HelpSection title="Common Feedback Frequency Ranges" color="blue">
            <ul className="space-y-2">
              <li><strong>200-500 Hz:</strong> Muddy buildup, boxy vocals, room modes</li>
              <li><strong>500 Hz-1 kHz:</strong> Nasal or honky tones, vocal feedback zone</li>
              <li><strong>1-3 kHz:</strong> Presence or intelligibility range, harsh feedback</li>
              <li><strong>3-6 kHz:</strong> Sibilance, cymbal harshness, piercing feedback</li>
              <li><strong>6-8 kHz:</strong> Air or brightness, high-frequency ringing</li>
            </ul>
          </HelpSection>
        </div>
      </HelpGroup>
    </>
  )
})
