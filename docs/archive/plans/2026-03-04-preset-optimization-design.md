# Preset Optimization for Load-In — Design

## Context

The 8 operation mode presets were tuned for steady-state showtime performance. During load-in (the pre-show phase where engineers walk gain structure and ring out mics), detection needs to be faster and more sensitive. This design tunes all presets (except Ring Out, which is already optimal) for better load-in performance without meaningfully hurting showtime accuracy.

## Files Modified

- `lib/dsp/constants.ts`

## Approach

Tune 4 parameters across 7 presets (Ring Out unchanged):

| Parameter | Direction | Rationale |
|---|---|---|
| `sustainMs` | ↓ 20–25% | Faster confirmation — less program material during load-in |
| `confidenceThreshold` | ↓ 0.05 | Surface more marginal peaks during ring-out |
| `holdTimeMs` | ↑ 1000 ms | Engineer needs time to walk to EQ and make cuts |
| `prominenceDb` | ↓ 2 dB | Catch quieter resonances in empty rooms |

## Per-Preset Changes

| Preset | sustainMs | confidenceThreshold | holdTimeMs | prominenceDb |
|---|---|---|---|---|
| speech | 200→150 | 0.35→0.30 | 3000→4000 | 10→8 |
| worship | 350→280 | 0.50→0.45 | 4000 (keep) | 14→12 |
| liveMusic | 400→350 | 0.60→0.55 | 2000→3000 | 16→14 |
| theater | 250→200 | 0.45→0.40 | 3000→4000 | 12→10 |
| monitors | 150 (keep) | 0.40→0.35 | 2000→3000 | 10→8 |
| ringOut | unchanged | unchanged | unchanged | unchanged |
| broadcast | 200→150 | 0.35→0.30 | 3000→4000 | 10→8 |
| outdoor | 300→250 | 0.50→0.45 | 2500→3500 | 14→12 |

## DEFAULT_SETTINGS Sync

DEFAULT_SETTINGS mirrors the speech preset and gets the same 4 changes.

## What's NOT Changing

- feedbackThresholdDb / ringThresholdDb (SPL-based, venue-calibrated)
- growthRateThreshold (rate-based, already appropriate)
- fftSize (resolution vs. time tradeoff is venue-specific)
- Frequency ranges (tied to expected content type)
- clearMs (disappearance timing already appropriate)
- musicAware / autoMusicAware (content-type flags)
- eqPreset / aWeightingEnabled / inputGainDb (hardware/venue-specific)
