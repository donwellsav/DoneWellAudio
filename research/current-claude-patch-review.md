# Current Claude Patch Review

## Scope

This document reviews the dirty working-tree state that exists in this repository right now. It is not a shipped-history document. As observed during review, the current tree includes:

- product/doc/test edits tied to speech/default/room policy,
- a package version change to `0.102.0`,
- and a separate local config edit in `.claude/settings.local.json`.

## What Is Changed in the Working Tree Right Now

### Evidence

`git status --short` and `git diff --stat` show:

- product/doc/test files changed:
  `CLAUDE.md`
  `components/analyzer/__tests__/ReferenceTab.test.tsx`
  `components/analyzer/__tests__/SettingsDefaultsAlignment.test.tsx`
  `hooks/__tests__/useDSPWorker.test.ts`
  `hooks/__tests__/useThresholdChange.test.ts`
  `lib/changelog.ts`
  `lib/dsp/constants/presetConstants.ts`
  `lib/settings/environmentTemplates.ts`
  `lib/settings/modeBaselines.ts`
  `package.json`
- separate local config file changed:
  `.claude/settings.local.json`

Product-facing behavior changes in the current tree include:

- `MODE_BASELINES.speech.feedbackThresholdDb` changed to `25` in `lib/settings/modeBaselines.ts`
- `OPERATION_MODES.speech.feedbackThresholdDb` changed to `25` in `lib/dsp/constants/presetConstants.ts`
- `ENVIRONMENT_TEMPLATES` feedback offsets recomputed relative to speech `25` in `lib/settings/environmentTemplates.ts`
- tests updated to pin that new behavior
- changelog and package version updated to `0.102.0`

## What Claude's Summary Got Right

### Evidence

Claude correctly reported that the working tree contains:

- the speech threshold change in both mode tables,
- the environment-template offset recompute,
- the new regression tests in `SettingsDefaultsAlignment.test.tsx`,
- the supporting test updates in `ReferenceTab.test.tsx`, `useDSPWorker.test.ts`, and `useThresholdChange.test.ts`,
- the `CLAUDE.md` table rewrite,
- the changelog entry and version bump.

Claude also correctly reported the current verification outcome:

- `npx tsc --noEmit` passes,
- `pnpm test` passes with `1516 passed, 4 skipped`.

### Inference

The summary is directionally honest about the contents of the working tree and about the command results.

## What Claude's Summary Obscured

## It is not a narrow startup-default revert

### Evidence

- The current tree changes the live speech preset to `25` in both `MODE_BASELINES` and `OPERATION_MODES`.
- The new regression block in `components/analyzer/__tests__/SettingsDefaultsAlignment.test.tsx` now pins:
  - table alignment across the mode tables,
  - speech baseline `25`,
  - and `deriveDefaultDetectorSettings().feedbackThresholdDb === 25`.

### Inference

This patch does not merely restore the old flat fresh-start default. It chooses a broader product position: speech mode itself becomes `25`.

## Room policy is changed as a consequence, not just documented

### Evidence

- `lib/settings/environmentTemplates.ts` now uses a speech `25` reference and changes all non-`none` feedback offsets:
  `small -10`, `medium -2`, `large 0`, `arena +6`, `worship +3`, `custom -2`.
- `lib/settings/deriveSettings.ts` composes these offsets into every mode's effective threshold.

### Inference

This is a real product retune. It preserves the older speech-plus-room absolute thresholds, but it makes non-speech mode-room combinations more sensitive than they were in shipped `v0.100.0`.

## The patch summary understates the product choice it creates

### Evidence

- Example:
  under the current patch, `monitors + small room` becomes `15 + (-10) = 5 dB`.
- Under shipped `v0.100.0`, the same combination was `15 + (-5) = 10 dB`.

### Inference

The current patch forces a room-policy choice, not just a default fix.

## Behavioral Consequences of the Patch

## Fresh-start and live speech mode are now coupled

### Evidence

- Speech startup and speech live mode both resolve to `25 dB` in the current tree.

### Inference

The awkward historical split between "fresh-start default" and "live speech preset" is gone, but only because the patch chooses one side rather than preserving historical semantics.

## Speech-plus-room combinations are restored to older room-preset absolutes

### Evidence

- Recomputed room offsets are explicitly documented in `lib/settings/environmentTemplates.ts`.

### Inference

Speech mode in rooms now tracks the older room-preset absolute thresholds more closely than shipped `v0.100.0` did.

## Non-speech room combinations become more sensitive

### Evidence

- Because the same room offsets are added to every mode in `lib/settings/deriveSettings.ts`, the more negative speech-relative recalculation applies to non-speech modes as well.

### Inference

This is the major side effect. It is disclosed in `lib/changelog.ts`, but it remains a real behavioral change.

## Tests and typecheck currently support the broadened behavior

### Evidence

- `npx tsc --noEmit` passed on the current working tree.
- `pnpm test` passed on the current working tree with `1516 passed, 4 skipped`.

### Inference

The patch is internally consistent as code. The open question is product intent, not whether the working tree builds and tests.

## Open Product Choice Created by the Patch

### Option 1: Accept the broader retune

Treat the current patch as the new product policy:

- speech mode `25`,
- startup default `25`,
- room offsets recomputed relative to that speech policy.

This is coherent, but broader than the original bug.

### Option 2: Narrow the fix

Restore only the flat fresh-start default path and keep live speech mode at `20`, preserving the historical distinction revealed by the shipped history.

This avoids the non-speech room cascade, but it keeps a more awkward split in product semantics.

### Option 3: Decouple room policy from speech policy

Retain whichever speech/default choice the product wants, but stop deriving room offsets from the speech baseline. Replace that derivation with an explicit room offset matrix or a separately owned room-threshold policy.

This is the cleanest long-term architecture, but it requires a deliberate product decision rather than a narrow patch.

## Bottom Line

Claude's summary is accurate about *what is in the tree* and *what currently passes*. It is incomplete about *what kind of product change this actually is*. The current patch is broader than a startup-default revert because it changes live speech policy and propagates that choice into room composition.
