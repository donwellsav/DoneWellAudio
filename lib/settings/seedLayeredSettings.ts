import { getRoomParametersFromDimensions } from '@/lib/dsp/acousticUtils'
import { ENVIRONMENT_TEMPLATES } from '@/lib/settings/environmentTemplates'
import { MODE_BASELINES } from '@/lib/settings/modeBaselines'
import type { DetectorSettings, MicCalibrationProfile } from '@/types/advisory'
import type {
  DiagnosticsProfile,
  DisplayPrefs,
  DwaSessionState,
  EnvironmentSelection,
  RoomTemplateId,
} from '@/types/settings'

export function resolveEnvironmentSelection(
  previous: EnvironmentSelection,
  partial: Partial<EnvironmentSelection> & { templateId?: RoomTemplateId | string },
): EnvironmentSelection {
  if (partial.templateId && partial.templateId in ENVIRONMENT_TEMPLATES) {
    const template = ENVIRONMENT_TEMPLATES[partial.templateId as RoomTemplateId]
    return {
      ...previous,
      templateId: template.templateId,
      treatment: partial.treatment ?? template.treatment,
      roomRT60: partial.roomRT60 ?? template.roomRT60,
      roomVolume: partial.roomVolume ?? template.roomVolume,
      dimensionsM: partial.dimensionsM ?? {
        length: template.lengthM,
        width: template.widthM,
        height: template.heightM,
      },
      provenance: partial.provenance ?? 'template',
      displayUnit: partial.displayUnit ?? previous.displayUnit,
      feedbackOffsetDb: partial.feedbackOffsetDb ?? template.feedbackOffsetDb,
      ringOffsetDb: partial.ringOffsetDb ?? template.ringOffsetDb,
      mainsHumEnabled: partial.mainsHumEnabled ?? previous.mainsHumEnabled ?? true,
      mainsHumFundamental: partial.mainsHumFundamental ?? previous.mainsHumFundamental ?? 'auto',
    }
  }

  const merged: EnvironmentSelection = { ...previous, ...partial }
  if (partial.dimensionsM || partial.treatment || partial.displayUnit) {
    const dims = merged.dimensionsM ?? { length: 15, width: 12, height: 5 }
    const treatment = merged.treatment ?? previous.treatment
    const unit = merged.displayUnit ?? previous.displayUnit
    const FEET_TO_METERS = 0.3048
    const lM = unit === 'feet' ? dims.length * FEET_TO_METERS : dims.length
    const wM = unit === 'feet' ? dims.width * FEET_TO_METERS : dims.width
    const hM = unit === 'feet' ? dims.height * FEET_TO_METERS : dims.height
    const params = getRoomParametersFromDimensions(lM, wM, hM, treatment)
    merged.roomRT60 = Math.round(params.rt60 * 10) / 10
    merged.roomVolume = Math.round(params.volume)
  }
  return merged
}

function normalizeAlgorithmMode(
  mode: DetectorSettings['algorithmMode'] | undefined,
): DiagnosticsProfile['algorithmMode'] | undefined {
  if (mode === undefined) return undefined
  return mode === 'custom' ? 'custom' : 'auto'
}

export function applyInitialDetectorSettings(
  baseSession: DwaSessionState,
  baseDisplay: DisplayPrefs,
  initialSettings: Partial<DetectorSettings>,
): { session: DwaSessionState; display: DisplayPrefs } {
  if (Object.keys(initialSettings).length === 0) {
    return { session: baseSession, display: baseDisplay }
  }

  const session: DwaSessionState = {
    ...baseSession,
    environment: { ...baseSession.environment },
    liveOverrides: { ...baseSession.liveOverrides },
    diagnostics: { ...baseSession.diagnostics },
  }
  const display: DisplayPrefs = { ...baseDisplay }

  if (initialSettings.mode !== undefined) {
    session.modeId = initialSettings.mode
  }

  const baseline = MODE_BASELINES[session.modeId]
  const hasEnvironmentOverride = (
    initialSettings.roomPreset !== undefined ||
    initialSettings.roomTreatment !== undefined ||
    initialSettings.roomLengthM !== undefined ||
    initialSettings.roomWidthM !== undefined ||
    initialSettings.roomHeightM !== undefined ||
    initialSettings.roomDimensionsUnit !== undefined ||
    initialSettings.roomRT60 !== undefined ||
    initialSettings.roomVolume !== undefined ||
    initialSettings.mainsHumEnabled !== undefined ||
    initialSettings.mainsHumFundamental !== undefined
  )

  if (hasEnvironmentOverride) {
    const nextDimensions = (
      initialSettings.roomLengthM !== undefined ||
      initialSettings.roomWidthM !== undefined ||
      initialSettings.roomHeightM !== undefined
    )
      ? {
          length: initialSettings.roomLengthM ?? session.environment.dimensionsM?.length ?? 15,
          width: initialSettings.roomWidthM ?? session.environment.dimensionsM?.width ?? 12,
          height: initialSettings.roomHeightM ?? session.environment.dimensionsM?.height ?? 5,
        }
      : undefined

    session.environment = resolveEnvironmentSelection(session.environment, {
      ...(initialSettings.roomPreset !== undefined ? { templateId: initialSettings.roomPreset } : {}),
      ...(initialSettings.roomTreatment !== undefined ? { treatment: initialSettings.roomTreatment } : {}),
      ...(initialSettings.roomDimensionsUnit !== undefined ? { displayUnit: initialSettings.roomDimensionsUnit } : {}),
      ...(nextDimensions ? { dimensionsM: nextDimensions } : {}),
      ...(initialSettings.roomRT60 !== undefined ? { roomRT60: initialSettings.roomRT60, provenance: 'manual' as const } : {}),
      ...(initialSettings.roomVolume !== undefined ? { roomVolume: initialSettings.roomVolume, provenance: 'manual' as const } : {}),
      ...(initialSettings.mainsHumEnabled !== undefined ? { mainsHumEnabled: initialSettings.mainsHumEnabled } : {}),
      ...(initialSettings.mainsHumFundamental !== undefined ? { mainsHumFundamental: initialSettings.mainsHumFundamental } : {}),
    })
  }

  if (initialSettings.feedbackThresholdDb !== undefined) {
    session.liveOverrides.sensitivityOffsetDb = initialSettings.feedbackThresholdDb - (
      baseline.feedbackThresholdDb + session.environment.feedbackOffsetDb
    )
  }
  if (initialSettings.inputGainDb !== undefined) {
    session.liveOverrides.inputGainDb = initialSettings.inputGainDb
  }
  if (initialSettings.autoGainEnabled !== undefined) {
    session.liveOverrides.autoGainEnabled = initialSettings.autoGainEnabled
  }
  if (initialSettings.autoGainTargetDb !== undefined) {
    session.liveOverrides.autoGainTargetDb = initialSettings.autoGainTargetDb
  }
  if (initialSettings.minFrequency !== undefined || initialSettings.maxFrequency !== undefined) {
    const minFrequency = initialSettings.minFrequency ?? baseline.minFrequency
    const maxFrequency = initialSettings.maxFrequency ?? baseline.maxFrequency
    session.liveOverrides.focusRange = (
      minFrequency === baseline.minFrequency && maxFrequency === baseline.maxFrequency
    )
      ? { kind: 'mode-default' }
      : { kind: 'custom', minHz: minFrequency, maxHz: maxFrequency }
  }
  if (initialSettings.eqPreset !== undefined) {
    session.liveOverrides.eqStyle = initialSettings.eqPreset === baseline.eqPreset
      ? 'mode-default'
      : initialSettings.eqPreset
  }
  if (initialSettings.micCalibrationProfile !== undefined) {
    session.micCalibrationProfile = initialSettings.micCalibrationProfile
  }

  const algorithmMode = normalizeAlgorithmMode(initialSettings.algorithmMode)
  if (algorithmMode !== undefined) {
    session.diagnostics.algorithmMode = algorithmMode
  }
  if (initialSettings.enabledAlgorithms !== undefined) {
    session.diagnostics.enabledAlgorithms = [...initialSettings.enabledAlgorithms]
  }
  if (initialSettings.mlEnabled !== undefined) {
    session.diagnostics.mlEnabled = initialSettings.mlEnabled
  }
  if (initialSettings.adaptivePhaseSkip !== undefined) {
    session.diagnostics.adaptivePhaseSkip = initialSettings.adaptivePhaseSkip
  }
  if (initialSettings.thresholdMode !== undefined) {
    session.diagnostics.thresholdMode = initialSettings.thresholdMode
  }
  if (initialSettings.noiseFloorAttackMs !== undefined) {
    session.diagnostics.noiseFloorAttackMs = initialSettings.noiseFloorAttackMs
  }
  if (initialSettings.noiseFloorReleaseMs !== undefined) {
    session.diagnostics.noiseFloorReleaseMs = initialSettings.noiseFloorReleaseMs
  }
  if (initialSettings.maxTracks !== undefined) {
    session.diagnostics.maxTracks = initialSettings.maxTracks
  }
  if (initialSettings.trackTimeoutMs !== undefined) {
    session.diagnostics.trackTimeoutMs = initialSettings.trackTimeoutMs === baseline.defaultTrackTimeoutMs
      ? 'mode-default'
      : initialSettings.trackTimeoutMs
  }
  if (initialSettings.harmonicToleranceCents !== undefined) {
    session.diagnostics.harmonicToleranceCents = initialSettings.harmonicToleranceCents
  }
  if (initialSettings.peakMergeCents !== undefined) {
    session.diagnostics.peakMergeCents = initialSettings.peakMergeCents
  }

  session.diagnostics.confidenceThresholdOverride = initialSettings.confidenceThreshold === undefined
    ? session.diagnostics.confidenceThresholdOverride
    : initialSettings.confidenceThreshold === baseline.confidenceThreshold
      ? undefined
      : initialSettings.confidenceThreshold
  session.diagnostics.growthRateThresholdOverride = initialSettings.growthRateThreshold === undefined
    ? session.diagnostics.growthRateThresholdOverride
    : initialSettings.growthRateThreshold === baseline.growthRateThreshold
      ? undefined
      : initialSettings.growthRateThreshold
  session.diagnostics.smoothingTimeConstantOverride = initialSettings.smoothingTimeConstant === undefined
    ? session.diagnostics.smoothingTimeConstantOverride
    : initialSettings.smoothingTimeConstant === 0.5
      ? undefined
      : initialSettings.smoothingTimeConstant
  session.diagnostics.sustainMsOverride = initialSettings.sustainMs === undefined
    ? session.diagnostics.sustainMsOverride
    : initialSettings.sustainMs === baseline.sustainMs
      ? undefined
      : initialSettings.sustainMs
  session.diagnostics.clearMsOverride = initialSettings.clearMs === undefined
    ? session.diagnostics.clearMsOverride
    : initialSettings.clearMs === baseline.clearMs
      ? undefined
      : initialSettings.clearMs
  session.diagnostics.prominenceDbOverride = initialSettings.prominenceDb === undefined
    ? session.diagnostics.prominenceDbOverride
    : initialSettings.prominenceDb === baseline.prominenceDb
      ? undefined
      : initialSettings.prominenceDb
  session.diagnostics.aWeightingOverride = initialSettings.aWeightingEnabled === undefined
    ? session.diagnostics.aWeightingOverride
    : initialSettings.aWeightingEnabled === baseline.aWeightingEnabled
      ? undefined
      : initialSettings.aWeightingEnabled
  session.diagnostics.ignoreWhistleOverride = initialSettings.ignoreWhistle === undefined
    ? session.diagnostics.ignoreWhistleOverride
    : initialSettings.ignoreWhistle === baseline.ignoreWhistle
      ? undefined
      : initialSettings.ignoreWhistle
  session.diagnostics.fftSizeOverride = initialSettings.fftSize === undefined
    ? session.diagnostics.fftSizeOverride
    : initialSettings.fftSize === baseline.fftSize
      ? undefined
      : initialSettings.fftSize
  session.diagnostics.ringThresholdDbOverride = initialSettings.ringThresholdDb === undefined
    ? session.diagnostics.ringThresholdDbOverride
    : initialSettings.ringThresholdDb === (baseline.ringThresholdDb + session.environment.ringOffsetDb)
      ? undefined
      : initialSettings.ringThresholdDb

  if (initialSettings.formantGateOverride !== undefined) session.diagnostics.formantGateOverride = initialSettings.formantGateOverride
  if (initialSettings.chromaticGateOverride !== undefined) session.diagnostics.chromaticGateOverride = initialSettings.chromaticGateOverride
  if (initialSettings.combSweepOverride !== undefined) session.diagnostics.combSweepOverride = initialSettings.combSweepOverride
  if (initialSettings.ihrGateOverride !== undefined) session.diagnostics.ihrGateOverride = initialSettings.ihrGateOverride
  if (initialSettings.ptmrGateOverride !== undefined) session.diagnostics.ptmrGateOverride = initialSettings.ptmrGateOverride
  if (initialSettings.mainsHumGateOverride !== undefined) session.diagnostics.mainsHumGateOverride = initialSettings.mainsHumGateOverride

  if (initialSettings.maxDisplayedIssues !== undefined) display.maxDisplayedIssues = initialSettings.maxDisplayedIssues
  if (initialSettings.graphFontSize !== undefined) display.graphFontSize = initialSettings.graphFontSize
  if (initialSettings.showTooltips !== undefined) display.showTooltips = initialSettings.showTooltips
  if (initialSettings.showAlgorithmScores !== undefined) display.showAlgorithmScores = initialSettings.showAlgorithmScores
  if (initialSettings.showPeqDetails !== undefined) display.showPeqDetails = initialSettings.showPeqDetails
  if (initialSettings.showFreqZones !== undefined) display.showFreqZones = initialSettings.showFreqZones
  if (initialSettings.showRoomModeLines !== undefined) display.showRoomModeLines = initialSettings.showRoomModeLines
  if (initialSettings.spectrumWarmMode !== undefined) display.spectrumWarmMode = initialSettings.spectrumWarmMode
  if (initialSettings.rtaDbMin !== undefined) display.rtaDbMin = initialSettings.rtaDbMin
  if (initialSettings.rtaDbMax !== undefined) display.rtaDbMax = initialSettings.rtaDbMax
  if (initialSettings.spectrumLineWidth !== undefined) display.spectrumLineWidth = initialSettings.spectrumLineWidth
  if (initialSettings.showThresholdLine !== undefined) display.showThresholdLine = initialSettings.showThresholdLine
  if (initialSettings.canvasTargetFps !== undefined) display.canvasTargetFps = initialSettings.canvasTargetFps
  if (initialSettings.faderMode !== undefined) display.faderMode = initialSettings.faderMode
  if (initialSettings.faderLinkMode !== undefined) display.faderLinkMode = initialSettings.faderLinkMode
  if (initialSettings.faderLinkRatio !== undefined) display.faderLinkRatio = initialSettings.faderLinkRatio
  if (initialSettings.faderLinkCenterGainDb !== undefined) display.faderLinkCenterGainDb = initialSettings.faderLinkCenterGainDb
  if (initialSettings.faderLinkCenterSensDb !== undefined) display.faderLinkCenterSensDb = initialSettings.faderLinkCenterSensDb
  if (initialSettings.swipeLabeling !== undefined) display.swipeLabeling = initialSettings.swipeLabeling

  return { session, display }
}
