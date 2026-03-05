# Approach C: Worker + Memory Optimizations

## Goal
Eliminate 6-12ms/frame of wasted work across the worker bridge, DSP pipeline, and memory management. Combined with Approach A (React bypass), this brings per-frame cost well under the 16ms budget at 60fps.

## Execution: Layer-by-Layer
Three layers by code boundary. Build + verify between each.

---

## Layer 1: Main Thread (2 fixes)

### Fix #1 — Zero-Copy Worker Transfer
**File:** `hooks/useDSPWorker.ts` (lines 141-155)
**Problem:** `spectrum.slice(0)` copies 32KB per frame before transferring.
**Fix:** Transfer the original Float32Array buffer directly. The AnalyserNode creates fresh buffers each frame — the main thread doesn't reuse them.
**Impact:** Eliminates ~64KB/frame allocations (1.6MB/sec GC pressure).

### Fix #9 — Debounced localStorage
**File:** `hooks/useAudioAnalyzer.ts`
**Problem:** Synchronous localStorage writes on every settings change.
**Fix:** Debounce to 2s of inactivity + write on stop() as safety net.
**Impact:** Eliminates 1-5ms blocking I/O on settings changes.

---

## Layer 2: Worker Bridge + Track Caching (3 fixes)

### Fix #2/#3 — Cached getRawTracks
**Files:** `lib/dsp/trackManager.ts` (lines 84-86), `lib/dsp/dspWorker.ts` (lines 704, 761)
**Problem:** `getRawTracks()` creates fresh arrays via `Array.from().filter()` on every call. Called 2+ times per peak, inside the peak loop — O(n²).
**Fix (two parts):**
1. TrackManager maintains `_activeTracks` cache, updated on activate/deactivate. `getRawTracks()` returns cached reference — O(1).
2. dspWorker calls `getRawTracks()` once before the peak loop, extracts `peakFrequencies`, reuses both throughout.
**Impact:** Eliminates O(n²) array allocations per frame.

### Fix #5 — Advisory Lookup Index
**File:** `lib/dsp/dspWorker.ts` (lines 720-750)
**Problem:** Linear scan through all advisories to find duplicates, per peak.
**Fix:** Maintain `Map<number, string>` (GEQ band → advisory ID). Update on insert/remove. Lookup becomes O(1).
**Impact:** 0.5-1ms/frame saved during active feedback.

---

## Layer 3: DSP Internals (4 fixes)

### Fix #4 — Conditional FFT Phase
**File:** `lib/dsp/dspWorker.ts` (lines 485-716)
**Problem:** Full FFT phase extraction (106K ops) runs every frame regardless.
**Fix:** Skip unless any track has: MSD feedback-likely, velocity > 3 dB/s, or Q > 30.
**Risk:** Phase coherence may lag 1-2 frames on feedback onset. Acceptable — feedback builds over seconds.
**Impact:** 1-2ms/frame saved on quiet frames (majority of runtime).

### Fix #6 — MSD History Downsampling
**File:** `lib/dsp/dspWorker.ts` (lines 700-713)
**Problem:** Full 8192-element spectrum stored per frame (20MB for 20 tracks).
**Fix:** Max-pool to half resolution: `downsample[i] = max(spectrum[2i], spectrum[2i+1])`. Preserves peaks for MSD comparison.
**Impact:** Halves MSD memory footprint. Reduces GC cycles.

### Fix #7 — Ring Buffer for Label Smoothing
**File:** `lib/dsp/dspWorker.ts` (lines 296-320)
**Problem:** `push()` + `splice()` creates GC pressure at 1000x/sec.
**Fix:** Fixed-size ring buffer with modular index. Zero allocations after init.
**Impact:** Eliminates ~1000 micro-allocations/sec.

### Fix #8 — Periodic Decay Map Cleanup
**File:** `lib/dsp/dspWorker.ts` (lines 626-665)
**Problem:** `recentDecays` map scanned on every detected peak.
**Fix:** Clean up every 100 peaks instead. Stale entries don't affect correctness.
**Impact:** 0.1-0.2ms/frame saved.

---

## Combined Impact Estimate

| Layer | Savings | Risk |
|-------|---------|------|
| Layer 1 (main thread) | ~2ms/frame + GC | None |
| Layer 2 (worker bridge) | ~3ms/frame | Low |
| Layer 3 (DSP internals) | ~3-5ms/frame + memory | Medium (accuracy) |
| **Total** | **~8-10ms/frame** | |

With Approach A already saving ~5ms/frame from React bypass, total savings approach **13-15ms/frame** — bringing the hot path well under 16ms at 60fps.
