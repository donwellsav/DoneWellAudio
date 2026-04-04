# Adaptive Phase FFT Skip — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add mode-aware adaptive phase FFT skipping that saves ~15-25% worker CPU in speech/monitor modes without affecting detection accuracy. Controllable via Advanced settings toggle.

**Architecture:** When MSD confidence is decisive (>0.8 or <0.1) AND the current mode is MSD-led (not liveMusic or worship), skip `computePhaseAngles()` on 2 of every 3 frames. Previous frame's phase score is reused on skip frames. A new `adaptivePhaseSkip` boolean in `DetectorSettings` controls this — default ON (speech is the default preference). Toggle in Advanced > Algorithms section.

**Tech Stack:** TypeScript, existing `DetectorSettings` pattern, `AlgorithmEngine` class, `LEDToggle` component.

---

### Task 1: Add `adaptivePhaseSkip` to Types and Defaults

**Files:**
- Modify: `types/advisory.ts:354` (after `mlEnabled`)
- Modify: `lib/dsp/constants.ts:674` (after `mlEnabled` in DEFAULT_SETTINGS)

**Step 1: Add type field**

In `types/advisory.ts`, after line 354 (`mlEnabled: boolean`), add:

```typescript
adaptivePhaseSkip: boolean // Skip phase FFT when MSD is decisive in MSD-led modes (default true)
```

**Step 2: Add default value**

In `lib/dsp/constants.ts` DEFAULT_SETTINGS, after `mlEnabled: true`, add:

```typescript
adaptivePhaseSkip: true, // Adaptive phase skip — saves CPU in speech/monitors where MSD leads
```

**Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: Errors in files that destructure DetectorSettings without the new field (if any — spread operator handles most)

**Step 4: Commit**

```bash
git add types/advisory.ts lib/dsp/constants.ts
git commit -m "feat: add adaptivePhaseSkip to DetectorSettings (default on)"
```

---

### Task 2: Implement Skip Logic in AlgorithmEngine

**Files:**
- Modify: `lib/dsp/workerFft.ts:229-397` (AlgorithmEngine class)

**Step 1: Add state fields to AlgorithmEngine**

After line 242 (`private _lastFusedConf = 0.5`), add:

```typescript
/** Frame counter for phase skip cadence (0, 1, 2, 0, 1, 2, ...) */
private _phaseFrameCounter = 0
/** Cached phase result from last computed frame (reused on skip frames) */
private _lastPhases: Float32Array | null = null
```

**Step 2: Add mode-aware skip check method**

After the `updateLastFusion` method (~line 500), add:

```typescript
/**
 * Determine if phase FFT should be skipped this frame.
 * Skip when: adaptive skip enabled AND mode is MSD-led AND MSD is decisive.
 * Never skip in liveMusic or worship (phase is the lead algorithm there).
 */
shouldSkipPhase(adaptivePhaseSkip: boolean, mode: string): boolean {
  if (!adaptivePhaseSkip) return false
  // Phase is the lead detector in music/worship — never skip
  if (mode === 'liveMusic' || mode === 'worship') return false
  // MSD decisive = clearly feedback or clearly not
  const msdDecisive = this._lastFusedProb > 0.8 || this._lastFusedProb < 0.1
  if (!msdDecisive) return false
  // Run phase 1-in-3 frames when MSD is decisive
  return (this._phaseFrameCounter % 3) !== 0
}
```

**Step 3: Update `feedFrame()` to use skip logic**

Replace lines 387-393 (the phase coherence block):

```typescript
// Phase coherence: adaptive skip when MSD is decisive in MSD-led modes
if (timeDomain && this.phaseBuffer) {
  this._phaseFrameCounter++
  if (!skipPhase) {
    const phases = computePhaseAngles(timeDomain)
    if (phases) {
      this.phaseBuffer.addFrame(phases)
      this._lastPhases = phases
    }
  }
  // On skip frames, phaseBuffer retains last-written frame — coherence score
  // uses existing history, which is at most 40ms stale (2 skipped × 20ms).
}
```

Note: `feedFrame()` needs a new `skipPhase` parameter. Update signature:

```typescript
feedFrame(
  timestamp: number,
  spectrum: Float32Array,
  timeDomain: Float32Array | undefined,
  minFreq: number,
  maxFreq: number,
  sampleRate: number,
  fftSize: number,
  skipPhase: boolean = false, // New parameter
): boolean {
```

**Step 4: Run type check**

Run: `npx tsc --noEmit`
Expected: Error in `dspWorker.ts` where `feedFrame()` is called (needs to pass `skipPhase`)

**Step 5: Commit**

```bash
git add lib/dsp/workerFft.ts
git commit -m "feat: adaptive phase skip logic in AlgorithmEngine"
```

---

### Task 3: Wire Settings Through dspWorker

**Files:**
- Modify: `lib/dsp/dspWorker.ts:407-410` (feedFrame call site)

**Step 1: Compute skipPhase and pass to feedFrame**

Replace lines 406-410:

```typescript
// Feed frame-level buffers (MSD, amplitude, phase — once per frame)
const skipPhase = algorithmEngine.shouldSkipPhase(
  settings?.adaptivePhaseSkip ?? true,
  settings?.mode ?? 'speech',
)
const isNewFrame = algorithmEngine.feedFrame(
  peak.timestamp, spectrum, timeDomain,
  minFreq, maxFreq, sampleRate, fftSize,
  skipPhase,
)
```

**Step 2: Run type check**

Run: `npx tsc --noEmit`
Expected: Clean pass

**Step 3: Run tests**

Run: `pnpm test`
Expected: All 981 tests pass (skip logic defaults to ON but doesn't change test behavior — tests don't use real audio frames)

**Step 4: Commit**

```bash
git add lib/dsp/dspWorker.ts
git commit -m "feat: wire adaptivePhaseSkip through dspWorker to AlgorithmEngine"
```

---

### Task 4: Add Toggle to Advanced Tab

**Files:**
- Modify: `components/analyzer/settings/AdvancedTab.tsx:92-94` (Algorithms section)

**Step 1: Add toggle in Algorithms section**

After the ML toggle (find `mlEnabled` LEDToggle), add:

```typescript
<LEDToggle color="amber" checked={settings.adaptivePhaseSkip} onChange={(checked) => diag('adaptivePhaseSkipOverride', checked)} label="Adaptive Phase Skip"
  tooltip={settings.showTooltips ? 'Skip phase FFT when MSD is decisive. Saves CPU in speech/monitor modes. Always runs full phase in music/worship.' : undefined} />
```

**Step 2: Run type check and tests**

Run: `npx tsc --noEmit && pnpm test`
Expected: Clean

**Step 3: Commit**

```bash
git add components/analyzer/settings/AdvancedTab.tsx
git commit -m "feat: add Adaptive Phase Skip toggle in Advanced > Algorithms"
```

---

### Task 5: Add DiagnosticsProfile Override

**Files:**
- Modify: `types/advisory.ts` — DiagnosticsProfile interface (find it near DetectorSettings)
- Modify: `lib/settings/deriveSettings.ts` — where overrides are applied

**Step 1: Find DiagnosticsProfile and add override field**

Add to the DiagnosticsProfile interface:

```typescript
adaptivePhaseSkipOverride?: boolean
```

**Step 2: Find deriveSettings and add the mapping**

Follow the existing pattern for `ignoreWhistleOverride` → `ignoreWhistle`:

```typescript
if (diag.adaptivePhaseSkipOverride !== undefined) {
  merged.adaptivePhaseSkip = diag.adaptivePhaseSkipOverride
}
```

**Step 3: Run type check and tests**

Run: `npx tsc --noEmit && pnpm test`
Expected: Clean

**Step 4: Commit**

```bash
git add types/advisory.ts lib/settings/deriveSettings.ts
git commit -m "feat: wire adaptivePhaseSkipOverride through DiagnosticsProfile"
```

---

### Task 6: Write Tests

**Files:**
- Create: `lib/dsp/__tests__/adaptivePhaseSkip.test.ts`

**Step 1: Write tests for shouldSkipPhase logic**

```typescript
import { describe, it, expect } from 'vitest'
import { AlgorithmEngine } from '../workerFft'

describe('Adaptive Phase Skip', () => {
  it('never skips when disabled', () => {
    const engine = new AlgorithmEngine(8192, 48000)
    engine.updateLastFusion(0.95, 0.9) // MSD decisive
    expect(engine.shouldSkipPhase(false, 'speech')).toBe(false)
  })

  it('never skips in liveMusic mode', () => {
    const engine = new AlgorithmEngine(8192, 48000)
    engine.updateLastFusion(0.95, 0.9)
    expect(engine.shouldSkipPhase(true, 'liveMusic')).toBe(false)
  })

  it('never skips in worship mode', () => {
    const engine = new AlgorithmEngine(8192, 48000)
    engine.updateLastFusion(0.95, 0.9)
    expect(engine.shouldSkipPhase(true, 'worship')).toBe(false)
  })

  it('skips in speech mode when MSD is decisive (high prob)', () => {
    const engine = new AlgorithmEngine(8192, 48000)
    engine.updateLastFusion(0.95, 0.9) // clearly feedback
    // Frame counter starts at 0 — first frame (counter=0 before increment) should NOT skip
    // Need to simulate frame progression
    const results: boolean[] = []
    for (let i = 0; i < 6; i++) {
      results.push(engine.shouldSkipPhase(true, 'speech'))
      // Simulate feedFrame incrementing counter
      ;(engine as any)._phaseFrameCounter++
    }
    // Pattern: run, skip, skip, run, skip, skip (1-in-3)
    expect(results).toEqual([false, true, true, false, true, true])
  })

  it('never skips when MSD is undecided (mid-range prob)', () => {
    const engine = new AlgorithmEngine(8192, 48000)
    engine.updateLastFusion(0.5, 0.5) // uncertain
    expect(engine.shouldSkipPhase(true, 'speech')).toBe(false)
  })

  it('skips in speech mode when MSD is decisive (low prob)', () => {
    const engine = new AlgorithmEngine(8192, 48000)
    engine.updateLastFusion(0.05, 0.9) // clearly not feedback
    ;(engine as any)._phaseFrameCounter = 1 // not divisible by 3
    expect(engine.shouldSkipPhase(true, 'speech')).toBe(true)
  })

  it('skips in monitors mode when MSD is decisive', () => {
    const engine = new AlgorithmEngine(8192, 48000)
    engine.updateLastFusion(0.95, 0.9)
    ;(engine as any)._phaseFrameCounter = 2
    expect(engine.shouldSkipPhase(true, 'monitors')).toBe(true)
  })

  it('skips in broadcast mode when MSD is decisive', () => {
    const engine = new AlgorithmEngine(8192, 48000)
    engine.updateLastFusion(0.95, 0.9)
    ;(engine as any)._phaseFrameCounter = 1
    expect(engine.shouldSkipPhase(true, 'broadcast')).toBe(true)
  })
})
```

**Step 2: Run tests**

Run: `pnpm test`
Expected: All pass including new tests

**Step 3: Commit**

```bash
git add lib/dsp/__tests__/adaptivePhaseSkip.test.ts
git commit -m "test: adaptive phase skip — mode gating, frame cadence, decisive thresholds"
```

---

### Task 7: Final Build Gate

**Step 1: Full verification**

Run: `npx tsc --noEmit && pnpm test`
Expected: All pass

**Step 2: Squash into single commit (optional)**

If preferred, squash tasks 1-6 into one commit.
