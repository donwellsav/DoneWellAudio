# PA2 Auto-Notch Pipeline Code Audit

Date: 2026-03-28
Scope: `src/main.js`, `src/pa2-protocol.js`, `src/actions.js`, `src/variables.js`, `test/test-protocol.js`
Method: code-derived only. Existing markdown and docx files were not treated as source of truth for findings.

## Executive Summary

The current PA2 auto-notch path is a workable prototype, not a production-safe detection-to-cut engine yet.

What already works:

- `test/test-protocol.js` passes `89/89`, so the protocol parser and command builder are in decent shape for their current scope.
- The HTTP layer cleanly separates `auto`, `suggest`, and `approve` modes.
- The auto path has a basic 1/3-octave dedup rule.
- The module does check `this.connState === 'READY'` before destructive auto-notch endpoints run.

What is not safe yet:

- `READY` happens before the initial PA2 state is actually loaded.
- Slot ownership lives only in memory and is never rebuilt from actual PEQ state.
- PEQ writes are fired without a shared command queue or acknowledgement-driven commit.
- The approval path does not behave the same way as the auto path.
- Status variables over-report success and under-report uncertainty.

Bottom line:

- The current implementation can place useful demo notches.
- It can also misroute cuts, reuse the wrong slot after reconnect, or return success before the PA2 has confirmed the write.

## Current Detection-To-Cut Flow

1. Companion reaches `READY` after handshake and topology discovery.
2. `_readAllState()` starts and sends the initial `get` sweep.
3. `stateLoaded` flips later from a timer, not from observed completion.
4. `POST /detect` accepts `body.frequencies`.
5. Each detection is filtered by `det.type === 'feedback'`.
6. Confidence is compared against `this.config.notchConfidenceThreshold || 0.8`.
7. Q is clamped to `4..16`.
8. `suggest` and `approve` modes append to `autoNotch.pending`.
9. `auto` mode calls `_routeToOutput(det.hz)`.
10. `auto` mode dedups against `autoNotch.slotsUsed`.
11. It allocates the first free PEQ band `1..8` on the routed output.
12. It builds `peq_filter` commands and calls `this.sendCommands(cmds)`.
13. It immediately mutates `autoNotch.slotsUsed` and returns HTTP success.

## Workflow Timeline

| Phase | Approx timing | Current behavior |
|---|---:|---|
| Topology discovered | `t=0` | Module transitions to `READY` before initial state is fully loaded |
| Initial read queued | `t=0..~880ms` | `_readAllState()` sends the `get` sweep at `5ms` spacing |
| State marked loaded | `t=5s` minimum | Timer-driven, not acknowledgement-driven |
| `POST /detect` arrives | any time after `READY` | Request is accepted even if `stateLoaded === false` |
| Route + dedup + allocate | immediate | Depends on in-memory crossover and slot ledger |
| PEQ writes fired | immediate | `sendCommands()` starts async work |
| HTTP success returned | immediate | Happens before PA2 acknowledgement or echo reconciliation |

One new notch results in up to four PA2 commands:

- `Band_n_Type`
- `Band_n_Frequency`
- `Band_n_Gain`
- `Band_n_Q`

Those commands are issued by `sendCommands()` with a `5ms` delay between sends, but the caller usually does not `await` the method.

## Findings Summary

| ID | Severity | Title | Primary refs |
|---|---|---|---|
| AN-001 | Critical | Detection can run before PA2 state is actually loaded | `src/main.js:287-300`, `src/main.js:469-481`, `src/main.js:1373-1452` |
| AN-002 | Critical | No transactional acknowledgement model for notch placement | `src/main.js:1063-1076`, `src/main.js:1423-1452`, `src/main.js:1511-1513` |
| AN-003 | Critical | No shared command queue; async writes can interleave | `src/main.js:1071-1076`, `src/main.js:1427`, `src/main.js:1450`, `src/main.js:1511`, `src/main.js:1545`, `src/main.js:1565` |
| AN-004 | Critical | Slot ownership is memory-only and not reconciled from PEQ state | `src/main.js:382-395`, `src/main.js:931-940`, `src/main.js:1451`, `src/main.js:1567-1568`, `src/main.js:1728-1734` |
| AN-005 | High | Approval path allocates slots globally and reports the wrong output | `src/main.js:1495-1513` |
| AN-006 | High | Threshold fallback and action telemetry are logically wrong | `src/main.js:1380-1382`, `src/main.js:1401-1408`, `src/variables.js:169-194` |
| AN-007 | High | Request validation is too weak for destructive hardware writes | `src/main.js:1378-1399`, `src/pa2-protocol.js:425-436` |
| AN-008 | High | Pending items are keyed by frequency, not by detection identity | `src/main.js:1405-1408`, `src/main.js:1482-1494`, `src/main.js:1532-1537` |
| AN-009 | High | Dedup exists in auto mode only; approve mode can stack near-duplicate cuts | `src/main.js:1413-1434`, `src/main.js:1493-1513` |
| AN-010 | High | Release/delete zeroes gain only; it does not restore or truly clear a slot | `src/main.js:1541-1548`, `src/main.js:1560-1568` |
| AN-011 | Medium | PEQ enable/state sync gaps weaken correctness | `src/main.js:488-547`, `src/main.js:534-535`, `src/main.js:1423-1450` |
| AN-012 | Medium | `_routeToOutput()` depends on optimistic crossover assumptions | `src/main.js:855-869`, `src/main.js:1023-1036`, `src/main.js:1720-1724` |
| AN-013 | Medium | `detect_active` and `autoNotch.active` are dead telemetry fields | `src/variables.js:169-194`, `src/main.js:1728-1734` |
| AN-014 | High | Test coverage stops at the protocol layer; the risky HTTP path is untested | `test/test-protocol.js:1-209` |

## Detailed Findings

### AN-001 - Detection can run before PA2 state is actually loaded

`READY` is set before `_readAllState()` finishes and before `stateLoaded` flips true. The auto-notch endpoints gate on `connState === 'READY'`, not on `stateLoaded`.

Impact:

- Early detections can route everything to `High` because crossover defaults are still zeroed.
- Early detections can allocate slots against an empty `slotsUsed` ledger before PEQ state is understood.
- The code has a `stateLoaded` flag specifically for this problem, but the detection pipeline never checks it.

Recommended fix:

- Require both `connState === 'READY'` and `stateLoaded === true` for all auto-notch write endpoints.
- Prefer an acknowledgement-driven initial-load completion rule instead of the current timer.

### AN-002 - No transactional acknowledgement model for notch placement

The auto path mutates `autoNotch.slotsUsed` immediately after calling `this.sendCommands(cmds)`. The approval path does the same. There is no observed PA2 confirmation before in-memory ownership changes or HTTP success responses.

Impact:

- If a write fails halfway through, the module can believe a notch exists when the PA2 only has a partial filter.
- Error logging is decoupled from slot ownership, so the ledger can drift permanently until cleared.
- Clients receive `notch_placed` even when the command stream has not been confirmed.

Recommended fix:

- Introduce a pending write state and finalize ownership only after the expected PA2 echo lines are observed.
- Return a richer status such as `queued`, `applied`, or `failed`.

### AN-003 - No shared command queue; async writes can interleave

`sendCommands()` is `async`, but the auto-notch handlers do not `await` it. Multiple requests, or multiple detections inside one request, can start overlapping command streams.

Impact:

- Two notch writes can interleave as `Type A`, `Type B`, `Freq A`, `Freq B`, and so on.
- Release/delete traffic can overlap with placement traffic.
- The code comments still say "20ms spacing" while the implementation uses `5ms`, so expectations are already out of sync with reality.

Recommended fix:

- Add a single PA2 command queue that serializes all non-burst writes.
- Make the auto-notch endpoints `await` queue completion or at least queue admission.
- Keep `sendCommandsBurst()` reserved for GEQ sweeps only.

### AN-004 - Slot ownership is memory-only and not reconciled from PEQ state

The module reads all PEQ bands into `pa2State.peq`, but `autoNotch.slotsUsed` is a separate in-memory ledger with no rebuild path.

Impact:

- The next auto-notch run can grab a PEQ band already used by the operator.
- `DELETE /notches` and `POST /notches/release` can wipe the wrong hardware filter if the ownership ledger is stale.
- The code has enough state to inspect real PEQ values, but it does not use that data to reserve or classify slots.

Recommended fix:

- Persist ownership metadata and rebuild it on startup.
- Reconcile `slotsUsed` against actual PEQ state before allocating or releasing.
- Refuse destructive actions if ownership confidence is low.

### AN-005 - Approval path allocates slots globally and reports the wrong output

The auto path filters used filters by output. The approval path does not; it uses `slots.map((s) => s.filter)` across every output band. It also returns `output: 'High'` in the action payload even after routing to `Mid` or `Low`.

Recommended fix:

- Make approval use the same allocation and dedup code path as auto mode.
- Return the actual routed output in the action payload.

### AN-006 - Threshold fallback and action telemetry are logically wrong

The confidence threshold uses `this.config.notchConfidenceThreshold || 0.8`. A configured value of `0` is treated as falsy and replaced by `0.8`, even though the config UI allows `0`. The pipeline also sets `lastDetectAction` before outcome resolution, and in `approve` mode it sets `NOTCHED` before anything is approved. `detect_active` is defined but never updated.

Recommended fix:

- Replace `||` with `??` for config fallback.
- Set `lastDetectAction` from the actual resolved result.
- Wire `detect_active` and `autoNotch.active` to real lifecycle events or remove them.

### AN-007 - Request validation is too weak for destructive hardware writes

The endpoint accepts arbitrary objects from `body.frequencies` with only basic field checks. `det.confidence` can be `undefined`, which bypasses the threshold comparison. `det.hz` can be missing or invalid, which then flows into routing and command building.

Recommended fix:

- Add strict schema validation for arrays, frequency range, confidence range, Q range, and allowed `type` values.
- Reject the entire request or each invalid detection explicitly.

### AN-008 - Pending items are keyed by frequency, not by detection identity

Pending approvals are matched using numeric frequencies in `approve` and `reject`. There is no generated detection ID. `clientId` exists but is not used as the approval key.

Recommended fix:

- Generate a stable server-side `detectionId`.
- Approve/reject by `detectionId`, not by frequency.

### AN-009 - Dedup exists in auto mode only; approve mode can stack near-duplicate cuts

The auto path applies a 1/3-octave dedup rule. The approval path does not. Approving a pending item allocates a new slot without checking for a nearby active notch.

Recommended fix:

- Extract route/dedup/allocate into one planner used by both paths.

### AN-010 - Release/delete zeroes gain only; it does not restore or truly clear a slot

Release and delete call `peq_filter` with `gain: 0` and `q: 4`, but they keep the filter type as `Bell` and retain the slot number. They also do not restore any prior operator state.

Recommended fix:

- Define a real clear/reset strategy for owned slots.
- Preserve and restore the prior slot state when the module claims ownership.

### AN-011 - PEQ enable/state sync gaps weaken correctness

The module does not ensure the destination PEQ block is enabled before placing a notch. `_subscribeAll()` subscribes to `High Outputs PEQ` enable only, and it does not subscribe to PEQ band values for any output.

Recommended fix:

- Refuse auto-notch writes into disabled PEQ blocks or enable them explicitly with operator-visible telemetry.
- Subscribe to PEQ band changes for every discovered output.

### AN-012 - `_routeToOutput()` depends on optimistic crossover assumptions

The routing helper assumes a fully populated, contiguous crossover model and defaults to `High` when that assumption breaks.

Recommended fix:

- Treat routing as "unknown" until crossover state is confirmed loaded.
- Reject or defer writes when routing confidence is low.

### AN-013 - `detect_active` and `autoNotch.active` are dead telemetry fields

The variable and state fields exist, but the current source never updates them after initialization.

Recommended fix:

- Set them on first successful detect request and clear them on timeout or disconnect, or remove them.

### AN-014 - Test coverage stops at the protocol layer

The current test suite exercises `parseResponse()` and parts of `buildCommand()`. It does not exercise:

- `handleHttpRequest()`
- `_routeToOutput()`
- `autoNotch.pending`
- `slotsUsed`
- `/detect`
- `/approve`
- `/notches/release`
- `/notches`

Recommended fix:

- Add a pure planning layer with unit tests.
- Add handler tests with a mocked PA2 transport.

## Test Gap Matrix

| Area | Current status | Evidence |
|---|---|---|
| Protocol parsing | Covered | `test/test-protocol.js` passes `89/89` |
| Auto-notch request validation | Not covered | No test references found |
| Auto route/dedup/allocation | Not covered | No test references found |
| Approval flow | Not covered | No test references found |
| Release/delete flow | Not covered | No test references found |
| Startup readiness gating | Not covered | No test references found |
| Ownership recovery after reconnect | Not covered | No test references found |

## Bridge-Layer Findings Merged From Second Audit

These items came from a second audit pass focused on the app-side PA2 bridge code. I spot-checked the referenced files and line regions in:

- `hooks/usePA2Bridge.ts`
- `lib/pa2/advisoryBridge.ts`
- `lib/pa2/pa2Client.ts`

Critical fixes:

- Both-mode double-cut risk in `hooks/usePA2Bridge.ts:331` because `both` mode independently drives GEQ and PEQ from the same advisory set.
- Hybrid PEQ hardcodes confidence `0.9` in `hooks/usePA2Bridge.ts:312-315`, which can overstate certainty relative to the original advisory.
- Approve endpoint wrong slot check in `src/main.js:1495-1500`.
- Route-to-output failure mode around bypassed HPF assumptions in `src/main.js:856-869`.
- Approve response wrong output field in `src/main.js:1513`.

High fixes:

- GEQ corrections accumulate per cycle in `lib/pa2/advisoryBridge.ts:119-130` because merges are additive against current GEQ state.
- Macro parameter key mismatches around `sub_master` / `sub_lows` / `sub_highs` usage in `src/pa2-protocol.js:726-733`.

Medium fixes:

- Severity depth mapping ignores Q factor in `lib/pa2/advisoryBridge.ts:58-67`.
- Auto-notch writes `Bell` rather than a true notch-style filter in `src/main.js:1446-1449`.
- `mergeAbortSignals()` adds abort listeners without cleanup in `lib/pa2/pa2Client.ts:215-225`.
- Poll-vs-auto-send race risk exists because `hooks/usePA2Bridge.ts` polls and auto-sends from the same moving state snapshot.

Bridge-layer gaps:

- No closed-loop verification after notch placement.
- No automatic notch release on advisory resolve.
- No depth ramping.
- Panic mute setting unwired.
- No AFS coordination.
- No slot prioritization when full.
- No test coverage for the bridge layer.

Implementation note:

- Treat the bridge-layer criticals and the module-layer criticals as one first tranche.
- The highest-value combined sequence is: readiness gating, write queue serialization, transactional acknowledgement, slot ownership persistence, then bridge double-cut and confidence propagation fixes.

## Improvement Roadmap

### Beginner

- Replace `||` config fallbacks with `??`.
- Require `stateLoaded` for all auto-notch write endpoints.
- Validate `hz`, `confidence`, `q`, `type`, and payload shape.
- Set `lastDetectAction` from the actual outcome, not from the requested mode.
- Wire or remove `detect_active` and `autoNotch.active`.

### Intermediate

- Unify auto and approve paths under one planner for route, dedup, and slot allocation.
- Allocate approval slots per output, not globally.
- Approve and reject by server-side detection IDs instead of raw frequency values.
- Refuse to place notches into disabled PEQ blocks unless explicitly enabled.
- Subscribe to PEQ band changes for every discovered output.

### Advanced

- Introduce a serialized PA2 command queue with acknowledgement, timeout, and rollback behavior.
- Persist or rebuild slot ownership from actual PEQ state so restart and reconnect do not destroy operator context.
- Split the current code into schema, planner, ownership, and writer layers with dedicated tests.
- Reconcile expected slot ownership against hardware state before release and delete operations.

## Reproduction Checklist

- Start the module and send `POST /detect` before `stateLoaded` flips true.
- Restart Companion with user PEQ bands already populated on the PA2.
- Submit two detections in one request and confirm commands stay serialized.
- Submit the same frequency twice in approve mode and ensure IDs stay distinct.
- Approve a `Low`-routed and `High`-routed notch that both want band `1`.
- Release a notch after reconnect and confirm the correct hardware slot is targeted.

## Verification Run During Audit

- `node test/test-protocol.js` -> `89 pass, 0 fail, 0 skip`
