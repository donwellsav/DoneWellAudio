# Full Acoustic Physics Upgrade v1.0.5

## Problem

v1.0.4 raised thresholds and added rate limiting, but the classifier still treats all frequencies with the same prominence floor, growth rate, and Q thresholds. It also never compares detected peaks against calculated room modes — the single highest-impact unused capability in the codebase. High-frequency peaks get no air absorption correction, and peak decay signatures (room mode vs. feedback) are ignored.

## Root Causes Identified

1. **Room modes calculated but never filtered** — `calculateRoomModes()` computes all eigenfrequencies but the classifier never checks if a detected peak sits on one
2. **Sabine-only RT60** — overestimates in absorptive rooms, distorting Q_room comparisons
3. **Global prominence floor** — 10 dB applies equally at 80 Hz (where room modes are broad) and 8 kHz (where feedback is sharp)
4. **No decay rate analysis** — can't distinguish room mode (exponential decay) from feedback (instant drop)
5. **No mode clustering detection** — multiple nearby peaks treated independently instead of as coupled modes
6. **No air absorption correction** — high-frequency Q_room calculation ignores atmospheric damping

## Changes (5 files + version bump)

### 1. acousticUtils.ts — Four New Functions

**Room Mode Proximity Penalty:**
- Calculate all room modes via existing `calculateRoomModes()`
- Compute per-mode bandwidth: `Δf_3dB = 6.9 / (π × RT60)` (Hopkins §1.2.6.3)
- Peak within ±Δf_3dB of any mode → delta = -0.15
- Peak within ±2×Δf_3dB → delta = -0.08
- Only runs when `roomModesEnabled && roomLengthM > 0`

**Eyring RT60 Estimation:**
- `RT60_eyring = 0.161 × V / (-S × ln(1 - α))` — more accurate than Sabine for α > 0.2
- Used as `min(Sabine, Eyring)` in `getRoomParametersFromDimensions()`
- Feeds into all downstream Q_room calculations

**Frequency-Dependent Prominence:**
- Uses modal density n(f) from existing `calculateModalDensity()`
- Sparse n(f) → prominence *= `1 + 0.5/max(n(f), 0.1)` (capped at ×1.5)
- Dense n(f) → base prominence unchanged
- Applied in `shouldReportIssue()` instead of fixed floor

**Air Absorption Corrected RT60:**
- Hopkins §1.2.4: air absorption coefficient `m` increases with f²
- `m ≈ 5.5e-4 × (f/1000)^1.7` at 50% RH, 20°C (simplified fit)
- `RT60_corrected = RT60 / (1 + 4mV/S × RT60)`
- Applied to `reverberationQAdjustment()` for f > 2 kHz

### 2. classifier.ts — Three New Classification Checks

**Room Mode Proximity Check (after Schroeder boundary check):**
- Calls `roomModeProximityPenalty()` when room dimensions available
- Applies pFeedback delta + adds reason string

**Frequency-Dependent Prominence Floor (in shouldReportIssue):**
- Replaces fixed `< 10` check with `frequencyDependentProminence()`
- Low freq: needs ~13-15 dB prominence (room modes are broad)
- Mid freq: 10 dB (unchanged)
- High freq: 10 dB (unchanged — air absorption makes sharp peaks MORE suspicious)

**Mode Clustering Detection (new check in classifyTrack):**
- Accepts active track frequencies as parameter
- Counts neighbors within 3× bandwidth
- 2+ neighbors → pFeedback -= 0.12 (coupled modes, not multiple feedbacks)

### 3. dspWorker.ts — Peak Decay Rate Analysis

**New state:**
- `recentDecays` Map: binIndex → { lastAmplitudeDb, clearTime }

**On clearPeak:** Record last amplitude and timestamp

**On next processFrame:** For recently cleared bins still showing energy:
- Compute actual decay rate vs expected decay rate (60/RT60 dB/sec)
- If actual ≈ expected (within 50%): extend band cooldown (room mode signature)
- If actual >> expected (instant drop): normal cooldown (feedback signature)

### 4. trackManager.ts — Return Amplitude on Clear

- `clearTrack()` returns the track's last amplitude so dspWorker can record it

### 5. package.json — Version Bump

- 1.0.4 → 1.0.5

## Implementation Order

1. `acousticUtils.ts` — all new functions (no deps)
2. `classifier.ts` — room mode filter, freq-dependent thresholds, mode clustering (deps: 1)
3. `dspWorker.ts` + `trackManager.ts` — decay rate analysis (deps: 1)
4. `package.json` — version bump
5. Verify: `npx tsc --noEmit`

## Verification

1. `npx tsc --noEmit` — zero type errors
2. Manual: muted mic → no advisories appear
3. Manual: low-frequency hum near room mode → reduced false positive rate
4. Manual: feedback tone → still detected normally
5. Manual: two close low-frequency tones → single advisory (mode cluster)
6. Manual: high-frequency feedback (8 kHz) → detected with higher confidence
7. Manual: sustained tone then cut → no re-trigger within cooldown
