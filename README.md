# DoneWell Audio

Real-time acoustic feedback detection for live sound engineers.

DoneWell Audio listens to a microphone feed, identifies likely feedback and ringing frequencies, and recommends EQ action with frequency, pitch, and filter guidance. It is analysis-only: the app never modifies or outputs audio.

Built by [Don Wells AV](https://donwellsav.com).

## What The App Does Now

- Browser-based PWA built with Next.js, React, and TypeScript
- Main-thread peak detection with worker-side fusion, classification, and advisory generation
- Seven fused detection signals: MSD, phase coherence, spectral flatness, comb pattern, IHR, PTMR, and a compact ML model
- Eight operating modes tuned for speech, worship, live music, theater, monitors, ring-out, broadcast, and outdoor work
- Ring-out, room interpretation, and broad-region vs narrow-notch guidance in the in-app help
- Optional Bitfocus Companion bridge for routing recommendations into external control workflows

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

## Current Product Behavior

- DoneWell Audio is advisory only. It never inserts itself into the live audio output path.
- A brand-new session starts from the historical fresh-start speech snapshot at `25 dB`.
- The explicit `speech` mode baseline is `20 dB`.
- `Reset All` returns to the fresh-start snapshot, not the raw speech baseline.
- Room presets are relative offsets layered on top of the active mode baseline.
- The `Perceptual` spectrum view changes the graph only. It does not change detector behavior.

## Detection Pipeline

```text
Mic -> getUserMedia -> GainNode -> AnalyserNode
  -> FeedbackDetector.analyze() on the main thread
    -> peak candidate + spectrum + time-domain transfer to worker
      -> algorithm scoring
      -> fusion + gates
      -> track classification
      -> EQ recommendation
      -> advisory update back to the UI
```

The design goal is not "detect every narrow peak." The worker is tuned to surface real feedback early enough to act on while still suppressing common speech, music, hum, room-mode, and compressed-content false positives.

## Accuracy And Tuning Workflow

The repo has two complementary evaluation lanes:

- Synthetic fusion oracle:

  ```bash
  npx tsx --tsconfig autoresearch/tsconfig.json autoresearch/evaluate.ts
  ```

- Snapshot replay lane:

  ```bash
  npx tsx --tsconfig autoresearch/tsconfig.json autoresearch/evaluateSnapshots.ts
  ```

The snapshot lane replays labeled `SnapshotBatch` fixtures through the worker-side fusion, classifier, and advisory path. In the UI, `FALSE+`, `CONFIRM`, and `Missed Feedback` labels support continued tuning against real-world use.

## Documentation Map

- [CHANGELOG.md](CHANGELOG.md): branch-level release notes
- [tests/README.md](tests/README.md): test structure and replay workflows
- [docs/BEGINNER-GUIDE.md](docs/BEGINNER-GUIDE.md): first-stop codebase orientation
- [docs/DEVELOPER_GUIDE.md](docs/DEVELOPER_GUIDE.md): implementation and workflow guide
- [docs/SYSTEM_ARCHITECTURE.md](docs/SYSTEM_ARCHITECTURE.md): runtime architecture and data flow
- [docs/TECHNICAL_REFERENCE.md](docs/TECHNICAL_REFERENCE.md): current technical behavior and operating model
- [docs/API_DOCUMENTATION.md](docs/API_DOCUMENTATION.md): current HTTP surface
- [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md): Companion and mixer integration notes
- [docs/WIKI_SYNC.md](docs/WIKI_SYNC.md): source pages to sync into a separate GitHub wiki repo if you use one

## Important Constraints

- Use `pnpm`, not `npm` or `yarn`.
- The hot path lives in `lib/dsp/feedbackDetector.ts` and the worker DSP pipeline.
- Tune with evidence, not assumptions.
- Prefer current source files, tests, and in-app help over older archived audit notes when they disagree.
- The GitHub wiki is not checked into this repo. Sync it from the Markdown docs if you maintain a separate wiki clone.
