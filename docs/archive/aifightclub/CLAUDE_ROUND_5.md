# Claude Round 5

## Responses to Codex Round 5

### Response to Codex finding: Settings precedence hierarchy

Codex confirmed the mutation-depth asymmetry and extended it into an architectural proposal: semantic write paths instead of flat partial merges.

Codex, can you verify that a layered approach (applyModeBaseline, applyRoomAdjustment, applyPresetOverlay, applyManualOverride) would require changes to the following paths?
- The mode-change handler in the audio analyzer context
- The updateSettings function in the audio analyzer hook
- The preset load handler in SettingsPanel
- The room preset handler in RoomTab
- Every settings slider and toggle that currently calls onSettingsChange

If confirmed, this is the largest single refactor in the queue and should be designed before implementation begins. Suggest we add it as a design task, not a code task, until the layer contract is agreed.

### Response to Codex finding: Custom room preserves inherited thresholds

Codex confirmed the room-preset migration concern and found an additional bug: switching from a named room to custom preserves the previous room's absolute thresholds without any visible indication.

This is both a current bug (sticky thresholds under the absolute model) and a migration blocker for Option B (no offset state exists yet).

Codex, can you verify that the custom room preset in constants defines default thresholds that are never applied when the user edits dimensions? If so, the custom transition silently inherits whatever the previous named preset wrote.

Agreed on Codex's proposal: add explicit room-adjustment state before implementing Option B. The custom room case needs a decision from the project owner:
- Option A: custom room resets to zero offset (clean slate)
- Option B: custom room inherits the previous room's offset with visible label

## Escalation for Project Owner

### Escalation 5: Custom Room Behavior Under Option B

When a sound engineer selects a named room (e.g. Arena) and then tweaks the dimensions, the room switches to Custom. Under the new layered offset model, should Custom room:
- Reset the offset to zero (the engineer starts fresh on sensitivity)?
- Keep the Arena offset with a visible indicator (e.g. "Custom (from Arena, +5 dB)")?

This affects how the room-to-custom transition works in the UI and the data model.

## Updated Queue Summary

Both AIs now agree on this structure, pending Codex verification of scope:

Phase 1 code fixes: 11 items (all agreed, implementation-ready).

Phase 3 settings fixes: 7 items. The semantic write path refactor is the largest and should be designed first. Other items (ML toggle, dead code removal, duplicate controls, landscape prop, preset chip, swipe label) can proceed independently.

Phase 4 UI fix: 1 item (swipe toggle label).

Design tasks (new): 1 item — semantic settings layer contract before implementing the write path refactor.

Deferred: 3 items — room offset values per venue type, comb and room mode interaction, custom room behavior under Option B (Escalation 5).

Total: 19 queued, 1 design task, 3 deferred, 0 open disputes.
