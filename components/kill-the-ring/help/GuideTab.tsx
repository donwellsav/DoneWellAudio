'use client'

import { memo } from 'react'
import { HelpSection } from './HelpShared'

export const GuideTab = memo(function GuideTab() {
  return (
    <>
      <HelpSection title="What is Kill The Ring?">
        <p>
          A real-time acoustic feedback detection and analysis tool for professional live sound engineers.
          Uses 6 detection algorithms from peer-reviewed acoustic research to identify feedback frequencies,
          resonant rings, and problematic tones — then delivers specific EQ recommendations with pitch translation.
        </p>
      </HelpSection>

      {/* Group: Getting Started */}
      <div>
        <div className="py-1.5 px-2 section-label panel-groove bg-card/60">Getting Started</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-3">
          <HelpSection title="Quick Start">
            <ol className="list-decimal list-inside space-y-2">
              <li>Click the flashing <strong>START</strong> speaker button in the header</li>
              <li>Detected issues appear in the <strong>Active Issues</strong> panel, sorted by frequency</li>
              <li>Each issue card shows frequency, pitch, severity, and recommended GEQ/PEQ cuts</li>
              <li>Tap the <strong>copy</strong> icon on a card to copy EQ settings to clipboard</li>
              <li>Use <strong>Quick Controls</strong> to adjust sensitivity, or switch to <strong>Full Controls</strong> for all settings</li>
              <li>Review <strong>Feedback History</strong> to track repeat offender frequencies</li>
            </ol>
          </HelpSection>

          <HelpSection title="Display Areas">
            <ul className="space-y-2">
              <li><strong>Desktop — Resizable Split:</strong> RTA spectrum (60%) and GEQ bar view (40%) side by side. Drag the divider to resize.</li>
              <li><strong>Mobile — Tabbed:</strong> Three tabs — Issues, Graph (RTA + GEQ split), and Settings. Swipe left/right to switch tabs.</li>
              <li><strong>Issues Panel:</strong> Active detected issues sorted by frequency. RUNAWAY issues pulse red. Copy EQ settings to clipboard.</li>
              <li><strong>Controls Panel:</strong> Quick/Full toggle, sensitivity sliders, mode selector, frequency range presets, custom presets.</li>
              <li><strong>Algorithm Status Bar:</strong> Shows algorithm mode, active algorithms (Auto mode), FPS counter, content type, and compression status.</li>
              <li><strong>Early Warning Panel:</strong> Comb filter predictions with elapsed timer and urgency progress bar.</li>
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
              <li><strong>Freeze (P):</strong> Pause the spectrum display for closer inspection without stopping analysis.</li>
              <li><strong>Settings / Help / History:</strong> Access configuration, documentation, and feedback history.</li>
              <li><strong>Missed Feedback (⊕):</strong> Mark a false negative during calibration — flags the current frequency band as missed by the detector.</li>
            </ul>
          </HelpSection>

          <HelpSection title="Detection Controls">
            <ul className="space-y-2">
              <li><strong>Quick / Full Controls:</strong> Pill toggle at top. Quick mode shows essentials; Full mode shows all settings.</li>
              <li><strong>Freq Range Presets:</strong> Vocal (200–8 kHz), Monitor (300–3 kHz), Full (20–20 kHz), Sub (20–250 Hz).</li>
              <li><strong>Sensitivity:</strong> Detection sensitivity — slide right for more sensitive. Lower dB values catch earlier feedback.</li>
              <li><strong>Mode Selector:</strong> Operation mode presets plus any saved custom presets.</li>
              <li><strong>Save as Preset:</strong> Save current settings as a named custom preset (up to 5). Load from mode dropdown.</li>
              <li><strong>Full Controls extras:</strong> Ring, Growth, Music-Aware, Sustain, Confidence, Algorithm grid, A-Weighting, and more.</li>
            </ul>
          </HelpSection>
        </div>
      </div>

      {/* Group: Configuration */}
      <div>
        <div className="py-1.5 px-2 section-label panel-groove bg-card/60">Configuration</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-3">
          <HelpSection title="Settings Panel (6 Tabs)">
            <ul className="space-y-2">
              <li><strong>Detection:</strong> FFT size, smoothing, thresholds, A-weighting, harmonic filter, noise floor, peak detection.</li>
              <li><strong>Algorithms:</strong> Algorithm mode, algorithm scores display, music-aware, max tracks, track timeout, whistle suppression.</li>
              <li><strong>Display:</strong> Tooltips, graph font size, max issues, EQ style, RTA dB range, spectrum line width.</li>
              <li><strong>Room:</strong> Room acoustics presets, RT60, volume, Schroeder frequency, modal overlap.</li>
              <li><strong>Advanced:</strong> Save/load defaults, reset to factory settings.</li>
              <li><strong>Calibrate:</strong> Room profile (dimensions, materials, mics), ambient noise capture, measurement mic compensation (Behringer ECM8000, dbx RTA-M, or Smartphone MEMS), calibration session recording with live stats and JSON export (v1.1 with per-event mic cal flags).</li>
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
                <p className="text-sm">Switch to Music-Aware mode. In Settings → Algorithms: raise confidence threshold. Lower sidebar Sensitivity (slide left). Enable whistle suppression if sibilance triggers detections.</p>
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
