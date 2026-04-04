# DoneWell Audio — Deep Feedback Detection Pipeline Audit

**Date:** 2026-03-24
**Repository:** `C:\DoneWellAV\DoneWellAudio` (v0.13.0)
**Author:** Claude Opus 4.6 (adversarial review format for GPT-5.4 cross-validation)
**Scope:** Every algorithm, gate, control, setting, calibration profile, and decision boundary in the feedback detection pipeline.

---

## How to Read This Document

Every claim is tagged with a **provenance label**:

- `[CODE]` — Verified from source code with line numbers. Falsifiable: cite the code path that contradicts it.
- `[FIXED]` — Was a bug, now fixed. Shows both old and new implementation.
- `[HEURISTIC]` — Mathematically sound but not calibrated against labeled data. Works in practice.
- `[DEAD]` — Code exists but is never consumed at runtime.
- `[ESTIMATE]` — Analytical projection, not measured.
- `[DISPUTED]` — Previously claimed differently by Claude or GPT; corrected here with evidence.

**Challenge protocol:** If you disagree with any claim, respond with:
1. The claim number
2. The code path that contradicts it
3. Whether the disagreement is about runtime behavior, intent, or wording

---

## 1. Executive Verdict

**Can the app detect feedback?** Yes.

**Is the math correct?** Yes, for the core DSP. No fundamental math bugs remain after Tier 1/2 fixes.

**What's the main problem?** The control surface has drifted from the runtime model. Three settings fields are dead. One default is unreachable by the UI. Room presets silently change sensitivity. The classifier uses heuristic scoring labeled as "probability."

**Overall grade:** A− for DSP math. B+ for control surface integrity.

---

## 2. Pipeline Architecture

`[CODE]` feedbackDetector.ts → useDSPWorker.ts → dspWorker.ts → algorithmFusion.ts → classifier.ts → advisoryManager.ts

```
Mic → getUserMedia → GainNode → AnalyserNode (8192-point FFT @ 48kHz)
  → FeedbackDetector.analyze() @ 50fps (main thread)
    → _buildPowerSpectrum(): dB→linear via EXP_LUT, Float64 prefix sum
    → _scanAndProcessPeaks(): local maxima, prominence, Q, PHPR, persistence
    → postMessage(peak, spectrum, timeDomain) [transferable Float32Arrays]
      → Web Worker:
        → AlgorithmEngine.computeScores() [MSD, Phase, Spectral, Comb, IHR, PTMR]
        → fuseAlgorithmResults() [content-adaptive weighted mean + gates]
        → classifyTrack() [11-feature Bayesian-style classifier]
        → shouldReportIssue() [mode-specific threshold gate]
        → generateEQAdvisory() [PEQ with ERB-scaled depth]
        → AdvisoryManager.createOrUpdate() [3-layer dedup]
      → postMessage(advisory) back to main thread
```

**FFT resolution:** `[CODE]` 8192 bins / 48000 Hz = 5.86 Hz/bin. Analysis range defaults: 60–16000 Hz.
**Frame rate:** `[CODE]` ~50fps (20ms interval). Canvas renders at 30fps.
**Thread model:** `[CODE]` Main thread = AudioContext + peak detection + canvas. Worker = scoring + classification + advisory.
**Backpressure:** `[CODE]` useDSPWorker.ts:278–283 — if worker busy, frame is **dropped** (not queued). Tracked via `droppedFramesRef`.

---

## 3. Peak Detection (feedbackDetector.ts)

### 3.1 Power Spectrum

`[CODE]` feedbackDetector.ts:1149–1183

```
power_i = EXP_LUT[round((db_i + 100) × 10)]    // 1001-entry precomputed 10^(x/10)
prefix[i+1] = prefix[i] + power_i                // Float64Array prefix sum for O(1) range queries
```

Bins below `threshold − 12 dB` skip the LUT entirely (hot-path optimization).
**Grade: A.** Quantization error < 0.05 dB. Bounds-checked.

### 3.2 Prominence

`[CODE]` feedbackDetector.ts:1247–1265

```
neighborhoodPower = (prefix[endNb] − prefix[startNb] − peakContribution) / (2×nb − 4)
prominence = peakDb − 10×log₁₀(neighborhoodPower)
```

Excludes ±2 bins around peak. Neighborhood clamped to prevent buffer overruns (lines 868–871).
**Grade: A.**

### 3.3 PHPR (Peak-to-Harmonic Power Ratio)

`[FIXED]` feedbackDetector.ts:1539–1569 — was F1 bug, fixed in v0.11.0

**Old (wrong):**
```
harmonicSum += maxHarmonicDb           // summing dB values
PHPR = peakDb − (harmonicSum / count)  // arithmetic dB mean
```

**New (correct):**
```
harmonicSum += 10^(maxHarmonicDb / 10)                // sum in linear power
PHPR = peakDb − 10×log₁₀(harmonicSum / count)         // power-domain mean
```

Searches ±BIN_TOLERANCE around each expected harmonic (h=2..NUM_HARMONICS+1). Stops at Nyquist.
**Grade: A.** Per Van Waterschoot & Moonen (2011).

### 3.4 Q Factor Estimation

`[CODE]` feedbackDetector.ts:1463–1526

```
Q = centerHz / bandwidth_3dB
bandwidth_3dB = rightHz − leftHz  (interpolated at peakDb − 3)
```

Quadratic interpolation for sub-bin accuracy.
**Grade: A.** Standard engineering approximation. Sensitive to FFT leakage but correct for this context.

### 3.5 Persistence Tracking

`[CODE]` feedbackDetector.ts:1770–1830, constants.ts:876–897

```
dbDiff = |amplitudeDb − lastDb|
if dbDiff ≤ 6 dB AND lastDb > −150:
  persistenceCount[bin] = min(count + 1, HISTORY_FRAMES)
else:
  persistenceCount[bin] = 1    // Reset on amplitude deviation
```

Frame-to-time mapping at init:
```
≤60ms  → penalty −0.05
≥100ms → boost +0.05
≥300ms → boost +0.12
≥600ms → boost +0.20
```

**This is consecutive-frame amplitude stability, NOT elapsed time.** Resets when amplitude fluctuates > 6 dB.
Track age (`trackManager.ts:367`) is a separate metric: `persistenceMs = lastUpdateTime − onsetTime`.
**Grade: A.**

### 3.6 Auto-Gain

`[CODE]` feedbackDetector.ts:1068–1081

```
desiredGain = clamp(targetDb − rawPeak, minDb, maxDb)
gain += (desiredGain − gain) × α
  attack α  = 1 − exp(−dt / attackMs)
  release α = 1 − exp(−dt / releaseMs)
```

**Grade: A.** Asymmetric EMA with correct exponential decay.

### 3.7 MSD (Magnitude Slope Deviation)

`[CODE]` feedbackDetector.ts:1653–1688, msdPool.ts:129–173

```
Δ²m = m[n] − 2×m[n−1] + m[n−2]    // 3-point second derivative
MSD = (1/M) Σ (Δ²m)²
feedbackScore = exp(−MSD / 0.1)
isFeedbackLikely = MSD < 0.1 AND framesAnalyzed ≥ minFrames
```

MSD = 0 → perfect stability (feedback). MSD >> 0.1 → variance (music).
Sparse pool: 256 slots × 64 frames = 64KB. O(1) allocation, O(256) LRU eviction.
**Grade: A.** Source: DAFx-16 (Aalto University, 2016). 22% accuracy on rock music → weight reduced to 0.07 in MUSIC mode.

---

## 4. Seven Detection Algorithms

`[CODE]` All algorithms verified from algorithmFusion.ts, workerFft.ts, phaseCoherence.ts, compressionDetection.ts, mlInference.ts.

| # | Algorithm | What It Measures | Source | Output | Grade |
|---|-----------|-----------------|--------|--------|-------|
| 1 | MSD | Magnitude stability (feedback→0) | DAFx-16 | [0,1] | A |
| 2 | Phase Coherence | Frame-to-frame phase lock | KU Leuven 2025 | [0,1] | A |
| 3 | Spectral Flatness | Peak purity (geometric/arithmetic mean) + kurtosis | Glasberg–Moore | [0,1] | A− |
| 4 | Comb Pattern | Evenly-spaced peaks from acoustic loop | DBX whitepaper | [0,1] | A |
| 5 | IHR | Inter-harmonic energy ratio | Novel | [0,1] | A |
| 6 | PTMR | Peak-to-median ratio (sharpness) | Novel | [0,1] | A |
| 7 | ML (ONNX) | 11-feature MLP meta-model (929 params) | Bootstrap | [0,1] | B+ |

### 4.1 Phase Coherence

`[CODE]` phaseCoherence.ts:65–116

```
Δφ_n = unwrap(φ_n − φ_{n−1})     // to [−π, π]
coherence = |mean(exp(j × Δφ_n))|
          = sqrt(mean(cos Δφ)² + mean(sin Δφ)²)
```

Coherence = 1.0 → deterministic phase walk (feedback). Coherence → 0 → random phase (music).
Thresholds: HIGH 0.85, MEDIUM 0.65, LOW 0.40. Min samples: 5 frames.
**Primary music discriminator.** Instruments have vibrato/bending; feedback locks frequency.
Source: Fisher (1993) circular statistics.

### 4.2 IHR (Inter-Harmonic Ratio)

`[CODE]` algorithmFusion.ts:551–630

```
For harmonics k=1..8:
  hPeak_k = max(spectrum[expectedBin ± tolerance])
  if |hPeakBin − k×f₀| / (k×f₀) ≤ 0.02: harmonicsValidated++

IHR = interHarmonicEnergy / harmonicEnergy
```

IHR < 0.15 → clean tone (feedback). IHR > 0.35 → rich harmonics (instrument).
**Validation at ±2%** prevents coincidental near-harmonic matches from inflating counts.

### 4.3 PTMR (Peak-to-Median Ratio)

`[CODE]` algorithmFusion.ts:638–669

```
Within ±20 bins (excluding ±2 around peak):
  PTMR_dB = spectrum[peakBin] − median(neighborhood)
feedbackScore = clamp((PTMR − 8) / 15, 0, 1)
```

PTMR > 15 dB → sharp peak (feedback). PTMR < 8 dB → broad peak (vocal formant).

### 4.4 Comb Pattern

`[CODE]` algorithmFusion.ts:441–543

```
For each peak pair: candidate fundamental = Δf / k (k=1..8)
Best fundamental: most votes. pathLength = 343 m/s / fundamental
confidence = matchingPeaks / max(numPeaks, 3)
```

Physical validation: 0.1–50 m path length. Requires 3+ peaks.
**CombStabilityTracker** (lines 261–324): monitors spacing CV over 16 frames. CV > 0.05 → sweeping → confidence *= 0.25 (flanger/phaser suppression).

### 4.5 ML Meta-Model

`[CODE]` mlInference.ts:48–68, workerFft.ts:366–379

```
11 inputs: [MSD, Phase, Spectral, Comb, IHR, PTMR, prevProb, prevConf, isSpeech, isMusic, isCompressed]
Architecture: MLP 11→32→16→1 (929 params, 4KB ONNX)
```

Bootstrap model trained on gate logic. 1-frame lag on fused probability avoids circular dependency.
Promise guard at mlInference.ts:48 prevents duplicate initialization.
Graceful degradation: if ONNX load fails, 6 algorithms continue.

---

## 5. Content-Adaptive Fusion

### 5.1 Weight Profiles

`[CODE]` algorithmFusion.ts:190–234

| Algorithm | DEFAULT | SPEECH | MUSIC | COMPRESSED |
|-----------|---------|--------|-------|------------|
| MSD       | 0.27    | 0.30   | 0.07  | 0.11       |
| Phase     | 0.23    | 0.22   | 0.32  | 0.27       |
| Spectral  | 0.11    | 0.09   | 0.09  | 0.16       |
| Comb      | 0.07    | 0.04   | 0.07  | 0.07       |
| IHR       | 0.12    | 0.09   | 0.22  | 0.16       |
| PTMR      | 0.10    | 0.16   | 0.13  | 0.13       |
| ML        | 0.10    | 0.10   | 0.10  | 0.10       |

**Rationale:**
- SPEECH: MSD boosted (0.30) — primary; PTMR boosted (0.16) — discriminates broad formants from sharp feedback
- MUSIC: Phase primary (0.32) — instruments have random phase walk; MSD reduced to 0.07 (22% accuracy on rock per DAFx-16)
- COMPRESSED: Phase reduced from 0.38→0.27 (Auto-Tune creates artificial coherence); Spectral+IHR boosted

### 5.2 Fusion Formula

`[CODE]` algorithmFusion.ts:536–685

```
feedbackProbability = Σ(score_i × weight_i) / Σ(weight_i)    // weighted mean over active algorithms
```

**Post-fusion gates** (multiplicative, not subtractive):
- `[CODE]` IHR gate (line ~864): harmonicsFound ≥ 3 AND IHR > 0.35 → p *= 0.65
- `[CODE]` PTMR gate (line ~872): PTMR feedbackScore < 0.2 → p *= 0.80
- `[CODE]` Calibration: p = calibrateProbability(p, table) — identity by default

**Confidence** (post-F2 fix — same transformed vector):
```
effectiveScores = [transformed scores after phase suppression, comb penalty, etc.]
agreement = 1 − sqrt(variance(effectiveScores))
confidence = p × (0.5 + 0.5 × agreement) + persistenceBonus
```

**Verdict thresholds:**
```
FEEDBACK:          p ≥ 0.60 AND confidence ≥ 0.60
POSSIBLE_FEEDBACK: p ≥ 0.42 AND confidence ≥ 0.40
NOT_FEEDBACK:      p < 0.30 AND confidence ≥ 0.60
UNCERTAIN:         otherwise
```

### 5.3 Low-Frequency Phase Suppression

`[CODE]` algorithmFusion.ts:757–759

```
if (peakFrequencyHz < 200): phaseScore *= 0.5
```

`[HEURISTIC]` 50% is a round number, not derived from FFT resolution analysis. At 48kHz/8192-point FFT, 200 Hz has ~34 bins of resolution — arguably sufficient. This suppression is conservative but not physically motivated.

### 5.4 Active Algorithm Selection

`[CODE]` algorithmFusion.ts:700–735

```
'auto' (default):
  if MSD framesAnalyzed ≥ msdMinFrames → all 7 algorithms
  else → 6 algorithms (skip MSD until warmed up)

'custom':
  uses config.enabledAlgorithms ?? all 7 (including ML)
```

**Note:** Default enabledAlgorithms includes 'ml'. ML is NOT silently dropped in custom mode.

---

## 6. Bayesian-Style Classifier

### 6.1 Priors

`[CODE]` classifier.ts:38–40

```
PRIOR_FEEDBACK   = 0.45
PRIOR_WHISTLE    = 0.27
PRIOR_INSTRUMENT = 0.27
```

`[HEURISTIC]` These are hand-selected, not estimated from data. The elevated feedback prior (0.45) reflects the assumption that users open a feedback detector because they suspect feedback.

### 6.2 Eleven Features

`[CODE]` classifier.ts:214–492

| Feature | Measures | Threshold | Max Boost | Target |
|---------|----------|-----------|-----------|--------|
| Pitch stability (cents std) | Rock-steady vs vibrato | 12 cents | +0.28 | Feedback |
| Harmonicity score | Rich harmonic series | 0.65 | +0.22 | Instrument |
| Modulation (vibrato) | 4–8 Hz frequency wobble | 0.45 | +0.18 | Whistle |
| Sideband noise | Breath noise in sidebands | 0.35 | +0.09 | Whistle |
| Velocity (dB/sec) | Runaway growth rate | 8 dB/s | +0.25 | Feedback |
| Q factor | Narrow peak sharpness | Freq-dependent | +0.15 | Feedback |
| Persistence | Stable duration | 1000ms × band mult | +0.10 | Feedback |
| Modal overlap (1/Q) | Sharp isolated peak | Q > 33 | +0.15 | Feedback |
| PHPR | Peak-to-harmonic power | ≥10 dB | +0.10 | Feedback |
| Cumulative growth | Slow-building feedback | 3–18 dB | +0.08–0.25 | Feedback |
| Fusion verdict | Algorithm consensus | conf > 0.7 | +0.10–0.20 | Feedback |

### 6.3 Posterior Construction

`[HEURISTIC]` The "posterior" is built by:
1. Starting with hand-tuned priors
2. Adding/subtracting heuristic deltas from 11 features
3. Applying classifier-layer gate multipliers (formant, chromatic, mains hum)
4. Renormalizing to sum to 1.0
5. Setting pUnknown = 1 − confidence (post-F5 fix: adjustedPFeedback now applied before renormalization)

**This is a practical scoring system, not a statistically calibrated Bayesian posterior.** The "probability" values are confidence scores useful for ranking and thresholding. They are not true conditional probabilities in the statistical sense.

---

## 7. False Positive Gates

### 7.1 Fusion-Layer Gates (algorithmFusion.ts)

| Gate | Condition | Effect | Purpose |
|------|-----------|--------|---------|
| IHR gate | harmonicsFound ≥ 3 AND IHR > 0.35 | ×0.65 | Rich harmonics → instrument |
| PTMR gate | PTMR feedbackScore < 0.2 | ×0.80 | Broad peak → not feedback |
| Comb stability | spacing CV > 0.05 over 16 frames | ×0.25 comb | Flanger/phaser sweeping |

### 7.2 Classifier-Layer Gates (classifier.ts)

| Gate | Condition | Effect | Purpose |
|------|-----------|--------|---------|
| Formant | 2+ peaks in F1/F2/F3 bands, 3≤Q≤20 | ×0.65 pFeedback | Sustained vowel suppression |
| Chromatic quantization | Freq ±5 cents of 12-TET, phase > 0.80 | ×0.60 phase score | Auto-Tune suppression |
| Mains hum | Peak on 50n/60n Hz, 2+ corroborating, phase > 0.70 | ×0.40 pFeedback | HVAC/electrical suppression |

**Design principle:** All gates use multiplicative suppression (evidence scaled down, never zeroed). This preserves Bayesian semantics.

---

## 8. Room Physics

All room physics gated behind `roomPreset !== 'none'`. Unconfigured rooms get no room adjustments.

### 8.1 Schroeder Frequency

`[CODE]` acousticUtils.ts:38

```
f_S = 2000 × √(RT60 / V),  clamped to [50, 500] Hz
```

Source: Hopkins (2007) Eq. 1.111.
Sigmoid penalty (12.5 Hz transition) replaces binary step at f_S.

### 8.2 Schroeder Floor Constraint

`[CODE]` acousticUtils.ts:70

```
lowMidBoundary = Math.max(schroederHz, FREQUENCY_BANDS.LOW.maxHz)
FREQUENCY_BANDS.LOW.maxHz = 300
```

In most realistic rooms, Schroeder frequency is well below 300 Hz. The `Math.max` clamp makes the low/mid boundary less adaptive than comments imply. Not a bug — prevents boundary from dropping too low in dead rooms — but worth noting.

### 8.3 Reverberation-Aware Q

`[CODE]` acousticUtils.ts:285–320

```
Q_room = (π × f × RT60) / 6.9
ratio = measuredQ / Q_room

ratio ≤ 1.0:  delta = −0.10  (peak consistent with room decay)
ratio ≥ 3.0:  delta = +0.12  (peak sharper than room can sustain → external loop)
otherwise:     delta = +0.04  (transitional)
```

Source: Hopkins §1.2.6.3.

### 8.4 Modal Overlap

`[CODE]` acousticUtils.ts:118–161

```
M = 1 / Q_measured     (NOT 1 / Q_room)

M < 0.03 (Q > 33):  ISOLATED  → boost +0.15
M < 0.10 (Q 10–33): COUPLED   → boost +0.05
M < 0.33 (Q 3–10):  COUPLED   → boost  0.00
M ≥ 0.33 (Q < 3):   DIFFUSE   → boost −0.10
```

Source: Hopkins Fig 1.23.

### 8.5 Room Delta Cap

`[CODE]` classifier.ts — MAX_ROOM_DELTA = 0.30

Total combined room adjustments capped at ±0.30. Prevents correlated heuristics (all derived from Q, f, RT60) from stacking unboundedly.

### 8.6 Room Physics Value Assessment

| Feature | Value | Complexity | Verdict |
|---------|-------|------------|---------|
| Schroeder frequency | Flags LF room modes | Low | Worth it |
| Modal overlap (1/Q) | Sharp = feedback | Minimal | Worth it |
| Modal density n(f) | Sparse needs more prominence | Medium | Justified |
| Reverberation Q | Q >> Q_room = external loop | Low | Worth it |
| Mode clustering | Coupled modes = room | Low | Reasonable |
| Room eigenfrequencies | Direct mode matching | Medium | Marginal (only ≤500 Hz) |
| Air absorption | HF RT60 correction | Low | Correct |

---

## 9. Microphone Calibration

`[CODE]` feedbackDetector.ts:407–410, 778–831, 1166

### 9.1 Wiring (Correcting a Previous Error)

`[DISPUTED]` GPT's audit claimed mic calibration was "not properly wired." **This is FALSE.**

Evidence:
- `updateConfig()` at line 407: `if (config.micCalibrationProfile !== undefined) { this.computeMicCalibrationTable() }`
- `_buildPowerSpectrum()` at line 1166: `if (useMicCalibration && micCalTable) db += micCalTable[i]`
- Mobile auto-apply at AudioAnalyzer.tsx:323–333 sets 'smartphone' profile on startup
- **Calibration IS wired, IS updated on settings change, and IS applied at 50fps in the hot path.**

### 9.2 Profile Assessment

`[CODE]` constants.ts MIC_CALIBRATION_PROFILES

| Profile | LF Effect | HF Effect | For Detection | Verdict |
|---------|-----------|-----------|---------------|---------|
| ECM8000 | +0–3 dB boost below 200 Hz | −3 to −5 dB above 8 kHz | Helps LF, reduces HF FP | Helpful |
| MEMS (smartphone) | +2–12 dB boost below 200 Hz | −3.5 dB at 10 kHz | Dramatic LF help | Double-edged |
| No calibration | Flat | Flat | Safe default | Fine |

**MEMS caveat:** The +4–6 dB boost at 50/60 Hz amplifies mains hum, making the mains hum gate work harder. `[ESTIMATE]` Helps ~70% of use cases, hurts ~15% (rooms with strong electrical hum).

---

## 10. Control Surface Audit

### 10.1 Dead Controls

`[DEAD]` Three settings fields defined in DetectorSettings (types/advisory.ts) but never consumed by runtime:

| Control | Line | Evidence |
|---------|------|----------|
| **musicAware** | advisory.ts:324 | Grep: appears in types, constants, UI components. Zero matches in algorithmFusion.ts, dspWorker.ts, classifier.ts. |
| **noiseFloorDecay** | advisory.ts:320 | Only appears in constants.ts:678 default value. Never read by feedbackDetector.ts noise floor logic (uses noiseFloorAttackMs/ReleaseMs). |
| **harmonicFilterEnabled** | advisory.ts:347 | Only appears in constants.ts:712 and UI. Never checked by advisoryManager.isHarmonicOfExisting() or dspWorker.ts. Harmonic suppression always runs. |

**Impact:** Users see toggles/sliders that do nothing. Wastes operator attention and erodes trust.

### 10.2 peakMergeCents Default Mismatch

`[CODE]` constants.ts:679, AdvancedTab.tsx slider

```
Default: peakMergeCents = 1000    // Minor seventh interval
UI slider: min=10, max=150, step=5
```

The default (1000 cents) cannot be expressed by the UI. The moment a user touches the slider, behavior changes dramatically. Either the default should be ~100 or the UI range should include 1000.

### 10.3 Room Presets Change Sensitivity

`[DISPUTED]` Our earlier verification said room presets do NOT change sensitivity. **This was wrong.**

`[CODE]` RoomTab.tsx:284–297

```typescript
onClick={() => {
  const updates = {
    roomPreset: key,
    feedbackThresholdDb: preset.feedbackThresholdDb,   // ← CHANGES SENSITIVITY
    ringThresholdDb: preset.ringThresholdDb,            // ← CHANGES RING THRESHOLD
    roomLengthM: preset.lengthM,
    roomWidthM: preset.widthM,
    roomHeightM: preset.heightM,
    roomTreatment: preset.treatment,
  }
```

Room presets write `feedbackThresholdDb` alongside room dimensions. Example: "Small Room" sets threshold to 22 dB (more sensitive than default 25 dB). This is not necessarily wrong — smaller rooms may need more sensitivity — but it is semantically misleading. "Room preset" implies room modeling, not aggressiveness adjustment.

### 10.4 Threshold Semantics

`[CODE]` feedbackDetector.ts:437–438, 521–528, 1613–1631

The hero "Sensitivity" slider writes `feedbackThresholdDb`, which maps to `relativeThresholdDb` in the detector config. The comment at line 525 explicitly says this is intentional:

```typescript
// NOTE: relativeThresholdDb is NOT mapped here — it's controlled exclusively
// via feedbackThresholdDb (the UI slider)
```

Effective threshold in hybrid mode (default):
```
effectiveThreshold = max(thresholdDb, noiseFloorDb + relativeThresholdDb)
                   = max(−80, noiseFloor + sliderValue)
```

This is well-designed but not obvious. `thresholdDb` (−80 dB) acts as a floor; `relativeThresholdDb` (from slider) is the adaptive component.

### 10.5 Worker Backpressure

`[CODE]` useDSPWorker.ts:278–283

```typescript
if (busyRef.current || crashedRef.current || !isReadyRef.current) {
  droppedFramesRef.current++
  return    // Frame DROPPED — not queued, not coalesced
}
```

Intentional real-time trade-off. In dense scenes (many simultaneous peaks), this reduces recall. Tracked via `getBackpressureStats()`.

### 10.6 Custom Algorithm UI vs Runtime

`[CODE]` algorithmFusion.ts:733 — default `enabledAlgorithms` includes 'ml' (all 7).

GPT claimed custom mode drops ML. **This is false.** The `enabledAlgorithms` default includes all 7 algorithms. However, the custom mode UI in SoundTab.tsx only shows 6 toggle buttons (MSD, Phase, Spectral, Comb, IHR, PTMR) — ML is not exposed as a user toggle. ML always participates in custom mode unless explicitly removed from the array.

---

## 11. Effective Threshold Calculation

`[CODE]` feedbackDetector.ts:1613–1631

```
thresholdMode = 'hybrid' (default)

absolute: return thresholdDb                           // Fixed −80 dB
relative: return noiseFloorDb + relativeThresholdDb     // Adaptive
hybrid:   return max(thresholdDb, noiseFloorDb + relativeThresholdDb)  // Both
```

**Examples:**
- Quiet room (noise floor −60 dBFS), slider at 25 dB: threshold = max(−80, −60+25) = **−35 dBFS**
- Loud room (noise floor −30 dBFS), slider at 25 dB: threshold = max(−80, −30+25) = **−5 dBFS**
- Very quiet (noise floor −95 dBFS), slider at 25 dB: threshold = max(−80, −95+25) = **−70 dBFS** (hits −80 floor)

---

## 12. Passive Measurement Limitation

`[CODE]` No code change needed — this is physics.

```
Y(f) = X(f) · S(f) · R(f) · M(f) + N(f)
```

Without a known reference X(f), the room transfer function R(f) cannot be separately identified. This means:

- Room mode identification is a **hypothesis**, not a measurement
- Dimension estimates are **inferred** from harmonic series, not measured
- RT60 values are **user-supplied**, not measured by the app
- The app should never claim to measure room response or transfer function

This is a fundamental measurement-theoretic constraint of any passive microphone system, not an implementation limitation.

---

## 13. Known Edge Cases and Failure Modes

`[CODE]` From test suite (algorithmFusion.test.ts, algorithmFusion.gpt.test.ts, algorithmFusion.chatgpt-context.test.ts):

| Scenario | Type | Status |
|----------|------|--------|
| Sustained synth tone | False positive | Documented in tests |
| Low-frequency reverberant feedback | False negative | Documented |
| Sustained vowel (ā, ō, ū) | False positive | Mitigated by formant gate |
| Dense mix (rock concert) | False negative | Mitigated by music-mode weights |
| Auto-Tuned vocal | False positive | Mitigated by chromatic gate |
| Single strong algorithm | Cannot reach FEEDBACK alone | By design (requires consensus) |
| Two algorithms only | Struggles to reach threshold | By design |

These are documented known limits, not hidden bugs. The test suite intentionally locks in these scenarios.

---

## 14. Remaining Weaknesses

| Issue | Severity | Notes |
|-------|----------|-------|
| LF phase suppression is heuristic (50% below 200 Hz) | Medium | Round number, not physics-derived |
| MSD weak on music (22% accuracy per DAFx-16) | Low | Weight 0.07 in music mode |
| Comb needs 3+ peaks | Low | Single-frequency feedback has no comb evidence |
| MEMS calibration amplifies mains hum | Low | Mains gate compensates |
| Vibrato detector ignores amplitude modulation | Low | Only FM detected |
| No hot-path unit tests (F10) | Medium | analyze() tested manually, not in CI |
| ML model is bootstrap quality | Low | 929-param MLP, will improve with data |
| No per-frequency growth cooldown | Low | Could spam BUILDING alerts on drift |
| Dead controls waste operator attention | Medium | musicAware, noiseFloorDecay, harmonicFilterEnabled |
| peakMergeCents default unreachable by UI | Medium | 1000 vs max 150 |
| Room presets silently change sensitivity | Medium | feedbackThresholdDb written alongside room dims |
| Classifier presents heuristics as "probability" | Medium | Works for ranking, not statistically calibrated |
| Schroeder floor at 300 Hz | Low | Less adaptive than comments imply |

---

## 15. Final Assessment

### Subsystem Grades

| Subsystem | Grade | Key Evidence |
|-----------|-------|-------------|
| Power spectrum / prefix sum | A | Correct bounds, O(1) prominence, LUT optimization |
| PHPR | A | Fixed to linear-power (was F1). Van Waterschoot 2011. |
| Q estimation | A | Standard 3dB bandwidth with interpolation |
| Persistence tracking | A | Frame-rate-independent, correct reset behavior |
| MSD | A | Per DAFx-16, sparse pool, LRU eviction |
| Phase coherence | A | Circular statistics (Fisher 1993) |
| Spectral flatness | A− | Width adjustment is heuristic but reasonable |
| IHR | A | Validated harmonic counting (±2%) |
| PTMR | A | Direct sharpness measurement, median-based |
| Comb pattern | A | Physics-based path length, CV stability |
| Compression detection | A− | Same-frame crest (was F8) |
| Fusion | A | Content-adaptive, same-vector confidence (F2 fix) |
| Classifier | A− | Practical scoring, renormalized (F5 fix) |
| Room physics | A | Hopkins/Kuttruff formulas, bounded delta cap |
| EQ advisor | A | ERB-scaled depth, cluster-aware Q |
| ML (ONNX) | B+ | Bootstrap, graceful degradation |
| Mic calibration | B+ | ECM8000 helpful, MEMS double-edged |
| **Control surface** | **B−** | **3 dead controls, 1 default mismatch, sensitivity hidden in room presets** |

### Overall: A−

The DSP math is correct and production-ready. The algorithms are orthogonal. The fusion is well-reasoned. The room physics are textbook-accurate.

The control surface needs cleanup: remove dead fields, fix peakMergeCents default, make room preset sensitivity changes explicit. The classifier should be described as "confidence scoring" rather than "Bayesian probability."

### Can it detect feedback?

**Yes.** Six orthogonal algorithms, content-adaptive fusion, 11-feature classification, and 6 false-positive gates provide robust detection across speech, music, and compressed content environments.

---

## 16. Claims for GPT to Challenge

These are the highest-value claims to verify or dispute:

1. `micCalibrationProfile` IS properly wired into the live detector through `updateConfig()` at line 407 and applied at 50fps in `_buildPowerSpectrum()` at line 1166.
2. The `harmonicFilterEnabled` toggle has **zero effect** — `isHarmonicOfExisting()` runs unconditionally at dspWorker.ts:563.
3. `enabledAlgorithms` default includes 'ml' (7 algorithms). Custom mode does NOT drop ML.
4. Room presets DO write `feedbackThresholdDb` alongside room dimensions (RoomTab.tsx:284–297).
5. The classifier posterior is additive-heuristic, not multiplicative-Bayesian. Priors are hand-set at 0.45/0.27/0.27.
6. Phase coherence at low frequencies (< 200 Hz) is suppressed by a heuristic 0.5× factor, not by FFT resolution analysis.
7. `peakMergeCents` defaults to 1000 cents (minor seventh) but the UI slider max is 150.
8. Backpressure drops frames outright — no queue, no coalescing.
9. MSD has 22% accuracy on rock music per the DAFx-16 paper cited in code comments.
10. The overall system can detect acoustic feedback. The math is correct. The control surface needs cleanup.
