# Claude Audit Review Notes

Date: 2026-03-24
Target document: `docs/DEEP_PIPELINE_AUDIT_2026-03-24.md`
Purpose: concise reconciliation notes for Claude.

## What Still Looks Right

These parts of the audit are solid and should stay:

1. The app can detect feedback.
2. The core DSP primitives are mostly mathematically sound for this application.
3. The classifier is heuristic scoring, not a statistically calibrated posterior.
4. `musicAware`, `noiseFloorDecay`, and `harmonicFilterEnabled` are dead or effectively dead controls.
5. Room presets do change sensitivity as well as room parameters.
6. Worker backpressure drops frames outright.
7. `peakMergeCents` defaults to `1000` while the UI only exposes `10..150`.

## Corrections Needed

### 1. Mic calibration is not fully wired through the normal live settings path

The audit says:

> mic calibration is properly wired, updated on settings change, and applied at 50fps

That is too strong.

What the code actually shows:

- `updateConfig()` can apply a new `micCalibrationProfile` if it is present:
  `lib/dsp/feedbackDetector.ts:407-413`
- `_buildPowerSpectrum()` does apply mic calibration in the hot path:
  `lib/dsp/feedbackDetector.ts:1136-1167`
- But `updateSettings()` does **not** map `DetectorSettings.micCalibrationProfile` into `AnalysisConfig`:
  `lib/dsp/feedbackDetector.ts:425-548`
- Mobile auto-apply still writes `'smartphone'` through the UI settings path:
  `components/analyzer/AudioAnalyzer.tsx:329-331`

Recommended rewrite:

> Mic calibration math exists and is applied by the detector when `AnalysisConfig.micCalibrationProfile` is set, but the normal `updateSettings()` bridge does not currently forward `micCalibrationProfile`, so the live UI wiring is incomplete.

### 2. Custom mode does not cleanly expose ML from the shipped operator path

The audit says:

> Default enabledAlgorithms includes 'ml'. ML is NOT silently dropped in custom mode.

That is misleading in the current product surface.

What the code actually shows:

- Fusion fallback includes `ml` when `enabledAlgorithms` is missing:
  `lib/dsp/algorithmFusion.ts:732-733`
- But the shipped default settings exclude `ml`:
  `lib/dsp/constants.ts:705-706`
- And the custom-mode UI only renders six algorithm buttons:
  `components/analyzer/settings/SoundTab.tsx:301-323`

Recommended rewrite:

> The fusion layer supports ML in custom mode as a fallback capability, but the shipped default `enabledAlgorithms` array excludes `ml`, and the custom-mode UI does not expose an ML toggle. So from the operator-facing path, ML is still omitted by default in custom mode.

### 3. Default analysis range is stated incorrectly

The audit says:

> Analysis range defaults: 60–16000 Hz

That is not the app default.

What the code actually shows:

- `DEFAULT_CONFIG`: `minHz = 150`, `maxHz = 10000`
  `types/advisory.ts:382-390`
- `DEFAULT_SETTINGS`: `minFrequency = 150`, `maxFrequency = 10000`
  `lib/dsp/constants.ts:670-674`

Recommended rewrite:

> Default analysis range is `150–10000 Hz`. `60–16000 Hz` is closer to the `ringOut` mode profile, not the application default.

## Combined Bottom Line

The audit is directionally good, but these three points should be corrected:

1. Mic calibration math path exists, but live settings wiring is incomplete.
2. ML support exists in fusion, but custom-mode UX/defaults still omit it.
3. The stated default frequency range is wrong.

If those are fixed, the document will be much closer to a clean merged position:

- strong on DSP math,
- honest about heuristic scoring,
- honest about control-surface drift,
- and no longer overstating calibration/custom-mode behavior.
