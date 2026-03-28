# CLAUDE.md — DoneWell Audio Project Intelligence

> **Last updated March 2026. 169 TypeScript/TSX files, 944 tests (940 pass, 4 skip), 43 suites. Version 0.22.0.**
> Ring-out room mode hints. Per-mode track timeouts. Deploy guard hook. Notch overlay opacity 42%.

## CRITICAL RULES

- **NEVER run `git push` unless the user explicitly says "push" or "send to GitHub".** Committing locally is fine. Pushing is NOT. No exceptions.
- **Build verification after every change:** `npx tsc --noEmit && pnpm test`
- **Do not modify audio output.** DoneWell Audio is analysis-only. It listens and advises. It never modifies the audio signal.

## Risk-First Planning

When the user asks you to plan, design, build, or change anything non-trivial:

1. **RISK ASSESSMENT first.** Before proposing HOW, identify WHAT COULD GO WRONG:
   - Which of the 16 Change Impact Audit systems does this touch? List them.
   - What are 2-3 failure modes, edge cases, or unintended consequences?
   - What assumptions are we making? What DON'T we know?
   - What is the blast radius if this goes wrong? (isolated file vs. hot path vs. entire audio pipeline)
   - Are there ordering dependencies? (e.g., "must update types before updating consumers")

2. **Challenge your own plan.** After presenting the implementation approach, add a "Devil's Advocate" section:
   - "A skeptic would ask: ..."
   - "This could fail if: ..."
   - "We're assuming X, but if X is wrong: ..."

3. **Scope declaration.** Before writing any code, declare the PLANNED SCOPE:
   - Files to modify (full paths)
   - Systems affected (from Change Impact Audit table)
   - Files explicitly NOT being modified

This scope declaration becomes the baseline for scope drift detection during implementation.

For trivial changes (typo, comment, single-value tweak), say "TRIVIAL — skipping risk assessment" and proceed.

## 3-Ring Safety Architecture

Three concentric trust rings enforce correctness and prevent accidental or coerced harm:

- **Outer ring (GitHub):** Branch rulesets on `main` (no direct push, required CI), CODEOWNERS, production environment with required reviewer, pinned Actions versions. Repo-owner managed — not Claude's concern.
- **Middle ring (Managed Claude Policy):** Anthropic policy layer. Claude never bypasses `--no-verify`, force-pushes `main`, or takes destructive actions without explicit user direction.
- **Inner ring (Repo-local hooks):** `.claude/hooks/` — mechanically enforced in every session:

| Hook | Event | What it enforces |
|------|-------|-----------------|
| `claim-contract.js` | UserPromptSubmit | Every response must have a verifiable factual basis |
| `bash-protection.js` | PreToolUse/Bash | Blocks rm hooks, write to markers, force push, hard reset, direct push to main |
| `deploy-guard.js` | PreToolUse/Bash | Blocks `vercel deploy` / `npx vercel` without approved deploy marker |
| `pre-commit-gate.js` | PreToolUse/Bash | Blocks `git commit` unless build gate passed + CIA Phase 2 audit present |
| `cia-planning-gate.js` | PreToolUse/Edit\|Write | Enforces Phase 1 CIA (risk assessment) before non-trivial edits |
| `prose-fact-gate.js` | PreToolUse/Edit\|Write | Blocks hard factual claims in prose without evidence |
| `file-protection.js` | PreToolUse/Edit\|Write | Protects hooks/, settings files, CI workflows, control-plane files |
| `evidence-ledger.js` | PostToolUse/all | Appends every tool result as evidence to `%TEMP%/claude-evidence-ledger.jsonl` |
| `build-gate-marker.js` | PostToolUse/Bash | Writes build-gate marker (with tree hash) only when tsc + tests both pass |
| `session-cleanup.js` | SessionEnd | Cleans per-session temp directories |
| `fabrication-verifier.md` | Stop+SubagentStop | Agent hook: compares response claims against ledger; blocks unsupported hard claims |

### Two-Phase Change Impact Audit (CIA)

**Phase 1 — Planning gate** (before writing code): Identify affected systems from the 16-system table, 2-3 failure modes, blast radius, ordering dependencies. Required for non-trivial changes.

**Phase 2 — Pre-commit gate** (before `git commit`): Impact table + verdict. Must cover all systems touched. Written to `%TEMP%/claude-cia-audit.md`. `pre-commit-gate.js` reads and validates before allowing the commit.

The pre-commit hook also checks a `build-gate-marker` (tsc + tests must have passed on the current tree hash) and runs as `ask` (not auto-allow) so every commit requires explicit user approval.

## Git Workflow

- **Never push without explicit permission.** Always ask before running `git push` or creating PRs. The words "push", "PR", "send to GitHub", or "merge" must come from the user first.
- **Always `git fetch origin`** before reporting version numbers, branch status, or sync state. Stale local refs cause wrong version info.
- **Never amend published commits** or force-push unless explicitly asked.
- **`git commit` routes through `pre-commit-gate.js`** — build gate + CIA Phase 2 required. Hook returns `ask` so you approve each commit explicitly.

## Version Release Checklist

When the user asks to cut a release or "update the usuals":

1. Update `lib/changelog.ts` — add entry with version, date, changes
2. Update `components/analyzer/help/GuideTab.tsx` — fix any stale references
3. Update `package.json` version — `0.{next_PR_number}.0`
4. Update `CLAUDE.md` header — version, test count, file count, summary line
5. Commit locally
6. **Wait for user approval** before pushing, creating PR, or merging

## Project Overview

**DoneWell Audio** (donewellaudio.com) is a browser-based real-time acoustic feedback detection PWA for live sound engineers. It captures microphone input via the Web Audio API, identifies feedback frequencies using six fused detection algorithms, and delivers EQ recommendations with pitch translation. Version 0.13.0. Repository: github.com/donwellsav/donewellaudio.

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
| Testing | Vitest (799 tests, 39 suites, under 10s) |
| Error Reporting | Sentry (browser + server + worker runtimes) |
| PWA | Serwist (service worker, offline caching, installable) |
| Package Manager | pnpm |

## Commands

```bash
pnpm dev              # Dev server on :3000 (Turbopack, no SW)
pnpm build            # Production build (webpack, generates SW)
pnpm start            # Production server
pnpm lint             # ESLint (flat config)
pnpm test             # Vitest (799 tests: 795 pass + 4 skip)
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

## Seven Detection Algorithms (Six Classical + ML)

| # | Algorithm | Source | What It Measures | DEFAULT | SPEECH | MUSIC | COMP |
|---|-----------|--------|-----------------|---------|--------|-------|------|
| 1 | MSD | DAFx-16, Aalto 2016 | Magnitude stability (feedback=0, music>>0) | 0.27 | 0.30 | 0.07 | 0.11 |
| 2 | Phase Coherence | KU Leuven 2025 | Frame-to-frame phase stability | 0.23 | 0.22 | 0.32 | 0.27 |
| 3 | Spectral Flatness | Glasberg-Moore | Geometric/arithmetic mean + kurtosis + crest | 0.11 | 0.09 | 0.09 | 0.16 |
| 4 | Comb Pattern | DBX whitepaper | Evenly-spaced peaks from acoustic loop | 0.07 | 0.04 | 0.07 | 0.07 |
| 5 | IHR | Novel | Inter-harmonic energy ratio | 0.12 | 0.09 | 0.22 | 0.16 |
| 6 | PTMR | Novel | Peak-to-median ratio | 0.10 | 0.16 | 0.13 | 0.13 |
| 7 | ML (ONNX) | Bootstrap MLP | 11-feature MLP 11→32→16→1 (929 params, 4KB) | 0.10 | 0.10 | 0.10 | 0.10 |

### Multiplicative Gates (post-fusion and classifier)

- **IHR gate:** When harmonicsFound>=3 AND IHR>0.35, feedbackProbability *= 0.65 (instrument suppression). File: `algorithmFusion.ts`
- **PTMR gate:** When PTMR feedbackScore under 0.2, feedbackProbability *= 0.80 (broad peak suppression). File: `algorithmFusion.ts`
- **Formant gate:** When 2+ active peaks fall in distinct vocal formant bands (F1/F2/F3) AND current peak Q is 3–20, pFeedback *= 0.65. Suppresses sustained vowel FP. File: `classifier.ts`
- **Chromatic quantization gate:** When peak frequency snaps to 12-TET semitone grid (±5 cents) AND phase coherence > 0.80, phase score contribution scaled by 0.60 (40% reduction). Suppresses Auto-Tune FP. File: `classifier.ts`
- **Comb stability gate:** CombStabilityTracker monitors fundamentalSpacing CV across 16 frames. When CV > 0.05 (sweeping), comb confidence *= 0.25. Suppresses flanger/phaser FP. File: `algorithmFusion.ts`
- **Mains hum gate:** When peak is within ±2 Hz of a mains harmonic (50n or 60n Hz) AND 2+ other active peaks match the same series AND phase coherence > 0.70, pFeedback *= 0.40. Auto-detects 50 vs 60 Hz. Suppresses HVAC/electrical equipment FP. File: `classifier.ts`

## Known Bugs

All previously tracked bugs (P1–P3) have been resolved as of v0.127.0. All Phase 0 control surface bugs (B1–B7) are resolved as of v0.14.0. See git history for details.

## Known False Positives

| Scenario | Mode | Original Prob | Mitigation | Status |
|----------|------|--------------|------------|--------|
| Sustained vowel | Speech | 0.703 | Formant gate: pFeedback *= 0.65 when 2+ formant bands active + Q 3–20 (`classifier.ts`) | **MITIGATED** |
| Auto-Tuned vocal | Compressed | 0.785 | Chromatic quantization gate: phase boost *= 0.60 when frequency on 12-TET grid ±5 cents + coherence > 0.80 (`classifier.ts`) | **MITIGATED** |
| Flanger/phaser pedal | Music | 0.681 | CombStabilityTracker: comb confidence *= 0.25 when spacing CV > 0.05 over 16 frames (`algorithmFusion.ts`) | **MITIGATED** |
| HVAC/mains hum | All | ~0.80 | Mains hum gate: pFeedback *= 0.40 when peak on 50n/60n Hz series + 2 corroborating peaks + phase coherence > 0.70 (`classifier.ts`) | **MITIGATED** |

## Project Structure

```
middleware.ts (53)              # Per-request nonce CSP (replaces static unsafe-inline)
app/                          # Next.js App Router
  layout.tsx (54)             #   Root layout, Geist fonts, metadata
  page.tsx (5)                #   Entry -> KillTheRingClient
  global-error.tsx (56)       #   Sentry error boundary
  sw.ts (38)                  #   Serwist service worker
  api/v1/ingest/route.ts (160)#   Spectral snapshot ingest (v1.0/1.1/1.2 schema, rate-limited, IP-stripped)
components/
  analyzer/ (28 files)        # Domain components + barrel index.ts
    help/ (6 files)           # Help tab components (mirrors settings/ pattern)
    AudioAnalyzer.tsx         #   Root orchestrator, settings debounce, FP handling
    HeaderBar.tsx (191)       #   Header bar (zero props, permanent Clear All)
    IssuesList.tsx (440)      #   Advisory cards with swipe gestures, 3s stability
    DesktopLayout.tsx         #   Desktop 3-panel layout with room mode computation
    MobileLayout.tsx          #   Mobile portrait/landscape layouts (3 SpectrumCanvas instances)
    SpectrumCanvas.tsx        #   RTA canvas with room mode lines, notch overlays, markers
    KtrLogo.tsx               #   Brand SVG logo (frequency analyzer crosshair + EQ bars)
    RingOutWizard.tsx         #   Guided ring-out workflow with step tracking
    LandscapeSettingsSheet.tsx (58) # Bottom Sheet wrapper for mobile landscape settings
    settings/ (8 files)       # 4-tab settings: LiveTab, SetupTab, DisplayTab, AdvancedTab, CalibrationTab, RoomTab, SettingsPanel, SettingsShared
  ui/ (21 files)              # shadcn/ui primitives (includes accordion)
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
  useDSPWorker.ts (363)       #   Worker lifecycle, crash recovery, userFeedback
lib/
  dsp/ (18 modules)           # DSP engine + ML inference:
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
    mlInference.ts (~180)     #   ONNX Runtime Web ML inference, predictCached(), lazy model loading
    advancedDetection.ts (16) #   Barrel re-export
  canvas/spectrumDrawing.ts(949)# Pure canvas drawing (no React), RTA label overlap suppression, theme-aware notch overlays (70% opacity), frequency zone bands, label range merging
  export/ (3 files)           # PDF/TXT/CSV/JSON export
  calibration/ (3 files)      # Room profile, session recording, JSON export
  storage/dwaStorage.ts (183) # Typed localStorage abstraction
  data/ (4 files)             # Anonymous spectral collection (opt-out, v1.1 with algo scores)
    snapshotCollector.ts (343)#   Batch collection, algorithm score enrichment, user feedback, label balance tracking
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
lib/storage/__tests__/ (1 file)  # dwaStorage unit tests
lib/export/__tests__/ (3 files)  # Export module unit tests (txt, pdf, downloadFile)
lib/dsp/__tests__/ (1 file)     # mlInference unit tests (12 tests)
public/models/                  # ML model assets
  manifest.json                 #   Model registry (version, metrics, architecture)
  dwa-fp-filter-v1.onnx         #   Bootstrap ONNX model (929 params, 4KB)
scripts/ml/                     # ML training pipeline
  create_bootstrap_model.py     #   Generate ONNX from gate logic (numpy-only)
  export_training_data.py       #   Pull labeled events from Supabase to CSV
  train_fp_filter.py            #   Train MLP, export ONNX, update manifest
.github/workflows/ml-train.yml  # Weekly/manual ML training workflow
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
- **Canvas functions:** Pure (no React deps), take ctx + dimensions + data as params. Theme colors via `canvasThemeRef.current` (ref, not state — avoids re-render, read in RAF loop)
- **Styling:** Tailwind utilities + `cn()` from `lib/utils.ts`
- **JSDoc:** Required on all DSP functions. Include academic references.
- **Testing:** Vitest. Co-located unit tests in `__tests__/`, scenario tests in `tests/dsp/`
- **ESLint:** Flat config, `@typescript-eslint/no-explicit-any: error`. React 19 experimental rules downgraded to warn.
- **Build gate:** `npx tsc --noEmit && pnpm test && pnpm build` — all must pass
- **Export formats:** PDF uses dynamic `import()` to avoid bundling jsPDF unless needed; CSV/JSON/TXT are synchronous

## Operation Modes (8 presets in constants.ts)

| Mode | Threshold (dB) | Silence (dBFS) | MSD Weight | Use Case |
|------|---------------|----------------|------------|----------|
| speech | 27 | -65 | 0.33 | Conferences, lectures |
| worship | 35 | -58 | 0.33 | Churches (reverberant) |
| liveMusic | 42 | -45 | 0.08 | Concerts (dense harmonics) |
| theater | 28 | -58 | 0.33 | Drama, musicals |
| monitors | 15 | -45 | 0.33 | Stage wedges (fastest) |
| ringOut | 2 | -70 | 0.33 | Calibration (most sensitive) |
| broadcast | 22 | -70 | 0.33 | Studios, podcasts |
| outdoor | 38 | -45 | 0.33 | Festivals (wind-resistant) |

## CI/CD

- **Build gate:** `ci.yml` — audit + tsc + lint + test + build on every push/PR
- **Dependency updates:** Dependabot — weekly npm PRs (grouped by prod/dev), monthly Actions PRs
- **Versioning:** `0.{PR_NUMBER}.0` on PR merge, patch increment on direct push. Both `[skip ci]`.
- **Deployment:** Vercel auto-deploys on push to `main`
- **Version flow:** `package.json` version -> `next.config.mjs` reads via `readFileSync` -> `NEXT_PUBLIC_APP_VERSION` env -> HeaderBar + HelpMenu

## Deployment

- **Vercel auto-deploys** on push to `main`. Every merge is a production deploy.
- **Post-deploy verification:** After deploying or making production changes, verify the deployment is working (check the live URL, not just CI green).
- **Hotfix protocol:** If a deploy breaks production, immediately create a hotfix branch, fix, and ship. Don't wait for a full PR review cycle.

## Testing / Validation

- **Run `npx tsc --noEmit`** after making TypeScript changes to catch type errors before committing.
- **Run `pnpm test`** after any DSP, hook, or context changes.
- **Build gate:** `npx tsc --noEmit && pnpm test` — both must pass before committing.
- **Canvas changes** require visual verification in the browser (type-check won't catch drawing bugs).

## Change Impact Audit (MANDATORY — enforced by hooks)

After making **any non-trivial change** to the codebase, produce a **Change Impact Audit** before committing. The audit classifies the change as POSITIVE, NEGATIVE, or NEUTRAL across every affected system. Evidence-backed, not opinion-based.

**Pre-commit workflow (enforced by `.claude/hooks/pre-commit-gate.js`):**
1. Run `npx tsc --noEmit && pnpm test` — the build gate hook writes a marker on success
2. Produce the CIA in conversation AND write it to a temp file: `Write the CIA audit to the OS temp directory as claude-cia-audit.md`
3. Only then run `git commit` — the pre-commit hook checks both markers exist

If either marker is missing, the commit will be **mechanically blocked**. This is not optional.

### When to produce an audit

Always. If you changed code, you audit it. Specifically:

| System | Trigger files/areas |
|--------|-------------------|
| DSP / Detection | `lib/dsp/*`, algorithm weights, thresholds, gates, fusion, MSD, peak detection |
| Audio Pipeline | Gain, FFT, calibration, A-weighting, Web Audio API, mic input |
| Worker / Threading | `dspWorker.ts`, `workerFft.ts`, postMessage, transferables, backpressure |
| React State | Contexts (`contexts/*`), hooks (`hooks/*`), prop drilling, re-renders |
| UI Components | `components/*`, layout, mobile/desktop, tabs, sheets, gestures |
| Canvas / Visualization | `spectrumDrawing.ts`, RTA, GEQ, overlays, markers, labels, theme colors |
| Settings / Storage | `dwaStorage.ts`, localStorage keys, defaults, migration, presets |
| PWA / Service Worker | `sw.ts`, Serwist config, offline caching, installability |
| Security / CSP | `middleware.ts`, nonce generation, headers, API validation |
| API / Ingest | `api/v1/ingest/route.ts`, schema validation, rate limiting |
| Testing | `vitest.config.ts`, test files, mocks, coverage |
| Build / CI | `next.config.mjs`, `ci.yml`, Turbopack, webpack, Vercel deploy |
| Accessibility | ARIA roles, focus management, touch targets, screen readers, color contrast |
| Performance | Hot path (50fps analyze), Canvas (30fps), bundle size, memory, LUT |
| ML Pipeline | ONNX model, inference, training data, snapshot collection |
| Data / Privacy | Consent, snapshot collection, PII, opt-out, GDPR |

### Audit format

**CHANGE:** [one-line description]
**CLASSIFICATION:** 🟢 POSITIVE | 🔴 NEGATIVE | ⚪ NEUTRAL
**SCOPE:** [which systems from the table above are touched]

**Proof of impact** (adapt to change type):

For **DSP/algorithm** changes — trace values through the pipeline with actual numbers:
- Input range → transform → output range
- Which thresholds/decision boundaries are crossed or not
- dB values, bin indices, LUT ranges, frame counts

For **UI/component** changes — trace the render and interaction path:
- Which components re-render and why (prop/context/state change)
- Mobile vs desktop behavior differences
- Touch target sizes, viewport breakpoints affected
- Accessibility: does keyboard nav / screen reader still work?

For **state/storage** changes — trace data flow and persistence:
- Which contexts consume this state? How many components re-render?
- Does localStorage format change? What happens to existing users' saved data?
- Are defaults preserved? Does migration handle old → new format?

For **security/CSP** changes — trace the trust boundary:
- Does this open a new vector? (XSS, injection, data leak)
- Does CSP still block inline scripts in prod?
- Are API inputs still validated and rate-limited?

For **performance** changes — quantify the cost:
- Hot path impact: added operations × 50fps × 4096 bins = total ops/sec
- Memory: new allocations, array sizes, GC pressure
- Bundle: does this add a new dependency? Lazy-loaded or eager?

For **build/deploy** changes — trace the pipeline:
- Does CI still gate on tsc + lint + test + build?
- Does Vercel deploy behavior change?
- Are environment variables still wired correctly?

**Impact table:**

| System | Impact | Evidence |
|--------|--------|----------|
| [each affected system] | 🟢/🔴/⚪ None/Improved/Degraded | [one-line proof] |

**Verdict:** [Summary — "Strict improvement because..." / "Trade-off: improves X but risks Y..." / "Functionally invariant because..."]

### Classification rules

- **🟢 POSITIVE:** Provably improves at least one system without degrading any other. Improvement must be non-trivial.
- **🔴 NEGATIVE:** May degrade any system, even if it improves others. Must flag the trade-off and **require user acknowledgment** before committing.
- **⚪ NEUTRAL:** Mathematically/logically invariant — affected values never reach a decision boundary, affected components never see different inputs. Must prove it.
- **MIXED (🟢+⚪):** Common — positive for one system, neutral for all others. List both.
- **MIXED (🟢+🔴):** Requires explicit user approval. Present the trade-off clearly.

### Quick audit (for small changes)

For trivial changes (typo fix, comment update, import reorder), a one-line audit is sufficient:

**CHANGE:** Fixed typo in HeaderBar tooltip | **CLASSIFICATION:** ⚪ NEUTRAL | **Verdict:** Text-only change, no logic/state/render impact.

### Examples

**Example 1 — DSP change (from calibration clamp removal):**

**CHANGE:** Removed pre-calibration clamp `db = clamp(db, -100, 0)` in `_buildPowerSpectrum()`
**CLASSIFICATION:** ⚪ NEUTRAL (feedback detection) + 🟢 POSITIVE (room analysis)
**SCOPE:** DSP / Detection, Audio Pipeline

| System | Impact | Evidence |
|--------|--------|----------|
| Peak detection | ⚪ None | Affected bins < -100 dB, never cross any threshold (min 2 dB prominence) |
| Prominence calc | ⚪ Negligible | Sub-noise-floor bins contribute ≈0 power to prefix sum |
| MSD / algorithms | ⚪ None | Only peak bins written to MSD history |
| Room analysis | 🟢 Improved | Quiet low-freq signals no longer artificially raised before calibration offset |
| Performance | ⚪ None | One fewer clamp() call per bin — nanoseconds |

**Verdict:** Strict improvement — removes artificial floor that lost precision for room analysis, while being mathematically invariant for all feedback detection paths.

**Example 2 — UI change (hypothetical context refactor):**

**CHANGE:** Split EngineContext into EngineLifecycleContext + DeviceContext
**CLASSIFICATION:** 🟢 POSITIVE (re-renders) + 🔴 NEGATIVE (complexity)
**SCOPE:** React State, UI Components

| System | Impact | Evidence |
|--------|--------|----------|
| Re-renders | 🟢 Improved | Components using only devices no longer re-render on start/stop |
| Bundle size | ⚪ None | Same total code, just restructured |
| Complexity | 🔴 Increased | 2 providers instead of 1, more import paths for consumers |
| Accessibility | ⚪ None | No DOM or interaction changes |

**Verdict:** Trade-off — reduces unnecessary re-renders but adds architectural complexity. Recommend only if profiling shows the re-renders cause visible jank.

**Example 3 — Storage change (hypothetical key rename):**

**CHANGE:** Renamed localStorage key `dwa-settings` → `dwa-settings-v2`
**CLASSIFICATION:** 🔴 NEGATIVE (data loss risk)
**SCOPE:** Settings / Storage

| System | Impact | Evidence |
|--------|--------|----------|
| New users | ⚪ None | Get DEFAULT_SETTINGS as always |
| Existing users | 🔴 Settings lost | Old key not read, 47 settings reset to defaults |
| PWA | ⚪ None | Service worker cache unrelated to localStorage |

**Verdict:** Regression — existing users lose all saved settings on upgrade. Must add migration: read old key → write new key → delete old key.

## "Update the Usuals" Workflow

When the user says "update the usuals" or "update the usual stuff", do all of these:

1. **Changelog** (`lib/changelog.ts`) — add entry for new version with all features/fixes
2. **Help menu** (`components/analyzer/help/GuideTab.tsx`) — update any stale references
3. **Version** (`package.json`) — bump to `0.{next_PR_number}.0`
4. **CLAUDE.md** — update header (version, test count, file count, summary line)

Then when user says "PR and merge":
5. Commit locally, create feature branch, push, `gh pr create`, `gh pr merge --squash --delete-branch --admin`
6. Sync local: `git checkout main && git pull origin main`

**NEVER push unless the user explicitly says "push", "PR", or "send to GitHub".**

## Security Notes

- **CSP:** Nonce-based `script-src` in prod (middleware.ts), `'unsafe-inline'` in dev for hot reload. `style-src 'unsafe-inline'` in both (required by Tailwind/React). `suppressHydrationWarning` on `<html>` and `<body>` to prevent nonce mismatch (browsers strip nonce from DOM).
- **Permissions-Policy:** `microphone=(self), camera=(), geolocation=()`
- **Zero XSS vectors:** No direct HTML injection, no dynamic code execution
- **API:** Ingest endpoint validates v1.0/v1.1/v1.2 schema, dual rate-limiting (IP-based 30/60s primary + session-based 6/60s secondary), actual body size enforcement (512KB), strips IP, error messages not leaked
- **Worker:** Inbound messages type-validated via `WorkerOutboundMessage` switch; outbound postMessage lacks compile-time Set validation (minor gap)
- **localStorage:** 37 touchpoints, all via dwaStorage.ts abstraction with try/catch

## Accessibility Notes

- **MobileLayout:** Exemplary WAI-ARIA tabs (roving tabindex, ArrowLeft/Right/Home/End)
- **Color contrast:** All combinations pass WCAG AA (lowest: 5.1:1 destructive red on dark bg)
- **Canvas:** Not directly accessible to screen readers. Mitigated via `aria-live="polite"` region in IssuesList.tsx that announces new detections (frequency, severity, EQ recommendation) throttled to 1 per 3s.
- **Touch targets:** All >=44x44px on mobile (`touchFriendly`). Desktop action buttons (FALSE+, CONFIRM, Copy) h-8 with min-w-[44px]. Dismiss uses min-h-[44px] min-w-[44px] on both layouts.
- **Focus indicators:** Standardized `focus-visible:ring-[3px]` across all component files. Matches shadcn button.tsx ring width.
- **Skip link:** "Skip to main content" link in layout.tsx, visible on keyboard focus (WCAG 2.4.1).
- **Reduced motion:** `prefers-reduced-motion` blanket in globals.css — suppresses all CSS transitions and animations for motion-sensitive users.
- **Touch optimization:** `touch-action: manipulation` (eliminates 300ms tap delay) and `overscroll-behavior: contain` (prevents accidental pull-to-refresh) on `html`.

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
- **ML inference (v0.128.0):** ONNX Runtime Web as 7th fusion algorithm (weight 0.10). Bootstrap model (929 params, MLP 11→32→16→1) encodes existing gate logic. Lazy-loaded in worker via `import('onnxruntime-web')`. `predictCached()` pattern: async inference with synchronous cached reads. Previous-frame fused probability breaks circular dependency.
- **CONFIRM button (v0.128.0):** Symmetric labeling alongside FALSE+ for balanced ML training data. Mutual exclusion: CONFIRM removes from fpIds, FALSE+ removes from confirmedIds. Label balance tracking in snapshotCollector.
- **Cloud training pipeline (v0.128.0):** Supabase `spectral_snapshots` table with 12 ML columns. `scripts/ml/` with numpy-only trainer, export script, bootstrap model generator. GitHub Actions workflow (`ml-train.yml`) for weekly scheduled or manual training runs.
- **Ingest API v1.2 (v0.128.0):** Accepts `confirmed_feedback` user feedback, ML algorithm score, and model version. Backward-compatible with v1.0/v1.1.

## UI Features

### Layout & Navigation
- **Dual entry point:** Two start buttons — "Press to Start Analysis" (normal mode) and "Ring Out Room" (ring-out wizard). No settings menu required to switch modes.
- **Desktop layout:** 3-panel — Controls sidebar | Issues panel | RTA + GEQ graphs. 4-tab settings (Live | Setup | Display | Advanced) with accordion sections per tab.
- **Mobile portrait (2-tab):** Tab 1 = Issues + inline resizable RTA/GEQ graph (drag handle to resize, swipe to switch RTA↔GEQ). Tab 2 = Settings. Graph tab removed — graphs are inline above cards.
- **Mobile landscape:** 40/55/5 split (Issues/Graph/Controls). `LandscapeSettingsSheet.tsx` for bottom-sheet settings.
- **Fullscreen:** Separate app fullscreen (Maximize2 icon) and RTA fullscreen (Expand icon). Distinct icons and behavior.

### Issue Cards & Labeling
- **Swipe gestures (v0.148.0):** Swipe left = dismiss (removes from view). Swipe right = confirm as real feedback. Long-press = flag as false positive. 60px threshold, vertical-scroll-safe. Mobile always-on, desktop opt-in via Display settings.
- **Issue card display:** PEQ-only recommendations. Copy button. 3s minimum display time for stability. Top 5 on mobile (`MOBILE_MAX_DISPLAYED_ISSUES`).
- **Algorithm scores debug:** Toggle in Display settings shows MSD/PH/SP/CM/IH/PT/ML scores on each card.

### Theme & Branding
- **Dark/light theme (v0.146.0):** `next-themes` with CSS variables. Canvas colors via `canvasThemeRef` pattern (ref updated on theme change, read in RAF loop). Blue spectrum in light mode, amber/blue toggle in dark mode. RTA labels use frosted glass pills with theme-aware fills, shadows, and accent strips (v0.167.0).
- **DWA brand logo:** PNG-based DW Audio logo with theme switching. `DwaLogo.tsx` component. Displays in header (64px) and start button (80px).
- **Full names:** "Real-Time Analyzer" / "Graphic Equalizer" labels when space allows, abbreviated on narrow screens.

### Ring-Out Wizard (v0.147.0)
- **Guided workflow:** Step-by-step — "Raise gain slowly" → feedback detected → shows EQ cut recommendation → "Apply cut, click Next" → repeat. Running list of all notched frequencies.
- **Auto-starts in ringOut mode** with 2dB threshold (maximum sensitivity). Session summary with all cuts, exportable.

### Detection & Analysis
- **Content type detection:** 4-feature scoring (centroid, rolloff, flatness, crest factor) with temporal envelope analysis (energy variance over 2s windows). Majority-vote smoothing over 10 frames.
- **Sensitivity guidance (v0.151.0):** Three-layer contextual hints — idle hint below start buttons, first-detection tooltip, persistent RTA label next to threshold line. Speech/ringOut default 27dB.
- **RTA label overlap suppression (v0.170.0):** Greedy algorithm prioritizes highest-severity labels with 16px collision padding. Nearby suppressed labels merge into range pills ("820–950 Hz ×3") with highlight bands.
- **Frequency zone overlay (v0.171.0):** 5 theme-aware bands (Sub/Low Mid/Mid/Presence/Air) with separate dark/light opacity arrays. Merged range labels get filled highlight bands.
- **Notch overlays (v0.179.0):** Advisory merge at 1000 cents (minor seventh) — nearby EQ bands consolidate into one wider-Q cut via `clusterAwareQ()`. 42% opacity for fill and marker lines. Visual bars merge with 3% plot-width gap threshold, 8px minimum width. Marker line skipped when notch exists. `drawNotchOverlays()` returns notched ID set consumed by `drawMarkers()`.
- **Draggable threshold line:** Drag the dashed line on the RTA to adjust sensitivity directly. 8×28px grab handle with notch affordance.

### Settings Persistence
- **Auto-persist:** All 47 settings fields saved to localStorage on every change via `dwaStorage.ts`. Loaded on mount with `DEFAULT_SETTINGS` as fallback.
- **Custom presets:** Save/load named presets (up to 5). Mode selector + saved presets in Detect accordion.

### Other
- **Permanent Clear All:** Trash icon in header, calls `onClearAll()` + `onClearGEQ()` + `onClearRTA()`.
- **Auto MEMS calibration:** Smartphone MEMS mic profile auto-applied on mobile.
- **onnxruntime-web warning suppressed (v0.150.0):** String-concatenated dynamic import avoids Turbopack static analysis. No functional change.
