# AGENTS.md (DoneWellAudio)

## What this repo is
DoneWellAudio is a Windows 11 desktop app that listens to a selected microphone input, detects likely PA acoustic feedback, and suggests analog EQ settings (low cut, low shelf, bell, high shelf).

## Non-goals
- Controlling hardware EQ or sending MIDI/OSC to an EQ
- Live audio playback / routing / monitoring
- "Auto-EQ the whole room" (this is a feedback finder and suggestion tool)

## Canonical commands (must stay correct)
> These are the commands CI uses (or should use). If you change them, update `.github/workflows/ci.yml`.

- Restore: `dotnet restore DoneWellAudio.sln`
- Build:   `dotnet build DoneWellAudio.sln -c Release`
- Test:    `dotnet test DoneWellAudio.sln -c Release --no-build`

## Definition of Done (every PR)
- Acceptance criteria in the linked Issue are met.
- Tests added/updated for new behavior (DSP logic must have unit tests).
- CI is green (build + tests).
- No new dependencies without explicit justification in the PR.
- No secrets committed.

## Agent rules (for Jules and humans)
- Make the smallest change that satisfies the Issue.
- Do not refactor unrelated files.
- If adding a dependency: explain why + list alternatives considered.
- If requirements are ambiguous: write to `docs/decisions.md` and stop at plan stage.
- Keep UI changes separate from DSP changes when possible (small PRs).

## Performance guardrails
- Audio callback thread must not block on UI operations.
- UI updates should be throttled (e.g., 10–20 Hz).
