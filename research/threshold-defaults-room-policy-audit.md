# Threshold Defaults and Room Policy Audit

## Scope

This document covers the shipped first-parent history from `49c377b` (`v0.91.0`) to `79b3f30` (`v0.100.0`) only. It does **not** treat the later uncommitted Claude patch as shipped history. That patch is handled separately in `current-claude-patch-review.md`, with only a brief comparison at the end of this file.

## Audit Method

### Evidence

- Version anchor:
  `49c377b` is the first-parent `package.json` version bump for `v0.91.0`.
- End of shipped range:
  `79b3f30` is the first-parent `package.json` version bump for `v0.100.0`.
- Relevant first-parent commits touching DSP/settings/runtime surfaces in this range:
  `5e7bf49`, `63815f0`, `494fc58`, `93ab90a`, `e0051c4`, `b8480f8`, `f805fb5`.
- Significant leaf commits inside that range:
  `c7017d3`, `5b73b8d`, `494fc58`, `93ab90a`, `dad273a`, `0b2e284`, `02a2ef0`.

The audit used first-parent git history plus direct inspection of affected runtime files under `lib/dsp`, `lib/settings`, `hooks`, `lib/audio`, and `types`.

## Silent Drift Found

### The startup default `25 -> 20` shift introduced by `02a2ef0`

### Evidence

- Before `02a2ef0`, `DEFAULT_SETTINGS` in `lib/dsp/constants/presetConstants.ts` was a literal flat settings object with `feedbackThresholdDb: 25`.
- `02a2ef0` replaced that literal with a compatibility export that now points to `DEFAULT_DETECTOR_SETTINGS`.
- `DEFAULT_DETECTOR_SETTINGS` is built by `deriveDefaultDetectorSettings()` in `lib/settings/defaultDetectorSettings.ts`, which derives from `MODE_BASELINES[modeId]`.
- `MODE_BASELINES.speech.feedbackThresholdDb` in `lib/settings/modeBaselines.ts` was `20` at `v0.100.0`.

### Inference

This was a real behavior change shipped under a structural refactor. A fresh speech-mode startup became `5 dB` more sensitive even though the commit frame was "canonicalize layered default settings," not "retune startup threshold."

### Important distinction

This silent drift affected the **fresh-start default path**. It did not by itself prove that the intended **speech mode preset** should also be `25`. That distinction matters because the historical code had two truths:

- the live speech preset tables were `20`,
- while the old flat startup default literal was `25`.

That split is awkward, but it is what the shipped history shows.

## Intentional Retunes Found

## `93ab90a` - Harden feedback detection and Companion workflow

### Evidence

- `lib/dsp/detectorUtils.ts` added `MODE_RELATIVE_HEADROOM_SCALE` and `normalizeRelativeThresholdDb`, making effective threshold behavior mode-dependent.
- `lib/dsp/feedbackDetector.ts` widened MSD and early-confirm behavior:
  `msdWriteThreshold` changed from `effectiveThresholdDb - 6` to `-9`,
  early confirm became frequency-dependent,
  and minimum energy above noise became mode-dependent.
- `lib/dsp/fusionEngine.ts` loosened verdict promotion criteria, including lower FEEDBACK confidence and broader POSSIBLE_FEEDBACK entry.

### Inference

This commit intentionally made some modes easier to promote earlier while also making thresholding more mode-aware. It is not drift.

## `dad273a` - Improve detection pipeline accuracy and performance

### Evidence

- `lib/audio/createAudioAnalyzer.ts` changed worker spectrum-update cadence from `500 ms` to `100 ms`.
- `lib/dsp/classifier.ts` added whistle/vibrato confirmation logic and suppression of some uncertain or speech-like possible-feedback cases.
- `lib/dsp/fusionEngine.ts` added new content- and compression-aware penalties plus corroboration logic.
- `lib/dsp/workerFft.ts` improved content/compression tracking and silence reset behavior.

### Inference

This is a major intentional retune of the classifier/fusion path, not a documentation mismatch or accidental threshold wobble.

## `0b2e284` - Refresh docs and retune feedback reporting

### Evidence

- In `lib/dsp/classifier.ts`, speech/worship suppression of possible feedback tightened from roughly `pFeedback < 0.45` and `pInstrument >= 0.30` to `pFeedback < 0.40` and `pInstrument >= 0.35`.
- The same commit added `urgentFeedbackDominance` and softened some reject logic so that strongly growing feedback-like cases could preserve urgency under conservative fusion conditions.

### Inference

This is an explicit reporting retune aimed at false-positive control while preserving urgency in strong cases.

## `5b73b8d` inside merge `63815f0` - Aggressive cut depths

### Evidence

- `lib/dsp/eqAdvisor.ts` changed `GROWING` to use `maxCut`, and moved `RESONANCE` and `POSSIBLE_RING` to `moderateCut`.
- `lib/dsp/feedbackHistory.ts` deepened the retry floor from the older `-12 dB` style behavior to a max-cut-aware lower bound.

### Inference

This is an advisory-strength retune. It changes how hard the product recommends cutting, not the underlying acoustic threshold that decides whether something is feedback-like.

## `c7017d3` - Mostly performance, plus one important clamp

### Evidence

- The commit is predominantly hot-path optimization.
- One behaviorally meaningful item remains: final `[0,1]` clamping after calibration extrapolation in `lib/dsp/fusionEngine.ts`.

### Inference

This is mostly not a threshold retune. The clamp is a correctness/safety fix, not a policy shift.

## Ruled-Out Suspects

## Diagnostics persistence is intentional, not a mode-change bug

### Evidence

- `hooks/useLayeredSettings.ts` resets `liveOverrides` on mode change but intentionally preserves diagnostics state.
- `lib/settings/deriveSettings.ts` applies diagnostics overrides explicitly into the flat `DetectorSettings`.
- `lib/storage/settingsStorageV2.ts` stores the layered session in `dwa-v2-session`.

### Inference

Sticky diagnostics are real, but they are part of the layered-settings design. They are not proof that mode changing is broken.

## Worker settings flow is intact

### Evidence

- `hooks/useDSPWorker.ts` drops non-init messages before readiness.
- `hooks/useAudioAnalyzer.ts` updates both audio runtime settings and worker runtime settings when settings change, and initializes the worker with a full settings bag on start/restart.
- `lib/settings/runtimeSettings.ts` enumerates the worker runtime keys explicitly.

### Inference

The worker partial-settings race is not a credible primary explanation for the observed product behavior in the shipped app path.

## Room composition is explicit, not ambiguous

### Evidence

- `lib/settings/deriveSettings.ts` composes thresholds as:
  `baseline + environment offset + live sensitivity`.
- `lib/settings/environmentTemplates.ts` defines relative offsets.

### Inference

There is no hidden room-composition rule. The ambiguity is product intent, not implementation ambiguity.

## Current Architectural Risks

## Duplicate mode source of truth

### Evidence

- `lib/dsp/constants/presetConstants.ts` contains `OPERATION_MODES`.
- `lib/settings/modeBaselines.ts` contains `MODE_BASELINES`.

### Inference

They matched at the time of audit, but they are separate full tables. That is a maintenance risk because one can drift from the other unless tests keep them aligned.

## Room offset policy is coupled to the speech baseline

### Evidence

- `lib/settings/environmentTemplates.ts` documents room offsets as derived relative to the speech baseline.

### Inference

Any change to speech-baseline policy can cascade through room policy if the project treats room offsets as speech-relative rather than as their own canonical matrix.

## Startup default semantics can drift through compatibility rewires

### Evidence

- `02a2ef0` changed startup behavior by replacing a literal compatibility object with a derived layered-settings export.

### Inference

Future refactors can silently change startup semantics if compatibility exports are not separately pinned and tested.

## Product Options Going Forward

### Option 1: Narrow fix

Restore the fresh-start `25 dB` default only and leave the live speech preset at `20`, preserving the historical distinction the shipped code actually had.

### Option 2: Broader speech retune

Raise both the fresh-start default and the live speech preset to `25`, accepting that this is a wider product change than the original silent drift.

### Option 3: Canonical room matrix

Stop deriving room feedback offsets from the speech baseline and make room policy its own explicit matrix so that speech-baseline changes do not automatically cascade across all mode-room combinations.

## Comparison to Current Uncommitted State

The current uncommitted Claude patch does not implement Option 1. It implements a broader change closer to Option 2 and also rewrites room offsets in `lib/settings/environmentTemplates.ts`. That patch therefore goes beyond a narrow startup-default fix and creates a separate room-policy decision.
