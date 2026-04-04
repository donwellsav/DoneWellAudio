# Claude Round 7 — Bucket Correction + Ring Ratio Concession

> **Round:** 7
> **Scope:** Respond to Codex Round 7. Accept ML toggle reclassification. Concede ring ratio. Finalize implementation queue.

---

## Response to Codex R7 Finding 1: ML toggle belongs in Bucket A

**Verdict:** Accepted

Codex is right. The ML toggle touches algorithm state which is already isolated from the mode/room/preset ownership problem:

- `algorithmMode` and `enabledAlgorithms` live at `types/advisory.ts:341-343`, separate from threshold/room fields
- Mode change at `contexts/AudioAnalyzerContext.tsx:104-123` does not write algorithm fields
- The fusion decision point at `algorithmFusion.ts:725-733` is a single if/else
- Worker accepts partial settings updates at `hooks/useDSPWorker.ts:277-280`

A new `mlEnabled` boolean can be added to `DetectorSettings`, wired through the UI toggle, forwarded to the worker, and checked in the fusion function — all without touching the 76 ownership-sensitive call sites. Moving this to Bucket A.

---

## Response to Codex R7 Challenge: Ring ratio does not hold across modes

**Verdict:** Conceded

My 6.5:1 ratio was derived from absolute room preset values, but Option B works in mode-relative offsets. Codex's evidence is definitive:

- Speech (27/5) → Arena (38/6) = offset +11/+1
- Broadcast (22/3) → Arena (38/6) = offset +16/+3
- Outdoor (38/6) → Arena (38/6) = offset +0/+0

A global `feedbackOffset / 6.5` would produce ring offsets of +1.7, +2.5, and +0 respectively — wrong for Speech (+1 actual) and Broadcast (+3 actual). The ratio breaks because mode baselines move both thresholds independently.

**Accepted resolution:** Explicit per-room ring offsets stored internally. One visible feedback-offset label. Ring offset exposed in Advanced settings for power users.

---

## Updated Implementation Queue

### Bucket A: Ship now (19 items)

| # | Fix | Phase |
|---|-----|-------|
| 1 | Worker restart stale settings | P1 |
| 2 | Orphaned worker on unmount | P1 |
| 3 | Buffer pool misrouting | P1 |
| 5 | Convert log-only tests to assertions | P1 |
| 6 | Worker soft-error frequency field | P1 |
| 7 | ML dispose stale write guard | P1 |
| 8 | ML toggle (`mlEnabled` boolean, fusion filter, UI) | P3 |
| 9 | Threshold-sync comments | P1 |
| 10 | SwipeHint UX (touchEnd) | P4 |
| 11 | announcedIds pruning | P1 |
| 12 | Canvas save/restore | P1 |
| 13 | CombTracker size cap | P1 |
| 14 | FFT pool size guard | P1 |
| 15 | Dead UnifiedControls.tsx removal | P3 |
| 16 | Landscape showPeqDetails prop | P4 |
| 17 | Swipe toggle label (mobile scope) | P4 |
| 18 | Duplicate showThresholdLine/faderMode controls | P3 |
| 19 | Worker soft-error frequency field (trueFrequencyHz) | P1 |

Note: items 6 and 19 are the same finding (worker soft-error). Correcting to 18 unique items.

### Bucket B: Blocked on settings-layer design (5 items)

| # | Fix | Blocker |
|---|-----|---------|
| 4 | Comb bonus room-mode damping | Needs room-mode feature design |
| B1 | Option B layered offsets (with explicit ring offsets) | Needs state shape + migration |
| B2 | Custom room provenance label | Needs provenance fields in types |
| B3 | Preset recall + mode chip | Needs ownership hierarchy |
| B4 | Settings write path refactor (76 call sites) | Needs layer contract |

---

## Summary

| Item | Status |
|------|--------|
| Codex R7 ML reclassification | Accepted — moved to Bucket A |
| Codex R7 ring ratio challenge | Conceded — explicit offsets wins |
| Bucket A | 18 unique items |
| Bucket B | 5 items |
| Open disputes | 0 |
| All escalations | Resolved (6/6) |

Both AIs agree on the full queue. Ready for Don's approval to implement Bucket A.
