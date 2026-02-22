# DoneWellAudio - Product + Engineering Spec (MVP)

## Goal
A Windows 11 desktop app that:
1) Captures microphone audio from a **user-selected input device**.
2) Detects **likely PA acoustic feedback** (narrow, prominent, persistent peaks).
3) Suggests **analog EQ settings** (no hardware control):
   - Low cut (high-pass)
   - Low shelf
   - Bell (peaking) — **Q adjustable**
   - High shelf
4) Displays suggestions as:
   - `Band 1: 630 Hz, cut -6 dB, Q 8.0`
5) User selects number of bell suggestions via pull-down:
   - `bellBands = 1..7`
6) Live monitor analysis only. After detection is confident, the app can **Freeze** results.

## Non-goals
- Live audio playback or routing
- Automated control of hardware EQ
- Automatic room correction / full system tuning

## MVP UI
- Input device dropdown
- Bell bands dropdown (1..7)
- Start / Freeze / Rescan buttons
- Results list: feedback candidates + confidence breakdown + recommended band cuts

## DSP outputs (data model)
- Peak: frequencyHz, magnitudeDb, prominenceDb
- TrackedPeak: rolling frequency stats, persistence, stability
- FeedbackCandidate: trackedPeak + estimatedQ + confidence (components exposed)
- EqRecommendation: bandIndex, filterType, frequencyHz, gainDb, q, rationale

## Open decisions (must stay explicit)
- Low cut control:
  - Fixed switch positions vs variable knob (represented in EqProfile; if unknown, the app should avoid recommending low cut)
- Exact analog EQ ranges/steps:
  - gain min/max
  - Q min/max and step size (if stepped)
- Default tuning thresholds:
  - configurable in `config/detector_settings*.json`

## Acceptance criteria (MVP)
- App enumerates capture devices and can start capture from selected device.
- App continuously analyzes audio and lists candidates.
- When confidence threshold is met for configured duration, app freezes and shows:
  - top feedback frequencies
  - exactly N bell recommendations where N = user-selected (1..7)
  - each recommendation includes a Q value (clamped to EqProfile)
- Unit tests exist for DSP and recommendation selection.
- CI passes on `windows-latest`.
