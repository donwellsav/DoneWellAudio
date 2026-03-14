# Kill The Ring — Rebuild Manual

> **Purpose:** A complete prompt manual to rebuild Kill The Ring from scratch using AI assistants. Three independent phases, each self-contained.
> **Version:** 1.0 | **Date:** 2026-03-14

---

## Table of Contents

- [Phase A: Blank Slate](#phase-a-blank-slate) — Rebuild from zero, every decision explained
- [Phase B: Architecture-Preserving](#phase-b-architecture-preserving) — Keep the proven architecture, regenerate all code
- [Phase C: Module-by-Module](#phase-c-module-by-module) — Replace/upgrade individual modules independently

---

# Phase A: Blank Slate

> **Purpose:** Rebuild Kill The Ring from first principles. No assumed knowledge. Every architectural decision explained.
> **Total prompts:** 15 | **Estimated time:** 2-3 days with AI assistance
> **Best workflow:** Claude Code (Opus 4.6) for architecture → Gemini Ultra for DSP → Codex for integration

---

### A-01: Project Scaffold

**AI:** Claude Code (Opus 4.6)
**Purpose:** Create the project foundation

```
Create a new Next.js 16 project called "killthering" for a real-time acoustic feedback detection PWA.

Requirements:
1. Next.js 16 with App Router (NOT Pages Router)
2. TypeScript 5.7+ with strict mode enabled in tsconfig.json
3. pnpm as package manager
4. Tailwind CSS v4 with postcss config
5. shadcn/ui (New York style, neutral base color) — run the init command
6. Vitest with V8 coverage provider
7. ESLint flat config (eslint.config.mjs) with:
   - eslint-config-next (core-web-vitals + typescript)
   - @typescript-eslint/no-explicit-any: 'error'
   - no-console: 'warn'
   - prefer-const: 'error'

Project structure:
app/                  — Next.js App Router pages
components/
  kill-the-ring/      — Domain components
  ui/                 — shadcn/ui primitives
contexts/             — React context providers
hooks/                — Custom React hooks
lib/
  audio/              — Audio engine factory
  canvas/             — Canvas drawing helpers
  dsp/                — DSP engine modules
  export/             — File export (PDF, TXT)
  storage/            — Typed localStorage
  utils/              — Math helpers
types/                — TypeScript interfaces
tests/dsp/            — Integration tests

Set up path alias @/* → project root in tsconfig.json.

In package.json, add scripts:
- dev: next dev
- build: next build --webpack
- start: next start
- lint: eslint .
- test: vitest run
- test:watch: vitest
- test:coverage: vitest run --coverage

Create a basic app/layout.tsx with metadata (title: "Kill The Ring", description: "Real-time acoustic feedback detection").
Create app/page.tsx that renders a placeholder <h1>Kill The Ring</h1>.

Verify: pnpm dev starts without errors, pnpm lint passes, pnpm test runs (0 tests).
```

---

### A-02: Type System

**AI:** Claude Code (Opus 4.6)
**Purpose:** Define the complete type system before writing any implementation

```
Create the type system for Kill The Ring in three files.

1. `types/advisory.ts` — Core DSP and detection types:
   - Algorithm = 'msd' | 'phase' | 'spectral' | 'comb' | 'ihr' | 'ptmr'
   - AlgorithmMode = 'auto' | 'custom' | 'msd' | 'phase' | 'combined' | 'all'
   - ContentType = 'speech' | 'music' | 'compressed' | 'unknown'
   - OperationMode = 'speech' | 'worship' | 'liveMusic' | 'theater' | 'monitors' | 'ringOut' | 'broadcast' | 'outdoor'
   - ThresholdMode = 'absolute' | 'relative' | 'hybrid'
   - SeverityLevel = 'RUNAWAY' | 'GROWING' | 'RESONANCE' | 'POSSIBLE_RING' | 'WHISTLE' | 'INSTRUMENT'
   - IssueLabel = 'ACOUSTIC_FEEDBACK' | 'WHISTLE' | 'INSTRUMENT' | 'POSSIBLE_RING'
   - Preset = 'surgical' | 'heavy'

   Interfaces:
   - AnalysisConfig (fftSize, minHz, maxHz, analysisIntervalMs, thresholdMode, thresholdDb, prominenceDb, noiseFloorEnabled, autoGainEnabled, etc.)
   - DetectedPeak (binIndex, trueFrequencyHz, trueAmplitudeDb, prominenceDb, msd?, persistenceFrames?, qEstimate?, phpr?)
   - TrackFeatures (stabilityCentsStd, harmonicityScore, modulationScore, noiseSidebandScore, persistenceMs)
   - Track (id, frequency, amplitude, features, qEstimate, velocityDbPerSec, history[])
   - TrackedPeak (similar to Track, used for worker→main communication)
   - Advisory (id, frequencyHz, severity, issueLabel, eq: EQAdvisory, pitch: PitchInfo, confidence)
   - EQAdvisory (geq: GEQRecommendation, peq: PEQRecommendation, shelf?: ShelfRecommendation)
   - GEQRecommendation (band: number, label: string)
   - PEQRecommendation (frequency: number, gain: number, q: number, type: PEQType)
   - PitchInfo (note: string, octave: number, cents: number, formatted: string)
   - DetectorSettings (extends AnalysisConfig with algorithm mode, operation mode, etc.)
   - DEFAULT_CONFIG constant with sensible defaults

2. `types/calibration.ts` — Room profile and calibration:
   - RoomProfile (name, dimensions, floor/wall/ceiling materials, mic types)
   - AmbientCapture (spectrum, noiseFloor, duration)
   - CalibrationDetection (timestamp, frequency, amplitude, confidence)

3. `types/data.ts` — Anonymous data collection:
   - ConsentStatus = 'not_asked' | 'prompted' | 'accepted' | 'declined'
   - ConsentState (status, version, respondedAt)
   - QuantizedSnapshot (relativeMs, spectrum: Uint8Array, tagged)
   - SnapshotBatch (version, sessionId, fftSize, sampleRate, snapshots[])

Every interface must have JSDoc comments explaining the field's purpose, unit of measurement, and valid range.

Verify: npx tsc --noEmit passes with no errors.
```

---

### A-03: DSP Constants

**AI:** Gemini Ultra (numerical precision)
**Purpose:** Define all DSP tuning constants

```
Create `lib/dsp/constants.ts` with all tuning constants for Kill The Ring's feedback detection engine.

Include these constant groups (with SCREAMING_SNAKE_CASE naming):

1. ISO_31_BANDS — Standard ISO 31-band graphic EQ center frequencies (1/3 octave, 20Hz to 20kHz)

2. Musical pitch reference — A4_HZ = 440, NOTE_NAMES array, CENTS_PER_SEMITONE = 100

3. Mathematical precomputed values:
   - LN10_OVER_10 = Math.LN10 / 10 (for dB→power)
   - LOG10_E = Math.LOG10E
   - EXP_LUT: precomputed dB→power lookup table for range [-100, 0] at 0.1dB steps (1001 entries × Float32Array, ~4KB for L1 cache)

4. Acoustic constants (Carl Hopkins, "Sound Insulation", 2007):
   - SCHROEDER_CONSTANTS: coefficient=2000, default RT60=1.2s, default volume=500m³
   - FREQUENCY_BANDS: LOW (20-300Hz), MID (300-3kHz), HIGH (3k-20kHz) with prominence/sustain/Q multipliers
   - MODAL_OVERLAP: ISOLATED (M<0.03), COUPLED (M≈0.1), DIFFUSE (M>0.33)

5. A-weighting coefficients (IEC 61672):
   - C1=20.6, C2=107.7, C3=737.9, C4=12200, MIN_DB=-120

6. ECM8000 calibration curve (CSL #746):
   - 38-point frequency response array from 5Hz to 25kHz
   - Format: [frequency, correction_dB][]

7. MSD settings (DAFx-16):
   - Ring buffer size, growth rate threshold, energy gate, min frames by content type

8. Phase coherence settings (KU Leuven 2025):
   - Min samples, coherence threshold, feedback detection threshold

9. Persistence scoring:
   - MIN_PERSISTENCE_MS=100, HIGH=300, VERY_HIGH=600, LOW=60
   - HISTORY_MS=2000

10. COMB_PATTERN_SETTINGS, COMPRESSION_SETTINGS, CLASSIFIER_WEIGHTS, SEVERITY_THRESHOLDS

11. EQ_PRESETS (surgical vs heavy), ERB_SETTINGS, SPECTRAL_TRENDS

12. Operation mode presets — each OperationMode maps to a DetectorSettings override:
    - speech: faster detection, 200-4kHz focus
    - worship: balanced for vocals+instruments
    - liveMusic: higher thresholds for loud instruments
    - monitors: aggressive, fast response
    - ringOut: maximum sensitivity
    - etc.

13. DEFAULT_SETTINGS — complete DetectorSettings with sensible defaults

14. MOBILE_ANALYSIS_INTERVAL_MS = 40 (25fps)

Every constant must have a comment explaining what it does and where the value comes from (paper reference, empirical tuning, or engineering standard).

Verify: npx tsc --noEmit
```

---

### A-04: Math Utilities

**AI:** Gemini Ultra
**Purpose:** Pure math helper functions used by DSP modules

```
Create `lib/utils/mathHelpers.ts` with pure math utility functions:

1. medianInPlace(arr: Float32Array, start: number, end: number): number — in-place median using quickselect (O(n) average)
2. buildPrefixSum(arr: Float32Array): Float32Array — prefix sum array for O(1) range queries
3. quadraticInterpolation(y0: number, y1: number, y2: number): { offset: number; amplitude: number } — parabolic interpolation for true peak frequency from 3 FFT bins
4. clamp(value: number, min: number, max: number): number
5. isValidFftSize(n: number): boolean — checks if n is power of 2 and within [256, 32768]
6. generateId(): string — short random ID for tracks/advisories
7. lerp(a: number, b: number, t: number): number — linear interpolation
8. dbToLinear(db: number): number — dB to linear power
9. linearToDb(power: number): number — linear power to dB

Create `lib/utils/pitchUtils.ts`:
1. hzToPitch(hz: number): { note: string; octave: number; cents: number } — convert Hz to musical note
2. formatPitch(pitch: { note: string; octave: number; cents: number }): string — format as "D#5 +12¢"
3. hzToMidi(hz: number): number — Hz to MIDI note number
4. midiToHz(midi: number): number — MIDI to Hz

Create `lib/utils.ts`:
1. cn(...classes): string — Tailwind class merge utility (using clsx + tailwind-merge)

Add comprehensive Vitest tests for all math functions in `lib/utils/__tests__/mathHelpers.test.ts`.

Verify: pnpm test passes with all new tests green.
```

---

### A-05: MSD Analysis Module

**AI:** Gemini Ultra
**Purpose:** Magnitude Slope Deviation algorithm (DAFx-16)

```
Create `lib/dsp/msdAnalysis.ts` implementing the Magnitude Slope Deviation algorithm from the DAFx-16 conference paper.

What MSD does:
- Tracks the frame-to-frame change in magnitude (slope) of a spectral peak
- Maintains a ring buffer of slopes per frequency bin
- Computes the standard deviation of slopes
- Feedback: low MSD (consistent growth/stability)
- Music: high MSD (varying dynamics)

Implementation:
1. MSDAnalyzer class:
   - Constructor: accepts MSD_CONSTANTS from constants.ts
   - processFrame(binIndex: number, magnitudeDb: number): MSDResult | null
   - Ring buffer: pooled Float32Array allocation (64KB total, not per-bin)
   - Energy gate: skip if magnitude below threshold
   - Min-frames gate: return null until enough history accumulated
   - Content-adaptive frame counts: speech=7, music=13, compressed=64

2. MSDResult interface:
   - score: number (standard deviation of slopes, lower = more feedback-like)
   - growthRate: number (average dB/frame)
   - isHowl: boolean (below howl threshold)
   - fastConfirm: boolean (rapid confirmation mode)
   - feedbackScore: number (0-1, normalized for fusion engine)
   - frameCount: number

3. Export MSD_CONSTANTS alongside the class

4. Create `lib/dsp/__tests__/msdConsistency.test.ts`:
   - Test constant magnitude (feedback-like) → low MSD
   - Test linearly growing magnitude → low MSD + positive growth rate
   - Test random fluctuation (music-like) → high MSD
   - Test energy gate (below threshold → no result)
   - Test min frames gate
   - Test numerical precision
   - 20+ test cases

Verify: pnpm test
```

---

### A-06: Phase Coherence Module

**AI:** Gemini Ultra
**Purpose:** Phase coherence analysis (KU Leuven 2025)

```
Create `lib/dsp/phaseCoherence.ts` implementing phase coherence analysis based on KU Leuven 2025 methodology.

What phase coherence does:
- Measures the consistency of phase differences (Δφ) between consecutive FFT frames at a frequency bin
- Feedback: produces a constant Δφ (phase-locked sine wave) → high coherence
- Music/noise: produces random Δφ → low coherence
- Uses the Rayleigh test for circular uniformity

Implementation:
1. PhaseCoherenceAnalyzer class:
   - processFrame(binIndex: number, phase: number): PhaseCoherenceResult | null
   - Phase delta ring buffer per bin
   - Phase wrapping: handle 2π discontinuities via circular arithmetic
   - Min samples gate: 5 samples before producing result
   - Compute coherence: mean resultant length of phase deltas (Rayleigh statistic)

2. PhaseCoherenceResult interface:
   - coherence: number (0-1, higher = more phase-locked = more feedback-like)
   - isConstantPhase: boolean (above feedback threshold)
   - feedbackScore: number (0-1 for fusion)
   - sampleCount: number

3. Export PHASE_CONSTANTS

4. Create `lib/dsp/__tests__/phaseCoherence.test.ts`:
   - Constant phase delta (feedback) → high coherence
   - Random phase (music) → low coherence
   - Phase wrapping at 2π boundary
   - Min samples gate
   - 12+ test cases

Verify: pnpm test
```

---

### A-07: Compression Detection & Spectral Flatness

**AI:** Gemini Ultra

```
Create `lib/dsp/compressionDetection.ts` implementing spectral flatness (Wiener entropy) and dynamic compression detection.

Two components:
1. SpectralFlatnessAnalyzer:
   - Computes geometric_mean / arithmetic_mean of power spectrum around a peak
   - Pure tone (feedback): flatness → 0
   - White noise: flatness → 1
   - Returns SpectralFlatnessResult with flatness score and feedbackScore

2. CompressionDetector:
   - Tracks crest factor (peak / RMS) over time using ring buffer
   - Compressed audio: low crest factor, higher spectral flatness
   - Returns CompressionResult with isCompressed, compressionRatio, crestFactor

Both: energy gates, content-adaptive thresholds, constants in COMPRESSION_CONSTANTS.

Tests: `lib/dsp/__tests__/compressionDetection.test.ts` — 16+ tests covering pure tone, broadband, noise, crest factor.

Verify: pnpm test
```

---

### A-08: Algorithm Fusion Engine

**AI:** Gemini Ultra (math) + Claude Opus (architecture)

```
Create `lib/dsp/algorithmFusion.ts` — the weighted fusion engine combining all detection algorithms.

Components:
1. detectCombPattern(peaks, spectrum, sampleRate) — evenly-spaced harmonics from acoustic path
2. analyzeInterHarmonicRatio(spectrum, fundamentalBin) — energy between vs at harmonics
3. calculatePTMR(spectrum, peakBin) — peak-to-median ratio in dB
4. calculateMINDS(msdResult) — adaptive notch depth from MSD (DAFx-16)
5. detectContentType(spectrum, compressionResult) — classify as speech/music/compressed/unknown
6. fuseAlgorithmResults(scores: AlgorithmScores, config: FusionConfig) → FusedDetectionResult

Fusion algorithm:
- Each algorithm produces a feedbackScore (0-1)
- Weighted sum: Σ(weight_i × score_i) / Σ(weight_i)
- Confidence: based on how many algorithms contributed data
- Content-type-adaptive weights
- Comb pattern: high weight when detected, zero when not
- Verdicts: FEEDBACK (>0.7), POSSIBLE_FEEDBACK (0.4-0.7), NOT_FEEDBACK (<0.3), UNCERTAIN (low confidence)

Types: AlgorithmScores, FusedDetectionResult, FusionConfig, CombPatternResult, InterHarmonicResult, PTMRResult

Tests: `lib/dsp/__tests__/algorithmFusion.test.ts` — 48+ tests covering all scenarios.

Verify: pnpm test
```

---

### A-09: Classifier & EQ Advisor

**AI:** Claude Opus

```
Create two modules:

1. `lib/dsp/classifier.ts` — Track classification:
   - classifyTrackWithAlgorithms(track, fusionResult, settings) → ClassificationResult
   - shouldReportIssue(severity, mode, fusionResult) → boolean
   - Uses Bayesian prior + feature weighting + acoustic corrections
   - Imports acoustic utilities for Schroeder frequency, modal overlap, vibrato detection
   - Content-type-adaptive classification

2. `lib/dsp/eqAdvisor.ts` — EQ recommendation generation:
   - generateEQAdvisory(track, classification, fusionResult) → EQAdvisory
   - GEQ: snap to nearest ISO 31-band
   - PEQ: true frequency + ERB-scaled depth + Q from bandwidth
   - MINDS: adaptive notch depth when MSD data available
   - Shelf: for very low/high frequencies
   - Pitch translation: Hz → note name + octave + cents

   ERB (Glasberg & Moore 1990): ERB(f) = 24.7 × (4.37 × f/1000 + 1)
   Depth scaling: <500Hz → 0.7× (protect warmth), 500-2kHz → 1.0×, >2kHz → 1.2× (transparent)

3. `lib/dsp/acousticUtils.ts` — Room acoustics:
   - calculateSchroederFrequency(rt60, volume) → Hz
   - getFrequencyBand(hz) → 'LOW' | 'MID' | 'HIGH'
   - calculateModalOverlap(q) → number
   - analyzeVibrato(history) → {isVibrato, rate, depth}
   - reverberationQAdjustment(q, rt60) → adjusted Q
   - roomModeProximityPenalty(freq, roomDimensions) → penalty

Tests: eqAdvisor 51+ tests, classifier 25+ tests.

Verify: pnpm test
```

---

### A-10: FeedbackDetector Class

**AI:** Claude Opus (architecture) + Codex (Web Audio integration)

```
Create `lib/dsp/feedbackDetector.ts` — the main-thread audio analysis engine.

FeedbackDetector class:
- Constructor(config: AnalysisConfig, callbacks: FeedbackDetectorCallbacks)
- start(deviceId?: string): Promise<void> — request mic, create AudioContext pipeline
- stop(): void — release resources
- analyze(): void — called by rAF loop, processes FFT data
- updateConfig(config: Partial<AnalysisConfig>): void

Audio pipeline: getUserMedia → MediaStream → GainNode → AnalyserNode

analyze() hot loop (called 25-60fps):
1. analyser.getFloatFrequencyData(freqDb) — get dB spectrum
2. Apply A-weighting per bin (IEC 61672 formula)
3. Apply ECM8000 calibration per bin (interpolated from 38-point curve)
4. Convert dB→power using EXP_LUT (precomputed, not Math.exp)
5. Build prefix sum for O(1) local median
6. Find peaks: local maxima with prominence gate (above median + prominenceDb)
7. Quadratic interpolation for true peak frequency
8. Compute Q estimate from -3dB bandwidth
9. Update MSD ring buffers
10. Score persistence (consecutive frame count)
11. Compute PHPR (Peak-to-Harmonic Power Ratio)
12. Fire onPeakDetected callback for each qualifying peak
13. Track noise floor (exponential moving average)
14. Auto-gain control (if enabled)

Use preallocated Float32Array buffers throughout — zero allocations in the hot loop.
Use EXP_LUT for dB→power conversion (1 array access vs Math.exp per bin).

State: FeedbackDetectorState interface with isRunning, noiseFloorDb, autoGain state, performance timings.

Tests: Mock AudioContext/AnalyserNode, test analyze() logic. 19+ tests.

Verify: pnpm test
```

---

### A-11: Web Worker Orchestrator

**AI:** Codex (integration patterns)

```
Create the Web Worker DSP pipeline:

1. `lib/dsp/workerFft.ts` — AlgorithmEngine class:
   - processFrame(peak, spectrum, sampleRate, fftSize, timeDomain?) → algorithm results
   - Instantiates MSDAnalyzer, PhaseCoherenceAnalyzer, etc.
   - Coordinates per-peak analysis

2. `lib/dsp/advisoryManager.ts` — AdvisoryManager class:
   - processClassification(track, classification, eq) → advisory events
   - Handles: creation, updates, deduplication (same frequency ±5%), pruning (stale advisories)
   - Emits: advisory, advisoryReplaced, advisoryCleared

3. `lib/dsp/decayAnalyzer.ts` — DecayAnalyzer class:
   - analyzePeakDecay(freq, amplitude, timestamp) → decay analysis
   - Tracks room mode decay patterns

4. `lib/dsp/trackManager.ts` — TrackManager class:
   - addPeak(peak) → Track (create or update existing)
   - removePeak(binIndex)
   - Feature extraction (stability, harmonicity, modulation, noise sidebands)

5. `lib/dsp/dspWorker.ts` — Worker orchestrator:
   - onmessage handler for typed messages (init, updateSettings, processPeak, clearPeak, reset)
   - Coordinates: AlgorithmEngine → TrackManager → classify → fuse → EQ → AdvisoryManager
   - Classification temporal smoothing: ring-buffer majority vote (prevents verdict flickering)
   - postMessage typed outbound messages (advisory, tracksUpdate, returnBuffers, ready, error)

Message types: WorkerInboundMessage, WorkerOutboundMessage (discriminated unions, fully typed).

Verify: npx tsc --noEmit
```

---

### A-12: React Contexts & Hooks

**AI:** Claude Opus

```
Create the React state management layer:

1. `hooks/useAudioAnalyzer.ts` — manages FeedbackDetector lifecycle, settings persistence, spectrum data
2. `hooks/useDSPWorker.ts` — Worker lifecycle, message passing, typed handlers
3. `hooks/useAdvisoryMap.ts` — Map<string, Advisory> state with CRUD operations
4. `hooks/useAudioDevices.ts` — navigator.mediaDevices enumeration and selection
5. `hooks/useAnimationFrame.ts` — rAF loop manager
6. `hooks/useFullscreen.ts` — Fullscreen API wrapper
7. `hooks/useFpsMonitor.ts` — FPS tracking
8. `hooks/use-mobile.ts` — Mobile viewport detection

Create contexts:
1. `contexts/AudioAnalyzerContext.tsx` — wraps useAudioAnalyzer + useAudioDevices, provides engine state to all components
2. `contexts/AdvisoryContext.tsx` — wraps useAdvisoryMap, provides advisory state + actions
3. `contexts/UIContext.tsx` — mobile tab index, freeze state, fullscreen, layout reset
4. `contexts/PortalContainerContext.tsx` — portal mount point for mobile overlays

Pattern: Each context has a Provider component and a useXxx() hook. Never drill props through layouts.

Verify: npx tsc --noEmit
```

---

### A-13: UI Components

**AI:** Claude Opus

```
Create the UI component layer (all components: PascalCase, memo() wrapped, 'use client'):

1. KillTheRing.tsx — root orchestrator, wraps providers, layout switch
2. KillTheRingClient.tsx — client boundary wrapper
3. SpectrumCanvas.tsx — HTML5 Canvas spectrum display (60fps rAF)
4. GEQBarView.tsx — GEQ overlay on spectrum
5. IssuesList.tsx — active advisory cards
6. EarlyWarningPanel.tsx — pre-feedback trend warnings
7. FeedbackHistoryPanel.tsx — session history
8. AlgorithmStatusBar.tsx — real-time algorithm scores
9. DetectionControls.tsx — start/stop + mode selection
10. HeaderBar.tsx — app header with version, help, settings
11. HelpMenu.tsx — dropdown with about, changelog, help
12. InputMeterSlider.tsx — audio input level meter
13. VerticalGainFader.tsx — gain control
14. OnboardingOverlay.tsx — first-run tutorial
15. DataConsentDialog.tsx — data collection consent
16. ErrorBoundary.tsx — Sentry error boundary
17. DesktopLayout.tsx — landscape:flex grid (spectrum + sidebar)
18. MobileLayout.tsx — WAI-ARIA tabs (roving tabindex, arrow key nav)
19. SettingsPanel.tsx — tabbed settings container
20. settings/DetectionTab.tsx — detection settings
21. settings/DisplayTab.tsx — display settings
22. settings/RoomTab.tsx — room acoustics settings
23. settings/CalibrationTab.tsx — mic calibration
24. settings/AlgorithmsTab.tsx — algorithm tuning
25. settings/AdvancedTab.tsx — debug/advanced settings

Canvas drawing helpers: lib/canvas/spectrumDrawing.ts (pure functions, {current: T} params)

Barrel export: components/kill-the-ring/index.ts

Verify: pnpm dev starts, components render, pnpm lint passes
```

---

### A-14: Infrastructure

**AI:** Claude Opus

```
Add infrastructure:

1. PWA support: @serwist/next + serwist
   - app/sw.ts — service worker with precache, runtime caching, offline fallback
   - app/~offline/page.tsx — offline fallback page

2. Sentry error reporting: @sentry/nextjs
   - instrumentation-client.ts — browser-side (replay, error filtering)
   - sentry.server.config.ts — server-side
   - sentry.edge.config.ts — edge runtime
   - instrumentation.ts — runtime detection
   - app/global-error.tsx — global error boundary

3. Security headers in next.config.mjs:
   - Content-Security-Policy (strict baseline, relaxed in dev)
   - X-Content-Type-Options: nosniff
   - X-Frame-Options: DENY
   - Referrer-Policy: strict-origin-when-cross-origin
   - Permissions-Policy: microphone=self

4. CI/CD: .github/workflows/ci.yml
   - Triggers: push/PR to main
   - Steps: tsc --noEmit → lint → test → build

5. Export system: lib/export/
   - exportPdf.ts — jsPDF dynamic import
   - exportTxt.ts — fixed-width text
   - downloadFile.ts — browser download trigger

6. Storage: lib/storage/ktrStorage.ts
   - typedStorage<T>(key) — get/set/remove with JSON serialization
   - stringStorage(key) — raw string storage
   - flagStorage(key) — boolean flag storage

7. Data collection: lib/data/
   - consent.ts — localStorage consent management
   - snapshotCollector.ts — ring buffer for spectral snapshots
   - uploader.ts — batch upload to /api/v1/ingest
   - API route: app/api/v1/ingest/route.ts

Verify: pnpm build succeeds, all tests pass
```

---

### A-15: Final Integration & Testing

**AI:** All three (cross-validation)

```
Final integration steps:

1. Wire app/page.tsx to render KillTheRing component with all providers
2. Verify the full data flow: mic → FFT → FeedbackDetector → Worker → Advisory → UI → Canvas
3. Run all tests: pnpm test (target: 300+ tests passing)
4. Run type check: npx tsc --noEmit (zero errors)
5. Run lint: pnpm lint (zero errors)
6. Run build: pnpm build (succeeds, generates SW)
7. Test PWA: pnpm start, verify installable and offline-capable
8. Test on mobile: responsive layout, touch targets, performance

Add integration tests in tests/dsp/:
- algorithmFusion.test.ts — fusion scenarios
- compressionDetection.test.ts — real-world compression patterns
- msdAnalysis.test.ts — temporal stability patterns
- phaseCoherence.test.ts — phase-locked vs random patterns

Target: 326+ tests, 80%+ line coverage on DSP modules.

Verify: npx tsc --noEmit && pnpm test && pnpm build
```

---

# Phase B: Architecture-Preserving

> **Purpose:** Keep the proven architecture (7-algorithm fusion, Web Worker pipeline, 3-context React pattern), but regenerate all implementation code. Use this when you want a clean rewrite while preserving design decisions.
> **Total prompts:** 8 | **Estimated time:** 1-2 days

---

### B-01: Scaffold with Preserved Architecture

**AI:** Claude Code (Opus 4.6)

```
Create a Next.js 16 project with the exact architecture of Kill The Ring.

Preserve these architectural decisions:
1. Three React contexts: AudioAnalyzer (engine), Advisory (state), UI (layout)
2. Web Worker for DSP (thin orchestrator delegating to modules)
3. FeedbackDetector on main thread (Web Audio API + peak detection)
4. 7-algorithm fusion engine with content-adaptive weights
5. Canvas-based visualization (pure drawing helpers, no React in render loop)
6. Typed localStorage for settings persistence
7. Dynamic import for jsPDF
8. PWA via Serwist
9. Sentry for error reporting

Feed the AI the complete `types/advisory.ts`, `types/calibration.ts`, and `types/data.ts` from the current codebase as the type system to preserve.

Feed `lib/dsp/constants.ts` as the constants to preserve.

Create the project structure, install dependencies, configure build tools. Implement the type system and constants exactly as provided.

Verify: pnpm dev starts, npx tsc --noEmit passes
```

---

### B-02: Regenerate DSP Modules

**AI:** Gemini Ultra

```
Regenerate all DSP modules for Kill The Ring using the preserved type system and constants.

Feed the AI: types/advisory.ts, lib/dsp/constants.ts, and the module interfaces/exports from each current module.

Regenerate (implementation from scratch, same interfaces):
1. lib/dsp/msdAnalysis.ts — MSD per DAFx-16
2. lib/dsp/phaseCoherence.ts — Phase coherence per KU Leuven 2025
3. lib/dsp/compressionDetection.ts — Spectral flatness + compression
4. lib/dsp/algorithmFusion.ts — 7-algorithm weighted fusion + comb/IHR/PTMR
5. lib/dsp/classifier.ts — Bayesian track classification
6. lib/dsp/eqAdvisor.ts — EQ recommendations + MINDS + ERB
7. lib/dsp/acousticUtils.ts — Room acoustics calculations
8. lib/dsp/feedbackDetector.ts — Main thread peak detection
9. lib/dsp/workerFft.ts — AlgorithmEngine
10. lib/dsp/advisoryManager.ts — Advisory lifecycle
11. lib/dsp/decayAnalyzer.ts — Decay analysis
12. lib/dsp/trackManager.ts — Track lifecycle
13. lib/dsp/dspWorker.ts — Worker orchestrator

Each module must match the existing exported interfaces exactly. Internal implementation can differ.

Verify: npx tsc --noEmit && pnpm test (all existing tests must pass)
```

---

### B-03: Regenerate Tests

**AI:** ChatGPT 5.4

```
Regenerate the complete test suite for Kill The Ring's DSP engine.

Target: 326+ tests across 14 test files.

Feed the AI the current test file list and test counts:
- lib/dsp/__tests__/feedbackDetector.test.ts (19)
- lib/dsp/__tests__/classifier.test.ts (25)
- lib/dsp/__tests__/eqAdvisor.test.ts (51)
- lib/dsp/__tests__/algorithmFusion.test.ts (48)
- lib/dsp/__tests__/compressionDetection.test.ts (16)
- lib/dsp/__tests__/phaseCoherence.test.ts (12)
- lib/dsp/__tests__/msdConsistency.test.ts (24)
- tests/dsp/algorithmFusion.test.ts (46)
- tests/dsp/algorithmFusion.gpt.test.ts (12)
- tests/dsp/algorithmFusion.chatgpt.test.ts (13)
- tests/dsp/algorithmFusion.chatgpt-context.test.ts (21)
- tests/dsp/compressionDetection.test.ts (16)
- tests/dsp/msdAnalysis.test.ts (15)
- tests/dsp/phaseCoherence.test.ts (13)

Regenerate each file with the same number or more tests. Include edge cases, boundary conditions, and academic reference validation.

Verify: pnpm test (326+ tests pass)
```

---

### B-04 through B-08

Follow the same pattern for:
- **B-04:** Regenerate hooks (11 files)
- **B-05:** Regenerate contexts (4 files)
- **B-06:** Regenerate components (29 files)
- **B-07:** Regenerate infrastructure (Sentry, PWA, CI, export, storage)
- **B-08:** Final integration and verification

---

# Phase C: Module-by-Module

> **Purpose:** Replace or upgrade individual modules independently. Use this when you want to improve a specific part without touching the rest.
> **Each prompt is standalone — use any one independently.**

---

### C-01: Replace MSD Analysis

**AI:** Gemini Ultra

```
Replace `lib/dsp/msdAnalysis.ts` with an improved implementation.

Constraints:
- Must export the same `MSDAnalyzer` class with the same public API
- Must export the same `MSDResult` interface
- Must export `MSD_CONSTANTS`
- All existing tests in `lib/dsp/__tests__/msdConsistency.test.ts` must pass
- All integration tests in `tests/dsp/msdAnalysis.test.ts` must pass

Improvements to make:
[DESCRIBE SPECIFIC IMPROVEMENTS]

Verify: pnpm test (all MSD-related tests pass, no regressions in other tests)
```

---

### C-02: Replace Phase Coherence

Same pattern as C-01 but for `lib/dsp/phaseCoherence.ts`.

### C-03: Replace Compression Detection

Same pattern for `lib/dsp/compressionDetection.ts`. Specifically fix BUG-001 (broad peak flatness).

### C-04: Replace Algorithm Fusion

Same pattern for `lib/dsp/algorithmFusion.ts`. Can add new algorithms to the fusion.

### C-05: Replace Classifier

Same pattern for `lib/dsp/classifier.ts`. Can improve Bayesian logic.

### C-06: Replace EQ Advisor

Same pattern for `lib/dsp/eqAdvisor.ts`. Can add mixer-specific recommendations.

### C-07: Replace FeedbackDetector

Same pattern for `lib/dsp/feedbackDetector.ts`. Can optimize hot loop or add new detection stages.

### C-08: Replace Worker Orchestrator

Same pattern for `lib/dsp/dspWorker.ts`. Can improve message handling or add new message types.

### C-09: Replace Any Component

```
Replace `components/kill-the-ring/[COMPONENT_NAME].tsx` with an improved version.

Constraints:
- Must have the same component name and export
- Must accept the same props (or a superset)
- Must use memo() wrapper
- Must have 'use client' directive if using browser APIs
- Must use shadcn/ui primitives from @/components/ui/
- Must use cn() from @/lib/utils for Tailwind classes
- Touch targets ≥ 44×44px
- Must work in both DesktopLayout and MobileLayout contexts

Improvements to make:
[DESCRIBE SPECIFIC IMPROVEMENTS]

Verify: pnpm dev (component renders correctly), pnpm lint (no errors)
```

### C-10: Add New Module to Fusion Engine

Template for adding any new detection algorithm — references PROMPT-DSP-001 from the Prompts library.

---

*This rebuild manual is designed to reconstruct Kill The Ring using any combination of AI assistants. Each phase is self-contained. Phase A builds from nothing, Phase B preserves architecture, Phase C upgrades individual pieces. Use the AI Strengths Matrix from the plan to choose the best AI for each prompt.*
