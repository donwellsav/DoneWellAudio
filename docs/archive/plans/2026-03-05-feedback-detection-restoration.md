# Feedback Detection Pipeline Restoration

**Date:** 2026-03-05
**Status:** Approved
**Scope:** 15 surgical fixes across 5 files — no architectural rewrites

## Problem

Detection degraded through ~20 commits of oscillating tuning. The pipeline now has 11 sequential gates (was ~4 at baseline). Math bugs corrupt downstream decisions. Algorithms fight each other. Thresholds drifted 33-75% more conservative than the research-driven baseline.

## Phases

### Phase 1: Math Bugs
- **F1:** `advancedDetection.ts:1161` — Convert dB to linear power in `detectContentType` spectral centroid
- **F2:** `dspWorker.ts:639` — Pass actual crest factor (specMax - rmsDb) instead of SNR

### Phase 2: Algorithm Conflicts
- **F3:** `classifier.ts:638-648` — GROWING/RUNAWAY bypass fusion NOT_FEEDBACK clamping
- **F4:** `advancedDetection.ts:905-907` — Include comb+spectral in 'combined' mode
- **F5:** `advancedDetection.ts:859` — Fusion threshold 0.70 → 0.60

### Phase 3: Threshold Restoration
- **F6:** `constants.ts` — Speech preset: feedbackThresholdDb 8→6, ringThresholdDb 5→3, sustainMs 350→200, relativeThresholdDb 18→16
- **F7:** `constants.ts` — Signal gate: speech -55→-65, worship -50→-58, ringOut -60→-70, broadcast -60→-70
- **F8:** `constants.ts:258` — BAND_COOLDOWN_MS 3000→1500
- **F9:** `dspWorker.ts:101` — ADVISORY_RATE_LIMIT_MS 1000→500
- **F10:** `constants.ts:791` — HYSTERESIS RE_TRIGGER_DB 3→1.5
- **F11:** `constants.ts` — MSD DEFAULT_MIN_FRAMES 20→12
- **F12:** `constants.ts` — ASSOCIATION_TOLERANCE_CENTS 200→100, peakMergeCents 200→100

### Phase 4: Timing Fixes
- **F13:** `feedbackDetector.ts:1003` — Hold counter gradual decay instead of hard reset
- **F14:** `feedbackDetector.ts:1286-1289` — Remove MSD growth rate gate
- **F15:** `feedbackDetector.ts:758-770` — Signal gate still clears stale peaks

## Out of Scope
- Triple-confidence system rewrite
- Per-frame spectrum batching
- Worker init race condition
- adjustedPFeedback disconnection
