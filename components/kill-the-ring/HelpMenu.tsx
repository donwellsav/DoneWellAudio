'use client'

// Help menu for Kill The Ring application
// 5-tab layout: Guide, Modes & Tips, Algorithms, The Math, Reference
// Updated with all 7 detection algorithms (MSD, Phase, Spectral, Comb, IHR, PTMR, Compression)
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { HelpCircle } from 'lucide-react'

export function HelpMenu() {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button suppressHydrationWarning variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground" aria-label="Help">
          <HelpCircle className="w-4 h-4" />
          <span className="hidden sm:inline text-xs">Help</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="text-lg">Kill The Ring Help</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="guide" className="mt-4">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="guide">Guide</TabsTrigger>
            <TabsTrigger value="modes">Modes</TabsTrigger>
            <TabsTrigger value="algorithms">Algorithms</TabsTrigger>
            <TabsTrigger value="math">The Math</TabsTrigger>
            <TabsTrigger value="reference">Reference</TabsTrigger>
          </TabsList>

          {/* ═══════════════════════════════════════════════════════════════
              TAB 1: GUIDE
              ═══════════════════════════════════════════════════════════════ */}
          <TabsContent value="guide" className="mt-4 space-y-4">
            <Section title="What is Kill The Ring?">
              <p>
                A real-time acoustic feedback detection and analysis tool for professional live sound engineers.
                Uses 7 detection algorithms from peer-reviewed acoustic research to identify feedback frequencies,
                resonant rings, and problematic tones — then delivers specific EQ recommendations with pitch translation.
              </p>
            </Section>

            <Section title="Quick Start">
              <ol className="list-decimal list-inside space-y-2">
                <li>Click the flashing <strong>START</strong> speaker button in the header</li>
                <li>Detected issues appear in the <strong>Active Issues</strong> sidebar, sorted by frequency</li>
                <li>Each issue card shows frequency, pitch, severity, and recommended GEQ/PEQ cuts</li>
                <li>Tap <strong>Apply</strong> on a card to log the cut to the <strong>EQ Notepad</strong></li>
                <li>Enable <strong>Show Algorithm Scores</strong> in Settings → Algorithms to see live detection status</li>
                <li>Use the sidebar sliders to tune detection sensitivity in real time</li>
                <li>Export session logs for post-event analysis</li>
              </ol>
            </Section>

            <Section title="Display Areas">
              <ul className="space-y-2">
                <li><strong>Large Panel (top):</strong> Selected graph enlarged. Switch between RTA Spectrum, 31-Band GEQ, and Controls.</li>
                <li><strong>Small Panels (bottom row):</strong> Two configurable panels — choose RTA, GEQ, or Controls for each.</li>
                <li><strong>Left Sidebar — Issues tab:</strong> Active detected issues with Apply buttons. RUNAWAY issues pulse red.</li>
                <li><strong>Left Sidebar — EQ Notepad:</strong> Accumulates applied cuts for reference and export.</li>
                <li><strong>Algorithm Status Bar:</strong> Shows algorithm mode, content type, MSD buffer, and compression status.</li>
              </ul>
            </Section>

            <Section title="Header Controls">
              <ul className="space-y-2">
                <li><strong>Start / Stop:</strong> Begin or pause audio analysis. LIVE indicator appears while running.</li>
                <li><strong>Input Gain:</strong> Digital boost before analysis (-40 to +40 dB, default +15 dB).</li>
                <li><strong>Mode:</strong> Detection sensitivity preset (see Modes tab).</li>
                <li><strong>Logs / Sessions / Settings:</strong> Access session data, history, and configuration.</li>
              </ul>
            </Section>

            <Section title="Sidebar Controls">
              <ul className="space-y-2">
                <li><strong>Freq Range:</strong> Vocal (200-8kHz), Monitor (300-3kHz), Full (20-20kHz), Sub (20-250Hz).</li>
                <li><strong>Music-Aware:</strong> Auto-switches sensitivity when the band starts/stops playing.</li>
                <li><strong>Threshold:</strong> Primary sensitivity (4-8 dB aggressive, 10-14 balanced, 16+ conservative).</li>
                <li><strong>Ring:</strong> Resonance detection (2-4 dB calibration, 5-7 normal, 8+ shows only).</li>
                <li><strong>Growth:</strong> Amplitude growth rate (0.5-1 dB/s early catch, 3+ dB/s runaway only).</li>
              </ul>
            </Section>

            <Section title="Settings Panel">
              <ul className="space-y-2">
                <li><strong>Detection:</strong> FFT size, smoothing, thresholds, A-weighting, harmonic filter, noise floor, peak detection, room acoustics.</li>
                <li><strong>Algorithms:</strong> Algorithm mode, algorithm scores display, music-aware, max tracks, track timeout, whistle suppression.</li>
                <li><strong>Display:</strong> Tooltips, graph font size, max issues, EQ style, RTA dB range, spectrum line width, save/load defaults.</li>
                <li><strong>Export:</strong> Session log export in CSV, JSON, or plain text formats.</li>
              </ul>
            </Section>
          </TabsContent>

          {/* ═══════════════════════════════════════════════════════════════
              TAB 2: MODES & TIPS
              ═══════════════════════════════════════════════════════════════ */}
          <TabsContent value="modes" className="mt-4 space-y-4">
            <Section title="Operation Modes">
              <ul className="space-y-3">
                <li>
                  <strong>Feedback Hunt (Default):</strong> Balanced PA mode. Threshold 8 dB, Ring 5 dB, Growth 2 dB/s.
                </li>
                <li>
                  <strong>Aggressive:</strong> Maximum sensitivity. Threshold 6 dB, Ring 3 dB, Growth 1 dB/s. Best for system calibration.
                </li>
                <li>
                  <strong>Vocal Ring:</strong> Tuned for speech (200 Hz–8 kHz). Threshold 6 dB, Ring 4 dB, Growth 1.5 dB/s.
                </li>
                <li>
                  <strong>Music-Aware:</strong> Reduced sensitivity for performance. Threshold 12 dB, Ring 7 dB, Growth 3 dB/s, music filter enabled.
                </li>
                <li>
                  <strong>Calibration:</strong> Ultra-sensitive for initial setup. Threshold 4 dB, Ring 2 dB, Growth 0.5 dB/s.
                </li>
              </ul>
            </Section>

            <Section title="Choosing a Mode">
              <ul className="space-y-2">
                <li>General soundcheck → <strong>Feedback Hunt</strong></li>
                <li>Initial system ring-out → <strong>Calibration</strong> or <strong>Aggressive</strong></li>
                <li>Monitor tuning / corporate speech → <strong>Vocal Ring</strong></li>
                <li>During live performance → <strong>Music-Aware</strong> or enable <strong>Auto Music-Aware</strong></li>
              </ul>
            </Section>

            <Section title="Auto Music-Aware">
              <p>
                Automatically switches sensitivity based on signal level. When signal rises above the noise floor
                by the configured hysteresis (default 15 dB), enters music-aware mode. Returns to base mode
                after signal drops back for 1 second.
              </p>
            </Section>

            <Section title="Workflow Best Practices">
              <ol className="list-decimal list-inside space-y-2">
                <li>Start with <strong>Calibration</strong> mode during initial system setup</li>
                <li>Enable <strong>Show Algorithm Scores</strong> to see what each algorithm detects</li>
                <li>Watch the <strong>MSD frame count</strong> — wait for 15+ frames before trusting results</li>
                <li>If status bar shows <strong>COMPRESSED</strong>, phase coherence is most reliable</li>
                <li>Use <strong>Comb Pattern</strong> predictions to preemptively address upcoming feedback frequencies</li>
                <li>Switch to <strong>Feedback Hunt</strong> for general PA monitoring</li>
                <li>Enable <strong>Auto Music-Aware</strong> so sensitivity adjusts automatically during shows</li>
                <li>Apply cuts conservatively — start with 3 dB and increase only if needed</li>
              </ol>
            </Section>

            <Section title="Common Feedback Frequency Ranges">
              <ul className="space-y-2">
                <li><strong>200–500 Hz:</strong> Muddy buildup, boxy vocals, room modes</li>
                <li><strong>500 Hz–1 kHz:</strong> Nasal/honky tones, vocal feedback zone</li>
                <li><strong>1–3 kHz:</strong> Presence/intelligibility range, harsh feedback</li>
                <li><strong>3–6 kHz:</strong> Sibilance, cymbal harshness, piercing feedback</li>
                <li><strong>6–8 kHz:</strong> Air/brightness, high-frequency ringing</li>
              </ul>
            </Section>

            <Section title="Troubleshooting">
              <div className="space-y-3">
                <div>
                  <p className="font-medium text-foreground text-xs mb-1">No Audio Input</p>
                  <p className="text-xs">Check browser mic permissions, verify correct input device in system settings, refresh and re-grant permissions. HTTPS required in production.</p>
                </div>
                <div>
                  <p className="font-medium text-foreground text-xs mb-1">Too Many False Positives</p>
                  <p className="text-xs">Switch to Music-Aware mode. In Settings → Algorithms: raise confidence threshold. Increase sidebar Threshold to 10-14 dB. Enable whistle suppression if sibilance triggers detections.</p>
                </div>
                <div>
                  <p className="font-medium text-foreground text-xs mb-1">Missing Feedback Detection</p>
                  <p className="text-xs">Lower sidebar Threshold (4-6 dB). Increase Input Gain. Switch to Aggressive or Calibration mode. Increase FFT Size to 16384 for better low-frequency resolution.</p>
                </div>
                <div>
                  <p className="font-medium text-foreground text-xs mb-1">Compressed Music False Positives</p>
                  <p className="text-xs">When status bar shows COMPRESSED, phase coherence dominates automatically. Use Combined or Phase Only algorithm mode for heavily compressed content.</p>
                </div>
                <div>
                  <p className="font-medium text-foreground text-xs mb-1">Slow or Laggy Display</p>
                  <p className="text-xs">Reduce FFT Size to 4096. Disable Show Algorithm Scores. Close other browser tabs to free CPU.</p>
                </div>
              </div>
            </Section>
          </TabsContent>

          {/* ═══════════════════════════════════════════════════════════════
              TAB 3: ALGORITHMS
              ═══════════════════════════════════════════════════════════════ */}
          <TabsContent value="algorithms" className="mt-4 space-y-4">
            <Section title="7-Algorithm Fusion System">
              <p>
                Kill The Ring uses 7 detection algorithms from peer-reviewed acoustic research. Each exploits
                a different physical property of feedback vs. musical content. They vote together with
                content-aware weighting for maximum accuracy and minimal false positives.
              </p>
            </Section>

            <Section title="1. MSD — Magnitude Slope Deviation">
              <p className="mb-1 text-xs italic">DAFx-16 Paper — Growth pattern analysis</p>
              <p className="mb-2">
                Feedback amplitude grows exponentially — linear on a dB scale — so its second derivative is near zero.
                Music has random amplitude variations with high second derivative.
              </p>
              <ul className="space-y-1">
                <li><strong>Low MSD (&lt;0.1):</strong> Consistent growth → likely feedback</li>
                <li><strong>High MSD (&gt;1.0):</strong> Random variation → likely music</li>
                <li><strong>Speech accuracy:</strong> 100% with 7 frames (~160ms)</li>
                <li><strong>Classical music:</strong> 100% with 13 frames (~300ms)</li>
                <li><strong>Rock/compressed:</strong> 22% accuracy at 50 frames — needs compression detection assist</li>
              </ul>
              <p className="mt-2 text-xs">
                Uses an optimized &ldquo;Summing MSD&rdquo; method that is 140× faster than the original algorithm
                with zero per-frame allocations.
              </p>
            </Section>

            <Section title="2. Phase Coherence Analysis">
              <p className="mb-1 text-xs italic">KU Leuven 2025 / Nyquist stability theory</p>
              <p className="mb-2">
                True feedback maintains constant phase relationships because it&apos;s a regenerative loop at a fixed frequency.
                Music and noise have random phase variations frame-to-frame.
              </p>
              <ul className="space-y-1">
                <li><strong>High coherence (≥0.85):</strong> Phase-locked → likely feedback</li>
                <li><strong>Medium (0.65–0.85):</strong> Uncertain</li>
                <li><strong>Low (&lt;0.4):</strong> Random phase → likely music/noise</li>
              </ul>
              <p className="mt-2 text-xs">
                Compression-resistant: detects phase patterns regardless of amplitude compression.
              </p>
            </Section>

            <Section title="3. Spectral Flatness + Kurtosis">
              <p className="mb-1 text-xs italic">Wiener entropy — Tone vs. broadband discrimination</p>
              <p className="mb-2">
                Measures how tone-like (feedback) vs. noise-like (music) the spectrum is around a peak.
                Kurtosis measures amplitude distribution peakiness.
              </p>
              <ul className="space-y-1">
                <li><strong>Flatness &lt;0.05:</strong> Pure tone (single frequency = feedback)</li>
                <li><strong>Flatness &gt;0.15:</strong> Broadband (music/speech)</li>
                <li><strong>Kurtosis &gt;10:</strong> Strongly peaked distribution (feedback)</li>
                <li><strong>Combined score:</strong> 60% flatness + 40% kurtosis</li>
              </ul>
            </Section>

            <Section title="4. Comb Filter Pattern Detection">
              <p className="mb-1 text-xs italic">DBX Paper — Acoustic path geometry</p>
              <p className="mb-2">
                A single acoustic feedback path creates peaks at regularly spaced frequencies
                determined by the round-trip delay. Finding this pattern identifies the feedback loop
                and predicts where future feedback will occur.
              </p>
              <ul className="space-y-1">
                <li><strong>Formula:</strong> f<sub>n</sub> = n · c / d (where c = 343 m/s, d = path length)</li>
                <li><strong>Spacing:</strong> Δf = c / d (constant between all peaks)</li>
                <li><strong>Detection:</strong> Finds common spacing (GCD) between 3+ peaks within ±5% tolerance</li>
                <li><strong>Prediction:</strong> Calculates future feedback frequencies before they become audible</li>
              </ul>
            </Section>

            <Section title="5. Inter-Harmonic Ratio (IHR)">
              <p className="mb-1 text-xs italic">Harmonic vs. inter-harmonic energy analysis</p>
              <p className="mb-2">
                Compares energy at harmonic positions (k·f₀) to energy at midpoints between harmonics.
                Feedback produces clean harmonics with no inter-harmonic energy. Musical instruments
                have rich inter-harmonic content from formants and modulation.
              </p>
              <ul className="space-y-1">
                <li><strong>IHR &lt;0.15:</strong> Clean tone → likely feedback</li>
                <li><strong>IHR &gt;0.35:</strong> Rich harmonics → likely music</li>
                <li><strong>Checks harmonics:</strong> Up to 8th overtone</li>
              </ul>
            </Section>

            <Section title="6. Peak-to-Median Ratio (PTMR)">
              <p className="mb-1 text-xs italic">Spectral prominence measurement</p>
              <p className="mb-2">
                Measures how much a peak stands above the local spectral floor using the median
                (not mean — mean is biased upward by the peak itself). Sharp narrow peaks = feedback.
              </p>
              <ul className="space-y-1">
                <li><strong>PTMR &gt;20 dB:</strong> Sharp narrow peak → strong feedback indicator</li>
                <li><strong>PTMR 15–20 dB:</strong> Moderate prominence → possible feedback</li>
                <li><strong>PTMR &lt;8 dB:</strong> Broad peak → broadband content (music/noise)</li>
              </ul>
            </Section>

            <Section title="7. Compression Detection">
              <p className="mb-1 text-xs italic">DAFx-16 research — Adaptive threshold adjustment</p>
              <p className="mb-2">
                Dynamically compressed content (rock, pop, EDM) causes MSD false positives because sustained
                notes have flat amplitude curves similar to early feedback. Compression detection identifies this
                and shifts fusion weights toward phase coherence.
              </p>
              <ul className="space-y-1">
                <li><strong>Crest Factor:</strong> Peak-to-RMS ratio. Normal: 12-14 dB. Compressed: &lt;6 dB</li>
                <li><strong>Dynamic Range:</strong> Normal: &gt;20 dB. Compressed: &lt;8 dB</li>
                <li><strong>Adaptation:</strong> MSD weight drops, Phase Coherence weight increases automatically</li>
              </ul>
            </Section>

            <Section title="Algorithm Fusion">
              <p className="mb-2">
                All 7 algorithms vote together with content-aware weighting. The system automatically
                detects content type (speech, music, compressed) and applies appropriate weights:
              </p>
              <div className="bg-muted p-3 rounded text-xs font-mono space-y-1">
                <p className="font-semibold text-foreground">Weights: [MSD, Phase, Spectral, Comb, IHR, PTMR, Legacy]</p>
                <p>Speech:     [0.40, 0.20, 0.10, 0.05, 0.05, 0.10, 0.10]</p>
                <p>Music:      [0.15, 0.35, 0.10, 0.08, 0.12, 0.05, 0.15]</p>
                <p>Compressed: [0.12, 0.38, 0.15, 0.08, 0.10, 0.07, 0.10]</p>
                <p>Default:    [0.30, 0.25, 0.12, 0.08, 0.08, 0.07, 0.10]</p>
              </div>
            </Section>

            <Section title="Understanding Algorithm Scores">
              <ul className="space-y-2">
                <li><strong>MSD HIGH:</strong> Second derivative near zero — strong feedback indicator (consistent growth)</li>
                <li><strong>Phase LOCKED:</strong> Consistent phase relationship — strong feedback indicator (regenerative loop)</li>
                <li><strong>Spectral PURE:</strong> Very low flatness — single tone present (near-zero entropy)</li>
                <li><strong>Comb PATTERN:</strong> Regular frequency spacing — feedback loop geometry identified</li>
                <li><strong>IHR LOW:</strong> Clean harmonics with no inter-harmonic energy — feedback</li>
                <li><strong>PTMR HIGH:</strong> Peak stands far above spectral floor — narrow isolated tone</li>
                <li><strong>COMPRESSED:</strong> Dynamic compression detected — phase coherence becomes primary</li>
              </ul>
            </Section>
          </TabsContent>

          {/* ═══════════════════════════════════════════════════════════════
              TAB 4: THE MATH
              ═══════════════════════════════════════════════════════════════ */}
          <TabsContent value="math" className="mt-4 space-y-4">
            <Section title="Spectral Fundamentals">
              <p className="mb-2">Core DSP transforms underpinning the analysis engine:</p>
              <div className="bg-muted p-3 rounded font-mono text-xs space-y-1">
                <p className="text-foreground font-semibold">FFT Resolution</p>
                <p>Δf = f<sub>s</sub> / N</p>
                <p>At 8192pt @ 48 kHz: Δf = 48000 / 8192 = <strong>5.86 Hz/bin</strong></p>
                <p>Bin to Hz: f = k · (f<sub>s</sub> / N)</p>
              </div>
              <div className="bg-muted p-3 rounded font-mono text-xs space-y-1 mt-2">
                <p className="text-foreground font-semibold">Quadratic Peak Interpolation (Grandke, 1983)</p>
                <p>Given 3 adjacent bins: α = y[k-1], β = y[k], γ = y[k+1]</p>
                <p>δ = 0.5 · (α - γ) / (α - 2β + γ)</p>
                <p>f<sub>true</sub> = (k + δ) · Δf</p>
                <p>A<sub>true</sub> = β - 0.25 · (α - γ) · δ</p>
                <p className="mt-1 text-muted-foreground">Refines peak frequency beyond bin resolution by fitting a parabola through the 3 highest points.</p>
              </div>
              <div className="bg-muted p-3 rounded font-mono text-xs space-y-1 mt-2">
                <p className="text-foreground font-semibold">dB Conversions</p>
                <p>Power: L = 10 · log<sub>10</sub>(P), P = 10<sup>(L/10)</sup></p>
                <p>Amplitude: L = 20 · log<sub>10</sub>(A), A = 10<sup>(L/20)</sup></p>
              </div>
            </Section>

            <Section title="Algorithm 1: MSD — Magnitude Slope Deviation">
              <p className="mb-1 text-xs italic">DAFx-16 — exploits the linearity of feedback growth on a dB scale</p>
              <div className="bg-muted p-3 rounded font-mono text-xs space-y-1">
                <p className="text-foreground font-semibold">Physical Basis</p>
                <p>Feedback amplitude: A(t) = A<sub>0</sub> · e<sup>αt</sup></p>
                <p>In dB: L(t) = L<sub>0</sub> + (20α / ln 10) · t</p>
                <p>This is <strong>linear in dB</strong> ⟹ d²L/dt² = 0</p>
                <p className="mt-1 text-muted-foreground">Music amplitude varies randomly ⟹ d²L/dt² ≠ 0</p>
              </div>
              <div className="bg-muted p-3 rounded font-mono text-xs space-y-1 mt-2">
                <p className="text-foreground font-semibold">Second Derivative (Discrete)</p>
                <p>G&apos;&apos;(k,n) = M(k,n) - 2·M(k,n-1) + M(k,n-2)</p>
                <p className="mt-1 text-muted-foreground">where M(k,n) = magnitude in dB at bin k, frame n</p>
              </div>
              <div className="bg-muted p-3 rounded font-mono text-xs space-y-1 mt-2">
                <p className="text-foreground font-semibold">MSD Calculation</p>
                <p>MSD(k,m) = √[ Σ<sub>n=2..N-1</sub> |G&apos;&apos;(k,n)|² / (N - 2) ]</p>
                <p className="mt-1">Threshold: MSD &lt; <strong>0.1 dB²/frame²</strong> → feedback</p>
                <p className="text-muted-foreground">(Paper threshold: 1.0 for 14-frame window → normalized ≈ 0.071, adjusted to 0.1 for robustness)</p>
              </div>
              <div className="bg-muted p-3 rounded font-mono text-xs space-y-1 mt-2">
                <p className="text-foreground font-semibold">Summing Method (140× Faster)</p>
                <p>Running accumulator: sumG2 += |G&apos;&apos;|² on each new frame</p>
                <p>On ring buffer wrap: sumG2 -= |oldest G&apos;&apos;|²</p>
                <p>MSD = √(sumG2 / (frameCount - 2))</p>
                <p className="mt-1 text-muted-foreground">Zero per-frame allocation. O(1) per bin per frame.</p>
              </div>
              <div className="bg-muted p-3 rounded font-mono text-xs space-y-1 mt-2">
                <p className="text-foreground font-semibold">Fast Confirmation</p>
                <p>If MSD &lt; 0.15 for 3 consecutive frames → instant feedback flag</p>
                <p className="mt-1 text-muted-foreground">Bypasses full-window requirement for obvious feedback.</p>
              </div>
              <div className="bg-muted p-3 rounded font-mono text-xs mt-2">
                <p className="text-foreground font-semibold">Required Frames for 100% Accuracy</p>
                <p>Speech: 7 frames (~160 ms) · Classical: 13 frames (~300 ms)</p>
                <p>Rock/compressed: 50 frames (~1.1 s) at 22% accuracy — use compression detection</p>
              </div>
            </Section>

            <Section title="Algorithm 2: Phase Coherence">
              <p className="mb-1 text-xs italic">KU Leuven 2025 (arXiv 2512.01466) / Nyquist (1932)</p>
              <div className="bg-muted p-3 rounded font-mono text-xs space-y-1">
                <p className="text-foreground font-semibold">Nyquist Stability Criterion</p>
                <p>Feedback occurs when both conditions are met simultaneously:</p>
                <p>1. Magnitude: |G(ω) · F(ω)| &gt; 1 (loop gain exceeds unity)</p>
                <p>2. Phase: ∠[G(ω) · F(ω)] = n · 2π (constructive interference)</p>
                <p className="mt-1 text-muted-foreground">G(ω) = acoustic path transfer function, F(ω) = electrical path (PA system)</p>
              </div>
              <div className="bg-muted p-3 rounded font-mono text-xs space-y-1 mt-2">
                <p className="text-foreground font-semibold">Phase Difference</p>
                <p>Δφ(k,n) = φ(k,n) - φ(k,n-1)</p>
                <p>Wrapped to [-π, π] for continuity</p>
              </div>
              <div className="bg-muted p-3 rounded font-mono text-xs space-y-1 mt-2">
                <p className="text-foreground font-semibold">Phasor Average (Coherence Measure)</p>
                <p>C(k) = | 1/N · Σ<sub>n</sub> exp(j · Δφ(k,n)) |</p>
                <p className="mt-1">Expanded into real/imaginary parts (avoids complex arithmetic):</p>
                <p>realSum = Σ cos(Δφ<sub>n</sub>) / N</p>
                <p>imagSum = Σ sin(Δφ<sub>n</sub>) / N</p>
                <p>C = √(realSum² + imagSum²)</p>
              </div>
              <div className="bg-muted p-3 rounded font-mono text-xs space-y-1 mt-2">
                <p className="text-foreground font-semibold">Physical Intuition</p>
                <p>Pure tone → constant phase advance per frame → all phasors align → C ≈ 1</p>
                <p>Random signal → random phase walk → phasors cancel → C ≈ 0</p>
              </div>
              <div className="bg-muted p-3 rounded font-mono text-xs mt-2">
                <p>Thresholds: C ≥ 0.85 → feedback | 0.65–0.85 → uncertain | &lt; 0.4 → music</p>
                <p>Min samples: 5 frames | Buffer: 10 frames per bin</p>
              </div>
            </Section>

            <Section title="Algorithm 3: Spectral Flatness + Kurtosis">
              <p className="mb-1 text-xs italic">Wiener Entropy — statistical measures of spectral shape</p>
              <div className="bg-muted p-3 rounded font-mono text-xs space-y-1">
                <p className="text-foreground font-semibold">Spectral Flatness (Wiener Entropy)</p>
                <p>Convert to linear power: P<sub>k</sub> = 10<sup>(spectrum<sub>k</sub>/10)</sup></p>
                <p>Geometric mean: G = exp[ 1/N · Σ<sub>k</sub> ln(P<sub>k</sub>) ]</p>
                <p>Arithmetic mean: A = 1/N · Σ<sub>k</sub> P<sub>k</sub></p>
                <p>SF = G / A ∈ [0, 1]</p>
                <p className="mt-1">SF = 0 → pure tone (all energy in one bin)</p>
                <p>SF = 1 → white noise (equal energy everywhere)</p>
              </div>
              <div className="bg-muted p-3 rounded font-mono text-xs space-y-1 mt-2">
                <p className="text-foreground font-semibold">Excess Kurtosis</p>
                <p>μ = 1/N · Σ x<sub>i</sub> (mean)</p>
                <p>σ² = 1/N · Σ (x<sub>i</sub> - μ)² (variance)</p>
                <p>μ₄ = 1/N · Σ (x<sub>i</sub> - μ)⁴ (4th central moment)</p>
                <p>K<sub>excess</sub> = μ₄ / σ⁴ - 3</p>
                <p className="mt-1">K = 0 → Gaussian (noise) | K &gt; 10 → strongly peaked (feedback)</p>
              </div>
              <div className="bg-muted p-3 rounded font-mono text-xs mt-2">
                <p className="text-foreground font-semibold">Combined Score</p>
                <p>S = 0.6 · flatnessScore + 0.4 · kurtosisScore</p>
                <p>Analysis bandwidth: ±10 bins around peak</p>
              </div>
            </Section>

            <Section title="Algorithm 4: Comb Filter Pattern">
              <p className="mb-1 text-xs italic">DBX Paper — acoustic path delay creates evenly-spaced feedback</p>
              <div className="bg-muted p-3 rounded font-mono text-xs space-y-1">
                <p className="text-foreground font-semibold">Physical Derivation</p>
                <p>Acoustic path delay: τ = d / c (seconds)</p>
                <p>Constructive interference at: f<sub>n</sub> = n / τ = <strong>n · c / d</strong></p>
                <p>Frequency spacing: <strong>Δf = c / d</strong></p>
                <p className="mt-1 text-muted-foreground">Note: This is c/d (open acoustic loop with round-trip delay), NOT c/2d (standing wave in closed tube).</p>
              </div>
              <div className="bg-muted p-3 rounded font-mono text-xs space-y-1 mt-2">
                <p className="text-foreground font-semibold">Path Length Estimation</p>
                <p>d = c / Δf = 343 / Δf (meters)</p>
                <p>Valid range: 0.1 m &lt; d &lt; 50 m</p>
              </div>
              <div className="bg-muted p-3 rounded font-mono text-xs space-y-1 mt-2">
                <p className="text-foreground font-semibold">Detection Algorithm</p>
                <p>1. Find all peak pairs → candidate spacings: Δf = (f<sub>j</sub> - f<sub>i</sub>) / k for k ∈ [1,8]</p>
                <p>2. Cluster spacings within ±5% tolerance</p>
                <p>3. Winner = most frequently occurring spacing</p>
                <p>4. Confidence = min(matchingPeaks / totalPeaks, matchingPeaks / 3)</p>
              </div>
              <div className="bg-muted p-3 rounded font-mono text-xs mt-2">
                <p className="text-foreground font-semibold">Prediction</p>
                <p>Once Δf known: f<sub>predicted</sub> = n · Δf for all n where f<sub>predicted</sub> is in analysis range</p>
                <p className="text-muted-foreground">Allows preemptive EQ cuts before feedback becomes audible.</p>
              </div>
            </Section>

            <Section title="Algorithm 5: Inter-Harmonic Ratio (IHR)">
              <p className="mb-1 text-xs italic">Harmonic structure analysis — distinguishes feedback from musical tones</p>
              <div className="bg-muted p-3 rounded font-mono text-xs space-y-1">
                <p className="text-foreground font-semibold">Harmonic vs Inter-Harmonic Energy</p>
                <p>Harmonics: energy at k · f₀ for k = 1, 2, ..., 8</p>
                <p>Inter-harmonics: energy at midpoints (k + 0.5) · f₀</p>
                <p>E<sub>harmonic</sub> = Σ 10<sup>(peak<sub>k</sub> / 10)</sup></p>
                <p>E<sub>inter</sub> = Σ 10<sup>(midpoint<sub>k</sub> / 10)</sup></p>
                <p><strong>IHR = E<sub>inter</sub> / E<sub>harmonic</sub></strong></p>
              </div>
              <div className="bg-muted p-3 rounded font-mono text-xs space-y-1 mt-2">
                <p className="text-foreground font-semibold">Classification</p>
                <p>Feedback (IHR &lt; 0.15): single clean tone, no inter-harmonic energy</p>
                <p>Music (IHR &gt; 0.35): rich harmonics with formant structure + modulation</p>
              </div>
              <div className="bg-muted p-3 rounded font-mono text-xs space-y-1 mt-2">
                <p className="text-foreground font-semibold">Score Scaling (harmonic count dependent)</p>
                <p>1 harmonic: score = max(0, 1 - IHR · 5)</p>
                <p>2 harmonics: score = max(0, 0.7 - IHR · 3)</p>
                <p>3+ harmonics: score = max(0, 0.3 - IHR)</p>
                <p className="mt-1 text-muted-foreground">More harmonics → higher bar for feedback classification (instruments naturally have harmonics).</p>
              </div>
            </Section>

            <Section title="Algorithm 6: Peak-to-Median Ratio (PTMR)">
              <p className="mb-1 text-xs italic">Robust spectral prominence — median resists outlier bias</p>
              <div className="bg-muted p-3 rounded font-mono text-xs space-y-1">
                <p className="text-foreground font-semibold">Why Median, Not Mean?</p>
                <p>Mean is pulled upward by the peak itself → underestimates prominence</p>
                <p>Median is robust to outliers → measures true spectral floor</p>
              </div>
              <div className="bg-muted p-3 rounded font-mono text-xs space-y-1 mt-2">
                <p className="text-foreground font-semibold">Calculation</p>
                <p>Neighborhood: ±halfWidth bins, excluding peak ±2 bins</p>
                <p>Sort neighborhood values → find median</p>
                <p><strong>PTMR = spectrum[peak] - median</strong> (in dB)</p>
              </div>
              <div className="bg-muted p-3 rounded font-mono text-xs space-y-1 mt-2">
                <p className="text-foreground font-semibold">Score Normalization</p>
                <p>feedbackScore = clamp((PTMR - 8) / 15, 0, 1)</p>
                <p className="mt-1">&gt; 20 dB → strong feedback | 15–20 dB → weak | &lt; 8 dB → broadband</p>
                <p className="text-muted-foreground">Normalized to [0,1] over a 15 dB range (8–23 dB).</p>
              </div>
            </Section>

            <Section title="Algorithm 7: Compression Detection">
              <p className="mb-1 text-xs italic">Crest factor + dynamic range — identifies compressed content</p>
              <div className="bg-muted p-3 rounded font-mono text-xs space-y-1">
                <p className="text-foreground font-semibold">Crest Factor (Peak-to-RMS Ratio)</p>
                <p>CF = peak<sub>dB</sub> - RMS<sub>dB</sub></p>
                <p>Uncompressed audio: CF ≈ 12–14 dB (typical speech/music)</p>
                <p>Compressed audio: CF &lt; 6 dB (ratio ~4–8:1)</p>
              </div>
              <div className="bg-muted p-3 rounded font-mono text-xs space-y-1 mt-2">
                <p className="text-foreground font-semibold">Dynamic Range</p>
                <p>DR = max(peak<sub>dB</sub>) - min(RMS<sub>dB</sub>) over analysis window</p>
                <p>Uncompressed: DR &gt; 20 dB | Compressed: DR &lt; 8 dB</p>
              </div>
              <div className="bg-muted p-3 rounded font-mono text-xs space-y-1 mt-2">
                <p className="text-foreground font-semibold">Detection</p>
                <p>isCompressed = (CF &lt; 6) OR (DR &lt; 8)</p>
                <p>Estimated ratio: R = 12 / max(CF, 1)</p>
              </div>
              <div className="bg-muted p-3 rounded font-mono text-xs mt-2">
                <p className="text-foreground font-semibold">Impact on Fusion</p>
                <p>When compressed: MSD weight ↓ (0.30 → 0.12), Phase weight ↑ (0.25 → 0.38)</p>
                <p className="text-muted-foreground">Compressed audio &ldquo;fools&rdquo; MSD (sustained notes look like feedback growth). Phase coherence is amplitude-independent.</p>
              </div>
            </Section>

            <Section title="Fusion Engine — Weighted Voting">
              <div className="bg-muted p-3 rounded font-mono text-xs space-y-1">
                <p className="text-foreground font-semibold">Weighted Probability</p>
                <p>P<sub>feedback</sub> = Σ<sub>i</sub>(w<sub>i</sub> · S<sub>i</sub>) / Σ<sub>i</sub>w<sub>i</sub></p>
                <p className="mt-1 text-muted-foreground">w<sub>i</sub> = weight for algorithm i, S<sub>i</sub> = score ∈ [0,1]</p>
              </div>
              <div className="bg-muted p-3 rounded font-mono text-xs space-y-1 mt-2">
                <p className="text-foreground font-semibold">Agreement (Inter-Algorithm Consensus)</p>
                <p>agreement = 1 - √[ var(S₁, S₂, ..., S₇) ]</p>
                <p className="mt-1 text-muted-foreground">High agreement = algorithms agree → high confidence. Low agreement = disagreement → uncertainty.</p>
              </div>
              <div className="bg-muted p-3 rounded font-mono text-xs space-y-1 mt-2">
                <p className="text-foreground font-semibold">Confidence Calculation</p>
                <p>confidence = agreement · P<sub>feedback</sub> + (1 - agreement) · 0.5</p>
                <p className="mt-1 text-muted-foreground">When algorithms disagree, confidence regresses toward 0.5 (maximum uncertainty).</p>
              </div>
              <div className="bg-muted p-3 rounded font-mono text-xs space-y-1 mt-2">
                <p className="text-foreground font-semibold">Content-Aware Weights (7 algorithms)</p>
                <p>         [MSD,  Phase, Spec, Comb, IHR,  PTMR, Legacy]</p>
                <p>Default: [0.30, 0.25,  0.12, 0.08, 0.08, 0.07, 0.10]</p>
                <p>Speech:  [0.40, 0.20,  0.10, 0.05, 0.05, 0.10, 0.10]</p>
                <p>Music:   [0.15, 0.35,  0.10, 0.08, 0.12, 0.05, 0.15]</p>
                <p>Compr.:  [0.12, 0.38,  0.15, 0.08, 0.10, 0.07, 0.10]</p>
              </div>
              <div className="bg-muted p-3 rounded font-mono text-xs space-y-1 mt-2">
                <p className="text-foreground font-semibold">Verdict Thresholds</p>
                <p>FEEDBACK:     P ≥ 0.65 AND confidence ≥ 0.6</p>
                <p>POSSIBLE:     P ≥ 0.46 AND confidence ≥ 0.4</p>
                <p>NOT_FEEDBACK: P &lt; 0.30 AND confidence ≥ 0.6</p>
                <p>UNCERTAIN:    all other cases</p>
              </div>
              <div className="bg-muted p-3 rounded font-mono text-xs mt-2">
                <p className="text-foreground font-semibold">Comb Pattern Boost (Flaw 6 Fix)</p>
                <p>When comb pattern detected: weight × 2 applied to BOTH numerator AND denominator</p>
                <p className="text-muted-foreground">Ensures P<sub>feedback</sub> stays in [0,1] while boosting comb&apos;s influence on the final vote.</p>
              </div>
            </Section>

            <Section title="Acoustic Physics">
              <div className="bg-muted p-3 rounded font-mono text-xs space-y-1">
                <p className="text-foreground font-semibold">Schroeder Frequency (Hopkins, 2007)</p>
                <p>f<sub>S</sub> = 2000 · √(T<sub>60</sub> / V)</p>
                <p>T<sub>60</sub> = RT60 reverberation time (seconds)</p>
                <p>V = room volume (m³)</p>
                <p className="mt-1">Below f<sub>S</sub>: individual room modes dominate (isolated resonances)</p>
                <p>Above f<sub>S</sub>: diffuse sound field (statistical behavior)</p>
                <p className="mt-1 text-muted-foreground">Example: T₆₀=0.7s, V=250m³ → f<sub>S</sub> = 2000·√(0.0028) = 106 Hz</p>
              </div>
              <div className="bg-muted p-3 rounded font-mono text-xs space-y-1 mt-2">
                <p className="text-foreground font-semibold">Modal Overlap Factor</p>
                <p>M = 1 / Q</p>
                <p>M &lt; 0.03 (Q &gt; 33): Isolated — sharp peak, high feedback risk</p>
                <p>M ≈ 0.1 (Q ≈ 10): Coupled — moderate resonance</p>
                <p>M &gt; 0.33 (Q &lt; 3): Diffuse — broad peak, low feedback risk</p>
              </div>
              <div className="bg-muted p-3 rounded font-mono text-xs space-y-1 mt-2">
                <p className="text-foreground font-semibold">Q Factor Estimation</p>
                <p>Q = f<sub>center</sub> / Δf<sub>-3dB</sub></p>
                <p className="mt-1 text-muted-foreground">Δf<sub>-3dB</sub> = bandwidth where amplitude drops 3 dB below peak. Measured by scanning bins left/right until threshold crossed.</p>
              </div>
              <div className="bg-muted p-3 rounded font-mono text-xs space-y-1 mt-2">
                <p className="text-foreground font-semibold">Room Modes (Axial)</p>
                <p>f = n · c / (2L)</p>
                <p>c = 343 m/s (speed of sound), L = room dimension (m), n = mode number</p>
                <p className="mt-1 text-muted-foreground">Axial modes (1 dimension) are strongest. Tangential (2D) and oblique (3D) modes are progressively weaker.</p>
              </div>
            </Section>

            <Section title="A-Weighting (IEC 61672-1)">
              <p className="mb-2">Emphasizes frequencies where human hearing is most sensitive (2–5 kHz):</p>
              <div className="bg-muted p-3 rounded font-mono text-xs space-y-1">
                <p className="text-foreground font-semibold">Transfer Function</p>
                <p>R<sub>A</sub>(f) = (C₄² · f⁴) / [(f² + C₁²) · √((f² + C₂²)(f² + C₃²)) · (f² + C₄²)]</p>
                <p>A(f) = 20 · log<sub>10</sub>(R<sub>A</sub>(f)) + 2.0 dB</p>
              </div>
              <div className="bg-muted p-3 rounded font-mono text-xs space-y-1 mt-2">
                <p className="text-foreground font-semibold">IEC Coefficients</p>
                <p>C₁ = 20.6 Hz | C₂ = 107.7 Hz | C₃ = 737.9 Hz | C₄ = 12200 Hz</p>
                <p className="mt-1 text-muted-foreground">Offset: +2.0 dB | Floor: -120 dB (clamp near 0 Hz)</p>
              </div>
              <div className="bg-muted p-3 rounded font-mono text-xs mt-2">
                <p className="text-foreground font-semibold">Effect on Detection</p>
                <p>Boosts 2–5 kHz (speech intelligibility zone) by +1 to +3 dB</p>
                <p>Attenuates &lt;100 Hz by -20 dB+ (reduces HVAC rumble / room mode detections)</p>
                <p>Attenuates &gt;10 kHz progressively (reduces ultrasonic noise)</p>
              </div>
            </Section>

            <Section title="Pitch & Frequency Conversion">
              <div className="bg-muted p-3 rounded font-mono text-xs space-y-1">
                <p className="text-foreground font-semibold">MIDI Note Number</p>
                <p>midi = 12 · log₂(f / 440) + 69</p>
                <p>f = 440 · 2<sup>((midi - 69) / 12)</sup></p>
              </div>
              <div className="bg-muted p-3 rounded font-mono text-xs space-y-1 mt-2">
                <p className="text-foreground font-semibold">Cents (Pitch Deviation)</p>
                <p>cents = 1200 · log₂(f₁ / f₂)</p>
                <p>100 cents = 1 semitone | 1200 cents = 1 octave</p>
              </div>
              <div className="bg-muted p-3 rounded font-mono text-xs mt-2">
                <p className="text-foreground font-semibold">Harmonic Series Detection</p>
                <p>Expected: f<sub>k</sub> = k · f₀ for k = 1, 2, ..., 8</p>
                <p>Match tolerance: ±50 cents (configurable 25–100)</p>
                <p className="text-muted-foreground">Sub-harmonics also checked: f₀ = f<sub>detected</sub> / k</p>
              </div>
            </Section>

            <Section title="References">
              <ul className="text-xs space-y-2">
                <li><strong>DAFx-16:</strong> Magnitude Slope Deviation algorithm for acoustic feedback detection. Demonstrates 100% accuracy for speech/classical with 7–13 frame windows. Introduces the &ldquo;Summing MSD&rdquo; method (140× speedup).</li>
                <li><strong>DBX:</strong> Comb filter pattern analysis for feedback suppression. Equation 1: f<sub>n</sub> = n · c / d for open acoustic loop feedback frequencies.</li>
                <li><strong>KU Leuven (2025), arXiv 2512.01466:</strong> Two-channel AFC algorithm with PEM framework. Phase coherence as Nyquist stability proxy.</li>
                <li><strong>Hopkins, C. (2007):</strong> <em>Sound Insulation.</em> Butterworth-Heinemann. Schroeder frequency f<sub>S</sub> = 2000√(T/V), modal density, modal overlap.</li>
                <li><strong>Grandke, T. (1983):</strong> Interpolation algorithms for discrete Fourier transforms of sinusoidal signals. <em>IEEE Trans. Instrum. Meas.</em>, 32(2), 112–116.</li>
                <li><strong>IEC 61672-1:2013:</strong> Electroacoustics — Sound level meters — Part 1: Specifications. A-weighting frequency response curve.</li>
                <li><strong>Nyquist, H. (1932):</strong> Regeneration theory. <em>Bell System Technical Journal</em>, 11(1), 126–147. Stability criterion for feedback systems.</li>
              </ul>
            </Section>
          </TabsContent>

          {/* ═══════════════════════════════════════════════════════════════
              TAB 5: REFERENCE
              ═══════════════════════════════════════════════════════════════ */}
          <TabsContent value="reference" className="mt-4 space-y-4">
            <Section title="Severity Levels">
              <ul className="space-y-2">
                <li><strong className="text-red-500">RUNAWAY:</strong> Active feedback rapidly increasing — address immediately</li>
                <li><strong className="text-orange-500">GROWING:</strong> Feedback building but not yet critical</li>
                <li><strong className="text-yellow-500">RESONANCE:</strong> Stable resonant peak that could become feedback</li>
                <li><strong className="text-purple-500">POSSIBLE RING:</strong> Subtle ring that may need attention</li>
                <li><strong className="text-cyan-500">WHISTLE:</strong> Detected whistle or sibilance</li>
                <li><strong className="text-green-500">INSTRUMENT:</strong> Likely musical content, not feedback</li>
              </ul>
            </Section>

            <Section title="Default Configuration">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <span className="text-muted-foreground">Mode</span><span>Feedback Hunt</span>
                <span className="text-muted-foreground">Frequency range</span><span>200 Hz – 8 kHz</span>
                <span className="text-muted-foreground">FFT size</span><span>8192 (5.86 Hz/bin @ 48 kHz)</span>
                <span className="text-muted-foreground">Smoothing</span><span>50%</span>
                <span className="text-muted-foreground">Feedback threshold</span><span>6 dB</span>
                <span className="text-muted-foreground">Ring threshold</span><span>4 dB</span>
                <span className="text-muted-foreground">Growth rate</span><span>1.5 dB/s</span>
                <span className="text-muted-foreground">Hold time</span><span>3 s</span>
                <span className="text-muted-foreground">Input gain</span><span>+15 dB</span>
                <span className="text-muted-foreground">Confidence threshold</span><span>40%</span>
                <span className="text-muted-foreground">Algorithm mode</span><span>Combined (MSD + Phase)</span>
                <span className="text-muted-foreground">A-weighting</span><span>Enabled</span>
                <span className="text-muted-foreground">Sustain time</span><span>250 ms</span>
                <span className="text-muted-foreground">Clear time</span><span>400 ms</span>
                <span className="text-muted-foreground">Threshold mode</span><span>Hybrid</span>
                <span className="text-muted-foreground">Prominence</span><span>12 dB</span>
                <span className="text-muted-foreground">Max tracks</span><span>64</span>
                <span className="text-muted-foreground">Track timeout</span><span>1000 ms</span>
              </div>
            </Section>

            <Section title="Frequency Bands">
              <div className="space-y-2 text-xs">
                <div>
                  <strong>LOW (20–300 Hz):</strong> Room modes, sub-bass. Prominence ×1.4, Sustain ×1.5, Q threshold ×0.6.
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
            </Section>

            <Section title="GEQ Band Mapping">
              <p className="mb-2 text-xs">Detected frequencies map to nearest ISO 31-band (1/3 octave) center:</p>
              <p className="text-xs font-mono bg-muted p-2 rounded leading-relaxed">
                20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1k, 1.25k, 1.6k, 2k, 2.5k, 3.15k, 4k, 5k, 6.3k, 8k, 10k, 12.5k, 16k, 20k Hz
              </p>
            </Section>

            <Section title="EQ Presets">
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <p className="font-medium text-foreground mb-1">Surgical</p>
                  <p>Default Q: 8 | Runaway Q: 16</p>
                  <p>Max cut: -18 dB | Moderate: -9 dB | Light: -4 dB</p>
                </div>
                <div>
                  <p className="font-medium text-foreground mb-1">Heavy</p>
                  <p>Default Q: 4 | Runaway Q: 8</p>
                  <p>Max cut: -12 dB | Moderate: -6 dB | Light: -3 dB</p>
                </div>
              </div>
            </Section>

            <Section title="Room Presets">
              <div className="space-y-2 text-xs">
                <div>
                  <strong>Small Boardroom:</strong> RT60 0.5s, Volume 80m³, Schroeder 158 Hz.
                  10-20 people, huddle rooms.
                </div>
                <div>
                  <strong>Medium Conference:</strong> RT60 0.7s, Volume 250m³, Schroeder 106 Hz.
                  20-50 people, standard conference/training rooms.
                </div>
                <div>
                  <strong>Large Auditorium:</strong> RT60 1.0s, Volume 1000m³, Schroeder 63 Hz.
                  50-200 people, ballrooms, town halls.
                </div>
              </div>
            </Section>

            <Section title="Browser Requirements">
              <ul className="space-y-2 text-xs">
                <li><strong>Web Audio API + getUserMedia:</strong> Required for real-time audio processing</li>
                <li><strong>Supported:</strong> Chrome 74+, Firefox 76+, Safari 14.1+, Edge 79+</li>
                <li><strong>Sample rate:</strong> System default (typically 44.1 kHz or 48 kHz)</li>
                <li><strong>HTTPS:</strong> Required for microphone access in production</li>
              </ul>
            </Section>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-foreground mb-2">{title}</h3>
      <div className="text-sm text-muted-foreground leading-relaxed">
        {children}
      </div>
    </div>
  )
}
