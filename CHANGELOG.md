# Changelog

All notable changes to DoneWell Audio are documented in this file.

## [Current Branch] - 2026-04-17

### Default And Mode Policy

- Restored the fresh-start default threshold to `25 dB` without retuning the actual `speech` mode baseline.
- Kept explicit `speech` mode at `20 dB` and restored room offsets to the shipped `speech = 20` reference table.
- `Reset All` now returns to the historical fresh-start snapshot instead of the raw layered zero-state.

### Operator Workflow And Help

- Clarified ring-out as a pre-show workflow with performers, wedges, and realistic open-mic positions.
- Added stronger guidance that repeated clustered cards can indicate a broader region, placement problem, or room issue rather than endless narrow notches.
- Added room-measurement interpretation guidance separating narrow feedback risk, reflection-rich speech, room resonance, and broad tonal balance.
- Added a display-only `Raw` vs `Perceptual` spectrum view and documented that it changes the graph, not detector behavior.

### Validation And Safety

- Added a validation matrix covering speech-formant false positives, room-risk suppression, mains-hum gating, recommendation framing, and display-only spectrum invariants.
- Fixed a compressed-source classification leak where urgent-growth logic could re-promote an already-suppressed compressed signal.
- Updated help, README, architecture docs, technical reference, API docs, and integration docs to match the current codebase.

## Historical Notes

Older release-by-release details now live in the in-app About tab changelog (`lib/changelog.ts`) and the git history. This file is kept branch-oriented so it stays readable while the product is moving quickly.
