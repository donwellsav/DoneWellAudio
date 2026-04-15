/**
 * Layered Settings Type Hierarchy — v2
 *
 * Replaces the flat DetectorSettings editing model with a layered ownership
 * contract. Each value has exactly one owner. DetectorSettings becomes a
 * derived runtime object computed by deriveDetectorSettings().
 *
 * Ownership layers:
 *   1. ModeBaseline      — tuned detector policy per mode
 *   2. EnvironmentSelection — venue context + acoustic offsets
 *   3. LiveOverrides     — operator adjustments during a show
 *   4. DisplayPrefs      — rendering / visibility / ergonomics
 *   5. DiagnosticsProfile — opt-in expert DSP controls
 *   6. Calibration       — mic profile (separate lifecycle)
 *
 * @see lib/settings/deriveSettings.ts for the derivation function
 * @see docs/CONTROLS_SETTINGS_REBUILD_SPEC_2026-03-25.md for design rationale
 */

import type { Algorithm, MicCalibrationProfile, OperationMode } from '@/types/advisory'

// ─── Mode Baseline ────────────────────────────────────────────────────────────

/** Reuse the existing OperationMode union as ModeId */
export type ModeId = OperationMode

/**
 * Frozen detector policy for a given mode. Extracted from OPERATION_MODES
 * in constants.ts. These values are never directly authored by UI controls —
 * they are the starting point for derivation.
 */
export interface ModeBaseline {
  readonly modeId: ModeId
  readonly label: string
  readonly description: string
  // Detection thresholds
  readonly feedbackThresholdDb: number
  readonly ringThresholdDb: number
  readonly growthRateThreshold: number
  // FFT
  readonly fftSize: 4096 | 8192 | 16384
  // Frequency range
  readonly minFrequency: number
  readonly maxFrequency: number
  // Timing
  readonly sustainMs: number
  readonly clearMs: number
  // Report gate
  readonly confidenceThreshold: number
  readonly prominenceDb: number
  // Defaults
  readonly eqPreset: 'surgical' | 'heavy'
  readonly aWeightingEnabled: boolean
  readonly defaultInputGainDb: number
  /** Only ringOut and broadcast override this; others inherit the shared -18 dBFS target. */
  readonly defaultAutoGainTargetDb?: number
  readonly ignoreWhistle: boolean
  /** Per-mode track inactivity timeout. Used when diagnostics.trackTimeoutMs is 'mode-default'. */
  readonly defaultTrackTimeoutMs: number
}

// ─── Environment / Room ───────────────────────────────────────────────────────

/** Room preset template ID — matches keys from the current ROOM_PRESETS object */
export type RoomTemplateId = 'none' | 'small' | 'medium' | 'large' | 'arena' | 'worship' | 'custom'

/**
 * Frozen room template data. Offsets are relative to mode baseline —
 * not absolute threshold values. Extracted from ROOM_PRESETS in constants.ts.
 *
 * The offset math: effectiveThreshold = baseline + offset + liveOverride
 */
export interface EnvironmentTemplate {
  readonly templateId: RoomTemplateId
  readonly label: string
  readonly description: string
  readonly lengthM: number
  readonly widthM: number
  readonly heightM: number
  readonly treatment: 'untreated' | 'typical' | 'treated'
  readonly roomRT60: number
  readonly roomVolume: number
  readonly schroederFreq: number
  /** Threshold offset relative to mode baseline. Positive = more conservative. */
  readonly feedbackOffsetDb: number
  /** Ring threshold offset relative to mode baseline. */
  readonly ringOffsetDb: number
}

/**
 * The user's active environment selection. May be a template or custom.
 * Offsets are always relative to the active mode baseline.
 */
export interface EnvironmentSelection {
  templateId: RoomTemplateId | string
  dimensionsM?: { length: number; width: number; height: number }
  treatment: 'untreated' | 'typical' | 'treated'
  /** Feedback threshold offset from mode baseline (dB). Positive = more conservative. */
  feedbackOffsetDb: number
  /** Ring threshold offset from mode baseline (dB). */
  ringOffsetDb: number
  provenance: 'template' | 'measured' | 'manual'
  /** Reverberation time — derived from dimensions + treatment, or manual entry */
  roomRT60: number
  /** Room volume in m³ — derived from dimensions, or manual entry */
  roomVolume: number
  displayUnit: 'meters' | 'feet'
  /** Whether mains hum detection gate is active. Disable in hum-free venues. */
  mainsHumEnabled: boolean
  /** Mains frequency: 'auto' detects 50/60 Hz; explicit overrides auto-detection. */
  mainsHumFundamental: 'auto' | 50 | 60
}

// ─── Live Operator Overrides ──────────────────────────────────────────────────

/** Focus range preset IDs */
export type FocusRangePresetId = 'vocal' | 'monitor' | 'full' | 'sub'

/** Discriminated union for focus range selection */
export type FocusRange =
  | { kind: 'mode-default' }
  | { kind: 'preset'; id: FocusRangePresetId }
  | { kind: 'custom'; minHz: number; maxHz: number }

/**
 * What an engineer might change during a show or soundcheck without
 * redefining the rig. These sit on top of mode + environment.
 */
export interface LiveOverrides {
  /** Added to baseline + environment threshold. Positive = more conservative. */
  sensitivityOffsetDb: number
  inputGainDb: number
  autoGainEnabled: boolean
  autoGainTargetDb: number
  focusRange: FocusRange
  /** 'mode-default' uses the baseline's eqPreset */
  eqStyle: 'surgical' | 'heavy' | 'mode-default'
}

// ─── Display Preferences ──────────────────────────────────────────────────────

/**
 * All rendering, visibility, and ergonomics state.
 * Never flows to the DSP worker. Never part of a rig preset.
 */
export interface DisplayPrefs {
  maxDisplayedIssues: number
  graphFontSize: number
  showTooltips: boolean
  showAlgorithmScores: boolean
  showPeqDetails: boolean
  showFreqZones: boolean
  showRoomModeLines: boolean
  spectrumWarmMode: boolean
  rtaDbMin: number
  rtaDbMax: number
  spectrumLineWidth: number
  showThresholdLine: boolean
  canvasTargetFps: number
  faderMode: 'gain' | 'sensitivity' // DEPRECATED — kept for mobile toggle during dual-fader migration
  faderLinkMode: 'unlinked' | 'linked' | 'linked-reversed'
  faderLinkRatio: number        // 0.5–2.0, sensitivity-to-gain visual ratio
  faderLinkCenterGainDb: number // Home position for gain fader (default 0)
  faderLinkCenterSensDb: number // Home position for sensitivity fader (default 25)
  swipeLabeling: boolean
  /** Enable signal-responsive background tint (severity → console color shift) */
  signalTintEnabled: boolean
}

// ─── Diagnostics / Expert Policy ──────────────────────────────────────────────

/**
 * Opt-in low-level DSP controls for troubleshooting and benchmarking.
 * Override fields take precedence over mode baseline when present.
 */
export interface DiagnosticsProfile {
  mlEnabled: boolean
  adaptivePhaseSkip?: boolean
  algorithmMode: 'auto' | 'custom'
  enabledAlgorithms: Algorithm[]
  thresholdMode: 'absolute' | 'relative' | 'hybrid'
  noiseFloorAttackMs: number
  noiseFloorReleaseMs: number
  maxTracks: number
  trackTimeoutMs: number | 'mode-default'
  harmonicToleranceCents: number
  peakMergeCents: number
  // Optional overrides — when present, take precedence over mode baseline
  confidenceThresholdOverride?: number
  growthRateThresholdOverride?: number
  smoothingTimeConstantOverride?: number
  sustainMsOverride?: number
  clearMsOverride?: number
  prominenceDbOverride?: number
  aWeightingOverride?: boolean
  ignoreWhistleOverride?: boolean
  fftSizeOverride?: 4096 | 8192 | 16384
  ringThresholdDbOverride?: number
  // Gate multiplier overrides — expert-only, no UI. When set, override the
  // hardcoded gate constants in fusion/classifier. Values are multipliers (0–1).
  formantGateOverride?: number    // default 0.65 (classifier.ts formant gate)
  chromaticGateOverride?: number  // default 0.60 (classifier.ts chromatic quantization gate)
  combSweepOverride?: number      // default 0.25 (algorithmFusion.ts comb stability gate)
  ihrGateOverride?: number        // default 0.65 (algorithmFusion.ts IHR gate)
  ptmrGateOverride?: number       // default 0.80 (algorithmFusion.ts PTMR gate)
  mainsHumGateOverride?: number   // default 0.40 (classifier.ts mains hum gate)
}

// ─── Rig Preset ───────────────────────────────────────────────────────────────

/**
 * A structured rig preset that captures mode + environment + live defaults.
 * Schema-versioned for future migration support.
 * Display prefs and diagnostics are excluded by design.
 */
export interface RigPresetV1 {
  schemaVersion: 1
  id: string
  name: string
  modeId: ModeId
  environment: EnvironmentSelection
  liveDefaults: LiveOverrides
  diagnosticsProfileId?: string
  createdAt: string
  updatedAt: string
}

// ─── Session State ────────────────────────────────────────────────────────────

/**
 * The full layered state that persists across page loads.
 * This is what auto-saves — NOT a DetectorSettings bag.
 */
export interface DwaSessionState {
  modeId: ModeId
  environment: EnvironmentSelection
  liveOverrides: LiveOverrides
  diagnostics: DiagnosticsProfile
  micCalibrationProfile: MicCalibrationProfile
}

// ─── Startup Preference ───────────────────────────────────────────────────────

/**
 * Optional preset to load on launch. Separate from session state.
 */
export interface StartupPreference {
  presetId?: string
}
