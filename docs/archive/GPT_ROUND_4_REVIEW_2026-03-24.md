# GPT Round 4 Review

**Date:** 2026-03-24  
**Repository:** `C:\DoneWellAV\DoneWellAudio`  
**Target:** `docs/MASTER_COMBINED_AUDIT_ROUND_3_2026-03-24.md` under `docs/REPAIR_GUIDE.md` protocol  
**Author:** GPT-5.4 / Codex

---

## Protocol

This review follows `REPAIR_GUIDE.md`:

- every claim cites code
- no prompt execution
- explicit accept/challenge
- new code paths reopen previously settled claims when warranted

I re-checked the Round 3 claims against the current source tree, with emphasis on the five questions Claude left for GPT Round 4.

Primary files re-verified:

- `components/analyzer/AudioAnalyzer.tsx`
- `components/analyzer/help/AlgorithmsTab.tsx`
- `components/analyzer/help/GuideTab.tsx`
- `components/analyzer/settings/SettingsPanel.tsx`
- `components/analyzer/settings/SoundTab.tsx`
- `components/analyzer/UnifiedControls.tsx`
- `contexts/AudioAnalyzerContext.tsx`
- `hooks/useAudioAnalyzer.ts`
- `lib/dsp/algorithmFusion.ts`
- `lib/dsp/classifier.ts`
- `lib/dsp/constants.ts`
- `lib/dsp/dspWorker.ts`
- `lib/dsp/__tests__/classifier.test.ts`

---

## 1. Answer To Round 3 Question 1

### Does `musicAware` have any downstream consumer we both missed?

**Answer:** no downstream detection consumer found in the live pipeline.

### Runtime evidence

UI and preset plumbing still exist:

- `SoundTab.tsx:170-193`
- `UnifiedControls.tsx:465-481`
- `AudioAnalyzer.tsx:155-171`
- `AudioAnalyzerContext.tsx:104-126`
- `constants.ts:436-467`, `496-526`, `555-684`

But the detection pipeline does not consume `musicAware`:

- main thread content detection uses `detectContentType(...)` at `feedbackDetector.ts:994`
- worker fallback content detection uses `detectContentType(...)` at `workerFft.ts:326`
- worker fusion chooses content type from `msg.contentType ?? algorithmResult.contentType` at `dspWorker.ts:471-473`
- fusion mode selection uses `contentType`, not `musicAware`, in `algorithmFusion.ts`

### Conclusion

I agree with Round 3's core claim:

- `musicAware`
- `autoMusicAware`
- `autoMusicAwareHysteresisDb`
- the `AudioAnalyzer.tsx:155-171` effect

form a dead feature branch with respect to detection behavior.

### Important nuance

There is still user-facing residue outside the runtime pipeline:

- `GuideTab.tsx:107` tells users to switch to "Music-Aware mode"

So the feature branch is dead in detection, but not fully scrubbed from help/docs.

---

## 2. Answer To Round 3 Question 2

### Is Prompt S2 safe?

**Answer:** mostly yes for runtime behavior, but the prompt needs migration and docs caveats.

### What I verified

I found no tests asserting behavioral semantics for the dead controls themselves.

For `musicAware` / `autoMusicAware` / `autoMusicAwareHysteresisDb`:

- only runtime references are UI render/state and the dead effect at `AudioAnalyzer.tsx:155-171`
- no worker/detector/fusion/classifier consumer found
- no behavior tests found outside test mocks

For `holdTimeMs`:

- UI slider in `SoundTab.tsx:262-265`
- UI slider in `UnifiedControls.tsx:592-594`
- preset pass-through in `AudioAnalyzerContext.tsx:119`
- detector comment at `feedbackDetector.ts:440-443`
- no actual runtime consumer found in `AudioAnalyzer.tsx`, `hooks/`, `lib/`, or `contexts/`

For `quickControlsMode`:

- default only at `constants.ts:737`
- no runtime consumer found

### The real removal risks

The removal risk is not detection behavior. The removal risk is schema and storage cleanup.

Places that must be updated if S2 lands:

- preset key whitelists:
  - `SettingsPanel.tsx:38-44`
  - `UnifiedControls.tsx:56-62`
- mode preset application:
  - `AudioAnalyzerContext.tsx:104-126`
- stored defaults/custom preset loaders:
  - `SettingsPanel.tsx:107-129`
  - `UnifiedControls.tsx:182-205`

### Test impact

The dead fields appear in test fixtures and mocks:

- `advisoryManager.test.ts:120-127`
- `advisoryManager.test.ts:167`

But I did not find tests asserting real behavior for these fields.

### S2 review

I support S2 with one amendment:

> S2 should explicitly include preset/storage migration and help/docs cleanup, not just type/UI removal.

At minimum, S2 should remove or update:

- `PRESET_KEYS` arrays
- mode preset application in `AudioAnalyzerContext.tsx`
- stale saved-default compatibility loaders
- help text that still refers to Music-Aware mode

---

## 3. Answer To Round 3 Question 3

### Is `peakMergeCents = 100` the right default?

**Answer:** I agree the current `1000` default is wrong for the shipped UI contract, but I would keep the exact replacement value `[OPEN]`.

### Code evidence

Current mismatch:

- default `1000` at `constants.ts:679`
- UI max `150` at `SoundTab.tsx:343-345`

There is one code clue supporting `100` as a candidate:

- the comment at `constants.ts:679` says track association stays at `100` cents for granular detection

That makes `100` a defensible starting point because it aligns merge behavior more closely with the existing association scale.

### Why I would not lock `100` yet

The bug is code-backed:

> default is outside the UI range

The exact best replacement value is not code-backed. It is tuning.

So my position is:

- `[LOCKED]` the default must be moved inside the UI range
- `[OPEN]` whether the new default should be `100`, `150`, or another reachable value

### Recommendation

If Claude wants a concrete default for implementation, `100` is a reasonable hypothesis.

But I would phrase S3 as:

> fix the default/UI mismatch, with `100` as the preferred candidate pending field validation

not as:

> `100` is now proven correct

---

## 4. Answer To Round 3 Question 4

### Any additional dead controls?

**Answer:** no additional runtime-dead controls found beyond the current 8-item inventory.

The 8-item dead inventory still looks complete for operator-facing settings.

### What I did find beyond that

I found additional **documentation/help drift**, which is separate from dead controls:

#### A. Outdated algorithm help math

`AlgorithmsTab.tsx:323-331` says:

- `confidence = agreement * P_feedback + (1 - agreement) * 0.5`
- `FEEDBACK: P >= 0.65`
- `POSSIBLE: P >= 0.46`

Current runtime says:

- `algorithmFusion.ts:893-896`
  - `confidence = feedbackProbability * (0.5 + 0.5 * agreement) + persistenceBonus`
- `algorithmFusion.ts:899-903`
  - `FEEDBACK` threshold uses `config.feedbackThreshold` and `0.6`
  - `POSSIBLE_FEEDBACK` uses `config.feedbackThreshold * 0.7` and `0.4`

So the help tab is stale.

#### B. Outdated troubleshooting guidance

`GuideTab.tsx:107` recommends switching to "Music-Aware mode", but that feature branch is dead with respect to detection behavior.

### Conclusion

No new dead controls, but there are new user-facing docs/help mismatches that should be cleaned up alongside S2 and S6.

---

## 5. Answer To Round 3 Question 5

### Should the post-normalization severity override be flagged as a product issue?

**Answer:** the override itself is acceptable; the real issue is that the live wrapper path and the base classifier now disagree on posterior semantics.

### Why the override itself is fine

The safety-biased override is intentional and defensible:

- `classifyTrack()` boosts `pFeedback` for `RUNAWAY` / `GROWING` at `classifier.ts:528-536`
- `classifyTrackWithAlgorithms()` re-applies post-fusion overrides at `classifier.ts:806-811`

For a live feedback detector, privileging obvious runaway cases is reasonable.

### The actual problem I found

There is a new, code-backed inconsistency between the base classifier and the live runtime wrapper.

#### Base classifier path

`classifyTrack()`:

- renormalizes after severity overrides if needed at `classifier.ts:559-567`
- computes `pUnknown` as residual mass at `classifier.ts:568`

That matches the F5 tests:

- `classifier.test.ts:300-305`
- `classifier.test.ts:569-573`

#### Live runtime wrapper path

`classifyTrackWithAlgorithms()`:

- re-applies severity overrides after normalization at `classifier.ts:806-811`
- computes `pUnknown = 1 - confidence` at `classifier.ts:818`

And the live worker uses this wrapper:

- `dspWorker.ts:501-503`

### Why this matters

The app's live path can return a classification object where:

- class scores do not necessarily sum with `pUnknown` to a consistent posterior
- `pUnknown` does not describe residual probability mass
- existing tests do not catch it, because they only lock F5 semantics on `classifyTrack()`, not on `classifyTrackWithAlgorithms()`

### Conclusion

My answer is:

- keep the override design
- do **not** call the override itself a product bug
- do flag the wrapped-path posterior inconsistency as a new engineering issue

I added this to the repair guide as **B8: Runtime Classifier Posterior Divergence**.

---

## 6. New Round 4 Findings

### 6.1 `[OPEN]` Runtime wrapper posterior divergence

This is the most important new finding in this round.

Evidence:

- base path consistency: `classifier.ts:559-568`
- wrapper path inconsistency: `classifier.ts:806-818`
- live usage: `dspWorker.ts:501-503`
- tests only cover base path:
  - `classifier.test.ts:300-305`
  - `classifier.test.ts:569-573`

This is now tracked in `REPAIR_GUIDE.md` as **B8** with prompt **S9**.

### 6.2 `[OPEN]` Help/docs formula drift

User-facing help is behind the runtime:

- `AlgorithmsTab.tsx:323-331` shows stale confidence formula and stale thresholds
- `GuideTab.tsx:107` recommends a dead "Music-Aware mode"

This is not a detector-math bug, but it is operator trust debt.

---

## 7. Net Position After Round 4 Review

### Accepted

- Round 3's 8-item dead control inventory is complete for runtime controls.
- The `musicAware` branch is dead in the detection pipeline.
- S2 is directionally safe.
- No new runtime consumer of `musicAware` was found.

### Challenged / tightened

- S2 needs storage/preset/help cleanup called out explicitly.
- S3 should not lock the exact replacement value `100` yet.
- The classifier section is not fully settled: the live wrapper path still diverges from the base classifier's posterior contract.

### Strongest current shared statement

The detector is real, the low-level math is broadly sound, the control surface still has substantial dead/misleading pieces, and there is one newly surfaced runtime inconsistency in the wrapped classifier path that should be fixed before calling the classifier semantics fully settled.

---

## 8. Files Updated This Round

- `docs/REPAIR_GUIDE.md`
  - added `B8`
  - added `S9`

