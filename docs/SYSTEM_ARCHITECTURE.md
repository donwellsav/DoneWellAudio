# DoneWell Audio System Architecture

This document describes the current runtime architecture without stale counts or obsolete components.

## System Boundary

DoneWell Audio runs almost entirely in the browser:

- microphone capture through the Web Audio API
- peak detection on the main thread
- worker-side classification and advisory generation
- local UI rendering and local storage

Optional integrations exist for:

- snapshot ingestion
- Companion relay and proxy routes
- external mixer or DSP control through the Companion module

## Top-Level Flow

```text
Microphone
  -> getUserMedia
  -> GainNode
  -> AnalyserNode
  -> FeedbackDetector.analyze()     (main thread)
  -> postMessage(peak, spectrum)    (transferable buffers)
  -> dspWorker.ts                   (worker)
  -> fusion + classification + recommendation
  -> advisory updates back to UI
```

## Main Thread

### Owns

- Web Audio graph creation
- analyser reads
- peak detection hot path
- React rendering
- canvas rendering
- session orchestration

### Key files

- `lib/audio/createAudioAnalyzer.ts`
- `lib/dsp/feedbackDetector.ts`
- `hooks/useAudioAnalyzer.ts`
- `components/analyzer/SpectrumCanvas.tsx`

## Worker

### Owns

- algorithm execution
- content-aware fusion
- classifier gating and suppression
- EQ recommendation generation
- advisory lifecycle and dedup

### Key files

- `lib/dsp/dspWorker.ts`
- `lib/dsp/fusionEngine.ts`
- `lib/dsp/classifier.ts`
- `lib/dsp/eqAdvisor.ts`
- `lib/dsp/advisoryManager.ts`

## State Architecture

The UI is not driven by one giant context anymore.

Current provider split:

- `EngineContext`
- `SettingsContext`
- `MeteringContext`
- `DetectionContext`
- `AdvisoryContext`
- `UIContext`

This keeps high-frequency metering and advisory updates from forcing unnecessary re-renders across the whole tree.

## Settings Architecture

The settings system is layered:

- mode baseline
- environment selection
- live overrides
- display preferences
- diagnostics profile

### Key rule

Do not collapse fresh-start defaults and mode baselines.

- fresh-start compatibility snapshot = `25 dB`
- explicit `speech` mode baseline = `20 dB`

That distinction is enforced in tests because a previous refactor silently broke it.

## Recommendation And UX Architecture

The product now tries to tell the operator what kind of problem they are seeing:

- narrow feedback risk
- room resonance
- reflection-rich speech
- broad tonal balance

That distinction appears in:

- issue cards
- ring-out workflow
- room interpretation panel
- help tabs

## Display Architecture

The spectrum has two operator-facing views:

- `Raw`
- `Perceptual`

This is a display-only distinction. It does not change detector thresholds, worker scoring, or classification.

## Storage

Persistent UI and session state live in layered local storage domains:

- session state
- display preferences
- structured rig presets
- startup preference

The old flat "one saved detector bag" model is no longer the primary ownership path.

## API And Integration Boundary

The repo has HTTP route handlers, not a standalone websocket control plane.

Current HTTP duties:

- ingest labeled spectral snapshots
- geo-based GDPR hinting
- health or version reporting
- Companion relay queue
- Companion public HTTP proxy

Anything claiming a general-purpose external websocket API or Dante integration is describing an older plan, not the current shipped architecture.
