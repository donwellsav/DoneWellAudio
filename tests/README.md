# DoneWell Audio Test Suite

## Run

```bash
pnpm test
pnpm test:watch
pnpm test:coverage
npx tsc --noEmit
```

Repo gate:

```bash
npx tsc --noEmit && pnpm test
```

## Structure

```text
components/**/__tests__/   UI regression tests
contexts/__tests__/        Context/provider tests
hooks/__tests__/           Hook and worker lifecycle tests
lib/**/__tests__/          DSP, storage, export, and utility unit tests
tests/dsp/                 Scenario-style DSP and fusion tests
tests/integration/         Cross-module behavior tests
tests/fixtures/            Snapshot and other reusable fixtures
```

## What Matters Most

- Hot-path DSP changes should land with targeted regression coverage near the affected module.
- UI and settings changes should prefer behavior tests over broad snapshots.
- Fusion and classifier tuning should be validated in both the synthetic and replay-based lanes when possible.

## Replay And Evaluation Lanes

### Synthetic fusion lane

```bash
npx tsx --tsconfig autoresearch/tsconfig.json autoresearch/evaluate.ts
```

Use this for controlled scenario tuning of fusion and verdict logic.

### Snapshot replay lane

```bash
npx tsx --tsconfig autoresearch/tsconfig.json autoresearch/evaluateSnapshots.ts
```

This replays labeled `SnapshotBatch` fixtures through the worker-side fusion, classifier, and advisory path.

## Snapshot Fixture Workflow

- Speech/worship fixtures live under `tests/fixtures/snapshots/speech-worship/`.
- Keep explicit `acceptableVerdicts` and `expectAdvisory` labels in the fixture wrapper. Do not infer them from `userFeedback`.
- The checked-in corpus starts with seed fixtures shaped like `SnapshotBatch`. Real exported batches are higher-trust additions and should replace synthetic stand-ins where available.

Normalize a newly exported batch with:

```bash
npx tsx --tsconfig autoresearch/tsconfig.json autoresearch/normalizeSnapshotFixture.ts --input path/to/exported-batch.json --output tests/fixtures/snapshots/speech-worship/my-fixture.json --mode worship --verdict FEEDBACK --expect-advisory
```

## Production Dependency Audit

The repo no longer relies on the retired `pnpm audit` endpoint. Use:

```bash
pnpm run audit:prod -- --audit-level=high
```

That script performs a clean temporary production install and queries npm's supported bulk advisory API.
