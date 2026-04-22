/**
 * Derivation Function — computes DetectorSettings from layered state.
 *
 * This is the architectural seam between the new layered ownership model
 * and the existing DSP pipeline. The output is a standard DetectorSettings
 * object that feedbackDetector, dspWorker, classifier, and algorithmFusion
 * consume unchanged.
 *
 * Composition order:
 *   1. Mode baseline (frozen detector policy)
 *   2. Environment offsets (relative threshold adjustments)
 *   3. Live operator overrides (sensitivity, gain, focus range)
 *   4. Diagnostics overrides (expert-only field replacements)
 *   5. Display preferences (UI-only, no DSP impact)
 *
 * @see docs/CONTROLS_SETTINGS_REBUILD_SPEC_2026-03-25.md for design rationale
 */

import type { DetectorSettings } from '@/types/advisory'
import type {
  DiagnosticsProfile,
  DisplayPrefs,
  EnvironmentSelection,
  LiveOverrides,
  ModeBaseline,
} from '@/types/settings'

/** Default auto-gain target when mode baseline doesn't specify one */
const DEFAULT_AUTO_GAIN_TARGET_DB = -18

/** Minimum allowed threshold to prevent nonsensical negative values */
const MIN_THRESHOLD_DB = 1

/**
 * Derives a flat DetectorSettings object from the layered state contract.
 *
 * This function is pure — no side effects, no state reads.
 * It can be called in React render (via useMemo) or in tests.
 */
export function deriveDetectorSettings(
  baseline: ModeBaseline,
  environment: EnvironmentSelection,
  live: LiveOverrides,
  display: DisplayPrefs,
  diagnostics: DiagnosticsProfile,
): DetectorSettings {
  // ── Threshold composition ─────────────────────────────────────────────
  // effectiveThreshold = baseline + room offset + live sensitivity offset
  const feedbackThresholdDb = Math.max(
    MIN_THRESHOLD_DB,
    baseline.feedbackThresholdDb + environment.feedbackOffsetDb + live.sensitivityOffsetDb,
  )

  const ringThresholdDb = diagnostics.ringThresholdDbOverride ?? Math.max(
    MIN_THRESHOLD_DB,
    baseline.ringThresholdDb + environment.ringOffsetDb,
  )

  // ── Focus range ───────────────────────────────────────────────────────
  let minFrequency: number
  let maxFrequency: number
  switch (live.focusRange.kind) {
    case 'mode-default':
      minFrequency = baseline.minFrequency
      maxFrequency = baseline.maxFrequency
      break
    case 'preset':
      ({ minFrequency, maxFrequency } = resolveFocusRangePreset(live.focusRange.id))
      break
    case 'custom':
      minFrequency = live.focusRange.minHz
      maxFrequency = live.focusRange.maxHz
      break
  }

  // ── EQ style ──────────────────────────────────────────────────────────
  const eqPreset = live.eqStyle === 'mode-default' ? baseline.eqPreset : live.eqStyle

  // ── Auto-gain target ──────────────────────────────────────────────────
  const autoGainTargetDb = live.autoGainTargetDb !== DEFAULT_AUTO_GAIN_TARGET_DB
    ? live.autoGainTargetDb
    : (baseline.defaultAutoGainTargetDb ?? DEFAULT_AUTO_GAIN_TARGET_DB)

  // ── Diagnostics overrides ─────────────────────────────────────────────
  const confidenceThreshold = diagnostics.confidenceThresholdOverride ?? baseline.confidenceThreshold
  const growthRateThreshold = diagnostics.growthRateThresholdOverride ?? baseline.growthRateThreshold
  const smoothingTimeConstant = diagnostics.smoothingTimeConstantOverride ?? 0.5

  // ── Compose the flat DetectorSettings ─────────────────────────────────
  return {
    // Mode identity
    mode: baseline.modeId,

    // FFT (baseline, overridable by diagnostics)
    fftSize: diagnostics.fftSizeOverride ?? baseline.fftSize,
    smoothingTimeConstant,

    // Frequency range (from focus range resolution)
    minFrequency,
    maxFrequency,

    // Thresholds (composed from baseline + environment + live)
    feedbackThresholdDb,
    ringThresholdDb,
    growthRateThreshold,

    // Timing (baseline, overridable by diagnostics)
    sustainMs: diagnostics.sustainMsOverride ?? baseline.sustainMs,
    clearMs: diagnostics.clearMsOverride ?? baseline.clearMs,

    // Report gate
    confidenceThreshold,
    prominenceDb: diagnostics.prominenceDbOverride ?? baseline.prominenceDb,

    // EQ
    eqPreset,

    // Input
    inputGainDb: live.inputGainDb,
    autoGainEnabled: live.autoGainEnabled,
    autoGainTargetDb,

    // A-weighting
    aWeightingEnabled: diagnostics.aWeightingOverride ?? baseline.aWeightingEnabled,

    // Harmonic
    harmonicToleranceCents: diagnostics.harmonicToleranceCents,
    ignoreWhistle: diagnostics.ignoreWhistleOverride ?? baseline.ignoreWhistle,

    // Room (pass through for classifier/worker consumption)
    roomPreset: environment.templateId as DetectorSettings['roomPreset'],
    roomRT60: environment.roomRT60,
    roomVolume: environment.roomVolume,
    roomTreatment: environment.treatment,
    roomLengthM: environment.dimensionsM?.length ?? 15,
    roomWidthM: environment.dimensionsM?.width ?? 12,
    roomHeightM: environment.dimensionsM?.height ?? 5,
    roomDimensionsUnit: environment.displayUnit,
    mainsHumEnabled: environment.mainsHumEnabled ?? true,
    mainsHumFundamental: environment.mainsHumFundamental ?? 'auto',

    // Algorithm / diagnostics
    algorithmMode: diagnostics.algorithmMode,
    enabledAlgorithms: diagnostics.enabledAlgorithms,
    mlEnabled: diagnostics.mlEnabled,
    adaptivePhaseSkip: diagnostics.adaptivePhaseSkip ?? true,

    // Threshold mode
    thresholdMode: diagnostics.thresholdMode,

    // Noise floor timing
    noiseFloorAttackMs: diagnostics.noiseFloorAttackMs,
    noiseFloorReleaseMs: diagnostics.noiseFloorReleaseMs,

    // Track management
    maxTracks: diagnostics.maxTracks,
    trackTimeoutMs: diagnostics.trackTimeoutMs === 'mode-default'
      ? baseline.defaultTrackTimeoutMs
      : diagnostics.trackTimeoutMs,
    peakMergeCents: diagnostics.peakMergeCents,

    // Gate multiplier overrides (expert-only, from DiagnosticsProfile)
    formantGateOverride: diagnostics.formantGateOverride,
    chromaticGateOverride: diagnostics.chromaticGateOverride,
    combSweepOverride: diagnostics.combSweepOverride,
    ihrGateOverride: diagnostics.ihrGateOverride,
    ptmrGateOverride: diagnostics.ptmrGateOverride,
    mainsHumGateOverride: diagnostics.mainsHumGateOverride,

    // Display (from DisplayPrefs — never flows to worker, but part of DetectorSettings)
    maxDisplayedIssues: display.maxDisplayedIssues,
    graphFontSize: display.graphFontSize,
    showTooltips: display.showTooltips,
    showAlgorithmScores: display.showAlgorithmScores,
    showPeqDetails: display.showPeqDetails,
    showFreqZones: display.showFreqZones,
    showRoomModeLines: display.showRoomModeLines,
    spectrumWarmMode: display.spectrumWarmMode,
    spectrumSmoothingMode: display.spectrumSmoothingMode,
    rtaDbMin: display.rtaDbMin,
    rtaDbMax: display.rtaDbMax,
    spectrumLineWidth: display.spectrumLineWidth,
    showThresholdLine: display.showThresholdLine,
    canvasTargetFps: display.canvasTargetFps,
    faderMode: display.faderMode,
    faderLinkMode: display.faderLinkMode,
    faderLinkRatio: display.faderLinkRatio,
    faderLinkCenterGainDb: display.faderLinkCenterGainDb,
    faderLinkCenterSensDb: display.faderLinkCenterSensDb,
    swipeLabeling: display.swipeLabeling,
    signalTintEnabled: display.signalTintEnabled,
  }
}

// ─── Focus Range Presets ──────────────────────────────────────────────────────

const FOCUS_RANGE_PRESETS: Record<string, { minFrequency: number; maxFrequency: number }> = {
  vocal: { minFrequency: 150, maxFrequency: 10000 },
  monitor: { minFrequency: 200, maxFrequency: 6000 },
  full: { minFrequency: 60, maxFrequency: 16000 },
  sub: { minFrequency: 20, maxFrequency: 300 },
}

function resolveFocusRangePreset(id: string): { minFrequency: number; maxFrequency: number } {
  return FOCUS_RANGE_PRESETS[id] ?? FOCUS_RANGE_PRESETS.vocal
}
