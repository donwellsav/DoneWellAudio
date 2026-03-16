# Changelog

All notable changes to Kill The Ring are documented in this file.

## [0.107.0] - 2026-03-16

### UI Improvements

- **Permanent Clear All button** — Trash icon now always visible in header; clears advisory cards, GEQ bars, and RTA markers in a single click. Visually dimmed when nothing to clear.
- **FALSE+ button repositioned** — Moved from inline with Copy/Dismiss to its own row beneath them in each advisory card, improving visual hierarchy and reducing misclick risk.

### ML Data Pipeline (Phase 1 + 2)

- **Snapshot enrichment** — Every snapshot batch now includes intermediate algorithm scores (MSD, phase, spectral, comb, IHR, PTMR) plus fused probability and confidence (v1.1 schema, backward-compatible)
- **Always-on FALSE+ button** — User feedback available on all advisory cards (not just calibration mode); flows to DSP worker for ground truth labeling of pending snapshot batches
- **Ingest API v1.1** — Accepts optional `algorithmScores` and `userFeedback` fields with validation

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

## [0.98.0] - 2026-03-01

### Bug Fixes

- Consolidated dual MSD implementations into single `MSDPool` class in `msdPool.ts`

## [0.97.0] - 2026-02-28

### Features

- Added smartphone MEMS mic calibration profile
