# DoneWell Audio System Architecture

This document maps the current runtime boundaries and the data paths that matter most when you are debugging or changing behavior.

## System Boundary

`	ext
Browser tab
  -> microphone permission and capture
  -> Web Audio graph
  -> main-thread peak detection
  -> worker classification and advisory generation
  -> React and canvas rendering

Optional external paths
  -> Companion relay and module
  -> opt-in ingest endpoint for snapshot batches
`

Core invariant:
- DoneWell Audio analyzes audio.
- It does not modify or output audio.

## Main Thread Responsibilities

Main-thread files and responsibilities:
- lib/audio/createAudioAnalyzer.ts - Web Audio setup
- lib/dsp/feedbackDetector.ts - peak detection hot path
- components/analyzer/* - layouts, cards, help, settings, footer
- lib/canvas/* - spectrum and GEQ rendering

The main thread owns browser primitives that cannot move to a worker, including the AnalyserNode, user interaction, and canvas drawing.

## Worker Responsibilities

Worker-side files and responsibilities:
- hooks/useDSPWorker.ts - lifecycle and message plumbing
- lib/dsp/dspWorker.ts - orchestration
- lib/dsp/trackManager.ts - track lifecycle
- lib/dsp/algorithmFusion.ts - weighted algorithm fusion
- lib/dsp/classifier.ts - post-fusion classification and reporting decisions
- lib/dsp/eqAdvisor.ts - PEQ and GEQ recommendations
- lib/dsp/advisoryManager.ts - create, merge, clear, prune

The worker is intentionally backpressure-aware. If a new peak arrives while the worker is still processing the previous work, the app prefers dropping or replacing pending work over stalling the UI thread.

## React Composition

Entry chain:

`	ext
app/page.tsx
  -> AudioAnalyzerClient
  -> AudioAnalyzer
  -> AudioAnalyzerProvider
  -> AdvisoryProvider
  -> UIProvider
  -> PortalContainerProvider
`

Important UI shells:
- HeaderBar for transport, theme, history, help, settings, and layout actions
- MobileLayout for tabbed and landscape mobile behavior
- DesktopLayout for split-pane analyzer work
- AudioAnalyzerFooter for algorithm mode, content type, MSD frames, FPS, and drop percentage

## Layered Settings Architecture

Runtime detector settings are derived, not manually curated in parallel by each surface.

Current sources:
- MODE_BASELINES
- DEFAULT_ENVIRONMENT
- DEFAULT_LIVE_OVERRIDES
- DEFAULT_DISPLAY_PREFS
- DEFAULT_DIAGNOSTICS
- DEFAULT_MIC_PROFILE

Derivation path:

`	ext
layered state
  -> deriveDetectorSettings()
  -> flat DetectorSettings used by runtime consumers
`

Compatibility path:

`	ext
deriveDefaultDetectorSettings('speech')
  -> DEFAULT_DETECTOR_SETTINGS
  -> DEFAULT_SETTINGS
`

This matters because help text, reset buttons, startup defaults, replay harnesses, and worker bootstrap should all describe the same values.

## Persistence Model

Current persisted settings domains:
- dwa-v2-session
- dwa-v2-display
- dwa-v2-presets
- dwa-v2-startup

Feedback history, labeling, and related session state use their own storage paths under lib/storage/ and lib/dsp/feedbackHistory*.

## Companion Control Path

Current control-side integration path:

`	ext
DoneWell Audio app
  -> /api/companion/relay/[code]
  -> Bitfocus Companion module
  -> mixer profile output logic
`

Verified relay characteristics:
- two queues: app-to-module and module-to-app
- queue cap of 20 messages per direction
- 30-minute inactivity expiry
- 600 requests per minute per pairing code
- ephemeral in-memory storage only

## Optional Data Collection Path

The ML data collection path is opt-in and separate from live control.

`	ext
labeled snapshot batches
  -> /api/v1/ingest
  -> optional forwarding to Supabase
`

That path stores spectral snapshots and labels, not raw audio.

## Operational Constraints

- The hot path must stay allocation-conscious.
- Detector changes should be verified with tests and replay lanes.
- Docs and help should not duplicate stale hardcoded defaults.
- No integration work should imply that the browser app itself is an auto-EQ engine.

## Files To Read For Architecture Work

- components/analyzer/AudioAnalyzer.tsx
- contexts/AudioAnalyzerContext.tsx
- hooks/useDSPWorker.ts
- hooks/useLayeredSettings.ts
- lib/dsp/feedbackDetector.ts
- lib/dsp/dspWorker.ts
- lib/settings/defaultDetectorSettings.ts
- pp/api/companion/relay/[code]/route.ts
"@

System.Collections.Hashtable['docs/DEVELOPER_GUIDE.md'] = @"
# DoneWell Audio Developer Guide

This is the current day-to-day workflow guide for contributors.

## Prerequisites

- Node.js 22+
- pnpm 10.30.1
- a secure origin for microphone testing (localhost is fine in development)

## Setup

`ash
git clone https://github.com/donwellsav/donewellaudio.git
cd donewellaudio
pnpm install
pnpm dev
`

Production-parity run:

`ash
pnpm build
pnpm start
`

## Required Verification

Repo gate:

`ash
npx tsc --noEmit && pnpm test
`

Useful supporting commands:

`ash
pnpm lint
pnpm test:coverage
pnpm run audit:prod -- --audit-level=high
`

Accuracy workflows for DSP tuning:

`ash
npx tsx --tsconfig autoresearch/tsconfig.json autoresearch/evaluate.ts
npx tsx --tsconfig autoresearch/tsconfig.json autoresearch/evaluateSnapshots.ts
`

## Repo Rules That Matter

- Use pnpm, not 
pm or yarn.
- Keep TypeScript strict. Do not introduce ny.
- Treat lib/dsp/feedbackDetector.ts and the worker classification path as performance-sensitive.
- Keep the product analysis-only. Do not create code paths that modify browser audio output.
- Do not duplicate default values in multiple places when the layered settings model already owns them.

## Where To Make Changes

UI, help, and settings:
- components/analyzer/
- components/analyzer/help/
- components/analyzer/settings/

State and orchestration:
- contexts/
- hooks/

Detector and advisory logic:
- lib/dsp/
- 	ypes/advisory.ts

Layered defaults and presets:
- lib/settings/
- 	ypes/settings.ts

Companion integration:
- pp/api/companion/
- companion-module/

Docs and wiki:
- README.md
- docs/*.md
- C:\projects\donewellaudio-wiki
- components/analyzer/help/

## Common Change Recipes

Add or adjust a settings default:
1. update the correct owner in lib/settings/
2. make sure deriveDetectorSettings() still produces the intended runtime value
3. update any UI reset path that should clear back to the owner instead of hardcoding a number
4. update help/docs if the behavior is user-facing

Tune detector recall or suppression:
1. identify whether the regression is in peak detection, fusion, classification, or reporting
2. add or update targeted regression tests near the affected module
3. run synthetic and snapshot replay evaluation when the change affects verdict behavior
4. update docs only after the measured behavior is verified

Change Companion behavior:
1. verify the app relay contract in pp/api/companion/relay/[code]/route.ts
2. verify the module contract in companion-module/src/
3. keep the distinction between analysis, relay transport, and control-side action explicit

## Documentation Hygiene

Prefer current code, tests, and help surfaces over older audit notes when they disagree. If a markdown file becomes stale, fix it immediately instead of carrying contradictory explanations.
