# CLAUDE.md — Kill The Ring Project Intelligence

> **Last updated from 10-phase deep audit, March 2026. 30,920 lines, 132 files, 335 tests.**

## CRITICAL RULES

- **NEVER run `git push` unless the user explicitly says "push" or "send to GitHub".** Committing locally is fine. Pushing is NOT. No exceptions.
- **Build verification after every change:** `npx tsc --noEmit && pnpm test`
- **Do not modify audio output.** KTR is analysis-only. It listens and advises. It never modifies the audio signal.

## Project Overview

**Kill The Ring** (killthering.com) is a browser-based real-time acoustic feedback detection PWA for live sound engineers. It captures microphone input via the Web Audio API, identifies feedback frequencies using six fused detection algorithms, and delivers EQ recommendations with pitch translation. Version 0.95.0. Repository: github.com/donwellsav/killthering.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript 5.7 (strict mode, zero `any`) |
| UI | shadcn/ui (New York), Tailwind CSS v4, Radix primitives |
| Audio | Web Audio API (AnalyserNode, 8192-point FFT at 50fps) |
| DSP Offload | Web Worker (dspWorker.ts, ~430 lines) |
| Visualization | HTML5 Canvas at 30fps |
| State | React 19 hooks + 4 context providers (no external state library) |
| Testing | Vitest (335 tests, 14 suites, under 10s) |
| Error Reporting | Sentry (browser + server + worker runtimes) |
| PWA | Serwist (service worker, offline caching, installable) |
| Package Manager | pnpm |

## Commands

```bash
pnpm dev              # Dev server on :3000 (Turbopack, no SW)
pnpm build            # Production build (webpack, generates SW)
pnpm start            # Production server
pnpm lint             # ESLint (flat config)
pnpm test             # Vitest (335 DSP unit tests)
pnpm test:watch       # Vitest watch mode
pnpm test:coverage    # Vitest with V8 coverage
npx tsc --noEmit      # Type-check (run BEFORE pnpm build)
```

## Architecture

### Audio Pipeline

```
Mic -> getUserMedia -> GainNode -> AnalyserNode (8192 FFT)
  -> FeedbackDetector.analyze() at 50fps (main thread)
    -> Peak detection with MSD/prominence/persistence
    -> postMessage(peak, spectrum, timeDomain) [transferable]
      -> Web Worker: AlgorithmEngine.computeScores()
      -> fuseAlgorithmResults() [content-adaptive weights]
      -> classifyTrackWithAlgorithms() [10 features]
      -> shouldReportIssue() [mode-specific gate]
      -> generateEQAdvisory() [GEQ + PEQ + shelf + pitch]
      -> AdvisoryManager.createOrUpdate() [3-layer dedup]
      -> postMessage(advisory) back to main thread
        -> useAdvisoryMap [O(1) Map, sorted cache, dirty flag]
        -> React render -> Canvas spectrum + Advisory cards
```

### Thread Model

- **Main thread:** AudioContext, AnalyserNode, FeedbackDetector (peak detection), requestAnimationFrame (canvas 30fps), React rendering
- **Web Worker:** Classification, algorithm fusion, EQ advisory, track management. Communicates via transferable Float32Arrays (zero-copy).

### Context Providers (top to bottom)

1. `AudioAnalyzerContext` — Engine lifecycle, settings, devices, spectrum, detection (25 fields — **KNOWN ISSUE: god context, should split into 3**)
2. `AdvisoryContext` — Advisory state, dismiss/clear/false-positive, derived booleans
3. `UIContext` — Mobile tab, freeze, fullscreen, layout reset
4. `PortalContainerContext` — Portal mount for mobile overlays

## Six Detection Algorithms

| # | Algorithm | Source | What It Measures | Weight (DEFAULT) |
|---|-----------|--------|-----------------|-----------------|
| 1 | MSD | DAFx-16, Aalto 2016 | Magnitude stability over time. Feedback MSD=0, music MSD>>0. | 0.30 |
| 2 | Phase Coherence | KU Leuven 2025 | Frame-to-frame phase stability via circular statistics | 0.25 |
| 3 | Spectral Flatness/Compression | Glasberg-Moore | Geometric/arithmetic mean ratio + kurtosis + crest factor + dynamic range | 0.12 |
| 4 | Comb Pattern | DBX whitepaper | Evenly-spaced peaks from acoustic loop. d=c/delta_f | 0.08 |
| 5 | IHR | Novel | Inter-harmonic energy ratio. Music: rich harmonics. Feedback: pure tone. | 0.13 |
| 6 | PTMR | Novel | Peak-to-median ratio. Sharp peaks = more likely feedback. | 0.12 |

### Fusion Weight Profiles

```
DEFAULT:    MSD=0.30  Phase=0.25  Spectral=0.12  Comb=0.08  IHR=0.13  PTMR=0.12
SPEECH:     MSD=0.33  Phase=0.24  Spectral=0.10  Comb=0.05  IHR=0.10  PTMR=0.18
MUSIC:      MSD=0.08  Phase=0.35  Spectral=0.10  Comb=0.08  IHR=0.24  PTMR=0.15
COMPRESSED: MSD=0.12  Phase=0.30  Spectral=0.18  Comb=0.08  IHR=0.18  PTMR=0.14
```

### Multiplicative Gates (post-fusion)

- **IHR gate:** When harmonicsFound>=3 AND IHR>0.35, feedbackProbability *= 0.65 (instrument suppression)
- **PTMR gate:** When PTMR feedbackScore under 0.2, feedbackProbability *= 0.80 (broad peak suppression)

## Known Bugs (Priority Order)

### Critical (P0)

1. **Auto-gain EMA coefficients stale.** Computed in `start()` but NOT recomputed in `updateConfig()` when `analysisIntervalMs` changes mid-session. File: `feedbackDetector.ts` ~line 250, 320.
2. **Confidence formula floors at 0.5.** Makes UNCERTAIN verdict unreachable. File: `algorithmFusion.ts` line 571.
3. **Post-override normalization.** RUNAWAY forces pFeedback=0.85, then divides by postTotal>1.0, reducing to ~0.56. File: `classifier.ts`.

### High (P1)

4. **Comb weight doubling dilutes others by 7.4%.** Extra weight added to totalWeight denominator. Fix: add extra only to numerator. File: `algorithmFusion.ts` ~line 470.
5. **No worker crash recovery.** `onerror` handler logs to Sentry but does not restart. File: `useDSPWorker.ts`.
6. **SpectrumCanvas missing devicePixelRatio.** Blurry on Retina/high-DPI. File: `SpectrumCanvas.tsx`.
7. **Zero tests for hooks, components, contexts, exports, storage.** 335 tests cover DSP only.

### Medium (P2)

8. `analyze()` is 180+ lines monolith — decompose into 4-5 methods.
9. Dual MSD implementations (`feedbackDetector.ts` pooled + `msdAnalysis.ts` class) risk divergence.
10. `AudioAnalyzerContext` is god-context mixing engine/settings/detection (25 fields).
11. Only axial room modes implemented (tangential + oblique missing).
12. No shelf overlap validation in eqAdvisor.
13. PRIOR_PROBABILITY = 0.33 assumes equal priors; should favor feedback (0.45).
14. `HelpMenu.tsx` is 1,018 lines doing 3 things — split.
15. Settings slider fires per-frame (no debounce during drag).
16. No tablet responsive breakpoint between mobile and desktop.

### Low (P3)

17. TS2688: Missing @serwist/next type definition (build succeeds anyway).
18. `unsafe-inline` in production script-src CSP (needed by Next.js).
19. No security scanning in CI (Snyk/Dependabot/npm audit).

## Known False Positives

| Scenario | Mode | Probability | Root Cause | Fix |
|----------|------|-------------|------------|-----|
| Sustained vowel | Speech | 0.703 | IHR gate needs >=3 harmonics; vowels have only 2 (F1+F2) | Add formant structure detector |
| Auto-Tuned vocal | Compressed | 0.785 | Pitch correction creates artificially high phase coherence | Chromatic quantization detector + reduce phase weight |
| Flanger/phaser pedal | Music | 0.681 | Time-based effects create real comb patterns | Temporal comb stability tracking (static vs sweeping) |

## Project Structure

```
app/                          # Next.js App Router
  layout.tsx (54)             #   Root layout, Geist fonts, metadata
  page.tsx (5)                #   Entry -> KillTheRingClient
  global-error.tsx (56)       #   Sentry error boundary
  sw.ts (38)                  #   Serwist service worker
  api/v1/ingest/route.ts (147)#   Spectral snapshot ingest (rate-limited, IP-stripped)
components/
  kill-the-ring/ (23 files)   # Domain components + barrel index.ts
    settings/ (7 files)       # Settings tab components
  ui/ (20 files)              # shadcn/ui primitives
contexts/ (4 files)           # React context providers
hooks/ (11 files)             # Custom hooks
lib/
  dsp/ (17 modules)           # DSP engine (8,057 lines):
    feedbackDetector.ts (1798)#   Core: peak detection, MSD pool, auto-gain, persistence
    constants.ts (897)        #   All tuning constants, 8 mode presets, ECM8000 cal curve
    acousticUtils.ts (861)    #   Room modes, Schroeder, RT60, vibrato, cumulative growth
    classifier.ts (747)       #   10-feature Bayesian classification
    algorithmFusion.ts (745)  #   6-algo fusion, comb, IHR, PTMR, MINDS, content detection
    feedbackHistory.ts (467)  #   Session history, repeat offenders, hotspot tracking
    trackManager.ts (466)     #   Track lifecycle, cents-based association (100-cent tolerance)
    dspWorker.ts (434)        #   Worker orchestrator, temporal smoothing
    eqAdvisor.ts (402)        #   GEQ/PEQ/shelf recs, ERB scaling, MINDS depth
    workerFft.ts (369)        #   Radix-2 FFT, AlgorithmEngine, phase extraction
    advisoryManager.ts (292)  #   3-layer dedup, band cooldown, memory bounds (max 200)
    msdAnalysis.ts (169)      #   Worker-side MSD + AmplitudeHistoryBuffer + PhaseHistoryBuffer
    compressionDetection.ts(161)# Spectral flatness, crest factor, kurtosis
    phaseCoherence.ts (129)   #   Phase coherence via circular statistics
    decayAnalyzer.ts (86)     #   RT60 decay comparison for room mode suppression
    severityUtils.ts (18)     #   Severity urgency mapping
    advancedDetection.ts (16) #   Barrel re-export
  canvas/spectrumDrawing.ts(562)# Pure canvas drawing (no React)
  export/ (3 files)           # PDF/TXT/CSV/JSON export
  calibration/ (3 files)      # Room profile, session recording, JSON export
  storage/ktrStorage.ts (183) # Typed localStorage abstraction
  data/ (4 files)             # Anonymous spectral collection (opt-out)
  utils/ (2 files)            # Math helpers, pitch utilities
types/
  advisory.ts (~384)          # All DSP interfaces (Advisory, DetectorSettings, Track, etc.)
  calibration.ts (~157)       # Room profile, calibration export types
  data.ts (~126)              # Consent, snapshot, worker message types
tests/
  dsp/ (7 files)              # Integration/scenario tests (~135 tests)
  vitest.config.ts            # Test configuration
  helpers/                    # Mock algorithm score builders
```

## Key Performance Constraints

- **FeedbackDetector.analyze() is the hot path.** Runs every 20ms (50fps). Every optimization matters.
- **MSD uses pooled sparse allocation:** 256 slots x 64 frames = 64KB (vs 1MB dense). O(1) slot allocation, O(256) LRU eviction.
- **Prefix sum for O(1) prominence:** Float64Array prefix sum enables neighborhood averaging without per-bin loops.
- **EXP_LUT:** 1001-entry precomputed dB-to-linear table. Use instead of Math.pow() in hot loops.
- **Skip-threshold:** Bins 12dB below threshold skip the LUT entirely.
- **Canvas at 30fps, not 60fps.** Sufficient for spectrum visualization. Saves 50% GPU.
- **Worker backpressure:** If worker is still processing, next peak is DROPPED (not queued). Real-time > completeness.
- **Transferable buffers:** spectrum and timeDomain Float32Arrays are transferred (zero-copy) to worker, then returned via `returnBuffers` message. No allocation after init.

## Coding Conventions

- **Components:** PascalCase, `memo()`, `'use client'` directive
- **Hooks:** `use` prefix, camelCase
- **Types:** PascalCase interfaces in `types/advisory.ts`, `types/calibration.ts`, `types/data.ts`
- **Constants:** SCREAMING_SNAKE_CASE in `lib/dsp/constants.ts` (single source of truth)
- **Private members:** `_prefixed`
- **Imports:** Always `@/*` path alias
- **Canvas functions:** Pure (no React deps), take ctx + dimensions + data as params
- **Styling:** Tailwind utilities + `cn()` from `lib/utils.ts`
- **JSDoc:** Required on all DSP functions. Include academic references.
- **Testing:** Vitest. Co-located unit tests in `__tests__/`, scenario tests in `tests/dsp/`
- **ESLint:** Flat config, `@typescript-eslint/no-explicit-any: error`. React 19 experimental rules downgraded to warn.
- **Build gate:** `npx tsc --noEmit && pnpm test && pnpm build` — all must pass
- **Export formats:** PDF uses dynamic `import()` to avoid bundling jsPDF unless needed; CSV/JSON/TXT are synchronous

## Operation Modes (8 presets in constants.ts)

| Mode | Threshold (dB) | Silence (dBFS) | MSD Weight | Use Case |
|------|---------------|----------------|------------|----------|
| speech | 30 | -65 | 0.33 | Conferences, lectures |
| worship | 35 | -58 | 0.33 | Churches (reverberant) |
| liveMusic | 42 | -45 | 0.08 | Concerts (dense harmonics) |
| theater | 28 | -58 | 0.33 | Drama, musicals |
| monitors | 15 | -45 | 0.33 | Stage wedges (fastest) |
| ringOut | 12 | -70 | 0.33 | Calibration (most sensitive) |
| broadcast | 22 | -70 | 0.33 | Studios, podcasts |
| outdoor | 38 | -45 | 0.33 | Festivals (wind-resistant) |

## CI/CD

- **Build gate:** `ci.yml` — tsc + test + build on every push/PR
- **Versioning:** `0.{PR_NUMBER}.0` on PR merge, patch increment on direct push. Both `[skip ci]`.
- **Deployment:** Vercel auto-deploys on push to `main`
- **Version flow:** `package.json` version -> `next.config.mjs` reads via `readFileSync` -> `NEXT_PUBLIC_APP_VERSION` env -> HeaderBar + HelpMenu

## Security Notes

- **CSP:** Restrictive prod policy, relaxed dev policy with hot reload support
- **Permissions-Policy:** `microphone=(self), camera=(), geolocation=()`
- **Zero XSS vectors:** No direct HTML injection, no dynamic code execution
- **API:** Ingest endpoint validates schema, rate-limits (6/60s per session), caps payload (512KB), strips IP
- **Worker:** postMessage has no type validation (KNOWN ISSUE — add Set of valid types)
- **localStorage:** 37 touchpoints, all via ktrStorage.ts abstraction with try/catch

## Accessibility Notes

- **MobileLayout:** Exemplary WAI-ARIA tabs (roving tabindex, ArrowLeft/Right/Home/End)
- **Color contrast:** All combinations pass WCAG AA (lowest: 5.1:1 destructive red on dark bg)
- **Canvas:** NOT accessible to screen readers (KNOWN ISSUE — add aria-live region for peak announcements)
- **Touch targets:** Most >=44x44px. Advisory dismiss button is 32px (KNOWN ISSUE — increase)
- **Focus indicators:** Inconsistent on custom components (KNOWN ISSUE — add focus-visible:ring-2)
- **Reduced motion:** `prefers-reduced-motion` block exists in globals.css

## Data Privacy

- **Analysis:** All audio processing runs locally in the browser. No audio is transmitted.
- **Data collection:** Anonymous spectral snapshots (opt-out). No PII. Random session UUIDs. IP stripped server-side.
- **Consent:** Opt-out model (US). Needs opt-in for GDPR jurisdictions before EU launch.
- **Storage:** Settings and history in localStorage only. Never transmitted unless user explicitly exports.
