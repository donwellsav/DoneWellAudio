# Master Combined Feedback Detector Audit — Round 1

**Date:** 2026-03-24
**Repository:** `C:\DoneWellAV\DoneWellAudio`
**Authors:** Claude Opus 4.6 (primary) + Codex/GPT-5.4 (adversarial review)
**Purpose:** Converged audit of the feedback detection pipeline after adversarial cross-review. This document accepts GPT's verified corrections, preserves Claude's verified findings, and marks disputed or unresolved items explicitly.
**Status:** Round 1 — intended for GPT counter-review

---

## Methodology

Both models independently audited the codebase, then cross-reviewed each other's work. This document is the product of that adversarial loop. Every claim carries a provenance tag:

| Tag | Meaning |
|-----|---------|
| `[VERIFIED]` | Both models agree, confirmed against source code with line numbers |
| `[CORRECTED]` | One model's earlier claim was wrong; correction verified against code |
| `[CLAUDE-ONLY]` | Claude asserts, GPT has not confirmed or disputed |
| `[GPT-ONLY]` | GPT asserts, Claude has not confirmed or disputed |
| `[DISPUTED]` | Models disagree; evidence presented for both sides |
| `[ESTIMATE]` | Analytical projection, not measured from runtime data |

---

## 1. Top-Level Verdict

### `[VERIFIED]` The app can detect feedback

The pipeline is real and functions end-to-end:

1. Main thread: `getUserMedia` → `GainNode` → `AnalyserNode` (8192-point FFT at 50fps)
2. `FeedbackDetector.analyze()` extracts peaks with prominence, Q, PHPR, persistence
3. Worker receives peaks via `postMessage` with transferable Float32Arrays (zero-copy)
4. `AlgorithmEngine.computeScores()` → `fuseAlgorithmResults()` → `classifyTrackWithAlgorithms()` → `shouldReportIssue()` → `generateEQAdvisory()`
5. Advisories returned to main thread → React renders advisory cards + canvas spectrum

**Code path:** `hooks/useAudioAnalyzer.ts` → `lib/audio/createAudioAnalyzer.ts` → `lib/dsp/feedbackDetector.ts:949-965` → `hooks/useDSPWorker.ts:276-317` → `lib/dsp/dspWorker.ts:460-500` → `lib/dsp/algorithmFusion.ts:688-800` → `lib/dsp/classifier.ts:724-850`

### `[VERIFIED]` The core DSP math is strong but the system is not unqualifiedly production-ready

Both models agree: the low-level signal processing (FFT, peak detection, prominence, Q estimation, MSD, phase coherence, fusion) is real and mostly sound for the application. Both models also agree the control surface has enough dead wiring, hidden coupling, and semantic drift that "production-ready" is too strong without caveats.

**Corrected wording (converged):**
> The core DSP math is strong enough for real use. The detector is real, not a toy. But the operator-facing settings and control surface still need cleanup before the system should be described as fully production-ready without caveats.

---

## 2. Converged Agreements (Both Models)

These findings are agreed by both Claude and GPT and verified against source code.

### 2.1 `[VERIFIED]` Low-level DSP formulas are correct for the application

| Formula | Status | Evidence |
|---------|--------|----------|
| Power spectrum via prefix sum | Correct | `feedbackDetector.ts:1149-1183` — `power_i = EXP_LUT[idx]`, prefix sum for O(1) neighborhood averaging |
| Prominence | Correct | `feedbackDetector.ts:1247-1265` — `peakDb - 10*log10(mean neighborhood power)` with ±2 exclusion |
| PHPR (post-fix) | Correct | `feedbackDetector.ts:1539-1569` — Now averages in linear power domain (F1 fix shipped v0.11.0) |
| Q estimation | Correct | `feedbackDetector.ts:1463-1526` — `Q = f_center / BW_3dB` from interpolated threshold crossings |
| MSD | Correct | `feedbackDetector.ts:1653-1688` + `msdPool.ts:129-173` — Second-difference `mean((x_n - 2x_{n-1} + x_{n-2})^2)` over dB history. Sparse pooled allocation (256 slots × 64 frames = 64KB) |
| Phase coherence | Correct | `phaseCoherence.ts:65-116` — `|mean(exp(j*deltaPhase))|` circular mean phasor magnitude per Fisher 1993 |
| Persistence | Correct | `feedbackDetector.ts:1770-1830` — Consecutive-frame amplitude stability within ±6 dB tolerance, NOT elapsed time |
| Auto-gain | Correct | `feedbackDetector.ts:1068-1081` — EMA with attack/release coefficients, locks after calibration window |
| Schroeder frequency | Correct | `acousticUtils.ts:38-56` — `f_s = 2000 * sqrt(T60 / V)` per Schroeder 1996 |
| Q_room from RT60 | Correct | `acousticUtils.ts:289` — `Q_room = pi * f * T60 / 6.9` where 6.9 = ln(10^6)/2 |
| Modal overlap | Correct | `acousticUtils.ts:118-121` — `M = 1/Q_measured` (NOT 1/Q_room) |

### 2.2 `[VERIFIED]` The classifier is heuristic, not a calibrated posterior

The classifier uses:
- Fixed priors: `pFeedback=0.15, pWhistle=0.10, pInstrument=0.10` at `classifier.ts:32-40`
- Additive boosts/penalties from 11 features
- Normalization to sum-to-1
- Confidence derived from `max(fusionConfidence, baseConfidence, maxProb)` at `classifier.ts:815-817`

This produces useful ranking scores, not statistically calibrated probabilities. Both models agree the product should describe these as "confidence scores" rather than "Bayesian probabilities."

**Specific post-normalization issue:** `[VERIFIED]` Severity overrides at `classifier.ts:807-811` can push pFeedback to 0.85 AFTER normalization, breaking the sum-to-1 invariant. This is intentional (RUNAWAY/GROWING are safety overrides) but means downstream consumers should not assume a valid distribution.

### 2.3 `[VERIFIED]` Dead controls exist

| Control | Default | Runtime effect | Evidence |
|---------|---------|---------------|----------|
| `musicAware` | `false` | Never read by any runtime code path | `constants.ts:682` |
| `noiseFloorDecay` | `0.98` | Never consumed by `updateSettings()` or any DSP function | `constants.ts:678` |
| `harmonicFilterEnabled` | `true` | Never consumed by detector, fusion, or classifier | `constants.ts:712` |

These are operator trust debt. Users seeing toggles that do nothing erodes confidence in controls that do matter.

### 2.4 `[VERIFIED]` Room presets change sensitivity silently

`RoomTab.tsx:284-297` shows that selecting a room preset writes both room-model settings AND sensitivity thresholds (`feedbackThresholdDb`, `ringThresholdDb`). This is not a bug per se, but it means changing "room type" also changes detection sensitivity without explicit UI feedback.

### 2.5 `[VERIFIED]` `peakMergeCents` default is unreachable by UI

- Default: `1000` cents at `constants.ts:679`
- UI slider range: `10..150` at `SoundTab.tsx:343-345`
- First touch of the slider jumps from 1000 to max 150 — a 6.5:1 behavior change

### 2.6 `[VERIFIED]` Worker backpressure drops frames

`useDSPWorker.ts:280-283` — Binary busy/not-busy gate. If worker is still processing, next peak is DROPPED (not queued). This is correct for real-time feedback detection (freshness > completeness) but inappropriate for future passive scan modes.

### 2.7 `[VERIFIED]` Early warning system is clean

`earlyWarning.ts` (57 lines) — Pure function design with:
- dP/dt via EMA smoothing (alpha=0.35)
- BUILDING: smoothed >= 0.05 AND probability >= 0.3
- GROWING: smoothed >= 0.15 AND probability >= 0.5
- 3-frame hysteresis clear prevents flicker
- Metadata-only — does NOT create advisories or affect `shouldReportIssue()`

### 2.8 `[VERIFIED]` Fusion weight profiles sum to 1.0 and are content-appropriate

All four profiles (DEFAULT, SPEECH, MUSIC, COMPRESSED) at `algorithmFusion.ts:372-400` sum to exactly 1.00. Compression detection takes priority over content type (correct — compression artifacts affect all algorithms). ML has flat 0.10 weight across all profiles.

### 2.9 `[VERIFIED]` F2 fix (fusion confidence consistency) is correctly implemented

After the F2 fix, `effectiveScores` at `algorithmFusion.ts:745-770` collects transformed scores (including low-frequency phase suppression at 0.5×) and uses the same vector for both `feedbackProbability` and confidence/agreement computation. The pre-fix divergence where confidence used raw scores while probability used gated scores is resolved.

### 2.10 `[VERIFIED]` F4 fix (double-counting) is correctly implemented

`classifier.ts:748-755` — `classifyTrackWithAlgorithms()` blends base classification (40%) with fusion result (60%) via `FUSION_BLEND = 0.6`. Comment at line 748-751 explicitly states per-algorithm scores are NOT re-added. Fusion owns the algorithm posterior; classifier adds only track-level and acoustic context.

---

## 3. Corrections Accepted From GPT

These are points where Claude's earlier audit was wrong and GPT's correction is verified against source code.

### 3.1 `[CORRECTED]` Mic calibration live wiring is incomplete

**Claude's earlier claim:** "Mic calibration IS wired, IS updated on settings change, and IS applied at 50fps in the hot path."

**GPT's correction:** The detector HAS mic calibration math and CAN apply it, but the normal live settings update path does not forward `micCalibrationProfile`.

**Verification:**

`updateConfig()` at `feedbackDetector.ts:407-413` DOES handle `micCalibrationProfile`:
```
if (config.micCalibrationProfile !== undefined) {
  this.computeMicCalibrationTable()
}
```

`_buildPowerSpectrum()` at `feedbackDetector.ts:1166` DOES apply it at 50fps:
```
db += micCalTable[i]
```

BUT `updateSettings()` at `feedbackDetector.ts:425-549` maps 20+ fields from `DetectorSettings` to `AnalysisConfig` and **never maps `micCalibrationProfile`**. I checked every line from 425 to 549. The field is simply absent from the mapping function.

This means:
- `updateConfig({ micCalibrationProfile: 'ecm8000' })` works ✅
- The normal UI → `useAudioAnalyzer` → `updateSettings()` path does NOT forward this field ❌

**Corrected statement:**
> Mic calibration math exists in the detector and is applied in the hot path when `AnalysisConfig.micCalibrationProfile` is set. However, `FeedbackDetector.updateSettings()` does not currently map `DetectorSettings.micCalibrationProfile` into the `AnalysisConfig`, so the live UI/settings wiring is incomplete. The calibration table computation (`computeMicCalibrationTable` at line 778) and hot-path application (`_buildPowerSpectrum` at line 1166) are both correct — the gap is solely in the settings bridge.

**Impact:** When a user changes mic calibration profile in the UI during a live session, the change may not propagate to the detector. This is a real product bug, not just a documentation issue.

**Fix:** Add `if (settings.micCalibrationProfile !== undefined) { mappedConfig.micCalibrationProfile = settings.micCalibrationProfile }` to `updateSettings()`.

### 3.2 `[CORRECTED]` Custom-mode ML is excluded from operator-facing path

**Claude's earlier claim:** "Default enabledAlgorithms includes 'ml'. ML is NOT silently dropped in custom mode."

**GPT's correction:** The fusion layer supports ML in custom mode as a fallback, but the shipped defaults and UI omit it.

**Verification:**

Fusion fallback at `algorithmFusion.ts:733`:
```
activeAlgorithms = config.enabledAlgorithms ?? ['msd', 'phase', 'spectral', 'comb', 'ihr', 'ptmr', 'ml']
```
→ ML IS in the fallback array ✅

But shipped default at `constants.ts:706`:
```
enabledAlgorithms: ['msd', 'phase', 'spectral', 'comb', 'ihr', 'ptmr']
```
→ ML is NOT in the stored default ❌

And the UI at `SoundTab.tsx:302`:
```
[['msd', 'MSD'], ['phase', 'Phase'], ['spectral', 'Spectral'], ['comb', 'Comb'], ['ihr', 'IHR'], ['ptmr', 'PTMR']]
```
→ Only 6 buttons, no ML toggle ❌

**Corrected statement:**
> The fusion layer supports ML in custom mode as a runtime fallback capability (triggered only when `enabledAlgorithms` is undefined/null). But the shipped default `enabledAlgorithms` array at `constants.ts:706` excludes `ml`, and the custom-mode UI at `SoundTab.tsx:302` renders only six algorithm toggles. From the operator-facing path, ML is omitted by default in custom mode.

**Nuance:** In `auto` mode, ML IS always included (`algorithmFusion.ts:727-729`). This correction only applies to `custom` mode.

### 3.3 `[CORRECTED]` Default analysis range is 150-10000 Hz, not 60-16000 Hz

**Claude's earlier claim:** "Analysis range defaults: 60-16000 Hz"

**GPT's correction:** The actual defaults are 150-10000 Hz.

**Verification:**

`DEFAULT_SETTINGS` at `constants.ts:672-673`:
```
minFrequency: 150,    // Extended for body mic chest resonance
maxFrequency: 10000,  // Condenser sibilance feedback upper bound
```

`DEFAULT_CONFIG` at `types/advisory.ts:383-384`:
```
minHz: 150,
maxHz: 10000,
```

**Corrected statement:**
> Default analysis range is `150-10000 Hz`. The `60-16000 Hz` range is closer to the `ringOut` mode profile, not the base application default. The lower bound of 150 Hz was chosen because speech fundamentals start around 170 Hz (Everest reference) and body mic chest resonance extends below that.

---

## 4. Remaining Architecture Issues

### 4.1 `[VERIFIED]` Content-type divergence between main thread and worker (F3)

Main thread at `feedbackDetector.ts:993-1002`:
- Computes temporal envelope metrics
- Calls `detectContentType(freqDb, crestFactor, temporalMetrics)` with 40% temporal weight
- Smooths via 10-sample majority vote history

Worker at `workerFft.ts:349-351`:
- Calls `detectContentType(spectrum, crestFactor)` with NO temporal metrics and NO smoothing

`dspWorker.ts:473` prefers main thread's smoothed result (`msg.contentType`) when available, falling back to worker's instantaneous classification. This means the divergence is partially mitigated but not eliminated — the worker CAN fall back to its own classification.

**Impact:** Fusion weight selection, ML one-hot inputs, and UI state can disagree on the same frame sequence during fallback conditions.

### 4.2 `[VERIFIED]` Persistence semantic split (F6)

Two different quantities called "persistence":
- **Detector persistence** at `feedbackDetector.ts:1770-1830`: Consecutive amplitude-stable frames (±6 dB tolerance). Resets on fluctuation.
- **Track persistence** at `trackManager.ts:367`: `persistenceMs = lastUpdateTime - onsetTime`. Wall-clock age. Never resets.

`existingScore` at `algorithmFusion.ts:484` is initialized to 0.5 but never consumed by fusion (dead plumbing).

### 4.3 `[VERIFIED]` Room-physics evidence stacking (F9)

In `classifyTrack()`, a single low-frequency peak in a configured room can accumulate:
- `modalAnalysis.feedbackProbabilityBoost` (±0.15 at `classifier.ts:348`)
- `rt60Adj.delta` (±0.12 at `classifier.ts:334`)
- `nfAdj.delta` at `classifier.ts:366`
- `MODE_PRESENCE_BONUS` (0.12 at `classifier.ts:412`)
- `modeProximity.delta` at `classifier.ts:427`

These are correlated transforms of Q, frequency, and RT60 — not independent measurements. Total room delta is unbounded. `[ESTIMATE]` Worst case: a low-frequency room-mode-like peak could accumulate ±0.40 from room physics alone.

### 4.4 `[VERIFIED]` Severity override breaks posterior normalization

At `classifier.ts:807-811`, RUNAWAY forces `pFeedback = max(pFeedback, 0.85)` AFTER normalization. The three probabilities no longer sum to 1. This is intentional but means `pUnknown = 1 - confidence` (from `classifier.ts:472`) describes a different model than the returned probability vector.

---

## 5. Mic Calibration Deep Dive

### 5.1 `[VERIFIED]` Calibration math is correct

`computeMicCalibrationTable()` at `feedbackDetector.ts:778-831`:
- Reads calibration curve `[freqHz, dBDeviation]` pairs from `MIC_CALIBRATION_PROFILES`
- **Log-frequency interpolation** between points: `t = (ln(f) - ln(fLow)) / (ln(fHigh) - ln(fLow))`
- Compensation is **negated** (inverse of measured deviation)
- Per-bin result stored in pre-allocated `Float32Array`
- Tracks min/max for dynamic analysis bounds

Application order in `_buildPowerSpectrum()` at `feedbackDetector.ts:1154-1169`:
1. Non-finite dB clamped to -100
2. Software input gain added
3. A-weighting offset added (if enabled)
4. Mic calibration offset added (if enabled)
5. Single post-calibration clamp using dynamic bounds

This order is correct. The single post-cal clamp (vs old pre-cal clamp at -100) was a deliberate fix to preserve precision for quiet low-frequency signals boosted by MEMS calibration.

### 5.2 `[CORRECTED]` Live wiring gap (see Section 3.1)

### 5.3 `[CLAUDE-ONLY]` ECM8000 profile is helpful

The ECM8000 is a reference-grade measurement microphone with a documented frequency response curve. Applying its inverse compensation is standard measurement practice and improves analysis accuracy for users who own one. This is genuine value.

### 5.4 `[VERIFIED]` MEMS profile has a hum caveat

Generic smartphone MEMS profiles boost low frequencies to compensate for the MEMS rolloff below ~200 Hz. This boost also amplifies mains hum (50/60 Hz harmonics). The mains hum gate in the classifier (`classifier.ts:781-791`) mitigates this, but users should be aware.

### 5.5 `[GPT-ONLY]` Calibration session does not feed back into live detector

GPT notes that `useCalibrationSession.ts` records detections and settings but does not actively learn or feed tuned thresholds back into the live detector. Claude has not verified this claim in this round. `[TO VERIFY IN ROUND 2]`

---

## 6. Threshold Semantics

### 6.1 `[VERIFIED]` The hero slider is the single source of truth

`SoundTab.tsx:101-108`: Hero slider drives `feedbackThresholdDb`
`feedbackDetector.ts:437-438`: Maps to `relativeThresholdDb` in AnalysisConfig
`feedbackDetector.ts:521-528`: Comment explicitly documents this as intentional design
`feedbackDetector.ts:1613-1627`: Hybrid threshold = `max(thresholdDb, noiseFloor + relativeThresholdDb)`

This is well-designed internally but non-obvious to users because:
- `relativeThresholdDb` appears as a separate advanced field (legacy)
- `thresholdDb` is a hidden safety floor
- The hero slider label doesn't explain it controls a noise-floor-relative threshold

### 6.2 `[VERIFIED]` Threshold modes work correctly

| Mode | Formula | Evidence |
|------|---------|----------|
| absolute | `threshold = thresholdDb` | `feedbackDetector.ts:1614` |
| relative | `threshold = noiseFloor + relativeThresholdDb` | `feedbackDetector.ts:1616` |
| hybrid | `threshold = max(absolute, relative)` | `feedbackDetector.ts:1619` |

Default is hybrid (`types/advisory.ts:388`). This is correct — hybrid ensures detection works even when noise floor estimation is stale.

---

## 7. Algorithm Details

### 7.1 `[VERIFIED]` Six detection algorithms + ML

| # | Algorithm | Weight (Default) | What it measures | Code |
|---|-----------|:---:|---|---|
| 1 | MSD | 0.27 | Magnitude stability (feedback≈0, music>>0) | `feedbackDetector.ts:1653-1688`, `msdPool.ts:129-173` |
| 2 | Phase Coherence | 0.23 | Frame-to-frame phase stability | `phaseCoherence.ts:65-116` |
| 3 | Spectral Flatness | 0.11 | Geometric/arithmetic mean + kurtosis | `compressionDetection.ts:64-129` |
| 4 | Comb Pattern | 0.07 | Evenly-spaced peaks from acoustic loop | `algorithmFusion.ts` comb analysis |
| 5 | IHR | 0.12 | Inter-harmonic energy ratio | `algorithmFusion.ts` IHR analysis |
| 6 | PTMR | 0.10 | Peak-to-median ratio | `algorithmFusion.ts` PTMR analysis |
| 7 | ML (ONNX) | 0.10 | MLP 11→32→16→1 (929 params) | `mlInference.ts` |

### 7.2 `[VERIFIED]` Content-adaptive weight selection

| Content | MSD | Phase | Spectral | Comb | IHR | PTMR | ML | Source |
|---------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|---|
| DEFAULT | 0.27 | 0.23 | 0.11 | 0.07 | 0.12 | 0.10 | 0.10 | `algorithmFusion.ts:372` |
| SPEECH | 0.30 | 0.22 | 0.09 | 0.04 | 0.09 | 0.16 | 0.10 | `algorithmFusion.ts:380` |
| MUSIC | 0.07 | 0.32 | 0.09 | 0.07 | 0.22 | 0.13 | 0.10 | `algorithmFusion.ts:388` |
| COMPRESSED | 0.11 | 0.27 | 0.16 | 0.07 | 0.16 | 0.13 | 0.10 | `algorithmFusion.ts:396` |

### 7.3 `[VERIFIED]` Gate inventory (split by layer)

**Fusion-layer gates** (algorithmFusion.ts):
| Gate | Condition | Effect | Line |
|------|-----------|--------|------|
| IHR gate | harmonicsFound≥3 AND IHR>0.35 | pFeedback *= 0.65 | ~658 |
| PTMR gate | PTMR feedbackScore < 0.2 | pFeedback *= 0.80 | ~664 |
| CombStability | spacing CV > 0.05 over 16 frames | comb confidence *= 0.25 | comb tracker |
| Low-freq phase | peakFrequencyHz < 200 | phase score *= 0.5 | ~757 |

**Classifier-layer gates** (classifier.ts):
| Gate | Condition | Effect | Line |
|------|-----------|--------|------|
| Formant gate | 2+ formant bands active, Q 3-20 | pFeedback *= 0.65 | ~759-767 |
| Chromatic gate | 12-TET grid ±5 cents, coherence > threshold | phase contribution scaled | ~759-767 |
| Mains hum gate | ±2 Hz of 50n/60n Hz, 2+ corroborating peaks | pFeedback *= 0.40 | ~781-791 |

**Classifier severity overrides** (post-normalization):
| Override | Condition | Effect | Line |
|----------|-----------|--------|------|
| RUNAWAY | cumulativeGrowth severity | pFeedback = max(pFeedback, 0.85) | ~807 |
| GROWING | cumulativeGrowth severity | pFeedback = max(pFeedback, 0.70) | ~809 |

---

## 8. Performance Characteristics

### 8.1 `[VERIFIED]` Hot path budget

`FeedbackDetector.analyze()` runs every 20ms (50fps). Key optimizations:
- `EXP_LUT`: 1001-entry precomputed dB-to-linear table (avoids `Math.pow` in inner loop)
- Skip-threshold: Bins 12 dB below threshold skip the LUT entirely
- Prefix sum: O(1) prominence via Float64Array prefix sum
- MSD pool: Sparse allocation (256 slots × 64 frames = 64KB) with O(1) slot allocation, O(256) LRU eviction
- Canvas: 30fps (not 60fps) — sufficient for spectrum visualization
- Transferable buffers: Float32Arrays transferred zero-copy to worker
- Worker backpressure: Drop-on-busy (no queuing)

### 8.2 `[VERIFIED]` No per-frame allocations in hot path

All arrays (freqDb, timeDomain, MSD pool, prefix sum, calibration table) are pre-allocated. The worker uses a 3-buffer pool per type to handle in-flight transfers.

---

## 9. Open Questions for Round 2

### 9.1 `[TO VERIFY]` Does CalibrationTab trigger the mic calibration wiring gap?

If `CalibrationTab.tsx` writes `micCalibrationProfile` through the normal settings path (which goes through `updateSettings()`), the gap in Section 3.1 means the profile change may not propagate. Need to trace the CalibrationTab write path.

### 9.2 `[TO VERIFY]` Does mobile auto-apply for MEMS work despite the gap?

CLAUDE.md mentions "Auto MEMS calibration: Smartphone MEMS mic profile auto-applied on mobile." Need to verify whether this goes through `updateSettings()` (broken) or `updateConfig()` (working).

### 9.3 `[TO VERIFY]` Calibration session feedback loop

GPT claims `useCalibrationSession.ts` does not feed learned thresholds back into the live detector. Need to verify.

### 9.4 `[TO VERIFY]` How many settings fields are actually consumed by `updateSettings()`?

Claude counted "20+ fields mapped." GPT's review implies some mapped fields may also be dead. A complete audit of which `DetectorSettings` fields are mapped vs. which exist would identify any additional gaps.

---

## 10. Reconciled Final Position

This is the converged position both models can honestly defend:

1. **DoneWell Audio can detect feedback.** The pipeline is real, the algorithms are appropriate for the application, and the math is mostly correct.

2. **The low-level DSP foundation is strong.** PHPR, prominence, MSD, phase coherence, Q estimation, fusion, and the gate system are all implemented correctly after the v0.11.0 fixes.

3. **The classifier and confidence system are heuristic scoring, not statistical calibration.** The product should describe outputs as "confidence scores" rather than "Bayesian probabilities."

4. **Mic calibration math is correct but the live settings bridge is incomplete.** `computeMicCalibrationTable()` and `_buildPowerSpectrum()` application are both correct. The gap is solely that `updateSettings()` doesn't forward `micCalibrationProfile` to `updateConfig()`.

5. **ML support exists in fusion but custom-mode defaults/UI omit it from the operator-facing path.** Auto mode always includes ML. Custom mode excludes it by default and provides no UI toggle.

6. **Default analysis range is 150-10000 Hz**, not 60-16000 Hz.

7. **The control surface has enough drift and dead fields that product trust is lower than the DSP quality deserves.** Dead controls (`musicAware`, `noiseFloorDecay`, `harmonicFilterEnabled`), unreachable defaults (`peakMergeCents: 1000` vs UI max 150), and silent sensitivity coupling in room presets all need cleanup.

8. **Room-physics evidence stacking is unbounded.** Correlated room heuristics (modal overlap, RT60 Q, Schroeder penalty, mode proximity) stack additively without a cap.

9. **The right next step is control surface cleanup, not a detector rewrite.** Fix the mic calibration wiring gap, remove dead controls, fix peakMergeCents default, make room preset sensitivity explicit, and add an ML toggle to custom mode UI.

---

## 11. Items For GPT Counter-Review

GPT: Please verify or challenge:

1. **Section 2.9** — Is the F2 fix (effective scores vector) correctly described? We claim the pre-fix divergence is resolved. Please verify at `algorithmFusion.ts:745-770`.

2. **Section 2.10** — Is the F4 fix (double-counting removal) correctly described? We claim `FUSION_BLEND = 0.6` at `classifier.ts:754` now blends fusion result without re-adding per-algorithm scores. Please verify at `classifier.ts:748-855`.

3. **Section 4.3** — We claim room-physics delta is unbounded. Can you trace the worst-case accumulation through `classifyTrack()` for a 100 Hz peak with Q=50 in a configured room?

4. **Section 5.5** — Your claim about calibration session not feeding back. Please provide the specific line references in `useCalibrationSession.ts` and `calibrationSession.ts`.

5. **Section 9.2** — Does the mobile MEMS auto-apply go through `updateSettings()` or `updateConfig()`? The answer determines whether it's affected by the wiring gap.

6. **Any additional dead controls or wiring gaps** we haven't identified? We found 3 dead controls + 1 wiring gap. Is that complete?

---

*This document is Round 1 of adversarial cross-review. GPT's counter-review will produce Round 2. The goal is convergence on a single source-of-truth audit that both models can defend against direct source inspection.*
