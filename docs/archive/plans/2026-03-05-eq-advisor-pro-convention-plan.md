# EQ Advisor Pro Convention Upgrade — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade EQ recommendations to match professional feedback suppressor conventions — higher Q, ERB-scaled depth, bandwidth data, and PHPR detection.

**Architecture:** Four independent changes to the DSP pipeline: (1) raise Q ceiling in constants + advisor, (2) add ERB-scaled depth function in advisor, (3) add bandwidthHz to PEQ data model, (4) add PHPR calculation in detector + confidence boost in classifier. Changes are layered — each builds on the previous but touches different functions.

**Tech Stack:** TypeScript, Web Audio API (AnalyserNode FFT data), React 19

---

### Task 1: Create feature branch

**Files:** None

**Step 1: Create and checkout branch**

```bash
git checkout -b feat/eq-pro-convention
```

**Step 2: Verify clean state**

```bash
git status
```

Expected: `On branch feat/eq-pro-convention`, nothing to commit.

---

### Task 2: Raise Q ceiling in constants

**Files:**
- Modify: `lib/dsp/constants.ts:169-184` (EQ_PRESETS)

**Step 1: Update surgical preset Q values**

In `lib/dsp/constants.ts`, change `EQ_PRESETS.surgical`:

```typescript
surgical: {
  defaultQ: 30,          // was 8 — matches pro feedback suppressor range
  runawayQ: 60,          // was 16 — ultra-narrow notch for runaway (dbx AFS convention)
  maxCut: -18,
  moderateCut: -9,
  lightCut: -4,
},
```

**Step 2: Update heavy preset Q values**

```typescript
heavy: {
  defaultQ: 16,          // was 4 — broader but still pro-grade
  runawayQ: 30,          // was 8 — narrower than old surgical default
  maxCut: -12,
  moderateCut: -6,
  lightCut: -3,
},
```

**Step 3: Verify build**

```bash
npx tsc --noEmit
```

Expected: No errors.

**Step 4: Commit**

```bash
git add lib/dsp/constants.ts
git commit -m "feat(eq): raise Q presets to pro convention (30/60 surgical, 16/30 heavy)"
```

---

### Task 3: Raise Q clamp in advisor + add ERB constants

**Files:**
- Modify: `lib/dsp/eqAdvisor.ts:132-154` (calculateQ function)
- Modify: `lib/dsp/constants.ts` (add ERB_SETTINGS block)

**Step 1: Add ERB_SETTINGS to constants.ts**

Add after the existing `EQ_PRESETS` block (after line 184):

```typescript
// ERB (Equivalent Rectangular Bandwidth) settings for frequency-dependent EQ depth
// Based on Glasberg & Moore (1990): ERB(f) = 24.7 * (4.37 * f/1000 + 1)
// Notches narrower than one ERB are psychoacoustically transparent
export const ERB_SETTINGS = {
  /** Below this frequency, reduce cut depth to protect warmth */
  LOW_FREQ_HZ: 500,
  /** Above this frequency, allow deeper cuts (notch more transparent) */
  HIGH_FREQ_HZ: 2000,
  /** Max depth reduction factor for low frequencies (0.7 = 30% shallower) */
  LOW_FREQ_SCALE: 0.7,
  /** Max depth increase factor for high frequencies (1.2 = 20% deeper) */
  HIGH_FREQ_SCALE: 1.2,
} as const
```

**Step 2: Raise Q clamp in calculateQ()**

In `lib/dsp/eqAdvisor.ts`, update `calculateQ()` function (lines 132-154):

Change line 150 from:
```typescript
  const measuredQ = clamp(trackQ, 2, 32)
```
to:
```typescript
  const measuredQ = clamp(trackQ, 2, 120)
```

Change line 153 from:
```typescript
  return clamp(blendedQ, 2, 32)
```
to:
```typescript
  return clamp(blendedQ, 2, 120)
```

Also update the comments on lines 139 and 142 to reflect new values:
- Line 139: `baseQ = presetConfig.runawayQ // 60 or 30`
- Line 142: `baseQ = presetConfig.defaultQ // 30 or 16`

**Step 3: Verify build**

```bash
npx tsc --noEmit
```

Expected: No errors.

**Step 4: Commit**

```bash
git add lib/dsp/constants.ts lib/dsp/eqAdvisor.ts
git commit -m "feat(eq): raise Q clamp to 120, add ERB_SETTINGS constants"
```

---

### Task 4: Implement ERB-scaled cut depth

**Files:**
- Modify: `lib/dsp/eqAdvisor.ts` (add erbDepthScale function, integrate into calculateCutDepth)
- Modify: `lib/dsp/eqAdvisor.ts:65-98` (calculateCutDepth)

**Step 1: Add ERB utility function**

Add after the imports in `eqAdvisor.ts` (after line 19), importing ERB_SETTINGS:

Update the import on line 4:
```typescript
import { ISO_31_BANDS, EQ_PRESETS, ERB_SETTINGS, SPECTRAL_TRENDS, VIZ_COLORS } from './constants'
```

Add new function after the `getTrackQ` helper (after line 31):

```typescript
/**
 * Calculate ERB (Equivalent Rectangular Bandwidth) at a given frequency.
 * Glasberg & Moore (1990): ERB(f) = 24.7 * (4.37 * f/1000 + 1)
 *
 * Notches narrower than one ERB are psychoacoustically transparent.
 * This means we can cut deeper at high frequencies (where ERB is wider
 * relative to the notch) and should cut shallower at low frequencies
 * (where our notch eats into audible bandwidth).
 */
export function calculateERB(frequencyHz: number): number {
  return 24.7 * (4.37 * frequencyHz / 1000 + 1)
}

/**
 * Frequency-dependent depth scaling based on ERB psychoacoustics.
 * Returns a multiplier for cut depth:
 * - Below 500 Hz: 0.7 (30% shallower — protect warmth)
 * - 500-2000 Hz: 1.0 (speech range, full depth)
 * - Above 2000 Hz: up to 1.2 (20% deeper — notch is more transparent)
 *
 * Smooth interpolation at boundaries via linear ramp.
 */
export function erbDepthScale(frequencyHz: number): number {
  if (frequencyHz <= ERB_SETTINGS.LOW_FREQ_HZ) {
    return ERB_SETTINGS.LOW_FREQ_SCALE
  }
  if (frequencyHz >= ERB_SETTINGS.HIGH_FREQ_HZ) {
    return ERB_SETTINGS.HIGH_FREQ_SCALE
  }
  // Linear interpolation between low and high boundaries
  const t = (frequencyHz - ERB_SETTINGS.LOW_FREQ_HZ) / (ERB_SETTINGS.HIGH_FREQ_HZ - ERB_SETTINGS.LOW_FREQ_HZ)
  return ERB_SETTINGS.LOW_FREQ_SCALE + t * (1.0 - ERB_SETTINGS.LOW_FREQ_SCALE)
}
```

**Step 2: Integrate ERB scaling into generatePEQRecommendation**

In `generatePEQRecommendation()` (line 183), change:
```typescript
  const suggestedDb = calculateCutDepth(severity, preset)
```
to:
```typescript
  const baseCut = calculateCutDepth(severity, preset)
  const suggestedDb = Math.round(baseCut * erbDepthScale(freqHz))
```

Also apply to `generateGEQRecommendation()` (line 165), change:
```typescript
  const suggestedDb = calculateCutDepth(severity, preset)
```
to:
```typescript
  const baseCut = calculateCutDepth(severity, preset)
  const suggestedDb = Math.round(baseCut * erbDepthScale(getTrackFrequency(track)))
```

**Step 3: Verify build**

```bash
npx tsc --noEmit
```

Expected: No errors.

**Step 4: Commit**

```bash
git add lib/dsp/eqAdvisor.ts
git commit -m "feat(eq): add ERB-scaled cut depth — shallower low-mids, deeper highs"
```

---

### Task 5: Add bandwidthHz to PEQ data model

**Files:**
- Modify: `types/advisory.ts:164-169` (PEQRecommendation interface)
- Modify: `lib/dsp/eqAdvisor.ts:177-206` (generatePEQRecommendation)

**Step 1: Add bandwidthHz field to PEQRecommendation**

In `types/advisory.ts`, update the interface (line 164-169):

```typescript
export interface PEQRecommendation {
  type: PEQType
  hz: number
  q: number
  gainDb: number
  /** -3dB bandwidth in Hz (from measured peak analysis) */
  bandwidthHz?: number
}
```

**Step 2: Pass bandwidthHz through in generatePEQRecommendation**

In `lib/dsp/eqAdvisor.ts`, update `generatePEQRecommendation()` to accept and pass bandwidth.

Change the function signature (line 177-181) to:
```typescript
export function generatePEQRecommendation(
  track: TrackInput,
  severity: SeverityLevel,
  preset: Preset
): PEQRecommendation {
```

Add bandwidth extraction after the Q calculation. After `const q = calculateQ(...)` line, add:
```typescript
  // Pass through measured bandwidth from detector (if available)
  const measuredBandwidth = 'bandwidthHz' in track ? track.bandwidthHz : undefined
```

Update the return to include bandwidthHz:
```typescript
  return {
    type,
    hz: freqHz,
    q,
    gainDb: suggestedDb,
    bandwidthHz: measuredBandwidth,
  }
```

**Step 3: Verify build**

```bash
npx tsc --noEmit
```

Expected: No errors.

**Step 4: Commit**

```bash
git add types/advisory.ts lib/dsp/eqAdvisor.ts
git commit -m "feat(eq): add bandwidthHz to PEQ recommendation data model"
```

---

### Task 6: Add PHPR constants and types

**Files:**
- Modify: `lib/dsp/constants.ts` (add PHPR_SETTINGS)
- Modify: `types/advisory.ts:51-77` (add phpr to DetectedPeak)

**Step 1: Add PHPR_SETTINGS to constants.ts**

Add after the new `ERB_SETTINGS` block:

```typescript
// PHPR (Peak-to-Harmonic Power Ratio) settings
// Van Waterschoot & Moonen (2011): feedback is sinusoidal (no harmonics),
// music/speech always has harmonics. High PHPR = likely feedback.
export const PHPR_SETTINGS = {
  /** Number of harmonics to check (2nd, 3rd, 4th) */
  NUM_HARMONICS: 3,
  /** Bin tolerance for FFT leakage (±1 bin around harmonic) */
  BIN_TOLERANCE: 1,
  /** PHPR above this (dB) → boost feedback confidence */
  FEEDBACK_THRESHOLD_DB: 15,
  /** PHPR below this (dB) → penalize feedback confidence */
  MUSIC_THRESHOLD_DB: 8,
  /** Confidence boost for high PHPR (pure tone) */
  CONFIDENCE_BOOST: 0.10,
  /** Confidence penalty for low PHPR (rich harmonics) */
  CONFIDENCE_PENALTY: 0.10,
} as const
```

**Step 2: Add phpr field to DetectedPeak**

In `types/advisory.ts`, add after the `bandwidthHz` field (line 76):

```typescript
  /** PHPR (Peak-to-Harmonic Power Ratio) in dB — high = pure tone (feedback), low = harmonics (music) */
  phpr?: number
```

**Step 3: Verify build**

```bash
npx tsc --noEmit
```

Expected: No errors (new fields are optional).

**Step 4: Commit**

```bash
git add lib/dsp/constants.ts types/advisory.ts
git commit -m "feat(eq): add PHPR constants and DetectedPeak.phpr type"
```

---

### Task 7: Implement calculatePHPR in feedbackDetector

**Files:**
- Modify: `lib/dsp/feedbackDetector.ts` (add calculatePHPR method, call in detectPeaks)

**Step 1: Add PHPR import**

At the top of `feedbackDetector.ts`, add `PHPR_SETTINGS` to the constants import.

**Step 2: Add calculatePHPR method to the FeedbackDetector class**

Add as a private method (near `estimateQ` around line 1046):

```typescript
  /**
   * Calculate PHPR (Peak-to-Harmonic Power Ratio) for a detected peak.
   * Feedback is sinusoidal (no harmonics), music has rich harmonics.
   *
   * PHPR = peakPower - mean(harmonicPowers) in dB
   * High PHPR (>15 dB) = likely feedback (pure tone)
   * Low PHPR (<8 dB) = likely music/speech (harmonics present)
   *
   * @param freqBin - FFT bin index of the peak
   * @returns PHPR in dB, or undefined if harmonics are out of FFT range
   */
  private calculatePHPR(freqBin: number): number | undefined {
    const spectrum = this.freqDb
    if (!spectrum) return undefined

    const n = spectrum.length
    const peakDb = spectrum[freqBin]
    let harmonicSum = 0
    let harmonicCount = 0

    for (let h = 2; h <= PHPR_SETTINGS.NUM_HARMONICS + 1; h++) {
      const harmonicBin = Math.round(freqBin * h)
      if (harmonicBin >= n) break // Harmonic out of FFT range

      // Find max within ±BIN_TOLERANCE (accounts for FFT leakage)
      let maxHarmonicDb = -Infinity
      const lo = Math.max(0, harmonicBin - PHPR_SETTINGS.BIN_TOLERANCE)
      const hi = Math.min(n - 1, harmonicBin + PHPR_SETTINGS.BIN_TOLERANCE)
      for (let b = lo; b <= hi; b++) {
        if (spectrum[b] > maxHarmonicDb) {
          maxHarmonicDb = spectrum[b]
        }
      }

      harmonicSum += maxHarmonicDb
      harmonicCount++
    }

    if (harmonicCount === 0) return undefined

    const meanHarmonicDb = harmonicSum / harmonicCount
    return peakDb - meanHarmonicDb
  }
```

**Step 3: Call calculatePHPR in detectPeaks**

In the `detectPeaks()` method, after the existing Q estimation (line 980-981):

```typescript
          peak.qEstimate = qEstimate
          peak.bandwidthHz = bandwidthHz
```

Add:
```typescript
          // PHPR (Peak-to-Harmonic Power Ratio) — feedback vs music discrimination
          peak.phpr = this.calculatePHPR(i)
```

**Step 4: Verify build**

```bash
npx tsc --noEmit
```

Expected: No errors.

**Step 5: Commit**

```bash
git add lib/dsp/feedbackDetector.ts
git commit -m "feat(eq): implement PHPR calculation in feedback detector"
```

---

### Task 8: Integrate PHPR into classifier

**Files:**
- Modify: `lib/dsp/classifier.ts` (add PHPR confidence boost/penalty)

**Step 1: Add PHPR_SETTINGS import**

Add `PHPR_SETTINGS` to the constants import at the top of `classifier.ts` (line 5).

**Step 2: Pass PHPR through normalizeTrackInput**

The classifier needs to read `phpr` from the track input. In the `normalizeTrackInput` function, the existing fields map track data into a flat `features` object. PHPR should be available on the Track/TrackedPeak input.

Add a `phpr` field to the returned features. In the Track branch (around line 38-51), add:
```typescript
      phpr: 'phpr' in input ? (input as Record<string, unknown>).phpr as number | undefined : undefined,
```

In the TrackedPeak branch (around line 54-68), add:
```typescript
      phpr: 'phpr' in input ? (input as Record<string, unknown>).phpr as number | undefined : undefined,
```

NOTE: The normalized features type will need to be extended. Check if there's an inline type or a named interface. If inline, add `phpr?: number` to the return type.

**Step 3: Add PHPR scoring in classifyTrack**

In `classifyTrack()`, add PHPR scoring after the existing harmonicity check (after line 125, the "2. Harmonicity" block):

```typescript
  // 2b. PHPR (Peak-to-Harmonic Power Ratio) — Van Waterschoot & Moonen 2011
  // Feedback is sinusoidal (no harmonics), music has rich harmonics
  if (features.phpr !== undefined) {
    if (features.phpr >= PHPR_SETTINGS.FEEDBACK_THRESHOLD_DB) {
      pFeedback += PHPR_SETTINGS.CONFIDENCE_BOOST
      reasons.push(`Pure tone (PHPR ${features.phpr.toFixed(0)} dB) — likely feedback`)
    } else if (features.phpr <= PHPR_SETTINGS.MUSIC_THRESHOLD_DB) {
      pInstrument += PHPR_SETTINGS.CONFIDENCE_PENALTY
      reasons.push(`Harmonics present (PHPR ${features.phpr.toFixed(0)} dB) — likely music/speech`)
    }
  }
```

**Step 4: Verify build**

```bash
npx tsc --noEmit
```

Expected: No errors.

**Step 5: Commit**

```bash
git add lib/dsp/classifier.ts
git commit -m "feat(eq): integrate PHPR as soft confidence boost in classifier"
```

---

### Task 9: Thread PHPR through worker to advisory output

**Files:**
- Modify: `lib/dsp/dspWorker.ts` (pass phpr from track to advisory)

**Step 1: Check how advisories are built in dspWorker**

The worker builds advisory objects from classified tracks. Find where `qEstimate` is passed (line ~757) and add `phpr` alongside it.

Add after the existing `bandwidthHz: track.bandwidthHz` line:
```typescript
        phpr: track.phpr,
```

**Step 2: Add phpr to Track interface if not already there**

In `types/advisory.ts`, check the `Track` interface (line 99+). If it doesn't have `phpr`, add:
```typescript
  /** PHPR (Peak-to-Harmonic Power Ratio) in dB */
  phpr?: number
```

**Step 3: Thread phpr in trackManager**

In `lib/dsp/trackManager.ts`, find where `qEstimate` and `bandwidthHz` are assigned from peak to track (in `createTrack` and `updateTrack`). Add `phpr` alongside:

In `createTrack` (around line 216-217):
```typescript
      phpr: peak.phpr,
```

In `updateTrack` (around line 263-264):
```typescript
    track.phpr = peak.phpr ?? track.phpr
```

**Step 4: Verify build**

```bash
npx tsc --noEmit
```

Expected: No errors.

**Step 5: Commit**

```bash
git add lib/dsp/dspWorker.ts lib/dsp/trackManager.ts types/advisory.ts
git commit -m "feat(eq): thread PHPR from detector through worker to advisory output"
```

---

### Task 10: Update HelpMenu documentation

**Files:**
- Modify: `components/analyzer/HelpMenu.tsx:753-765`

**Step 1: Update EQ Presets section**

Change the existing EQ Presets text (lines 757-763):

```tsx
                <div>
                  <p className="font-medium text-foreground mb-1">Surgical</p>
                  <p>Default Q: 30 | Runaway Q: 60</p>
                  <p>Max cut: -18 dB | Moderate: -9 dB | Light: -4 dB</p>
                </div>
                <div>
                  <p className="font-medium text-foreground mb-1">Heavy</p>
                  <p>Default Q: 16 | Runaway Q: 30</p>
                  <p>Max cut: -12 dB | Moderate: -6 dB | Light: -3 dB</p>
                </div>
```

**Step 2: Verify build**

```bash
npx tsc --noEmit
```

Expected: No errors.

**Step 3: Commit**

```bash
git add components/analyzer/HelpMenu.tsx
git commit -m "docs: update EQ preset values in HelpMenu to match new pro convention"
```

---

### Task 11: Full build verification

**Files:** None

**Step 1: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: No errors.

**Step 2: Production build**

```bash
pnpm build
```

Expected: Build succeeds with no errors.

**Step 3: Lint check**

```bash
pnpm lint
```

Expected: No lint errors (or only pre-existing warnings).

---

### Task 12: Version bump and changelog

**Files:**
- Modify: `package.json` (version bump)
- Modify: `lib/changelog.ts` (add changelog entry)

**Step 1: Bump version**

In `package.json`, update version from current to next patch (e.g., `1.0.66` → `1.0.67`).

**Step 2: Add changelog entry**

In `lib/changelog.ts`, add a new entry at the top of the `CHANGELOG` array:

```typescript
  {
    version: '1.0.67',
    date: '2026-03-05',
    highlights: 'Pro convention EQ recommendations',
    changes: [
      { type: 'feature', description: 'Raised PEQ Q values to pro convention (surgical Q60, heavy Q30) matching dbx AFS standards' },
      { type: 'feature', description: 'Added ERB-scaled cut depth \u2014 shallower cuts below 500 Hz to protect warmth, deeper above 2 kHz' },
      { type: 'feature', description: 'Added PHPR (Peak-to-Harmonic Power Ratio) detection for feedback vs. music discrimination' },
      { type: 'fix', description: 'Added bandwidth data to PEQ recommendations for future detail views' },
    ],
  },
```

NOTE: Check actual current version in package.json first — it may have been bumped by auto-versioning. Use the NEXT version number.

**Step 3: Verify build**

```bash
pnpm build
```

**Step 4: Commit**

```bash
git add package.json lib/changelog.ts
git commit -m "chore: bump to v1.0.67, add changelog for pro convention EQ upgrade"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Create branch | — |
| 2 | Raise Q presets | constants.ts |
| 3 | Raise Q clamp + ERB constants | eqAdvisor.ts, constants.ts |
| 4 | ERB-scaled depth | eqAdvisor.ts |
| 5 | bandwidthHz in data model | advisory.ts, eqAdvisor.ts |
| 6 | PHPR constants + types | constants.ts, advisory.ts |
| 7 | calculatePHPR implementation | feedbackDetector.ts |
| 8 | PHPR in classifier | classifier.ts |
| 9 | Thread PHPR through worker | dspWorker.ts, trackManager.ts, advisory.ts |
| 10 | Update HelpMenu docs | HelpMenu.tsx |
| 11 | Full build verification | — |
| 12 | Version bump + changelog | package.json, changelog.ts |
