# Approach A: Bypass React for Real-Time Data

**Date:** 2026-03-05
**Goal:** Eliminate ~30 unnecessary React re-renders/sec by moving spectrum and tracks out of React state into refs, and optimize per-frame canvas rendering.

## Problem

`onSpectrum` in `useAudioAnalyzer` calls `setState` at ~30fps, triggering full React reconciliation of the entire consumer tree each time. The spectrum data is only consumed by `SpectrumCanvas` (imperative canvas), not React DOM. Additionally, `SpectrumCanvas` recreates expensive objects (gradient, context lookup, padding) every frame and iterates the FFT array twice.

## Changes

### 1. Move spectrum + tracks to refs (`useAudioAnalyzer.ts`)

- Replace `spectrum` and `tracks` in React state with `useRef`
- Expose `spectrumRef` and `tracksRef` on the return type
- `onSpectrum` callback writes to ref only — no `setState`
- `onTracksUpdate` callback writes to ref only — no `setState`
- Throttle `noiseFloorDb` update to ~2fps for status bar display
- Keep `advisories` in React state (changes infrequently, drives DOM issue cards)

### 2. SpectrumCanvas reads refs instead of props (`SpectrumCanvas.tsx`, `AudioAnalyzer.tsx`)

- Accept `spectrumRef` and `advisoriesRef` instead of value props
- Remove `spectrum` and `advisories` from `useCallback` dependency array
- Render callback becomes stable (created once, never recreated)
- RAF loop reads `.current` each frame

### 3. Cache expensive per-frame canvas objects (`SpectrumCanvas.tsx`)

- Cache `ctx` in a ref after first successful `getContext('2d')`
- Cache `devicePixelRatio` in a ref, update on resize only
- Cache gradient in a ref, recreate only when `plotHeight` changes
- Move padding computation to resize handler
- Group font assignments: set once before each text group

### 4. Merge dual spectrum iteration (`SpectrumCanvas.tsx`)

- Single pass building both fill and stroke paths
- Fill path extends stroke path to baseline
- Eliminates second 4096+ bin iteration per frame

## Files Touched

- `hooks/useAudioAnalyzer.ts` — ref-based spectrum/tracks, throttled noiseFloor
- `components/analyzer/SpectrumCanvas.tsx` — ref props, cached objects, merged loop
- `components/analyzer/AudioAnalyzer.tsx` — prop drilling update (refs instead of values)

## Expected Impact

- ~30 fewer React re-renders/sec (spectrum + tracks no longer in state)
- ~50% reduction in per-frame canvas work (caching + merged loop)
- Multiplied by up to 3 canvas instances = significant improvement on weaker devices
