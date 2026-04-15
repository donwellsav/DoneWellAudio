# DoneWell Audio

Real-time acoustic feedback detection for live sound engineers.

DoneWell Audio listens to a microphone feed, identifies likely feedback and ringing frequencies, and recommends EQ action with frequency, pitch, and filter guidance. It is analysis-only: the app never modifies or outputs audio.

Built by [Don Wells AV](https://donwellsav.com).

## What Is Current

- Browser-based PWA built with Next.js 16, React 19, and TypeScript
- Main-thread peak detection with worker-side fusion, classification, and advisory generation
- Seven fused detection signals: MSD, phase coherence, spectral flatness, comb pattern, IHR, PTMR, and a compact ML model
- Eight operating modes tuned for speech, worship, live music, theater, monitors, ring-out, broadcast, and outdoor work
- Snapshot-based replay tooling for tuning missed positives and false positives without touching the hot path
- Optional Bitfocus Companion bridge for routing EQ recommendations into external control workflows

## Quick Start

```bash
git clone https://github.com/donwellsav/donewellaudio.git
cd donewellaudio
pnpm install
pnpm dev
```

Open `http://localhost:3000`, grant microphone access, and start analysis.

## Core Commands

```bash
pnpm dev
pnpm build
pnpm lint
pnpm test
pnpm test:watch
pnpm test:coverage
npx tsc --noEmit
pnpm run audit:prod -- --audit-level=high
```

Repo gate:

```bash
npx tsc --noEmit && pnpm test
```

## Detection Pipeline

```text
Mic -> getUserMedia -> GainNode -> AnalyserNode
  -> FeedbackDetector.analyze() on the main thread
    -> peak candidate + spectrum + time-domain transfer to worker
      -> algorithm scoring
      -> fuseAlgorithmResults()
      -> classifyTrackWithAlgorithms()
      -> generateEQAdvisory()
      -> advisory + track summaries back to the UI
```

The important design choice is that recall and suppression are both handled explicitly. The worker is tuned to surface real feedback early enough to be useful, but it still applies content-aware fusion, post-fusion gates, and mode-specific reporting rules so stable speech, musical tones, hum families, and compressed content do not all collapse into the same verdict.

## Accuracy And Tuning Workflow

The repo now has two complementary evaluation lanes:

- Synthetic fusion oracle: `npx tsx --tsconfig autoresearch/tsconfig.json autoresearch/evaluate.ts`
- Snapshot replay lane: `npx tsx --tsconfig autoresearch/tsconfig.json autoresearch/evaluateSnapshots.ts`

The snapshot lane replays labeled `SnapshotBatch` fixtures through the worker-side fusion, classifier, and advisory path. In the UI, `FALSE+`, `CONFIRM`, and `Missed Feedback` labels support continued tuning against real-world use.

## Important Constraints

- DoneWell Audio is analysis-only. It does not apply EQ inside the browser audio path.
- Use `pnpm`, not `npm` or `yarn`.
- The hot path lives in `lib/dsp/feedbackDetector.ts` and the worker DSP pipeline. Tune with evidence, not assumptions.
- Prefer current source files, tests, and help/wiki content over older historical audit notes when those disagree.

## Additional Docs

- In-app Help: operator guidance and algorithm reference
- [tests/README.md](tests/README.md): test structure and replay workflows
- Local wiki clone: `C:\projects\donewellaudio-wiki`
