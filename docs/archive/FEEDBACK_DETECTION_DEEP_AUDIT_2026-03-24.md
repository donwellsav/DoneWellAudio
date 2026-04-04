# Feedback Detection Deep Audit

Date: 2026-03-24
Repository: `C:\DoneWellAV\DoneWellAudio`
Scope: feedback detection pipeline, settings/control surface, DSP math, calibration behavior, and evidence from tests.

## Purpose

This memo is written to be handed to another model or reviewer for adversarial review.
It is not trying to "win". It is trying to make falsifiable claims with line-backed evidence.

If Claude disagrees with any claim below, the useful response is:

1. Name the claim.
2. Cite the code path that contradicts it.
3. Explain whether the disagreement is about runtime behavior, intent, or wording.

## Executive Verdict

The app can detect feedback. It is not fake, and the DSP stack is substantive.

The main problem is not "there is no detector". The main problem is that the control surface and stored settings model no longer match the actual detector and worker contracts. Several controls are dead, partially wired, duplicated, or semantically misleading.

That mismatch hurts operator trust, preset credibility, and any claim that the UI is exposing the real behavior of the system.

In short:

- The core detector exists and does real work.
- Several core DSP primitives are mathematically reasonable for this application.
- The decision layer is still mostly heuristic, not calibrated probability.
- The current controls are carrying over assumptions from an older system and are not a clean model of this system.
- Mic calibration is currently more misleading than useful because runtime wiring is incomplete.

## Runtime Map

Current pipeline:

1. Main thread captures mic audio through `AnalyserNode`.
2. `FeedbackDetector.analyze()` does peak detection, persistence, MSD, thresholding, and some harmonic/Q/PHPR work.
3. Main thread sends peak plus spectrum plus optional time-domain data to the DSP worker.
4. Worker computes algorithm scores, fuses them, classifies the track, gates reporting, and emits advisories.
5. React/UI renders spectrum, tracks, and issue cards.

Primary files:

- `lib/dsp/feedbackDetector.ts`
- `hooks/useDSPWorker.ts`
- `lib/dsp/dspWorker.ts`
- `lib/dsp/classifier.ts`
- `lib/dsp/algorithmFusion.ts`
- `lib/dsp/advisoryManager.ts`

## High Confidence Findings

### 1. Mic calibration is not properly wired into live detector updates

Claim:
`micCalibrationProfile` is a real config field in the detector, but the normal settings update path does not map the UI field into the detector's `AnalysisConfig`.

Evidence:

- Calibration UI writes `micCalibrationProfile`:
  `components/analyzer/settings/CalibrationTab.tsx:311-317`
- Detector update path maps many settings but not `micCalibrationProfile`:
  `lib/dsp/feedbackDetector.ts:425-548`
- Detector analysis actually reads `config.micCalibrationProfile`:
  `lib/dsp/feedbackDetector.ts:1134-1167`
- Export/session code records calibration as if it was active:
  `lib/calibration/calibrationSession.ts:169-210`
- Mobile auto-applies `smartphone` on startup:
  `components/analyzer/AudioAnalyzer.tsx:323-333`

Assessment:

- Best case: this control is inconsistently applied.
- Worst case: users are told calibration is active when live detection is not actually using the updated profile.
- The mobile auto-apply path makes this more dangerous, not less.

### 2. Threshold control semantics are inconsistent

Claim:
The main sensitivity slider, `thresholdMode`, `relativeThresholdDb`, and `thresholdDb` do not form a clean single model.

Evidence:

- Hero "Sensitivity" slider writes `feedbackThresholdDb`:
  `components/analyzer/settings/SoundTab.tsx:101-108`
- Detector maps that field to `relativeThresholdDb`:
  `lib/dsp/feedbackDetector.ts:437-438`
- The detector explicitly ignores `relativeThresholdDb` updates from the settings object:
  `lib/dsp/feedbackDetector.ts:521-528`
- Effective threshold still uses `thresholdDb` for `absolute` mode:
  `lib/dsp/feedbackDetector.ts:1613-1627`
- `DEFAULT_CONFIG.thresholdDb` is a fixed `-80`:
  `types/advisory.ts:388-390`

Assessment:

- In `relative` and `hybrid`, the hero slider effectively drives relative threshold.
- In `absolute`, the UI is misleading because the detector falls back to the fixed `thresholdDb`.
- The separate "Relative Threshold" control is legacy debt because the update path says the hero slider is the single source of truth.

### 3. `musicAware` and `autoMusicAware` are mostly UI-side state, not live worker behavior

Claim:
The UI flips `musicAware`, but the worker fusion path does not consume it as an active runtime control.

Evidence:

- UI auto-toggles `musicAware` based on signal-vs-noise:
  `components/analyzer/AudioAnalyzer.tsx:153-171`
- Worker fusion/classification uses `contentType`, `algorithmMode`, `enabledAlgorithms`, and `settings.mode`:
  `lib/dsp/dspWorker.ts:471-495`
- Search across the app shows `musicAware` mostly in UI/types/constants/preset code, not in live detector/worker logic.

Assessment:

- `autoMusicAware` may still affect saved settings and preset state.
- It is not a credible operator control unless the worker or detector actually uses it.

### 4. `noiseFloorDecay` is dead UI

Claim:
`noiseFloorDecay` is exposed but not used by runtime noise-floor tracking.

Evidence:

- UI exposes it:
  `components/analyzer/settings/SoundTab.tsx:327-337`
  `components/analyzer/settings/AdvancedTab.tsx:31-47`
- Runtime noise floor update uses attack/release EMA only:
  `lib/dsp/feedbackDetector.ts:1605-1610`

Assessment:

- This field wastes operator attention.
- It should be removed or actually wired.

### 5. `harmonicFilterEnabled` is dead UI

Claim:
The toggle exists, but harmonic suppression still runs regardless.

Evidence:

- UI exposes it:
  `components/analyzer/settings/SoundTab.tsx:242-243`
- Harmonic suppression in advisory dedup reads tolerance, not the enable flag:
  `lib/dsp/advisoryManager.ts:48-65`
- Worker always applies harmonic skip:
  `lib/dsp/dspWorker.ts:562-563`

Assessment:

- Current behavior is "always on", while the UI implies user control.

### 6. Room presets change detector sensitivity, not just room physics

Claim:
Choosing a room preset changes `feedbackThresholdDb` and `ringThresholdDb` as well as room dimensions/treatment.

Evidence:

- Room preset click writes both room settings and detector thresholds:
  `components/analyzer/settings/RoomTab.tsx:284-297`
- Room dimensions also auto-derive `roomRT60` and `roomVolume`:
  `components/analyzer/settings/RoomTab.tsx:246-263`
- Classifier uses room fields heavily:
  `lib/dsp/classifier.ts:235-241`
  `lib/dsp/classifier.ts:347-455`
  `lib/dsp/classifier.ts:642-647`

Assessment:

- "Room preset" is not just room modeling.
- It is a combined room-plus-aggressiveness preset.
- That is not necessarily wrong, but it is semantically misleading and should be explicit.

### 7. Custom algorithm mode silently drops ML from the user-facing list

Claim:
Fusion supports ML as an algorithm, but the custom-mode defaults and UI do not expose it.

Evidence:

- Fusion includes `ml` in auto/custom lists:
  `lib/dsp/algorithmFusion.ts:711-733`
- Default enabled algorithm list excludes `ml`:
  `lib/dsp/constants.ts:705-706`
- Custom UI buttons only expose six algorithms:
  `components/analyzer/settings/SoundTab.tsx:301-323`

Assessment:

- This is a contract mismatch between algorithm capabilities and control surface.
- It can change outcomes in custom mode without the user understanding why.

### 8. Advisory dedup window defaults are far outside the UI range

Claim:
`peakMergeCents` defaults to `1000`, but the UI only suggests a range of `10..150`.

Evidence:

- Default setting:
  `lib/dsp/constants.ts:678-679`
- UI range:
  `components/analyzer/settings/SoundTab.tsx:343-345`
- Advisory dedup actually uses `peakMergeCents`:
  `lib/dsp/advisoryManager.ts:272-279`

Assessment:

- Either the default is wrong, or the UI range is wrong, or both.
- As shipped, this makes nearby peaks collapse much more aggressively than the UI suggests.

### 9. Worker backpressure drops peaks outright

Claim:
If the worker is still busy, the next candidate frame is dropped rather than queued or coalesced.

Evidence:

- Busy worker causes immediate frame drop:
  `hooks/useDSPWorker.ts:278-283`
- Busy flag is set before posting to the worker:
  `hooks/useDSPWorker.ts:313-317`

Assessment:

- This directly reduces recall in dense or unstable scenes.
- It also makes the detector behave differently under load than under ideal lab conditions.

### 10. Calibration mode is mostly logging and export, not closed-loop detector calibration

Claim:
Calibration session code captures detections, settings history, noise floor, and snapshots, but it does not learn or feed calibrated thresholds back into the live detector.

Evidence:

- Session lifecycle and logging:
  `hooks/useCalibrationSession.ts:63-95`
  `hooks/useCalibrationSession.ts:191-196`
- Export bundles detections, settings history, snapshots, and mic calibration metadata:
  `lib/calibration/calibrationSession.ts:160-210`

Assessment:

- This is a session recorder, not a real adaptive calibration loop.
- It can still be useful for product improvement and later model work, but it should not be described as if it is tuning the detector live.

### 11. The classifier's "probabilities" are heuristic scores, not calibrated Bayesian posteriors

Claim:
The code uses Bayesian language, but behavior is hand-tuned priors plus additive deltas plus normalization.

Evidence:

- Hand-set priors:
  `lib/dsp/classifier.ts:32-40`
- Additive heuristic updates and renormalization:
  `lib/dsp/classifier.ts:257-492`
- Final confidence is effectively the max of heuristic values:
  `lib/dsp/classifier.ts:813-818`
- "Calibrated confidence" helper is still heuristic:
  `lib/dsp/acousticUtils.ts:473-525`

Assessment:

- This is acceptable as a product scoring layer.
- It is not acceptable to present as statistically calibrated probability unless a real calibration step is added against labeled data.

### 12. Room adaptation is only partly adaptive

Claim:
The code says it uses Schroeder frequency as the low/mid boundary, but it clamps that boundary to at least 300 Hz.

Evidence:

- `lowMidBoundary = Math.max(schroederHz, FREQUENCY_BANDS.LOW.maxHz)`:
  `lib/dsp/acousticUtils.ts:69-70`

Assessment:

- In many realistic rooms, Schroeder frequency will be well below 300 Hz.
- So the low/mid split is less room-adaptive than the comments imply.

## Control Inventory

The cleanest way to understand the control surface is to separate controls into four groups.

### A. Controls that appear to have real live detector effect

These are plausibly live and meaningful:

- `mode`
  Evidence: `contexts/AudioAnalyzerContext.tsx:104-127`, `lib/dsp/feedbackDetector.ts:447-452`
- `feedbackThresholdDb`
  Evidence: `components/analyzer/settings/SoundTab.tsx:101-108`, `lib/dsp/feedbackDetector.ts:437-438`
- `ringThresholdDb`
  Evidence: `components/analyzer/settings/SoundTab.tsx:196-199`, `lib/dsp/feedbackDetector.ts:487-493`
- `growthRateThreshold`
  Evidence: `components/analyzer/settings/SoundTab.tsx:201-204`, `lib/dsp/feedbackDetector.ts:491-493`
- `minFrequency` / `maxFrequency`
  Evidence: `components/analyzer/settings/SoundTab.tsx:138-155`, `lib/dsp/feedbackDetector.ts:431-435`
- `fftSize`
  Evidence: `components/analyzer/settings/SoundTab.tsx:383-390`, `lib/dsp/feedbackDetector.ts:428-429`
- `sustainMs` / `clearMs`
  Evidence: `components/analyzer/settings/SoundTab.tsx:252-260`, `lib/dsp/feedbackDetector.ts:513-519`
- `prominenceDb`
  Evidence: `components/analyzer/settings/SoundTab.tsx:364-366`, `lib/dsp/feedbackDetector.ts:529-530`
- `noiseFloorAttackMs` / `noiseFloorReleaseMs`
  Evidence: `components/analyzer/settings/SoundTab.tsx:332-337`, `lib/dsp/feedbackDetector.ts:533-539`
- `aWeightingEnabled`
  Evidence: `components/analyzer/settings/SoundTab.tsx:240-241`, `lib/dsp/feedbackDetector.ts:495-498`
- `ignoreWhistle`
  Evidence: `components/analyzer/settings/SoundTab.tsx:244-245`, `lib/dsp/feedbackDetector.ts:541-543`, `lib/dsp/classifier.ts:611-655`
- `inputGainDb`, `autoGainEnabled`, `autoGainTargetDb`
  Evidence: `lib/dsp/feedbackDetector.ts:454-473`, `lib/dsp/feedbackDetector.ts:1139-1158`
- `harmonicToleranceCents`
  Evidence: `lib/dsp/feedbackDetector.ts:475-476`, `lib/dsp/advisoryManager.ts:49-60`
- `roomRT60`, `roomVolume`
  Evidence: `lib/dsp/feedbackDetector.ts:500-506`, `lib/dsp/classifier.ts:235-241`
- `confidenceThreshold`
  Evidence: `components/analyzer/settings/SoundTab.tsx:213-216`, `lib/dsp/feedbackDetector.ts:508-510`, `lib/dsp/classifier.ts:619-634`

### B. Controls that affect worker/reporting/advisory behavior more than detector front-end DSP

- `maxTracks` / `trackTimeoutMs`
  Evidence: `components/analyzer/settings/SoundTab.tsx:372-377`, `lib/dsp/dspWorker.ts:250-258`
- `eqPreset`
  Evidence: `components/analyzer/settings/SoundTab.tsx:229-237`, `lib/dsp/dspWorker.ts:571-575`
- `peakMergeCents`
  Evidence: `components/analyzer/settings/SoundTab.tsx:343-345`, `lib/dsp/advisoryManager.ts:272-279`
- `roomPreset`, `roomLengthM`, `roomWidthM`, `roomHeightM`, `roomTreatment`
  Evidence: `components/analyzer/settings/RoomTab.tsx:246-297`, `lib/dsp/classifier.ts:347-455`

### C. Controls that are display/UI behavior, not detector correctness

- `holdTimeMs`
  Evidence:
  `lib/dsp/feedbackDetector.ts:440-443`
- `maxDisplayedIssues`
  Evidence:
  `components/analyzer/settings/SoundTab.tsx:267-270`
  `hooks/useAdvisoryMap.ts:49-58`
- `showAlgorithmScores`, `showPeqDetails`, `showFreqZones`, `spectrumWarmMode`, `swipeLabeling`
- `rtaDbMin`, `rtaDbMax`, `spectrumLineWidth`, `showThresholdLine`, `canvasTargetFps`, `graphFontSize`
- `faderMode`

Assessment:

- These are valid product controls.
- They should be separated from live detection controls in the UX.

### D. Controls that are currently dead, broken, or misleading

- `micCalibrationProfile`
  Broken/incomplete runtime wiring.
- `musicAware`
  Mostly UI state.
- `autoMusicAware`
  Mostly UI state.
- `noiseFloorDecay`
  Dead.
- `harmonicFilterEnabled`
  Dead.
- `relativeThresholdDb`
  Exposed, but the detector says the hero slider is the single source of truth.
- `thresholdMode`
  Semantically unstable because `absolute` uses the hidden fixed `thresholdDb`.

## Math Audit

### What looks mathematically sound enough for this application

#### MSD

The second-derivative MSD implementation is standard and correctly averaged.

Evidence:

- `secondDeriv = v2 - 2 * v1 + v0`
- `msd = sumSquaredSecondDeriv / numTerms`
- score mapping `exp(-msd / threshold)`

Code:

- `lib/dsp/msdAnalysis.ts:129-147`

Assessment:

- Reasonable for distinguishing stable feedback-like growth from normal musical variation.

#### Phase coherence

The phase coherence implementation uses the magnitude of the mean phasor over frame-to-frame phase differences.

Code:

- `lib/dsp/phaseCoherence.ts:60-115`

Assessment:

- This is mathematically coherent and appropriate for tonal stability detection.

#### Q estimation

Q is estimated from the -3 dB bandwidth around the peak, with interpolation at threshold crossings.

Code:

- `lib/dsp/feedbackDetector.ts:1463-1525`

Assessment:

- This is a standard engineering approximation.
- It is sensitive to FFT leakage and peak shape, but conceptually correct for this context.

#### PHPR

PHPR is averaged in linear power, not dB, then converted back.

Code:

- `lib/dsp/feedbackDetector.ts:1529-1580`

Assessment:

- This is the correct math for combining harmonic powers.

### What is heuristic rather than mathematically calibrated

#### Spectral flatness post-adjustment

Width-adjusted flatness modifies the raw statistic based on the number of elevated bins within 10 dB of the peak.

Code:

- `lib/dsp/compressionDetection.ts:93-115`

Assessment:

- This is a reasonable application heuristic.
- It is not a canonical spectral-flatness measure anymore once this blend is applied.

#### Fusion post-gates

The fusion stage applies multiplicative gates after weighted combination.

Code:

- IHR gate: `lib/dsp/algorithmFusion.ts:864-870`
- PTMR gate: `lib/dsp/algorithmFusion.ts:872-876`

Assessment:

- Pragmatically useful.
- Not wrong, but clearly heuristic.

#### Classifier probability/confidence semantics

The classifier starts with hand-selected priors, applies many hand-tuned deltas, renormalizes, and then confidence is based on max score and fusion confidence.

Code:

- `lib/dsp/classifier.ts:32-40`
- `lib/dsp/classifier.ts:257-492`
- `lib/dsp/classifier.ts:813-818`

Assessment:

- Good enough as a ranking system.
- Not a calibrated Bayesian posterior.

## Mic Calibration Assessment

### Does mic calibration help?

My assessment:

- A per-model compensation profile can help the RTA and frequency ranking if the mic is actually known and the profile is trustworthy.
- It is a secondary lever for feedback detection. Thresholding, persistence, MSD, phase, and gating matter more.
- A generic smartphone profile is risky because device-to-device MEMS response varies too much for "detector calibration" claims.

### Is it harmful, helpful, or wasted?

Current answer: mostly wasted, sometimes misleading, potentially harmful.

Reason:

- The live runtime wiring is incomplete.
- The mobile path auto-enables the generic smartphone profile:
  `components/analyzer/AudioAnalyzer.tsx:329-331`
- The session/export path still reports calibration as active:
  `lib/calibration/calibrationSession.ts:169-210`

Recommendation:

- If kept now, label it as RTA/display compensation first.
- Do not position it as a detector-improving control until validated with captured real-world datasets.

## Does the app detect feedback?

Yes, but with caveats.

Why "yes":

- Real peak detection exists.
- Real temporal metrics exist.
- Real algorithm fusion exists.
- Worker classification and advisory generation exist.
- Multiple independent signals contribute to the decision.

Why not "yes, confidently, across the product surface":

- Controls do not accurately represent the runtime model.
- Several known false-positive and false-negative scenarios remain in the test suite as documented vulnerabilities.
- The score/confidence language is stronger than the underlying calibration justifies.

## Test Evidence of Known Failure Modes

The test suite itself documents important failure cases.

Examples:

- Sustained synth false positive:
  `tests/dsp/algorithmFusion.test.ts:172-175`
- Low-frequency reverberant feedback false negative:
  `tests/dsp/algorithmFusion.test.ts:192-198`
- Sustained vowel false positive:
  `tests/dsp/algorithmFusion.test.ts:212-214`
- Dense mix false negative:
  `tests/dsp/algorithmFusion.test.ts:270-276`
- Auto-Tuned vocal false positive:
  `tests/dsp/algorithmFusion.gpt.test.ts:189-198`
- Real feedback without MSD collapses:
  `tests/dsp/algorithmFusion.chatgpt-context.test.ts:172-175`
- Real feedback without phase collapses in music mode:
  `tests/dsp/algorithmFusion.chatgpt-context.test.ts:203-214`
- Single strong algorithm cannot reach `FEEDBACK` alone:
  `tests/dsp/algorithmFusion.chatgpt.test.ts:259-268`
- Two strongest algorithms still struggle to reach threshold:
  `tests/dsp/algorithmFusion.chatgpt.test.ts:271-280`

Assessment:

- This is not an indictment of the entire system.
- It is evidence that the project itself already knows the detector has important edge cases.

## Architecture Drift in the Controls Layer

There is evidence that the settings model has drifted over time.

Evidence:

- Current exported analyzer alias points `UnifiedControls` to `SettingsPanel`:
  `components/analyzer/index.ts:6-7`
- There is still a legacy `components/analyzer/UnifiedControls.tsx` file in the tree.
- `SettingsPanel` preset storage still carries legacy/dead fields:
  `components/analyzer/settings/SettingsPanel.tsx:36-44`
- `SettingsPanel` still contains backward-compat migration shims, including explicit `any` and old `micCalibrationEnabled` translation:
  `components/analyzer/settings/SettingsPanel.tsx:110-126`

Assessment:

- This supports the thesis that the control surface was carried forward from a different underlying system.
- Rebuilding the settings schema first, then rebuilding the UI on top of it, would materially improve the app.

## Claims Claude Should Challenge

These are the highest-value claims to verify:

1. `micCalibrationProfile` does not reliably reach live detector config through normal settings updates.
2. `relativeThresholdDb` is legacy/dead in the detector update path.
3. `musicAware` does not materially change worker fusion/classification behavior.
4. `noiseFloorDecay` is dead.
5. `harmonicFilterEnabled` is dead.
6. Room presets are silently changing sensitivity, not just room modeling.
7. The custom algorithm UI omits ML even though fusion supports it.
8. The classifier outputs are heuristics, not calibrated probabilities.
9. Worker backpressure is a real recall risk because frames are dropped outright.
10. The app can detect feedback, but the current control surface is not an accurate representation of detector behavior.

## Questions Where Reasonable Disagreement Is Allowed

These are judgment calls, not binary bugs:

1. Whether the current heuristic fusion is "good enough" for shipping.
2. Whether room presets should be allowed to change sensitivity.
3. Whether mic calibration should affect detection at all, or only the RTA.
4. Whether `peakMergeCents = 1000` is a valid operator default despite the narrower UI range.
5. Whether the false-positive and false-negative tests represent acceptable known limits or product credibility issues.

## Bottom Line

The detector is real.

The math in several low-level DSP pieces is reasonable.

The biggest product problem is not absence of DSP. It is that the controls and stored settings schema do not truthfully model the system that now exists.

If the goal is to improve trust and practical detection quality, the highest-leverage move is:

1. define a smaller settings contract that matches the current runtime,
2. delete dead and duplicate controls,
3. separate operator controls from debug controls,
4. stop presenting heuristic scores as calibrated probability,
5. validate the remaining live controls against real field captures.
