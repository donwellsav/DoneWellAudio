# Code Review Fixes — PR #53 Post-Merge Audit

## Context

PR #53 ("remove duplicate detections") introduced three mechanisms to reduce duplicate feedback advisories: widened frequency tolerance, bidirectional harmonic check, and band cooldown. A deep code review found 7 issues. This design addresses all 7.

## Files Modified

- `lib/dsp/constants.ts`
- `lib/dsp/dspWorker.ts`

## Fixes

### Fix 1: Move BAND_COOLDOWN_MS to constants.ts

Move `const BAND_COOLDOWN_MS = 1500` from dspWorker.ts (line 150) into constants.ts alongside TRACK_TIMEOUT_MS and other timing constants. Import it in dspWorker.ts.

### Fix 2: Sync harmonic tolerance to 100 cents

Update `HARMONIC_SETTINGS.TOLERANCE_CENTS` from 50 to 100 and update its comment to say it's synced with ASSOCIATION_TOLERANCE_CENTS. Also update `DEFAULT_SETTINGS.harmonicToleranceCents` from 50 to 100.

Rationale: The comment explicitly says "matches track association tolerance". ASSOCIATION_TOLERANCE_CENTS was widened to 100 but harmonic tolerance was left at 50. Peaks jittering 75 cents could be merged into tracks but not recognized as harmonics, defeating the dedup.

### Fix 3: Dedup ordering — no change

The freq-primary ordering is the intended mainline behavior. The band-primary ordering existed on a branch that was never merged. No action.

### Fix 4: Band cooldown asymmetry — no change

The cooldown only gating new advisory creation (not updates to existing advisories) is correct. Existing advisories should update freely; the cooldown prevents *new* advisories from appearing on the same band too quickly.

### Fix 5: Clear bandClearedAt on init

Add `bandClearedAt.clear()` to the init handler alongside the other `.clear()` calls. Defensive — ensures init is self-sufficient even if reset isn't called first.

### Fix 6: Only set cooldown on explicit clearPeak

Remove the `bandClearedAt.set()` call from the `shouldReportIssue=false` path (line ~553). Keep only the `bandClearedAt.set()` in the `clearPeak` handler.

Rationale: `shouldReportIssue=false` means the DSP decided the peak isn't significant *right now*. It could rebuild immediately. Suppressing re-detection for 1.5s after a classification gate failure could miss real feedback. Only explicit clears (hold-time expiry from main thread) should trigger cooldown.

### Fix 7: Add trackToAdvisoryId mapping on duplicate absorption

When a lower-urgency duplicate is absorbed into an existing advisory, add `trackToAdvisoryId.set(track.id, dup.id)` before the `break`. Without this, the absorbed track re-enters duplicate detection every frame, inflating cluster counts.
