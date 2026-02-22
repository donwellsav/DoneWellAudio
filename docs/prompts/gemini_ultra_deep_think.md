# Gemini Ultra (Deep Think) - Planning Prompt (DoneWellAudio)

You are an expert Windows audio + DSP architect.

I’m building a Windows 11 desktop app called DoneWellAudio that:
- Captures audio from a user-selected microphone input device (device selection is in-app)
- Detects likely acoustic feedback in a PA system
- Provides analog EQ knob suggestions (the app cannot control the EQ)
- EQ types available: low cut (high-pass), low shelf, high shelf, and bell EQ
- The user chooses how many bell bands they can apply via a pull-down: 1–7
- Bell Q is adjustable (include Q in bell recommendations)
- Shelf frequencies are continuous
- Mode: live monitor for analysis only; once feedback is detected/identified, the app can freeze results (no live playback required)
- Suggestions must be displayed as: `Band 1: 630 Hz, cut X dB, Q Y`

CRITICAL: No guessing.
- If a requirement is underspecified, list it under “Open Decisions / Required Inputs”.
- Do not assume EQ knob ranges, step sizes, or low-cut positions unless explicitly defined.

Deliverables (use this exact outline):

1) Operational definition of “feedback detected” for this app (measurable criteria)
2) Windows microphone capture architecture (device enumeration/selection, buffering, threading)
3) DSP design (FFT/windowing, peak detection, tracking, confidence scoring, false positives)
4) Recommendation mapping (top N bell cuts; include Q; show rationale; avoid knob assumptions)
5) Data model (JSON schema for EqProfile + thresholds)
6) Milestones with acceptance criteria and risks
7) Pseudocode for peak picking, tracking, confidence, recommendation selection
