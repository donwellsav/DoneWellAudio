# DoneWell Audio Integrations

This document describes the integrations that exist now, not older planned surfaces.

## Current Supported Integration Story

### 1. Bitfocus Companion module

The primary external-control path is the DoneWell Audio Companion module in `companion-module/`.

What it does:

- polls the relay
- receives advisory payloads and apply-result messages
- exposes variables and actions inside Companion
- can drive supported mixers and DSP processors

### 2. Mixer or DSP output through the Companion module

Current module support includes:

- Behringer X32 / X-Air
- Midas M32
- Yamaha TF / CL / QL
- Allen & Heath dLive / SQ
- dbx DriveRack PA2
- dbx DriveRack VENU360
- Generic OSC

The browser app still remains analysis-only. External systems perform any actual control changes.

### 3. Snapshot ingestion

The app can export or upload spectral snapshots for replay and tuning workflows through the ingest route.

This is for:

- validation
- replay fixture generation
- model-tuning support

## What Is Not A Current Repo Integration

The following ideas appear in older docs and plans but are **not** the current live integration model in this repo:

- a general-purpose public WebSocket API
- a standalone mixer bridge service outside the Companion module
- Dante network ingestion built into the app
- browser-side direct control of live mixer hardware without the Companion layer

If you see those claims in older docs, treat them as historical planning notes, not live product behavior.

## Companion Architecture Summary

```text
DoneWell Audio app
  -> companion relay route
  -> DoneWell Audio Companion module
  -> mixer profile or output transport
  -> external hardware
```

Key repo files:

- `companion-module/src/main.ts`
- `companion-module/src/actions.ts`
- `companion-module/src/variables.ts`
- `companion-module/src/mixerProfiles.ts`
- `companion-module/src/mixerOutput.ts`

## Operational Guidance

- Keep auto-apply conservative for live show use.
- Treat ring-out auto-send as a pre-show tool, not a live emergency default.
- No raw audio is transmitted through Companion routes or module payloads.
- If recommendation semantics change in the app, update both the in-app Companion help tab and this document.
