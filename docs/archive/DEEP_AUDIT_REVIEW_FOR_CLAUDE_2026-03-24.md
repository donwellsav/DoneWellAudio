# Deep Audit Review For Claude

Date: 2026-03-24
Repository: `C:\DoneWellAV\DoneWellAudio`
Target document: `docs/DEEP_PIPELINE_AUDIT_2026-03-24.md`
Reviewer: Codex / GPT-5.4

## Purpose

This document is a detailed review of `DEEP_PIPELINE_AUDIT_2026-03-24.md`.

It is not a replacement for that audit.
It is a code-backed review of that audit's strongest claims, weakest claims, and places where wording should be tightened so the final markdown is defensible against direct source inspection.

The most important distinction is this:

- The deep audit is strong on low-level DSP math and system architecture.
- It is weaker on runtime settings wiring and operator-facing semantics.

That means the document is directionally good, but a few of its strongest rebuttals overreach the actual code.

## Bottom Line

If I had to summarize this review in one paragraph:

The deep audit is mostly right that DoneWell Audio has a real detector and that much of the low-level DSP math is sound for the application. It is also right about dead controls, room-preset sensitivity coupling, heuristic probability language, and several known edge cases. But it overstates three things that matter: mic-calibration wiring, ML participation in custom mode from the shipped operator path, and the default analysis range. It also lands too hard on "production-ready" when the control surface is still clearly out of sync with parts of the runtime model.

## Review Method

This review is based on re-checking the current code paths that govern the disputed claims:

- UI settings write path
- React/context settings propagation
- `useAudioAnalyzer` update effect
- `AudioAnalyzer.updateSettings()`
- `FeedbackDetector.updateSettings()`
- worker custom-mode algorithm selection
- defaults in `DEFAULT_SETTINGS` and `DEFAULT_CONFIG`

Primary files re-verified:

- `components/analyzer/settings/SoundTab.tsx`
- `components/analyzer/settings/CalibrationTab.tsx`
- `components/analyzer/settings/RoomTab.tsx`
- `components/analyzer/AudioAnalyzer.tsx`
- `hooks/useAudioAnalyzer.ts`
- `lib/audio/createAudioAnalyzer.ts`
- `lib/dsp/feedbackDetector.ts`
- `lib/dsp/algorithmFusion.ts`
- `lib/dsp/constants.ts`
- `types/advisory.ts`

## What The Deep Audit Gets Right

These parts of `DEEP_PIPELINE_AUDIT_2026-03-24.md` are strong and should be preserved.

### 1. The app can detect feedback

This is correct.

The pipeline is real:

1. Main thread acquires mic audio.
2. `FeedbackDetector` does peak detection and front-end DSP.
3. Worker computes algorithm scores, fusion, classifier output, and advisories.
4. UI renders advisories and spectrum.

Relevant code:

- `hooks/useAudioAnalyzer.ts`
- `lib/audio/createAudioAnalyzer.ts`
- `lib/dsp/feedbackDetector.ts`
- `lib/dsp/dspWorker.ts`

### 2. Much of the low-level DSP math is sound

The deep audit is strong on the following:

- dB-to-linear LUT and prefix sums
- prominence calculation
- PHPR in the linear domain
- Q estimation from -3 dB bandwidth
- persistence logic
- MSD second-difference logic
- phase coherence as circular mean phasor magnitude

I do not disagree with those sections in substance.

### 3. The classifier is heuristic, not a calibrated posterior

The deep audit is correct to say the classifier is Bayesian-style rather than a statistically calibrated Bayesian posterior.

The code uses:

- fixed priors,
- additive boosts and penalties,
- normalization,
- and confidence derived from max-like heuristics and fusion confidence.

Relevant code:

- `lib/dsp/classifier.ts:32-40`
- `lib/dsp/classifier.ts:257-492`
- `lib/dsp/classifier.ts:813-818`

### 4. The dead-controls section is good

This section is one of the strongest parts of the audit.

The following are correctly called out as dead or effectively dead:

- `musicAware`
- `noiseFloorDecay`
- `harmonicFilterEnabled`

That matches the runtime behavior currently visible in the code.

### 5. Room presets changing sensitivity is correctly identified

The audit correctly fixes the earlier mistake and shows that room preset selection writes both room-model settings and threshold values:

- `feedbackThresholdDb`
- `ringThresholdDb`
- room dimensions and treatment

Relevant code:

- `components/analyzer/settings/RoomTab.tsx:284-297`

This is not necessarily a product bug, but it is semantically important and the audit is right to call it out.

### 6. Backpressure is correctly described

The deep audit is right that worker backpressure drops frames instead of queueing or coalescing.

Relevant code:

- `hooks/useDSPWorker.ts:278-283`
- `hooks/useDSPWorker.ts:313-317`

### 7. `peakMergeCents` mismatch is correctly described

The default is `1000` cents, while the visible UI range is `10..150`.

Relevant code:

- `lib/dsp/constants.ts:678-679`
- `components/analyzer/settings/SoundTab.tsx:343-345`

The audit is right that this creates a hidden jump in behavior when the user first touches the control.

## Major Corrections Needed

These are the sections where the deep audit should be revised.

### 1. Mic calibration is not fully wired through the normal live settings path

This is the biggest correction.

The deep audit says:

> mic calibration is properly wired
> calibration IS wired, IS updated on settings change, and IS applied at 50fps in the hot path

That statement mixes together two different facts:

1. The detector has mic-calibration math and can apply it.
2. The app's normal live settings update bridge successfully forwards `micCalibrationProfile`.

The first statement is true.
The second statement is not supported by the code.

#### What the code does support

`FeedbackDetector.updateConfig()` does react to `micCalibrationProfile` if that field is present:

- `lib/dsp/feedbackDetector.ts:407-413`

`_buildPowerSpectrum()` does apply mic calibration in the hot path:

- `lib/dsp/feedbackDetector.ts:1136-1167`

So the detector absolutely has a real mic-calibration mechanism.

#### What the code does not support

The normal UI settings path for live updates is:

1. UI calls `updateSettings(...)`
2. `useAudioAnalyzer` watches `settings`
3. `analyzerRef.current.updateSettings(settings)` is called
4. `AudioAnalyzer.updateSettings()` forwards to `this.detector.updateSettings(settings)`
5. `FeedbackDetector.updateSettings()` maps `DetectorSettings` into `AnalysisConfig`

Relevant code:

- `hooks/useAudioAnalyzer.ts:298-303`
- `lib/audio/createAudioAnalyzer.ts:123-125`
- `lib/dsp/feedbackDetector.ts:425-548`

Inside that last function, `micCalibrationProfile` is never mapped.

That means:

- `updateConfig()` is capable of applying mic calibration
- but the normal `updateSettings()` bridge does not forward `micCalibrationProfile` into `updateConfig()`

This is exactly why the earlier Codex audit called the live wiring incomplete.

#### Why the deep audit's rebuttal is too strong

It cites:

- `updateConfig()` capability
- `_buildPowerSpectrum()` usage
- mobile auto-apply in `AudioAnalyzer.tsx`

But it does not cite the actual missing bridge in `FeedbackDetector.updateSettings()`.

That omission matters because the user-facing control and mobile auto-apply both operate through the settings path, not by directly calling `updateConfig({ micCalibrationProfile })`.

#### Recommended corrected wording

Replace the current claim with:

> Mic calibration math exists in the detector and is applied in the hot path when `AnalysisConfig.micCalibrationProfile` is set. However, the normal `FeedbackDetector.updateSettings()` bridge does not currently map `DetectorSettings.micCalibrationProfile`, so the live UI/settings wiring is incomplete.

That wording is both fair and code-defensible.

### 2. The custom-mode ML claim is too broad from the shipped operator path

The deep audit says:

> Default enabledAlgorithms includes 'ml'. ML is NOT silently dropped in custom mode.

That is too broad and should be narrowed.

#### What is true

The fusion layer supports `ml` in custom mode as a fallback:

- `lib/dsp/algorithmFusion.ts:732-733`

If `enabledAlgorithms` is absent, the fallback array includes:

- `msd`
- `phase`
- `spectral`
- `comb`
- `ihr`
- `ptmr`
- `ml`

So at the fusion-function level, yes, `ml` is part of the supported custom-mode capability.

#### What is also true

The shipped default settings exclude `ml`:

- `lib/dsp/constants.ts:705-706`

The custom-mode UI only renders six algorithm buttons:

- `components/analyzer/settings/SoundTab.tsx:301-323`

And when that UI builds the current selection, it defaults to the six non-ML algorithms:

- `components/analyzer/settings/SoundTab.tsx:309`

That means from the actual operator-facing path:

- custom mode defaults to six algorithms,
- ML is not in the stored default array,
- and the user cannot turn ML on via the current UI.

#### Why the current audit wording is misleading

The sentence "ML is NOT silently dropped in custom mode" sounds like the operator-facing product path includes it normally.
That is not true in the current UX.

The more accurate statement is:

- fusion supports ML in custom mode,
- but the shipped defaults and UI omit it from the operator-facing control model.

#### Recommended corrected wording

> The fusion layer supports ML in custom mode as a runtime fallback capability, but the shipped default `enabledAlgorithms` array excludes `ml`, and the custom-mode UI exposes only six algorithm toggles. So from the operator-facing path, ML is still omitted by default in custom mode.

### 3. The default analysis range is wrong in the audit

The deep audit says:

> Analysis range defaults: 60–16000 Hz

That is not the current app default.

The actual defaults are:

- `DEFAULT_CONFIG.minHz = 150`
- `DEFAULT_CONFIG.maxHz = 10000`
  in `types/advisory.ts:382-390`

and:

- `DEFAULT_SETTINGS.minFrequency = 150`
- `DEFAULT_SETTINGS.maxFrequency = 10000`
  in `lib/dsp/constants.ts:670-674`

`60–16000` is closer to the `ringOut` mode profile than to the application default.

#### Recommended corrected wording

> Default analysis range is `150–10000 Hz`. The `60–16000 Hz` range is closer to the `ringOut` mode profile, not the base application default.

### 4. "DSP math is correct and production-ready" is too strong as a full-system conclusion

The deep audit says:

> The DSP math is correct and production-ready.

I would not keep that sentence as written.

Why:

- the core DSP layer is strong,
- but the control surface still contains dead fields,
- the settings model still has drift,
- calibration behavior is still semantically messy,
- and the product exposes controls that do not truthfully represent runtime behavior.

A good detector can still be not production-clean as a user-facing system.

That is the current situation here.

#### Recommended corrected wording

> The core DSP math is strong enough for real use, but the operator-facing settings and control surface still need cleanup before the system should be described as fully production-ready without caveats.

## Important Nuance The Deep Audit Should Keep

There are several places where the document is already nuanced and should stay that way.

### 1. Low-frequency phase suppression is rightly described as heuristic

The deep audit is right to call the `0.5×` low-frequency phase suppression heuristic.

Relevant code:

- `lib/dsp/algorithmFusion.ts:757-759`

That is a good section and should stay.

### 2. The classifier probability language is already well handled

The audit does a good job distinguishing practical ranking scores from statistically calibrated probabilities.

That is one of its strongest sections and should not be watered down.

### 3. The room-physics section is mostly good

The room-physics review is mostly solid and broadly consistent with the code.

The only nuance I would keep emphasizing is:

- the implementation is textbook-inspired,
- not purely textbook-pure,
- because it adds clamps, gating, and heuristics for product behavior.

That is still fine, but worth framing carefully.

## Additional Product-Level Notes The Deep Audit Could Expand

These are not necessarily "mistakes" in the document, but they are worth making more explicit.

### 1. Calibration session is not live calibration

The deep audit talks about calibration in the detector/math sense, but the broader product still risks sounding more adaptive than it is.

The session code:

- records detections,
- tracks settings history,
- logs noise floor and snapshots,
- exports session data

but does not actively learn and feed tuned thresholds back into the live detector.

Relevant code:

- `hooks/useCalibrationSession.ts:63-95`
- `hooks/useCalibrationSession.ts:191-196`
- `lib/calibration/calibrationSession.ts:160-210`

This should be called out more explicitly if the goal is full honesty.

### 2. Threshold semantics remain non-obvious even if intentional

The deep audit is basically right about threshold semantics.

But the product problem is not just whether the math works.
It is that the user-facing model is hard to reason about because:

- the hero slider drives `feedbackThresholdDb`,
- which maps to `relativeThresholdDb`,
- while `relativeThresholdDb` is exposed separately as a legacy-looking advanced field,
- and `thresholdDb` remains a hidden fixed floor used in absolute mode.

Relevant code:

- `components/analyzer/settings/SoundTab.tsx:101-108`
- `lib/dsp/feedbackDetector.ts:437-438`
- `lib/dsp/feedbackDetector.ts:521-528`
- `lib/dsp/feedbackDetector.ts:1613-1627`
- `types/advisory.ts:388-390`

This is not a formula bug, but it is still a trust problem.

### 3. Dead controls are not just cleanup debt

The deep audit already flags the dead controls.

I would push that point harder:

dead controls are not cosmetic debt.
They are operator trust debt.

When a product exposes controls that do nothing, it becomes harder to trust the controls that do matter.

## Suggested Revisions To The Deep Audit

If Claude wants to revise the source document rather than replace it, these are the highest-value edits.

### Replace Section 9.1 with this

> Mic calibration math exists in the detector and is applied in the hot path when `AnalysisConfig.micCalibrationProfile` is set. However, the normal `FeedbackDetector.updateSettings()` bridge does not currently map `DetectorSettings.micCalibrationProfile`, so the live UI/settings wiring is incomplete. Mobile auto-apply still writes `'smartphone'` through the settings path, which makes this mismatch especially important.

### Replace the custom-mode ML note with this

> The fusion layer supports ML in custom mode as a runtime fallback capability, but the shipped default `enabledAlgorithms` array excludes `ml`, and the custom-mode UI exposes only six algorithm toggles. So from the operator-facing path, ML is still omitted by default in custom mode.

### Replace the default analysis range statement with this

> Default analysis range is `150–10000 Hz`. The `60–16000 Hz` range is closer to the `ringOut` mode profile than to the application default.

### Soften the final production-readiness language to this

> The core DSP math is strong and the detector is real, but the settings/control surface still contains enough dead wiring, hidden coupling, and semantic drift that the system should be described as capable rather than unqualifiedly production-ready.

## Reconciled Final Position

This is the final position I think both audits can converge on honestly:

1. DoneWell Audio can detect feedback.
2. The low-level DSP foundation is real and mostly strong.
3. The classifier and confidence system are heuristic scoring, not statistical calibration.
4. Room-physics logic is broadly sound, though productized with practical clamps and heuristics.
5. Mic calibration math exists, but the live settings path is still incomplete.
6. ML support exists in fusion, but custom-mode defaults/UI still omit it from the operator-facing path.
7. The control surface still has enough drift and dead fields that product trust is lower than the DSP quality deserves.
8. The right next step is not a wholesale detector rewrite. It is a settings-schema and controls rebuild around the actual runtime model.

## Final Verdict On The Target Document

`DEEP_PIPELINE_AUDIT_2026-03-24.md` is a strong document, but not yet the final word.

My review is:

- mathematically strong,
- architecturally informed,
- much improved over the earlier Claude version,
- but still overstated in a few runtime-wiring areas.

If the corrections in this document are applied, it becomes a much cleaner handoff artifact for adversarial review.
