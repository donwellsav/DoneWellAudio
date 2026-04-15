# DoneWell Audio Beginner Developer Guide

This guide is for developers who are new to the repository and need a verified map of the current codebase.

DoneWell Audio is a browser-based, analysis-only acoustic feedback detector for live sound engineers. It listens to a microphone signal, identifies likely feedback or ringing frequencies, and recommends EQ action. It never modifies or outputs audio.

## First Run

Prerequisites:
- Node.js 22+
- pnpm 10.30.1
- A browser with microphone access

Install and start the app:

`ash
git clone https://github.com/donwellsav/donewellaudio.git
cd donewellaudio
pnpm install
pnpm dev
`

Open http://localhost:3000, grant microphone access, and start analysis.

Daily commands:

`ash
pnpm dev
pnpm build
pnpm lint
pnpm test
pnpm test:watch
pnpm test:coverage
npx tsc --noEmit
pnpm run audit:prod -- --audit-level=high
`

Repo verification gate:

`ash
npx tsc --noEmit && pnpm test
`

## Where To Look First

Start with these areas:

- pp/ - Next.js routes, layout, API handlers, service worker entry
- components/analyzer/ - product UI, layouts, help, settings, issue cards, footer
- contexts/ - engine, settings, detection, metering, advisory, and UI state boundaries
- hooks/ - worker wiring, layered settings, view-state orchestration
- lib/dsp/ - detector hot path, fusion, classifier, EQ advisory, worker logic
- lib/settings/ - mode baselines, layered defaults, derivation helpers
- companion-module/ - Bitfocus Companion module source
- utoresearch/ - synthetic and snapshot replay tuning harnesses
- 	ests/ plus lib/**/__tests__/ - regression coverage

Helpful starting files:

- pp/page.tsx
- components/analyzer/AudioAnalyzer.tsx
- contexts/AudioAnalyzerContext.tsx
- hooks/useDSPWorker.ts
- lib/dsp/feedbackDetector.ts
- lib/dsp/dspWorker.ts
- lib/settings/defaultDetectorSettings.ts

## How Analysis Flows

High-level runtime flow:

`	ext
Microphone
  -> getUserMedia
  -> GainNode
  -> AnalyserNode
  -> FeedbackDetector.analyze() on the main thread
  -> postMessage(peak + spectrum + time-domain) to the worker
  -> worker scoring, fusion, classification, and EQ advisory generation
  -> advisory state in React
  -> issue cards, RTA markers, GEQ overlays, footer status
`

Main thread responsibilities:
- Web Audio graph ownership
- FFT reads and peak detection
- React rendering
- Canvas drawing

Worker responsibilities:
- track management
- algorithm scoring
- fusion and classification
- advisory generation and dedup
- snapshot replay and labeling support

## Settings And State

The app no longer treats flat defaults as the source of truth. Runtime settings come from a layered model:

1. mode baseline
2. environment selection
3. live operator overrides
4. display preferences
5. diagnostics overrides
6. mic profile

The canonical flat DetectorSettings snapshot is derived from those layers by deriveDetectorSettings(). For fresh sessions and compatibility callers, deriveDefaultDetectorSettings() builds the effective defaults for a mode, and DEFAULT_SETTINGS is now just the derived Speech snapshot.

That means:
- mode-owned fields such as thresholds, timing, FFT size, and track timeout should come from the active mode baseline unless an explicit override is set
- display controls such as canvas FPS, graph font size, and swipe labeling should come from display defaults
- docs and help text should not hardcode speech-era numbers in places where the current mode owns the value

## Common Change Paths

UI and help changes:
- components/analyzer/
- components/analyzer/help/
- components/analyzer/settings/
- local wiki clone at C:\projects\donewellaudio-wiki

Detector tuning:
- lib/dsp/feedbackDetector.ts
- lib/dsp/algorithmFusion.ts
- lib/dsp/classifier.ts
- lib/dsp/eqAdvisor.ts
- utoresearch/evaluate.ts
- utoresearch/evaluateSnapshots.ts

Defaults and settings ownership:
- lib/settings/defaults.ts
- lib/settings/modeBaselines.ts
- lib/settings/deriveSettings.ts
- lib/settings/defaultDetectorSettings.ts
- hooks/useLayeredSettings.ts

Companion integration:
- pp/api/companion/relay/[code]/route.ts
- pp/api/companion/proxy/route.ts
- companion-module/src/*

## Accuracy Workflow

When you touch detection behavior, verify with evidence instead of intuition.

Minimum gate:

`ash
npx tsc --noEmit && pnpm test
`

Tuning lanes:

`ash
npx tsx --tsconfig autoresearch/tsconfig.json autoresearch/evaluate.ts
npx tsx --tsconfig autoresearch/tsconfig.json autoresearch/evaluateSnapshots.ts
`

Use the synthetic lane for controlled fusion scenarios. Use the snapshot lane for worker-side replay of labeled SnapshotBatch fixtures, especially for speech and worship drift.

## Common Mistakes To Avoid

- Do not treat stale markdown as authoritative when the code and tests disagree.
- Do not hardcode default values in the UI when the layered settings model already owns them.
- Do not change the browser audio path into an audio-processing path. The product is analysis-only.
- Do not tune recall or suppression from anecdotes alone. Use tests, replay fixtures, and measured outputs.
- Do not use 
pm or yarn in this repo.

## Related References

- README.md for the short project summary
- docs/DEVELOPER_GUIDE.md for day-to-day workflow
- docs/TECHNICAL_REFERENCE.md for the current runtime model
- docs/SYSTEM_ARCHITECTURE.md for the full architecture map
- 	ests/README.md for test structure and replay workflow
