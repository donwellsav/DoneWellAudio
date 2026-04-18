# Region-Aware Q Pipeline Audit

## Scope

This note documents the live `feedbackDetector -> worker -> fusion -> classifier -> advisory` path and the exact Q weaknesses that the current rework fixes.

It is an internal engineering note. It is not operator help copy.

## Source Priority

- Primary policy source for Q-width behavior:
  `research/feedback-prevention-and-suppression-pdf-assessment.md`
- Filter-theory support only:
  `research/filtutv1-ppt-assessment.md`

The dbx paper is the stronger source for deciding when a hotspot behaves like one narrow offender versus a broader unstable region. The `filtutv1.ppt` deck is useful background for sharpness, phase, and implementation tradeoffs, but it is not strong authority for live-sound notch-width policy.

## Live Path

1. `lib/dsp/feedbackDetector.ts`
   Main-thread detector measures peaks, prominence, PHPR, persistence, MSD, and a detector-side Q estimate.
2. `lib/dsp/dspWorker.ts`
   Ships the detected peak plus transferred FFT buffers into the worker.
3. `lib/dsp/advancedDetection.ts`
   Worker computes algorithm scores and fusion output.
4. `lib/dsp/classifier.ts`
   Track-level features and fused scores are classified into feedback / possible ring / non-feedback outcomes.
5. `lib/dsp/eqAdvisor.ts`
   Generates GEQ, PEQ, shelf, and pitch advice.
6. `lib/dsp/advisoryManager.ts`
   Deduplicates nearby events, merges same-band issues, and updates the advisory card payload that reaches the UI and Companion relay.

## Current Q Weak Points Found In Code

### 1. Raw `-3 dB` width measurement in `frequencyAnalysis.ts`

The detector derives peak width directly from `-3 dB` crossings. That is fine as a measurement input, but it has three failure modes:

- full crossing on both sides,
- one-sided crossing that gets mirrored,
- no crossing at all, which falls back to a synthetic one-bin width.

The old code only returned `qEstimate` and `bandwidthHz`, so downstream logic could not tell the difference between a solid bandwidth read and a guessed one.

### 2. Single-frame `track.qEstimate` handoff

`trackManager.ts` stores the current detector Q on the track, but the advisory path mainly consumes the latest single-frame `track.qEstimate`.

That is too brittle. One hot frame can make a region look much narrower than it really is, especially when the width measurement was mirrored or defaulted.

### 3. `calculateQ()` synthetic SNR blend in `eqAdvisor.ts`

The old recommendation path blended preset Q with a synthetic SNR estimate derived from peak level. That made recommendation width depend on an inferred cleanliness signal instead of the actual reliability of the bandwidth measurement.

It also kept a wider internal range than the PA2-safe path, which meant the app and hardware path were not using one shared Q policy.

### 4. Post-hoc cluster widening in `advisoryManager.ts`

Clustered hotspots were widened later, after the first advisory had already been created with a narrower policy.

That was directionally correct, but the broad-region reasoning lived too late in the chain. The result was a recommendation path that could first over-trust a narrow notch and only later widen it when multiple nearby detections piled up.

## Policy Direction From Existing Research

The dbx assessment supports three practical rules:

- a repeated cluster in one area can indicate a broader unstable region, not many unrelated razor-thin tones,
- low-frequency recurrence is more likely to need conservative width,
- narrow notches preserve tone only when they are actually wide enough to cover the unstable region.

The PPT assessment supports the background caution that sharper filters bring phase and implementation tradeoffs, but it does not decide live-sound notch width by itself.

## Implementation Direction

This rework makes Q recommendation depend on:

- severity and preset baseline inside `4..16`,
- trusted measured width only when the detector has a full bandwidth read,
- broader-region cluster bounds when nearby detections merge,
- low-frequency and incomplete-measurement guard rails,
- recurrence widening before the final clamp.

The app remains analysis-only. Nothing here changes live audio output. It only changes the recommendation path and the explanation attached to that recommendation.
