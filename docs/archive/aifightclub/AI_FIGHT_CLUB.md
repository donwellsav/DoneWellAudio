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
| 3. Controls Overhaul | 5 | 13 | 16 | 0 | 0 |
| 4. UI/UX Redesign | 1 | 1 | 3 | 0 | 0 |

## Round Log

| Round | Author | File | Key Topics |
|-------|--------|------|------------|
| 1 | Codex | `aifightclub/GPT_ROUND_1.md` | Worker crash recovery state drift, restarted-worker lifecycle leak, buffer-pool misrouting, threshold-comment drift, non-gating vulnerability tests, comb bonus asymmetry |
| 1 | Claude | `aifightclub/CLAUDE_ROUND_1.md` | Confirmed all 6 Codex findings, extended 3. Added: Set mutation in UIContext, ML inference race, buffer pool FFT mismatch, canvas state leakage, combTracker growth, timer leak, swipe hint UX, dead code, LUT bounds, comb x gate interaction. 2 escalations for Don. |
| 2 | Codex | `aifightclub/GPT_ROUND_2.md` | Confirmed Claude's stale post-dispose ML write, `announcedIds` growth, swipe-hint UX, and comb x gate interaction. Challenged Set-iteration skip, ML-lag bug framing, timer leak, FFT corruption, missing type-guard, and dead-code claims. Added worker soft-error diagnostic field mismatch. |
| 2 | Claude | `aifightclub/CLAUDE_ROUND_2.md` | Conceded 5 findings (Set iteration, ML lag, timer leak, type guard, dead code). Narrowed FFT buffer to pool contamination. Confirmed Codex soft-error field finding. Relayed Don's escalation answers: room modes affect comb boost, ML toggle approved. Proposed 14-item implementation queue. 0 open disputes. |
| 3 | Codex | `aifightclub/GPT_ROUND_3.md` | Shifted to Phase 3/4: mode-vs-room threshold ownership, partial preset recall, overloaded two-tab settings IA, missing ML-off affordance in Auto mode, and mobile forcing swipe labeling despite the Display toggle. |
| 3 | Claude | `aifightclub/CLAUDE_ROUND_3.md` | Confirmed all 5 Codex Phase 3/4 findings. Extended threshold fight (asymmetric 13-vs-6 field writes), mobile swipe (landscape also missing showPeqDetails). Added: duplicate controls across tabs, landscape prop omission, preset recall doesn't update mode chip. 2 escalations for Don (threshold ownership, mobile forced swipe). |
| 4 | Codex | `aifightclub/GPT_ROUND_4.md` | Confirmed Claude's duplicate-control, landscape `showPeqDetails`, and stale mode-chip findings. Added: Auto mode ignores `enabledAlgorithms`, so a UI-only ML toggle will lie, and the repo still carries a dead parallel `UnifiedControls.tsx` settings surface. |
| 4 | Claude | `aifightclub/CLAUDE_ROUND_4.md` | Relayed Don's decisions on layered room offsets and intentional mobile swipe. Confirmed Codex Round 4 concerns and asked Codex to verify settings mutation asymmetry plus room-preset migration risks. |
| 5 | Codex | `aifightclub/GPT_ROUND_5.md` | Confirmed Claude's mutation-depth and room-migration concerns. Added: `mode` is the only deep settings write path, and switching a named room to `custom` preserves inherited absolute thresholds even after Don selected layered room offsets. |
| 5 | Claude | `aifightclub/CLAUDE_ROUND_5.md` | Confirmed both Codex R5 findings. Proposed semantic write path as design task before code. Escalation 5: custom room behavior under Option B. |
| 6 | Codex | `aifightclub/GPT_ROUND_6.md` | Confirmed Claude's design-task framing with 76 live `onSettingsChange` call sites. Added: Don's approved inherited custom-room provenance is not representable in current state, and room presets currently encode two thresholds, not one signed offset. |
| 6 | Claude | `aifightclub/CLAUDE_ROUND_6.md` | Confirmed both Codex R6 findings. Extended with ring-vs-feedback threshold analysis (6.5:1 ratio). Proposed two-bucket implementation triage: 18 safe fixes (Bucket A) vs 6 design-blocked fixes (Bucket B). Escalation 6: ring threshold under Option B. |
| 7 | Codex | `aifightclub/GPT_ROUND_7.md` | Accepted Claude's overall Bucket A/B triage but reclassified the ML toggle as independent from the settings-layer refactor. Resolved Escalation 6 in favor of explicit internal ring offsets instead of a global 6.5:1 rule. |
| 7 | Claude | `aifightclub/CLAUDE_ROUND_7.md` | Accepted ML toggle reclassification to Bucket A. Conceded ring ratio (explicit offsets wins). Finalized queue: 18 Bucket A items, 5 Bucket B items. 0 open disputes. All 6 escalations resolved. |

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

### Key Findings

- **Mode and room presets silently fight over the same thresholds.** `contexts/AudioAnalyzerContext.tsx:104-118` makes every mode chip rewrite detector thresholds and timing, while `components/analyzer/settings/RoomTab.tsx:285-296` rewrites `feedbackThresholdDb` and `ringThresholdDb` again from the Room tab. The controls are presented as separate concepts but mutate the same live state.
- **"Save as Preset" is only a partial detector snapshot.** `components/analyzer/settings/SettingsPanel.tsx:35-43` excludes room settings, FFT, threshold mode, track limits, harmonic tolerance, and display state from `PRESET_KEYS`; `components/analyzer/settings/SettingsPanel.tsx:69-89` saves and reloads only that partial object. The label says "preset," but recall does not reconstruct the tuned rig state.
- **The live settings IA is a two-tab shell with one overloaded catch-all tab.** `components/analyzer/settings/SettingsPanel.tsx:45-48` exposes only `Sound` and `Display`. The live `Sound` tab then absorbs Room, Calibration, Advanced, Data Collection, and preset management at `components/analyzer/settings/SoundTab.tsx:232-363`, so setup-only and during-show controls are mixed together.
- **Don-approved ML disable is not expressible today, and a UI-only toggle still will not disable ML in Auto mode.** `aifightclub/CLAUDE_ROUND_2.md:20-21` records Don's approval for an ML toggle. `components/analyzer/settings/SoundTab.tsx:253-280` locks the live algorithm grid whenever `algorithmMode === 'auto'`, and `lib/dsp/algorithmFusion.ts:725-733` ignores `enabledAlgorithms` outside `custom`. Any fix that only edits the UI state will ship a lying toggle.
- **The Don-approved ML toggle is orthogonal to the settings-layer refactor.** `contexts/AudioAnalyzerContext.tsx:104-123` does not touch algorithm fields, `types/advisory.ts:341-345` already isolates algorithm state, `hooks/useDSPWorker.ts:277-280` forwards partial settings directly to the worker, and `lib/dsp/algorithmFusion.ts:725-733` has a single decision point for filtering ML out of Auto vs Custom. This fix needs a new boolean and worker/UI wiring, but it does not depend on resolving mode-room-preset ownership.
- **Ring threshold should stay explicit internally under Option B even if the UI shows one room-offset number.** `lib/dsp/constants.ts:426-443`, `lib/dsp/constants.ts:586-603`, `lib/dsp/constants.ts:614-630`, and `lib/dsp/constants.ts:741-748` show that the same room produces different mode-relative offsets (`speech -> arena = +11/+1`, `broadcast -> arena = +16/+3`, `outdoor -> arena = +0/+0`), so a global `feedbackOffset / 6.5` rule would not preserve current tuning. The AI decision is to keep the visible room label focused on feedback offset while storing explicit per-room ring offsets internally.
- **The repo still carries a dead parallel `UnifiedControls.tsx` control surface.** Live layouts mount `SettingsPanel` at `components/analyzer/DesktopLayout.tsx:180-182`, `components/analyzer/MobileLayout.tsx:292-298`, and `components/analyzer/LandscapeSettingsSheet.tsx:47-54`, while `components/analyzer/index.ts:6-7` exports `SettingsPanel` and aliases it as `UnifiedControls`. The standalone `components/analyzer/UnifiedControls.tsx` still contains its own four-subtab IA at `components/analyzer/UnifiedControls.tsx:34-68` and its own preset/defaults logic at `components/analyzer/UnifiedControls.tsx:56-61` and `components/analyzer/UnifiedControls.tsx:181-260`.
- **`mode` is the only deep settings write path; every other control is a shallow patch.** `contexts/AudioAnalyzerContext.tsx:104-123` rewrites 13 fields on mode change, while `hooks/useAudioAnalyzer.ts:382-384` shallow-merges every other `onSettingsChange` call. Preset recall (`components/analyzer/settings/SettingsPanel.tsx:88-89`), room preset clicks (`components/analyzer/settings/RoomTab.tsx:285-296`), manual room edits (`components/analyzer/settings/RoomTab.tsx:348-355`, `components/analyzer/settings/RoomTab.tsx:376-379`), and live controls like sensitivity (`components/analyzer/settings/SoundTab.tsx:101-109`) all patch partial state into the same flat object.
- **Switching a named room to `custom` preserves the last room's absolute thresholds.** Named room buttons write `feedbackThresholdDb` and `ringThresholdDb` at `components/analyzer/settings/RoomTab.tsx:285-289`, but dimension edits (`components/analyzer/settings/RoomTab.tsx:348-355`), treatment edits (`components/analyzer/settings/RoomTab.tsx:376-379`), and auto-detected dimensions (`components/analyzer/settings/RoomTab.tsx:430-436`) only flip `roomPreset` to `custom` without rebasing those thresholds. `lib/dsp/constants.ts:757-764` defines a `custom` preset with `30/4`, but that baseline is never applied, and `types/advisory.ts:333-345` still defines no explicit room-offset state for Don's layered-offset decision.
- **The semantic settings-layer refactor is a cross-cutting design task, not a local patch.** `contexts/AudioAnalyzerContext.tsx:104-123` is still the only semantic multi-field write path, `hooks/useAudioAnalyzer.ts:382-384` still shallow-merges every other update, and repo search on 2026-03-25 found 76 live `onSettingsChange(...)` call sites across `SoundTab` (28), `DisplayTab` (13), `MobileLayout` (13), `AdvancedTab` (7), `RoomTab` (6), `DesktopLayout` (5), `SettingsPanel` (2), `CalibrationTab` (1), and `AudioAnalyzer.tsx` (1). Any ownership-aware settings redesign now spans the entire live control surface.
- **Don's approved inherited custom-room provenance is not representable in current state, and room presets do not reduce to one offset.** `aifightclub/AI_FIGHT_CLUB.md:154` records the chosen behavior: `Custom` inherits the prior room offset with visible provenance. `types/advisory.ts:333-368` still has no room-offset or provenance fields, `components/analyzer/settings/RoomTab.tsx:278-305` can only render static preset labels, and the custom transition paths at `components/analyzer/settings/RoomTab.tsx:348-355`, `components/analyzer/settings/RoomTab.tsx:376-379`, and `components/analyzer/settings/RoomTab.tsx:430-436` only flip `roomPreset` to `custom`. `lib/dsp/constants.ts:717-755` also shows the current room presets carry two absolute thresholds (`small 22/3`, `large 32/5`, `arena 38/6`, `worship 35/5`), while the live UI exposes separate `feedbackThresholdDb` and `ringThresholdDb` controls at `components/analyzer/settings/SoundTab.tsx:101-109` and `components/analyzer/settings/SoundTab.tsx:161-164`.

**Claude Round 3 additions:**
- **showThresholdLine and faderMode duplicated across both tabs.** `SoundTab.tsx:116-125` and `DisplayTab.tsx:84-94` expose identical controls for the same state. Two apparently-independent controls, one state.
- **Custom preset recall doesn't update mode chip.** `PRESET_KEYS` excludes `mode`, so loading a Speech-threshold preset while in Live Music mode shows "Live Music" highlighted with Speech thresholds active.

---

## Phase 4: UI/UX Redesign

### Key Findings

- **`Swipe to Label` is now a labeling bug, not an interaction bug.** `components/analyzer/settings/DisplayTab.tsx:47-51` exposes a generic `Swipe to Label` setting, desktop honors it at `components/analyzer/DesktopLayout.tsx:161-162` and `components/analyzer/DesktopLayout.tsx:244-245`, while mobile intentionally forces swipe mode at `components/analyzer/MobileLayout.tsx:257` and `components/analyzer/MobileLayout.tsx:388`. `aifightclub/CLAUDE_ROUND_4.md:5-7` records Don's decision that forced mobile swipe is intentional for space. The remaining fix is to relabel or scope the setting so mobile no longer promises an opt-out it does not offer.

**Claude Round 3 addition:**
- **Landscape mobile layout missing `showPeqDetails` prop.** Portrait passes `showPeqDetails={settings.showPeqDetails}` at `components/analyzer/MobileLayout.tsx:258-259`, but the landscape instance omits the prop at `components/analyzer/MobileLayout.tsx:388-391`. PEQ detail display disappears on phone rotation.

### Escalations for Don

**3. Mode vs Room Threshold Ownership** — RESOLVED. Project owner selected Option B: layered offsets. Mode owns base threshold, room applies signed offset.

**4. Mobile Forced Swipe Gestures** — RESOLVED. Project owner confirmed intentional for space optimization. Fix is label only.

**5. Custom Room Behavior Under Option B** — RESOLVED. Project owner selected inherited offset with visible provenance label (e.g. "Custom (from Arena, +5 dB)").

**6. Ring Threshold Under Option B** — RESOLVED (AI consensus, pending Codex R7 confirmation). One user-facing number. Ring offset auto-derived from feedback offset via ~6.5:1 ratio. Ring threshold remains in Advanced settings for power users.

**Round 7 status on Escalation 6** - RESOLVED by AI direction and superseding the prior ratio-based consensus. The chosen direction is to keep one visible feedback-offset or provenance label if desired, but preserve explicit per-room ring offsets internally rather than derive them from a global `feedbackOffset / 6.5` rule. The current mode-relative offsets differ by active mode (`speech 27/5 -> arena 38/6` = `+11/+1`, `broadcast 22/3 -> arena 38/6` = `+16/+3`, `outdoor 38/6 -> arena 38/6` = `+0/+0`), so the global ratio would not preserve today's tuning.

## Implementation Queue

| # | Change | Proposed By | Agreed By | Don Approved | Status |
|---|--------|-------------|-----------|--------------|--------|
