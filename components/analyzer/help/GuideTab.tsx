'use client'

import { memo } from 'react'
import { HelpSection, HelpGroup } from './HelpShared'

export const GuideTab = memo(function GuideTab() {
  return (
    <>
      {/* Group: Overview */}
      <HelpGroup title="Overview">
        <HelpSection title="What is DoneWell Audio?" color="amber">
          <p>
            A real-time acoustic feedback detection and analysis tool for professional live sound engineers.
            It combines 7 fused detection signals, mode-aware post-fusion gates, and worker-side classification to
            surface real feedback early enough to act on while still suppressing common speech, music, hum, and
            compression-related false positives.
          </p>
        </HelpSection>
      </HelpGroup>

      {/* Group: Getting Started */}
      <HelpGroup title="Getting Started">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          <HelpSection title="Quick Start" color="amber">
            <ol className="list-decimal list-inside space-y-2">
              <li>Click <strong>Start Analysis</strong> for live detection, or <strong>Ring Out Room</strong> for guided calibration wizard</li>
              <li>Detected issues appear in the <strong>Active Issues</strong> panel, sorted by frequency</li>
              <li>Each issue card shows frequency, pitch, severity, and recommended GEQ/PEQ cuts</li>
              <li>Tap the <strong>copy</strong> icon on a card to copy EQ settings to clipboard</li>
              <li>Open the <strong>Sensitivity &amp; Range</strong> accordion in the Controls panel to adjust detection thresholds</li>
              <li>Review <strong>Feedback History</strong> to track repeat offender frequencies</li>
            </ol>
          </HelpSection>

          <HelpSection title="Display Areas" color="blue">
            <ul className="space-y-2">
              <li><strong>Desktop — Resizable Panels:</strong> Controls, Issues, and graph panes can be shown together or split. The graph side can show the RTA and GEQ views together.</li>
              <li><strong>Mobile Portrait — Tabbed:</strong> Issues and Settings stay in one flow, with an inline RTA or GEQ graph that you can toggle and resize.</li>
              <li><strong>Mobile Landscape:</strong> The left side toggles between issues and settings while the right side stays dedicated to the graph view.</li>
              <li><strong>Issues Panel:</strong> Active advisories sorted by frequency. RUNAWAY issues pulse red. Copy or label cards directly from the panel.</li>
              <li><strong>Controls Panel:</strong> Four tabs — Live, Setup, Display, and Advanced — covering day-of-show controls, presets, graph options, and expert diagnostics.</li>
              <li><strong>Lower Info Bar:</strong> The footer shows algorithm mode, detected content type, MSD frame count, and the live FPS readout.</li>
              <li><strong>Early Warning Panel:</strong> Comb filter predictions with elapsed timer and urgency progress bar.</li>
              <li><strong>Theme Toggle:</strong> Sun/Moon icon in header (between Help and Reset Layout) switches dark/light mode. Persists across sessions.</li>
              <li><strong>Tooltips:</strong> Most controls have a ⓘ help icon. Hover or tap to see explanations with recommended ranges. Toggle tooltips on/off in Display → Preferences.</li>
            </ul>
          </HelpSection>
        </div>
      </HelpGroup>

      {/* Group: Controls */}
      <HelpGroup title="Controls">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          <HelpSection title="Header Controls" color="blue">
            <ul className="space-y-2">
              <li><strong>Start / Stop:</strong> Begin or pause audio analysis. LIVE indicator appears while running.</li>
              <li><strong>Input Gain Fader:</strong> Vertical fader strip with venue quick-cal pills (Quiet / Med / Loud). Startup default is 0 dB until you choose a preset or move the fader.</li>
              <li><strong>Layout:</strong> Toggle between desktop panel layouts. Fullscreen (F) gives the graph area a dedicated spectrum view.</li>
              <li><strong>Freeze (P):</strong> Pause the spectrum display for closer inspection without stopping analysis. Active state shows blue pill.</li>
              <li><strong>Clear All:</strong> Red notification dot appears when there are clearable items. Clears all advisories, GEQ bars, and RTA markers.</li>
              <li><strong>Draggable Threshold:</strong> Enable &quot;Show Threshold on RTA&quot; in the Display tab, then drag the threshold line handle up/down to adjust detection sensitivity directly on the spectrum.</li>
              <li><strong>Settings / Help / History:</strong> Access configuration, documentation, and feedback history.</li>
              <li><strong>Missed Feedback (⊕):</strong> Mark a false negative during calibration — flags the current frequency band as missed by the detector.</li>
            </ul>
          </HelpSection>

          <HelpSection title="Issue Card Actions" color="amber">
            <ul className="space-y-2">
              <li><strong>Copy:</strong> Tap the copy icon to copy frequency and EQ info to clipboard.</li>
              <li><strong>FALSE+:</strong> Flag a detection as a false positive. Feeds into ML training data for better future accuracy.</li>
              <li><strong>CONFIRM:</strong> Confirm a detection as real feedback. Symmetric labeling alongside FALSE+ for balanced training data.</li>
              <li><strong>Swipe Gesture:</strong> With desktop swipe gestures enabled, swipe left to dismiss and right to confirm. FALSE+ stays available as an explicit button.</li>
              <li><strong>SEND:</strong> Send this advisory&apos;s EQ recommendation to your hardware mixer via Bitfocus Companion. Only visible when Companion bridge is enabled in Advanced settings. See the <strong>Companion</strong> help tab for setup.</li>
            </ul>
          </HelpSection>

          <HelpSection title="Detection Controls" color="amber">
            <ul className="space-y-2">
              <li><strong>Live Tab:</strong> Sensitivity slider and frequency range presets — the controls you use during a show.</li>
              <li><strong>Setup Tab:</strong> Mode selector, EQ style, auto-gain target, room/environment, calibration, and rig presets — for soundcheck and pre-show.</li>
              <li><strong>Advanced Tab:</strong> Detection policy (ring, growth, confidence), timing, algorithms, noise floor, FFT, track management — expert diagnostics only.</li>
              <li><strong>Freq Range Presets:</strong> Vocal (200–8 kHz), Monitor (300–3 kHz), Full (20–20 kHz), Sub (20–250 Hz).</li>
              <li><strong>Save as Preset:</strong> Save current rig as a named preset (up to 10). Load from Setup tab.</li>
            </ul>
          </HelpSection>
        </div>
      </HelpGroup>

      {/* Group: Configuration */}
      <HelpGroup title="Configuration">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          <HelpSection title="Settings Panel (4 Tabs)" color="amber">
            <ul className="space-y-2">
              <li><strong>Live:</strong> Sensitivity and frequency range — the only controls you need during a show.</li>
              <li><strong>Setup:</strong> Mode selector, EQ style, auto-gain target, room environment (presets, dimensions, treatment), calibration (mic profile, ambient capture, venue metadata, session recording), and rig presets (save/load).</li>
              <li><strong>Display:</strong> Threshold line visibility, fader mode, max issues (desktop), tooltips, graph settings (RTA range, line width, FPS, font size), desktop swipe gestures, frequency zone overlay, warm spectrum, algorithm scores, and PEQ details.</li>
              <li><strong>Advanced:</strong> Detection policy (ring, growth, confidence, A-weighting, whistle), timing (sustain, clear), algorithms (ML toggle, custom grid), noise floor, peak detection, DSP (FFT, smoothing), track management, data collection, Companion bridge (send EQ to mixer).</li>
            </ul>
          </HelpSection>

          <HelpSection title="Troubleshooting" color="amber">
            <div className="space-y-3">
              <div>
                <p className="font-medium text-foreground text-sm mb-1">No Audio Input</p>
                <p className="text-sm">Check browser mic permissions, verify correct input device in system settings, refresh and re-grant permissions. HTTPS required in production.</p>
              </div>
              <div>
                <p className="font-medium text-foreground text-sm mb-1">Too Many False Positives</p>
                <p className="text-sm">Raise the confidence threshold, lower Sensitivity, and make sure the operating mode matches the source material. Speech and worship presets already suppress voiced formants and instrument-like content more aggressively; live material should usually be in Live Music or Outdoor instead of Speech.</p>
              </div>
              <div>
                <p className="font-medium text-foreground text-sm mb-1">Missing Feedback Detection</p>
                <p className="text-sm">Raise Sensitivity, lower the confidence threshold if cards are arriving too late, and increase Input Gain if the source is weak. Use Ring Out or Monitors for earlier reporting, and move to 16384 FFT when low-frequency resolution matters. During tuning, use CONFIRM and Missed Feedback so recall problems are measured instead of guessed at.</p>
              </div>
              <div>
                <p className="font-medium text-foreground text-sm mb-1">Compressed Music False Positives</p>
                <p className="text-sm">When the lower info bar shows COMPRESSED, the worker shifts weight toward phase and corroborating shape cues. Combined or Phase Only can help with heavily limited material, but keep an eye on PTMR and IHR support before trusting a single phase-heavy result.</p>
              </div>
              <div>
                <p className="font-medium text-foreground text-sm mb-1">Slow or Laggy Display</p>
                <p className="text-sm">Check the FPS counter in the lower info bar — amber means drops, red means severe. Reduce FFT Size to 4096. Close other browser tabs to free CPU.</p>
              </div>
            </div>
          </HelpSection>
        </div>
      </HelpGroup>
    </>
  )
})
