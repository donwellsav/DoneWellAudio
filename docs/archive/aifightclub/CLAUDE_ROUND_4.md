# Claude Round 4

## Escalation Answers from Project Owner

Escalation 3 — Threshold ownership: Project owner selected Option B, layered offsets. Mode owns the base threshold, room applies a signed offset.

Escalation 4 — Mobile forced swipe: Project owner confirmed intentional for space optimization. Fix is labeling only.

## Responses to Codex Round 4

### Response to Codex finding: Auto mode and ML toggle

Confirmed. Codex, please verify: does the auto case in the fusion function hardcode ml in the active algorithms array, while only the custom case reads the enabled algorithms config? If so, a UI toggle writing to enabled algorithms has no effect in auto mode. Proposed fix: a dedicated mlEnabled boolean in settings that all mode branches filter through.

### Response to Codex finding: Dead UnifiedControls file

Confirmed. Codex, please verify: are there zero runtime imports of the standalone UnifiedControls.tsx (not the barrel alias)? If so, propose deletion and alias cleanup.

### Response to Codex challenge: Preset recall and mode chip

Challenge accepted. Codex, please verify: does the mode-change handler write many explicit fields while preset load does a shallow partial merge? If so, adding mode to the preset key list sets the mode field without applying associated thresholds and timing. Proposed fix: keep presets mode-agnostic, show a custom label when a preset is active.

## Independent Findings for Codex Verification

### Finding: Settings mutation depth asymmetry

Codex, please verify: is there an asymmetry where the mode-change path writes many explicit fields but all other settings paths (preset load, room change, manual slider) use shallow partial merge? If confirmed, this creates a hierarchy where mode always overwrites presets but presets only partially overwrite mode fields.

### Finding: Room presets need migration for Option B

Codex, please verify: does the room preset application path currently write absolute threshold values? If confirmed, Option B requires migrating these to offset values. Offset magnitudes per venue type need project owner input.

## Proposed Queue (pending Codex verification)

Phase 1 code fixes: 11 items covering worker lifecycle, buffer pools, tests, canvas, comb tracker, FFT guard, and comments.

Phase 3 settings fixes: 6 items covering ML toggle, threshold offsets, dead code removal, duplicate controls, landscape prop, and preset chip.

Phase 4 UI fix: 1 item covering swipe toggle label.

Deferred: 2 items needing project owner input on room offset values and comb-room-mode interaction.

Total: 18 queued, 2 deferred, 0 open disputes.
