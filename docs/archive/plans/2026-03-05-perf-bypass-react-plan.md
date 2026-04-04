# Bypass React for Real-Time Data — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate ~30 unnecessary React re-renders/sec by moving spectrum data out of React state into refs, and optimize per-frame canvas rendering.

**Architecture:** Split spectrum data into two paths: (1) a ref that the canvas reads imperatively every frame, and (2) a throttled lightweight React state (~4fps) for scalar fields that drive DOM elements (level meters, status bar, algorithm display). Advisories stay in React state since they change infrequently and drive DOM cards.

**Tech Stack:** React 19 hooks, HTML5 Canvas, Web Audio API, TypeScript

---

### Task 1: Add spectrumRef + throttled status state to useAudioAnalyzer

**Files:**
- Modify: `hooks/useAudioAnalyzer.ts`

**Context:** Currently `onSpectrum` (line 142-147) calls `setState` at ~30fps with the full SpectrumData object. This triggers React reconciliation of the entire component tree. The canvas doesn't need React — it reads data imperatively. But AudioAnalyzer.tsx reads scalar fields from spectrum for:
- `spectrum?.peak` → auto music-aware effect (line 128) + input level display (line 209)
- `spectrum?.autoGainDb`, `autoGainEnabled`, `autoGainLocked` → gain display (lines 210-212)
- `spectrum?.algorithmMode`, `contentType`, `msdFrameCount`, `isCompressed`, `compressionRatio` → AlgorithmStatusBar (lines 496-500)
- `spectrum?.noiseFloorDb` → status bar noise floor display (line 567)

**Step 1: Add spectrumRef and throttled status type**

Add a ref for the full spectrum and a lightweight interface for the throttled scalar fields:

```typescript
// New interface for throttled scalar fields only (no Float32Array)
export interface SpectrumStatus {
  peak: number
  noiseFloorDb: number | null
  autoGainDb?: number
  autoGainEnabled?: boolean
  autoGainLocked?: boolean
  algorithmMode?: AlgorithmMode
  contentType?: ContentType
  msdFrameCount?: number
  isCompressed?: boolean
  compressionRatio?: number
  isSignalPresent?: boolean
  rawPeakDb?: number
}
```

In the hook:
- Add `spectrumRef = useRef<SpectrumData | null>(null)`
- Replace `spectrum: SpectrumData | null` in state with `spectrumStatus: SpectrumStatus | null`
- Add a throttle timestamp ref: `lastStatusUpdateRef = useRef(0)`

**Step 2: Change onSpectrum to write ref + throttled state**

Replace the `onSpectrum` callback (lines 142-147):

```typescript
onSpectrum: (data) => {
  // Hot path: write to ref every frame (canvas reads this directly)
  spectrumRef.current = data

  // Throttled path: update React state at ~4fps for DOM consumers
  const now = performance.now()
  if (now - lastStatusUpdateRef.current > 250) {
    lastStatusUpdateRef.current = now
    setState(prev => ({
      ...prev,
      spectrumStatus: {
        peak: data.peak,
        noiseFloorDb: data.noiseFloorDb,
        autoGainDb: data.autoGainDb,
        autoGainEnabled: data.autoGainEnabled,
        autoGainLocked: data.autoGainLocked,
        algorithmMode: data.algorithmMode,
        contentType: data.contentType,
        msdFrameCount: data.msdFrameCount,
        isCompressed: data.isCompressed,
        compressionRatio: data.compressionRatio,
        isSignalPresent: data.isSignalPresent,
        rawPeakDb: data.rawPeakDb,
      },
      noiseFloorDb: data.noiseFloorDb,
    }))
  }
},
```

**Step 3: Update return type**

- Export `spectrumRef` on `UseAudioAnalyzerReturn`
- Replace `spectrum` with `spectrumStatus` in state type and return
- Keep backward compat: also expose `spectrumRef` so canvas can read it

**Step 4: Move tracks to ref**

- Add `tracksRef = useRef<TrackedPeak[]>([])`
- Change `onTracksUpdateRef.current` to write to ref instead of setState
- Remove `tracks` from React state (it's not consumed by any DOM component in AudioAnalyzer)

**Step 5: Verify**

Run: `npx tsc --noEmit`
Expected: Type errors in AudioAnalyzer.tsx (it still destructures `spectrum`) — these get fixed in Task 2.

**Step 6: Commit**

```bash
git add hooks/useAudioAnalyzer.ts
git commit -m "perf: move spectrum to ref, throttle status to ~4fps"
```

---

### Task 2: Update AudioAnalyzer to use spectrumStatus + spectrumRef

**Files:**
- Modify: `components/analyzer/AudioAnalyzer.tsx`

**Context:** AudioAnalyzer destructures `spectrum` at line 67 and uses it in two ways: (a) passed as prop to SpectrumCanvas, (b) scalar field reads for DOM elements. After Task 1, we switch to `spectrumStatus` for DOM + `spectrumRef` for canvas.

**Step 1: Update destructuring**

Change line 67 from `spectrum,` to `spectrumStatus, spectrumRef,`

**Step 2: Replace spectrum scalar reads with spectrumStatus**

- Line 128: `spectrum?.peak` → `spectrumStatus?.peak`
- Line 143: `spectrum?.peak` dep → `spectrumStatus?.peak`
- Line 209: `spectrum?.peak` → `spectrumStatus?.peak`
- Lines 210-212: `spectrum?.autoGainDb` etc → `spectrumStatus?.autoGainDb` etc
- Lines 496-500: `spectrum?.algorithmMode` etc → `spectrumStatus?.algorithmMode` etc
- Lines 567-568: `spectrum?.noiseFloorDb` → `spectrumStatus?.noiseFloorDb`

**Step 3: Pass spectrumRef to SpectrumCanvas**

Change all 4 SpectrumCanvas usages (lines 418, 574, 602, 624):
- Remove `spectrum={spectrum}` prop
- Add `spectrumRef={spectrumRef}` prop

**Step 4: Verify**

Run: `npx tsc --noEmit`
Expected: Type errors in SpectrumCanvas (prop type changed) — fixed in Task 3.

**Step 5: Commit**

```bash
git add components/analyzer/AudioAnalyzer.tsx
git commit -m "perf: switch AudioAnalyzer to spectrumStatus + spectrumRef"
```

---

### Task 3: Refactor SpectrumCanvas to read from refs

**Files:**
- Modify: `components/analyzer/SpectrumCanvas.tsx`

**Context:** Currently accepts `spectrum: SpectrumData | null` and `advisories: Advisory[]` as value props, listed in `useCallback` deps (line 304). The callback is recreated every frame, defeating memoization. After this change, canvas reads from refs and the render callback is stable.

**Step 1: Change props interface**

```typescript
interface SpectrumCanvasProps {
  spectrumRef: React.RefObject<SpectrumData | null>
  advisories: Advisory[]  // Keep as prop — changes infrequently, drives markers
  isRunning: boolean
  graphFontSize?: number
  onStart?: () => void
  earlyWarning?: EarlyWarning | null
  rtaDbMin?: number
  rtaDbMax?: number
  spectrumLineWidth?: number
}
```

**Step 2: Store advisories in a ref for stable render callback**

```typescript
const advisoriesRef = useRef(advisories)
advisoriesRef.current = advisories
```

**Step 3: Update render callback to read from refs**

- Replace `spectrum` with `spectrumRef.current` inside the render function
- Replace `advisories` with `advisoriesRef.current` inside the render function
- Remove `spectrum` and `advisories` from useCallback deps (line 304)

New deps: `[graphFontSize, earlyWarning, rtaDbMinProp, rtaDbMaxProp, spectrumLineWidthProp]`

Note: `earlyWarning` and the settings props change rarely, so the callback only recreates when the user changes settings — not every frame.

**Step 4: Verify**

Run: `npx tsc --noEmit`
Expected: Clean (0 errors)

**Step 5: Commit**

```bash
git add components/analyzer/SpectrumCanvas.tsx
git commit -m "perf: SpectrumCanvas reads spectrum from ref, stable render callback"
```

---

### Task 4: Cache expensive per-frame canvas objects

**Files:**
- Modify: `components/analyzer/SpectrumCanvas.tsx`

**Step 1: Cache canvas context**

Add a ref for the 2d context. Populate it on first use or when canvas changes:

```typescript
const ctxRef = useRef<CanvasRenderingContext2D | null>(null)
```

In render callback, replace lines 72-74:
```typescript
const canvas = canvasRef.current
if (!canvas) return
if (!ctxRef.current) ctxRef.current = canvas.getContext('2d')
const ctx = ctxRef.current
if (!ctx) return
```

**Step 2: Cache devicePixelRatio**

Add ref:
```typescript
const dprRef = useRef(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1)
```

Update in ResizeObserver callback (line 56):
```typescript
const dpr = window.devicePixelRatio || 1
dprRef.current = dpr
```

In render, replace line 76: `const dpr = dprRef.current`

**Step 3: Cache gradient**

Add refs:
```typescript
const gradientRef = useRef<CanvasGradient | null>(null)
const gradientHeightRef = useRef(0)
```

In render, replace line 154-157:
```typescript
let gradient = gradientRef.current
if (!gradient || gradientHeightRef.current !== plotHeight) {
  gradient = ctx.createLinearGradient(0, 0, 0, plotHeight)
  gradient.addColorStop(0, 'rgba(16, 185, 129, 0.8)')
  gradient.addColorStop(0.5, 'rgba(16, 185, 129, 0.3)')
  gradient.addColorStop(1, 'rgba(16, 185, 129, 0.05)')
  gradientRef.current = gradient
  gradientHeightRef.current = plotHeight
}
```

**Step 4: Invalidate ctx cache on canvas remount**

Reset `ctxRef.current = null` and `gradientRef.current = null` in ResizeObserver to handle canvas element changes.

**Step 5: Verify + commit**

Run: `npx tsc --noEmit && pnpm build`
Expected: Clean

```bash
git add components/analyzer/SpectrumCanvas.tsx
git commit -m "perf: cache canvas context, gradient, and devicePixelRatio"
```

---

### Task 5: Merge dual spectrum iteration into single pass

**Files:**
- Modify: `components/analyzer/SpectrumCanvas.tsx`

**Context:** Lines 162-204 iterate the entire FFT array twice — once for the fill path, once for the stroke path. Both compute identical x/y coordinates. With 4096+ bins and up to 3 canvas instances, this is ~25,000 unnecessary iterations per frame.

**Step 1: Single-pass implementation**

Replace lines 159-204 with:

```typescript
// Single pass: build stroke path, then derive fill from it
const strokePath = new Path2D()
const fillPath = new Path2D()
let firstX = 0
let lastX = 0
let started = false

for (let i = 1; i < n; i++) {
  const freq = i * hzPerBin
  if (freq < RTA_FREQ_MIN || freq > RTA_FREQ_MAX) continue

  const x = freqToLogPosition(freq, RTA_FREQ_MIN, RTA_FREQ_MAX) * plotWidth
  const db = clamp(freqDb[i], RTA_DB_MIN, RTA_DB_MAX)
  const y = ((RTA_DB_MAX - db) / (RTA_DB_MAX - RTA_DB_MIN)) * plotHeight

  if (!started) {
    firstX = x
    strokePath.moveTo(x, y)
    fillPath.moveTo(x, plotHeight)
    fillPath.lineTo(x, y)
    started = true
  } else {
    strokePath.lineTo(x, y)
    fillPath.lineTo(x, y)
  }
  lastX = x
}

// Complete fill path back to baseline
fillPath.lineTo(lastX, plotHeight)
fillPath.closePath()

// Draw fill then stroke
ctx.fillStyle = gradient
ctx.fill(fillPath)

ctx.strokeStyle = VIZ_COLORS.SPECTRUM
ctx.lineWidth = spectrumLineWidthProp ?? 1.5
ctx.stroke(strokePath)
```

**Step 2: Verify + commit**

Run: `npx tsc --noEmit && pnpm build`
Expected: Clean

```bash
git add components/analyzer/SpectrumCanvas.tsx
git commit -m "perf: merge dual spectrum iteration into single pass with Path2D"
```

---

### Task 6: Full build verification + squash commit

**Step 1: Full verification**

```bash
npx tsc --noEmit && pnpm build
```

Expected: Both pass clean.

**Step 2: Interactive test**

Start dev server, verify:
- Spectrum renders correctly (fill gradient + stroke line)
- Advisory markers appear on canvas
- Noise floor display updates in status bar
- Input level meter responds
- Algorithm status bar shows mode
- Issue cards still appear and dedup correctly
- No console errors

**Step 3: Push and create PR**

```bash
git push origin claude/ecstatic-goldberg
gh pr create --title "perf: bypass React state for real-time spectrum data" --body "..."
```
