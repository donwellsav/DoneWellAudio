# False Positive & Duplicate Elimination v1.0.4 — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate remaining false positive feedback alerts and duplicate advisory cards by raising signal gate thresholds, unifying merge windows, adding auto-clear cooldown, and adding a global advisory rate limiter.

**Architecture:** All changes are in the DSP pipeline (constants, classifier, worker). No UI changes. The signal gate runs pre-gain in feedbackDetector.ts but is configured by constants.ts. The dedup logic runs in the Web Worker (dspWorker.ts). No test framework — verify with `npx tsc --noEmit`.

**Tech Stack:** TypeScript, Web Audio API, Web Workers

---

### Task 1: Raise Signal Gate Thresholds + Merge Windows + Cooldowns (constants.ts)

**Files:**
- Modify: `lib/dsp/constants.ts:212` (TRACK_SETTINGS)
- Modify: `lib/dsp/constants.ts:220` (HARMONIC_SETTINGS)
- Modify: `lib/dsp/constants.ts:226` (BAND_COOLDOWN_MS)
- Modify: `lib/dsp/constants.ts:537` (peakMergeCents)
- Modify: `lib/dsp/constants.ts:546` (harmonicToleranceCents)
- Modify: `lib/dsp/constants.ts:570` (sustainMs default)
- Modify: `lib/dsp/constants.ts:738-751` (SIGNAL_GATE)
- Modify: `lib/dsp/constants.ts:761` (HOTSPOT_COOLDOWN_MS)
- Modify: `lib/dsp/constants.ts:293,324,355,385,416,446,476,507` (per-mode sustainMs)

**Step 1: Raise TRACK_SETTINGS.ASSOCIATION_TOLERANCE_CENTS**

```typescript
// lib/dsp/constants.ts line 212
// OLD:
  ASSOCIATION_TOLERANCE_CENTS: 100, // Max cents difference to associate peak to track (1 semitone)
// NEW:
  ASSOCIATION_TOLERANCE_CENTS: 200, // Max cents difference to associate peak to track (2 semitones — synced with peakMergeCents)
```

**Step 2: Raise HARMONIC_SETTINGS.TOLERANCE_CENTS**

```typescript
// lib/dsp/constants.ts line 220
// OLD:
  TOLERANCE_CENTS: 100, // ±100 cents = 1 semitone; synced with ASSOCIATION_TOLERANCE_CENTS
// NEW:
  TOLERANCE_CENTS: 200, // ±200 cents = 2 semitones; synced with ASSOCIATION_TOLERANCE_CENTS
```

**Step 3: Raise BAND_COOLDOWN_MS**

```typescript
// lib/dsp/constants.ts line 226
// OLD:
export const BAND_COOLDOWN_MS = 1500
// NEW:
export const BAND_COOLDOWN_MS = 3000
```

**Step 4: Raise peakMergeCents in DEFAULT_SETTINGS**

```typescript
// lib/dsp/constants.ts line 537
// OLD:
  peakMergeCents: 150, // 1.5 semitones — wider merge window reduces same-band duplicate advisories
// NEW:
  peakMergeCents: 200, // 2 semitones — synced with ASSOCIATION_TOLERANCE_CENTS to prevent merge gap
```

**Step 5: Raise harmonicToleranceCents in DEFAULT_SETTINGS**

```typescript
// lib/dsp/constants.ts line 546
// OLD:
  harmonicToleranceCents: 100, // ±100 cents for harmonic matching; synced with ASSOCIATION_TOLERANCE_CENTS
// NEW:
  harmonicToleranceCents: 200, // ±200 cents for harmonic matching; synced with ASSOCIATION_TOLERANCE_CENTS
```

**Step 6: Raise DEFAULT_SETTINGS.sustainMs**

```typescript
// lib/dsp/constants.ts line 570
// OLD:
  sustainMs: 150, // Fast confirmation — load-in friendly, above consonant transients
// NEW:
  sustainMs: 250, // Require ¼ second persistence — reduces transient false positives
```

**Step 7: Raise per-mode sustainMs values**

Each mode preset has its own sustainMs. Raise any value below 250 to 250:

```typescript
// line 293 (speech preset)
// OLD:
    sustainMs: 150,          // Fast confirmation — load-in friendly, above consonant transients
// NEW:
    sustainMs: 250,          // Require ¼ second persistence — reduces transient false positives

// line 385 (theater preset)
// OLD:
    sustainMs: 200,          // Tightened for load-in — fast for dialogue dynamics
// NEW:
    sustainMs: 250,          // Require ¼ second persistence — reduces transient false positives

// line 416 (monitors preset)
// OLD:
    sustainMs: 200,          // Fast confirmation — raised from 150ms to reduce transient false positives
// NEW:
    sustainMs: 250,          // Require ¼ second persistence — reduces transient false positives

// line 446 (ringOut preset)
// OLD:
    sustainMs: 200,          // Fast confirmation — raised from 150ms to reduce noise false positives
// NEW:
    sustainMs: 250,          // Require ¼ second persistence — reduces transient false positives

// line 476 (broadcast preset)
// OLD:
    sustainMs: 150,          // Tightened for load-in — fast confirmation
// NEW:
    sustainMs: 250,          // Require ¼ second persistence — reduces transient false positives
```

Note: worship (280ms line 324), liveMusic (350ms line 355), and outdoor (250ms line 507) are already ≥ 250ms — leave unchanged.

**Step 8: Raise SIGNAL_GATE thresholds by 10 dB**

```typescript
// lib/dsp/constants.ts lines 738-751
// OLD:
export const SIGNAL_GATE = {
  /** Default silence threshold in dBFS (pre-gain). Below this, no detection runs. */
  DEFAULT_SILENCE_THRESHOLD_DB: -65,
  /** Per-mode overrides (quieter venues need lower thresholds) */
  MODE_SILENCE_THRESHOLDS: {
    speech: -65,
    worship: -60,
    liveMusic: -55,
    theater: -68,
    monitors: -55,
    ringOut: -70,      // ring-out wants maximum sensitivity
    broadcast: -70,    // studio is very quiet
    outdoor: -55,
  } as Record<string, number>,
} as const
// NEW:
export const SIGNAL_GATE = {
  /** Default silence threshold in dBFS (pre-gain). Below this, no detection runs. */
  DEFAULT_SILENCE_THRESHOLD_DB: -55,
  /** Per-mode overrides — raised 10 dB to reject ambient room noise in live venues */
  MODE_SILENCE_THRESHOLDS: {
    speech: -55,
    worship: -50,
    liveMusic: -45,
    theater: -58,
    monitors: -45,
    ringOut: -60,      // ring-out wants maximum sensitivity
    broadcast: -60,    // studio is very quiet
    outdoor: -45,
  } as Record<string, number>,
} as const
```

**Step 9: Raise HOTSPOT_COOLDOWN_MS**

```typescript
// lib/dsp/constants.ts line 761
// OLD:
export const HOTSPOT_COOLDOWN_MS = 2000
// NEW:
export const HOTSPOT_COOLDOWN_MS = 3000
```

**Step 10: Commit**

```bash
git add lib/dsp/constants.ts
git commit -m "feat(dsp): raise signal gate, unify merge windows, increase cooldowns (v1.0.4)"
```

---

### Task 2: Raise Prominence Floor (classifier.ts)

**Files:**
- Modify: `lib/dsp/classifier.ts:386`

**Step 1: Change prominence floor from 8 to 10 dB**

```typescript
// lib/dsp/classifier.ts line 384-388
// OLD:
  // Prominence floor — noise bursts rarely sustain 8 dB above neighbors
  // This eliminates broadband noise spikes that pass threshold checks
  if (classification.prominenceDb !== undefined && classification.prominenceDb < 8) {
    return false
  }
// NEW:
  // Prominence floor — noise bursts rarely sustain 10 dB above neighbors
  // Raised from 8 dB to further eliminate noise spikes during active audio
  if (classification.prominenceDb !== undefined && classification.prominenceDb < 10) {
    return false
  }
```

**Step 2: Commit**

```bash
git add lib/dsp/classifier.ts
git commit -m "feat(dsp): raise prominence floor to 10 dB"
```

---

### Task 3: Add Global Advisory Rate Limiter (dspWorker.ts)

**Files:**
- Modify: `lib/dsp/dspWorker.ts:96` (add new state variable)
- Modify: `lib/dsp/dspWorker.ts:654` (add rate limit check in processPeak)
- Modify: `lib/dsp/dspWorker.ts:714` (set timestamp after advisory created)
- Modify: `lib/dsp/dspWorker.ts:470,491` (reset on init/reset)

**Step 1: Add state variable after bandClearedAt (line 96)**

```typescript
// lib/dsp/dspWorker.ts after line 96
// OLD:
const bandClearedAt = new Map<number, number>()
// NEW:
const bandClearedAt = new Map<number, number>()

// Global advisory rate limiter — max 1 NEW advisory per second (updates to existing still allowed)
let lastAdvisoryCreatedAt = 0
const ADVISORY_RATE_LIMIT_MS = 1000
```

**Step 2: Add rate limit check in processPeak, right after `if (!existingId) {` (line 654)**

Insert a new check as the first thing inside the `if (!existingId)` block, before the band cooldown check:

```typescript
// lib/dsp/dspWorker.ts inside processPeak, line ~654
// OLD:
      if (!existingId) {
        // Check 0: band cooldown — suppress if this band was recently cleared
// NEW:
      if (!existingId) {
        // Check -1: global rate limiter — max 1 new advisory per second
        if (peak.timestamp - lastAdvisoryCreatedAt < ADVISORY_RATE_LIMIT_MS) {
          break
        }

        // Check 0: band cooldown — suppress if this band was recently cleared
```

**Step 3: Set timestamp when new advisory is created (after line 714)**

```typescript
// lib/dsp/dspWorker.ts after advisory is set in map (line ~714-715)
// OLD:
      advisories.set(advisoryId, advisory)
      if (!existingId) trackToAdvisoryId.set(track.id, advisoryId)
// NEW:
      advisories.set(advisoryId, advisory)
      if (!existingId) {
        trackToAdvisoryId.set(track.id, advisoryId)
        lastAdvisoryCreatedAt = peak.timestamp
      }
```

**Step 4: Reset rate limiter on init and reset messages**

Find the two locations where `bandClearedAt.clear()` is called (lines ~470 and ~491) and add `lastAdvisoryCreatedAt = 0` after each.

```typescript
// At each location where bandClearedAt.clear() appears:
// OLD:
      bandClearedAt.clear()
// NEW:
      bandClearedAt.clear()
      lastAdvisoryCreatedAt = 0
```

**Step 5: Commit**

```bash
git add lib/dsp/dspWorker.ts
git commit -m "feat(dsp): add global advisory rate limiter (max 1 new/sec)"
```

---

### Task 4: Version Bump (package.json)

**Files:**
- Modify: `package.json:3`

**Step 1: Bump version**

```json
// OLD:
  "version": "1.0.3",
// NEW:
  "version": "1.0.4",
```

**Step 2: Commit**

```bash
git add package.json
git commit -m "chore: bump version to 1.0.4"
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

### Task 6: Commit, Push, PR

**Step 1: Push branch**

```bash
git push origin v1.0.3-release
```

**Step 2: Create PR**

```bash
gh pr create --title "Eliminate false positives and duplicate advisories (v1.0.4)" --body "$(cat <<'EOF'
## Summary
- Raise signal gate thresholds +10 dB across all modes (reject ambient room noise)
- Unify all merge/association windows at 200 cents (eliminate merge gap causing duplicate cards)
- Raise BAND_COOLDOWN_MS to 3s and apply to ALL clears (not just manual dismissals)
- Add global advisory rate limiter (max 1 new advisory per second)
- Raise prominence floor from 8 to 10 dB
- Raise sustainMs to 250ms minimum across all modes
- Raise HOTSPOT_COOLDOWN_MS to 3s

## Test plan
- [ ] `npx tsc --noEmit` passes clean
- [ ] Muted mic → no advisories appear
- [ ] Quiet room ambient → no advisories appear
- [ ] Play audio → advisories appear normally, max ~1/second
- [ ] Stop audio → no re-triggering within 3 seconds
- [ ] Two close tones (990 Hz + 1020 Hz) → single advisory card
- [ ] Sustained tone → hotspot count increments at most once per 3 seconds

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
