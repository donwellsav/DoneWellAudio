# EQ Advisor Pro Convention Upgrade

**Date:** 2026-03-05
**Status:** Approved
**Scope:** Quick wins + PHPR detection (Approach 2)

## Problem

The EQ advisor's recommendations don't match professional feedback suppressor conventions:
- Q values capped at 16/32 (pro gear uses 60-116)
- Cut depth is flat across all frequencies (ignores psychoacoustic masking)
- Q display doesn't match industry convention (bandwidth in Hz)
- No Peak-to-Harmonic Power Ratio detection for feedback vs. music discrimination

## Research Sources

| Source | Key Finding |
|--------|-------------|
| dbx AFS technical docs | Ultra-narrow notches Q=60-116, measure Q from 0 dB |
| Psychoacoustic ERB formula | Notches narrower than ERB are perceptually transparent |
| Van Waterschoot & Moenen 2011 | PHPR: feedback is sinusoidal (no harmonics) vs music (rich harmonics) |
| Bristow-Johnson Audio EQ Cookbook | Gold standard biquad formulas (future work) |

## Design

### 1. Higher Q Values

**Constants changes (`lib/dsp/constants.ts`):**

```
EQ_PRESETS.surgical: defaultQ 8->30, runawayQ 16->60
EQ_PRESETS.heavy:    defaultQ 4->16, runawayQ 8->30
```

**Advisor changes (`lib/dsp/eqAdvisor.ts`):**

```
calculateQ() clamp: (2, 32) -> (2, 120)
```

The measured `qEstimate` from `estimateQ()` already goes up to 500.
The advisor was artificially clamping it. Higher ceiling lets truly narrow
feedback peaks get appropriately narrow recommendations.

### 2. ERB-Scaled Cut Depth

New utility function in `eqAdvisor.ts`:

```
ERB(f) = 24.7 * (4.37 * f/1000 + 1)
```

Scaling applied to `calculateCutDepth()` output:
- Below 500 Hz: reduce depth by up to 30% (protect warmth)
- 500-2000 Hz: no adjustment (speech range, full depth)
- Above 2000 Hz: allow up to 20% deeper (notch is more transparent)

New `ERB_SETTINGS` constants block for tunable parameters.

### 3. Q Display Convention

Keep Q as the primary display format (engineers know Q).
Add `bandwidthHz` to `PEQRecommendation` type for future tooltip/detail views.
Data model enriched, UI format unchanged: `PEQ Q60 -9dB`.

### 4. PHPR Detection

**New function** `calculatePHPR(freqBin, spectrum, fftSize)` in `feedbackDetector.ts`:
- Checks power at 2x, 3x, 4x harmonic bins (+-1 bin tolerance)
- Returns ratio in dB: high = pure tone (feedback), low = harmonics (music)

**Integration:** Called in `detectPeaks()` after `estimateQ()`. Result stored on peak as `phpr: number`.

**Classifier boost** (soft, not hard gate):
- PHPR > 15 dB: +0.10 confidence (likely feedback)
- PHPR < 8 dB: -0.10 confidence (likely music/speech)

**New constants:**
```typescript
PHPR_SETTINGS = {
  NUM_HARMONICS: 3,
  BIN_TOLERANCE: 1,
  FEEDBACK_THRESHOLD_DB: 15,
  MUSIC_THRESHOLD_DB: 8,
  CONFIDENCE_BOOST: 0.10,
  CONFIDENCE_PENALTY: 0.10,
}
```

## Files Modified

| File | Changes |
|------|---------|
| `lib/dsp/constants.ts` | Raise EQ_PRESETS Q values, add ERB_SETTINGS, add PHPR_SETTINGS |
| `lib/dsp/eqAdvisor.ts` | ERB scaling function, raise Q clamp, pass bandwidthHz through |
| `lib/dsp/feedbackDetector.ts` | Add calculatePHPR(), call in detectPeaks() |
| `lib/dsp/classifier.ts` | PHPR confidence boost/penalty |
| `types/advisory.ts` | Add bandwidthHz to PEQRecommendation, add phpr to peak types |
| `components/analyzer/HelpMenu.tsx` | Update Q values in documentation |

## Decisions

- **Q display stays as Q** (not bandwidth) per user preference
- **PHPR is a soft confidence boost**, not a hard gate (avoids false negatives)
- **ERB scaling is multiplicative** on existing severity-based depth (not additive)
- **bandwidthHz added to data model** for future use, not displayed in primary UI
