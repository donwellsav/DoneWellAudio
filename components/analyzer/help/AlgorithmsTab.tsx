'use client'

import { memo } from 'react'
import { HelpSection } from './HelpShared'

export const AlgorithmsTab = memo(function AlgorithmsTab() {
  return (
    <>
      <HelpSection title="7-Algorithm Fusion System">
        <p>
          DoneWell Audio uses 7 detection algorithms from peer-reviewed acoustic research. Each exploits
          a different physical property of feedback vs. musical content. They vote together with
          content-aware weighting for maximum accuracy and minimal false positives.
        </p>
      </HelpSection>

      {/* Group: Detection Algorithms */}
      <div>
        <div className="py-1.5 px-2 section-label panel-groove bg-card/60">Detection Algorithms</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-1.5 pt-3">
        <div className="bg-card/80 rounded border p-3">
          <h3 className="section-label mb-2 text-primary">1. MSD — Magnitude Slope Deviation</h3>
          <div className="space-y-2.5 pt-2">
            <p className="text-sm italic text-muted-foreground">DAFx-16 Paper — Growth pattern analysis</p>
            <p className="text-sm text-muted-foreground">
              Feedback amplitude grows exponentially — linear on a dB scale — so its second derivative is near zero.
              Music has random amplitude variations with high second derivative.
            </p>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li><strong>Low MSD (&lt;0.1):</strong> Consistent growth → likely feedback</li>
              <li><strong>High MSD (&gt;1.0):</strong> Random variation → likely music</li>
              <li><strong>Speech accuracy:</strong> 100% with 7 frames (~160ms)</li>
              <li><strong>Classical music:</strong> 100% with 13 frames (~300ms)</li>
              <li><strong>Rock/compressed:</strong> 22% accuracy at 50 frames — needs compression detection assist</li>
            </ul>
            <p className="text-sm text-muted-foreground">
              Uses an optimized &ldquo;Summing MSD&rdquo; method that is 140× faster than the original algorithm
              with zero per-frame allocations.
            </p>

            <div className="bg-background/80 px-3 py-2 rounded font-mono text-sm border border-border/20 shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] space-y-0.5">
              <p className="text-foreground font-semibold">Physical Basis</p>
              <p>Feedback amplitude: A(t) = A<sub>0</sub> · e<sup>αt</sup></p>
              <p>In dB: L(t) = L<sub>0</sub> + (20α / ln 10) · t</p>
              <p>This is <strong>linear in dB</strong> ⟹ d²L/dt² = 0</p>
              <p className="mt-1 text-muted-foreground">Music amplitude varies randomly ⟹ d²L/dt² ≠ 0</p>
            </div>
            <div className="bg-background/80 px-3 py-2 rounded font-mono text-sm border border-border/20 shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] space-y-0.5">
              <p className="text-foreground font-semibold">Second Derivative (Discrete)</p>
              <p>G&apos;&apos;(k,n) = M(k,n) - 2·M(k,n-1) + M(k,n-2)</p>
              <p className="mt-1 text-muted-foreground">where M(k,n) = magnitude in dB at bin k, frame n</p>
            </div>
            <div className="bg-background/80 px-3 py-2 rounded font-mono text-sm border border-border/20 shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] space-y-0.5">
              <p className="text-foreground font-semibold">MSD Calculation</p>
              <p>MSD(k,m) = √[ Σ<sub>n=2..N-1</sub> |G&apos;&apos;(k,n)|² / (N - 2) ]</p>
              <p className="mt-1">Threshold: MSD &lt; <strong>0.1 dB²/frame²</strong> → feedback</p>
              <p className="text-muted-foreground">(Paper threshold: 1.0 for 14-frame window → normalized ≈ 0.071, adjusted to 0.1 for robustness)</p>
            </div>
            <div className="bg-background/80 px-3 py-2 rounded font-mono text-sm border border-border/20 shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] space-y-0.5">
              <p className="text-foreground font-semibold">Summing Method (140× Faster)</p>
              <p>Running accumulator: sumG2 += |G&apos;&apos;|² on each new frame</p>
              <p>On ring buffer wrap: sumG2 -= |oldest G&apos;&apos;|²</p>
              <p>MSD = √(sumG2 / (frameCount - 2))</p>
              <p className="mt-1 text-muted-foreground">Zero per-frame allocation. O(1) per bin per frame.</p>
            </div>
            <div className="bg-background/80 px-3 py-2 rounded font-mono text-sm border border-border/20 shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] space-y-0.5">
              <p className="text-foreground font-semibold">Fast Confirmation</p>
              <p>If MSD &lt; 0.15 for 3 consecutive frames → instant feedback flag</p>
              <p className="mt-1 text-muted-foreground">Bypasses full-window requirement for obvious feedback.</p>
            </div>
            <div className="bg-background/80 px-3 py-2 rounded font-mono text-sm border border-border/20 shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]">
              <p className="text-foreground font-semibold">Required Frames for 100% Accuracy</p>
              <p>Speech: 7 frames (~160 ms) · Classical: 13 frames (~300 ms)</p>
              <p>Rock/compressed: 50 frames (~1.1 s) at 22% accuracy — use compression detection</p>
            </div>
          </div>
        </div>

        <div className="bg-card/80 rounded border p-3">
          <h3 className="section-label mb-2 text-primary">2. Phase Coherence Analysis</h3>
          <div className="space-y-2.5 pt-2">
            <p className="text-sm italic text-muted-foreground">KU Leuven 2025 / Nyquist stability theory</p>
            <p className="text-sm text-muted-foreground">
              True feedback maintains constant phase relationships because it&apos;s a regenerative loop at a fixed frequency.
              Music and noise have random phase variations frame-to-frame.
            </p>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li><strong>High coherence (≥0.85):</strong> Phase-locked → likely feedback</li>
              <li><strong>Medium (0.65–0.85):</strong> Uncertain</li>
              <li><strong>Low (&lt;0.4):</strong> Random phase → likely music/noise</li>
            </ul>
            <p className="text-sm text-muted-foreground">
              Compression-resistant: detects phase patterns regardless of amplitude compression.
            </p>

            <div className="bg-background/80 px-3 py-2 rounded font-mono text-sm border border-border/20 shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] space-y-0.5">
              <p className="text-foreground font-semibold">Nyquist Stability Criterion</p>
              <p>Feedback occurs when both conditions are met simultaneously:</p>
              <p>1. Magnitude: |G(ω) · F(ω)| &gt; 1 (loop gain exceeds unity)</p>
              <p>2. Phase: ∠[G(ω) · F(ω)] = n · 2π (constructive interference)</p>
              <p className="mt-1 text-muted-foreground">G(ω) = acoustic path transfer function, F(ω) = electrical path (PA system)</p>
            </div>
            <div className="bg-background/80 px-3 py-2 rounded font-mono text-sm border border-border/20 shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] space-y-0.5">
              <p className="text-foreground font-semibold">Phase Difference</p>
              <p>Δφ(k,n) = φ(k,n) - φ(k,n-1)</p>
              <p>Wrapped to [-π, π] for continuity</p>
            </div>
            <div className="bg-background/80 px-3 py-2 rounded font-mono text-sm border border-border/20 shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] space-y-0.5">
              <p className="text-foreground font-semibold">Phasor Average (Coherence Measure)</p>
              <p>C(k) = | 1/N · Σ<sub>n</sub> exp(j · Δφ(k,n)) |</p>
              <p className="mt-1">Expanded into real/imaginary parts (avoids complex arithmetic):</p>
              <p>realSum = Σ cos(Δφ<sub>n</sub>) / N</p>
              <p>imagSum = Σ sin(Δφ<sub>n</sub>) / N</p>
              <p>C = √(realSum² + imagSum²)</p>
            </div>
            <div className="bg-background/80 px-3 py-2 rounded font-mono text-sm border border-border/20 shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] space-y-0.5">
              <p className="text-foreground font-semibold">Physical Intuition</p>
              <p>Pure tone → constant phase advance per frame → all phasors align → C ≈ 1</p>
              <p>Random signal → random phase walk → phasors cancel → C ≈ 0</p>
            </div>
            <div className="bg-background/80 px-3 py-2 rounded font-mono text-sm border border-border/20 shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]">
              <p>Thresholds: C ≥ 0.85 → feedback | 0.65–0.85 → uncertain | &lt; 0.4 → music</p>
              <p>Min samples: 5 frames | Buffer: 10 frames per bin</p>
            </div>
          </div>
        </div>

        <div className="bg-card/80 rounded border p-3">
          <h3 className="section-label mb-2 text-primary">3. Spectral Flatness / Compression</h3>
          <div className="space-y-2.5 pt-2">
            <p className="text-sm italic text-muted-foreground">Wiener entropy — Tone vs. broadband discrimination</p>
            <p className="text-sm text-muted-foreground">
              Measures how tone-like (feedback) vs. noise-like (music) the spectrum is around a peak.
              Kurtosis measures amplitude distribution peakiness.
            </p>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li><strong>Flatness &lt;0.05:</strong> Pure tone (single frequency = feedback)</li>
              <li><strong>Flatness &gt;0.15:</strong> Broadband (music/speech)</li>
              <li><strong>Kurtosis &gt;10:</strong> Strongly peaked distribution (feedback)</li>
              <li><strong>Combined score:</strong> 60% flatness + 40% kurtosis</li>
            </ul>

            <div className="bg-background/80 px-3 py-2 rounded font-mono text-sm border border-border/20 shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] space-y-0.5">
              <p className="text-foreground font-semibold">Spectral Flatness (Wiener Entropy)</p>
              <p>Convert to linear power: P<sub>k</sub> = 10<sup>(spectrum<sub>k</sub>/10)</sup></p>
              <p>Geometric mean: G = exp[ 1/N · Σ<sub>k</sub> ln(P<sub>k</sub>) ]</p>
              <p>Arithmetic mean: A = 1/N · Σ<sub>k</sub> P<sub>k</sub></p>
              <p>SF = G / A ∈ [0, 1]</p>
              <p className="mt-1">SF = 0 → pure tone (all energy in one bin)</p>
              <p>SF = 1 → white noise (equal energy everywhere)</p>
            </div>
            <div className="bg-background/80 px-3 py-2 rounded font-mono text-sm border border-border/20 shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] space-y-0.5">
              <p className="text-foreground font-semibold">Excess Kurtosis</p>
              <p>μ = 1/N · Σ x<sub>i</sub> (mean)</p>
              <p>σ² = 1/N · Σ (x<sub>i</sub> - μ)² (variance)</p>
              <p>μ₄ = 1/N · Σ (x<sub>i</sub> - μ)⁴ (4th central moment)</p>
              <p>K<sub>excess</sub> = μ₄ / σ⁴ - 3</p>
              <p className="mt-1">K = 0 → Gaussian (noise) | K &gt; 10 → strongly peaked (feedback)</p>
            </div>
            <div className="bg-background/80 px-3 py-2 rounded font-mono text-sm border border-border/20 shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]">
              <p className="text-foreground font-semibold">Combined Score</p>
              <p>S = 0.6 · flatnessScore + 0.4 · kurtosisScore</p>
              <p>Analysis bandwidth: ±10 bins around peak</p>
            </div>
            <div className="bg-background/80 px-3 py-2 rounded font-mono text-sm border border-border/20 shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] space-y-0.5">
              <p className="text-foreground font-semibold">Compression Detection</p>
              <p>Crest Factor: CF = peak_dB - RMS_dB</p>
              <p>Uncompressed: CF = 12-14 dB | Compressed: CF &lt; 6 dB</p>
              <p>Dynamic Range: DR = max(peak_dB) - min(RMS_dB)</p>
              <p>When compressed: MSD weight drops, Phase weight increases automatically</p>
            </div>
          </div>
        </div>

        <div className="bg-card/80 rounded border p-3">
          <h3 className="section-label mb-2 text-primary">4. Comb Filter Pattern Detection</h3>
          <div className="space-y-2.5 pt-2">
            <p className="text-sm italic text-muted-foreground">DBX Paper — Acoustic path geometry</p>
            <p className="text-sm text-muted-foreground">
              A single acoustic feedback path creates peaks at regularly spaced frequencies
              determined by the round-trip delay. Finding this pattern identifies the feedback loop
              and predicts where future feedback will occur.
            </p>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li><strong>Formula:</strong> f<sub>n</sub> = n · c / d (where c = 343 m/s, d = path length)</li>
              <li><strong>Spacing:</strong> Δf = c / d (constant between all peaks)</li>
              <li><strong>Detection:</strong> Finds common spacing (GCD) between 3+ peaks within ±5% tolerance</li>
              <li><strong>Prediction:</strong> Calculates future feedback frequencies before they become audible</li>
            </ul>

            <div className="bg-background/80 px-3 py-2 rounded font-mono text-sm border border-border/20 shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] space-y-0.5">
              <p className="text-foreground font-semibold">Physical Derivation</p>
              <p>Acoustic path delay: τ = d / c (seconds)</p>
              <p>Constructive interference at: f<sub>n</sub> = n / τ = <strong>n · c / d</strong></p>
              <p>Frequency spacing: <strong>Δf = c / d</strong></p>
              <p className="mt-1 text-muted-foreground">Note: This is c/d (open acoustic loop with round-trip delay), NOT c/2d (standing wave in closed tube).</p>
            </div>
            <div className="bg-background/80 px-3 py-2 rounded font-mono text-sm border border-border/20 shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] space-y-0.5">
              <p className="text-foreground font-semibold">Path Length Estimation</p>
              <p>d = c / Δf = 343 / Δf (meters)</p>
              <p>Valid range: 0.1 m &lt; d &lt; 50 m</p>
            </div>
            <div className="bg-background/80 px-3 py-2 rounded font-mono text-sm border border-border/20 shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] space-y-0.5">
              <p className="text-foreground font-semibold">Detection Algorithm</p>
              <p>1. Find all peak pairs → candidate spacings: Δf = (f<sub>j</sub> - f<sub>i</sub>) / k for k ∈ [1,8]</p>
              <p>2. Cluster spacings within ±5% tolerance</p>
              <p>3. Winner = most frequently occurring spacing</p>
              <p>4. Confidence = min(matchingPeaks / totalPeaks, matchingPeaks / 3)</p>
            </div>
            <div className="bg-background/80 px-3 py-2 rounded font-mono text-sm border border-border/20 shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]">
              <p className="text-foreground font-semibold">Prediction</p>
              <p>Once Δf known: f<sub>predicted</sub> = n · Δf for all n where f<sub>predicted</sub> is in analysis range</p>
              <p className="text-muted-foreground">Allows preemptive EQ cuts before feedback becomes audible.</p>
            </div>
          </div>
        </div>

        <div className="bg-card/80 rounded border p-3">
          <h3 className="section-label mb-2 text-primary">5. Inter-Harmonic Ratio (IHR)</h3>
          <div className="space-y-2.5 pt-2">
            <p className="text-sm italic text-muted-foreground">Harmonic vs. inter-harmonic energy analysis</p>
            <p className="text-sm text-muted-foreground">
              Compares energy at harmonic positions (k·f₀) to energy at midpoints between harmonics.
              Feedback produces clean harmonics with no inter-harmonic energy. Musical instruments
              have rich inter-harmonic content from formants and modulation.
            </p>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li><strong>IHR &lt;0.15:</strong> Clean tone → likely feedback</li>
              <li><strong>IHR &gt;0.35:</strong> Rich harmonics → likely music</li>
              <li><strong>Checks harmonics:</strong> Up to 8th overtone</li>
            </ul>

            <div className="bg-background/80 px-3 py-2 rounded font-mono text-sm border border-border/20 shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] space-y-0.5">
              <p className="text-foreground font-semibold">Harmonic vs Inter-Harmonic Energy</p>
              <p>Harmonics: energy at k · f₀ for k = 1, 2, ..., 8</p>
              <p>Inter-harmonics: energy at midpoints (k + 0.5) · f₀</p>
              <p>E<sub>harmonic</sub> = Σ 10<sup>(peak<sub>k</sub> / 10)</sup></p>
              <p>E<sub>inter</sub> = Σ 10<sup>(midpoint<sub>k</sub> / 10)</sup></p>
              <p><strong>IHR = E<sub>inter</sub> / E<sub>harmonic</sub></strong></p>
            </div>
            <div className="bg-background/80 px-3 py-2 rounded font-mono text-sm border border-border/20 shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] space-y-0.5">
              <p className="text-foreground font-semibold">Classification</p>
              <p>Feedback (IHR &lt; 0.15): single clean tone, no inter-harmonic energy</p>
              <p>Music (IHR &gt; 0.35): rich harmonics with formant structure + modulation</p>
            </div>
            <div className="bg-background/80 px-3 py-2 rounded font-mono text-sm border border-border/20 shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] space-y-0.5">
              <p className="text-foreground font-semibold">Score Scaling (harmonic count dependent)</p>
              <p>1 harmonic: score = max(0, 1 - IHR · 5)</p>
              <p>2 harmonics: score = max(0, 0.7 - IHR · 3)</p>
              <p>3+ harmonics: score = max(0, 0.3 - IHR)</p>
              <p className="mt-1 text-muted-foreground">More harmonics → higher bar for feedback classification (instruments naturally have harmonics).</p>
            </div>
          </div>
        </div>

        <div className="bg-card/80 rounded border p-3">
          <h3 className="section-label mb-2 text-primary">6. Peak-to-Median Ratio (PTMR)</h3>
          <div className="space-y-2.5 pt-2">
            <p className="text-sm italic text-muted-foreground">Spectral prominence measurement</p>
            <p className="text-sm text-muted-foreground">
              Measures how much a peak stands above the local spectral floor using the median
              (not mean — mean is biased upward by the peak itself). Sharp narrow peaks = feedback.
            </p>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li><strong>PTMR &gt;20 dB:</strong> Sharp narrow peak → strong feedback indicator</li>
              <li><strong>PTMR 15–20 dB:</strong> Moderate prominence → possible feedback</li>
              <li><strong>PTMR &lt;8 dB:</strong> Broad peak → broadband content (music/noise)</li>
            </ul>

            <div className="bg-background/80 px-3 py-2 rounded font-mono text-sm border border-border/20 shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] space-y-0.5">
              <p className="text-foreground font-semibold">Why Median, Not Mean?</p>
              <p>Mean is pulled upward by the peak itself → underestimates prominence</p>
              <p>Median is robust to outliers → measures true spectral floor</p>
            </div>
            <div className="bg-background/80 px-3 py-2 rounded font-mono text-sm border border-border/20 shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] space-y-0.5">
              <p className="text-foreground font-semibold">Calculation</p>
              <p>Neighborhood: ±halfWidth bins, excluding peak ±2 bins</p>
              <p>Sort neighborhood values → find median</p>
              <p><strong>PTMR = spectrum[peak] - median</strong> (in dB)</p>
            </div>
            <div className="bg-background/80 px-3 py-2 rounded font-mono text-sm border border-border/20 shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] space-y-0.5">
              <p className="text-foreground font-semibold">Score Normalization</p>
              <p>feedbackScore = clamp((PTMR - 8) / 15, 0, 1)</p>
              <p className="mt-1">&gt; 20 dB → strong feedback | 15–20 dB → weak | &lt; 8 dB → broadband</p>
              <p className="text-muted-foreground">Normalized to [0,1] over a 15 dB range (8–23 dB).</p>
            </div>
          </div>
        </div>

        </div>
      </div>

      {/* Group: Fusion & Analysis */}
      <div>
        <div className="py-1.5 px-2 section-label panel-groove bg-card/60">Fusion & Analysis</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-3">
        <div className="bg-card/80 rounded border p-3">
          <h3 className="section-label mb-2 text-primary">Fusion Engine — Weighted Voting</h3>
          <div className="space-y-2.5 pt-2">
            <p className="text-sm text-muted-foreground">
              All 6 algorithms vote together with content-aware weighting. The system automatically
              detects content type (speech, music, compressed) and applies appropriate weights:
            </p>
            <div className="bg-background/80 p-3 rounded text-sm font-mono space-y-1 border border-border/20 shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]">
              <p className="font-semibold text-foreground">Weights: [MSD, Phase, Spectral, Comb, IHR, PTMR]</p>
              <p>Speech:     [0.33, 0.24, 0.10, 0.05, 0.10, 0.18]</p>
              <p>Music:      [0.08, 0.35, 0.10, 0.08, 0.24, 0.15]</p>
              <p>Compressed: [0.12, 0.30, 0.18, 0.08, 0.18, 0.14]</p>
              <p>Default:    [0.30, 0.25, 0.12, 0.08, 0.13, 0.12]</p>
            </div>

            <div className="bg-background/80 px-3 py-2 rounded font-mono text-sm border border-border/20 shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] space-y-0.5">
              <p className="text-foreground font-semibold">Weighted Probability</p>
              <p>P<sub>feedback</sub> = Σ<sub>i</sub>(w<sub>i</sub> · S<sub>i</sub>) / Σ<sub>i</sub>w<sub>i</sub></p>
              <p className="mt-1 text-muted-foreground">w<sub>i</sub> = weight for algorithm i, S<sub>i</sub> = score ∈ [0,1]</p>
            </div>
            <div className="bg-background/80 px-3 py-2 rounded font-mono text-sm border border-border/20 shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] space-y-0.5">
              <p className="text-foreground font-semibold">Agreement (Inter-Algorithm Consensus)</p>
              <p>agreement = 1 - √[ var(S₁, S₂, ..., S₆) ]</p>
              <p className="mt-1 text-muted-foreground">High agreement = algorithms agree → high confidence. Low agreement = disagreement → uncertainty.</p>
            </div>
            <div className="bg-background/80 px-3 py-2 rounded font-mono text-sm border border-border/20 shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] space-y-0.5">
              <p className="text-foreground font-semibold">Confidence Calculation</p>
              <p>confidence = P<sub>feedback</sub> · (0.5 + 0.5 · agreement) + persistenceBonus</p>
              <p className="mt-1 text-muted-foreground">High agreement amplifies confidence toward P<sub>feedback</sub>. Low agreement halves it. Persistence bonus rewards sustained detections.</p>
            </div>
            <div className="bg-background/80 px-3 py-2 rounded font-mono text-sm border border-border/20 shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] space-y-0.5">
              <p className="text-foreground font-semibold">Verdict Thresholds</p>
              <p>FEEDBACK:     P ≥ T AND confidence ≥ 0.6</p>
              <p>POSSIBLE:     P ≥ 0.7·T AND confidence ≥ 0.4</p>
              <p>NOT_FEEDBACK: P &lt; 0.30 AND confidence ≥ 0.6</p>
              <p>UNCERTAIN:    all other cases</p>
              <p className="mt-1 text-muted-foreground">T = feedbackThreshold (default 0.60, configurable per mode)</p>
            </div>
            <div className="bg-background/80 px-3 py-2 rounded font-mono text-sm border border-border/20 shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]">
              <p className="text-foreground font-semibold">Comb Pattern Boost (Flaw 6 Fix)</p>
              <p>When comb pattern detected: weight × 2 applied to BOTH numerator AND denominator</p>
              <p className="text-muted-foreground">Ensures P<sub>feedback</sub> stays in [0,1] while boosting comb&apos;s influence on the final vote.</p>
            </div>
          </div>
        </div>

        <div className="bg-card/80 rounded border p-3">
          <h3 className="section-label mb-2 text-primary">Acoustic Physics & References</h3>
          <div className="space-y-2.5 pt-2">
            <div className="bg-background/80 px-3 py-2 rounded font-mono text-sm border border-border/20 shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] space-y-0.5">
              <p className="text-foreground font-semibold">FFT Resolution</p>
              <p>Δf = f<sub>s</sub> / N</p>
              <p>At 8192pt @ 48 kHz: Δf = 48000 / 8192 = <strong>5.86 Hz/bin</strong></p>
              <p>Bin to Hz: f = k · (f<sub>s</sub> / N)</p>
            </div>
            <div className="bg-background/80 px-3 py-2 rounded font-mono text-sm border border-border/20 shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] space-y-0.5">
              <p className="text-foreground font-semibold">Quadratic Peak Interpolation (Grandke, 1983)</p>
              <p>Given 3 adjacent bins: α = y[k-1], β = y[k], γ = y[k+1]</p>
              <p>δ = 0.5 · (α - γ) / (α - 2β + γ)</p>
              <p>f<sub>true</sub> = (k + δ) · Δf</p>
              <p>A<sub>true</sub> = β - 0.25 · (α - γ) · δ</p>
              <p className="mt-1 text-muted-foreground">Refines peak frequency beyond bin resolution by fitting a parabola through the 3 highest points.</p>
            </div>
            <div className="bg-background/80 px-3 py-2 rounded font-mono text-sm border border-border/20 shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] space-y-0.5">
              <p className="text-foreground font-semibold">dB Conversions</p>
              <p>Power: L = 10 · log<sub>10</sub>(P), P = 10<sup>(L/10)</sup></p>
              <p>Amplitude: L = 20 · log<sub>10</sub>(A), A = 10<sup>(L/20)</sup></p>
            </div>

            <div className="bg-background/80 px-3 py-2 rounded font-mono text-sm border border-border/20 shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] space-y-0.5">
              <p className="text-foreground font-semibold">Schroeder Frequency (Hopkins, 2007)</p>
              <p>f<sub>S</sub> = 2000 · √(T<sub>60</sub> / V)</p>
              <p>T<sub>60</sub> = RT60 reverberation time (seconds)</p>
              <p>V = room volume (m³)</p>
              <p className="mt-1">Below f<sub>S</sub>: individual room modes dominate (isolated resonances)</p>
              <p>Above f<sub>S</sub>: diffuse sound field (statistical behavior)</p>
              <p className="mt-1 text-muted-foreground">Example: T₆₀=0.7s, V=250m³ → f<sub>S</sub> = 2000·√(0.0028) = 106 Hz</p>
            </div>
            <div className="bg-background/80 px-3 py-2 rounded font-mono text-sm border border-border/20 shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] space-y-0.5">
              <p className="text-foreground font-semibold">Modal Overlap Factor</p>
              <p>M = 1 / Q</p>
              <p>M &lt; 0.03 (Q &gt; 33): Isolated — sharp peak, high feedback risk</p>
              <p>M ≈ 0.1 (Q ≈ 10): Coupled — moderate resonance</p>
              <p>M &gt; 0.33 (Q &lt; 3): Diffuse — broad peak, low feedback risk</p>
            </div>
            <div className="bg-background/80 px-3 py-2 rounded font-mono text-sm border border-border/20 shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] space-y-0.5">
              <p className="text-foreground font-semibold">Q Factor Estimation</p>
              <p>Q = f<sub>center</sub> / Δf<sub>-3dB</sub></p>
              <p className="mt-1 text-muted-foreground">Δf<sub>-3dB</sub> = bandwidth where amplitude drops 3 dB below peak. Measured by scanning bins left/right until threshold crossed.</p>
            </div>
            <div className="bg-background/80 px-3 py-2 rounded font-mono text-sm border border-border/20 shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] space-y-0.5">
              <p className="text-foreground font-semibold">Room Modes (Axial)</p>
              <p>f = n · c / (2L)</p>
              <p>c = 343 m/s (speed of sound), L = room dimension (m), n = mode number</p>
              <p className="mt-1 text-muted-foreground">Axial modes (1 dimension) are strongest. Tangential (2D) and oblique (3D) modes are progressively weaker.</p>
            </div>

            <div className="bg-background/80 px-3 py-2 rounded font-mono text-sm border border-border/20 shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] space-y-0.5">
              <p className="text-foreground font-semibold">A-Weighting (IEC 61672-1)</p>
              <p>R<sub>A</sub>(f) = (C₄² · f⁴) / [(f² + C₁²) · √((f² + C₂²)(f² + C₃²)) · (f² + C₄²)]</p>
              <p>A(f) = 20 · log<sub>10</sub>(R<sub>A</sub>(f)) + 2.0 dB</p>
              <p className="mt-1">C₁ = 20.6 Hz | C₂ = 107.7 Hz | C₃ = 737.9 Hz | C₄ = 12200 Hz</p>
              <p className="text-muted-foreground">Offset: +2.0 dB | Floor: -120 dB (clamp near 0 Hz)</p>
              <p className="mt-1">Boosts 2–5 kHz (speech intelligibility zone) by +1 to +3 dB</p>
              <p>Attenuates &lt;100 Hz by -20 dB+ (reduces HVAC rumble / room mode detections)</p>
              <p>Attenuates &gt;10 kHz progressively (reduces ultrasonic noise)</p>
            </div>

            <div className="bg-background/80 px-3 py-2 rounded font-mono text-sm border border-border/20 shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] space-y-0.5">
              <p className="text-foreground font-semibold">Measurement Mic Calibration Compensation</p>
              <p>Supported profiles: Behringer ECM8000, dbx RTA-M, Smartphone MEMS (select in Calibrate tab)</p>
              <p className="mt-1 text-foreground font-medium">ECM8000 (CSL calibration #746)</p>
              <p>38-point 1/3-octave curve | Max deviation: +4.7 dB @ 16 kHz</p>
              <p className="mt-1 text-foreground font-medium">dbx RTA-M (digitized from cut sheet)</p>
              <p>31-point curve | Max deviation: ±1.5 dB (near-flat response mic)</p>
              <p className="mt-1 text-foreground font-medium">Smartphone (Generic MEMS)</p>
              <p>31-point curve | Compensates −12 dB LF roll-off + 3.8 dB presence peak (8–10 kHz)</p>
              <p className="mt-1">Compensation: negate the curve → flatten mic response → true SPL</p>
              <p className="text-muted-foreground">Applied in DSP hot loop alongside A-weighting. Both offsets stack additively per FFT bin.</p>
              <p className="text-muted-foreground">Calibration export v1.1 includes per-event flags and the full curve for reversal.</p>
            </div>

            <div className="bg-background/80 px-3 py-2 rounded font-mono text-sm border border-border/20 shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] space-y-0.5">
              <p className="text-foreground font-semibold">MIDI Note Number</p>
              <p>midi = 12 · log₂(f / 440) + 69</p>
              <p>f = 440 · 2<sup>((midi - 69) / 12)</sup></p>
            </div>
            <div className="bg-background/80 px-3 py-2 rounded font-mono text-sm border border-border/20 shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] space-y-0.5">
              <p className="text-foreground font-semibold">Cents (Pitch Deviation)</p>
              <p>cents = 1200 · log₂(f₁ / f₂)</p>
              <p>100 cents = 1 semitone | 1200 cents = 1 octave</p>
            </div>
            <div className="bg-background/80 px-3 py-2 rounded font-mono text-sm border border-border/20 shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]">
              <p className="text-foreground font-semibold">Harmonic Series Detection</p>
              <p>Expected: f<sub>k</sub> = k · f₀ for k = 1, 2, ..., 8</p>
              <p>Match tolerance: ±200 cents (configurable 25–400)</p>
              <p className="text-muted-foreground">Sub-harmonics also checked: f₀ = f<sub>detected</sub> / k</p>
            </div>

            <div className="mt-3 pt-2 panel-groove">
              <p className="section-label mb-2">References</p>
              <ul className="text-sm space-y-2 text-muted-foreground">
                <li><strong>DAFx-16:</strong> Magnitude Slope Deviation algorithm for acoustic feedback detection. Demonstrates 100% accuracy for speech/classical with 7–13 frame windows. Introduces the &ldquo;Summing MSD&rdquo; method (140× speedup).</li>
                <li><strong>DBX:</strong> Comb filter pattern analysis for feedback suppression. Equation 1: f<sub>n</sub> = n · c / d for open acoustic loop feedback frequencies.</li>
                <li><strong>KU Leuven (2025), arXiv 2512.01466:</strong> Two-channel AFC algorithm with PEM framework. Phase coherence as Nyquist stability proxy.</li>
                <li><strong>Hopkins, C. (2007):</strong> <em>Sound Insulation.</em> Butterworth-Heinemann. Schroeder frequency f<sub>S</sub> = 2000√(T/V), modal density, modal overlap.</li>
                <li><strong>Grandke, T. (1983):</strong> Interpolation algorithms for discrete Fourier transforms of sinusoidal signals. <em>IEEE Trans. Instrum. Meas.</em>, 32(2), 112–116.</li>
                <li><strong>IEC 61672-1:2013:</strong> Electroacoustics — Sound level meters — Part 1: Specifications. A-weighting frequency response curve.</li>
                <li><strong>Nyquist, H. (1932):</strong> Regeneration theory. <em>Bell System Technical Journal</em>, 11(1), 126–147. Stability criterion for feedback systems.</li>
                <li><strong>Everest, F.A.:</strong> <em>Master Handbook of Acoustics.</em> Reverberation time effects on feedback, room mode behavior, and standing wave patterns.</li>
              </ul>
            </div>
          </div>
        </div>
        </div>
      </div>

      {/* Full-width: Score Reference */}
      <HelpSection title="Understanding Algorithm Scores">
        <ul className="space-y-2">
          <li><strong>MSD HIGH:</strong> Second derivative near zero — strong feedback indicator (consistent growth)</li>
          <li><strong>Phase LOCKED:</strong> Consistent phase relationship — strong feedback indicator (regenerative loop)</li>
          <li><strong>Spectral PURE:</strong> Very low flatness — single tone present (near-zero entropy)</li>
          <li><strong>Comb PATTERN:</strong> Regular frequency spacing — feedback loop geometry identified</li>
          <li><strong>IHR LOW:</strong> Clean harmonics with no inter-harmonic energy — feedback</li>
          <li><strong>PTMR HIGH:</strong> Peak stands far above spectral floor — narrow isolated tone</li>
          <li><strong>COMPRESSED:</strong> Dynamic compression detected — phase coherence becomes primary</li>
        </ul>
      </HelpSection>
    </>
  )
})
