# Master Combined Feedback Detector Audit — Round 3

**Date:** 2026-03-24
**Repository:** `C:\DoneWellAV\DoneWellAudio`
**Authors:** Claude Opus 4.6 (this round) + Codex/GPT-5.4 (Round 2 review)
**Status:** Round 3 — Accepts all Round 2 corrections. Adds new code-verified findings. Includes solution prompts.

---

## Round 3 Position

GPT's Round 2 was strong. Every new finding was verified against source code in this round. Here is what I accept, what I add, and where we now fully converge.

---

## 1. Corrections Accepted From Round 2

### 1.1 `[ACCEPTED]` Classifier priors are 0.45/0.27/0.27, not 0.15/0.10/0.10

I cited stale priors from an older version. Current code:

```
classifier.ts:38  PRIOR_FEEDBACK   = 0.45
classifier.ts:39  PRIOR_WHISTLE    = 0.27
classifier.ts:40  PRIOR_INSTRUMENT = 0.27
```

The comment at lines 32-36 explains the elevated feedback prior: "the user has explicitly opened a feedback-detection tool — the base rate of feedback in this context is higher than uniform." This is a defensible design choice. Sum ≈ 0.99.

### 1.2 `[ACCEPTED]` Room-physics delta IS capped at ±0.30

My Round 1 claimed room-physics stacking was "unbounded." That was wrong.

```
classifier.ts:79   MAX_ROOM_DELTA = 0.30
classifier.ts:457-462  // Room-physics delta cap: clamp cumulative room-only adjustments
                       if (roomConfigured && Math.abs(roomDelta) > MAX_ROOM_DELTA) {
                         const excess = roomDelta - Math.sign(roomDelta) * MAX_ROOM_DELTA
                         pFeedback -= excess
                       }
```

There is even a unit test at `classifier.test.ts:612-613`. The cap was a deliberate architectural fix. My claim was stale.

### 1.3 `[ACCEPTED]` `holdTimeMs` is dead

Verified by exhaustive grep. Results:

| Location | What it does |
|----------|-------------|
| `types/advisory.ts:319` | Type definition |
| `constants.ts:409, 443, 473, ...` | Preset values |
| `SoundTab.tsx:262-265` | UI slider |
| `UnifiedControls.tsx:592-594` | UI slider |
| `AudioAnalyzerContext.tsx:119` | Passed from preset |
| `feedbackDetector.ts:440-443` | Comment says "UI handles holdTimeMs display logic in AudioAnalyzer.tsx" |
| `AudioAnalyzer.tsx` | **ZERO references** |
| `hooks/` | **ZERO references** |
| `contexts/` | **Only preset passthrough** |

The detector comment claims the UI handles it, but the UI doesn't. **Dead control.**

### 1.4 `[ACCEPTED]` `quickControlsMode` is dead

Grep finds:
- Type definition at `types/advisory.ts:375`
- Default at `constants.ts:737`
- Test mock at `advisoryManager.test.ts:167`
- **No runtime consumer** in `components/`, `hooks/`, `contexts/`, or `lib/` (excluding test/worktree)

### 1.5 `[ACCEPTED]` Visible `relativeThresholdDb` control is disconnected

`SoundTab.tsx:360-362` exposes a "Relative Threshold" slider that writes `relativeThresholdDb` through `onSettingsChange`. But `feedbackDetector.ts:525-528` explicitly says:

```
// NOTE: relativeThresholdDb is NOT mapped here — it's controlled exclusively
// via feedbackThresholdDb (the UI slider) at line 385-386 above.
```

**The slider does nothing.** Users who discover the advanced controls and try to tune this value will have zero effect on detection behavior.

### 1.6 `[ACCEPTED]` `musicAware` / `autoMusicAware` are UI state, not detection inputs

`AudioAnalyzer.tsx:160-171` toggles `musicAware` based on peak level vs noise floor, but the worker fusion path uses `contentType` from `detectContentType()` — which is a spectral classifier, not the `musicAware` boolean. The musicAware fields are cosmetic state, not pipeline inputs.

### 1.7 `[ACCEPTED]` Mobile MEMS auto-apply goes through `updateSettings()` and IS affected by the wiring gap

GPT traced:
```
AudioAnalyzer.tsx:329-331  →  updateSettings({ micCalibrationProfile: 'smartphone' })
```
This hits the same `updateSettings()` at `feedbackDetector.ts:425-549` that lacks the `micCalibrationProfile` mapping. Both the Calibration tab and mobile auto-MEMS are affected.

### 1.8 `[ACCEPTED]` Calibration session is logging/export only, not live tuning

GPT verified that `useCalibrationSession.ts:64-233` and `calibrationSession.ts:160-211` contain:
- Detection logging
- Noise floor snapshots
- Settings history recording
- Export composition

And contain zero calls back into `FeedbackDetector.updateConfig()` or any worker tuning API. **No adaptive feedback loop exists.**

---

## 2. Updated Complete Dead/Partial Controls Inventory

This is the merged inventory from all three rounds.

### Dead Controls (exposed in UI, zero runtime effect on detection)

| Setting | Evidence | Status |
|---------|----------|--------|
| `musicAware` | UI state only, fusion uses `contentType` | `DEAD` |
| `autoMusicAware` | Drives `musicAware` toggle which is itself dead | `DEAD` |
| `autoMusicAwareHysteresisDb` | Parameter for dead `autoMusicAware` | `DEAD` |
| `noiseFloorDecay` | Runtime uses attack/release EMA at `feedbackDetector.ts:1605-1610` | `DEAD` |
| `harmonicFilterEnabled` | Harmonic suppression runs unconditionally at `dspWorker.ts:562-563` | `DEAD` |
| `holdTimeMs` | No runtime consumer despite detector comment claiming UI handles it | `DEAD` |
| `quickControlsMode` | Type + default only, no runtime consumer | `DEAD` |
| `relativeThresholdDb` (as separate control) | Explicitly not mapped at `feedbackDetector.ts:525-528` | `DEAD` |

**Total: 8 dead controls** (up from 3 in Round 1)

### Partial/Misleading Controls

| Setting | Issue | Evidence |
|---------|-------|----------|
| `micCalibrationProfile` | Math works, bridge gap in `updateSettings()` | `PARTIAL` |
| `roomPreset` | Silently writes detection thresholds alongside room config | `MISLEADING` |
| `peakMergeCents` | Default 1000, UI max 150 — first touch causes 6.5:1 jump | `MISLEADING` |

---

## 3. New Round 3 Findings

### 3.1 `[ROUND3-NEW]` The `musicAware` / `autoMusicAware` ecosystem is a dead tree, not just a dead leaf

Round 2 flagged `musicAware` as dead. But the full ecosystem is larger:

```
musicAware              → DEAD (UI state, not fusion input)
autoMusicAware          → DEAD (drives musicAware which is dead)
autoMusicAwareHysteresisDb → DEAD (parameter for dead feature)
AudioAnalyzer.tsx:155-171  → DEAD CODE (effect that toggles a dead setting)
```

This is **4 settings + 1 effect** that form a complete dead feature branch. The real music detection runs through `detectContentType()` in `algorithmFusion.ts:822-925`, which uses spectral features (centroid, rolloff, flatness, crest) and temporal envelope analysis — completely independent of `musicAware`.

### 3.2 `[ROUND3-NEW]` Threshold model has a hidden three-layer architecture

The full threshold picture, now that we've verified all paths:

```
Layer 1: Hero slider → feedbackThresholdDb → mapped to relativeThresholdDb → ACTIVE
Layer 2: "Relative Threshold" advanced slider → relativeThresholdDb → DEAD (not mapped)
Layer 3: thresholdDb (-80 dB safety floor) → only active in absolute/hybrid mode → HIDDEN
```

A user who touches the hero slider changes Layer 1. A user who finds the advanced panel and changes the "Relative Threshold" slider changes nothing. A user has no way to change Layer 3.

This is internally correct (the hero slider IS the right control) but the visible control surface is misleading.

---

## 4. Fully Converged Position (Round 3)

Both models can now honestly defend:

1. **DoneWell Audio can detect feedback.** The pipeline is real, end-to-end, with 7 fused algorithms.

2. **The low-level DSP math is strong.** PHPR, prominence, MSD, phase coherence, Q estimation, fusion weighting, and gating are all correct after v0.11.0 fixes. No new math bugs found in three adversarial rounds.

3. **The classifier is heuristic scoring, not calibrated probability.** Priors are 0.45/0.27/0.27 (intentionally elevated feedback prior). Outputs are useful ranking scores but should not be described as statistical posteriors.

4. **Room-physics delta is capped at ±0.30.** The correlated-stacking concern from Round 1 was addressed by `MAX_ROOM_DELTA`. The cap has test coverage.

5. **Mic calibration math works but the live settings bridge is broken.** `updateSettings()` at `feedbackDetector.ts:425-549` never maps `micCalibrationProfile`. Both CalibrationTab and mobile auto-MEMS go through this broken bridge.

6. **Custom mode excludes ML from the shipped operator path.** Fusion engine supports it; shipped defaults and UI don't expose it.

7. **Default analysis range is 150-10000 Hz.**

8. **Calibration mode is instrumentation/export, not adaptive tuning.**

9. **The control surface has 8 dead controls and 3 misleading controls.** This is the main source of product-level trust drift.

10. **The right next step is a settings/control cleanup sprint**, not a detector rewrite.

---

## 5. Solution Prompts

These are implementation prompts for fixing the issues identified across all three rounds. Each prompt is:
- Scoped to one concern
- References exact files and lines
- Includes acceptance criteria
- Targets Claude Opus 4.6

### Prompt S1: Fix Mic Calibration Bridge Gap

```
Target: Claude Opus 4.6
Repository: C:\DoneWellAV\DoneWellAudio

Fix the mic calibration settings bridge in FeedbackDetector.updateSettings().

Current state:
- feedbackDetector.ts:425-549 maps 20+ DetectorSettings fields to AnalysisConfig
- micCalibrationProfile is NOT mapped (gap verified by both Claude and GPT)
- updateConfig() at feedbackDetector.ts:407-413 DOES handle micCalibrationProfile correctly
- CalibrationTab.tsx:315-316 and AudioAnalyzer.tsx:329-331 (mobile MEMS) both write through updateSettings()

Fix:
Add to updateSettings() after the ignoreWhistle block (~line 544):

  if (settings.micCalibrationProfile !== undefined) {
    mappedConfig.micCalibrationProfile = settings.micCalibrationProfile
  }

Tests:
- Add a unit test that calls updateSettings({ micCalibrationProfile: 'ecm8000' })
  and verifies computeMicCalibrationTable() was called
- Add a test that verifies the calibration table is non-zero after setting 'ecm8000'
- Verify existing tests still pass

Run: npx tsc --noEmit && pnpm test
```

### Prompt S2: Remove Dead Controls

```
Target: Claude Opus 4.6
Repository: C:\DoneWellAV\DoneWellAudio

Remove the following dead controls from DetectorSettings and all consuming code.
These have been verified as having zero runtime effect on detection behavior
by both Claude Opus 4.6 and GPT-5.4 across 3 adversarial audit rounds.

Dead controls to remove:
1. musicAware — UI state only, fusion uses contentType from detectContentType()
2. autoMusicAware — drives musicAware which is dead
3. autoMusicAwareHysteresisDb — parameter for dead autoMusicAware
4. noiseFloorDecay — runtime uses attack/release EMA, not this value
5. harmonicFilterEnabled — harmonic suppression runs unconditionally
6. holdTimeMs — no runtime consumer (detector comment at line 440-443 claims
   AudioAnalyzer.tsx handles it, but AudioAnalyzer.tsx has zero references)
7. quickControlsMode — type + default only, no runtime consumer

Also remove:
- The dead useEffect at AudioAnalyzer.tsx:155-171 that toggles musicAware
- The "Relative Threshold" slider at SoundTab.tsx:360-362 (writes a field
  explicitly not mapped at feedbackDetector.ts:525-528)

DO NOT remove:
- micCalibrationProfile (real math, just needs bridge fix from Prompt S1)
- roomPreset (real enable/disable, just needs sensitivity coupling made explicit)
- peakMergeCents (real runtime use, just needs default/UI alignment)

Steps:
1. Remove fields from DetectorSettings in types/advisory.ts
2. Remove from DEFAULT_SETTINGS in constants.ts
3. Remove from all 8 mode presets in constants.ts
4. Remove from UI components (SoundTab, UnifiedControls, AudioAnalyzer, etc.)
5. Remove from any test mocks that reference them
6. Run: npx tsc --noEmit && pnpm test
7. Fix any compilation errors from removed fields
8. Re-run: npx tsc --noEmit && pnpm test
```

### Prompt S3: Fix peakMergeCents Default/UI Mismatch

```
Target: Claude Opus 4.6
Repository: C:\DoneWellAV\DoneWellAudio

Fix the peakMergeCents default/UI mismatch.

Current state:
- Default: 1000 cents at constants.ts:679
- UI slider range: 10..150 at SoundTab.tsx:343-345
- First touch jumps from 1000 to max 150

Options (pick one):
A) Change default to 100 (midpoint of UI range, musically = minor third)
B) Expand UI range to include 1000 (but 1000 cents = minor seventh may be too wide)
C) Change default to 150 (UI max, keeps current wide-merge behavior but reachable)

Recommendation: Option A (100 cents = reasonable default, engineers expect ~semitone merge)

Verify peakMergeCents is consumed at advisoryManager.ts:273 and behaves correctly
with the new default.

Run: npx tsc --noEmit && pnpm test
```

### Prompt S4: Make Room Preset Sensitivity Coupling Explicit

```
Target: Claude Opus 4.6
Repository: C:\DoneWellAV\DoneWellAudio

Make room preset sensitivity changes visible to the user.

Current state:
- RoomTab.tsx:284-297 writes both room config AND detection thresholds
- feedbackThresholdDb and ringThresholdDb change silently

Options:
A) Show a toast/notification when room preset changes sensitivity
B) Split room config from sensitivity into separate controls
C) Add a "(also adjusts sensitivity)" label next to room preset selector

Recommendation: Option C — smallest change, immediately honest.

After the room preset label or select, add explanatory text like:
"Selecting a room preset also adjusts detection sensitivity for that environment."

Run: npx tsc --noEmit && pnpm test
```

### Prompt S5: Add ML Toggle to Custom Mode UI

```
Target: Claude Opus 4.6
Repository: C:\DoneWellAV\DoneWellAudio

Add ML to the custom mode algorithm selector.

Current state:
- SoundTab.tsx:302 renders 6 buttons: MSD, Phase, Spectral, Comb, IHR, PTMR
- constants.ts:706 default enabledAlgorithms excludes 'ml'
- algorithmFusion.ts:733 fallback includes 'ml'

Fix:
1. Add ['ml', 'ML'] to the button array at SoundTab.tsx:302
2. Add 'ml' to DEFAULT_SETTINGS.enabledAlgorithms at constants.ts:706
3. Add the same button to UnifiedControls.tsx:522-533 if custom mode UI exists there
4. Verify the Algorithm type in types/advisory.ts includes 'ml'

Run: npx tsc --noEmit && pnpm test
```

### Prompt S6: Classifier Language Cleanup

```
Target: Claude Opus 4.6
Repository: C:\DoneWellAV\DoneWellAudio

Update classifier comments and any user-facing strings to describe outputs as
"confidence scores" rather than "Bayesian probabilities" or "posterior probabilities."

The classifier at classifier.ts uses:
- Hand-set priors (0.45/0.27/0.27)
- Additive feature boosts
- Post-normalization severity overrides that break sum-to-1
- Max-like confidence heuristic

These are useful heuristic ranking scores, not statistically calibrated posteriors.

Search for:
- "posterior" in comments/strings
- "Bayesian" in comments/strings (keep academic references, fix product descriptions)
- "probability" when used to describe classifier output confidence to users

Do NOT change:
- Variable names (pFeedback, pWhistle, etc.) — too risky for a naming-only pass
- Academic references in JSDoc
- Internal math (the scores work, just the labeling is wrong)

Run: npx tsc --noEmit && pnpm test
```

---

## 6. Items For GPT Round 4

GPT: This round accepts all your corrections. The remaining items for verification:

1. **Section 3.1** — The `musicAware` dead tree (4 settings + 1 effect). Do you agree this is a complete inventory of the dead feature branch? Or does `musicAware` have any downstream consumer we both missed?

2. **Prompt S2 safety** — Removing 7 dead fields + 1 slider + 1 effect is a large diff. Do you see any removal that could have an unintended side effect? Specifically: does any test assert on `musicAware` or `holdTimeMs` behavior (not just mock values)?

3. **Prompt S3 recommendation** — We recommend changing `peakMergeCents` default from 1000 to 100. The current 1000 cents means advisories within a minor seventh get merged. Do you agree 100 cents (minor second / semitone) is the right default for live sound engineers?

4. **Any additional dead controls** — We found 8. Round 2 found 7 (we added `autoMusicAwareHysteresisDb`). Is there anything else?

5. **Post-normalization severity override** — `classifier.ts:807-811` breaks the sum-to-1 invariant intentionally. Should this be flagged as a product issue, or is the RUNAWAY/GROWING safety override genuinely the right design?

---

*Round 3 of adversarial cross-review. Both models now agree on all major findings. The remaining work is solution validation and implementation order.*
