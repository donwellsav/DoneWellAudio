# DoneWell Audio — Architecture Audit Report

> **Audit date:** March 19, 2026 | **Version:** 0.151.0 | **Auditor:** Claude Opus 4.6

---

## Executive Summary

The DoneWell Audio codebase demonstrates **excellent engineering discipline** across its 161 TypeScript files, 476 tests, and complex real-time audio processing pipeline. The architecture is sound — proper buffer pooling, worker backpressure, zero-allocation hot paths, and comprehensive error handling.

**Critical issues found: 3** (all related to worker message handling edge cases)
**Medium issues found: 3** (context efficiency, lifecycle timing)
**Low issues found: 6** (type safety gaps, minor security hardening)
**No memory leaks detected.** All event listeners, RAF loops, and workers are properly cleaned up.

---

## Thread Model Audit

### Architecture
```
Main Thread (50fps)          Web Worker (async)
  AudioContext               AlgorithmEngine
  AnalyserNode               Classifier
  FeedbackDetector           EQ Advisory
  Canvas (30fps)             Track Manager
  React Rendering            Advisory Manager
       |                          |
       +--- postMessage (peaks) -->+
       +<-- postMessage (results) -+
       +--- transferable buffers ->+
       +<-- returnBuffers --------+
```

### Findings

#### CRITICAL: Worker Message Type Validation Gap
**File:** `lib/dsp/dspWorker.ts:456`
**Issue:** `self.postMessage(action satisfies WorkerOutboundMessage)` uses `satisfies` which is a compile-time-only check. No runtime validation. A malformed message would be silently ignored by the main thread's switch statement.
**Risk:** Silent message drops during development. No production impact currently.
**Fix:** Add a message factory function with runtime type checks, or use discriminated union exhaustiveness checking.

#### CRITICAL: Worker Restart Race Condition
**File:** `hooks/useDSPWorker.ts:88-96`
**Issue:** Worker crash triggers `setTimeout` for restart. If component unmounts during the timeout window, the restart callback fires on a dead context.
**Risk:** Stale worker handler attachment after unmount.
**Fix:** Add `isUnmountedRef` guard in restart callback.

#### CRITICAL: Buffer Pool Epoch Missing
**File:** `hooks/useDSPWorker.ts:142-146`
**Issue:** `returnBuffers` message unconditionally pushes buffers back to the pool. If the worker crashed and was restarted, old buffers from the dead worker could pollute the new pool.
**Risk:** Minor memory inconsistency after worker crash recovery.
**Fix:** Add pool generation counter; reject buffers from old epochs.

### Positive Findings
- Worker backpressure correctly implemented (`busyRef` pattern)
- Transferable buffers used for zero-copy communication
- Buffer pool prevents allocation in hot path
- Worker crash recovery with exponential backoff

---

## Context Provider Audit

### Architecture
```
AudioAnalyzerProvider (compound)
  EngineContext (11 fields)
  SettingsContext (5 fields)
  DetectionContext (3 fields)
  MeteringContext (10 fields)
AdvisoryProvider
UIProvider
PortalContainerProvider
```

### Findings

#### MEDIUM: Advisory ID Pruning Race
**File:** `contexts/AdvisoryContext.tsx:129-145`
**Issue:** Auto-expire effect rebuilds dismissed/cleared sets on every advisory change. If `onClearAll` fires during the pruning window, stale IDs could briefly reappear.
**Fix:** Use `useReducer` for atomic state transitions.

#### MEDIUM: RTA Fullscreen Error Swallowed
**File:** `contexts/UIContext.tsx:96`
**Issue:** `.catch(() => {})` on `requestFullscreen()` silently hides real errors (e.g., user denied permission, element not visible).
**Fix:** Log to Sentry, add visibility check before attempting fullscreen.

#### MEDIUM: Settings Not Validated
**File:** `contexts/SettingsContext.tsx`
**Issue:** `updateSettings(Partial<DetectorSettings>)` accepts any partial object without range validation. Invalid values (e.g., negative FFT size) propagate to worker.
**Fix:** Add `validateDetectorSettings()` function with range checks.

### Positive Findings
- Contexts are well-split by domain (not one monolithic context)
- `memo()` on all components prevents cascading re-renders
- Compound provider pattern reduces nesting depth

---

## Memory Management Audit

| Resource | Cleanup | Status |
|----------|---------|--------|
| Event listeners (fullscreenchange) | `removeEventListener` in useEffect cleanup | OK |
| RAF loop (canvas) | `cancelAnimationFrame` in cleanup | OK |
| Worker | `worker.terminate()` on unmount | OK |
| Resize observers | `observer.disconnect()` in cleanup | OK |
| Object URLs (export) | `URL.revokeObjectURL()` after download | OK |
| MSD pool | LRU eviction at 256 slots | OK |
| Advisory manager | Max 200 advisories, band cooldown map bounded | OK |
| Energy buffer | Fixed Float32Array(50), no growth | OK |
| Content type history | Capped at 10 entries | OK |

**No unbounded growth detected.**

---

## Security Audit

| Area | Status | Notes |
|------|--------|-------|
| CSP | Nonce-based `script-src` in prod | `worker-src 'self' blob:` could be tightened |
| API validation | v1.0/1.1/1.2 schema validated | Session ID format not UUID-validated |
| Rate limiting | 6 requests/60s per session | IP stripped server-side |
| XSS | No direct HTML injection vectors | Canvas-only visualization |
| localStorage | All via dwaStorage.ts with try/catch | 37 touchpoints, all safe |
| Audio | No audio transmitted | All processing client-side |

### Minor: Session ID Format
**File:** `app/api/v1/ingest/route.ts:106`
Only checks `sessionId.length >= 10`. Should validate UUID v4 format to prevent session spoofing (low impact since data is anonymized).

### Minor: CSP Worker Source
**File:** `middleware.ts:26`
`worker-src 'self' blob:` allows blob workers. Consider restricting to `'self'` only if blob workers aren't needed.

---

## Performance Assessment

| Metric | Implementation | Grade |
|--------|---------------|-------|
| Hot path (50fps) | EXP_LUT, prefix sum, skip-threshold | A+ |
| Buffer allocation | Zero-alloc after init (pooled transferables) | A+ |
| Canvas rendering | 30fps (not 60fps), dirty flag skipping | A |
| Worker backpressure | Drop-not-queue pattern | A |
| MSD pool | Sparse 256-slot LRU (64KB vs 1MB dense) | A+ |
| React rendering | memo() on all components, ref-based hot reads | A |
| Theme switching | Ref-based canvas reads, no per-frame getComputedStyle | A |

**No performance issues identified.**

---

## Type Safety Assessment

| Area | Status |
|------|--------|
| `@typescript-eslint/no-explicit-any: error` | Enforced globally |
| Worker message types | Compile-time only (satisfies), no runtime validation |
| Advisory types | Comprehensive interfaces in types/advisory.ts |
| Canvas drawing functions | Pure, well-typed parameters |
| Storage abstractions | Generic typed factories in dwaStorage.ts |

**One gap:** Worker outbound messages lack runtime type guards. All other type safety is excellent.

---

## Recommendations (Prioritized)

| Priority | Issue | Effort | Impact |
|----------|-------|--------|--------|
| 1 | Worker restart race condition | 15 min | Prevents stale handlers after crash |
| 2 | Buffer pool epoch tracking | 30 min | Prevents pool pollution after crash |
| 3 | Settings validation function | 1 hour | Prevents invalid DSP config |
| 4 | Advisory state useReducer | 2 hours | Eliminates pruning race |
| 5 | Fullscreen error logging | 15 min | Better debugging |
| 6 | Session ID UUID validation | 15 min | Stronger API input validation |
