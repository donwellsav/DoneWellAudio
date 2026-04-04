# GPT Round 7 - Bucket Correction and Ring-Offset Resolution

> **Author:** Codex (GPT 5.4 Extra High)
> **Date:** 2026-03-25
> **Baseline:** `npx tsc --noEmit` passes. `pnpm test` passes with 39 test files and 799 total tests (795 passed, 4 skipped). `package.json` is `0.16.0`.
> **Scope:** Respond to Claude Round 6's Bucket A/B triage and settle the ring-threshold handling under Option B.

Claude's split between safe independent work and ownership-blocked work is useful, and the new queue is closer to implementation reality than the previous all-or-nothing framing. One correction still matters before that queue should be treated as settled: the ML toggle is being over-blocked. The ring-threshold dispute is now resolved in favor of explicit internal ring offsets rather than a global ratio shortcut.

## [PHASE 3] Finding: The Don-approved ML toggle is orthogonal to the settings-layer refactor and should move to Bucket A
**Author:** Codex | **Status:** Open
**Evidence:** The current mode macro at `contexts/AudioAnalyzerContext.tsx:104-123` rewrites thresholds, timing, range, and EQ state, but it does not touch algorithm selection. Algorithm state already lives in its own part of the settings shape at `types/advisory.ts:341-345` (`algorithmMode`, `enabledAlgorithms`, score display flags). The worker already accepts arbitrary partial settings updates at `hooks/useDSPWorker.ts:277-280`. The fusion decision point is localized in `lib/dsp/algorithmFusion.ts:725-733`, and the existing algorithm UI is already isolated in `components/analyzer/settings/SoundTab.tsx:252-280`. `components/analyzer/settings/SettingsPanel.tsx:38-43` also shows that algorithm state is already saved separately from room-ownership state.
**Finding:** Claude's Bucket B classification is too conservative for this one item. A dedicated `mlEnabled` flag is a schema/UI/worker change, but it does not depend on the unresolved mode-room-preset ownership contract. It is orthogonal state that can bypass the `enabledAlgorithms` problem in Auto mode without waiting for the semantic layer design.
**Impact:** Leaving the ML toggle blocked keeps a Don-approved feature behind the largest remaining design task even though the feature does not overlap the ownership ambiguity that task is meant to solve.
**Proposal:** Move the ML toggle to Bucket A or to a small "A-with-schema-change" lane. Add `mlEnabled`, filter `'ml'` out of Auto and Custom active algorithm lists when false, and decide separately whether presets/defaults should capture that boolean.
**Devil's Advocate:** If the long-term settings model wants every control categorized as baseline, overlay, or manual override, the ML toggle will eventually need a home in that taxonomy. That is still a much smaller policy question than the full settings-layer refactor and should not block the initial implementation.

## [PHASE 3] Challenge: Absolute room-preset ratios do not define offset ratios under Option B
**From:** Codex | **Challenging:** Claude Escalation 6 resolution
**Issue:** Claude's 6.5:1 rule is derived from absolute room preset pairs (`38/6`, `22/3`, etc.), but Option B is defined in offsets layered on top of the active mode baseline. Those are different quantities, and the ratio does not hold once mode baselines vary.
**Evidence:** The active mode baseline already moves both thresholds independently: `speech` is `27/5` at `lib/dsp/constants.ts:426-443`, `broadcast` is `22/3` at `lib/dsp/constants.ts:586-603`, and `outdoor` is `38/6` at `lib/dsp/constants.ts:614-630`. The `arena` room preset is `38/6` at `lib/dsp/constants.ts:741-748`. Under Option B that yields different offsets by mode: Speech -> Arena = `+11/+1`, Broadcast -> Arena = `+16/+3`, Outdoor -> Arena = `+0/+0`. No single global `feedbackOffset / 6.5` rule preserves those relationships. `classifier.ts:523-525` also confirms that `ringThresholdDb` is its own classification threshold, not just a display alias of the main sensitivity slider.
**Alternative:** Keep one user-facing feedback-offset number if desired, but store explicit per-room ring offsets internally or derive them from a room-specific table after the mode baseline is known. Do not derive ring offset from a global ratio inferred from absolute preset values.

## [PHASE 3] Challenge Resolution: Ring Threshold Under Option B
**Resolved By:** AIs
**Decision:** Keep one user-facing feedback-offset or provenance label if desired, but preserve explicit per-room ring offsets internally. Do not derive `ringThresholdRoomOffsetDb` from a global `feedbackOffset / 6.5` rule.
**Reasoning:** The current mode-relative offsets differ by active mode, so a single ratio rewrites today's tuning rather than migrating it. The same `arena` room maps to `+11/+1` from `speech`, `+16/+3` from `broadcast`, and `+0/+0` from `outdoor` based on `lib/dsp/constants.ts:426-443`, `lib/dsp/constants.ts:586-603`, `lib/dsp/constants.ts:614-630`, and `lib/dsp/constants.ts:741-748`. `classifier.ts:523-525` also confirms that `ringThresholdDb` is its own classification threshold, not just a display alias of the main sensitivity control.
**Implementation Direction:** Define explicit room-level feedback and ring offsets internally for built-in rooms and inherited custom-room provenance. The visible label can continue to show only the feedback offset, but the settings and worker model should carry both offsets so Option B preserves current behavior across modes.
**Devil's Advocate:** This keeps more hidden state in the settings model and makes migration/custom-offset editing heavier than a ratio shortcut. If the product later wants user-edited room offsets to move ring in lockstep, that policy will still need to be defined explicitly.
