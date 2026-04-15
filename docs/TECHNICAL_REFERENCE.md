# DoneWell Audio Technical Reference

This reference summarizes the current runtime model, detector stack, layered settings contract, and integration surfaces.

## Runtime Model

DoneWell Audio is a Next.js 16 PWA that runs core analysis in the browser.

Main thread:
- owns AudioContext, GainNode, and AnalyserNode
- runs FeedbackDetector.analyze() on FFT data
- renders React UI and canvas surfaces

Web Worker:
- receives peak, spectrum, and time-domain payloads via transferable buffers
- maintains tracks and algorithm history
- fuses algorithm outputs
- classifies tracks and decides whether to surface advisories
- generates PEQ and GEQ recommendations

The product is analysis-only. No browser-side code applies EQ or alters the outgoing audio signal.

## Detection Pipeline

`	ext
Mic
  -> getUserMedia
  -> GainNode
  -> AnalyserNode
  -> FeedbackDetector.analyze()
  -> peak candidate + spectrum + waveform to worker
  -> algorithm scoring
  -> fuseAlgorithmResults()
  -> classifyTrackWithAlgorithms()
  -> shouldReportIssue()
  -> generateEQAdvisory()
  -> advisory state in React
`

Current detection signals:
- MSD
- phase coherence
- spectral flatness
- comb pattern detection
- IHR
- PTMR
- compact ONNX model

These signals do not all vote equally. The worker changes weight profiles for default, speech, music, and compressed material.

## Post-Fusion And Classifier Gates

The detector also applies targeted suppressors after the fused score is computed.

Current gates include:
- IHR gate for instrument-like harmonic structure
- PTMR gate for broad, non-feedback peaks
- formant gate for voiced content
- chromatic gate for strongly pitched musical material
- comb stability gate for unstable spacing
- mains hum gate for 50/60 Hz families

Reporting logic is intentionally conservative in some cases, but it is not allowed to hide clearly dominant feedback evidence just because one subsystem stayed cautious. Recent recall work focused on that exact failure mode.

## Layered Settings Contract

The current settings model is layered. Flat DetectorSettings objects are derived outputs, not the authoring source.

Composition order:

1. MODE_BASELINES
2. DEFAULT_ENVIRONMENT
3. DEFAULT_LIVE_OVERRIDES
4. DEFAULT_DISPLAY_PREFS
5. DEFAULT_DIAGNOSTICS
6. DEFAULT_MIC_PROFILE

Canonical helpers:
- deriveDetectorSettings() - composes the runtime object
- deriveDefaultDetectorSettings(modeId) - builds the effective default snapshot for a mode
- DEFAULT_SETTINGS - compatibility export for the derived Speech snapshot

Practical rule:
- mode-owned controls should follow the active mode baseline unless explicitly overridden
- display and ergonomics controls should follow display defaults
- diagnostics-only controls should come from diagnostics defaults or explicit overrides

## React And State Boundaries

Current provider layout:

`	ext
AudioAnalyzerProvider
  -> EngineContext
  -> SettingsContext
  -> DetectionContext
  -> MeteringContext

AudioAnalyzer then layers:
  -> AdvisoryProvider
  -> UIProvider
  -> PortalContainerProvider
`

Important files:
- contexts/AudioAnalyzerContext.tsx
- contexts/AdvisoryContext.tsx
- contexts/UIContext.tsx
- hooks/useAnalyzerContextState.ts
- hooks/useAudioAnalyzerViewState.ts

## Integration Surfaces

Current HTTP routes:
- POST /api/v1/ingest - opt-in snapshot batch ingest
- GET /api/geo - consent-region helper
- GET|POST|HEAD|DELETE /api/companion/relay/[code] - ephemeral bidirectional Companion relay
- POST /api/companion/proxy - restricted public HTTP proxy for Companion workflows
- GET /api/sentry-example-api - Sentry example route

There is no standalone WebSocket control API in the current codebase.

## Performance Constraints

Important runtime constraints:
- eedbackDetector.ts is the hot path and runs every analysis frame
- canvas rendering targets 30 FPS by default
- worker payloads use transferable arrays to avoid copy overhead
- if the worker is busy, pending peak work can be replaced instead of blocking the UI thread
- the detector is tuned for correctness first, but every extra allocation or recomputation still matters in the live loop

## Verification Workflows

Always run:

`ash
npx tsc --noEmit && pnpm test
`

Use these when tuning detection behavior:

`ash
npx tsx --tsconfig autoresearch/tsconfig.json autoresearch/evaluate.ts
npx tsx --tsconfig autoresearch/tsconfig.json autoresearch/evaluateSnapshots.ts
`

Use this when auditing production dependencies:

`ash
pnpm run audit:prod -- --audit-level=high
`

## Source Of Truth Rule

When documentation, tests, and code disagree, trust the current code and current regression coverage first. Update the docs immediately instead of carrying a split-brain explanation forward.
