# Deep Feedback Pipeline Audit - 2026-03-25

## Scope

This report traces the live feedback path from detected peak to advisory card, then resolves the current policy decisions that matter for a rebuild. It uses current source plus local synthetic traces computed against the current code on 2026-03-25.

Primary files:

- `lib/dsp/feedbackDetector.ts`
- `hooks/useDSPWorker.ts`
- `lib/dsp/dspWorker.ts`
- `lib/dsp/workerFft.ts`
- `lib/dsp/algorithmFusion.ts`
- `lib/dsp/classifier.ts`
- `lib/dsp/trackManager.ts`
- `lib/dsp/advisoryManager.ts`
- `tests/dsp/algorithmFusion.test.ts`
- `lib/dsp/__tests__/classifier.test.ts`

## Pipeline Map

### 1. Main-thread detector

- `feedbackDetector.ts:1107-1238` scans bins, applies threshold/prominence/sustain/clear, and tracks MSD plus persistence near threshold.
- `feedbackDetector.ts:1247-1374` emits `DetectedPeak` with:
  - `trueFrequencyHz`
  - `trueAmplitudeDb`
  - `prominenceDb`
  - `harmonicOfHz`
  - `qEstimate`
  - MSD and persistence metadata

### 2. Worker boundary

- `useAudioAnalyzer.ts:257-264` forwards peaks and periodic spectrum snapshots.
- `useDSPWorker.ts:308-349` transfers `processPeak`.
- `useDSPWorker.ts:354-369` transfers `spectrumUpdate` outside peak backpressure.

### 3. Worker orchestration

- `dspWorker.ts:398-544` associates tracks, computes algorithm scores, chooses fusion config, fuses, and feeds fusion back into ML history.
- `dspWorker.ts:547-605` classifies, smooths labels, applies the reporting gate, and clears advisories when reporting fails.
- `dspWorker.ts:608-647` applies harmonic suppression, EQ generation, dedup, and advisory emission.

### 4. Main-thread UI

- `useAudioAnalyzer.ts:224-229` prefers worker-authoritative content type for UI status.
- `useAdvisoryMap` and `IssuesList.tsx` render the resulting cards.
- `SpectrumCanvas` and `GEQBarView` render the same advisory state visually.

## Key Findings

### 1. User-facing mode is not the fusion weight profile selector

Evidence:

- `algorithmFusion.ts:697-707` selects fusion weights from `contentType` and compression state, not from `settings.mode`.
- `dspWorker.ts:518-523` passes mode only as `msdMinFrames` input to fusion config.
- `algorithmFusion.ts:727-732` uses `msdMinFrames` only to decide whether MSD is active in Auto mode.

What this means:

- "Speech", "Worship", "Theater", and "Broadcast" do not get different fusion weight profiles when `contentType === 'speech'` and MSD has warmed up enough.
- The current mode mostly affects:
  - detector thresholds
  - timing
  - report gate behavior
  - MSD warmup eligibility

Local computed comparison against current code:

- Same score vector, same `contentType='speech'`, same `msdFrames=20`:
  - `speech` -> fusion `0.6343`, `FEEDBACK`
  - `worship` -> fusion `0.6343`, `FEEDBACK`
  - `theater` -> fusion `0.6343`, `FEEDBACK`
  - `broadcast` -> fusion `0.6343`, `FEEDBACK`

Same score vector, same `contentType='speech'`, but `msdFrames=10`:

- `speech` / `broadcast` -> `msdMinFrames=7`, MSD stays active, fusion `0.6343`, `FEEDBACK`
- `worship` / `theater` / `liveMusic` / `outdoor` -> `msdMinFrames=12-13`, MSD drops out, fusion `0.5723`, `POSSIBLE_FEEDBACK`

Conclusion:

- The current "mode" system is only partially a pipeline policy. It is mostly a detector/report wrapper around a content-type-driven fusion engine.

### 2. Fusion is a corroboration layer, not the sole detector

Evidence:

- `classifier.ts:754-765` blends base track classification toward fusion using `FUSION_BLEND = 0.6`.
- `classifier.ts:837-840` only uses fusion to override into `ACOUSTIC_FEEDBACK` when `pFeedback >= 0.6` and `fusionResult.verdict === 'FEEDBACK'`.
- `classifier.ts:824-854` still returns label/severity/confidence from the combined base-classifier and fusion path.

What this means:

- Fusion can be below `FEEDBACK` while the final classifier still reports `ACOUSTIC_FEEDBACK`.
- Tuning fusion weights alone cannot explain all user-visible behavior.

Local computed traces against current code:

- `liveMusic` family trace below produced:
  - fusion `0.5108`, verdict `POSSIBLE_FEEDBACK`
  - final classification `ACOUSTIC_FEEDBACK / GROWING`
  - report gate `true`

- `ringOut` family trace below produced:
  - fusion `0.6398`, verdict `POSSIBLE_FEEDBACK`
  - final classification `ACOUSTIC_FEEDBACK / GROWING`
  - report gate `true`

Conclusion:

- The rebuild must treat detector, fusion, classifier, and report gate as separate policy layers.

### 3. Room tuning currently acts on detector/report behavior, not on fusion weights

Evidence:

- `RoomTab.tsx:285-288` writes absolute detector thresholds.
- `classifier.ts:642-649` only applies room-aware prominence filtering when `roomPreset !== 'none'`.
- No room fields are used in `algorithmFusion.ts:697-742`.

What this means:

- Room settings currently affect:
  - main-thread peak admission
  - report gating through prominence floor
- Room settings do not currently retune the fusion engine directly.

Conclusion:

- The controls rebuild should stop presenting room as if it were a general intelligence layer. In current code it is a detector/report modifier plus diagnostics.

### 4. Peak backpressure and `spectrumUpdate` bypass create asymmetric load behavior

Evidence:

- `useDSPWorker.ts:310-315` drops peak batches when the worker is busy.
- `useDSPWorker.ts:354-369` still feeds spectrum snapshots to the worker.
- `workerFft.ts:262-331` updates worker-authoritative content type from those snapshots.

What this means:

- Under load, content type can continue evolving while peak classification work is skipped.
- This is a deliberate performance policy, but it matters for interpretation and tuning.

Conclusion:

- Any rebuilt expert diagnostics must be explicit about load cost.
- The UI should never imply every visual frame received a matching worker classification pass.

### 5. Temporal smoothing is label smoothing only

Evidence:

- `dspWorker.ts:171-227` keeps a 3-frame label ring buffer.
- `dspWorker.ts:551-562` remaps the displayed label/severity after classification.
- `RUNAWAY` and `GROWING` bypass smoothing entirely at `dspWorker.ts:191-193`.

What this means:

- Temporal smoothing does not change fusion weights or track association.
- It is a presentation stability layer on top of already-computed classifications.

Conclusion:

- This belongs in pipeline policy documentation, not as a hidden "sensitivity" effect.

### 6. ML has influence, but not ownership

Evidence:

- `constants.ts:34-43` fixes ML weight at `0.10`.
- `algorithmFusion.ts:857-865` only uses ML when available and active.

Local computed comparison against current code, same score vector:

- With ML score `0.1`: probability shifted from `0.5808` to `0.5307` (`-0.0501`)
- With ML score `0.5`: probability shifted from `0.5808` to `0.5724` (`-0.0084`)
- With ML score `0.9`: probability shifted from `0.5808` to `0.6141` (`+0.0332`)

Conclusion:

- ML matters enough to keep as an expert control.
- ML does not justify being presented as the primary detector mode.

## Worked Family Traces

These are code-executed structural traces, not field recordings. They are useful because they show what the current pipeline will do with concrete numbers and current math.

### Family A: Speech / Broadcast

Representative detector settings from `speech` mode (`constants.ts:426-443`):

- `feedbackThresholdDb=27`
- `ringThresholdDb=5`
- `sustainMs=300`
- `clearMs=400`
- `confidenceThreshold=0.35`
- `prominenceDb=8`
- `fftSize=8192`

Worked trace:

1. Main thread admits a local max once it is above threshold, above `8 dB` prominence, and sustained for `300 ms`.
2. `_registerPeak()` emits a `DetectedPeak` such as `1250 Hz`, `-18 dB`, `16 dB prominence`.
3. Worker scores used for this trace:
   - MSD `0.9`
   - Phase `0.8`
   - Spectral `0.5`
   - Comb `0`
   - IHR `0.2`
   - PTMR `0.6`
4. Current code produced:
   - fusion `0.7035`, confidence `0.6173`, verdict `FEEDBACK`
   - final classification `ACOUSTIC_FEEDBACK`, severity `GROWING`
   - final confidence `0.7794`
   - report gate `true`

Audit read:

- This family remains intentionally aggressive.
- If tonal speech is too feedback-like at the feature level, the pipeline will absolutely surface it.

### Family B: Worship / Theater

Representative detector settings from `worship` mode (`constants.ts:453-470`):

- `feedbackThresholdDb=35`
- `ringThresholdDb=5`
- `sustainMs=280`
- `clearMs=500`
- `confidenceThreshold=0.45`
- `prominenceDb=12`

Worked trace:

1. Same peak is harder to admit on the detector side because threshold and prominence are higher.
2. Once admitted, a reverberant low-mid trace with:
   - MSD `0.4`
   - Phase `0.5`
   - Spectral `0.9`
   - Comb `0`
   - IHR `0.9`
   - PTMR `0.8`
3. Current code produced:
   - fusion `0.6047`, verdict `POSSIBLE_FEEDBACK`
   - final classification `ACOUSTIC_FEEDBACK`, severity `GROWING`
   - final confidence `0.7794`
   - report gate `true`

Audit read:

- This family currently gets its conservatism mostly from the detector threshold, not from a distinct fusion profile.
- Once a peak passes detector admission, the classifier can still drive a strong feedback label.

### Family C: Live Music / Outdoor

Representative detector settings from `liveMusic` mode (`constants.ts:480-497`):

- `feedbackThresholdDb=42`
- `ringThresholdDb=8`
- `sustainMs=350`
- `clearMs=600`
- `confidenceThreshold=0.55`
- `prominenceDb=14`
- `fftSize=4096`

Worked trace:

1. Detector admission is much stricter than Speech.
2. Once a dense-mix trace gets through with:
   - MSD `0.7`
   - Phase `0.25`
   - Spectral `0.7`
   - Comb `0`
   - IHR `0.7`
   - PTMR `0.6`
3. Current code produced:
   - fusion `0.5108`, verdict `POSSIBLE_FEEDBACK`
   - final classification `ACOUSTIC_FEEDBACK`, severity `GROWING`
   - final confidence `0.7700`
   - report gate `true`

Audit read:

- The live-music family is conservative at the front door, not necessarily at the back end.
- That is why controls work needs to separate detector sensitivity from classification policy.

### Family D: Monitors / Ring Out

Representative detector settings from `ringOut` mode (`constants.ts:559-577`):

- `feedbackThresholdDb=27`
- `ringThresholdDb=2`
- `sustainMs=250`
- `clearMs=300`
- `confidenceThreshold=0.30`
- `prominenceDb=8`
- `fftSize=16384`

Worked trace:

1. Detector is configured to catch almost everything useful during setup.
2. For a limiter-clamped case with:
   - MSD `0.1`
   - Phase `0.9`
   - Spectral `0.9`
   - Comb `0`
   - IHR `0.9`
   - PTMR `0.9`
3. Current code produced:
   - fusion `0.6398`, verdict `POSSIBLE_FEEDBACK`
   - final classification `ACOUSTIC_FEEDBACK`, severity `GROWING`
   - final confidence `0.7794`
   - report gate `true`

Audit read:

- Ring-out policy is intentionally detector-heavy, classifier-heavy, and permissive at the report gate.
- That is correct for setup work, but it belongs on a separate setup surface, not inside the same UI affordance as during-show controls.

## Scenario Matrix

| Family | Detector posture | Fusion posture | Report posture | Main risk |
| --- | --- | --- | --- | --- |
| Speech / Broadcast | Low threshold, modest sustain, low confidence gate | Speech weights if content type says speech | Suppresses instruments only | Stable tonal speech can still look feedback-like |
| Worship / Theater | Higher detector threshold and prominence | Still speech-weighted when content type is speech | Suppresses instruments only | Current room/mode story overstates how much worship/theater are actually distinct downstream |
| Live Music / Outdoor | Highest threshold and prominence, slower clear | Music weights only if content type settles to music | Rejects instruments and low-confidence possible rings | Detector is conservative, but classifier can still surface admitted peaks strongly |
| Monitors / Ring Out | Fastest and most permissive setup posture | Default or speech/music depending on content type; no dedicated ring-out fusion profile | Reports almost everything | Correct for setup, too noisy for during-show if exposed in the same control language |

## Pipeline Design Rules For The Rebuild

These rules should be explicit in the next design, not hidden in scattered code:

1. Mode baseline chooses detector policy first.
2. Content type chooses fusion weights second.
3. Environment modifies detector/report behavior, not raw user intent.
4. Fusion and classifier are separate layers and should be surfaced as such in diagnostics.
5. Report gating is its own policy layer and must not be confused with detector sensitivity.
6. During-show controls must target only values with predictable operator meaning.
7. Setup/calibration controls can be broader because the operator is intentionally tuning the system.

## Bottom Line

The current pipeline is not "one detector with one sensitivity knob." It is a stack:

- detector admission
- worker scheduling
- content typing
- fusion
- classification
- report gating
- advisory dedup

Most of the old controls were trying to expose that whole stack directly. The rebuild should not do that again.
