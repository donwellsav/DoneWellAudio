# Kill The Ring — AI Session Context Prompt

> **Copy-paste this entire document at the start of a new AI session to get full project context.**
> Built from deep code audit of v0.152.0. Every value verified against actual source code.

---

## Identity

**Kill The Ring** is a browser-based real-time acoustic feedback detection PWA for live sound engineers. It captures microphone input via the Web Audio API, identifies feedback frequencies using 7 fused detection algorithms, and delivers EQ recommendations with pitch translation. It is **analysis-only** — it never modifies the audio signal.

- **URL:** killthering.com
- **Repo:** github.com/donwellsav/killthering
- **Version:** 0.152.0
- **Stack:** Next.js 16 (App Router, Turbopack) · TypeScript 5.7 (strict, zero `any`) · React 19 · shadcn/ui + Tailwind v4 · Vitest (476 tests, 27 suites) · Sentry · Serwist PWA · pnpm

## Critical Rules

1. **NEVER run `git push`** unless the user explicitly says "push" or "send to GitHub". Committing locally is fine. Pushing is NOT.
2. **Build verification after every change:** `npx tsc --noEmit && pnpm test`
3. **Do not modify audio output.** KTR listens and advises. It never touches the audio signal.
4. **"Update the usuals"** means: update changelog (`lib/changelog.ts`), help menu (`components/kill-the-ring/help/GuideTab.tsx`), version (`package.json` — `0.{PR_NUMBER}.0`), and CLAUDE.md.

## Commands

```bash
pnpm dev              # Dev server :3000 (Turbopack, no SW)
pnpm build            # Production build (webpack, generates SW)
pnpm test             # Vitest (476 tests: 471 pass + 4 skip + 1 todo)
npx tsc --noEmit      # Type-check (run BEFORE pnpm build)
```

## Audio Pipeline

```
Mic → getUserMedia → GainNode → AnalyserNode (8192 FFT, 50fps)
  → FeedbackDetector.analyze() [main thread, every 20ms]
    → Peak detection (MSD pool, prominence, persistence)
    → Content type detection (temporal envelope + 4-feature scoring, 10-frame majority vote)
    → postMessage(peak, spectrum, timeDomain) [transferable Float32Arrays, zero-copy]
      → Web Worker: AlgorithmEngine.computeScores()
        → 7-algorithm fusion with content-adaptive weights
        → classifyTrackWithAlgorithms() [11 features, Bayesian]
        → shouldReportIssue() [mode-specific gate]
        → generateEQAdvisory() [GEQ + PEQ + shelf + pitch]
        → AdvisoryManager.createOrUpdate() [3-layer dedup]
      → postMessage(advisory) back to main thread
        → useAdvisoryMap [O(1) Map, sorted cache, dirty flag]
        → React render → Canvas spectrum + Advisory cards
```

### Thread Model
- **Main thread:** AudioContext, AnalyserNode, FeedbackDetector (peak detection + content type), requestAnimationFrame (canvas 30fps), React rendering
- **Web Worker:** Classification, algorithm fusion, EQ advisory, track management. Communicates via transferable Float32Arrays.

## 7 Detection Algorithms (actual weights from code)

| # | Algorithm | What It Measures | DEFAULT | SPEECH | MUSIC | COMPRESSED |
|---|-----------|-----------------|---------|--------|-------|------------|
| 1 | MSD | Magnitude stability (feedback=0, music>>0) | 0.27 | 0.30 | 0.07 | 0.11 |
| 2 | Phase Coherence | Frame-to-frame phase stability | 0.23 | 0.22 | 0.32 | 0.27 |
| 3 | Spectral Flatness | Geometric/arithmetic mean + kurtosis | 0.11 | 0.09 | 0.09 | 0.16 |
| 4 | Comb Pattern | Evenly-spaced peaks from acoustic loop | 0.07 | 0.04 | 0.07 | 0.07 |
| 5 | IHR | Inter-harmonic energy ratio | 0.12 | 0.09 | 0.22 | 0.16 |
| 6 | PTMR | Peak-to-median ratio | 0.10 | 0.16 | 0.13 | 0.13 |
| 7 | ML (ONNX) | MLP 11→32→16→1 bootstrap model | 0.10 | 0.10 | 0.10 | 0.10 |

### Post-Fusion Gates
- **IHR gate:** When `isMusicLike` (IHR>0.35 + harmonics>=3), probability *= 0.65
- **PTMR gate:** When PTMR feedbackScore < 0.2, probability *= 0.80
- **Formant gate:** When 2+ peaks in distinct formant bands (F1:300-900, F2:800-2500, F3:2200-3500) + Q∈[3,20], probability *= 0.65
- **Chromatic gate:** When frequency on 12-TET grid ±5 cents + phase coherence > 0.80, phase score *= 0.60
- **Comb stability gate:** When spacing CV > 0.05 over 16 frames, comb confidence *= 0.25

## Operation Modes (8 presets in constants.ts)

| Mode | Threshold (dB) | Silence (dBFS) | MSD Weight | Use Case |
|------|---------------|----------------|------------|----------|
| speech | 27 | -65 | 0.30 | Conferences, lectures |
| worship | 35 | -58 | 0.30 | Churches (reverberant) |
| liveMusic | 42 | -45 | 0.07 | Concerts (dense harmonics) |
| theater | 28 | -58 | 0.30 | Drama, musicals |
| monitors | 15 | -45 | 0.30 | Stage wedges (fastest) |
| ringOut | 2 | -70 | 0.30 | Calibration (most sensitive) |
| broadcast | 22 | -70 | 0.30 | Studios, podcasts |
| outdoor | 38 | -45 | 0.30 | Festivals (wind-resistant) |

## Context Providers (outermost → innermost)

```
AudioAnalyzerProvider (compound — nests 4 focused contexts)
  ├─ EngineContext (11 fields) — isRunning, start/stop, devices, dspWorker
  │  └─ SettingsContext (5 fields) — settings, updateSettings, mode/freq changes
  │     └─ DetectionContext (2 fields) — advisories, earlyWarning
  │        └─ MeteringContext (10 fields) — spectrumRef, inputLevel, autoGain, noiseFloor
AdvisoryProvider — advisory UI state, dismiss/clear/FP, derived booleans
UIProvider — mobile tab, freeze, fullscreen, RTA fullscreen, layout key
PortalContainerProvider — Radix UI portal redirect for fullscreen
```

**Hot-path pattern:** `spectrumRef` written every 20ms by FeedbackDetector, read imperatively by SpectrumCanvas at 30fps — bypasses React entirely.

## Key Interfaces (types/advisory.ts)

**DetectorSettings** — 46 fields controlling all detection behavior. Persisted to localStorage via `ktrStorage.ts`. Key fields: `mode`, `feedbackThresholdDb`, `minFrequency`, `maxFrequency`, `algorithmMode`, `confidenceThreshold` (default 0.35), `swipeLabeling`, `spectrumWarmMode`, `canvasTargetFps`.

**Advisory** — 24-field detection result: `id`, `label` (ACOUSTIC_FEEDBACK|WHISTLE|INSTRUMENT|POSSIBLE_RING), `severity` (RUNAWAY|GROWING|RESONANCE|POSSIBLE_RING|WHISTLE|INSTRUMENT), `confidence`, `trueFrequencyHz`, `qEstimate`, `advisory` (EQAdvisory with PEQ/GEQ/shelf recs), `algorithmScores` (all 7 scores + fused probability).

**Track** — Frequency track lifecycle with `history[]`, `features`, `velocityDbPerSec`, MSD fields, persistence fields, adjacent peak clustering.

## File Map (key files with actual line counts)

```
lib/dsp/
  feedbackDetector.ts (1721)  # Core: peak detection, MSD pool, auto-gain, content type
  constants.ts (961)          # All tuning constants, 8 mode presets, DEFAULT_SETTINGS
  acousticUtils.ts (861)      # Room modes, Schroeder, RT60, vibrato
  classifier.ts (851)         # 11-feature Bayesian + formant/chromatic gates
  algorithmFusion.ts (920)    # 7-algo fusion, comb, IHR, PTMR, MINDS, CombStabilityTracker
  dspWorker.ts (505)          # Worker orchestrator, classification smoothing (3-frame)
  trackManager.ts (300+)      # Track lifecycle, 100-cent association tolerance
  eqAdvisor.ts (402)          # GEQ/PEQ/shelf recs, ERB scaling, MINDS depth
  workerFft.ts (428)          # Radix-2 FFT, AlgorithmEngine, phase extraction
  advisoryManager.ts (293)    # 3-layer dedup, band cooldown (1500ms), max 200
  msdPool.ts (277)            # 256 slots × 64 frames = 64KB sparse allocation
  mlInference.ts (226)        # ONNX Runtime Web, predictCached() (1-frame lag by design)
  phaseCoherence.ts (130)     # Phase coherence via circular statistics, 10-frame history
  compressionDetection.ts(162)# Spectral flatness, crest factor, kurtosis
  feedbackHistory.ts (250+)   # Session history, repeat offenders (3+ hits), max 500 events

lib/canvas/
  spectrumDrawing.ts (750+)   # Pure canvas drawing, RTA labels, theme-aware (canvasThemeRef)

components/kill-the-ring/
  KillTheRing.tsx (473)       # Root orchestrator, settings debounce, FP handling
  IssuesList.tsx (440)        # Advisory cards with swipe gestures, 3s stability
  UnifiedControls.tsx (760)   # All settings: icon sub-tabs, accordion sections
  HeaderBar.tsx (191)         # Header bar, permanent Clear All, theme toggle
  DesktopLayout.tsx           # 3-panel resizable layout
  MobileLayout.tsx            # 2-tab (Issues+Graph / Settings) with inline resizable graph
  KtrLogo.tsx                 # Brand SVG logo component
  RingOutWizard.tsx           # Guided ring-out workflow

hooks/ (11 files)
  useAudioAnalyzer.ts         # Bridges FeedbackDetector + worker to React
  useDSPWorker.ts (363)       # Worker lifecycle, crash recovery, message handling
  useAdvisoryMap.ts (137)     # O(1) Map + dirty-bit sorted cache
  useCalibrationSession.ts    # Room profiling, session recording
  useDataCollection.ts        # Anonymous spectral data collection (opt-out)
  useAudioDevices.ts          # Mic enumeration, device persistence
  useAnimationFrame.ts        # RAF wrapper with targetFps gating
  useFullscreen.ts            # Fullscreen API + iOS fallback
  useFpsMonitor.ts            # O(1) circular buffer FPS meter
  useAdvisoryLogging.ts       # Records high-confidence advisories to history
  use-mobile.ts               # <600px breakpoint query

types/
  advisory.ts (~400)          # Advisory, DetectorSettings, Track, SpectrumData, etc.
  calibration.ts (~157)       # RoomProfile, CalibrationExport
  data.ts (~153)              # SnapshotBatch, MarkerAlgorithmScores, WorkerMessages

lib/utils/
  mathHelpers.ts              # dB conversions, quickselect, prefix sum, EMA, log freq mapping
  pitchUtils.ts               # Hz↔pitch, cents, MIDI, harmonic series, formatting
```

## Performance Constraints

- **FeedbackDetector.analyze() is the hot path** — runs every 20ms (50fps). Every optimization matters.
- **EXP_LUT:** 1001-entry precomputed dB-to-linear table [-100,0] at 0.1dB steps. Use instead of Math.pow().
- **MSD pool:** 256 slots × 64 frames = 64KB (vs 1MB dense). O(1) allocation, O(256) LRU eviction.
- **Prefix sum:** Float64Array for O(1) prominence neighborhood averaging.
- **Canvas at 30fps, not 60fps.** Sufficient for spectrum visualization.
- **Worker backpressure:** If worker is busy, next peak is DROPPED (not queued).
- **Transferable buffers:** spectrum/timeDomain Float32Arrays transferred zero-copy.
- **Shelf dedup:** Single `analyzeSpectralTrends()` per frame, cached across all peaks.

## Known Gotchas

1. **Canvas theme via ref, not state.** `canvasThemeRef.current` is read in the RAF loop. If you use React state for canvas colors, the RAF callback captures stale values via closure. Always use refs for anything read in animation frames.

2. **ML inference is 1 frame behind.** `predictCached()` returns `this._lastPrediction` synchronously while async inference runs. This is intentional — breaks circular dependency with fused probability.

3. **onnxruntime-web warning.** Turbopack can't resolve the optional peer dep at compile time. Suppressed via string-concatenated dynamic import. Don't install it as a regular dependency — that broke the site before.

4. **HMR doesn't update DSP classes.** FeedbackDetector is a plain class, not a React component. Fast Refresh only hot-swaps React components. Full page reload required for DSP code changes.

5. **Content type is global, not per-track.** A single speech utterance can flip detection to speech mode, affecting unrelated peaks.

6. **Band cooldown can suppress legitimate feedback.** Clearing a band suppresses all peaks in that band for 1500ms, including unrelated frequencies at nearby Hz values.

7. **Phase coherence reduced 50% below 200Hz.** Workaround for FFT phase resolution coarseness at low frequencies.

8. **Comb stability tracker is global.** Persists across peaks, resets on peak clear. Doesn't scale cleanly to multiple simultaneous feedback frequencies.

## UI Features Summary

- **Dual entry point:** "Press to Start Analysis" + "Ring Out Room" buttons
- **Dark/light theme:** next-themes, CSS variables, canvas colors via `canvasThemeRef`
- **Ring-out wizard:** Step-by-step guided ring-out with running notch list
- **Swipe gestures:** Left=dismiss, right=confirm, long-press=false positive (mobile always-on)
- **Inline mobile graphs:** Resizable RTA/GEQ above issue cards, swipeable between them
- **Draggable threshold:** Drag the dashed line on RTA to adjust sensitivity
- **Algorithm scores debug:** Toggle in Display settings shows all 7 scores per card
- **Settings auto-persist:** All 46 fields saved to localStorage on every change
- **KTR brand logo:** Frequency analyzer crosshair + EQ bars SVG

## Coding Conventions

- Components: PascalCase, `memo()`, `'use client'`
- Constants: SCREAMING_SNAKE_CASE in `lib/dsp/constants.ts`
- Imports: Always `@/*` path alias
- Canvas: Pure functions, no React deps. Theme via `canvasThemeRef.current`
- Styling: Tailwind utilities + `cn()` from `lib/utils.ts`
- Testing: Vitest. Co-located `__tests__/`, scenario tests in `tests/dsp/`
- Build gate: `npx tsc --noEmit && pnpm test` — both must pass
