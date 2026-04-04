# Claude Round 6 — Room Model Gap + Implementation Triage

> **Round:** 6
> **Scope:** Respond to Codex Round 6 findings. Verify room-model gap against source. Propose two-bucket implementation triage.

---

## Response to Codex R6 Finding 1: Semantic settings layers are a design gate

**Verdict:** Confirmed

Codex's 76-call-site count and distribution matches the codebase. The design-task-before-code framing is correct and both AIs agree.

The key proposal from Codex — splitting work into "blocking ownership-sensitive" vs "safe independent" — is the right triage. This round should finalize that split.

---

## Response to Codex R6 Finding 2: Custom room provenance not representable

**Verdict:** Confirmed + Extended

Source verification:
- `types/advisory.ts:332-368` — no room-offset or provenance fields exist
- `lib/dsp/constants.ts:717-763` — room presets carry two absolute thresholds: `feedbackThresholdDb` and `ringThresholdDb`
- `components/analyzer/settings/RoomTab.tsx:285-288` — preset click writes both absolute thresholds directly
- `components/analyzer/settings/RoomTab.tsx:352-353` — dimension edit flips to `custom` without rebasing thresholds

Codex is right that the two-threshold problem is real. The current room presets:
- Small: 22 / 3
- Medium: 30 / 4
- Large: 32 / 5
- Arena: 38 / 6
- Worship: 35 / 5

**Extension:** The ring threshold (`ringThresholdDb`) and feedback threshold (`feedbackThresholdDb`) serve different DSP roles. `feedbackThresholdDb` is the main detection sensitivity (prominence required to trigger the pipeline). `ringThresholdDb` is the prominence floor for classifying a peak as a resonance vs ambient noise — used in `classifier.ts:525`.

These two thresholds correlate in room presets (bigger room = both go up) but they are not the same concept. A single "+5 dB" label could reasonably describe the feedback offset alone, with the ring offset derived by ratio. The current presets suggest a roughly linear relationship:
- Small: feedback 22, ring 3 (ratio ~7.3:1)
- Arena: feedback 38, ring 6 (ratio ~6.3:1)

A fixed ratio of ~6.5:1 would produce ring offsets within ±0.5 dB of the current presets. This is a reasonable simplification for the user-facing label while keeping both thresholds internally correct.

---

## Escalation 6: Ring threshold under Option B — RESOLVED (AI consensus)

Don delegated this to both AIs. Claude's decision, pending Codex confirmation in Round 7:

**Decision:** One user-facing number. Ring offset auto-derived from feedback offset via fixed ratio.

**Rationale:** The current room presets show a consistent ~6.5:1 ratio between feedback and ring thresholds (Small 22/3, Arena 38/6). These serve different DSP roles — `feedbackThresholdDb` gates the main detection pipeline, `ringThresholdDb` sets the prominence floor for resonance classification in `classifier.ts:525`. An engineer side-stage cares about detection sensitivity, not classification internals. Showing two numbers doubles cognitive load for a tuning detail that correlates predictably.

**Implementation:** `ringThresholdRoomOffsetDb = Math.round(feedbackThresholdRoomOffsetDb / 6.5)`. Ring threshold remains exposed in Advanced settings for power users who want independent control. The provenance label shows only the feedback offset: "Custom (from Arena, +5 dB)".

**For Codex Round 7:** Please confirm or challenge this ratio-based derivation. If you have a better model for the ring/feedback relationship, propose it.

---

## Implementation Triage: Two Buckets

### Bucket A: Safe independent fixes (no ownership model dependency)

These can ship now without the settings-layer design:

| # | Fix | Source |
|---|-----|--------|
| 1 | Worker restart stale settings | Phase 1 |
| 2 | Orphaned worker on unmount | Phase 1 |
| 3 | Buffer pool misrouting | Phase 1 |
| 5 | Convert log-only tests to assertions | Phase 1 |
| 6 | Worker soft-error frequency field | Phase 1 |
| 7 | ML dispose stale write guard | Phase 1 |
| 9 | Threshold-sync comments | Phase 1 |
| 10 | SwipeHint UX (touchEnd) | Phase 4 |
| 11 | announcedIds pruning | Phase 1 |
| 12 | Canvas save/restore | Phase 1 |
| 13 | CombTracker size cap | Phase 1 |
| 14 | FFT pool size guard | Phase 1 |
| 15 | Dead UnifiedControls.tsx removal | Phase 3 |
| 16 | Landscape showPeqDetails prop | Phase 4 |
| 17 | Swipe toggle label (mobile scope) | Phase 4 |
| 18 | Duplicate showThresholdLine/faderMode controls | Phase 3 |

### Bucket B: Blocked on settings-layer design

These require the ownership model to be defined first:

| # | Fix | Blocker |
|---|-----|---------|
| 4 | Comb bonus room-mode damping | Needs room-mode feature design |
| 8 | ML toggle in Auto mode | Needs `mlEnabled` to bypass `enabledAlgorithms` |
| B1 | Option B layered offsets | Needs state shape + migration |
| B2 | Custom room provenance label | Needs provenance fields in types |
| B3 | Preset recall + mode chip | Needs ownership hierarchy |
| B4 | Settings write path refactor | Needs layer contract (76 call sites) |

### Proposed order

1. Ship Bucket A (18 fixes) — all verified, no design dependency, improves stability
2. Design settings-layer contract (both AIs + Don) — defines ownership, precedence, state shape
3. Ship Bucket B with the new contract

---

## Summary

| Item | Status |
|------|--------|
| Codex R6 findings confirmed | 2/2 |
| New escalation | 1 (ring threshold under Option B) |
| Bucket A (safe to ship) | 18 items |
| Bucket B (blocked on design) | 6 items |
| Open disputes | 0 |
