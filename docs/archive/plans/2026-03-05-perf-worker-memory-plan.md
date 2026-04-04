# Approach C: Worker + Memory Optimization Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate 6-10ms/frame of wasted computation across the DSP worker, track management, and memory allocation paths.

**Architecture:** Three layers of optimizations applied sequentially: Layer 1 (main thread buffer management), Layer 2 (worker bridge caching), Layer 3 (DSP internals). Build + verify between each layer.

**Tech Stack:** TypeScript, Web Workers, Float32Array, Path2D, Web Audio API

**Note:** Fix #1 (zero-copy transfer) was downgraded — `getSpectrum()` returns a persistent buffer reused by `getFloatFrequencyData()`, so `.slice()` is necessary. Fix #9 (localStorage debounce) was dropped — localStorage writes only happen on user-triggered actions or advisory events, not in the hot path.

---

## Task 1: Cache getRawTracks in TrackManager

**Files:**
- Modify: `lib/dsp/trackManager.ts:18-108`

**Step 1: Add cached active tracks array**

In `TrackManager` class, add a private field after the existing fields (line ~24):

```typescript
private _activeTracksCache: Track[] = []
```

**Step 2: Update getRawTracks to return cached reference**

Replace lines 106-108:

```typescript
// OLD:
getRawTracks(): Track[] {
  return Array.from(this.tracks.values()).filter(t => t.isActive)
}

// NEW:
getRawTracks(): Track[] {
  return this._activeTracksCache
}
```

**Step 3: Invalidate cache on track state changes**

Add a private method:

```typescript
private _rebuildActiveCache(): void {
  this._activeTracksCache = Array.from(this.tracks.values()).filter(t => t.isActive)
}
```

Call `this._rebuildActiveCache()` at the end of:
- `processPeak()` (after returning from updateTrack or createTrack — add call before the return)
- `clearTrack()` (after setting `track.isActive = false`)
- `pruneInactiveTracks()` (after the prune loop)
- Any reset/clear method

**Step 4: Run `npx tsc --noEmit`**

Expected: PASS — interface unchanged, only implementation detail changes.

**Step 5: Commit**

```bash
git add lib/dsp/trackManager.ts
git commit -m "perf: cache active tracks in TrackManager, O(1) getRawTracks"
```

---

## Task 2: Deduplicate getRawTracks calls in dspWorker peak loop

**Files:**
- Modify: `lib/dsp/dspWorker.ts:619-660`

**Step 1: Hoist getRawTracks before the algorithm computation block**

Find the section around line 619-625 where `activeTracks` and `peakFrequencies` are computed:

```typescript
// EXISTING (line ~621):
const activeTracks = trackManager.getRawTracks()
const peakFrequencies = activeTracks.map(t => t.trueFrequencyHz)
const combResult = peakFrequencies.length >= 3
  ? detectCombPattern(peakFrequencies, sampleRate)
  : null
```

Then find the duplicate call at line ~659:

```typescript
// EXISTING (line ~659):
const activeFrequencies = trackManager.getRawTracks().map(t => t.trueFrequencyHz)
const classification = classifyTrackWithAlgorithms(track, algorithmScores, fusionResult, settings, activeFrequencies)
```

**Replace line ~659** with:

```typescript
// REUSE peakFrequencies from line 622 instead of calling getRawTracks() again
const classification = classifyTrackWithAlgorithms(track, algorithmScores, fusionResult, settings, peakFrequencies)
```

**Step 2: Run `npx tsc --noEmit`**

Expected: PASS — `peakFrequencies` has same type as `activeFrequencies` (both `number[]`).

**Step 3: Commit**

```bash
git add lib/dsp/dspWorker.ts
git commit -m "perf: reuse cached peakFrequencies, eliminate duplicate getRawTracks"
```

---

## Task 3: Add advisory band lookup index

**Files:**
- Modify: `lib/dsp/dspWorker.ts`

**Step 1: Add band index Map alongside the advisories Map**

Find the advisories Map declaration (around line 100-110) and add:

```typescript
const advisoriesByBand = new Map<number, string>() // GEQ band index → advisory ID
```

**Step 2: Update advisory insertion to maintain the index**

In the advisory creation section (around line 773 where `advisories.set(advisoryId, advisory)`) add:

```typescript
advisoriesByBand.set(eqAdvisory.geq.bandIndex, advisoryId)
```

**Step 3: Update advisory deletion to maintain the index**

Wherever `advisories.delete(...)` is called, also clear the band index. Find occurrences:
- Line ~682: `advisories.delete(existingId)` — add `advisoriesByBand.delete(advisory.advisory?.geq?.bandIndex)`
- Line ~739: `advisories.delete(dup.id)` — add `advisoriesByBand.delete(dup.advisory?.geq?.bandIndex)`

Also add `advisoriesByBand.clear()` wherever `advisories.clear()` is called (in init/reset handlers).

**Step 4: Replace `findAdvisoryForSameBand` linear scan**

Replace the function body (lines 179-185):

```typescript
// OLD:
function findAdvisoryForSameBand(bandIndex: number, excludeTrackId?: string): Advisory | null {
  for (const advisory of advisories.values()) {
    if (excludeTrackId && advisory.trackId === excludeTrackId) continue
    if (advisory.advisory?.geq?.bandIndex === bandIndex) return advisory
  }
  return null
}

// NEW:
function findAdvisoryForSameBand(bandIndex: number, excludeTrackId?: string): Advisory | null {
  const advisoryId = advisoriesByBand.get(bandIndex)
  if (!advisoryId) return null
  const advisory = advisories.get(advisoryId)
  if (!advisory) return null
  if (excludeTrackId && advisory.trackId === excludeTrackId) return null
  return advisory
}
```

**Step 5: Run `npx tsc --noEmit`**

Expected: PASS.

**Step 6: Commit**

```bash
git add lib/dsp/dspWorker.ts
git commit -m "perf: O(1) advisory band lookup via index Map"
```

---

## Task 4: Conditional FFT phase computation

**Files:**
- Modify: `lib/dsp/dspWorker.ts:542-549`

**Step 1: Gate phase computation on track feedback likelihood**

Replace lines 542-549:

```typescript
// OLD:
// Phase coherence: extract phase angles from time-domain waveform via FFT
// and feed to PhaseHistoryBuffer (KU Leuven 2025 algorithm)
if (msg.timeDomain && phaseBuffer) {
  const phases = computePhaseAngles(msg.timeDomain)
  if (phases) {
    phaseBuffer.addFrame(phases)
  }
}

// NEW:
// Phase coherence: conditionally extract phase angles via FFT
// Skip expensive O(N log N) computation unless any track shows feedback signatures
if (msg.timeDomain && phaseBuffer) {
  const activeTracks = trackManager.getRawTracks()
  const needsPhase = activeTracks.some(t =>
    t.velocityDbPerSec > 3 || t.qEstimate > 30 || (t.features?.msdScore ?? 0) > 0.5
  )
  if (needsPhase) {
    const phases = computePhaseAngles(msg.timeDomain)
    if (phases) {
      phaseBuffer.addFrame(phases)
    }
  }
}
```

**Note:** Check the actual field name for MSD score on the Track type — it may be `msd` or `msdScore` or stored in `track.features`. Verify with `types/advisory.ts`.

**Step 2: Run `npx tsc --noEmit`**

Expected: PASS.

**Step 3: Commit**

```bash
git add lib/dsp/dspWorker.ts
git commit -m "perf: skip FFT phase computation on quiet frames"
```

---

## Task 5: Ring buffer for classification label smoothing

**Files:**
- Modify: `lib/dsp/dspWorker.ts:131,278-310`

**Step 1: Replace the label history data structure**

Change the Map type and smoothing function (around lines 131, 278-310):

```typescript
// OLD (line 131):
const classificationLabelHistory = new Map<string, string[]>()

// NEW:
interface LabelRingBuffer {
  labels: string[]
  idx: number
  count: number  // actual items added (may be < capacity)
}
const classificationLabelHistory = new Map<string, LabelRingBuffer>()
const LABEL_HISTORY_CAPACITY = CLASSIFICATION_SMOOTHING_FRAMES * 3
```

**Step 2: Rewrite `smoothClassificationLabel`**

Replace the function body to use ring buffer semantics:

```typescript
function smoothClassificationLabel(
  trackId: string,
  newLabel: string,
  severity: string
): string {
  // Safety-critical: RUNAWAY and GROWING always pass through immediately
  if (severity === 'RUNAWAY' || severity === 'GROWING') {
    classificationLabelHistory.delete(trackId)
    return newLabel
  }

  let ring = classificationLabelHistory.get(trackId)
  if (!ring) {
    ring = { labels: new Array(LABEL_HISTORY_CAPACITY), idx: 0, count: 0 }
    classificationLabelHistory.set(trackId, ring)
  }

  ring.labels[ring.idx] = newLabel
  ring.idx = (ring.idx + 1) % LABEL_HISTORY_CAPACITY
  ring.count = Math.min(ring.count + 1, LABEL_HISTORY_CAPACITY)

  if (ring.count < CLASSIFICATION_SMOOTHING_FRAMES) {
    return newLabel // First few frames, accept whatever comes
  }

  // Count occurrences of each label in the ring
  const counts = new Map<string, number>()
  for (let i = 0; i < ring.count; i++) {
    const label = ring.labels[i]
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }

  // Return most frequent label (majority vote)
  let maxLabel = newLabel
  let maxCount = 0
  for (const [label, count] of counts) {
    if (count > maxCount) {
      maxCount = count
      maxLabel = label
    }
  }
  return maxLabel
}
```

**Step 3: Update the `classificationLabelHistory.clear()` call**

No change needed — `.clear()` works the same on the Map.

**Step 4: Run `npx tsc --noEmit`**

Expected: PASS.

**Step 5: Commit**

```bash
git add lib/dsp/dspWorker.ts
git commit -m "perf: ring buffer for classification label smoothing"
```

---

## Task 6: Periodic decay map cleanup

**Files:**
- Modify: `lib/dsp/dspWorker.ts:551-590`

**Step 1: Add a peak counter**

Near the other module-level variables (around line 100), add:

```typescript
let peakProcessCount = 0
```

**Step 2: Increment counter and gate cleanup**

In the peak processing section, increment the counter. Then wrap the decay cleanup section (lines ~551-590) with a counter check:

```typescript
peakProcessCount++

// Decay rate analysis — only clean up every 50 peaks to reduce overhead
if (peakProcessCount % 50 === 0) {
  // ... existing decay cleanup code stays exactly the same ...
}
```

**Important:** The decay analysis logic that **uses** recent decays to extend band cooldown can still run every peak — only the **cleanup** (expiredBins loop) needs gating. So actually, keep the analysis logic running every frame but gate just the expiry check differently.

**Revised approach:** Actually, re-reading the code, the cleanup and the analysis are interleaved in the same loop. The simplest safe change: gate the **entire** decay analysis block, since checking every 50 peaks (≈1 second) is fast enough for RT60-based analysis.

**Step 3: Reset counter in init/reset handlers**

Add `peakProcessCount = 0` alongside the other resets.

**Step 4: Run `npx tsc --noEmit`**

Expected: PASS.

**Step 5: Commit**

```bash
git add lib/dsp/dspWorker.ts
git commit -m "perf: gate decay analysis to every 50 peaks"
```

---

## Task 7: MSD history downsampling

**Files:**
- Modify: `lib/dsp/dspWorker.ts:521-525`

**Step 1: Add a reusable downsampled buffer**

Near the other module-level variables, add:

```typescript
let msdDownsampleBuf: Float32Array | null = null
```

**Step 2: Replace the MSD addFrame call**

Replace lines 521-525:

```typescript
// OLD:
// MSD: add full spectrum frame to history buffer
if (msdBuffer) {
  msdBuffer.addFrame(spectrum)
}

// NEW:
// MSD: max-pool spectrum to half resolution before storing (halves memory)
if (msdBuffer) {
  const halfLen = spectrum.length >> 1
  if (!msdDownsampleBuf || msdDownsampleBuf.length !== halfLen) {
    msdDownsampleBuf = new Float32Array(halfLen)
  }
  for (let i = 0; i < halfLen; i++) {
    msdDownsampleBuf[i] = Math.max(spectrum[i << 1], spectrum[(i << 1) + 1])
  }
  msdBuffer.addFrame(msdDownsampleBuf)
}
```

**Step 3: Verify MSD calculateMSD compatibility**

Check that `msdBuffer.calculateMSD(binIndex, ...)` handles the halved bin index correctly. The `binIndex` from the detector refers to the full-resolution spectrum. When MSD compares bins, both stored and incoming frames must use the same resolution.

**IMPORTANT:** If `calculateMSD` uses `binIndex` directly to index into stored frames, we need to halve the bin index: `msdBuffer.calculateMSD(binIndex >> 1, msdMinFrames)`. Check the MSD implementation.

If the MSD comparison is bin-level, **also** change the `calculateMSD` call (around line 614) to use `binIndex >> 1`:

```typescript
const msdResult = msdBuffer?.calculateMSD(binIndex >> 1, msdMinFrames) ?? null
```

**Step 4: Reset the buffer on init/reset**

Add `msdDownsampleBuf = null` in the reset handler.

**Step 5: Run `npx tsc --noEmit`**

Expected: PASS.

**Step 6: Commit**

```bash
git add lib/dsp/dspWorker.ts
git commit -m "perf: max-pool MSD history to half resolution"
```

---

## Task 8: Full build verification + push

**Step 1: Type check**

```bash
npx tsc --noEmit
```

Expected: PASS.

**Step 2: Production build**

```bash
pnpm build
```

Expected: PASS.

**Step 3: Push and update PR**

```bash
git push origin claude/ecstatic-goldberg
```

---

## Summary Table

| Task | Fix | File | Impact | Risk |
|------|-----|------|--------|------|
| 1 | Cached getRawTracks | trackManager.ts | **MED** — O(1) vs O(n) | Low |
| 2 | Dedup getRawTracks calls | dspWorker.ts | **MED** — eliminates O(n²) | Low |
| 3 | Advisory band index | dspWorker.ts | **MED** — O(1) lookup | Low |
| 4 | Conditional FFT phase | dspWorker.ts | **MED** — 1-2ms/frame | Med |
| 5 | Ring buffer smoothing | dspWorker.ts | **LOW** — kills micro-GC | Low |
| 6 | Periodic decay cleanup | dspWorker.ts | **LOW** — 0.1-0.2ms | Low |
| 7 | MSD downsampling | dspWorker.ts | **MED** — halves memory | Med |
| 8 | Build verification | — | — | — |
