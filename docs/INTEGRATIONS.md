# DoneWell Audio Integration Guide

This document covers the integration surfaces that actually exist in the current codebase.

## Current Integration Story

The main external control path is Bitfocus Companion.

`	ext
DoneWell Audio app
  -> same-origin relay
  -> Bitfocus Companion module
  -> supported mixer profile output
`

The analyzer computes recommendations. Companion and its mixer output logic handle the control side.

## Companion Relay

Route:
- pp/api/companion/relay/[code]/route.ts

Verified behavior:
- bidirectional queues: app-to-module and module-to-app
- GET, POST, HEAD, and DELETE handlers
- pairing code format DWA-XXXXXX
- queue cap of 20 messages per direction
- inactivity expiry after 30 minutes
- per-code rate limit of 600 requests per minute
- ephemeral in-memory storage only

This relay is for short-lived paired sessions, not durable storage.

## Companion Module

Source:
- companion-module/

Useful source files:
- src/main.ts
- src/mixerProfiles.ts
- src/mixerOutput.ts
- src/actions.ts
- src/variables.ts

Distribution note:
- treat the source in this repository as the canonical module implementation
- when packaged builds are published, they belong under the repository's GitHub Releases page

## Supported Mixer Profiles

Verified from companion-module/src/mixerProfiles.ts:
- Behringer X32 / X-Air
- Midas M32 / Pro Series
- Yamaha TF Series
- Yamaha CL / QL Series
- Allen & Heath dLive
- Allen & Heath SQ
- dbx DriveRack PA2
- dbx DriveRack VENU360
- Generic OSC

## Companion Variables

Verified from companion-module/src/variables.ts:
- peq_frequency
- peq_q
- peq_gain
- peq_type
- geq_band
- geq_band_index
- geq_gain
- 
ote
- severity
- confidence
- current_mode
- pending_count
- last_updated
- slots_used
- slots_total
- mixer_model

## Proxy Route

Route:
- pp/api/companion/proxy/route.ts

Purpose:
- restricted server-side HTTP proxy for Companion workflows that need a public upstream request path

Important constraint:
- this route is not a blanket LAN bypass. Private and special-use targets are intentionally restricted.

## Snapshot Ingest Path

Route:
- pp/api/v1/ingest/route.ts

Purpose:
- accept opt-in labeled snapshot batches for training and evaluation workflows
- optionally forward validated batches to Supabase when configured

This path is not a control channel and does not carry raw audio.

## What Is Not In The Current Codebase

The following are not current live integration surfaces and should not be documented as if they exist:
- standalone WebSocket control API
- Dante network ingest path
- generic local mixer bridge outside the Companion module path

## Safety Rules

- DoneWell Audio remains analysis-only even when Companion is enabled.
- The browser app sends advisory and control metadata, not audio streams.
- Treat auto-apply as a control-side decision owned by the module and operator workflow, not by the browser analyzer.
