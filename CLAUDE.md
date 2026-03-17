# CLAUDE.md — Kill The Ring Project Intelligence

> **Last updated March 2026. 144 TypeScript/TSX files, 445 tests (441 pass, 4 skip, 1 todo), 25 suites. Version 0.127.0.**

## CRITICAL RULES

- **NEVER run `git push` unless the user explicitly says "push" or "send to GitHub".** Committing locally is fine. Pushing is NOT. No exceptions.
- **Build verification after every change:** `npx tsc --noEmit && pnpm test`
- **Do not modify audio output.** KTR is analysis-only. It listens and advises. It never modifies the audio signal.

## Project Overview

**Kill The Ring** (killthering.com) is a browser-based real-time acoustic feedback detection PWA for live sound engineers. It captures microphone input via the Web Audio API, identifies feedback frequencies using six fused detection algorithms, and delivers EQ recommendations with pitch translation. Version 0.119.0. Repository: github.com/donwellsav/killthering.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript 5.7 (strict mode, zero `any`) |
| UI | shadcn/ui (New York), Tailwind CSS v4, Radix primitives |
| Audio | Web Audio API (AnalyserNode, 8192-point FFT at 50fps) |
| DSP Offload | Web Worker (dspWorker.ts, ~458 lines) |
| Visualization | HTML5 Canvas at 30fps |
| State | React 19 hooks + 4 context providers (no external state library) |
| Testing | Vitest (435 tests, 25 suites, under 11s) |
| Error Reporting | Sentry (browser + server + worker runtimes) |
| PWA | Serwist (service worker, offline caching, installable) |
| Package Manager | pnpm |

## Commands

```bash
pnpm dev              # Dev server on :3000 (Turbopack, no SW)
pnpm build            # Production build (webpack, generates SW)
pnpm start            # Production server
pnpm lint             # ESLint (flat config)
pnpm test             # Vitest (444 tests: 440 pass + 4 skip + 1 todo)
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
      -> classifyTrackWithAlgorithms() [11 features]
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

1. `AudioAnalyzerProvider` — Compound provider nesting 4 focused contexts:
   - `EngineContext` (11 fields) — isRunning, start/stop, devices, dspWorker
   - `SettingsContext` (5 fields) — settings, updateSettings, mode/freq changes
   - `DetectionContext` (3 fields) — advisories, earlyWarning
   - `MeteringContext` (10 fields) — spectrumRef, inputLevel, autoGain, noiseFloor
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

### Multiplicative Gates (post-fusion and classifier)

- **IHR gate:** When harmonicsFound>=3 AND IHR>0.35, feedbackProbability *= 0.65 (instrument suppression). File: `algorithmFusion.ts`
- **PTMR gate:** When PTMR feedbackScore under 0.2, feedbackProbability *= 0.80 (broad peak suppression). File: `algorithmFusion.ts`
- **Formant gate:** When 2+ active peaks fall in distinct vocal formant bands (F1/F2/F3) AND current peak Q is 3–20, pFeedback *= 0.65. Suppresses sustained vowel FP. File: `classifier.ts`
- **Chromatic quantization gate:** When peak frequency snaps to 12-TET semitone grid (±5 cents) AND phase coherence > 0.80, phase score contribution scaled by 0.60 (40% reduction). Suppresses Auto-Tune FP. File: `classifier.ts`
- **Comb stability gate:** CombStabilityTracker monitors fundamentalSpacing CV across 16 frames. When CV > 0.05 (sweeping), comb confidence *= 0.25. Suppresses flanger/phaser FP. File: `algorithmFusion.ts`

## Known Bugs (Priority Order)

### Recently Fixed

| Bug | Fix | Version |
|-----|-----|---------|
| Auto-gain EMA coefficients stale in `updateConfig()` | `_recomputeEmaCoefficients()` called from both `start()` and `updateConfig()` | v0.105.0 |
| Confidence formula floors at 0.5 (UNCERTAIN unreachable) | Changed to `prob * (0.5 + 0.5 * agreement)` | v0.105.0 |
| Post-override normalization undoes RUNAWAY pFeedback=0.85 | Normalization before overrides; overrides are final | v0.105.0 |
| `existing` weight (0.04) double-counts features | Removed from all profiles, redistributed to IHR+PTMR | v0.105.0 |
| Comb weight doubling dilutes others by 7.4% | Doubled weight in numerator only, base weight in denominator | v0.105.0 |
| No worker crash recovery | Auto-restart: 500ms debounce, max 3 retries, Sentry logging | v0.105.0 |
| SpectrumCanvas missing devicePixelRatio (blurry on Retina) | Full DPR scaling: buffer, CSS style, `ctx.scale(dpr, dpr)` | v0.105.0 |
| Dual MSD implementations | Consolidated into single `MSDPool` class in `msdPool.ts` | v0.98.0 |
| Only axial room modes (tangential + oblique missing) | `calculateRoomModes()` now handles all three mode types | v0.105.0 |
| PRIOR_PROBABILITY = 0.33 (uniform priors) | Per-class priors: feedback=0.45, whistle=0.27, instrument=0.27 | v0.105.0 |
| Settings slider fires per-frame (no debounce) | 100ms debounce with merge accumulation in `KillTheRing.tsx` | v0.105.0 |
| TS2688: Missing @serwist/next type definition | Types declared in `tsconfig.json` | v0.98.0 |
| Persistence thresholds frame-count-based (FUTURE-002) | ms-based thresholds with runtime `Math.ceil(ms / intervalMs)` | v0.105.0 |

### High (P1)

~~1. **Zero tests for hooks, components, contexts, exports, storage.** 373 tests cover DSP only.~~ **FIXED v0.119.0** — 62 new tests across 10 modules (hooks, contexts, storage, exports). 435 total tests, 25 suites.

### Medium (P2)

~~2. `analyze()` is ~420 lines — decompose into `_detectPeaks()`, `_updateAutoGain()`, `_computeSpectrum()`, etc.~~ **FIXED v0.121.0** — Decomposed into 4 extracted methods: `_measureSignalAndApplyGain()`, `_buildPowerSpectrum()`, `_scanAndProcessPeaks()`, `_registerPeak()`. `analyze()` is now ~45 lines.
~~3. `AudioAnalyzerContext` is god-context mixing engine/settings/detection (28 fields). Split into 3-4 focused contexts.~~ **FIXED v0.122.0** — Split into 4 focused contexts: `EngineContext` (11), `SettingsContext` (5), `MeteringContext` (10), `DetectionContext` (3). All consumers migrated to narrowest hooks. `useAudio()` retained as deprecated shim.
~~4. No shelf overlap validation in eqAdvisor.~~ **FIXED v0.123.0** — Added `validateShelves()` post-processing (dedup by type, HPF < lowShelf sanity check, cap at 3). HPF-active raises mud threshold +2 dB to prevent overlap in 80–300 Hz region. Cross-advisory dedup: shelves computed once per analysis frame in worker, shared across all peaks.
~~5. `HelpMenu.tsx` is 991 lines doing 3+ things — split.~~ **FIXED v0.124.0** — Split into thin orchestrator (~90 lines) + `help/` subdirectory (6 files: HelpShared, GuideTab, ModesTab, AlgorithmsTab, ReferenceTab, AboutTab). Mirrors `settings/` pattern.
~~6. No tablet responsive breakpoint (CSS var `--breakpoint-tablet: 600px` defined but not wired to components).~~ **FIXED v0.125.0** — Wired `tablet:` Tailwind v4 prefix (600px) to MobileLayout (`tablet:hidden` on 3 portrait-only elements), DesktopLayout (`tablet:flex tablet:landscape:hidden`), and HeaderBar. Portrait tablets now get desktop layout. `useIsMobile()` threshold lowered from 768→600 so tablets skip smartphone mic calibration.

### Low (P3)

~~7. `unsafe-inline` in production script-src CSP (required by Next.js).~~ **FIXED v0.126.0** — Replaced with nonce-based CSP via `middleware.ts`. Per-request nonce + `'strict-dynamic'` in script-src. Dev mode keeps `unsafe-inline` for Turbopack hot reload. `style-src 'unsafe-inline'` retained (low risk, required by Tailwind/React).
~~8. No security scanning in CI (Snyk/Dependabot/npm audit).~~ **FIXED v0.127.0** — Added `pnpm audit --prod --audit-level=high` to CI (fails on high/critical CVEs in production deps). Added `.github/dependabot.yml` for weekly grouped npm updates + monthly GitHub Actions updates.

## Known False Positives

| Scenario | Mode | Original Prob | Mitigation | Status |
|----------|------|--------------|------------|--------|
| Sustained vowel | Speech | 0.703 | Formant gate: pFeedback *= 0.65 when 2+ formant bands active + Q 3–20 (`classifier.ts`) | **MITIGATED** |
| Auto-Tuned vocal | Compressed | 0.785 | Chromatic quantization gate: phase boost *= 0.60 when frequency on 12-TET grid ±5 cents + coherence > 0.80 (`classifier.ts`) | **MITIGATED** |
| Flanger/phaser pedal | Music | 0.681 | CombStabilityTracker: comb confidence *= 0.25 when spacing CV > 0.05 over 16 frames (`algorithmFusion.ts`) | **MITIGATED** |

## Project Structure

```
middleware.ts (53)              # Per-request nonce CSP (replaces static unsafe-inline)
app/                          # Next.js App Router
  layout.tsx (54)             #   Root layout, Geist fonts, metadata
  page.tsx (5)                #   Entry -> KillTheRingClient
  global-error.tsx (56)       #   Sentry error boundary
  sw.ts (38)                  #   Serwist service worker
  api/v1/ingest/route.ts (160)#   Spectral snapshot ingest (v1.1 schema, rate-limited, IP-stripped)
components/
  kill-the-ring/ (29 files)   # Domain components + barrel index.ts
    help/ (6 files)           # Help tab components (mirrors settings/ pattern)
    KillTheRing.tsx (436)     #   Root orchestrator, settings debounce, FP handling
    HeaderBar.tsx (220)       #   Header bar with permanent Clear All button
    IssuesList.tsx (440)      #   Advisory cards with FALSE+ below Copy/Dismiss, 3s stability
    settings/ (7 files)       # Settings tab components
  ui/ (20 files)              # shadcn/ui primitives
contexts/ (8 files)           # React context providers
  AudioAnalyzerContext (195)  #   Compound provider: nests Engine/Settings/Metering/Detection
  EngineContext (42)          #   Engine lifecycle, devices, dspWorker (11 fields)
  SettingsContext (30)        #   Settings, updateSettings, mode/freq (5 fields)
  MeteringContext (38)        #   Spectrum, inputLevel, autoGain, noiseFloor (10 fields)
  DetectionContext (25)       #   Advisories, earlyWarning (3 fields)
  AdvisoryContext (190)       #   Advisory state, dismiss/clear/FP, derived booleans
  UIContext (162)             #   Mobile tab, freeze, fullscreen, RTA fullscreen, layout reset
  PortalContainerContext (23) #   Portal mount for mobile overlays
hooks/ (11 files)             # Custom hooks
  useDSPWorker.ts (359)       #   Worker lifecycle, crash recovery, userFeedback
lib/
  dsp/ (17 modules)           # DSP engine (8,057 lines):
    feedbackDetector.ts (1721)#   Core: peak detection, MSD pool, auto-gain, persistence
    constants.ts (961)        #   All tuning constants, 8 mode presets, ECM8000 cal curve, mobile constants
    acousticUtils.ts (861)    #   Room modes, Schroeder, RT60, vibrato, cumulative growth
    classifier.ts (850)       #   11-feature Bayesian classification + formant/chromatic gates
    algorithmFusion.ts (823)  #   6-algo fusion, comb, IHR, PTMR, MINDS, CombStabilityTracker
    feedbackHistory.ts (467)  #   Session history, repeat offenders, hotspot tracking
    trackManager.ts (466)     #   Track lifecycle, cents-based association (100-cent tolerance)
    dspWorker.ts (458)        #   Worker orchestrator, temporal smoothing, ML score extraction
    eqAdvisor.ts (402)        #   GEQ/PEQ/shelf recs, ERB scaling, MINDS depth
    workerFft.ts (389)        #   Radix-2 FFT, AlgorithmEngine, phase extraction
    advisoryManager.ts (292)  #   3-layer dedup, band cooldown, memory bounds (max 200)
    msdPool.ts (267)          #   Consolidated MSD pool (sparse, LRU eviction, 64KB)
    msdAnalysis.ts (170)      #   [DEPRECATED] Worker-side MSD + AmplitudeHistoryBuffer + PhaseHistoryBuffer
    compressionDetection.ts(161)# Spectral flatness, crest factor, kurtosis
    phaseCoherence.ts (129)   #   Phase coherence via circular statistics
    decayAnalyzer.ts (86)     #   RT60 decay comparison for room mode suppression
    severityUtils.ts (18)     #   Severity urgency mapping
    advancedDetection.ts (16) #   Barrel re-export
  canvas/spectrumDrawing.ts(605)# Pure canvas drawing (no React), RTA label overlap suppression
  export/ (3 files)           # PDF/TXT/CSV/JSON export
  calibration/ (3 files)      # Room profile, session recording, JSON export
  storage/ktrStorage.ts (183) # Typed localStorage abstraction
  data/ (4 files)             # Anonymous spectral collection (opt-out, v1.1 with algo scores)
    snapshotCollector.ts (324)#   Batch collection, algorithm score enrichment, user feedback
  utils/ (2 files)            # Math helpers, pitch utilities
types/
  advisory.ts (~384)          # All DSP interfaces (Advisory, DetectorSettings, Track, etc.)
  calibration.ts (~157)       # Room profile, calibration export types
  data.ts (~153)              # Consent, snapshot, worker message types, MarkerAlgorithmScores
tests/
  dsp/ (7 files)              # Integration/scenario tests (~135 tests)
  vitest.config.ts            # Legacy test configuration (root vitest.config.ts is primary)
  helpers/                    # Mock algorithm score builders
hooks/__tests__/ (4 files)    # Hook unit tests (useAdvisoryMap, useFpsMonitor, useAdvisoryLogging, useIsMobile)
contexts/__tests__/ (2 files) # Context unit tests (AdvisoryContext, UIContext)
lib/storage/__tests__/ (1 file)  # ktrStorage unit tests
lib/export/__tests__/ (3 files)  # Export module unit tests (txt, pdf, downloadFile)
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

- **Build gate:** `ci.yml` — audit + tsc + lint + test + build on every push/PR
- **Dependency updates:** Dependabot — weekly npm PRs (grouped by prod/dev), monthly Actions PRs
- **Versioning:** `0.{PR_NUMBER}.0` on PR merge, patch increment on direct push. Both `[skip ci]`.
- **Deployment:** Vercel auto-deploys on push to `main`
- **Version flow:** `package.json` version -> `next.config.mjs` reads via `readFileSync` -> `NEXT_PUBLIC_APP_VERSION` env -> HeaderBar + HelpMenu

## Security Notes

- **CSP:** Nonce-based `script-src` in prod (middleware.ts), `'unsafe-inline'` in dev for hot reload. `style-src 'unsafe-inline'` in both (required by Tailwind/React).
- **Permissions-Policy:** `microphone=(self), camera=(), geolocation=()`
- **Zero XSS vectors:** No direct HTML injection, no dynamic code execution
- **API:** Ingest endpoint validates v1.0/v1.1 schema, rate-limits (6/60s per session), caps payload (512KB), strips IP
- **Worker:** Inbound messages type-validated via `WorkerOutboundMessage` switch; outbound postMessage lacks compile-time Set validation (minor gap)
- **localStorage:** 37 touchpoints, all via ktrStorage.ts abstraction with try/catch

## Accessibility Notes

- **MobileLayout:** Exemplary WAI-ARIA tabs (roving tabindex, ArrowLeft/Right/Home/End)
- **Color contrast:** All combinations pass WCAG AA (lowest: 5.1:1 destructive red on dark bg)
- **Canvas:** NOT accessible to screen readers (KNOWN ISSUE — add aria-live region for peak announcements)
- **Touch targets:** Most >=44x44px. Advisory dismiss is 44px on mobile (`touchFriendly`), 20px on desktop (KNOWN ISSUE — increase desktop size)
- **Focus indicators:** Partially applied (`focus-visible:ring-2` on some components, inconsistent on others)
- **Reduced motion:** `prefers-reduced-motion` block exists in globals.css

## Data Privacy

- **Analysis:** All audio processing runs locally in the browser. No audio is transmitted.
- **Data collection:** Anonymous spectral snapshots (opt-out). No PII. Random session UUIDs. IP stripped server-side.
- **Consent:** Opt-out model (US). Needs opt-in for GDPR jurisdictions before EU launch.
- **Storage:** Settings and history in localStorage only. Never transmitted unless user explicitly exports.

## ML Data Pipeline (v0.106.0+)

- **Snapshot enrichment:** Every `FeedbackMarker` includes `MarkerAlgorithmScores` with all 6 algorithm scores (MSD, phase, spectral, comb, IHR, PTMR) plus fused probability and confidence. Schema version `1.1` (backward-compatible with `1.0`).
- **Ground truth labeling:** Always-on FALSE+ button on every advisory card (not just calibration mode). User feedback flows via `userFeedback` worker message to `snapshotCollector.applyUserFeedback()`, labeling pending batch events as `correct` or `false_positive`.
- **Ingest API v1.1:** `app/api/v1/ingest/route.ts` accepts optional `algorithmScores` and `userFeedback` fields with validation. Backward-compatible — v1.0 payloads still accepted.
- **Data flow:** Advisory card → `handleFalsePositive()` in `KillTheRing.tsx` → `dspWorker.sendUserFeedback()` → worker `applyUserFeedback()` → snapshot batch labeled for future ML training.
- **Future:** ONNX Runtime Web as 7th fusion algorithm (weight ~0.10–0.12). Deferred until sufficient ground-truth-labeled data is collected (~10K+ events).

## UI Features (v0.107.0+)

- **Permanent Clear All button:** Trash icon always visible in header. Calls `onClearAll()` + `onClearGEQ()` + `onClearRTA()` in one click. Visually dimmed (`text-muted-foreground/30`) when nothing to clear.
- **FALSE+ card layout:** FALSE+ button renders on its own row beneath Copy/Dismiss icons in each `IssueCard`, improving visual hierarchy and reducing misclick risk.
- **RTA fullscreen:** Element-level Fullscreen API via `UIContext`. Toggle button in header (Maximize2/Minimize2). Works on mobile and desktop.
- **Landscape mobile layout:** 40/55/5 split (Issues/Graph/Controls) in landscape orientation. Portrait keeps 3-tab carousel.
- **Issue card simplification:** GEQ removed from cards (PEQ only). Compact buttons with larger icons. 3s minimum display time for stability.
- **Mobile advisory limit:** Top 5 most problematic frequencies shown (`MOBILE_MAX_DISPLAYED_ISSUES` in constants.ts).
- **Auto MEMS calibration:** Smartphone MEMS mic profile auto-applied on mobile devices.
- **RTA label overlap suppression:** Greedy algorithm in `spectrumDrawing.ts` prioritizes highest-severity labels, prevents clutter.
