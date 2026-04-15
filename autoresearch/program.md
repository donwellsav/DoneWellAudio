# KTR DSP Autoresearch Program

Autonomous optimization of DoneWell Audio fusion behavior.

## Goal

Minimize the composite loss metric by tuning fusion weights and verdict thresholds in [C:\projects\donewellaudio\lib\dsp\fusionEngine.ts](C:/projects/donewellaudio/lib/dsp/fusionEngine.ts).
Run the baseline locally before tuning. Historical loss numbers in old notes are not authoritative.

## Setup

1. Agree on a run tag with the user, for example `mar15`.
2. Create the branch: `git checkout -b autoresearch/<tag>`
3. Read the in-scope files:
   - `autoresearch/program.md`
   - `autoresearch/scenarios.ts`
   - `autoresearch/evaluate.ts`
   - `lib/dsp/fusionEngine.ts`
4. Run baseline: `npx tsx --tsconfig autoresearch/tsconfig.json autoresearch/evaluate.ts`
5. Verify harness integrity:
   - `constraint_ok` must be `true`
   - the evaluator must not report contradictory scenarios
6. Initialize `results.tsv` with the baseline.
7. Begin the tuning loop.

## Files You May Modify

- `lib/dsp/fusionEngine.ts`
  - `FUSION_WEIGHTS` for 4 profiles across 7 algorithms
  - `DEFAULT_FUSION_CONFIG.feedbackThreshold`
  - verdict gating and corroboration logic
  - frequency-aware phase suppression
  - post-fusion gates when the change is directly justified by the evaluation data

## Files You Normally Must Not Modify

- `autoresearch/evaluate.ts`
- `autoresearch/scenarios.ts`
- `tests/helpers/mockAlgorithmScores.ts`
- test files in `tests/` or `lib/dsp/__tests__/`

Exception:
- If the harness itself is stale or contradictory, repair it first in a separate maintenance change before doing tuning work.

## Evaluation

```bash
# Synthetic fusion oracle
npx tsx --tsconfig autoresearch/tsconfig.json autoresearch/evaluate.ts

# Synthetic per-scenario breakdown
npx tsx --tsconfig autoresearch/tsconfig.json autoresearch/evaluate.ts --verbose

# Snapshot fixture lane
npx tsx --tsconfig autoresearch/tsconfig.json autoresearch/evaluateSnapshots.ts

# Snapshot fixture breakdown
npx tsx --tsconfig autoresearch/tsconfig.json autoresearch/evaluateSnapshots.ts --verbose

# Normalize an exported SnapshotBatch into a checked-in fixture JSON
npx tsx --tsconfig autoresearch/tsconfig.json autoresearch/normalizeSnapshotFixture.ts \
  --input path/to/exported-batch.json \
  --output tests/fixtures/snapshots/speech-worship/my-fixture.json \
  --mode speech \
  --verdict NOT_FEEDBACK \
  --no-advisory

# Repo gate
npx tsc --noEmit
pnpm test
```

## Constraints

- Each weight profile's 7 weights must sum to `1.0`
- All weights must remain in `[0.01, 0.50]`
- `feedbackThreshold` must remain in `[0.40, 0.80]`
- If `constraint_ok` is `false`, fix that before comparing losses

## Experiment Loop

1. Run the verbose evaluator.
2. Identify the worst scenarios and the exact failure mode.
3. Make one focused change in `lib/dsp/fusionEngine.ts`.
4. Re-run the evaluator.
5. Run `npx tsc --noEmit && pnpm test`.
6. Keep the change only if the loss improves and the repo gate passes.
7. Record the result in `results.tsv`.
8. Repeat.

## Notes

- Do not optimize against a contradictory scenario set.
- Do not treat the evaluator as ground truth if it disagrees with stricter repo tests without understanding why.
- Prefer changes that improve both the scenario harness and the checked-in DSP tests.
- Keep the synthetic lane and the snapshot lane separate:
  - `autoresearch/evaluate.ts` remains the synthetic fusion oracle.
  - `autoresearch/evaluateSnapshots.ts` checks worker-side fusion, classification, and advisory behavior from labeled snapshot fixtures.
- Snapshot fixtures must embed a valid `SnapshotBatch` `v1.1` or `v1.2` with `event.algorithmScores`.
- The checked-in speech/worship corpus is currently a seed fixture corpus shaped like `SnapshotBatch`, not a set of field-captured exports.
- When real exported batches are added, normalize them first and keep explicit `acceptableVerdicts` and `expectAdvisory` labels in the wrapper instead of inferring those outcomes from `userFeedback`.
