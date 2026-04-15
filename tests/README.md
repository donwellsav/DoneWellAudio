# DoneWell Audio — Test Suite

## Run

```bash
# Run all tests once (985 tests, 46 suites)
pnpm test

# Watch mode (re-runs on file change)
pnpm test:watch

# With coverage report
pnpm test:coverage
```

## Test Structure

```
tests/
├── helpers/
│   └── mockAlgorithmScores.ts    # Builders for algorithm score mock objects
└── dsp/
    ├── algorithmFusion.test.ts   # Fusion engine + Gemini vulnerability scenarios
    ├── msdAnalysis.test.ts       # MSD algorithm (DAFx-16 paper)
    ├── phaseCoherence.test.ts    # Phase coherence (KU Leuven 2025)
    └── compressionDetection.test.ts  # Spectral flatness + compression detection
```

## What These Tests Cover

### algorithmFusion.test.ts (Gemini Scenarios)
- Weight sum validation (all 4 profiles)
- 8 synthetic vulnerability scenarios from Gemini Ultra analysis:
  - DEFAULT: synth note false positive, reverberant false negative
  - SPEECH: sustained vowel false positive, limiter-clamped false negative
  - MUSIC: guitar feedback (acceptable FP), dense mix false negative
  - COMPRESSED: flute false positive, compressor-pumped false negative
- Baseline cases (pure feedback, pure music, silence)
- Edge cases (single algorithm, warmup, null scores, mode selection)
- Proposed V2 weights (skipped until implemented)

### msdAnalysis.test.ts
- Constant magnitude → MSD ≈ 0 (feedback pattern)
- Linear growth → MSD ≈ 0 (feedback onset)
- Random fluctuation → MSD >> 0 (music/speech)
- Energy gate below silence floor
- feedbackScore = exp(-msd/threshold) formula verification
- Ring buffer wrapping, reset behavior
- Content-aware frame count (speech=7, music=13)

### phaseCoherence.test.ts
- Constant phase delta → coherence ≈ 1.0 (feedback)
- Random phase → coherence < 0.5 (music/noise)
- Phase unwrapping across ±π boundary
- Mean phasor formula manual verification
- Ring buffer wrapping, reset behavior

### compressionDetection.test.ts
- Pure tone → low spectral flatness
- White noise → flatness ≈ 1.0
- High crest factor → not compressed
- Low crest factor → compressed
- Threshold multiplier validation
- Edge cases (insufficient data, ring buffer wrap)

## Additional Test Locations

```
hooks/__tests__/               # Hook unit tests (useAdvisoryMap, useFpsMonitor, etc.)
contexts/__tests__/            # Context unit tests (AdvisoryContext, UIContext)
lib/storage/__tests__/         # dwaStorage + settingsStorageV2 tests
lib/export/__tests__/          # Export module tests (txt, pdf, downloadFile)
lib/dsp/__tests__/             # mlInference unit tests
lib/data/__tests__/            # Consent module tests
tests/fixtures/snapshots/      # Labeled snapshot fixture corpora for replay-based accuracy checks
```

## Snapshot Fixture Workflow

- The speech/worship accuracy lane lives under `tests/fixtures/snapshots/speech-worship/` and replays labeled `SnapshotBatch` fixtures through the worker-side fusion, classifier, and advisory path.
- Run the snapshot lane directly with:

```bash
npx tsx --tsconfig autoresearch/tsconfig.json autoresearch/evaluateSnapshots.ts
```

- Normalize newly exported snapshot batches with:

```bash
npx tsx --tsconfig autoresearch/tsconfig.json autoresearch/normalizeSnapshotFixture.ts \
  --input path/to/exported-batch.json \
  --output tests/fixtures/snapshots/speech-worship/my-fixture.json \
  --mode worship \
  --verdict FEEDBACK \
  --expect-advisory
```

- Keep explicit `acceptableVerdicts` and `expectAdvisory` labels in the fixture wrapper. Do not infer them from `userFeedback`.
- The checked-in corpus currently begins with seed fixtures shaped like `SnapshotBatch`; treat real exported batches as higher-trust additions when they become available.
