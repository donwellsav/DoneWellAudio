# DoneWell Audio — Master Repair Guide

**Date:** 2026-03-24
**Version:** 2.0
**Repository:** `C:\DoneWellAV\DoneWellAudio`

---

### Communication Channel

Both models have direct repo access (Claude via Claude Code, GPT via OpenAI Codex).

| File | Purpose |
|------|--------|
| docs/CLAUDE_TO_GPT.md | Claude outbox - challenges and review requests for GPT |
| docs/GPT_TO_CLAUDE.md | GPT outbox - responses and counter-challenges for Claude |
| docs/REPAIR_GUIDE.md | Shared document - both models edit directly |

User role: say "Claude, go" or "GPT, go" to trigger each model.

## Operating Protocol

This document is the **single source of truth** for all repairs to DoneWell Audio's feedback detection pipeline. It is jointly maintained by two rival AI models under adversarial review.

### The Models

| Model | Role | Sign-off |
|-------|------|----------|
| **Claude** (Opus 4.6) | Primary auditor, implementation agent | Signs as Claude |
| **GPT** (5.4 xhigh / Codex) | Adversarial reviewer, counter-auditor | Signs as GPT |

### The Rules

RIVALRY PROTOCOL

1. EVERY claim must cite code (file:line). No vibes. No impressions.
2. When proven wrong, accept IMMEDIATELY. No face-saving rewrites.
3. ACTIVELY look for flaws in the other model's claims. That is the job.
4. Nitpick constants, units, signs, edge cases, and off-by-ones.
5. "I don't know" and "[TO VERIFY]" are better than guessing.
6. Both models edit THIS document. Working notes go in per-model MDs.
7. No prompt gets executed unless it is marked [LOCKED] in this guide.

### Lock System

| Tag | Meaning | Who can set it |
|-----|---------|---------------|
| [LOCKED] | Both models verified against code. Cannot reopen without NEW code evidence. | Either, after both sign off |
| [OPEN] | Under active review. One or both models have not signed off. | Default state |
| [DISPUTED] | Models disagree. Both positions documented with line refs. Human decides. | Either model |
| [SHIPPED] | Code fix landed. Automatically locked. | Either, after merge |

To lock: Model A proposes with evidence. Model B countersigns or challenges.
To reopen: Must cite NEW code path not previously reviewed.

---

## Document Lineage

### Working Notes (per-model, NOT authoritative)

| Document | Author | Purpose |
|----------|--------|---------|
| DEEP_PIPELINE_AUDIT_2026-03-24.md | Claude | Claude deep exploration notes |
| FEEDBACK_DETECTION_DEEP_AUDIT_2026-03-24.md | GPT | GPT independent deep audit |
| COMBINED_CLAUDE_CODEX_FEEDBACK_AUDIT_2026-03-24.md | GPT | GPT first combined analysis |
| CLAUDE_AUDIT_REVIEW_2026-03-24.md | Claude | Claude review of GPT work |
| DEEP_AUDIT_REVIEW_FOR_CLAUDE_2026-03-24.md | GPT | GPT review of Claude work |
| GPT_ROUND_4_REVIEW_2026-03-24.md | GPT | GPT round 4 review notes |
| MASTER_COMBINED_AUDIT_ROUND_1_2026-03-24.md | Claude | Round 1 convergence |
| MASTER_COMBINED_AUDIT_ROUND_2_2026-03-24.md | GPT | Round 2 corrections |
| MASTER_COMBINED_AUDIT_ROUND_3_2026-03-24.md | Claude | Round 3 full convergence |

### DOCX Archive (historical)

v1-v6 DOCX files in docs/. v3 generator (tmp/generate-audit-docx-v3.js) has full 30-prompt text.

### Reference Papers

papers/2026-03-23-passive-resonance-scan-prompt-library.md — GPT Passive Resonance Scan

---

## PART 1: Shipped Fixes

All [SHIPPED] items are automatically locked.

### Math Fixes (v0.11.0)

| ID | Bug | Fix | Evidence | Status |
|---|---|---|---|---|
| F1 | PHPR averaged dB instead of power | Linear-power averaging | feedbackDetector.ts:1539-1569 | [SHIPPED] |
| F7 | Spectral flatness misclassified broad peaks | Width-adjusted blending | compressionDetection.ts:64-129 | [SHIPPED] |
| F8 | Compression dynamic range mixed frames | Same-frame metrics | compressionDetection.ts:110-155 | [SHIPPED] |

Signed: Claude (found), GPT (verified)

### Architectural Fixes (v0.11.0 - v0.13.0)

| ID | Issue | Fix | Evidence | Status |
|---|---|---|---|---|
| F2 | Confidence used raw scores, probability used gated | effectiveScores vector | algorithmFusion.ts:739-889 | [SHIPPED] |
| F4 | Evidence double-counted fusion+classifier | FUSION_BLEND=0.6 | classifier.ts:748-755 | [SHIPPED] |
| F5 | adjustedPFeedback not applied | Applied+renormalized | classifier.ts:462-472 | [SHIPPED] |
| F6 | Persistence meant different things | Unified semantics | feedbackDetector.ts:1770-1830 | [SHIPPED] |
| F9 | Room-physics stacking unbounded | MAX_ROOM_DELTA=0.30 | classifier.ts:79,457-462 | [SHIPPED] |
| F3 | Content-type diverged | Worker prefers main thread | dspWorker.ts:473 | [SHIPPED] partial |

Signed: Claude (found), GPT (verified F2, F4, F9 in Round 2)

### New Features (v0.11.0 - v0.13.0)

| Feature | Status |
|---------|--------|
| Smooth Schroeder penalty (sigmoid) | [SHIPPED] |
| CombHistoryCache | [SHIPPED] |
| Per-mode cooldowns | [SHIPPED] |
| Early warning dP/dt (earlyWarning.ts) | [SHIPPED] |
| IHR harmonic validation | [SHIPPED] |

---

## PART 2: Verified Facts

Both models agree. [LOCKED] items need NEW code evidence to reopen.

### Core Pipeline [LOCKED] Claude+GPT

The app detects feedback end-to-end: useAudioAnalyzer -> feedbackDetector -> useDSPWorker -> dspWorker -> algorithmFusion -> classifier. 7 fused algorithms. All 4 weight profiles sum to 1.00. Worker backpressure drops frames. Canvas 30fps, FFT 50fps. Zero-copy transferable buffers.

### Low-Level Math [LOCKED] Claude+GPT

All verified correct: Power spectrum (prefix sum+EXP_LUT), Prominence, PHPR (post-F1 linear-power), Q estimation, MSD (second-difference), Phase coherence (circular mean phasor), Persistence (consecutive amplitude-stable +-6dB frames), Schroeder freq, Q_room, Modal overlap (1/Q_measured NOT 1/Q_room), Default range 150-10000Hz.

### Classifier [LOCKED] Claude+GPT

Priors 0.45/0.27/0.27 (NOT old 0.15/0.10/0.10). Heuristic scoring not calibrated posterior. Severity overrides are intentional safety logic; base classifier renormalizes afterward, and the live wrapper mismatch is tracked as B8 until shipped. Room delta capped +-0.30.

### Gates [LOCKED] Claude+GPT

Fusion layer: IHR (*0.65), PTMR (*0.80), CombStability (*0.25), Low-freq phase (*0.5).
Classifier layer: Formant (*0.65), Chromatic (phase scaled), Mains hum (*0.40).
Severity overrides: RUNAWAY->0.85, GROWING->0.70 (post-normalization).

### Mic Calibration Math [LOCKED] Claude+GPT

Log-frequency interpolation, negated compensation. Application order: gain->A-weight->mic cal->single post-cal clamp. ECM8000 helpful. MEMS has hum caveat.

---

## PART 3: Tracked Bugs

### B1: Mic Calibration Bridge Gap [SHIPPED] Claude+GPT

Severity: High. updateSettings() maps 20+ fields but never maps micCalibrationProfile. Both CalibrationTab and mobile MEMS go through broken bridge. Fix: S1.

### B2: 8 Dead Controls [SHIPPED] Claude+GPT

1. musicAware - UI state, not fusion input
2. autoMusicAware - drives dead musicAware
3. autoMusicAwareHysteresisDb - param for dead feature
4. noiseFloorDecay - runtime uses attack/release EMA
5. harmonicFilterEnabled - runs unconditionally
6. holdTimeMs - no runtime consumer (comment lies)
7. quickControlsMode - type+default only
8. relativeThresholdDb advanced slider - explicitly not mapped
Plus dead effect: AudioAnalyzer.tsx:155-171
Fix: S2.

### B3: peakMergeCents Default/UI Mismatch [SHIPPED] Claude+GPT

Default 1000, UI max 150. First touch jumps 6.5:1. Fix: S3.

### B4: Room Preset Silent Sensitivity [SHIPPED] Claude+GPT

RoomTab writes thresholds alongside room config. Fix: S4.

### B5: Custom Mode ML Exclusion [SHIPPED] Claude+GPT

Shipped defaults+UI exclude ML from custom mode. Fix: S5.

### B6: Classifier Language [SHIPPED] Claude+GPT

Comments say Bayesian but outputs are heuristic. Fix: S6.

### B7: Calibration Session Not Adaptive [LOCKED] Claude+GPT

useCalibrationSession logs/exports but never feeds back to detector. Fix: docs or future adaptive loop.

### B8: Runtime Classifier Posterior Divergence [SHIPPED] Claude+GPT

Severity: Medium. Historical bug: `classifyTrack()` and `classifyTrackWithAlgorithms()` did not maintain the same posterior contract.

Historical evidence:
- Base classifier path: `classifier.ts:559-568`
  - renormalizes after severity overrides when needed
  - computes `pUnknown = max(0, 1 - (pFeedback + pWhistle + pInstrument))`
- Wrapper path before fix:
  - re-applied severity overrides after normalization
  - used `pUnknown = 1 - confidence`

Shipped fix:
- `classifier.ts:806-831`
  - renormalizes after final wrapper overrides when needed
  - computes `pUnknown = max(0, 1 - classSum)`
- `classifier.test.ts:683-746`
  - covers RUNAWAY/GROWING wrapper-path behavior and residual-mass consistency

Impact before fix:
- The live runtime path could return a score bundle whose class probabilities and `pUnknown` did not describe the same model state.

Fix: S9.

---

## PART 4: Fix Prompts

NO PROMPT EXECUTES UNLESS MARKED [LOCKED] BY BOTH MODELS.

### Phase 0: Control Surface Cleanup

#### S1: Fix Mic Calibration Bridge [SHIPPED] Claude+GPT

Author: Claude | Targets: lib/dsp/feedbackDetector.ts | Effort: Small | Bug: B1

Add to updateSettings() after ignoreWhistle block (~line 544):
  if (settings.micCalibrationProfile !== undefined) {
    mappedConfig.micCalibrationProfile = settings.micCalibrationProfile
  }
Tests: updateSettings ecm8000 triggers computeMicCalibrationTable, table non-zero.
Run: npx tsc --noEmit && pnpm test

#### S2: Remove Dead Controls [SHIPPED] Claude+GPT

Author: Claude | Targets: types, constants, components, contexts, tests | Effort: Medium | Bug: B2

Remove the dead UI/schema control surface for:
- `musicAware`
- `autoMusicAware`
- `autoMusicAwareHysteresisDb`
- `noiseFloorDecay`
- `harmonicFilterEnabled`
- `holdTimeMs`
- `quickControlsMode`
- `DetectorSettings.relativeThresholdDb` as an independent operator control

Also remove the dead `musicAware` effect in `AudioAnalyzer.tsx`.

Required scope:
- UI/control surfaces:
  - `components/analyzer/settings/SoundTab.tsx`
  - `components/analyzer/settings/AdvancedTab.tsx`
  - `components/analyzer/UnifiedControls.tsx`
- preset/storage loaders:
  - `components/analyzer/settings/SettingsPanel.tsx`
  - `components/analyzer/UnifiedControls.tsx`
- mode preset application:
  - `contexts/AudioAnalyzerContext.tsx`
- help/docs cleanup:
  - `components/analyzer/help/GuideTab.tsx`
- fixture cleanup:
  - `lib/dsp/__tests__/advisoryManager.test.ts`

Important carve-out:
- DO NOT remove internal `AnalysisConfig.relativeThresholdDb` or detector threshold math.
- Keep `feedbackThresholdDb -> AnalysisConfig.relativeThresholdDb` mapping in `feedbackDetector.ts`; remove only the dead UI/schema-side independent control.
- DO NOT remove `micCalibrationProfile`, `roomPreset`, or `peakMergeCents`.

Run: npx tsc --noEmit && pnpm test

#### S3: Fix peakMergeCents Default [SHIPPED] Claude+GPT

Author: Claude | Targets: constants.ts | Effort: Small | Bug: B3

Change default from 1000 to 100 cents (1 semitone).

Rationale now locked by both models:
- `TRACK_SETTINGS.ASSOCIATION_TOLERANCE_CENTS = 100` (`constants.ts:352`) says it is synced with `peakMergeCents`
- `feedbackHistory.ts:76` groups frequencies at 100 cents
- `advisoryManager.test.ts:122,318,372,643-650` treats 100 cents as the effective default merge window

Also update stale comments around `constants.ts:679` so the shipped default is no longer documented as 1000 cents.

Run: npx tsc --noEmit && pnpm test

#### S4: Room Preset Sensitivity Label [SHIPPED] Claude+GPT

Author: Claude | Targets: RoomTab.tsx | Effort: Small | Bug: B4

Add muted note: "Also adjusts detection sensitivity for that environment."
Run: npx tsc --noEmit && pnpm test

#### S5: Add ML Toggle to Custom Mode [SHIPPED] Claude+GPT

Author: Claude | Targets: SoundTab, SettingsPanel, UnifiedControls, constants | Effort: Small | Bug: B5

Add `ml` everywhere custom-mode algorithms are defined or reconstructed:
- `constants.ts` default `enabledAlgorithms`
- `SoundTab.tsx` custom button array
- `UnifiedControls.tsx` custom button array
- `SoundTab.tsx` fallback `current ?? [...]` array
- `UnifiedControls.tsx` fallback `current ?? [...]` array
- `SettingsPanel.tsx` legacy `allAlgos` / `modeMap`
- `UnifiedControls.tsx` legacy `allAlgos` / `modeMap`

Run: npx tsc --noEmit && pnpm test

#### S6: Classifier Language Cleanup [SHIPPED] Claude+GPT

Author: Claude | Targets: classifier.ts, AlgorithmsTab.tsx | Effort: Small | Bug: B6

Replace "Bayesian probability" language with "heuristic confidence/scoring" language where appropriate.

Required scope:
- `lib/dsp/classifier.ts` comments/JSDoc
- `components/analyzer/help/AlgorithmsTab.tsx` displayed confidence formula and verdict thresholds so they match `algorithmFusion.ts`

Guide note:
- `GuideTab.tsx` dead Music-Aware advice belongs to S2, not S6.

Run: npx tsc --noEmit && pnpm test

### Phase 1: Remaining Architecture

#### S7: Content-Type Full Unification (F3) [OPEN] needs design decision

Options: A) Main thread authoritative B) Worker authoritative C) Keep current with mismatch warning.
Run: npx tsc --noEmit && pnpm test

#### S8: Hot-Path Test Harness (F10) [OPEN] needs design

Mock AnalyserNode. Cover: silence gate, auto-gain, prominence, sustain, hysteresis, PHPR, Q, persistence.
Run: npx tsc --noEmit && pnpm test

#### S9: Unify Runtime Wrapper Posterior Semantics (B8) [SHIPPED] Claude+GPT

Author: GPT | Targets: `lib/dsp/classifier.ts`, `lib/dsp/__tests__/classifier.test.ts` | Effort: Small-Medium | Bug: B8

Goal:
- Make `classifyTrackWithAlgorithms()` return a classification bundle whose class probabilities and `pUnknown` follow the same contract as `classifyTrack()`.

Locked design:
1. Review `classifier.ts:806-818`
2. Keep the current safety-biased RUNAWAY/GROWING overrides
3. After the wrapper's final overrides, renormalize if class sum exceeds 1
4. Set `pUnknown = max(0, 1 - classSum)`
5. Add wrapper-path tests covering:
   - `pFeedback + pWhistle + pInstrument + pUnknown`
   - RUNAWAY override behavior
   - GROWING override behavior
   - consistency between returned class scores and `pUnknown`

Run: npx tsc --noEmit && pnpm test

### Phase 2: GPT Improvement Prompts

Already shipped: 14.1 (Schroeder), 14.4 (early warning), 14.7 (IHR validation).

Ready after Phase 0:
| Prompt | Description | Author | Status |
|--------|-------------|--------|--------|
| 14.6 | Bounded room-aware Q | GPT | [OPEN] GPT proposes |
| 14.8 | Agreement persistence tracker | GPT | [OPEN] GPT proposes |
| 14.3 | Post-gate probability calibration | GPT | [OPEN] GPT proposes |
| 14.9 | ML monitoring observable metrics | GPT | [OPEN] GPT proposes |
| 14.10 | Adaptive sustain shortcut | GPT | [OPEN] needs rewrite |

Research: 14.2 (LPC formants), 14.5 (phase drift).
Full prompt text in GPT rewritten prompt pack.

### Phase 3: Claude Expanded Prompts (v3 14.11-14.30)

Full text in: tmp/generate-audit-docx-v3.js

Best: 14.14, 14.16, 14.21 (math fix: 12.5 dB/s not 0.21), 14.23, 14.29
Rewrite: 14.15, 14.17, 14.18, 14.25, 14.26, 14.30
Dropped: 14.12 (wrong bug), 14.19 (overstated), 14.20 (wrong sign), 14.24 (wrong threshold), 14.28 (wrong scenario)

### Phase 4: Passive Resonance Scan

Full prompts: docs/papers/2026-03-23-passive-resonance-scan-prompt-library.md

PRS-1 (intent boundary B+), PRS-2 (worker branch A-), PRS-3 (types A), PRS-4 (transport A-), PRS-5 (scoring B), PRS-6 (UI B-), PRS-7 (tests A-), PRS-8 (docs B-).

Key principle: Passive mic cannot recover R(f). Report "observed"/"estimated"/"hypothesized" never "measured."

### Phase 5: Test Coverage

Hot path (12.7%), fusion-classifier edges, room configs, early warning sequences, content-type agreement, post-removal regression.

---

## PART 5: Execution Order

Phase 0 (control surface): S1->S2->S3->S4->S5->S6. Prereq: satisfied ([LOCKED]). Est: 1-2 sessions.
Phase 1 (architecture): S7->S8. Prereq: Phase 0 shipped. Est: 1-2 sessions.
Phase 2 (GPT improvements): 14.6->14.8->14.3->14.9. Prereq: Phase 0. Est: 2-3 sessions.
Phase 3 (Claude expanded): 14.14->14.16->14.21->14.23->14.29. Prereq: Phase 2. Est: 2-3 sessions.
Phase 4 (passive scan): PRS-2->PRS-3->PRS-4->PRS-1->PRS-5->PRS-7. Prereq: Phases 0-1. Est: 3-5 sessions.
Phase 5 (tests): Ongoing.

---

## PART 6: Corrections Log

| Round | Wrong | Who wrong | Caught by | Correction |
|-------|-------|-----------|-----------|------------|
| v1-v2 | PHPR showed power formula as implemented | Claude | GPT | Split current/proposed |
| v1-v2 | Persistence as time-elapsed | Claude | GPT | Consecutive-frame counting |
| v1-v4 | Q_room delta neutral | Claude | GPT | -0.10 when ratio<=1.0 |
| v1-v4 | Modal overlap 1/Q_room | Claude | GPT | 1/Q_measured |
| v2-v4 | F2 downgraded to Medium | Claude | GPT | Restored High |
| R1 | Mic cal properly wired | Claude | GPT | Bridge gap confirmed |
| R1 | ML NOT dropped custom | Claude | GPT | Defaults+UI exclude |
| R1 | Range 60-16000 | Claude | GPT | 150-10000 |
| R1-R2 | Priors 0.15/0.10/0.10 | Claude | GPT | 0.45/0.27/0.27 |
| R1-R2 | Room delta unbounded | Claude | GPT | MAX_ROOM_DELTA=0.30 |
| R1-R2 | holdTimeMs active | Claude | GPT | Dead |
| R1-R2 | quickControlsMode active | Claude | GPT | Dead |
| R1-R3 | Dead controls count 3 | Both | Claude | 8 total |
| v3 | 14.21 said 0.21 dB/s | Claude | User | 12.5 dB/s |
| v3 | 14.12 wrong bug | Claude | User | Supersede refreshes timestamp |
| v3 | 14.20 wrong sign | Claude | User | FP not FN |
| v3 | 14.24 wrong threshold | Claude | User | 8 dB |
| v3 | Several prompts wrong stage | Claude | GPT | See dropped prompts |

Score: Claude errors caught by GPT: 12. GPT errors caught by Claude: 1 (B8 wrapper posterior).
GPT scored in Round 4 with B8.

---

## PART 7: Open Questions After Phase 0 Verification

1. [OPEN] S7: Content-Type Full Unification (F3) implementation
2. [OPEN] S8: Hot-Path Test Harness (F10) implementation

Phase 0 is now [SHIPPED].

---

Signed: Claude (Opus 4.6), GPT (5.4 / Codex)
Date: 2026-03-24
Status: Phase 0 prompts S1-S6 and S9 are [SHIPPED]. S7-S8 remain [OPEN].

-- GPT
