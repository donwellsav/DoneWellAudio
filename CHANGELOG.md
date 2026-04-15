# Changelog

All notable changes to DoneWell Audio are documented in this file.

## [Current Branch] - 2026-04-14

### Detection Accuracy

- Rebalanced the classifier and reporting path so conservative false-positive suppression no longer hides obvious growing feedback as aggressively.
- Added a snapshot-based speech/worship replay lane for worker-side fusion, classifier, and advisory evaluation using labeled `SnapshotBatch` fixtures.
- Brought synthetic fusion evaluation, snapshot replay, and in-app labeling into the same tuning story so missed positives can be measured instead of guessed at.

### Tooling And UI

- Replaced the retired `pnpm audit` CI path with the repo-owned `pnpm run audit:prod -- --audit-level=high` workflow backed by npm's bulk advisory API.
- Added the live FPS readout to the lower analyzer info bar and updated help copy to reference the current footer layout.
- Refreshed the main README, test docs, help tabs, and wiki pages so they match the current worker pipeline, mode presets, and troubleshooting guidance.

## [0.129.0] - 2026-03-17

### Defensive Hardening from Code Audit

- **Animation frame resilience:** `useAnimationFrame` rAF loop now wraps callback in try-catch — a throwing callback no longer kills the animation loop silently. Error is logged and loop continues.
- **Preset storage safety:** `DetectionControls` preset load/save wrapped in try-catch — graceful degradation when localStorage quota is exceeded (in-memory state still updates).
- **ResizeObserver guard:** `SpectrumCanvas` ResizeObserver callback wrapped in try-catch — prevents resize errors from breaking the canvas rendering pipeline.
- **HelpSection memoized:** `HelpShared.tsx` `HelpSection` component wrapped with `memo()` — all 38/38 domain components now consistently memoized.
- **Worker message default case:** `useDSPWorker` worker message switch now has a default case with dev-mode `console.warn` for unrecognized message types — future-proofs against silent message drops.
- 463 tests (459 passed, 4 skipped, 1 todo) across 26 suites

## [0.127.0] - 2026-03-17

### Security: Add Security Scanning to CI (PR #127)

- **Bug #8 fixed: No security scanning in CI** — vulnerable dependencies could merge to main undetected
- **`pnpm audit --prod --audit-level=high`** added to CI pipeline — fails the build on high/critical CVEs in production dependencies
- **`.github/dependabot.yml`** created — weekly grouped npm dependency update PRs (production + development), monthly GitHub Actions version bumps
- `--prod` flag skips devDependencies (test tools, linters don't ship to production)
- Grouped PRs reduce noise: 2 PRs per week max instead of one per outdated package
- 445 tests (441 passed, 4 skipped, 1 todo) across 25 suites

## [0.126.0] - 2026-03-17

### Security: Nonce-Based CSP (PR #126)

- **Bug #7 fixed: `unsafe-inline` in production script-src CSP** — replaced with per-request nonce via `middleware.ts`
- **New `middleware.ts`:** Generates a random nonce per request, sets `script-src 'self' 'nonce-{nonce}' 'strict-dynamic'` replacing `'unsafe-inline'`
- **`'strict-dynamic'`** trusts scripts loaded by nonced scripts — covers lazy chunks, dynamic imports, Next.js hydration
- **CSP removed from `next.config.mjs`** — moved to middleware for dynamic nonce generation. Other security headers (X-Content-Type-Options, X-Frame-Options, etc.) remain as static config
- **Dev mode unchanged:** Keeps `'unsafe-inline'` + `'unsafe-eval'` for Turbopack hot reload compatibility
- **`style-src 'unsafe-inline'` retained** — required by Tailwind CSS and React inline style attributes, low XSS risk
- 445 tests (441 passed, 4 skipped, 1 todo) across 25 suites

## [0.125.0] - 2026-03-17

### Bug Fix: Wire Tablet Responsive Breakpoint (PR #125)

- **Bug #6 fixed: `--breakpoint-tablet: 600px` defined but not wired to components** — portrait tablets (≥600px) were getting the phone carousel UI instead of the desktop layout
- **MobileLayout:** Added `tablet:hidden` to 3 portrait-only elements (carousel, page dots, bottom tab bar) — phones still get carousel, tablets don't
- **DesktopLayout:** Added `tablet:flex tablet:landscape:hidden` — portrait tablets see the resizable 3-panel layout; landscape tablets <768px still get mobile landscape split
- **HeaderBar:** Desktop-only buttons (reset layout, freeze) now visible on portrait tablets via same `tablet:flex tablet:landscape:hidden` pattern
- **`useIsMobile()` threshold lowered 768→600:** Tablets no longer auto-apply smartphone mic calibration (tablets have better mics)
- CSS-only layout switching — no new hooks, no new context state, no new components
- 1 new test for tablet-width viewport detection
- 445 tests (441 passed, 4 skipped, 1 todo) across 25 suites

## [0.124.0] - 2026-03-16

### Refactor: Split HelpMenu.tsx (PR #124)

- **Bug #5 fixed: `HelpMenu.tsx` was 991 lines doing 3+ things** — split into thin orchestrator (~90 lines) + 5 tab files in `help/` subdirectory
- **New `help/` directory** mirrors existing `settings/` pattern: `HelpShared.tsx` (shared component + constants), `GuideTab.tsx`, `ModesTab.tsx`, `AlgorithmsTab.tsx`, `ReferenceTab.tsx`, `AboutTab.tsx`
- **All tabs `memo()`-wrapped** — consistent with project conventions
- **No lazy loading for tabs** — `HelpMenu.tsx` itself is already lazy-loaded in `HeaderBar.tsx`; double-lazy adds complexity for zero gain on static JSX
- Pure extract refactor — zero behavioral change, all 444 tests pass unchanged

## [0.123.0] - 2026-03-16

### Bug Fix: Shelf Overlap Validation in eqAdvisor (PR #123)

- **Bug #4 fixed: No shelf overlap validation** — HPF + lowShelf could fire simultaneously, causing excessive attenuation in the 80–300 Hz overlap region
- **Intra-advisory overlap prevention:** When HPF is active, lowShelf mud threshold raised by +2 dB (from 4 dB to 6 dB excess required), preventing double-dip attenuation
- **`validateShelves()` post-processor:** Removes duplicate shelf types (keeps first), enforces HPF < lowShelf frequency sanity check, caps total shelves at 3
- **Cross-advisory shelf dedup:** Shelves computed once per analysis frame in `dspWorker.ts` (cached by frame ID), shared across all peaks in the same cycle via `precomputedShelves` parameter
- **`generateEQAdvisory()` updated:** New optional `precomputedShelves` parameter skips redundant `analyzeSpectralTrends()` calls
- 9 new tests: HPF+lowShelf overlap, normal threshold without HPF, strong mud with HPF, all three coexisting, `validateShelves` dedup/sanity/cap
- 444 tests (440 passed, 4 skipped, 1 todo) across 25 suites

## [0.122.0] - 2026-03-16

### Refactor: Split AudioAnalyzerContext (PR #122)

- **Bug #3 fixed: God-context with 28 fields** — Split into 4 focused contexts: `EngineContext` (11), `SettingsContext` (5), `MeteringContext` (10), `DetectionContext` (3)
- **Re-render savings** — HeaderBar, AdvisoryContext, UIContext, KeyboardShortcuts no longer re-render on metering updates (~4/sec eliminated per component)
- **New hooks:** `useEngine()`, `useSettings()`, `useMetering()`, `useDetection()` — consumers subscribe only to the data they need
- **Backward compatible:** `useAudio()` retained as deprecated shim (reads all 4 contexts)
- **All consumers migrated:** AdvisoryContext, UIContext, HeaderBar, DesktopLayout, MobileLayout, KillTheRing, KeyboardShortcuts
- Pure refactor — zero behavioral change, all 435 tests pass unchanged

## [0.121.0] - 2026-03-16

### Refactor: Decompose `analyze()` (PR #121)

- **Bug #2 fixed: `analyze()` was ~420 lines** — Decomposed into a ~45-line pipeline calling 4 extracted private methods
- **`_measureSignalAndApplyGain(now, dt)`** — Read FFT spectrum, auto-gain EMA calibration, silence gate (returns false to skip)
- **`_buildPowerSpectrum()`** — Apply input gain, A-weighting, mic calibration; compute power array + prefix sums via EXP_LUT
- **`_scanAndProcessPeaks(now, dt, threshold)`** — Main peak detection loop: MSD updates, local max, prominence, sustain/decay, clearance
- **`_registerPeak(i, now, prominence, threshold)`** — Quadratic interpolation, harmonic detection, Q estimation, PHPR, MSD, persistence, callback
- Pure extract-method refactor — zero behavioral change, all 435 tests pass unchanged

## [0.119.0] - 2026-03-16

### Test Coverage (PR #119)

- **Bug #1 fixed: Zero non-DSP test coverage** — Added 62 new tests across 10 previously untested modules
- **Hooks tested:** `useAdvisoryMap` (7), `useFpsMonitor` (6), `useAdvisoryLogging` (5), `useIsMobile` (3)
- **Contexts tested:** `AdvisoryContext` (10), `UIContext` (5)
- **Storage tested:** `ktrStorage` (15) — typedStorage, stringStorage, flagStorage, clearPanelLayouts
- **Exports tested:** `exportTxt` (7), `exportPdf` helpers (6), `downloadFile` (3)
- **CircularTimestampBuffer exported** for direct unit testing of FPS monitor internals
- **Vitest config expanded** to discover tests in `hooks/__tests__/`, `contexts/__tests__/`, `lib/storage/__tests__/`, `lib/export/__tests__/`
- 435 tests (431 passed, 4 skipped, 1 todo) across 25 suites

## [0.117.0] - 2026-03-16

### UI Overhaul (PRs #108–#116)

- **Issue cards simplified** — Removed GEQ info from cards (kept PEQ only), removed preset/start buttons from sidecar
- **Compact card buttons** — Larger icons, less dead space in issue card action area
- **RTA fullscreen** — New fullscreen button in header for RTA graph, works on mobile and desktop via element-level Fullscreen API
- **Landscape mobile layout** — New 40/55/5 (Issues/Graph/Controls) split for landscape orientation; bottom tab bar removed in landscape
- **Auto MEMS calibration** — Smartphone MEMS mic calibration profile auto-applied on mobile devices
- **Mobile advisory limit** — Top 5 most problematic frequencies shown on mobile (`MOBILE_MAX_DISPLAYED_ISSUES = 5`)
- **Issue card stability** — Cards stabilized for 3s minimum display time to prevent flickering
- **RTA label overlap suppression** — Greedy label acceptance algorithm prioritizes highest-severity labels; prevents clutter when markers cluster at same frequency
- **VerticalGainFader removed** — Component deleted (no longer needed)

### UI Improvements (PR #107)

- **Permanent Clear All button** — Trash icon now always visible in header; clears advisory cards, GEQ bars, and RTA markers in a single click. Visually dimmed when nothing to clear.
- **FALSE+ button repositioned** — Moved from inline with Copy/Dismiss to its own row beneath them in each advisory card, improving visual hierarchy and reducing misclick risk.

### ML Data Pipeline (PR #106)

- **Snapshot enrichment** — Every snapshot batch now includes intermediate algorithm scores (MSD, phase, spectral, comb, IHR, PTMR) plus fused probability and confidence (v1.1 schema, backward-compatible)
- **Always-on FALSE+ button** — User feedback available on all advisory cards (not just calibration mode); flows to DSP worker for ground truth labeling of pending snapshot batches
- **Ingest API v1.1** — Accepts optional `algorithmScores` and `userFeedback` fields with validation

### Documentation (PR #117)

- Comprehensive CLAUDE.md update: file counts, line counts, version tags, ML pipeline section, UI features section

### Tests

- 373 tests (368 passed, 4 skipped, 1 todo) across 15 suites

## [0.105.0] - 2026-03-15

### Bug Fixes (12 resolved)

- **B01: Auto-gain EMA stale** — `_recomputeEmaCoefficients()` now called from both `start()` and `updateConfig()` when `analysisIntervalMs` changes mid-session
- **B02: Confidence formula floors at 0.5** — Replaced `0.5 + 0.5 * agreement` with `prob * (0.5 + 0.5 * agreement)`, making UNCERTAIN verdict reachable
- **B03: Post-override normalization** — Normalization now happens before overrides; overrides are final
- **B04: 'existing' weight double-counts** — Removed `existing` key from all fusion profiles, redistributed weight to IHR + PTMR
- **B05: Comb weight doubling dilutes others** — Extra comb weight added to numerator only, not denominator
- **B06: No worker crash recovery** — Auto-restart with 500ms debounce, max 3 retries, Sentry logging in `useDSPWorker.ts`
- **B07: SpectrumCanvas missing devicePixelRatio** — Full DPR scaling (buffer, CSS style, ctx.scale)
- **B10: Dual MSD implementations** — Already fixed v0.98.0, consolidated into single `MSDPool` class
- **B12: Only axial room modes** — `calculateRoomModes()` now handles axial, tangential, and oblique modes
- **B14: PRIOR_PROBABILITY = 0.33** — Per-class priors: feedback=0.45, whistle=0.27, instrument=0.27
- **B16: Settings slider fires per-frame** — 100ms debounce with merge accumulation in `KillTheRing.tsx`
- **B20/FUTURE-002: Frame-based persistence** — ms-based thresholds with runtime `Math.ceil(ms / intervalMs)` derivation

### New Features — False Positive Mitigation

- **F15: Formant structure gate** — Detects vocal formant bands (F1/F2/F3) with Q-factor validation; applies 0.65× multiplier to feedback probability when ≥2 formant bands are active (mitigates sustained vowel false positives in Speech mode)
- **F16: Chromatic quantization gate** — Detects pitch-corrected audio by checking proximity to 12-TET semitone grid (≤5 cents); reduces phase coherence influence by 0.60× when detected (mitigates Auto-Tuned vocal false positives in Compressed mode)
- **F17: Temporal comb stability tracker** — Tracks comb pattern spacing over 16 frames using coefficient of variation (CV = σ/μ); applies 0.25× sweep penalty when CV > 0.05, distinguishing static feedback combs from sweeping flanger/phaser effects (mitigates effects pedal false positives in Music mode)

### Improvements

- **Worker crash recovery** — `useDSPWorker.ts` now auto-restarts crashed workers with exponential backoff (500ms debounce, max 3 retries)
- **Settings debounce** — Slider drag no longer fires `updateSettings()` per-frame; batched with 100ms merge accumulation
- **Documentation** — Comprehensive CLAUDE.md update: accurate bug status, file line counts, test counts (373), new gates documented

### Tests

- 373 tests (368 passed, 4 skipped, 1 todo) across 15 suites
- Updated classifier tests for new per-class priors
- Updated algorithm fusion tests for comb stability tracker

## [0.103.0] - 2026-03-14

### Features (PRs #98–#103)

- **Storage abstraction** — Typed localStorage helpers (`ktrStorage.ts`) with `typedStorage`, `stringStorage`, and `flagStorage` APIs
- **dbx RTA-M calibration** — Added dbx RTA-M measurement mic calibration profile
- **Documentation suite** — Comprehensive documentation added for Kill The Ring
- **Algorithm consolidation** — Removed legacy `existing` weight, consolidated to 6 detection algorithms
- **Autoresearch framework** — Added autoresearch framework for DSP fusion optimization
- **Smartphone MEMS calibration** — MEMS mic calibration profile for smartphone microphones

## [0.98.0] - 2026-03-01

### Bug Fixes

- Consolidated dual MSD implementations into single `MSDPool` class in `msdPool.ts`

## [0.97.0] - 2026-02-28

### Features

- Added smartphone MEMS mic calibration profile

## [0.96.0] - 2026-02-27

### Infrastructure & Testing (PRs #91–#96)

- **Gzip removal** — Removed gzip compression from snapshot uploads, root cause of zero browser uploads reaching the server
- **Webpack SHA-256 hash** — Fixed content hash algorithm for Node 22 LTS compatibility
- **DSP unit tests** — Added unit tests for fusion weights, MSD pool, and phase coherence
- **Sentry integration** — Added Sentry error reporting; dead code cleanup; repository rename
- **Fader guidance** — Bidirectional arrows with text labels on gain fader for clearer user direction
- **Test audit** — DSP unit test expansion and validation (VAL-001 through VAL-005)

## [0.90.0] - 2026-02-26

### Spectral Snapshot Collector (PRs #84–#90)

- **Snapshot collector** — Anonymous spectral snapshot collection for ML training data (KTR-LIVE-030)
- **Full peak collection** — Collect spectral snapshots for all classified peaks, not just top-N
- **Consent dialog fix** — Re-show consent dialog for users stuck in prompted state
- **Auto-enable collection** — Data collection enabled by default with opt-out model
- **Worker readiness** — Queue `enableCollection` when DSP worker not yet ready
- **Static import fix** — Static import for `snapshotCollector` replacing failing dynamic import in worker
- **Uploader load order** — Load uploader before worker collection starts

## [0.83.0] - 2026-02-25

### Console Fader & Performance (PRs #80–#83)

- **Console-style fader** — Dual-mode fader with console-style thumb and mobile sidecar
- **DSP test infrastructure** — Added DSP test infrastructure, expanded coverage to 195 tests
- **Hot path optimization** — Optimized `analyze()` hot path with precomputed EXP_LUT, bitwise MSD operations, and threshold skip
- **Fader redesign** — Console fader redesign with clear-all button and signal guidance indicators

## [0.79.0] - 2026-02-24

### Codebase Audit & Exports (PRs #74–#79)

- **27-bug audit** — Codebase audit fixing 27 bugs across DSP engine, components, and config
- **History panel cleanup** — Tightened FeedbackHistoryPanel UI
- **Export formats** — Added TXT and PDF export to Feedback History
- **Architecture audit** — CI pipeline, test expansion, context refactoring, worker split, performance and security improvements
- **Mobile sheet headers** — Tightened mobile sheet headers, reduced dead space
- **MSD consolidation** — Consolidated dual MSD implementations for consistent detection

## [0.70.0] - 2026-02-22

### Detection Improvements & Dead Code Cleanup (PRs #65–#73)

- **Auto-gain calibration** — Measure-then-lock auto-gain calibration for consistent input levels
- **Speech preset retune** — Retuned speech preset for balanced conference feedback detection
- **MSD threshold lowering** — Improved early/quiet feedback detection with lower MSD thresholds
- **Pro EQ recommendations** — Convention-style EQ recommendations with PHPR (peak-to-harmonic power ratio) detection
- **Low-frequency detection** — Restored low-frequency detection and eliminated duplicate advisories
- **Advisory dedup** — Deduplicate advisory cards by frequency band
- **Dead code removal** — Removed unused `analyzeFormantStructure` function and `applyFrequencyDependentThreshold` function

## [0.64.0] - 2026-02-21

### Acoustic Physics & Architecture (PRs #59–#64)

- **Room mode filter** — Acoustic physics upgrade with room mode filtering and decay analysis (RT60)
- **Changes tab** — Added Changes tab to help menu with retroactive changelog display
- **Performance quick wins** — Phase 1 optimizations: `memo()`, ErrorBoundary, dead code removal, ESLint cleanup
- **Database removal** — Removed session database and persistence layer (analysis-only, no server storage)
- **DSP hardening** — Severity deduplication, hotspot cap enforcement
- **Dead code cleanup** — Changelog additions and version bump to v1.0.6

## [0.58.0] - 2026-02-20

### False Positive Reduction (PRs #55–#58)

- **42 audit findings** — Fixed 42 audit findings across DSP, components, API, and config
- **Duplicate reduction** — Reduced false positives and duplicate feedback frequency reports (v1.0.3)
- **Build artifacts** — Updated build artifacts for v1.0.3 release
- **Advisory elimination** — Eliminated remaining false positives and duplicate advisories (v1.0.4)

## [0.54.0] - 2026-02-19

### Help Menu & Mobile Layout (PRs #50–#54)

- **Help menu redesign** — Redesigned help menu with settings panel and GEQ band labels
- **Resizable layout** — Resizable panel layout with research-driven operation mode presets
- **Mobile layout** — Bottom tab bar navigation and settings tab for mobile devices
- **Duplicate detection** — Removed duplicate feedback detections
- **DSP preset optimization** — Optimized DSP presets for load-in; fixed PR #53 review issues

## [0.46.0] - 2026-02-18

### Algorithm Integration (PRs #45–#49)

- **Operator's Manual** — Updated application layout with comprehensive Operator's Manual
- **IHR and PTMR algorithms** — Integrated Inter-Harmonic Ratio and Peak-to-Median Ratio into the feedback detection pipeline
- **Graph simplification** — Simplified graph interface by removing redundant header controls
- **Project documentation** — Added CLAUDE.md project documentation

## [0.35.0] - 2026-02-16

### Card Layout & Detection (PRs #28–#36)

- **Card layout redesign** — Redesigned card layout and optimized detection controls for usability
- **Header refinement** — Refined header layout and branding hierarchy for mobile and desktop
- **Pill buttons** — Added pill buttons for graph selection with separate panel states
- **Analysis start UI** — Enhanced analysis start UI and expanded help documentation
- **Detection algorithms** — Enhanced audio detection algorithms and refined header UI
- **API hardening** — Fixed critical bugs, hardened API validation, and improved accessibility
- **Acoustic scoring** — Added missing constants and utility functions for acoustic scoring

## [0.27.0] - 2026-02-14

### EQ Notepad & PWA (PRs #20–#27)

- **EQ Notepad** — Added EQ Notepad for manual frequency bookmarking
- **Auto music-aware mode** — Added auto music-aware detection mode and frequency presets
- **Harmonic detection** — Improved harmonic detection precision
- **Input controls** — Streamlined input controls for detection settings
- **Severity labels** — Simplified severity label display
- **PWA support** — Enabled Progressive Web App and Electron support

## [0.18.0] - 2026-02-12

### Session History & UI Modernization (PRs #16–#18)

- **Session history** — Implemented session history with Neon database migration
- **Audio analysis** — Enhanced audio analysis features for more accurate detection
- **UI modernization** — Modernized user interface with updated component styling
