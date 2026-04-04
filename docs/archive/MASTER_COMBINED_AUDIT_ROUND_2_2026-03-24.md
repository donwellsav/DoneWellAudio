# Master Combined Feedback Detector Audit - Round 2

**Date:** 2026-03-24  
**Repository:** `C:\DoneWellAV\DoneWellAudio`  
**Authors:** Claude Opus 4.6 + Codex/GPT-5.4  
**Status:** Round 2 - code re-review after `MASTER_COMBINED_AUDIT_ROUND_1_2026-03-24.md`

---

## Purpose

This document is a new master round, not a short rebuttal.

Round 1 was already strong, but several claims in it were still stale or too broad. For this pass, I re-read the Round 1 markdown and then re-traced the current code paths that matter to runtime behavior:

- `components/analyzer/settings/CalibrationTab.tsx`
- `components/analyzer/settings/SoundTab.tsx`
- `components/analyzer/settings/RoomTab.tsx`
- `components/analyzer/AudioAnalyzer.tsx`
- `hooks/useAudioAnalyzer.ts`
- `hooks/useCalibrationSession.ts`
- `hooks/useDSPWorker.ts`
- `lib/audio/createAudioAnalyzer.ts`
- `lib/calibration/calibrationSession.ts`
- `lib/dsp/feedbackDetector.ts`
- `lib/dsp/dspWorker.ts`
- `lib/dsp/algorithmFusion.ts`
- `lib/dsp/classifier.ts`
- `lib/dsp/acousticUtils.ts`
- `lib/dsp/constants.ts`
- `types/advisory.ts`

This round closes the open questions from Round 1, tightens several claims, and adds a more explicit settings/control inventory so future audit rounds can argue over concrete runtime behavior instead of broad impressions.

---

## Provenance Tags

- `[ROUND2-VERIFIED]` Re-checked against current code and still stands.
- `[ROUND2-CORRECTED]` Round 1 wording or conclusion was stale or too broad.
- `[ROUND2-DEAD]` Exposed control/setting with no effective runtime consumer in the current app tree.
- `[ROUND2-PARTIAL]` Real code exists, but the normal user-facing path is incomplete or misleading.
- `[ROUND2-UI]` Active, but display/interaction only. Does not change detection math.

---

## 1. Executive Verdict

### `[ROUND2-VERIFIED]` The app can detect feedback

That conclusion still stands. The detector is real and the pipeline is real:

1. Main thread captures mic input and runs `FeedbackDetector.analyze()`.
2. Peaks and front-end DSP features are extracted on the main thread.
3. Worker computes algorithm scores, fusion, classification, and advisories.
4. UI renders advisories and spectrum.

### `[ROUND2-VERIFIED]` The core DSP math is still the strongest part of the system

No new low-level PHPR-style math bug turned up in this pass. The strongest parts of the system remain:

- dB-to-linear LUT plus prefix-sum power accumulation in `feedbackDetector.ts:1149-1183`
- prominence in `feedbackDetector.ts:1247-1265`
- Q estimation in `feedbackDetector.ts:1463-1526`
- PHPR linear-power averaging in `feedbackDetector.ts:1539-1569`
- MSD in `feedbackDetector.ts:1653-1688`
- phase coherence in `phaseCoherence.ts:65-116`
- fusion weighting and gating in `algorithmFusion.ts`

### `[ROUND2-CORRECTED]` Round 1 was still too optimistic about the control surface

Round 1 correctly called out some dead controls and some semantic drift. After a fresh code pass, the control/settings contract looks weaker than Round 1 said:

- `relativeThresholdDb` is not just "legacy"; the visible control is ignored by the detector update bridge.
- `holdTimeMs` appears to be dead in the current app tree.
- `quickControlsMode` appears to be dead in the current app tree.
- `micCalibrationProfile` is real math with an incomplete live settings bridge.
- `musicAware` and `autoMusicAware` are still UI state, not real fusion selection inputs.

### Converged Round 2 bottom line

The detector is real. The math is broadly sound for the application. The product-layer contract is still not clean. The right next step remains settings/control cleanup, not a detector rewrite.

---

## 2. What From Round 1 Still Stands

The following Round 1 claims survived direct code re-review.

### `[ROUND2-VERIFIED]` End-to-end detector architecture

The path described in Round 1 is still accurate:

- `hooks/useAudioAnalyzer.ts:298-304`
- `lib/audio/createAudioAnalyzer.ts:123-125`
- `lib/dsp/feedbackDetector.ts`
- `hooks/useDSPWorker.ts:278-317`
- `lib/dsp/dspWorker.ts:466-568`

### `[ROUND2-VERIFIED]` F2 fix is correctly described

Round 1 claimed the fusion confidence fix uses the same transformed score vector for both probability and confidence. That is correct.

Evidence:

- `algorithmFusion.ts:739-740` creates `effectiveScores`
- `algorithmFusion.ts:757-759` applies low-frequency phase suppression before insertion
- `algorithmFusion.ts:881-889` computes agreement/confidence from `effectiveScores`

So the old mismatch between transformed probability inputs and raw confidence inputs is resolved.

### `[ROUND2-VERIFIED]` F4 fix is correctly described

Round 1 claimed the classifier no longer re-adds per-algorithm evidence after fusion. That is correct.

Evidence:

- `classifier.ts:747-755` explicitly states fusion owns algorithm-level posterior
- `classifier.ts:755` blends base track-level probability with fusion output via `FUSION_BLEND = 0.6`

That description survives review.

### `[ROUND2-VERIFIED]` Worker backpressure still drops frames

This remains exactly as Round 1 described.

Evidence:

- `useDSPWorker.ts:278-283` drops the frame when busy
- `useDSPWorker.ts:313-317` reports dropped-frame stats

### `[ROUND2-VERIFIED]` Room presets silently change sensitivity

Still true.

Evidence:

- `RoomTab.tsx:285-289` writes `feedbackThresholdDb` and `ringThresholdDb`
- `RoomTab.tsx:291-294` writes room dimensions and treatment in the same action

### `[ROUND2-VERIFIED]` `peakMergeCents` default mismatch

Still true.

Evidence:

- `constants.ts:679` default is `1000`
- `SoundTab.tsx:343-345` UI range is `10..150`

### `[ROUND2-VERIFIED]` Core classifier/fusion outputs are heuristic, not calibrated probability

Still true, and Round 2 strengthens it further.

Evidence:

- hand-set priors at `classifier.ts:38-40`
- additive feature boosts and penalties across `classifier.ts:257-492`
- renormalization at `classifier.ts:793-804`
- confidence as a max-like heuristic at `classifier.ts:814-817`

---

## 3. Round 1 Claims Corrected In This Pass

### 3.1 `[ROUND2-CORRECTED]` Round 1's classifier-prior numbers are stale

Round 1 said:

> `pFeedback=0.15, pWhistle=0.10, pInstrument=0.10`

Current code says:

- `classifier.ts:38` `PRIOR_FEEDBACK = 0.45`
- `classifier.ts:39` `PRIOR_WHISTLE = 0.27`
- `classifier.ts:40` `PRIOR_INSTRUMENT = 0.27`

This is not a small wording issue. It changes the interpretation of the classifier section. The current implementation starts from an intentionally elevated feedback prior.

Corrected statement:

> The classifier starts from hand-set priors of 0.45 / 0.27 / 0.27, not the older 0.15 / 0.10 / 0.10 values. This remains heuristic scoring, not calibrated posterior inference.

### 3.2 `[ROUND2-CORRECTED]` Mic calibration is real math with an incomplete live bridge, and the mobile auto-MEMS path is affected too

Round 1 already accepted the live wiring gap in Section 3.1, but left the mobile path open as a question. That question is now closed.

What is true:

- `feedbackDetector.ts:407-413` recomputes calibration when `updateConfig()` receives `micCalibrationProfile`
- `feedbackDetector.ts:1136-1167` applies the calibration table in `_buildPowerSpectrum()`

What is missing:

- `feedbackDetector.ts:425-549` maps many `DetectorSettings` fields in `updateSettings()`
- that mapping does **not** include `micCalibrationProfile`

The live UI path is:

1. `CalibrationTab.tsx:315-316` writes `micCalibrationProfile`
2. `AudioAnalyzer.tsx:309-314` debounces settings changes through `updateSettings(...)`
3. `useAudioAnalyzer.ts:298-304` forwards settings to analyzer and worker
4. `createAudioAnalyzer.ts:123-125` forwards to `this.detector.updateSettings(settings)`
5. `feedbackDetector.ts:425-549` fails to map `micCalibrationProfile`

The mobile auto-MEMS path is also through `updateSettings(...)`, not `updateConfig(...)`:

- `AudioAnalyzer.tsx:329-331` calls `updateSettings({ micCalibrationProfile: 'smartphone' })`

Corrected statement:

> Mic calibration math is implemented correctly in the detector, but the normal live settings path is incomplete because `FeedbackDetector.updateSettings()` never maps `micCalibrationProfile`. That means both the Calibration tab control and the mobile auto-MEMS path are affected by the same bridge gap.

### 3.3 `[ROUND2-CORRECTED]` Custom-mode ML is omitted from the shipped operator path

Round 1 already moved toward this, but the final wording should be tighter.

Fusion supports ML in fallback custom mode:

- `algorithmFusion.ts:733` fallback includes `ml`

But the shipped operator path omits it:

- `constants.ts:706` default `enabledAlgorithms` excludes `ml`
- `SoundTab.tsx:302-313` renders only six toggles
- `UnifiedControls.tsx:522-533` also renders only six toggles

Corrected statement:

> Custom mode is ML-capable in the fusion engine, but the shipped defaults and the operator-facing custom-mode UIs omit ML. In practice, ML is missing from the normal custom-mode path unless code or stored settings manually inject it.

### 3.4 `[ROUND2-CORRECTED]` Default analysis range is 150-10000 Hz

Round 1 accepted this correction already, and it still stands.

Evidence:

- `types/advisory.ts:383-384`
- `constants.ts:672-673`

### 3.5 `[ROUND2-CORRECTED]` Room-physics delta is capped, not unbounded

Round 1's Section 4.3 / Section 10 point 8 said room-physics evidence stacking was unbounded. That is no longer correct.

Evidence:

- `classifier.ts:339-352`, `385`, `435`, `452` accumulate `roomDelta`
- `classifier.ts:457-462` clamps cumulative room delta via `MAX_ROOM_DELTA`
- `classifier.ts:79` defines `MAX_ROOM_DELTA = 0.30`
- `lib/dsp/__tests__/classifier.test.ts:612-613` has an explicit unit test for the clamp

Corrected statement:

> Room-derived adjustments are still correlated heuristics, but they are no longer unbounded. The classifier caps cumulative room-only delta at +/-0.30.

### 3.6 `[ROUND2-CORRECTED]` Calibration session/export is logging and export, not live detector tuning

Round 1 left this as an open verification item. It is now closed.

What `useCalibrationSession` actually does:

- starts/stops a `CalibrationSession` object at `useCalibrationSession.ts:64-73`
- logs noise floor and spectrum snapshots at `useCalibrationSession.ts:81-93`
- logs content-type transitions at `useCalibrationSession.ts:110-117`
- logs detections at `useCalibrationSession.ts:191-197`
- logs false positives and misses at `useCalibrationSession.ts:200-218`
- logs settings changes at `useCalibrationSession.ts:220-226`
- exports session data at `useCalibrationSession.ts:228-233`

What `CalibrationSession.buildExport()` actually does:

- packages room, ambient, settings history, noise floor log, snapshots, detections, and mic-cal metadata at `calibrationSession.ts:160-211`

What neither file does:

- no learned threshold update
- no call back into `FeedbackDetector.updateConfig()`
- no call into worker tuning APIs
- no persisted calibration that alters future live detection

Corrected statement:

> Calibration mode is currently instrumentation and export, not adaptive detector training or live threshold calibration.

---

## 4. Settings And Control Inventory

This is the biggest added section in Round 2. The problem is not just "some dead controls exist." The problem is that the settings model mixes four very different classes of fields:

1. fields that change detection math on the main thread
2. fields that change worker/runtime behavior
3. fields that only change display/interaction
4. fields that are dead, partial, or misleading

### 4.1 Main-thread detection controls

These do affect the detector path through `FeedbackDetector.updateSettings()`:

| Setting | Status | Evidence |
|---|---|---|
| `mode` | Active | `feedbackDetector.ts:447-453` |
| `fftSize` | Active | `feedbackDetector.ts:428-430` |
| `minFrequency` / `maxFrequency` | Active | `feedbackDetector.ts:431-436` |
| `feedbackThresholdDb` | Active, but mapped into `relativeThresholdDb` | `feedbackDetector.ts:437-438` |
| `eqPreset` | Active | `feedbackDetector.ts:444-446` |
| `inputGainDb` | Active | `feedbackDetector.ts:454-459` |
| `autoGainEnabled` | Active | `feedbackDetector.ts:461-470` |
| `autoGainTargetDb` | Active | `feedbackDetector.ts:472-474` |
| `harmonicToleranceCents` | Active | `feedbackDetector.ts:475-477` |
| `smoothingTimeConstant` | Active | `feedbackDetector.ts:480-485` |
| `ringThresholdDb` | Active for classification path | `feedbackDetector.ts:488-490` |
| `growthRateThreshold` | Active for classification path | `feedbackDetector.ts:491-493` |
| `aWeightingEnabled` | Active | `feedbackDetector.ts:496-498` |
| `roomRT60` / `roomVolume` | Active | `feedbackDetector.ts:501-506` |
| `confidenceThreshold` | Active | `feedbackDetector.ts:509-511` |
| `sustainMs` / `clearMs` | Active | `feedbackDetector.ts:514-519` |
| `thresholdMode` | Active | `feedbackDetector.ts:521-524` |
| `prominenceDb` | Active | `feedbackDetector.ts:529-531` |
| `noiseFloorAttackMs` / `noiseFloorReleaseMs` | Active | `feedbackDetector.ts:534-539` |
| `ignoreWhistle` | Active | `feedbackDetector.ts:542-543` |

### 4.2 Worker/runtime controls

These matter, but not through the detector's `updateSettings()` mapping:

| Setting | Status | Evidence |
|---|---|---|
| `maxTracks` / `trackTimeoutMs` | Active in worker/track manager | `dspWorker.ts:252-255` |
| `algorithmMode` | Active in worker fusion config | `dspWorker.ts:481-486` |
| `enabledAlgorithms` | Active in worker fusion config | `dspWorker.ts:481-486` |
| `roomPreset` | Active in classifier gating and room enable/disable | `classifier.ts:235`, `classifier.ts:642` |
| `roomLengthM` / `roomWidthM` / `roomHeightM` | Active in room-mode proximity logic | `classifier.ts:442-449` |
| `peakMergeCents` | Active in advisory dedup, but default/UI mismatch | `advisoryManager.ts:273` |

### 4.3 Setup/derived controls

These are not directly used by the detector or worker logic, but they are not dead. They derive active values.

| Setting | Status | Evidence |
|---|---|---|
| `roomTreatment` | Active through RT60/volume derivation | `RoomTab.tsx:246-263` |
| `roomDimensionsUnit` | Active through feet-to-meters conversion | `RoomTab.tsx:253-256` |

### 4.4 Display and interaction controls

These are active, but they do not change feedback math.

| Setting | Status | Evidence |
|---|---|---|
| `maxDisplayedIssues` | UI-only active | `useAdvisoryMap.ts:49-59` |
| `graphFontSize` | UI-only active | `DesktopLayout.tsx:295`, `GEQBarView.tsx:256`, `spectrumDrawing.ts:898-924` |
| `showAlgorithmScores` | UI-only active | `DesktopLayout.tsx:161-163`, `IssuesList.tsx:709` |
| `showPeqDetails` | UI-only active | `DesktopLayout.tsx:162-163`, `IssuesList.tsx:724` |
| `showFreqZones` | UI-only active | `DesktopLayout.tsx:295`, `SpectrumCanvas.tsx:238` |
| `spectrumWarmMode` | UI-only active | `DesktopLayout.tsx:295`, `SpectrumCanvas.tsx:247` |
| `rtaDbMin` / `rtaDbMax` | UI-only active | `DesktopLayout.tsx:295`, `spectrumDrawing.ts:923-924` |
| `spectrumLineWidth` | UI-only active | `DesktopLayout.tsx:295`, `spectrumDrawing.ts:456-466` |
| `showThresholdLine` | UI-only active | `DesktopLayout.tsx:295`, `SpectrumCanvas.tsx:239-242` |
| `canvasTargetFps` | UI/perf active | `AudioAnalyzer.tsx:108`, `SpectrumCanvas.tsx:333` |
| `faderMode` | UI-only active | `DesktopLayout.tsx:339-340`, `VerticalGainFader.tsx:63` |
| `swipeLabeling` | UI-only active | `DesktopLayout.tsx:161`, `IssuesList.tsx:113-463` |
| `showTooltips` | UI-only active | display/settings tab usage throughout settings components |

### 4.5 Dead, partial, or misleading controls

This is the most important control table in the audit.

| Setting | Status | Why |
|---|---|---|
| `relativeThresholdDb` | `[ROUND2-DEAD]` as a user control | UI exposes it, but `feedbackDetector.ts:525-528` explicitly does not map it. The hero slider is the real control. |
| `noiseFloorDecay` | `[ROUND2-DEAD]` | Runtime noise floor uses attack/release EMA only at `feedbackDetector.ts:1605-1610`. |
| `harmonicFilterEnabled` | `[ROUND2-DEAD]` | Harmonic suppression still runs unconditionally via `dspWorker.ts:562-563` and `advisoryManager.ts:50`. |
| `holdTimeMs` | `[ROUND2-DEAD]` in current tree | Present in defaults and UI, but search across `components/`, `hooks/`, `contexts/`, and `lib/` found no runtime consumer beyond the detector comment claiming the UI handles it. |
| `quickControlsMode` | `[ROUND2-DEAD]` in current tree | In current root tree it appears only in defaults/tests; no runtime consumer found. |
| `musicAware` | `[ROUND2-DEAD]` for detection pipeline | Toggled in `AudioAnalyzer.tsx:155-171`, but worker fusion uses `contentType`, not `musicAware`. |
| `autoMusicAware` / `autoMusicAwareHysteresisDb` | `[ROUND2-DEAD]` for detection pipeline | They only drive the UI-side `musicAware` toggle path; they do not alter fusion selection directly. |
| `micCalibrationProfile` | `[ROUND2-PARTIAL]` | Real detector math exists, but the normal `updateSettings()` bridge does not map the field. |
| `roomPreset` | `[ROUND2-PARTIAL]` / misleading | Real room enable/disable flag, but preset selection also silently writes detection thresholds. |
| `peakMergeCents` | `[ROUND2-PARTIAL]` / misleading | Runtime-active, but default is unreachable from the visible UI range. |

Summary:

Round 1 was right that the control surface had drift. Round 2's stronger claim is that the drift is not limited to three dead fields. The operator-facing settings model still exposes multiple fields that are dead, partial, or semantically misleading.

---

## 5. Threshold Semantics, Re-stated Cleanly

This section matters because Round 1 was directionally right but not strict enough about what is and is not a real control.

### `[ROUND2-VERIFIED]` The hero sensitivity slider is the real threshold control

Evidence:

- `SoundTab.tsx:101-108` writes `feedbackThresholdDb`
- `feedbackDetector.ts:437-438` maps that into `relativeThresholdDb`
- `feedbackDetector.ts:1620-1627` uses `relativeThresholdDb` in `computeEffectiveThresholdDb()`

### `[ROUND2-CORRECTED]` The separate `relativeThresholdDb` UI control is not a real live control

Evidence:

- `SoundTab.tsx:360-362` exposes a `Relative Threshold` slider
- `AdvancedTab.tsx:173-174` also exposes it
- `feedbackDetector.ts:525-528` explicitly says the field is not mapped because `feedbackThresholdDb` is intended to be the single source of truth

That makes the UI misleading: one threshold path is real, the other visible threshold control is effectively disconnected.

### Effective threshold formula

This part of Round 1 still stands:

- `absolute`: `thresholdDb`
- `relative`: `noiseFloorDb + relativeThresholdDb`
- `hybrid`: `max(thresholdDb, noiseFloorDb + relativeThresholdDb)`

Evidence:

- `feedbackDetector.ts:1613-1627`

---

## 6. Math Layer Versus Decision Layer

This is the cleanest shared language for future back-and-forth with Claude.

### Math layer

The low-level DSP math is mostly good:

- spectrum power handling
- prominence
- Q
- PHPR
- MSD
- phase coherence
- comb stability
- room formulas such as Schroeder and `Q_room`

### Decision layer

The decision layer is still heuristic:

- low-frequency phase suppression is a 0.5 multiplier at `algorithmFusion.ts:757-759`
- fusion post-gates are multiplicative heuristics at `algorithmFusion.ts:864-879`
- classifier priors are hand-set at `classifier.ts:38-40`
- classifier features are additive boosts and penalties across `classifier.ts:257-492`
- confidence is a max-like heuristic at `classifier.ts:814-817`

That is acceptable for a product detector, but the product should not oversell these values as calibrated probabilities.

---

## 7. Closed Answers To Round 1's Open Questions

### 7.1 Does `CalibrationTab` trigger the mic calibration wiring gap?

Yes.

Trace:

- `CalibrationTab.tsx:315-316`
- `AudioAnalyzer.tsx:309-314`
- `useAudioAnalyzer.ts:298-304`
- `createAudioAnalyzer.ts:123-125`
- `feedbackDetector.ts:425-549`

The field is dropped in the last step.

### 7.2 Does mobile MEMS auto-apply go through `updateSettings()` or `updateConfig()`?

It goes through `updateSettings()`.

Evidence:

- `AudioAnalyzer.tsx:329-331`

So it is affected by the same bridge gap.

### 7.3 Does calibration session feed learned thresholds back into live detection?

No.

Evidence:

- `useCalibrationSession.ts:64-233`
- `calibrationSession.ts:160-211`

All of that code logs, records, exports, and labels. None of it tunes the detector.

### 7.4 How many settings fields are actually consumed?

Not all exposed settings are equal. The Round 2 answer is:

- a meaningful set of detection controls is active
- a meaningful set of worker/runtime controls is active
- many display controls are active but detection-neutral
- several operator-facing settings are dead or partial

The inventory in Section 4 is the practical answer.

---

## 8. New Round 2 Findings Not Explicit Enough In Round 1

### 8.1 `[ROUND2-DEAD]` `holdTimeMs` appears to be dead

Evidence from current root tree:

- appears in settings/defaults/UI
- detector comment says UI handles it at `feedbackDetector.ts:440-443`
- re-search across `components/`, `hooks/`, `contexts/`, and `lib/` finds no actual runtime consumer

This is stronger than Round 1's wording. It is not just "UI-side"; it appears effectively unused.

### 8.2 `[ROUND2-DEAD]` `quickControlsMode` appears to be dead

Evidence from current root tree:

- defined in `types/advisory.ts`
- defaulted in `constants.ts:737`
- no runtime consumer found in current `components/`, `hooks/`, `contexts/`, or `lib/` tree

### 8.3 `[ROUND2-DEAD]` The visible `relativeThresholdDb` control should now be treated as dead UI debt

Round 1 described the threshold model correctly, but the control audit should be stricter:

- the hero slider is real
- the visible `relativeThresholdDb` slider is not

That is not just semantic drift. It is a disconnected control.

---

## 9. Shared Position For The Next Claude Round

This is the most defensible merged wording after Round 2:

1. DoneWell Audio can detect feedback. The detector is real.
2. The low-level DSP math is broadly sound for this application.
3. The classifier and confidence system are heuristic scoring, not calibrated statistical probability.
4. Mic calibration math is real, but the normal live settings bridge is incomplete and affects both the Calibration tab and mobile auto-MEMS path.
5. Custom mode is ML-capable in the engine but omits ML from the shipped operator-facing path.
6. Default analysis range is 150-10000 Hz.
7. Room-physics heuristics are correlated but capped at +/-0.30 cumulative room delta.
8. Calibration mode is instrumentation/export, not adaptive live detector tuning.
9. The control surface is still the weakest layer: several settings are dead, partial, or misleading.

---

## 10. Practical Implications

If the goal is product credibility, the most important cleanup items are now even clearer:

1. Wire `micCalibrationProfile` through `FeedbackDetector.updateSettings()`.
2. Remove or hide the dead `relativeThresholdDb` control.
3. Remove or implement `holdTimeMs`.
4. Remove or implement `quickControlsMode`.
5. Remove dead DSP-facing toggles: `noiseFloorDecay`, `harmonicFilterEnabled`.
6. Move `musicAware` and `autoMusicAware` out of detector semantics unless they actually affect fusion/content selection.
7. Expose ML honestly in custom mode or stop implying custom mode is "all algorithms".
8. Make room preset threshold changes explicit in the UI.

This still points to a settings/control redesign, not a detector rewrite.

---

## 11. Show Your Work Appendix

### A. Mic calibration trace

- UI control: `CalibrationTab.tsx:315-316`
- mobile auto-apply: `AudioAnalyzer.tsx:329-331`
- debounced settings wrapper: `AudioAnalyzer.tsx:309-314`
- analyzer propagation: `useAudioAnalyzer.ts:298-304`
- analyzer forwarder: `createAudioAnalyzer.ts:123-125`
- detector settings bridge: `feedbackDetector.ts:425-549`
- detector hot path: `feedbackDetector.ts:1136-1167`

Conclusion:

- calibration math exists
- hot-path application exists
- live UI/settings bridge is incomplete

### B. Threshold-control trace

- hero sensitivity slider: `SoundTab.tsx:101-108`
- ignored legacy slider: `SoundTab.tsx:360-362`
- detector bridge mapping: `feedbackDetector.ts:437-438`
- explicit ignore comment: `feedbackDetector.ts:525-528`
- effective threshold formula: `feedbackDetector.ts:1613-1627`

Conclusion:

- one threshold control is real
- one visible threshold control is not

### C. Custom-mode ML trace

- default enabled algorithms: `constants.ts:706`
- custom-mode UI: `SoundTab.tsx:302-313`
- second UI path: `UnifiedControls.tsx:522-533`
- fusion fallback capability: `algorithmFusion.ts:733`

Conclusion:

- engine supports ML
- shipped custom-mode path omits it

### D. Calibration-session trace

- session lifecycle/logging: `useCalibrationSession.ts:64-233`
- export composition: `calibrationSession.ts:160-211`

Conclusion:

- instrumentation/export only
- no live tuning loop

### E. Room-delta cap trace

- `MAX_ROOM_DELTA`: `classifier.ts:79`
- room delta accumulation: `classifier.ts:339-352`, `385`, `435`, `452`
- cap application: `classifier.ts:457-462`
- test coverage: `lib/dsp/__tests__/classifier.test.ts:612-613`

Conclusion:

- correlated heuristics remain
- unbounded-stacking claim no longer holds

### F. Dead-setting trace additions

- `holdTimeMs`: only settings/defaults/UI/comment references found in current root tree; no runtime consumer
- `quickControlsMode`: only defaults/tests found in current root tree
- `noiseFloorDecay`: visible in UI, but runtime noise floor uses attack/release EMA at `feedbackDetector.ts:1605-1610`
- `harmonicFilterEnabled`: visible in UI, but harmonic suppression still runs at `dspWorker.ts:562-563`

---

**Round 2 final sentence:**

The strongest shared version of the audit now is: the detector is real, the math is broadly good, and the control surface is still the main source of product-level truth drift.
