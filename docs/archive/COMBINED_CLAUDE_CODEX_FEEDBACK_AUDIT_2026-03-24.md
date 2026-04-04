# Combined Claude + Codex Feedback Audit

Date: 2026-03-24
Repository: `C:\DoneWellAV\DoneWellAudio`

Sources combined:

- Claude audit: `docs/DoneWell_Audio_Mathematical_Audit_v6.docx`
- Codex audit: `docs/FEEDBACK_DETECTION_DEEP_AUDIT_2026-03-24.md`

## Why This Combined Audit Exists

The two audits are not actually looking at exactly the same layer.

- Claude v6 focuses mostly on mathematical correctness of the signal-processing pipeline and concludes that the detector is real, the formulas are mostly correct, and the system is broadly production-ready.
- The Codex audit agrees that much of the low-level math is sound, but focuses on runtime contract problems: dead controls, incomplete settings wiring, misleading calibration behavior, and UI semantics that no longer match the detector.

The right combined answer is not "one is right and one is wrong."
The right combined answer is:

- Claude is mostly right about the core DSP math.
- Codex is mostly right about the product-level contract problems.
- The app can detect feedback, but the current controls and settings model are not yet clean enough to justify an unqualified "production-ready" verdict.

## Combined Executive Summary

### Final merged verdict

DoneWell Audio can detect acoustic feedback.

The low-level DSP stack is real and several key formulas are mathematically appropriate for this application. The main FFT, prominence, PHPR, Q estimation, MSD, phase coherence, and much of the room-physics layer are directionally sound.

However, the current app still has material product-layer problems:

- some controls are dead,
- some settings are only partly wired,
- some controls are semantically misleading,
- mic calibration is not reliably represented in live runtime behavior,
- and the probability/confidence language is stronger than the underlying calibration justifies.

So the merged answer is:

- Math quality: mostly good.
- Architecture: real and substantial.
- Controls/settings contract: not clean.
- Calibration story: overstated.
- Can it detect feedback: yes.
- Is it cleanly production-ready as an operator-facing detector: not yet without caveats.

## Where Both Audits Agree

### 1. The app is a real detector

Both audits agree that the app is not fake plumbing.

The pipeline is real:

1. Main thread captures mic input and runs `FeedbackDetector`.
2. Main thread detects peaks and computes some DSP features.
3. Worker computes algorithm scores, fusion, classification, and advisories.
4. UI renders advisories and spectrum.

Relevant code:

- `lib/dsp/feedbackDetector.ts`
- `hooks/useDSPWorker.ts`
- `lib/dsp/dspWorker.ts`

### 2. Several core DSP primitives are mathematically sound

Claude is right to rate the following pieces strongly:

- dB-to-linear conversion via LUT and prefix sums
- prominence calculation
- PHPR in the linear domain
- Q estimation from -3 dB bandwidth
- MSD as second-difference energy
- phase coherence as mean phasor magnitude

Relevant code:

- `lib/dsp/feedbackDetector.ts:1149-1183`
- `lib/dsp/feedbackDetector.ts:1463-1580`
- `lib/dsp/msdAnalysis.ts:129-147`
- `lib/dsp/phaseCoherence.ts:60-115`

Combined conclusion:

- These are not the weak point of the app.

### 3. The app can detect feedback

Both audits ultimately answer yes.

Combined conclusion:

- "Can it detect feedback?" Yes.
- "Can it do so cleanly enough that every exposed control is trustworthy?" No.

### 4. The ML model is architecturally reasonable but still bootstrap quality

Claude v6 is right that the ML path is structurally sound and degrades gracefully.
Codex agrees, but that does not rescue the current control-surface issues.

Relevant code:

- `lib/dsp/algorithmFusion.ts:850-858`
- `lib/dsp/dspWorker.ts:497-549`

### 5. Worker backpressure is real

Claude notes it. Codex treats it as a meaningful recall risk.

Relevant code:

- `hooks/useDSPWorker.ts:278-283`
- `hooks/useDSPWorker.ts:313-317`

Combined conclusion:

- This is not just a performance footnote. It changes detector behavior under load.

## Where Claude Is Too Optimistic

### 1. "The math is correct" is too broad as a product claim

Claude v6 is directionally right for low-level DSP math, but too broad for the full operator-facing system.

Why:

- The decision layer is heuristic, not calibrated probability.
- The control surface does not cleanly map to the runtime detector.
- Some controls are dead or legacy.

So:

- "Several formulas are correct" is true.
- "The app’s exposed detection model is clean and correct" is not yet true.

### 2. "No fundamental math bugs remain" misses runtime contract bugs

This is the biggest difference between the two audits.

Codex did not find a new PHPR-style low-level formula bug.
Codex did find several product-critical control/wiring bugs that materially affect how the detector is understood and operated.

Examples:

- `micCalibrationProfile` not properly mapped in live detector update path:
  `lib/dsp/feedbackDetector.ts:425-548`
- `relativeThresholdDb` exposed but treated as legacy in update path:
  `lib/dsp/feedbackDetector.ts:521-528`
- `noiseFloorDecay` exposed but unused:
  `lib/dsp/feedbackDetector.ts:1605-1610`
- `harmonicFilterEnabled` exposed but effectively ignored:
  `lib/dsp/advisoryManager.ts:48-65`
  `lib/dsp/dspWorker.ts:562-563`

Combined conclusion:

- No obvious new low-level formula bug was found.
- But there are still material product-level correctness problems.

### 3. Mic calibration is not "helpful overall" in the current implementation

Claude v6 section 9 says mic calibration is broadly helpful, with a MEMS/hum caveat.

That is too optimistic for the code as it exists now.

Code-backed problems:

- The calibration selector writes `micCalibrationProfile` from UI:
  `components/analyzer/settings/CalibrationTab.tsx:311-317`
- The detector update path does not map that field:
  `lib/dsp/feedbackDetector.ts:425-548`
- The analysis path still reads `config.micCalibrationProfile`:
  `lib/dsp/feedbackDetector.ts:1134-1167`
- Mobile auto-applies `smartphone`:
  `components/analyzer/AudioAnalyzer.tsx:329-331`
- Session/export code records calibration as if it were active:
  `lib/calibration/calibrationSession.ts:169-210`

Combined conclusion:

- In theory:
  measurement-mic compensation can be modestly helpful.
- In this codebase now:
  mic calibration is partly miswired and therefore more misleading than helpful.
- Generic smartphone compensation is especially risky as a detector-facing control.

### 4. "Bayesian classifier" overstates what the classifier is

Claude v6 describes the classifier as Bayesian.

That is only partially fair.

The code does use priors, but the runtime behavior is a heuristic scoring system:

- fixed hand-set priors:
  `lib/dsp/classifier.ts:32-40`
- many additive boosts and penalties:
  `lib/dsp/classifier.ts:257-492`
- renormalization:
  `lib/dsp/classifier.ts:487-492`
- confidence derived from max values and fusion confidence:
  `lib/dsp/classifier.ts:813-818`

Combined conclusion:

- "Bayesian-flavored heuristic classifier" is accurate.
- "Calibrated Bayesian posterior" is not.

### 5. Room physics is good, but less adaptive than Claude implies

Claude v6 is right that several room formulas are textbook-inspired and useful.

But the implementation is less room-adaptive than the comments suggest:

- low/mid split uses `Math.max(schroederHz, 300)`:
  `lib/dsp/acousticUtils.ts:69-70`

So the system is not purely following the room-derived Schroeder boundary in practice.

Combined conclusion:

- Room physics formulas are broadly sound.
- The implementation includes clamps and heuristics that reduce how physically faithful the adaptation really is.

### 6. "Production-ready" is too strong

Claude v6 ends with "Production-ready."

That is the point of strongest disagreement.

Reasons:

- dead controls remain visible,
- threshold semantics are inconsistent,
- room presets silently change sensitivity,
- calibration behavior is misleading,
- custom algorithm mode does not truthfully expose ML behavior,
- frame dropping under load reduces recall,
- tests still document meaningful false positives and false negatives.

Combined conclusion:

- Core DSP: close to production-capable.
- Operator-facing settings/control model: not production-clean.
- Final verdict should be "usable with caveats," not "production-ready" without qualification.

## Codex Findings Claude Did Not Cover Well Enough

### 1. Threshold model drift

The hero sensitivity slider writes `feedbackThresholdDb`, which the detector maps to `relativeThresholdDb`:

- `components/analyzer/settings/SoundTab.tsx:101-108`
- `lib/dsp/feedbackDetector.ts:437-438`

But the separate advanced "Relative Threshold" control is explicitly treated as legacy:

- `lib/dsp/feedbackDetector.ts:521-528`

And `absolute` mode still uses hidden fixed `thresholdDb = -80`:

- `types/advisory.ts:388-390`
- `lib/dsp/feedbackDetector.ts:1613-1627`

Combined conclusion:

- Formula layer is okay.
- Operator semantics are not okay.

### 2. Dead controls

The following controls are not trustworthy in their current form:

- `noiseFloorDecay`
- `harmonicFilterEnabled`
- `musicAware`
- `autoMusicAware`
- `relativeThresholdDb` as an independent operator control

These are not small polish issues. They are contract drift.

### 3. Room presets are mixed presets, not pure room-model controls

Room preset selection changes both room-physics inputs and sensitivity thresholds:

- `components/analyzer/settings/RoomTab.tsx:284-289`

Combined conclusion:

- If kept, this needs explicit labeling.
- Otherwise users will think they are changing only room physics.

### 4. Custom algorithm mode does not expose the full runtime model

Fusion supports ML in custom mode:

- `lib/dsp/algorithmFusion.ts:711-733`

But the default list and UI omit ML:

- `lib/dsp/constants.ts:705-706`
- `components/analyzer/settings/SoundTab.tsx:301-323`

Combined conclusion:

- Current custom-mode UX is incomplete and misleading.

### 5. Calibration mode is not live detector calibration

Session code records data, but does not tune the detector live:

- `hooks/useCalibrationSession.ts:63-95`
- `lib/calibration/calibrationSession.ts:160-210`

Combined conclusion:

- This is a logging and export tool, not a closed-loop calibration system.

## The Merged Answer To The Original Questions

### Is the math accurate and right for this application?

Mostly yes at the low-level DSP primitive level.

The strongest parts are:

- FFT/power handling
- prominence
- PHPR
- Q estimation
- MSD
- phase coherence

The weakest part is not "math is wrong."
The weakest part is that the decision layer is heuristic and the UI still presents parts of the system as if they were cleaner and more calibrated than they really are.

### Are the mic calibrations helpful, harmful, or wasting space?

Merged answer:

- Specific measurement-mic compensation can be somewhat helpful in principle.
- Generic smartphone compensation is risky.
- In the current codebase, mic calibration is partly miswired and therefore more misleading than helpful.
- As currently shipped, it is closer to "wasting space and creating false confidence" than to being a solid detector improvement.

### Is the app able to detect feedback?

Yes.

But the honest full answer is:

- yes, it can detect feedback,
- no, the current control surface is not yet a clean or fully trustworthy representation of the detection system,
- and no, the documented false-positive/false-negative cases are not trivial enough to ignore.

## Combined Final Verdict

If the goal is a fair single-line answer:

DoneWell Audio has a real and mostly mathematically sound feedback-detection engine, but its current settings and control surface still contain enough dead wiring, misleading semantics, and calibration ambiguity that it should be described as capable but not yet cleanly production-ready.

If the goal is a practical shipping answer:

- Claude is right that the DSP foundation is stronger than a casual reading suggests.
- Codex is right that the app still has material control-contract problems that reduce trust and should be fixed before claiming the detector is fully dialed in.

## Recommended Shared Conclusion For Both Models

This is the statement both audits can reasonably converge on:

1. The app can detect feedback and the core DSP is real.
2. Most low-level formulas are appropriate for the application.
3. The probability/confidence layer is heuristic, not statistically calibrated.
4. Mic calibration should not currently be treated as a strong detector feature.
5. The biggest remaining problems are not foundational DSP math but settings-model drift, dead controls, incomplete wiring, and operator-facing clarity.
6. The fastest path to a more trustworthy app is to rebuild the controls around the actual current runtime model.
