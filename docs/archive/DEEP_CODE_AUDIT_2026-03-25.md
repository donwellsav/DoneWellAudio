# Deep Code Audit - 2026-03-25

## Scope

This report re-audits the live codebase in runtime order and treats current source as canonical. It is intentionally stricter than the older `aifightclub` rounds: anything already fixed is called out as resolved so later rebuild work does not optimize for ghosts.

Audited path:

1. `lib/dsp/feedbackDetector.ts`
2. `hooks/useDSPWorker.ts`
3. `lib/dsp/dspWorker.ts`
4. `lib/dsp/workerFft.ts`
5. `lib/dsp/algorithmFusion.ts`
6. `lib/dsp/classifier.ts`
7. `lib/dsp/trackManager.ts`
8. `lib/dsp/advisoryManager.ts`
9. `lib/dsp/constants.ts`
10. `types/advisory.ts`
11. `hooks/useAudioAnalyzer.ts`
12. `contexts/AudioAnalyzerContext.tsx`
13. `components/analyzer/settings/*.tsx`
14. `lib/storage/dwaStorage.ts`

## Current Snapshot

- `package.json` reports `0.18.0`.
- The current detector model is still a flat `DetectorSettings` bag in `types/advisory.ts:311-370`.
- The live settings UI is now `components/analyzer/settings/SettingsPanel.tsx`, not the old `UnifiedControls.tsx`.
- Current repo grep on 2026-03-25 found `75` live `onSettingsChange(...)` call sites across `components/`, `contexts/`, and `hooks/`, with the heaviest writers in:
  - `SoundTab.tsx` - 29
  - `MobileLayout.tsx` - 13
  - `DisplayTab.tsx` - 11
  - `AdvancedTab.tsx` - 7
  - `RoomTab.tsx` - 6
  - `DesktopLayout.tsx` - 5

## Confirmed Issues

### 1. `DetectorSettings` still owns too many unrelated concerns

Evidence:

- `types/advisory.ts:311-370` mixes detector thresholds, room physics, algorithm toggles, timing, graph state, gesture state, and display preferences in one interface.
- `lib/dsp/constants.ts:640-705` persists that same mixed bag as `DEFAULT_SETTINGS`.
- `hooks/useAudioAnalyzer.ts:105-119` loads and auto-saves the full bag as if all fields had the same lifecycle.

Why this is a real defect:

- A single write primitive is being used for values that should have different owners:
  - DSP behavior
  - environment modeling
  - operator overrides
  - display preferences
  - storage/preset state
- That makes "what owns this value?" unanswerable in current code.

Impact:

- Hidden coupling between UI and DSP.
- Preset recall cannot reconstruct intent, only raw field values.
- Any controls rebuild done on top of this model will recreate the current mode/room/preset conflicts.

Proposal:

- Replace the flat editing model with a layered contract:
  - mode baseline
  - room/environment adjustment
  - manual operator overrides
  - display preferences
  - diagnostics/expert overrides
- Keep `DetectorSettings` only as a derived runtime object, not as the primary persisted user model.

### 2. The codebase has one semantic mode write path and everything else is shallow merge

Evidence:

- `contexts/AudioAnalyzerContext.tsx:104-123` is the only place that performs a semantic multi-field write (`handleModeChange`).
- `hooks/useAudioAnalyzer.ts:382-388` implements generic settings writes as `setSettings(prev => ({ ...prev, ...newSettings }))`.
- `components/analyzer/settings/SettingsPanel.tsx:88-90` loads presets through the same shallow patch path.

Why this is a real defect:

- Mode changes are modeled as "apply a policy".
- Nearly every other change is modeled as "spray partial fields into shared state".
- The model therefore has no consistent notion of ownership, precedence, or recomputation.

Impact:

- It is easy to create hybrid states that were never intended by any mode.
- Presets and defaults replay raw fields but do not re-run semantic mode logic.
- Controls are already coupled to implementation order, not to operator meaning.

Proposal:

- Introduce semantic actions before any UI rebuild:
  - `applyMode(modeId)`
  - `applyEnvironment(environmentId | customEnvironment)`
  - `setLiveSensitivity(offsetDb)`
  - `setFocusRange(rangePreset | customRange)`
  - `setDisplayPreference(...)`
- Derive effective detector/runtime settings from those actions.

### 3. Storage semantics are inconsistent and currently collapse session, defaults, and presets

Evidence:

- `hooks/useAudioAnalyzer.ts:105-112` boots settings from `customDefaultsStorage`.
- `hooks/useAudioAnalyzer.ts:116-119` then auto-saves every settings change back to that same storage.
- `lib/storage/dwaStorage.ts:167-168` defines `customDefaultsStorage` as a full `DetectorSettings` snapshot.
- `components/analyzer/settings/SettingsPanel.tsx:38-43` defines `PRESET_KEYS` as a partial custom-preset snapshot.
- `components/analyzer/settings/SettingsPanel.tsx:69-90` saves/loads those partial presets.

Why this is a real defect:

- "Defaults" are no longer an explicit user act; they are effectively the last session.
- Custom presets are partial field bags, but saved defaults are full field bags.
- Both persist against the same flat state model.

Impact:

- Users cannot distinguish "my preferred boot profile" from "whatever I touched last".
- Partial preset recall cannot reconstruct mode, room provenance, calibration context, or display state.
- Storage semantics are already incompatible with a clean rebuild.

Proposal:

- Split persistence into separate stores:
  - session state
  - display preferences
  - preferred startup preset id
  - structured rig/setup presets
  - venue library / calibration metadata

### 4. Room presets are still absolute detector rewrites, not environment metadata

Evidence:

- `components/analyzer/settings/RoomTab.tsx:285-288` writes `feedbackThresholdDb` and `ringThresholdDb` directly when a room preset is selected.
- `lib/dsp/constants.ts:710-765` encodes each room preset as absolute thresholds, not offsets.
- `components/analyzer/settings/RoomTab.tsx:352-355`, `377-379`, and `431-436` flip the room to `custom` without preserving any structured room provenance.

Why this is a real defect:

- Room and mode both write into the same threshold fields.
- The environment model is not layered on top of the mode baseline; it overwrites it.

Impact:

- Selecting a room can silently retune the detector by multiple dB.
- There is no way to represent "custom from arena, plus local tweak" cleanly.
- The current model cannot support a principled controls rebuild.

Proposal:

- Keep room behavior as explicit internal offsets over the chosen mode baseline.
- Preserve explicit internal `ringThresholdDb` math; do not derive it from a single public offset rule.
- Persist room provenance separately from the resulting thresholds.

### 5. The repo currently ships three competing "defaults"

Evidence:

- `lib/dsp/constants.ts:641-647` sets `DEFAULT_SETTINGS` to `feedbackThresholdDb: 25`, `ringThresholdDb: 5`.
- `lib/dsp/constants.ts:426-443` defines `speech` mode as `feedbackThresholdDb: 27`, `ringThresholdDb: 5`.
- `lib/dsp/constants.ts:710-717` defines room preset `none` as `feedbackThresholdDb: 30`, `ringThresholdDb: 4`.

Why this is a real defect:

- All three of these are plausible entry points for a user who thinks they are choosing "normal speech/no room".
- They are not equivalent.

Impact:

- Resetting settings, choosing Speech, and choosing Room=None can each land on materially different detector behavior.
- A 2-5 dB threshold drift is large enough to change early warning sensitivity and false positive rate.

Proposal:

- Freeze one authoritative baseline:
  - startup baseline
  - mode baseline
  - room-neutral baseline
- Make all other states derived from it, not parallel truths.

### 6. Compatibility migration logic is still living in the UI layer and still uses `any`

Evidence:

- `components/analyzer/settings/SettingsPanel.tsx:106-127` mutates loaded defaults in place.
- `components/analyzer/settings/SettingsPanel.tsx:110-111` explicitly uses `any`.

Why this is a real defect:

- The repo policy says zero `any`, but this path still needs it because storage migrations are not modeled.
- UI code is carrying schema migration logic that belongs in storage/versioning.

Impact:

- Future settings schema changes will get harder, not easier.
- The view layer is responsible for cleaning historical state corruption.

Proposal:

- Move all settings migration/versioning into storage helpers.
- Version the next preset/default schema from day one of the rebuild.

## Important Current-State Risks, Not Bugs

### Worker backpressure still drops whole peak batches by policy

Evidence:

- `hooks/useDSPWorker.ts:97-100` tracks dropped vs total frames.
- `hooks/useDSPWorker.ts:310-315` drops peaks when the worker is busy, crashed, or not ready.
- `hooks/useDSPWorker.ts:354-369` lets `spectrumUpdate` bypass that backpressure.

Assessment:

- This is an intentional tradeoff, not a confirmed bug.
- It does mean content-type classification can keep updating while peak classification skips work under load.

Rebuild implication:

- The controls redesign should not assume every analysis frame reaches the worker.
- Performance-sensitive diagnostics must stay off the default path.

## Resolved Since Earlier AI Rounds

These older findings are no longer current and should not drive the rebuild:

1. ML toggle support is now live:
   - `types/advisory.ts:342-345`
   - `components/analyzer/settings/SoundTab.tsx:250-256`
   - `lib/dsp/algorithmFusion.ts:739-742`
   - `lib/dsp/dspWorker.ts:518-523`

2. Worker restart snapshot sync and replacement-worker cleanup are fixed:
   - `hooks/useDSPWorker.ts:231-233`
   - `hooks/useDSPWorker.ts:248-260`
   - `hooks/useDSPWorker.ts:293-304`

3. `spectrumUpdate` buffers now return to the correct pool with size guards:
   - `hooks/useDSPWorker.ts:155-167`
   - `lib/dsp/dspWorker.ts:352-375`

4. Soft-error logging now uses `trueFrequencyHz`:
   - `lib/dsp/dspWorker.ts:697-702`

5. Desktop/mobile swipe labeling copy has already been corrected:
   - `components/analyzer/settings/DisplayTab.tsx:47-52`

## Immediate Safe Fixes Before the Full Rebuild

These can land without changing the public product model:

1. Freeze one authoritative default baseline and remove the conflicting "none room" / "speech" / `DEFAULT_SETTINGS` mismatch.
2. Move settings migration/versioning out of `SettingsPanel.tsx` and delete the `any` path.
3. Stop treating "last session" as "saved defaults"; split session storage from explicit defaults immediately.
4. Add a single semantic settings reducer layer before any surface redesign.

## Bottom Line

The codebase is in better shape than the early AI rounds implied, especially around the worker lifecycle. The main problem now is not a cluster of broken hot-path bugs. The main problem is architectural ownership: the app still edits a flat bag of mixed DSP, room, display, and storage state with one semantic write path and dozens of shallow ones. That is the core thing the controls rebuild must replace.
