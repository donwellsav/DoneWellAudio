# Passive Resonance Scan Prompt Library

Version: 1.0
Date: 2026-03-23
Repository: `C:\DoneWellAV\DoneWellAudio`

This prompt library is attached to the Passive Resonance Scan paper. It is written for AI-assisted implementation inside this repository. The prompts assume the implementation target is a mathematically valid `passiveResonanceScan` mode, not a relabeling of the existing feedback detector.

## Global rules

- Do not overload the existing `mode` enum with passive scan semantics.
- Add a new `analysisIntent` boundary and keep the current live-sound presets intact.
- Passive mode must not emit feedback advisories, severity labels, or room-response claims.
- Passive mode must preserve observation completeness better than the current drop-on-busy worker path.
- After every change run `npx tsc --noEmit && pnpm test`.

## PRS-1: Introduce analysis intent

Problem statement:
The repository currently mixes live-sound operating presets (`speech`, `worship`, `liveMusic`, `ringOut`, etc.) with higher-level analysis intent. Passive Resonance Scan is not a new live-sound preset. It is a new product mode.

Target files:
- `types/advisory.ts`
- `lib/dsp/constants.ts`
- `contexts/AudioAnalyzerContext.tsx`
- `components/analyzer/UnifiedControls.tsx`

Implementation:
1. Add `AnalysisIntent = 'feedback' | 'passiveResonanceScan' | 'activeRoomMeasurement'`.
2. Add `analysisIntent` to `DetectorSettings` with default `'feedback'`.
3. Surface the setting through context and controls.
4. Do not change existing `mode` values or their tuning tables.

Success criteria:
- Existing presets remain behaviorally unchanged when `analysisIntent === 'feedback'`.
- Passive scan can be toggled independently of `mode`.
- TypeScript stays strict with zero `any`.

Guard rails:
- Do not remove or rename existing presets.
- Do not silently repurpose `roomPreset`.
- Do not change audio routing or output behavior.

## PRS-2: Branch the worker into passive mode

Problem statement:
`lib/dsp/dspWorker.ts` currently assumes every stable peak eventually flows toward fusion, classification, and advisory generation. Passive scan needs a separate branch.

Target files:
- `lib/dsp/dspWorker.ts`
- `types/advisory.ts`

Implementation:
1. Add worker messages:
   - `startPassiveScan`
   - `stopPassiveScan`
   - `passiveScanProgress`
   - `passiveScanResult`
2. Branch early in `processPeak` handling:
   - shared: track management, stable-peak updates
   - passive path: aggregate observations and compute passive outputs
   - feedback path: existing fusion/classification/advisory flow
3. In passive mode bypass:
   - `fuseAlgorithmResults()`
   - `classifyTrack()`
   - `classifyTrackWithAlgorithms()`
   - `shouldReportIssue()`
   - `generateEQAdvisory()`

Success criteria:
- Passive scan sessions emit no `advisory` messages.
- Existing feedback behavior is unchanged when `analysisIntent === 'feedback'`.
- Worker state remains bounded and cleaned up on reset.

Guard rails:
- Do not delete the existing room-measurement scaffold until the new path is stable.
- Do not break worker message compatibility for current feedback mode.

## PRS-3: Define passive observation and export types

Problem statement:
The repository has `RoomDimensionEstimate` and calibration exports, but it lacks first-class types for passive scan observations and results.

Target files:
- `types/calibration.ts`
- `types/advisory.ts`

Implementation:
Add:
- `PassiveResonanceObservation`
- `PassiveResonanceSeries`
- `PassiveScanResult`
- `PassiveScanExport`

Recommended fields:
- observation: `frequencyHz`, `prominenceDb`, `qEstimate`, `firstSeenAt`, `lastSeenAt`, `persistenceMs`, `driftCentsStd`, `repeatability`, `observationConfidence`
- series: `fundamentalHz`, `dimensionM`, `harmonicsMatched`, `peakFrequencies`, `residualErrorHz`, `seriesConfidence`
- result: `observations`, `candidateSeries`, `dimensionEstimate`, `scanCompleteness`, `limitations`, `startedAt`, `endedAt`

Success criteria:
- Passive worker messages are fully typed.
- Export payload can serialize a complete passive scan session.
- Existing calibration/export types remain backward compatible.

Guard rails:
- Do not overload `Advisory` for passive results.
- Keep names explicit: `observed`, `estimated`, `hypothesized`.

## PRS-4: Install a no-drop passive transport policy

Problem statement:
`hooks/useDSPWorker.ts` currently drops frames whenever the worker is busy. That is acceptable for a real-time feedback UI and unacceptable for a scan that claims observation completeness.

Target files:
- `hooks/useDSPWorker.ts`
- `lib/dsp/dspWorker.ts`

Implementation:
1. Keep current behavior for feedback mode.
2. For passive mode, replace drop-on-busy with a bounded queue or decimated observation policy.
3. Preserve all stabilized peak events and every Nth spectral snapshot during the scan window.
4. Emit `scanCompleteness` metadata so exports disclose what was preserved.

Success criteria:
- Passive mode does not silently drop stabilized peak observations.
- Memory remains bounded.
- Feedback mode latency remains unchanged.

Guard rails:
- Do not attempt to preserve every full FFT frame indefinitely.
- Do not regress real-time UI responsiveness in feedback mode.

## PRS-5: Add passive observation scoring

Problem statement:
Passive mode needs ranking, but reusing `feedbackProbability` would be mathematically wrong because that score encodes feedback priors and veto gates.

Target files:
- `lib/dsp/trackManager.ts`
- `lib/dsp/acousticUtils.ts`
- `lib/dsp/constants.ts`

Implementation:
1. Add passive admissibility thresholds:
   - `MAX_FREQUENCY_HZ = 500`
   - `MIN_Q = 10`
   - `MIN_PERSISTENCE_MS = 500`
2. Add an observation-confidence helper based on:
   - prominence
   - Q
   - persistence
   - drift
   - repeatability
3. Reuse `estimateRoomDimensions()` only as a hypothesis engine, not as a measured result.
4. Add residual-error and low-frequency-coverage helpers for passive series confidence.

Success criteria:
- Passive mode produces `observationConfidence`, not `pFeedback`.
- Low-confidence scans return inconclusive results instead of speculative dimensions.
- Existing room-estimation tests continue to pass.

Guard rails:
- Do not reuse classifier priors.
- Do not emit RT60 or transfer-function metrics.
- Mark dimension output as estimated or hypothesized.

## PRS-6: Build the passive results UI

Problem statement:
Current UI surfaces advisories and feedback-oriented cards. Passive scan needs a different output vocabulary.

Target files:
- `components/analyzer/KillTheRing.tsx`
- `components/analyzer/IssuesList.tsx`
- `components/analyzer/UnifiedControls.tsx`
- `contexts/AdvisoryContext.tsx`
- `contexts/AudioAnalyzerContext.tsx`

Implementation:
Add a passive scan view with:
- stable peak table
- candidate modal series
- optional dimension hypothesis
- explicit limitations box
- scan progress and completeness

Success criteria:
- Passive mode never shows `RUNAWAY`, `GROWING`, or `POSSIBLE_FEEDBACK`.
- Output labels use `Observed`, `Estimated`, and `Hypothesized`.
- Users can export passive scan results without going through advisory flows.

Guard rails:
- Do not regress current feedback UI flows.
- Do not call passive outputs "room response" or "RT60".

## PRS-7: Add deterministic tests and fixtures

Problem statement:
Passive mode needs its own correctness envelope. The existing test suite is feedback-heavy.

Target files:
- `lib/dsp/__tests__/roomEstimation.test.ts`
- `tests/dsp/`
- `lib/dsp/__tests__/dspWorkerMessages.test.ts`
- `hooks/__tests__/useDSPWorker.test.ts`

Implementation:
Add tests for:
1. synthetic axial-mode peak sets
2. mixed harmonic program material without a feedback loop
3. passive mode emits no advisories
4. passive transport preserves stabilized observations under worker load
5. low-confidence scans return inconclusive results

Success criteria:
- Passive fixtures are deterministic.
- Existing feedback tests still pass.
- New tests explicitly check naming and non-goals.

Guard rails:
- Do not weaken current test expectations to fit passive mode.
- Keep synthetic fixtures small and understandable.

## PRS-8: Document naming, limits, and export semantics

Problem statement:
The biggest product risk is overclaiming. The repository needs language that matches the math.

Target files:
- `docs/`
- `components/analyzer/*`
- export helpers

Implementation:
1. Add user-facing copy that defines Passive Resonance Scan as a passive scout.
2. Distinguish:
   - observed
   - estimated
   - hypothesized
3. State clearly that passive mode is not transfer-function measurement.
4. Include `analysisIntent`, scan completeness, and limitation notes in exports.

Success criteria:
- UI and export text are mathematically honest.
- No passive artifact is mislabeled as a measured room response.

Guard rails:
- Do not hide limitations in tooltips only.
- Do not rely on marketing language to paper over observability limits.

## Suggested implementation order

1. `PRS-1`
2. `PRS-2`
3. `PRS-3`
4. `PRS-4`
5. `PRS-5`
6. `PRS-6`
7. `PRS-7`
8. `PRS-8`

## Final build gate

Run after every completed phase:

```bash
npx tsc --noEmit && pnpm test
```
