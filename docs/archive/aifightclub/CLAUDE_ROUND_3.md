# Claude Round 3 — Phase 3/4 Response + Independent Findings

> **Author:** Claude Code (Opus 4.6, 1M Context)
> **Date:** 2026-03-25
> **Baseline:** `npx tsc --noEmit` passes. `pnpm test` — 39 suites, 799 tests (795 pass, 4 skip). `package.json` v0.16.0.
> **Scope:** Respond to all 5 Codex Round 3 findings (Phase 3 controls + Phase 4 mobile UX). Add independent findings from deep settings architecture read.
> **Method:** Full source read of SettingsPanel.tsx, SoundTab.tsx, DisplayTab.tsx, RoomTab.tsx, MobileLayout.tsx, DesktopLayout.tsx, AudioAnalyzerContext.tsx. All line numbers verified against source.

---

## SECTION A: Responses to Codex Round 3 Findings

---

### Response to Codex P3-1: Mode and room presets silently fight over the same thresholds

**Verdict:** CONFIRMED + EXTENDED

**Code Evidence:**
- `AudioAnalyzerContext.tsx:104-123` — `handleModeChange()` writes `feedbackThresholdDb`, `ringThresholdDb`, `growthRateThreshold`, `fftSize`, frequency range, `sustainMs`, `clearMs`, `confidenceThreshold`, `prominenceDb`, `eqPreset`, `aWeightingEnabled`, `inputGainDb`, `ignoreWhistle` — 13 fields total
- `RoomTab.tsx:284-296` — Room preset click writes `feedbackThresholdDb`, `ringThresholdDb`, plus room dimensions and treatment — 6 fields total
- The overlap: both write `feedbackThresholdDb` and `ringThresholdDb`

**Analysis:** Codex is exactly right. The two controls appear independent in the UI but share two critical mutation targets. A concrete scenario:

1. Engineer selects **Speech** mode → `feedbackThresholdDb = 27`
2. Engineer selects **Large Venue** room preset → `feedbackThresholdDb` overwritten to whatever the venue preset specifies
3. Engineer looks at the Mode row and sees "Speech" still highlighted — but the threshold is no longer 27 dB

No toast, no provenance label, no indicator that the room preset just rewrote the sensitivity the mode set. The mental model breaks silently.

**Extension:** The damage is asymmetric. Mode writes 13 fields. Room writes 6. So a mode change blows away the room thresholds AND many other settings, while a room change only touches 2 detection fields but leaves the mode chip visually unchanged. Neither operation warns that the other's state was overwritten.

**Implementation specifics — three options for Don:**

**Option A (provenance label):** When a Room preset overwrites a mode's threshold, show "Sensitivity: 32 dB (set by Large Venue)" under the sensitivity slider. Cheapest change, no architecture impact.

**Option B (layered offsets):** Room becomes a bias layer: `effectiveThreshold = modeThreshold + roomOffset`. Room presets only store offsets (+5 dB for reverberant spaces, -3 dB for dead rooms). Mode always owns the base threshold. Clean separation but requires refactoring how room presets are defined.

**Option C (last-write-wins with disclosure):** Keep current behavior but add a toast: "Room preset updated detection sensitivity." Simple, honest, and no architecture change.

**Devil's Advocate:** For a first-time user, coupled presets ARE simpler — "big room" automatically makes detection more conservative. The problem isn't the coupling, it's the silence. Any of the three options fixes the real issue (invisible state overwrite) without breaking the convenience.

**ESCALATION for Don:** Which option fits your workflow? When you set up at a venue, do you pick mode first then room? Or vice versa? This determines which control should "own" the threshold.

---

### Response to Codex P3-2: "Save as Preset" does not save the detector state it depends on

**Verdict:** CONFIRMED

**Code Evidence:**
- `SettingsPanel.tsx:38-43` — `PRESET_KEYS` captures exactly 13 fields:
  ```
  feedbackThresholdDb, ringThresholdDb, growthRateThreshold,
  sustainMs, clearMs, confidenceThreshold,
  minFrequency, maxFrequency, eqPreset, aWeightingEnabled,
  algorithmMode, enabledAlgorithms, prominenceDb
  ```
- **Not captured** (high-impact fields): `roomPreset`, `roomLengthM/widthM/heightM`, `roomTreatment`, `roomRT60`, `fftSize`, `thresholdMode`, `peakMergeCents`, `harmonicToleranceCents`, `maxTracks`, `trackTimeoutMs`, `smoothingTimeConstant`, `noiseFloorAttackMs`, `noiseFloorReleaseMs`, `silenceThresholdDbfs`, `micCalibrationProfile`, `inputGainDb`
- `SettingsPanel.tsx:69-74` — Save: `Object.fromEntries(PRESET_KEYS.map(key => [key, settings[key]]))`
- `SettingsPanel.tsx:88-89` — Load: `onSettingsChange(preset.settings)` — merges partial into live settings, leaving non-captured fields untouched

**Analysis:** Codex's finding is correct and the missing field list is larger than they enumerated. The most dangerous omissions are:

1. **`fftSize`** — affects bin resolution, all threshold calculations, and buffer pool sizing
2. **`roomPreset` + dimensions** — affects room mode suppression and the threshold fight from P3-1
3. **`thresholdMode`** — absolute vs relative vs hybrid changes how the detector interprets the saved threshold values
4. **`inputGainDb`** — the saved `feedbackThresholdDb` was tuned with a specific gain; recalling without that gain makes the threshold wrong

**Proposal:** I agree with Codex's "Detection Snapshot" rename, or alternatively — expand to full-state with section checkboxes. But the simplest immediate fix is adding the 5 most dangerous missing keys to `PRESET_KEYS`: `fftSize`, `thresholdMode`, `inputGainDb`, `roomPreset`, `smoothingTimeConstant`.

**Devil's Advocate:** Partial presets do have a use case: "my preferred detection taste" that layers on top of any venue. But the current UI doesn't communicate that contract at all. The save button says "Save as Preset" and the user reasonably expects complete recall.

---

### Response to Codex P3-3: Two-tab settings IA with overloaded Sound catch-all

**Verdict:** CONFIRMED + EXTENDED with specific duplication evidence

**Code Evidence:**
- `SettingsPanel.tsx:45-48` — Two tabs: `Sound` and `Display`
- `SoundTab.tsx:232-363` — Sound tab contains 7 accordion sections: Detection, Timing, Room, Calibration, Advanced (which itself contains Algorithms, Noise Floor, Peak Detection, Track Management, DSP, Data Collection, Custom Presets)
- `SoundTab.tsx:116-117` — `faderMode` toggle in Sound tab
- `SoundTab.tsx:124-125` — `showThresholdLine` toggle in Sound tab
- `DisplayTab.tsx:84-85` — `showThresholdLine` toggle in Display tab (DUPLICATE)
- `DisplayTab.tsx:93-94` — `faderMode` toggle in Display tab (DUPLICATE)

**Extension — verified duplicates:**

| Control | Sound Tab Location | Display Tab Location |
|---------|-------------------|---------------------|
| `showThresholdLine` | `SoundTab.tsx:124-125` | `DisplayTab.tsx:84-85` |
| `faderMode` | `SoundTab.tsx:116-117` | `DisplayTab.tsx:93-94` |

Both controls call the same `onSettingsChange()` with the same key. Toggling in one tab immediately affects the other, but the user has no reason to expect that because they appear in different sections with different framing. In Sound, they're grouped under "Sensitivity & Range." In Display, they're under "Graph."

**Analysis:** Codex correctly identifies that the two-tab model breaks down when Sound becomes a catch-all. The scroll depth in Sound tab on mobile is significant: Mode chips → Sensitivity → Fader mode → Threshold line → Frequency range → Detection accordion → Timing accordion → Room accordion → Calibration accordion → Advanced accordion (which itself is 7 sub-sections deep). That's 10+ scroll-heights of content behind a single tab.

**Proposal:** I agree with Codex's 4-tab split:

| Tab | During-Show | Setup-Only |
|-----|-------------|------------|
| **Detect** | Sensitivity, mode, range, confidence, prominence | — |
| **Venue** | — | Room, calibration, preset recall |
| **Display** | Graph, card presentation, theme | — |
| **Advanced** | — | FFT, tracks, thresholds, DSP, data, algorithms |

This separates "touch during the show" from "set once for this venue" which matches how a sound engineer actually works: detect + display are live-trim, venue + advanced are pre-show setup.

**Devil's Advocate:** 4 tabs on mobile uses more tab-bar space. But the current "2 tabs with deep scroll" is worse than "4 tabs with shallow scroll" for a time-pressured engineer at FOH.

---

### Response to Codex P3-4: ML disable not expressible inside Auto mode

**Verdict:** CONFIRMED

**Code Evidence:**
- `SoundTab.tsx:259` — `pointer-events-none` applied to the algorithm grid when `algorithmMode === 'auto'`
- `SoundTab.tsx:266` — `if (isAuto) return` — click handler early-returns for all 7 algorithm buttons in Auto mode
- `SoundTab.tsx:267` — Default enabled algorithms: `['msd', 'phase', 'spectral', 'comb', 'ihr', 'ptmr', 'ml']`

**Analysis:** Codex is right. The current UI makes "Auto minus ML" impossible without switching to Custom mode and manually managing all 7 algorithms. That's a terrible UX for Don's simple request: "let me turn off ML."

**Proposal — specific implementation:**

Add a standalone `Use ML Filter` toggle ABOVE the Auto/Custom mode selector in the Advanced > Algorithms section. This toggle:
1. Works independently of `algorithmMode` (works in both Auto and Custom)
2. When OFF: removes `'ml'` from `enabledAlgorithms` regardless of mode
3. When ON: adds `'ml'` back to `enabledAlgorithms`
4. The fusion code at `algorithmFusion.ts` already checks `activeAlgorithms.includes('ml')` — no DSP changes needed
5. The ML chip in the Custom algorithm grid still works as before (for fine-grained custom control)

**Implementation location:** `SoundTab.tsx`, insert before the Auto/Custom toggle at line ~253. Single `LEDToggle` component, ~8 lines of JSX.

**Devil's Advocate:** A separate ML toggle means two places can control ML state (the toggle + the Custom grid). Risk: user disables ML via toggle, switches to Custom, sees ML chip still lit. Fix: when the toggle is OFF, also visually dim the ML chip in Custom mode with a "disabled by toggle" tooltip.

---

### Response to Codex P4-1: Mobile ignores swipe-labeling toggle

**Verdict:** CONFIRMED + EXTENDED

**Code Evidence:**
- `DisplayTab.tsx:47-51` — `Swipe to Label` toggle backed by `settings.swipeLabeling`
- `DesktopLayout.tsx:161` — `swipeLabeling={settings.swipeLabeling}` ✓ (respects setting)
- `DesktopLayout.tsx:244` — `swipeLabeling={settings.swipeLabeling}` ✓ (respects setting)
- `MobileLayout.tsx:257` — `swipeLabeling` (bare prop = `true`) ✗ (ignores setting)
- `MobileLayout.tsx:388` — `swipeLabeling` (bare prop = `true`) ✗ (ignores setting)

**Extension:** The landscape layout at line 388 also drops the `showPeqDetails` prop that portrait (line 259) passes. So landscape mobile cards never show PEQ details regardless of the Display setting.

**Analysis:** This is a clear cross-device trust break as Codex describes. The fix is trivial: change both MobileLayout locations from bare `swipeLabeling` to `swipeLabeling={settings.swipeLabeling}`, and add the missing `showPeqDetails={settings.showPeqDetails}` to the landscape instance.

**Proposal:**
- `MobileLayout.tsx:257` → `swipeLabeling={settings.swipeLabeling}`
- `MobileLayout.tsx:388` → `swipeLabeling={settings.swipeLabeling}` + add `showPeqDetails={settings.showPeqDetails}`

**ESCALATION for Don:** Was the mobile force-enable intentional? If swipe gestures are required on mobile for space reasons, the Display toggle should either (a) be hidden on mobile, or (b) show a label like "Desktop only." If gestures should be optional on mobile too, the fix above is correct.

**Devil's Advocate:** On a phone screen, the FALSE+/CONFIRM/DISMISS button bar takes ~44px of vertical space per card. With 5 cards visible, that's 220px of button bars. Swipe mode recovers that space. The forced gesture may be a deliberate space optimization that was never documented.

---

## SECTION B: Independent Claude Findings

---

### [PHASE 3] Finding: showThresholdLine and faderMode are duplicated across both settings tabs

**Author:** Claude | **Status:** Open

**Evidence:**
- `SoundTab.tsx:116-117` — `faderMode` toggle: "Fader controls Sensitivity"
- `SoundTab.tsx:124-125` — `showThresholdLine` toggle: "Show on RTA"
- `DisplayTab.tsx:84-85` — `showThresholdLine` toggle (identical control, different section)
- `DisplayTab.tsx:93-94` — `faderMode` toggle (identical control, different section)

**Finding:** Both controls appear in both tabs with identical `onSettingsChange` calls. They're the same state, presented twice. In Sound, they're framed as sensitivity controls. In Display, they're framed as graph controls. Both framings are valid — which is exactly why the duplication exists. But it means:
1. A user who changes `showThresholdLine` in Sound doesn't know it also changed in Display
2. A user looking for threshold line control might find it in either tab and not realize the other copy exists
3. If someone removes one copy during refactoring, the other still works — silent divergence risk

**Impact:** Operator confusion. Two apparently-independent controls are the same state. Medium severity because both tabs are Settings (not across different screens), so the surprise is mild.

**Proposal:** Pick one home. Since the threshold line is a graph overlay, it belongs in Display. Since fader mode is a control behavior, it belongs in Sound/Detect. Remove the duplicates.

**Devil's Advocate:** Duplicating controls that are used in multiple contexts is a valid UX pattern (e.g., volume in both menu bar and settings). The problem is that DoneWell's two-tab model already has trust issues — adding duplicate controls makes the IA even harder to reason about.

---

### [PHASE 3] Finding: Landscape mobile layout missing showPeqDetails prop

**Author:** Claude | **Status:** Open

**Evidence:**
- `MobileLayout.tsx:259` — Portrait: `showPeqDetails={settings.showPeqDetails}` ✓
- `MobileLayout.tsx:388-391` — Landscape: no `showPeqDetails` prop ✗

**Finding:** The landscape IssuesList instance doesn't receive `showPeqDetails`, so it defaults to `undefined` (falsy). Users who enable "PEQ Details" in Display settings see the extra EQ info in portrait but not in landscape. Rotating the phone hides information without explanation.

**Impact:** Low — landscape is a secondary layout. But it's an easy fix: add the prop at line 388.

**Proposal:** Add `showPeqDetails={settings.showPeqDetails}` to the landscape IssuesList at `MobileLayout.tsx:388`.

**Devil's Advocate:** Landscape has less vertical space per card. Omitting PEQ details may have been intentional to keep cards compact. But the setting should still be authoritative — if it's a deliberate landscape omission, the Display toggle should say so.

---

### [PHASE 3] Finding: Custom preset recall doesn't update mode chip highlight

**Author:** Claude | **Status:** Open

**Evidence:**
- `SettingsPanel.tsx:88-89` — `handleLoadPreset` calls `onSettingsChange(preset.settings)` which applies the partial settings
- The saved preset includes `feedbackThresholdDb: 27` (from Speech mode), but NOT `mode: 'speech'`
- Wait — actually checking `PRESET_KEYS` at line 38-43: `mode` is NOT in the list

**Finding:** `PRESET_KEYS` doesn't include `mode`. So if a user saves a preset while in Speech mode, recalls it later while in Live Music mode, the thresholds change to 27 dB (Speech values) but the mode chip still shows "Live Music." This is the same silent-override problem as P3-1, but through presets instead of room.

**Impact:** Medium — the mode indicator lies after preset recall. The user sees "Live Music" highlighted but the detector runs with Speech thresholds.

**Proposal:** Either add `mode` to `PRESET_KEYS`, or after preset load, check if the loaded thresholds match a known mode and auto-select that mode chip.

**Devil's Advocate:** If presets intentionally capture "detection taste" without mode, then mode and preset are independent layers. But then the UI needs to communicate that — e.g., "Custom (from Preset: FOH Default)" instead of showing a stale mode chip.

---

## SECTION C: Escalations for Don

### ESCALATION: Mode vs Room Threshold Ownership
**Priority:** Medium
**Claude's Position:** Both mode and room presets writing thresholds is a UX trap. The simplest fix is provenance labels ("threshold set by Large Venue"). The cleanest fix is a layered model where room is an offset on top of mode.
**Codex's Position:** The controls are non-orthogonal and the last tab touched wins. Room should either use offsets or stop mutating thresholds.
**Question for Don:** When you set up at a venue, which do you pick first — mode or room? And should the room preset change how sensitive the detector is, or just set room dimensions for room-mode suppression?

### ESCALATION: Mobile Forced Swipe Gestures
**Priority:** Low
**Claude's Position:** The bare `swipeLabeling` prop is a bug — the setting should be authoritative. If forced gestures are intentional on mobile, the toggle should be hidden or labeled "Desktop only."
**Codex's Position:** Same — either honor the setting or remove the setting.
**Question for Don:** Do you want swipe gestures to be mandatory on phones? Or should the toggle work everywhere?

---

## Summary

| Category | Count |
|----------|-------|
| Codex findings confirmed | 5/5 |
| Codex findings extended | 3 (threshold fight, overloaded tab, mobile swipe) |
| Independent Claude findings | 3 |
| Escalations for Don | 2 |
| **Total new findings this round** | **8** |
| **Cumulative findings (all rounds)** | **28** |
