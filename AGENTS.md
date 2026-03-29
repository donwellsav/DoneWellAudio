# AGENTS.md — DoneWell Audio

> **Version 0.22.0 | March 2026 | 169 TypeScript/TSX files | 985 tests (981 pass, 4 skip) | 46 suites**

## Critical Rules

- **NEVER run `git push`** unless the user explicitly says "push" or "send to GitHub". Committing locally is fine. Pushing is NOT.
- **Build verification after every change:** `npx tsc --noEmit && pnpm test`
- **Do not modify audio output.** DoneWell Audio is analysis-only. It listens and advises. It never modifies the audio signal.
- **Use `pnpm`, not `npm` or `yarn`.** The project enforces `pnpm@10.30.1` via `packageManager` in `package.json`.
- **Zero `any` types.** TypeScript strict mode is enforced. `@typescript-eslint/no-explicit-any: error`.

## Commands

```bash
pnpm dev              # Dev server on :3000 (Turbopack)
pnpm build            # Production build (webpack, generates SW)
pnpm test             # Vitest (985 tests, 46 suites)
pnpm test:watch       # Vitest watch mode
pnpm test:coverage    # Vitest with V8 coverage
pnpm lint             # ESLint (flat config)
npx tsc --noEmit      # Type-check (run BEFORE pnpm build)
```

Build gate — all must pass before committing:
```bash
npx tsc --noEmit && pnpm test
```

## Project Overview

**DoneWell Audio** is a browser-based real-time acoustic feedback detection PWA for live sound engineers. It captures microphone input via the Web Audio API, identifies feedback frequencies using six fused detection algorithms plus an ML model, and delivers EQ recommendations with pitch translation. All audio processing runs locally in the browser — no audio is transmitted.

**URL:** donewellaudio.com
**Repo:** github.com/donwellsav/donewellaudio

## Tech Stack

- **Framework:** Next.js 16 (App Router, Turbopack dev / webpack prod)
- **Language:** TypeScript 5.7 (strict mode)
- **UI:** shadcn/ui (New York), Tailwind CSS v4, Radix primitives
- **Audio:** Web Audio API (AnalyserNode, 8192-point FFT at 50fps)
- **DSP Offload:** Web Worker (`dspWorker.ts`)
- **Visualization:** HTML5 Canvas at 30fps
- **State:** React 19 hooks + 4 context providers (no external state library)
- **Testing:** Vitest
- **Error Reporting:** Sentry
- **PWA:** Serwist (service worker, offline caching)
- **Package Manager:** pnpm 10.30.1

## Architecture

### Audio Pipeline

```
Mic → getUserMedia → GainNode → AnalyserNode (8192 FFT)
  → FeedbackDetector.analyze() at 50fps (main thread)
    → Peak detection with MSD/prominence/persistence
    → postMessage(peak, spectrum, timeDomain) [transferable]
      → Web Worker: AlgorithmEngine.computeScores()
      → fuseAlgorithmResults() [content-adaptive weights]
      → classifyTrackWithAlgorithms() [11 features]
      → generateEQAdvisory()
      → AdvisoryManager.createOrUpdate() [3-layer dedup]
      → postMessage(advisory) back to main thread
        → useAdvisoryMap → React render → Canvas + Advisory cards
```

### Thread Model

- **Main thread:** AudioContext, AnalyserNode, FeedbackDetector (peak detection), requestAnimationFrame (canvas 30fps), React rendering
- **Web Worker:** Classification, algorithm fusion, EQ advisory, track management. Communicates via transferable Float32Arrays (zero-copy).

### Detection Algorithms (7 total)

1. **MSD** — Magnitude stability (feedback ≈ 0, music >> 0)
2. **Phase Coherence** — Frame-to-frame phase stability
3. **Spectral Flatness** — Geometric/arithmetic mean + kurtosis + crest
4. **Comb Pattern** — Evenly-spaced peaks from acoustic loop
5. **IHR** — Inter-harmonic energy ratio
6. **PTMR** — Peak-to-median ratio
7. **ML (ONNX)** — Bootstrap MLP 11→32→16→1 (929 params, 4KB)

Content-adaptive weights vary by mode (speech, worship, liveMusic, theater, monitors, ringOut, broadcast, outdoor).

### Post-Fusion Gates

- **IHR gate:** harmonics ≥ 3 AND IHR > 0.35 → pFeedback *= 0.65 (instrument suppression)
- **PTMR gate:** PTMR score < 0.2 → pFeedback *= 0.80 (broad peak suppression)
- **Formant gate:** 2+ peaks in vocal formant bands + Q 3–20 → pFeedback *= 0.65
- **Chromatic gate:** Frequency on 12-TET grid ±5 cents + coherence > 0.80 → phase *= 0.60
- **Comb stability gate:** Spacing CV > 0.05 over 16 frames → comb *= 0.25
- **Mains hum gate:** Peak on 50n/60n Hz + 2 corroborating peaks → pFeedback *= 0.40

## Key File Paths

```
app/layout.tsx                    # Root layout
app/page.tsx                      # Entry point
components/analyzer/              # Domain components (28 files)
  AudioAnalyzer.tsx               #   Root orchestrator
  HeaderBar.tsx                   #   Header bar (amber sidecar theme)
  DesktopLayout.tsx               #   Desktop 3-panel layout
  MobileLayout.tsx                #   Mobile portrait/landscape layouts
  IssuesList.tsx                  #   Advisory cards with swipe gestures
  VerticalGainFader.tsx           #   Fader strip (w-20, 80px)
  settings/SettingsPanel.tsx      #   4-tab settings with controlled tabs
  help/HelpShared.tsx             #   HelpSection + HelpGroup components
contexts/                         # 4 context providers + compound wrapper
  AudioAnalyzerContext.tsx        #   Engine/Settings/Metering/Detection
  AdvisoryContext.tsx             #   Advisory state management
  UIContext.tsx                   #   UI state (tabs, freeze, fullscreen)
hooks/                            # Custom hooks (11 files)
  useDSPWorker.ts                 #   Worker lifecycle, crash recovery
lib/dsp/                          # DSP engine (18 modules)
  feedbackDetector.ts             #   Core: peak detection, auto-gain (HOT PATH)
  constants.ts                    #   All tuning constants, 8 mode presets
  classifier.ts                   #   11-feature Bayesian classification
  algorithmFusion.ts              #   6-algo fusion + gates
  dspWorker.ts                    #   Worker orchestrator
  eqAdvisor.ts                    #   GEQ/PEQ/shelf recommendations
  trackManager.ts                 #   Track lifecycle, cents-based association
lib/canvas/spectrumDrawing.ts     # Canvas rendering (no React deps)
types/advisory.ts                 # All DSP interfaces
```

## Coding Conventions

- **Components:** PascalCase, `memo()`, `'use client'` directive
- **Hooks:** `use` prefix, camelCase
- **Constants:** SCREAMING_SNAKE_CASE in `lib/dsp/constants.ts`
- **Imports:** Always `@/*` path alias
- **Styling:** Tailwind utilities + `cn()` from `lib/utils.ts`
- **JSDoc:** Required on all DSP functions with academic references
- **Testing:** Vitest. Co-located unit tests in `__tests__/`, scenario tests in `tests/dsp/`

## Performance Constraints

- `FeedbackDetector.analyze()` is the **hot path** — runs every 20ms (50fps)
- MSD uses pooled sparse allocation: 256 slots × 64 frames = 64KB
- Canvas renders at 30fps (not 60fps)
- Worker backpressure: if worker is still processing, next peak is DROPPED
- Transferable buffers: Float32Arrays are zero-copy transferred to worker

## Testing

- 985 tests across 46 suites (under 12s)
- Coverage thresholds: lines 80%, functions 80%, branches 70%
- Test patterns: `lib/**/__tests__/**`, `tests/**`, `hooks/__tests__/**`, `contexts/__tests__/**`
- Run after every change: `npx tsc --noEmit && pnpm test`

## Version Scheme

`0.{PR_NUMBER}.0` — minor version matches the GitHub PR number.

## Security

- CSP: Nonce-based `script-src` in prod (`middleware.ts`)
- Permissions-Policy: `microphone=(self), camera=(), geolocation=()`
- API: Ingest endpoint validates schema, dual rate-limiting, strips IP
- All localStorage access via `dwaStorage.ts` abstraction
