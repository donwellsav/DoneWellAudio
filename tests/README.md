# Kill the Ring — Test Suite Setup

## Installation

```bash
# Install Vitest and coverage provider
npm install -D vitest @vitest/coverage-v8

# Add scripts to package.json
npm pkg set scripts.test="vitest run"
npm pkg set scripts.test:watch="vitest"
npm pkg set scripts.test:coverage="vitest run --coverage"
```

## Copy Files

Copy from this directory into your repo:

```
vitest.config.ts          → /vitest.config.ts
tests/helpers/            → /tests/helpers/
tests/dsp/                → /tests/dsp/
```

## Run

```bash
# Run all tests once
npm test

# Watch mode (re-runs on file change)
npm run test:watch

# With coverage report
npm run test:coverage
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

## Next Steps

After these pass, add tests for:
1. `feedbackDetector.ts` — requires mocking AnalyserNode
2. `classifier.ts` — classification logic with algorithm scores
3. `trackManager.ts` — peak-to-track association
4. `eqAdvisor.ts` — EQ recommendation generation
5. `dspWorker.ts` — end-to-end worker message handling (needs worker test env)
