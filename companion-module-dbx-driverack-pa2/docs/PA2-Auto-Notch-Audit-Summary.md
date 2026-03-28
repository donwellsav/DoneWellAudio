# PA2 Auto-Notch Pipeline

Detection to Cut - Deep Code Audit

DoneWell Audio | March 2026 | 6 files | 3,893 lines | 11 bugs | 11 gaps | 4 optimizations

This summary is code-derived from the current source tree. Existing markdown and legacy notes were not treated as source of truth.

Use [PA2-Auto-Notch-Code-Audit.md](./PA2-Auto-Notch-Code-Audit.md) for the longer narrative and merged module-level findings.

## 1. Executive Summary

Comprehensive code audit of the PA2 Auto-Notch Pipeline, covering the full path from browser-side feedback detection through to physical EQ cuts on dbx DriveRack PA2 hardware.

| Category | Count | Impact |
|---|---:|---|
| Critical Bugs | 5 | Double-cut audio, wrong output routing, output-level slot mistakes |
| High Bugs | 2 | GEQ accumulation, macros can generate undefined writes |
| Medium Bugs | 4 | Wrong filter type, listener leak, race risk, Q-blind depth |
| Gaps | 11 | No verify loop, no release logic, missing bridge tests |
| Optimizations | 4 | Polling, signals, dedup reuse, batching/serialization |

## 2. Architecture

| # | File | Lines | Role |
|---|---|---:|---|
| 1 | `lib/pa2/advisoryBridge.ts` | 234 | Advisory to GEQ/PEQ mapping |
| 2 | `hooks/usePA2Bridge.ts` | 453 | Polling, auto-send, state |
| 3 | `lib/pa2/pa2Client.ts` | 226 | HTTP client |
| 4 | `types/pa2.ts` | 276 | TypeScript interfaces |
| 5 | `companion-module-dbx-driverack-pa2/src/main.js` | 1739 | HTTP handler, TCP transport, notch tracking |
| 6 | `companion-module-dbx-driverack-pa2/src/pa2-protocol.js` | 965 | Command builder, parser |

## 3. Workflow

Severity levels from feedback detection:

| Severity | Meaning | Depth |
|---|---|---:|
| `RUNAWAY` | Exponential growth | `-12 dB` |
| `GROWING` | Sustained rise | `-6 dB` |
| `RESONANCE` | Room mode | `-3 dB` |
| `WHISTLE` | Pure tone | `-4 dB` |

Bridge functions:

- `advisoriesToGEQCorrections()` maps log-space frequency to the nearest ISO GEQ band.
- `advisoriesToDetectPayload()` forwards exact Hz, Q, and confidence for PEQ/notch work.
- `advisoriesToHybridActions()` decides whether an advisory becomes GEQ, PEQ, or both.

Companion processing:

1. Connection check (`READY`)
2. Confidence filter (`0.8`)
3. `_routeToOutput()` crossover routing
4. `1/3`-octave dedup
5. PEQ slot allocation
6. `buildCommand('peq_filter')`

## 4. Bugs

### B9: Both Mode Double-Cuts

`CRITICAL` | `hooks/usePA2Bridge.ts:331-371`

Problem:

The same advisory can be sent as both GEQ and PEQ. A nominal `-6 dB` action becomes an effective `-12 dB` stack.

Fix:

Partition narrow and urgent issues to PEQ and broad issues to GEQ.

### B1: Hybrid Drops Confidence/Q

`CRITICAL` | `hooks/usePA2Bridge.ts:312-317`

Problem:

Hybrid mode hardcodes `confidence: 0.9` and drops the advisory Q.

Fix:

Forward the actual confidence and Q.

### B4: /approve Global Slot Check

`CRITICAL` | `companion-module-dbx-driverack-pa2/src/main.js:1494-1500`

Problem:

Approval checks all slots globally instead of the slots on the routed output.

Fix:

Filter used filters by output before slot allocation.

### B10: Routing Fails on HPF Bypass

`CRITICAL` | `companion-module-dbx-driverack-pa2/src/main.js:856-869`

Problem:

`hpFreq = 0` is falsy, so the crossover guard can collapse and send everything to `High`.

Fix:

Check `lpFreq` or an explicit bypass/loaded condition instead of treating `0` as false.

### B3: /approve Wrong Output

`CRITICAL` | `companion-module-dbx-driverack-pa2/src/main.js:1513`

Problem:

The response reports `High` even when the command actually routes to `Mid` or `Low`.

Fix:

Return `approveOutput`.

### B7: GEQ Accumulates Per Cycle

`HIGH` | `lib/pa2/advisoryBridge.ts:119-131`

Problem:

GEQ corrections are additive against current state every cycle, so repeated passes ratchet deeper.

Fix:

Track applied state and send deltas only.

### B11: Macro Param Keys Wrong

`HIGH` | `companion-module-dbx-driverack-pa2/src/pa2-protocol.js:729-742`

Problem:

Macro calls pass `{ level: ... }` where the underlying handlers expect `{ value: ... }`.

Fix:

Fix the parameter keys.

### B6: Depth Ignores Q

`MEDIUM` | `lib/pa2/advisoryBridge.ts:58-68`

Problem:

`Q = 16` and `Q = 4` get the same depth.

Fix:

Add a Q-scaling factor.

### B8: Bell Not Notch

`MEDIUM` | `companion-module-dbx-driverack-pa2/src/main.js:1446`

Problem:

The auto-notch path writes `Bell`, which has a wider skirt than a true notch.

Fix:

Use a true notch-capable filter type if the PA2 supports it in this path.

### B5: AbortSignal Leak

`MEDIUM` | `lib/pa2/pa2Client.ts:215-225`

Problem:

`mergeAbortSignals()` adds listeners with no explicit cleanup before abort.

Fix:

Use `AbortSignal.any()` where available, or remove listeners on first abort.

### B12: Poll vs Auto-Send Race

`MEDIUM` | `hooks/usePA2Bridge.ts`

Problem:

Polling and auto-send consume the same moving PA2 state snapshot, so the bridge can compute actions against stale or mid-update state.

Fix:

Separate read snapshots from write planning, or gate auto-send while a sync cycle is in flight.

## 5. Gaps

- G1: No closed-loop verification after notch placement
- G2: No automatic notch release when advisories resolve
- G3: No per-output slot ownership persistence across reconnect
- G4: No AFS coordination before placing a manual notch
- G5: No depth ramping from mild to aggressive cuts
- G6: Panic mute setting exists but is unwired
- G7: No slot prioritization when the output is full
- G8: No closed-loop success metric exposed to the UI
- G9: No hardware-state reconciliation before release/delete
- G10: No transactional acknowledgement before ownership mutation
- G11: No dedicated test coverage for the bridge layer

## 6. Optimizations

| ID | Area | Opportunity |
|---|---|---|
| O1 | Polling | Collapse poll and auto-send into one coherent state cycle so planning never runs on a mid-refresh snapshot |
| O2 | Signals | Replace custom signal fan-in with `AbortSignal.any()` or explicit cleanup to reduce listener churn |
| O3 | Dedup reuse | Move route, dedup, and slot planning into one shared planner for `auto`, `approve`, and `both` |
| O4 | Batching | Serialize writes through one queue and batch compatible operations without sacrificing ordering guarantees |

## 7. Recommendations

| # | Bug | Fix | Effort |
|---|---|---|---:|
| 1 | B9 | Partition both mode | 2h |
| 2 | B1 | Forward confidence/Q | 1h |
| 3 | B4 + B3 | Per-output slots + correct response | 30m |
| 4 | B10 | Fix routing guard | 30m |
| 5 | B11 | Fix macro keys | 15m |
| 6 | B7 | Delta-only corrections | 2h |

Recommended implementation order:

1. Readiness gating and routing correctness
2. Queue serialization and transactional acknowledgement
3. Slot ownership persistence and per-output allocation
4. Bridge-side confidence/Q propagation and both-mode partitioning
5. Delta GEQ corrections, depth ramping, and verification/release loops

## 8. Risk Matrix

| Likelihood \ Impact | Low | Medium | High |
|---|---|---|---|
| Certain | Bell vs notch mismatch | GEQ accumulation | Both-mode double-cut |
| Likely | Polling inefficiency | Confidence/Q drop, macro key mismatch | HPF-bypass routing failure |
| Possible | Abort listener leak | Q-blind depth, poll/send race | Missing closed-loop verification |

## 9. Engineering Guide

### Beginner

Audio feedback is speaker output re-entering the microphone. This pipeline detects it and attempts to cut it before it grows.

- `GEQ`: 31 fixed-width bands for broad corrections
- `PEQ`: variable-width filters for surgical notches
- `Q Factor`: filter narrowness; `Q=16` is very narrow, `Q=2` is wide
- `Severity`: `RUNAWAY` is emergency, `GROWING` is worsening, `RESONANCE` is mild

### Intermediate

Stage 1:

- FFT and fused feedback analysis run repeatedly in the browser.

Stage 2:

- Frequency maps to a GEQ band or an exact PEQ frequency.
- Severity maps to a cut depth.

Stage 3:

- The bridge sends HTTP to the companion module.
- The companion module turns HTTP into PA2 TCP writes.

### Advanced

Confidence layers:

| Layer | Default | Purpose |
|---|---|---|
| Advisory | varies | Worth reporting? |
| Bridge | `0.7 / 0.6` | Worth sending? |
| Companion | `0.8` | Worth cutting? |

Dedup layers:

1. Advisory: global + per-band timing gates
2. Bridge: deepest cut wins
3. Companion: `1/3`-octave proximity
4. Auto-send: interval gate
