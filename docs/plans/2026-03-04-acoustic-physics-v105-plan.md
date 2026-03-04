# Acoustic Physics Upgrade v1.0.5 — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Integrate Hopkins room acoustics research deeper into the DSP classifier to reduce false positives via room mode filtering, frequency-dependent thresholds, decay rate analysis, mode clustering, and air absorption correction.

**Architecture:** All changes are in the DSP pipeline (acousticUtils, classifier, worker, trackManager). No UI changes. The new acoustic functions are pure math with no side effects. The classifier calls them during classification. The decay analysis runs in the Web Worker on clearPeak events. No test framework — verify with `npx tsc --noEmit`.

**Tech Stack:** TypeScript, Web Audio API, Web Workers

---

### Task 1: New Acoustic Functions (acousticUtils.ts)

**Files:**
- Modify: `lib/dsp/acousticUtils.ts` (append 4 new functions + update getRoomParametersFromDimensions)

**Step 1: Add Eyring RT60 function (after getRoomParametersFromDimensions)**

```typescript
// ============================================================================
// EYRING RT60 — More accurate than Sabine for absorptive rooms
// ============================================================================

/**
 * Calculate Eyring RT60 — more accurate than Sabine when α > 0.2.
 * Formula: RT60 = 0.161 × V / (-S × ln(1 - α))
 *
 * Falls back to Sabine when α is very small (ln(1-α) ≈ -α).
 *
 * @param volume      - Room volume m³
 * @param surfaceArea - Total surface area m²
 * @param alpha       - Average absorption coefficient (0–1)
 */
export function calculateEyringRT60(volume: number, surfaceArea: number, alpha: number): number {
  if (volume <= 0 || surfaceArea <= 0 || alpha <= 0) return 1.0
  // Clamp alpha to prevent ln(0) — α = 1.0 means perfect absorption
  const clampedAlpha = Math.min(alpha, 0.99)
  const denominator = -surfaceArea * Math.log(1 - clampedAlpha)
  if (denominator <= 0) return 1.0
  return (0.161 * volume) / denominator
}
```

**Step 2: Update getRoomParametersFromDimensions to use min(Sabine, Eyring)**

```typescript
// In getRoomParametersFromDimensions, after the Sabine calculation:
// OLD:
  // Sabine's formula: RT60 = 0.161 * V / (alpha * S)
  const rt60 = surface > 0 ? (0.161 * volume) / (alpha * surface) : 1.0
// NEW:
  // Sabine's formula: RT60 = 0.161 * V / (alpha * S)
  const sabineRT60 = surface > 0 ? (0.161 * volume) / (alpha * surface) : 1.0
  // Eyring is more accurate for absorptive rooms (α > 0.2)
  const eyringRT60 = calculateEyringRT60(volume, surface, alpha)
  // Use the more conservative (shorter) estimate
  const rt60 = Math.min(sabineRT60, eyringRT60)
```

**Step 3: Add air absorption corrected RT60**

```typescript
// ============================================================================
// AIR ABSORPTION CORRECTION — Hopkins §1.2.4
// ============================================================================

/**
 * Apply air absorption correction to RT60 for high frequencies.
 *
 * Air absorbs sound energy proportional to f^~1.7. Below 2 kHz the effect
 * is negligible; above 4 kHz it significantly shortens effective RT60.
 *
 * Simplified fit for 20°C, 50% RH (typical indoor conditions):
 *   m ≈ 5.5e-4 × (f/1000)^1.7  (Np/m → absorption per meter)
 *
 * Corrected RT60 (Hopkins §1.2.4):
 *   RT60_corr = RT60 / (1 + 4mV × RT60 / S)
 *
 * @param rt60        - Uncorrected RT60 in seconds
 * @param frequencyHz - Frequency in Hz
 * @param volume      - Room volume m³
 * @param surfaceArea - Total surface area m² (estimated from volume if not given)
 */
export function airAbsorptionCorrectedRT60(
  rt60: number,
  frequencyHz: number,
  volume: number,
  surfaceArea?: number
): number {
  if (rt60 <= 0 || frequencyHz <= 0 || volume <= 0) return rt60
  // Below 2 kHz, air absorption is negligible
  if (frequencyHz < 2000) return rt60

  // Estimate surface area from volume if not provided (cube approximation)
  const sideLen = Math.pow(volume, 1 / 3) * 1.2
  const S = surfaceArea ?? 6 * sideLen * sideLen

  // Simplified air absorption coefficient at 20°C, 50% RH
  const fKHz = frequencyHz / 1000
  const m = 5.5e-4 * Math.pow(fKHz, 1.7) // Np/m

  // Corrected RT60
  const correction = 1 + (4 * m * volume * rt60) / S
  return rt60 / Math.max(correction, 1)
}
```

**Step 4: Add room mode proximity penalty**

```typescript
// ============================================================================
// ROOM MODE PROXIMITY PENALTY
// ============================================================================

/**
 * Check if a detected peak frequency coincides with a calculated room mode.
 *
 * Uses existing calculateRoomModes() to enumerate eigenfrequencies, then
 * checks if the detected peak falls within the -3 dB bandwidth of any mode.
 * Bandwidth from Hopkins §1.2.6.3: Δf_3dB = 6.9 / (π × RT60).
 *
 * @param frequencyHz - Detected peak frequency
 * @param roomLengthM - Room length in meters
 * @param roomWidthM  - Room width in meters
 * @param roomHeightM - Room height in meters
 * @param rt60        - Room RT60 in seconds
 * @returns delta to apply to pFeedback, plus reason string
 */
export function roomModeProximityPenalty(
  frequencyHz: number,
  roomLengthM: number,
  roomWidthM: number,
  roomHeightM: number,
  rt60: number
): { delta: number; reason: string | null } {
  if (roomLengthM <= 0 || roomWidthM <= 0 || roomHeightM <= 0 || rt60 <= 0) {
    return { delta: 0, reason: null }
  }

  // Only check up to 500 Hz — above that, room modes are too dense to be useful
  if (frequencyHz > 500) {
    return { delta: 0, reason: null }
  }

  // Mode bandwidth (Hopkins §1.2.6.3): Δf_3dB = 6.9 / (π × RT60)
  const bandwidth3dB = 6.9 / (Math.PI * rt60)

  const modes = calculateRoomModes(roomLengthM, roomWidthM, roomHeightM, 500)

  for (const mode of modes.all) {
    const distance = Math.abs(frequencyHz - mode.frequency)

    if (distance <= bandwidth3dB) {
      // Within -3 dB bandwidth — strong room mode match
      return {
        delta: -0.15,
        reason: `Peak ${frequencyHz.toFixed(0)} Hz matches room mode ${mode.label} (${mode.type}) at ${mode.frequency.toFixed(1)} Hz ±${bandwidth3dB.toFixed(1)} Hz`,
      }
    }

    if (distance <= 2 * bandwidth3dB) {
      // Within 2× bandwidth — mild room mode proximity
      return {
        delta: -0.08,
        reason: `Peak ${frequencyHz.toFixed(0)} Hz near room mode ${mode.label} at ${mode.frequency.toFixed(1)} Hz`,
      }
    }
  }

  return { delta: 0, reason: null }
}
```

**Step 5: Add frequency-dependent prominence threshold**

```typescript
// ============================================================================
// FREQUENCY-DEPENDENT PROMINENCE THRESHOLD
// ============================================================================

/**
 * Calculate a frequency-dependent prominence floor using modal density.
 *
 * In sparse modal regions (low frequency, small rooms), room modes can
 * look like sharp peaks.  Require higher prominence to confirm feedback.
 * In dense modal regions, the standard floor suffices.
 *
 * @param baseProminenceDb - Base prominence floor (e.g. 10 dB)
 * @param frequencyHz      - Frequency of the peak
 * @param roomVolume       - Room volume m³
 * @returns Adjusted prominence floor in dB
 */
export function frequencyDependentProminence(
  baseProminenceDb: number,
  frequencyHz: number,
  roomVolume: number
): number {
  if (frequencyHz <= 0 || roomVolume <= 0) return baseProminenceDb

  const nf = calculateModalDensity(frequencyHz, roomVolume)

  // In sparse regions (n(f) < 1), scale up the prominence requirement
  // Cap the multiplier at 1.5× to avoid over-suppression
  if (nf < 1.0) {
    const multiplier = Math.min(1 + 0.5 / Math.max(nf, 0.1), 1.5)
    return baseProminenceDb * multiplier
  }

  return baseProminenceDb
}
```

**Step 6: Commit**

```bash
git add lib/dsp/acousticUtils.ts
git commit -m "feat(dsp): add Eyring RT60, air absorption, room mode filter, freq-dependent prominence"
```

---

### Task 2: Classifier Upgrades (classifier.ts)

**Files:**
- Modify: `lib/dsp/classifier.ts` (add imports + 3 new checks)

**Step 1: Add new imports**

```typescript
// lib/dsp/classifier.ts — add to existing imports from acousticUtils:
import {
  calculateSchroederFrequency,
  getFrequencyBand,
  calculateModalOverlap,
  classifyModalOverlap,
  analyzeCumulativeGrowth,
  calculateCalibratedConfidence,
  analyzeVibrato,
  reverberationQAdjustment,
  modalDensityFeedbackAdjustment,
  roomModeProximityPenalty,        // NEW
  frequencyDependentProminence,    // NEW
  airAbsorptionCorrectedRT60,     // NEW
} from './acousticUtils'
```

**Step 2: Add room mode proximity check in classifyTrack (after Schroeder boundary check, line ~239)**

```typescript
// After the existing Schroeder boundary check:
  // 10a. Room mode proximity — compare against calculated eigenfrequencies
  if (settings?.roomModesEnabled && settings?.roomLengthM > 0 && settings?.roomWidthM > 0 && settings?.roomHeightM > 0) {
    const modeProximity = roomModeProximityPenalty(
      features.frequencyHz,
      settings.roomLengthM,
      settings.roomWidthM,
      settings.roomHeightM,
      roomRT60
    )
    if (modeProximity.delta !== 0) {
      pFeedback += modeProximity.delta
      if (modeProximity.reason) reasons.push(modeProximity.reason)
    }
  }
```

**Step 3: Update reverberationQAdjustment call to use air-absorption-corrected RT60 (line ~172)**

```typescript
// OLD (line ~171-177):
  {
    const rt60Adj = reverberationQAdjustment(features.minQ, features.frequencyHz, roomRT60)
// NEW:
  {
    // Apply air absorption correction for high frequencies (Hopkins §1.2.4)
    const effectiveRT60 = airAbsorptionCorrectedRT60(roomRT60, features.frequencyHz, roomVolume)
    const rt60Adj = reverberationQAdjustment(features.minQ, features.frequencyHz, effectiveRT60)
```

**Step 4: Add mode clustering detection in classifyTrack**

Add a new parameter to `classifyTrack` for active track frequencies, and add the clustering check.

First, update the function signature:

```typescript
// OLD:
export function classifyTrack(track: TrackInput, settings?: DetectorSettings): ClassificationResult {
// NEW:
export function classifyTrack(track: TrackInput, settings?: DetectorSettings, activeFrequencies?: number[]): ClassificationResult {
```

Then add the check after the modal density check (after line ~208):

```typescript
  // 8b. Mode clustering — 2+ peaks within 3× bandwidth suggest coupled room modes
  if (activeFrequencies && activeFrequencies.length > 1 && features.minQ > 0) {
    const bandwidth3dB = features.frequencyHz / features.minQ
    const clusterRadius = 3 * bandwidth3dB
    const neighbors = activeFrequencies.filter(f =>
      f !== features.frequencyHz && Math.abs(f - features.frequencyHz) <= clusterRadius
    ).length
    if (neighbors >= 2) {
      pFeedback -= 0.12
      reasons.push(`Mode cluster: ${neighbors + 1} peaks within ${clusterRadius.toFixed(0)} Hz — coupled modes`)
    }
  }
```

**Step 5: Replace fixed prominence floor in shouldReportIssue with frequency-dependent version**

```typescript
// OLD (line ~384-388):
  // Prominence floor — noise bursts rarely sustain 10 dB above neighbors
  // Raised from 8 dB to further eliminate noise spikes during active audio
  if (classification.prominenceDb !== undefined && classification.prominenceDb < 10) {
    return false
  }
// NEW:
  // Frequency-dependent prominence floor — sparse modal regions need higher prominence
  const prominenceFloor = frequencyDependentProminence(
    10, // base 10 dB
    classification.frequencyBand === 'LOW' ? 150 : classification.frequencyBand === 'HIGH' ? 6000 : 1000,
    settings.roomVolume ?? 250
  )
  if (classification.prominenceDb !== undefined && classification.prominenceDb < prominenceFloor) {
    return false
  }
```

Wait — we don't have the actual frequency in `shouldReportIssue`. We need to carry it through. Let's add the frequency to ClassificationResult instead.

Actually, looking at the existing code: `classification.frequencyBand` is already available, but the actual frequency is not. We need to either:
a) Add `frequencyHz` to ClassificationResult, or
b) Use the band as a proxy

Option (b) is simpler and sufficient. Let me revise:

```typescript
// NEW:
  // Frequency-dependent prominence floor — sparse modal regions need higher prominence
  {
    // Use representative frequency for the band
    const representativeFreq = classification.frequencyBand === 'LOW' ? 150 : classification.frequencyBand === 'HIGH' ? 6000 : 1000
    const prominenceFloor = frequencyDependentProminence(10, representativeFreq, settings.roomVolume ?? 250)
    if (classification.prominenceDb !== undefined && classification.prominenceDb < prominenceFloor) {
      return false
    }
  }
```

**Step 6: Update classifyTrackWithAlgorithms to pass activeFrequencies through**

```typescript
// OLD (line ~481):
  const baseResult = classifyTrack(track, settings)
// NEW:
  const baseResult = classifyTrack(track, settings, activeFrequencies)
```

And update classifyTrackWithAlgorithms signature:

```typescript
// OLD:
export function classifyTrackWithAlgorithms(
  track: Track | TrackedPeak,
  algorithmScores: AlgorithmScores | null,
  fusionResult: FusedDetectionResult | null,
  settings?: DetectorSettings
): ClassificationResult {
// NEW:
export function classifyTrackWithAlgorithms(
  track: Track | TrackedPeak,
  algorithmScores: AlgorithmScores | null,
  fusionResult: FusedDetectionResult | null,
  settings?: DetectorSettings,
  activeFrequencies?: number[]
): ClassificationResult {
```

**Step 7: Commit**

```bash
git add lib/dsp/classifier.ts
git commit -m "feat(dsp): add room mode filter, mode clustering, freq-dependent prominence, air absorption Q"
```

---

### Task 3: Decay Rate Analysis (dspWorker.ts + trackManager.ts)

**Files:**
- Modify: `lib/dsp/trackManager.ts:80` (clearTrack return value)
- Modify: `lib/dsp/dspWorker.ts:96` (add decay state)
- Modify: `lib/dsp/dspWorker.ts:736` (clearPeak handler)
- Modify: `lib/dsp/dspWorker.ts:~530` (processFrame decay check)
- Modify: `lib/dsp/dspWorker.ts:613` (pass activeFrequencies to classifier)

**Step 1: Update trackManager.clearTrack to return last amplitude**

```typescript
// lib/dsp/trackManager.ts line 80
// OLD:
  clearTrack(binIndex: number, timestamp: number): void {
    const trackId = this.binToTrackId.get(binIndex)
    if (!trackId) return

    const track = this.tracks.get(trackId)
    if (track) {
      track.isActive = false
      track.lastUpdateTime = timestamp
    }
  }
// NEW:
  clearTrack(binIndex: number, timestamp: number): number | null {
    const trackId = this.binToTrackId.get(binIndex)
    if (!trackId) return null

    const track = this.tracks.get(trackId)
    if (track) {
      const lastAmplitude = track.trueAmplitudeDb
      track.isActive = false
      track.lastUpdateTime = timestamp
      return lastAmplitude
    }
    return null
  }
```

**Step 2: Add decay tracking state in dspWorker.ts (after lastAdvisoryCreatedAt)**

```typescript
// lib/dsp/dspWorker.ts after line ~100
// NEW:
// Decay rate analysis — tracks recently cleared peaks to analyze their decay signature
// Room modes decay exponentially (following RT60); feedback drops instantly
const recentDecays = new Map<number, { lastAmplitudeDb: number; clearTime: number; frequencyHz: number }>()
const DECAY_ANALYSIS_WINDOW_MS = 500 // Analyze decay for 500ms after clear
```

**Step 3: Record decay data in clearPeak handler**

```typescript
// lib/dsp/dspWorker.ts in clearPeak handler (line ~736)
// OLD:
    case 'clearPeak': {
      const { binIndex, frequencyHz, timestamp } = msg
      trackManager.clearTrack(binIndex, timestamp)
// NEW:
    case 'clearPeak': {
      const { binIndex, frequencyHz, timestamp } = msg
      const lastAmplitude = trackManager.clearTrack(binIndex, timestamp)
      // Record for decay analysis
      if (lastAmplitude !== null) {
        recentDecays.set(binIndex, { lastAmplitudeDb: lastAmplitude, clearTime: timestamp, frequencyHz })
      }
```

**Step 4: Add decay analysis in processPeak (after peak processing, before break)**

Actually, decay analysis should run in the processFrame message handler, not processPeak. Let me find the right location. The `processFrame` handler dispatches `processPeak` for each peak. After processing all peaks, we should check recent decays.

```typescript
// In the processFrame handler, after all peaks are processed and before the final break:
// Add decay analysis for recently cleared bins
{
  const rt60 = settings?.roomRT60 ?? 1.2
  const roomVolume = settings?.roomVolume ?? 250
  const now = msg.timestamp ?? Date.now()
  const expiredBins: number[] = []

  for (const [binIndex, decay] of recentDecays) {
    const elapsed = now - decay.clearTime
    if (elapsed > DECAY_ANALYSIS_WINDOW_MS) {
      expiredBins.push(binIndex)
      continue
    }
    // Check if this bin still has energy in the current spectrum
    if (msg.spectrum && binIndex < msg.spectrum.length) {
      const currentDb = msg.spectrum[binIndex]
      if (currentDb > -100) { // Still measurable
        const elapsedSec = elapsed / 1000
        if (elapsedSec > 0.05) { // Need at least 50ms for meaningful rate
          const actualDecayRate = (decay.lastAmplitudeDb - currentDb) / elapsedSec // dB/sec
          const expectedDecayRate = 60 / rt60 // dB/sec for RT60 exponential decay
          // If actual decay is within 50% of expected → room mode signature
          // Extend band cooldown to suppress re-trigger
          if (actualDecayRate > 0 && actualDecayRate < expectedDecayRate * 1.5) {
            // Decaying like a room mode — find the GEQ band and extend cooldown
            const geqBandIndex = Math.round(Math.log2(decay.frequencyHz / 31.25) * 3) // Approximate 1/3 oct
            bandClearedAt.set(geqBandIndex, now) // Refresh cooldown
          }
        }
      }
    }
  }
  // Clean up expired entries
  for (const bin of expiredBins) {
    recentDecays.delete(bin)
  }
}
```

**Step 5: Pass activeFrequencies to classifier in processPeak**

```typescript
// lib/dsp/dspWorker.ts line ~613
// OLD:
      const classification = classifyTrackWithAlgorithms(track, algorithmScores, fusionResult, settings)
// NEW:
      const activeFrequencies = trackManager.getRawTracks().map(t => t.trueFrequencyHz)
      const classification = classifyTrackWithAlgorithms(track, algorithmScores, fusionResult, settings, activeFrequencies)
```

**Step 6: Reset decay state on init/reset**

```typescript
// At each location where bandClearedAt.clear() and lastAdvisoryCreatedAt = 0:
// ADD:
      recentDecays.clear()
```

**Step 7: Commit**

```bash
git add lib/dsp/trackManager.ts lib/dsp/dspWorker.ts
git commit -m "feat(dsp): add decay rate analysis and pass active frequencies to classifier"
```

---

### Task 4: Version Bump (package.json)

**Files:**
- Modify: `package.json:3`

**Step 1: Bump version**

```json
// OLD:
  "version": "1.0.4",
// NEW:
  "version": "1.0.5",
```

**Step 2: Commit**

```bash
git add package.json
git commit -m "chore: bump version to 1.0.5"
```

---

### Task 5: Type Check

**Step 1: Run TypeScript compiler**

```bash
npx tsc --noEmit
```

Expected: Clean exit, no errors.

**Step 2: If errors, fix and re-commit to the relevant task's file**

---

### Task 6: Push + PR

**Step 1: Push branch**

```bash
git push origin v1.0.3-release
```

**Step 2: Create PR**

```bash
gh pr create --title "Acoustic physics upgrade: room mode filter, decay analysis (v1.0.5)" --body "$(cat <<'EOF'
## Summary
- Add room mode proximity penalty — compare detected peaks against calculated eigenfrequencies (Hopkins §1.2.6)
- Add Eyring RT60 estimation — more accurate than Sabine for absorptive rooms
- Add air absorption correction — high-frequency RT60 adjustment (Hopkins §1.2.4)
- Add frequency-dependent prominence floor — sparse modal regions need higher prominence
- Add mode clustering detection — coupled modes penalize feedback probability
- Add peak decay rate analysis — room modes decay exponentially, feedback drops instantly
- Pass active frequencies to classifier for inter-peak analysis

## Test plan
- [ ] `npx tsc --noEmit` passes clean
- [ ] Muted mic → no advisories appear
- [ ] Low-frequency hum near room mode → reduced false positive rate
- [ ] Feedback tone → still detected normally
- [ ] Two close low-frequency tones → mode cluster penalty applied
- [ ] High-frequency feedback (8 kHz) → detected with higher confidence
- [ ] Sustained tone then cut → decay analysis extends cooldown for room-mode-like decay

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
