'use client'

import { memo } from 'react'
import { HelpSection } from './HelpShared'

export const GuideTab = memo(function GuideTab() {
  return (
    <>
      <HelpSection title="What is Kill The Ring?">
        <p>
          A real-time acoustic feedback detection and analysis tool for professional live sound engineers.
          Uses 6 detection algorithms and 6 multiplicative false-positive gates from peer-reviewed acoustic research to identify feedback frequencies,
          resonant rings, and problematic tones — then delivers specific EQ recommendations with pitch translation.
        </p>
      </HelpSection>

      {/* Group: Getting Started */}
      <div>
        <div className="py-1.5 px-2 section-label panel-groove bg-card/60">Getting Started</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-3">
          <HelpSection title="Quick Start">
            <ol className="list-decimal list-inside space-y-2">
              <li>Click <strong>Press to Start Analysis</strong> for live detection, or <strong>Ring Out Room</strong> for guided calibration wizard</li>
              <li>Detected issues appear in the <strong>Active Issues</strong> panel, sorted by frequency</li>
              <li>Each issue card shows frequency, pitch, severity, and recommended GEQ/PEQ cuts</li>
              <li>Tap the <strong>copy</strong> icon on a card to copy EQ settings to clipboard</li>
              <li>Open the <strong>Sensitivity &amp; Range</strong> accordion in the Controls panel to adjust detection thresholds</li>
              <li>Review <strong>Feedback History</strong> to track repeat offender frequencies</li>
            </ol>
          </HelpSection>

          <HelpSection title="Display Areas">
            <ul className="space-y-2">
              <li><strong>Desktop — Resizable Split:</strong> RTA spectrum (60%) and GEQ bar view (40%) side by side. Drag the divider to resize.</li>
              <li><strong>Mobile — Tabbed:</strong> Two tabs — Issues (with inline resizable graph) and Settings. Swipe the graph area to switch between RTA and GEQ. Drag the handle below the graph to resize.</li>
              <li><strong>Issues Panel:</strong> Active detected issues sorted by frequency. RUNAWAY issues pulse red. Copy EQ settings to clipboard.</li>
              <li><strong>Controls Panel:</strong> Accordion sections (Sensitivity &amp; Range open by default), sub-tab icons for Display, Room, Advanced, and Calibrate settings.</li>
              <li><strong>Algorithm Status Bar:</strong> Shows algorithm mode, active algorithms (Auto mode), FPS counter, content type (speech/music/compressed via temporal envelope + spectral analysis), and compression status.</li>
              <li><strong>Early Warning Panel:</strong> Comb filter predictions with elapsed timer and urgency progress bar.</li>
              <li><strong>Theme Toggle:</strong> Sun/Moon icon in header switches between dark and light mode. Persists across sessions. All canvases and UI adapt.</li>
            </ul>
          </HelpSection>
        </div>
      </div>

      {/* Group: Controls */}
      <div>
        <div className="py-1.5 px-2 section-label panel-groove bg-card/60">Controls</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-3">
          <HelpSection title="Header Controls">
            <ul className="space-y-2">
              <li><strong>Start / Stop:</strong> Begin or pause audio analysis. LIVE indicator appears while running.</li>
              <li><strong>Input Gain Fader:</strong> Vertical fader strip with venue quick-cal pills (Quiet / Med / Loud). Default +6 dB.</li>
              <li><strong>Layout (L):</strong> Toggle between desktop layouts. Fullscreen (F) for dedicated spectrum view.</li>
              <li><strong>Freeze (P):</strong> Pause the spectrum display for closer inspection without stopping analysis. Active state shows blue pill.</li>
              <li><strong>Clear All:</strong> Red notification dot appears when there are clearable items. Clears all advisories, GEQ bars, and RTA markers.</li>
              <li><strong>Draggable Threshold:</strong> Enable &quot;Show on RTA&quot; in Sensitivity &amp; Range, then drag the threshold line handle up/down to adjust detection sensitivity directly on the spectrum.</li>
              <li><strong>Settings / Help / History:</strong> Access configuration, documentation, and feedback history.</li>
              <li><strong>Missed Feedback (⊕):</strong> Mark a false negative during calibration — flags the current frequency band as missed by the detector.</li>
            </ul>
          </HelpSection>

          <HelpSection title="Issue Card Actions">
            <ul className="space-y-2">
              <li><strong>Copy:</strong> Tap the copy icon to copy frequency and EQ info to clipboard.</li>
              <li><strong>FALSE+:</strong> Flag a detection as a false positive. Feeds into ML training data for better future accuracy.</li>
              <li><strong>CONFIRM:</strong> Confirm a detection as real feedback. Symmetric labeling alongside FALSE+ for balanced training data.</li>
              <li><strong>Swipe to Label:</strong> Enable in Display settings. Swipe a card left for FALSE+, right for CONFIRM. Hides the buttons for a cleaner layout. Works with touch input on any screen size — phones, tablets, and touchscreen monitors.</li>
            </ul>
          </HelpSection>

          <HelpSection title="Detection Controls">
            <ul className="space-y-2">
              <li><strong>Accordion Sections:</strong> All settings organized in collapsible sections — Sensitivity &amp; Range, Detection, Algorithms, Timing &amp; Limits, Presets &amp; Mode. All closed by default.</li>
              <li><strong>Freq Range Presets:</strong> Vocal (200–8 kHz), Monitor (300–3 kHz), Full (20–20 kHz), Sub (20–250 Hz).</li>
              <li><strong>Sensitivity:</strong> Detection sensitivity — slide right for more sensitive. Lower dB values catch earlier feedback.</li>
              <li><strong>Mode Selector:</strong> Operation mode presets plus any saved custom presets.</li>
              <li><strong>Save as Preset:</strong> Save current settings as a named custom preset (up to 5). Load from mode dropdown.</li>
            </ul>
          </HelpSection>
        </div>
      </div>

      {/* Group: Configuration */}
      <div>
        <div className="py-1.5 px-2 section-label panel-groove bg-card/60">Configuration</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-3">
          <HelpSection title="Settings Sidebar (5 Icon Tabs)">
            <ul className="space-y-2">
              <li><strong>Detect:</strong> Sensitivity, algorithm mode, FFT size, smoothing, thresholds, A-weighting, harmonic filter, noise floor, peak detection, max tracks, track timeout, whistle suppression. Uses accordion sections for progressive disclosure.</li>
              <li><strong>Display:</strong> Tooltips, graph font size, max issues, EQ style, RTA dB range, spectrum line width, swipe-to-label, frequency zone overlay (Sub/Low Mid/Mid/Presence/Air — also shown at idle), warm amber spectrum mode, algorithm scores debug toggle.</li>
              <li><strong>Room:</strong> Room acoustics presets, RT60, volume, Schroeder frequency, modal overlap.</li>
              <li><strong>Advanced:</strong> Save/load defaults, reset to factory settings.</li>
              <li><strong>Calibrate:</strong> Room profile (dimensions, materials, mics), ambient noise capture, measurement mic compensation (Behringer ECM8000, dbx RTA-M, or Smartphone MEMS), calibration session recording with live stats and JSON export.</li>
            </ul>
          </HelpSection>

          <HelpSection title="Troubleshooting">
            <div className="space-y-3">
              <div>
                <p className="font-medium text-foreground text-sm mb-1">No Audio Input</p>
                <p className="text-sm">Check browser mic permissions, verify correct input device in system settings, refresh and re-grant permissions. HTTPS required in production.</p>
              </div>
              <div>
                <p className="font-medium text-foreground text-sm mb-1">Too Many False Positives</p>
                <p className="text-sm">Switch to Music-Aware mode. In Settings → Algorithms: raise confidence threshold. Lower sidebar Sensitivity (slide left). Enable whistle suppression if sibilance triggers detections. HVAC/electrical hum (50/60 Hz harmonics) is automatically suppressed by the mains hum gate when 2+ corroborating peaks are detected.</p>
              </div>
              <div>
                <p className="font-medium text-foreground text-sm mb-1">Missing Feedback Detection</p>
                <p className="text-sm">Raise sidebar Sensitivity (slide right). Increase Input Gain on the fader strip. Switch to Ring Out mode for maximum sensitivity. Increase FFT Size to 16384 for better low-frequency resolution.</p>
              </div>
              <div>
                <p className="font-medium text-foreground text-sm mb-1">Compressed Music False Positives</p>
                <p className="text-sm">When status bar shows COMPRESSED, phase coherence dominates automatically. Use Combined or Phase Only algorithm mode for heavily compressed content.</p>
              </div>
              <div>
                <p className="font-medium text-foreground text-sm mb-1">Slow or Laggy Display</p>
                <p className="text-sm">Check the FPS counter in the status bar — amber means drops, red means severe. Reduce FFT Size to 4096. Close other browser tabs to free CPU.</p>
              </div>
            </div>
          </HelpSection>
        </div>
      </div>
    </>
  )
})
