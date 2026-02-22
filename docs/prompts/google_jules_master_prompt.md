# Google Jules - MASTER PROMPT (DoneWellAudio)

You are Google Jules, the only code-writing agent for this repository.

## Context
Repo: DoneWellAudio (Windows 11 desktop app).
Purpose: listen to a **user-selected microphone**, detect **likely PA feedback**, and suggest **analog EQ settings**.

The repo already contains:
- `AGENTS.md` (rules + canonical commands)
- `docs/spec.md` (locked requirements + open decisions)
- `config/*.example.json` (detector + EQ profile examples)
- A WPF GUI project and a CLI project
- Unit test project and CI workflow

## Locked requirements (do not change)
- Device selection is in-app (enumerate input devices; user selects one).
- Live monitor analysis only. **No audio playback** required.
- When detection is confident, the app can **Freeze** (stop updating results until Rescan).
- EQ suggestions (no hardware control): low cut, low shelf, bell, high shelf.
- Bell band count is user-selectable **1..7**, and recommendations must output **exactly N bell bands**.
- Bell **Q is adjustable**, so each bell recommendation must include Q.
- Shelf frequencies are **continuous**.
- Display format for bell suggestions:
  - `Band 1: 630 Hz, cut -6 dB, Q 8.0`

## Open decision (must stay explicit)
- Low cut control style: fixed switch positions vs variable knob.
  - If still unknown, do NOT invent knob positions; keep it configurable and avoid low-cut recommendations by default.

## Non-goals
- No refactors unrelated to the issue.
- No new dependencies without explicit justification and plan approval.

## Canonical commands (must remain correct)
- `dotnet restore DoneWellAudio.sln`
- `dotnet build DoneWellAudio.sln -c Release`
- `dotnet test DoneWellAudio.sln -c Release --no-build`

## Workflow (MANDATORY)
1) Produce a **detailed plan** first and stop with the literal marker:
   `AWAITING_PLAN_APPROVAL`
   The plan must include:
   - Files you will change
   - Any new dependencies (prefer none)
   - How you will test locally (commands)
   - Acceptance criteria checklist mapped to the issue
   - Risk list (audio-thread, UI throttling, performance, false positives)

2) Only after plan approval:
   - Implement the smallest possible change that meets the acceptance criteria.
   - Add/adjust unit tests for any DSP or recommendation changes.
   - Ensure the CI workflow stays green.
   - Create a PR with a clear description and test steps.

## What to do next (the execution target)
Implement Milestone: "MVP end-to-end: capture -> detect -> freeze -> suggest"

Acceptance criteria:
- Selecting a device and pressing Start begins capture and analysis.
- The UI lists current feedback candidates with frequency and confidence breakdown.
- When top candidate confidence >= configured threshold for configured consecutive frames:
  - App freezes results (stops updating the candidate list)
  - App shows exactly N bell suggestions (N is the dropdown 1..7)
  - Each suggestion includes: band index, frequency (Hz), cut (dB), Q
- Rescan clears state and restarts detection.
- Unit tests cover:
  - Peak detection on synthetic single tone + noise
  - Two-tone detection
  - Recommendation count equals N
- `dotnet build` and `dotnet test` succeed.

Remember: if you need clarification, update `docs/decisions.md` and stop at plan stage.
