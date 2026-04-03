/**
 * Default values for the layered settings model.
 *
 * These provide the "zero state" for each layer when no user customization
 * exists. They're used for:
 *   - Initial session state on first load
 *   - Reset to defaults
 *   - Test fixtures
 *
 * @see types/settings.ts for interface definitions
 */

import type { MicCalibrationProfile } from '@/types/advisory'
import type {
  DiagnosticsProfile,
  DisplayPrefs,
  DwaSessionState,
  EnvironmentSelection,
  LiveOverrides,
} from '@/types/settings'

/** Default environment: no room physics, neutral offsets */
export const DEFAULT_ENVIRONMENT: EnvironmentSelection = {
  templateId: 'none',
  treatment: 'typical',
  feedbackOffsetDb: 0,
  ringOffsetDb: 0,
  provenance: 'template',
  roomRT60: 1.0,
  roomVolume: 1000,
  displayUnit: 'meters',
  mainsHumEnabled: true,
  mainsHumFundamental: 'auto' as const,
}

/** Default live overrides: no adjustments from baseline */
export const DEFAULT_LIVE_OVERRIDES: LiveOverrides = {
  sensitivityOffsetDb: 0,
  inputGainDb: 0,
  autoGainEnabled: false,
  autoGainTargetDb: -18,
  focusRange: { kind: 'mode-default' },
  eqStyle: 'mode-default',
}

/** Default display preferences: matches current DEFAULT_SETTINGS display fields */
export const DEFAULT_DISPLAY_PREFS: DisplayPrefs = {
  maxDisplayedIssues: 8,
  graphFontSize: 15,
  showTooltips: true,
  showAlgorithmScores: false,
  showPeqDetails: false,
  showFreqZones: false,
  showRoomModeLines: true,
  spectrumWarmMode: true,
  rtaDbMin: -100,
  rtaDbMax: 0,
  spectrumLineWidth: 0.5,
  showThresholdLine: true,
  canvasTargetFps: 30,
  faderMode: 'sensitivity',
  faderLinkMode: 'unlinked',
  faderLinkRatio: 1.0,
  faderLinkCenterGainDb: 0,
  faderLinkCenterSensDb: 25,
  swipeLabeling: false,
  signalTintEnabled: true,
}

/** Default diagnostics profile: all algorithms on, no overrides */
export const DEFAULT_DIAGNOSTICS: DiagnosticsProfile = {
  mlEnabled: true,
  algorithmMode: 'auto',
  enabledAlgorithms: ['msd', 'phase', 'spectral', 'comb', 'ihr', 'ptmr', 'ml'],
  thresholdMode: 'hybrid',
  noiseFloorAttackMs: 200,
  noiseFloorReleaseMs: 1000,
  maxTracks: 64,
  trackTimeoutMs: 'mode-default' as const,
  harmonicToleranceCents: 200,
  peakMergeCents: 100,
}

/** Default mic calibration profile */
export const DEFAULT_MIC_PROFILE: MicCalibrationProfile = 'none'

/** Default session state: speech mode, no room, no overrides */
export const DEFAULT_SESSION_STATE: DwaSessionState = {
  modeId: 'speech',
  environment: DEFAULT_ENVIRONMENT,
  liveOverrides: DEFAULT_LIVE_OVERRIDES,
  diagnostics: DEFAULT_DIAGNOSTICS,
  micCalibrationProfile: DEFAULT_MIC_PROFILE,
}
