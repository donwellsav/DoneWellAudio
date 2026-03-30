'use client'

import { memo } from 'react'
import { HelpSection, HelpGroup } from './HelpShared'

export const ModesTab = memo(function ModesTab() {
  return (
    <>
      {/* Mode cards in responsive grid */}
      <HelpGroup title="Operation Modes">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-1.5">
          <div className="bg-card/80 rounded border p-3 border-l-2 border-l-[rgba(var(--tint-r),var(--tint-g),var(--tint-b),0.40)]">
            <div className="text-sm font-medium" style={{ color: 'var(--console-blue)' }}>Speech</div>
            <div className="text-xs text-muted-foreground mt-0.5">Default — Corporate conferences, lectures</div>
            <div className="text-xs font-mono text-muted-foreground/80 mt-1.5 pt-1.5 border-t border-border/30">
              30dB · Ring 5dB · 1.0dB/s · A-wt · 150–10kHz
            </div>
          </div>
          <div className="bg-card/80 rounded border p-3 border-l-2 border-l-[rgba(var(--tint-r),var(--tint-g),var(--tint-b),0.40)]">
            <div className="text-sm font-medium" style={{ color: 'var(--console-blue)' }}>Worship</div>
            <div className="text-xs text-muted-foreground mt-0.5">Churches, reverberant spaces</div>
            <div className="text-xs font-mono text-muted-foreground/80 mt-1.5 pt-1.5 border-t border-border/30">
              35dB · Ring 5dB · 2.0dB/s · Music · 100–12kHz
            </div>
          </div>
          <div className="bg-card/80 rounded border p-3 border-l-2 border-l-[rgba(var(--tint-r),var(--tint-g),var(--tint-b),0.40)]">
            <div className="text-sm font-medium" style={{ color: 'var(--console-blue)' }}>Live Music</div>
            <div className="text-xs text-muted-foreground mt-0.5">Concerts, clubs, festivals</div>
            <div className="text-xs font-mono text-muted-foreground/80 mt-1.5 pt-1.5 border-t border-border/30">
              42dB · Ring 8dB · 4.0dB/s · Music · 60–16kHz
            </div>
          </div>
          <div className="bg-card/80 rounded border p-3 border-l-2 border-l-[rgba(var(--tint-r),var(--tint-g),var(--tint-b),0.40)]">
            <div className="text-sm font-medium" style={{ color: 'var(--console-blue)' }}>Theater</div>
            <div className="text-xs text-muted-foreground mt-0.5">Drama, musicals, body mics</div>
            <div className="text-xs font-mono text-muted-foreground/80 mt-1.5 pt-1.5 border-t border-border/30">
              28dB · Ring 4dB · 1.5dB/s · Auto · 150–10kHz
            </div>
          </div>
          <div className="bg-card/80 rounded border p-3 border-l-2 border-l-[rgba(var(--tint-r),var(--tint-g),var(--tint-b),0.40)]">
            <div className="text-sm font-medium" style={{ color: 'var(--console-blue)' }}>Monitors</div>
            <div className="text-xs text-muted-foreground mt-0.5">Stage wedges, sidefills</div>
            <div className="text-xs font-mono text-muted-foreground/80 mt-1.5 pt-1.5 border-t border-border/30">
              15dB · Ring 3dB · 0.8dB/s · Fast · 200–6kHz
            </div>
          </div>
          <div className="bg-card/80 rounded border p-3 border-l-2 border-l-[rgba(var(--tint-r),var(--tint-g),var(--tint-b),0.40)]">
            <div className="text-sm font-medium" style={{ color: 'var(--console-blue)' }}>Ring Out</div>
            <div className="text-xs text-muted-foreground mt-0.5">System calibration, sound check</div>
            <div className="text-xs font-mono text-muted-foreground/80 mt-1.5 pt-1.5 border-t border-border/30">
              12dB · Ring 2dB · 0.5dB/s · Max · 60–16kHz
            </div>
          </div>
          <div className="bg-card/80 rounded border p-3 border-l-2 border-l-[rgba(var(--tint-r),var(--tint-g),var(--tint-b),0.40)]">
            <div className="text-sm font-medium" style={{ color: 'var(--console-blue)' }}>Broadcast</div>
            <div className="text-xs text-muted-foreground mt-0.5">Studio, podcast, radio</div>
            <div className="text-xs font-mono text-muted-foreground/80 mt-1.5 pt-1.5 border-t border-border/30">
              22dB · Ring 3dB · 1.0dB/s · A-wt · 80–12kHz
            </div>
          </div>
          <div className="bg-card/80 rounded border p-3 border-l-2 border-l-[rgba(var(--tint-r),var(--tint-g),var(--tint-b),0.40)]">
            <div className="text-sm font-medium" style={{ color: 'var(--console-blue)' }}>Outdoor</div>
            <div className="text-xs text-muted-foreground mt-0.5">Open air, festivals</div>
            <div className="text-xs font-mono text-muted-foreground/80 mt-1.5 pt-1.5 border-t border-border/30">
              38dB · Ring 6dB · 2.5dB/s · Wind · 100–12kHz
            </div>
          </div>
        </div>
      </HelpGroup>

      {/* Group: Usage Tips */}
      <HelpGroup title="Usage Tips">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          <HelpSection title="Choosing a Mode" color="amber">
            <ul className="space-y-2">
              <li>Corporate conference / lecture → <strong>Speech</strong> (default)</li>
              <li>Initial system ring-out / sound check → <strong>Ring Out</strong></li>
              <li>Stage wedge tuning → <strong>Monitors</strong></li>
              <li>Church / reverberant space → <strong>Worship</strong></li>
              <li>Concert / festival → <strong>Live Music</strong> or <strong>Outdoor</strong></li>
              <li>Drama / musical / body mics → <strong>Theater</strong></li>
              <li>Studio / podcast / radio → <strong>Broadcast</strong></li>
            </ul>
          </HelpSection>

          <HelpSection title="Auto Music-Aware" color="green">
            <p>
              Automatically switches sensitivity based on signal level. When signal rises above the noise floor
              by the configured hysteresis (default 15 dB), enters music-aware mode. Returns to base mode
              after signal drops back for 1 second.
            </p>
          </HelpSection>

          <HelpSection title="Workflow Best Practices" color="amber">
            <ol className="list-decimal list-inside space-y-2">
              <li>Start with <strong>Ring Out</strong> mode during initial system setup</li>
              <li>Watch the <strong>Algorithm Status Bar</strong> — Auto mode highlights which algorithms are active</li>
              <li>Watch the <strong>MSD frame count</strong> — wait for 15+ frames before trusting results</li>
              <li>If status bar shows <strong>COMPRESSED</strong>, phase coherence is most reliable</li>
              <li>Use <strong>Comb Pattern</strong> predictions to preemptively address upcoming feedback frequencies</li>
              <li>Switch to <strong>Speech</strong> for general PA monitoring</li>
              <li>Enable <strong>Auto Music-Aware</strong> so sensitivity adjusts automatically during shows</li>
              <li>Apply cuts conservatively — start with 3 dB and increase only if needed</li>
            </ol>
          </HelpSection>

          <HelpSection title="Common Feedback Frequency Ranges" color="blue">
            <ul className="space-y-2">
              <li><strong>200–500 Hz:</strong> Muddy buildup, boxy vocals, room modes</li>
              <li><strong>500 Hz–1 kHz:</strong> Nasal/honky tones, vocal feedback zone</li>
              <li><strong>1–3 kHz:</strong> Presence/intelligibility range, harsh feedback</li>
              <li><strong>3–6 kHz:</strong> Sibilance, cymbal harshness, piercing feedback</li>
              <li><strong>6–8 kHz:</strong> Air/brightness, high-frequency ringing</li>
            </ul>
          </HelpSection>
        </div>
      </HelpGroup>
    </>
  )
})
