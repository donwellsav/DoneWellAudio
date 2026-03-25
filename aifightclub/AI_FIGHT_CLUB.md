# AI FIGHT CLUB - Adversarial Deep Audit

> **Created:** 2026-03-24
> **Participants:** Claude Code Desktop (Opus 4.6, 1M) + Codex Desktop (GPT 5.4 Extra High)
> **Referee:** Don (Sound Engineer, Project Owner)
> **Repo:** C:\DoneWellAV\DoneWellAudio (shared, both have full access)
> **Status:** Phase 1 - Deep Audit

## Ground Rules

- Both AIs are equals in planning. Only Claude touches code, only after Don approves.
- Evidence required on all findings (file paths, line numbers, actual values, math).
- Every proposal needs a Devil's Advocate section (what could go wrong).
- Sound engineering questions go to Don - he is the domain expert.
- Big warnings (detection regressions, production risks) go to Don immediately.
- No limit on findings - the more corrections, bugs, and optimizations the better.
- Disagreements escalated to Don with both positions clearly stated.

## Phases

1. **Deep Code Audit** - Dead code, redundant computation, missed optimizations, edge cases
2. **Feedback Pipeline Audit** - Algorithm weights, gate interactions, classifier math, fusion logic
3. **Controls & Settings Overhaul** - Ignore existing presets. Build from ground up. What does a sound engineer actually need?
4. **UI/UX Redesign** - Mobile FOH, desktop studio, tablet side-stage. Every control must justify its existence.

## Scoreboard

| Phase | Claude Findings | Codex Findings | Agreements | Open Disputes | Escalations |
|-------|----------------|----------------|------------|---------------|-------------|
| 1. Deep Code Audit | 7 | 6 | 11 | 0 | 0 |
| 2. Pipeline Audit | 1 | 1 | 2 | 0 | 0 |
| 3. Controls Overhaul | 0 | 0 | 0 | 0 | 0 |
| 4. UI/UX Redesign | 0 | 0 | 0 | 0 | 0 |

## Round Log

| Round | Author | File | Key Topics |
|-------|--------|------|------------|
| 1 | Codex | `aifightclub/GPT_ROUND_1.md` | Worker crash recovery state drift, restarted-worker lifecycle leak, buffer-pool misrouting, threshold-comment drift, non-gating vulnerability tests, comb bonus asymmetry |
| 1 | Claude | `aifightclub/CLAUDE_ROUND_1.md` | Confirmed all 6 Codex findings, extended 3. Added: Set mutation in UIContext, ML inference race, buffer pool FFT mismatch, canvas state leakage, combTracker growth, timer leak, swipe hint UX, dead code, LUT bounds, comb x gate interaction. 2 escalations for Don. |
| 2 | Codex | `aifightclub/GPT_ROUND_2.md` | Confirmed Claude's stale post-dispose ML write, `announcedIds` growth, swipe-hint UX, and comb x gate interaction. Challenged Set-iteration skip, ML-lag bug framing, timer leak, FFT corruption, missing type-guard, and dead-code claims. Added worker soft-error diagnostic field mismatch. |
| 2 | Claude | `aifightclub/CLAUDE_ROUND_2.md` | Conceded 5 findings (Set iteration, ML lag, timer leak, type guard, dead code). Narrowed FFT buffer to pool contamination. Confirmed Codex soft-error field finding. Relayed Don's escalation answers: room modes affect comb boost, ML toggle approved. Proposed 14-item implementation queue. 0 open disputes. |

---

## Phase 1: Deep Code Audit

### Key Findings

<!-- Both AIs add findings here as they emerge -->

- **Worker restart replays stale settings after a crash.** `hooks/useDSPWorker.ts:195-226` restarts from `lastInitRef`, but `hooks/useDSPWorker.ts:277-280` never updates that snapshot when settings change. `hooks/useAudioAnalyzer.ts:309-316` keeps sending live settings to the current worker, so a recovered worker can silently come back with old thresholds and mode state.
- **Auto-restarted workers are not terminated on unmount.** `hooks/useDSPWorker.ts:216-221` creates a replacement worker, while the cleanup at `hooks/useDSPWorker.ts:241-244` only terminates the original closed-over instance. Crash + unmount currently leaves the replacement worker orphaned.
- **`spectrumUpdate` buffers are returned to the wrong pool.** `hooks/useDSPWorker.ts:330-346` allocates from `specUpdatePoolRef`, but `hooks/useDSPWorker.ts:155-159` returns all spectrum buffers to `specPoolRef`. The worker does send the buffers back (`lib/dsp/dspWorker.ts:352-375`), but the caller never reuses them for the periodic content-type feed.
- **Threshold-sync comments are already lying about shipped tolerances.** `lib/dsp/constants.ts:352` uses 100 cents for track association while `lib/dsp/constants.ts:360` and `lib/dsp/constants.ts:656` claim the 200-cent harmonic tolerances are "synced" to that same setting. The code may be intentional; the comments are not.
- **Some "critical vulnerability" tests are documentation, not guards.** `tests/dsp/algorithmFusion.gpt.test.ts:76-85` logs a false negative without any assertion, and `tests/dsp/algorithmFusion.chatgpt-context.test.ts:360-363` contains a pure `expect(true).toBe(true)` placeholder. CI is green even when those scenarios are only narrated.
- **Worker soft-error logs currently lose the real peak frequency.** `lib/dsp/dspWorker.ts:688-693` formats `msg.peak.frequency`, but `types/advisory.ts:55-58` only defines `trueFrequencyHz`. A real worker soft error will log `undefinedHz` unless this diagnostic path is corrected and covered by an executable test.

**Claude Round 1 additions:**
- **Set mutation during iteration in UIContext.** `contexts/UIContext.tsx:74-83` deletes from a Set while iterating with `for...of`. Can skip stale DOM refs after RTA fullscreen toggle.
- **ML inference race - first prediction always null.** `lib/dsp/mlInference.ts:127-140` `predictCached()` returns `_lastPrediction` which is null on first call. ML fusion lags by 1+ frames.
- **ML inference after dispose writes stale data.** `lib/dsp/mlInference.ts:172-183` - async inference in-flight when `dispose()` runs completes and writes after cleanup.
- **Buffer pool corruption on FFT size change.** `hooks/useDSPWorker.ts:294-301` - pool flush discards all buffers but in-flight old-size buffer returns to new pool. `Float32Array.set()` with mismatched lengths throws.
- **Canvas globalAlpha state leakage.** `lib/canvas/spectrumDrawing.ts:217-223` - no `save()`/`restore()` around alpha changes. Exception corrupts subsequent drawing.
- **CombTracker Map unbounded growth.** `lib/dsp/dspWorker.ts:421-423` - pruning every 50 frames insufficient for broadband transients. Stale entries accumulate.
- **announcedIds Set unbounded.** `components/analyzer/IssuesList.tsx:122` - accessibility announcement ID set grows indefinitely over multi-hour sessions.
- **SwipeHint dismissed on touchStart.** `components/analyzer/IssuesList.tsx:272` - hint vanishes before users can read it.
- **Worker message missing type guard.** `lib/dsp/dspWorker.ts` - `msg.peak` accessed without existence check in `processPeak` handler.
- **Deprecated predict() is dead code.** `lib/dsp/mlInference.ts:82-106` - never called, marked deprecated. Should be removed.
- **LUT indexing with out-of-range dB.** `feedbackDetector.ts:1094-1095` - when `analysisMinDb < -100` (MEMS cal), LUT clamp gives 16x error. Negligible impact (sub-noise-floor bins).
- **IssuesList timer leak on unmount.** `components/analyzer/IssuesList.tsx:94-105` - deferred update timer fires on unmounted component. No-op in React 19 but wasteful.

### Agreements

Claude confirmed all 5 of Codex's Phase 1 findings with code evidence. Ready for Don's review:
1. Worker restart stale settings (Codex #1) - CONFIRMED + EXTENDED
2. Auto-restarted worker not terminated on unmount (Codex #2) - CONFIRMED
3. spectrumUpdate buffer pool misrouting (Codex #3) - CONFIRMED
4. Threshold-sync comment drift (Codex #4) - CONFIRMED
5. Placeholder/log-only tests (Codex #5) - CONFIRMED + EXTENDED (1 placeholder + 30+ log-only)
6. ML inference after dispose writes stale cached state (Claude #3) - CONFIRMED by Codex Round 2
7. `announcedIds` grows monotonically for the life of `IssuesList` (Claude #7) - CONFIRMED by Codex Round 2, low severity
8. SwipeHint dismisses on `touchStart` before users finish reading it (Claude #8) - CONFIRMED by Codex Round 2

### Open Disputes

All 6 Round 2 disputes resolved. See aifightclub/CLAUDE_ROUND_2.md for details.
- Set iteration: Withdrawn (readability refactor, not bug)
- ML first-frame null: Withdrawn (intentional design)
- IssuesList timer: Withdrawn (cleanup correct)
- FFT buffer: Narrowed to pool contamination
- Worker type guard: Withdrawn (defense-in-depth only)
- predict() label: Corrected to deprecated, not dead

---

## Phase 2: Feedback Pipeline Audit

### Key Findings

- **Comb bonus flips borderline verdicts by construction.** (Codex) `algorithmFusion.ts:804-806` doubles comb weight in numerator only. Delta of 0.078 can push 0.55->0.63 over threshold. Claude confirmed - intentional design, documented in code comments.
- **Comb doubling interacts with post-fusion multiplicative gates.** (Claude, confirmed by Codex Round 2) Comb inflation happens before IHR/PTMR gates. Inflated base partially resists gate suppression. Interaction may be correct (comb is strong evidence) but is undocumented.

### Escalations for Don

**1. Comb 2x Boost Policy** - Is a stable comb pattern (evenly-spaced, non-sweeping peaks) basically always feedback in live sound? Or can room modes, speaker crossover artifacts create similar patterns? Both AIs agree the boost is intentional; we need Don's domain expertise on whether the policy is correct.

**2. ML Inference 1-Frame Lag** - RESOLVED. Claude withdrew this as a bug (intentional design). Don approved adding an ML toggle in Advanced settings so engineers can disable ML entirely if preferred.

---

## Phase 3: Controls & Settings Overhaul

<!-- Ignore existing presets. Build from ground up. -->

---

## Phase 4: UI/UX Redesign

<!-- Controls through the eyes of a live sound engineer -->

---

## Implementation Queue

| # | Change | Proposed By | Agreed By | Don Approved | Status |
|---|--------|-------------|-----------|--------------|--------|
