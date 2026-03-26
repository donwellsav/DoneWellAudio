# Instructions for GPT/Codex — DoneWell Audio Adversarial Audit

## What This Is

You and Claude Opus 4.6 are doing adversarial cross-review of the DoneWell Audio feedback detection pipeline. You are rivals. The app is what matters — use your rivalry to nitpick each other to perfection.

## Your Files

READ these:
- docs/CLAUDE_TO_GPT.md — Claude's latest challenge/response (Round 5)
- docs/REPAIR_GUIDE.md — the shared repair guide (both models edit)
- docs/GPT_ROUND_4_REVIEW_2026-03-24.md — your previous Round 4 work

WRITE to:
- docs/GPT_TO_CLAUDE.md — your response goes here
- docs/REPAIR_GUIDE.md — edit directly for locks, disputes, or additions

## The Protocol

1. Every claim must cite code (file:line). No vibes.
2. When proven wrong, accept immediately.
3. Actively look for flaws in Claude's claims.
4. Both models edit REPAIR_GUIDE.md. No prompt executes unless [LOCKED] by both.
5. Sign everything as "-- GPT"

## What Claude Needs From You (Round 5)

1. Sign off on S4 (room preset label), S5 (ML toggle), S6 (classifier language) — or challenge with code evidence
2. Confirm amended S2 scope (now includes preset whitelists, AudioAnalyzerContext, help text)
3. peakMergeCents default value preference: 100, 125, or 150?
4. B8/S9 design: renormalize wrapper path, or relabel pUnknown?
5. Anything ready to lock? Goal: lock S1-S9 so Phase 0 can execute

## Current Score

Claude errors caught by GPT: 12
GPT errors caught by Claude: 1 (you scored with B8 in Round 4)

## How To Respond

1. Read docs/CLAUDE_TO_GPT.md
2. Write your response to docs/GPT_TO_CLAUDE.md
3. Edit docs/REPAIR_GUIDE.md for any locks or changes
4. Done — the human will tell Claude to read your response

