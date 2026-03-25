/**
 * useLayeredSettings — Layered settings state manager.
 *
 * Holds the new layered state (mode + environment + live + display + diagnostics)
 * and exposes semantic actions. Produces `derivedSettings: DetectorSettings` via
 * the derivation function for backward compatibility with the existing pipeline.
 *
 * This hook also exposes a legacy shim (`applyLegacyPartial`) that routes
 * old-style `Partial<DetectorSettings>` calls to the appropriate semantic
 * actions. The shim exists only for the transition period (Phases 3–5) and
 * is deleted in Phase 6.
 *
 * @see lib/settings/deriveSettings.ts for the derivation function
 * @see types/settings.ts for the layered type hierarchy
 */

'use client'

import { useCallback, useMemo, useRef, useState } from 'react'

import { deriveDetectorSettings } from '@/lib/settings/deriveSettings'
import {
  DEFAULT_DIAGNOSTICS,
  DEFAULT_DISPLAY_PREFS,
  DEFAULT_ENVIRONMENT,
  DEFAULT_LIVE_OVERRIDES,
  DEFAULT_SESSION_STATE,
} from '@/lib/settings/defaults'
import { ENVIRONMENT_TEMPLATES } from '@/lib/settings/environmentTemplates'
import { MODE_BASELINES } from '@/lib/settings/modeBaselines'
import {
  displayStorageV2,
  sessionStorageV2,
} from '@/lib/storage/settingsStorageV2'
import type { DetectorSettings, MicCalibrationProfile, OperationMode } from '@/types/advisory'
import type {
  DiagnosticsProfile,
  DisplayPrefs,
  DwaSessionState,
  EnvironmentSelection,
  FocusRange,
  LiveOverrides,
  ModeId,
  RoomTemplateId,
} from '@/types/settings'

// ─── Keys used to detect legacy call patterns ────────────────────────────────

/** Fields that are owned by the mode baseline (written by handleModeChange) */
const MODE_OWNED_KEYS = new Set([
  'feedbackThresholdDb', 'ringThresholdDb', 'growthRateThreshold',
  'fftSize', 'minFrequency', 'maxFrequency', 'sustainMs', 'clearMs',
  'confidenceThreshold', 'prominenceDb', 'eqPreset', 'aWeightingEnabled',
  'inputGainDb', 'ignoreWhistle',
])

/** Fields owned by display preferences */
const DISPLAY_KEYS = new Set([
  'maxDisplayedIssues', 'graphFontSize', 'showTooltips', 'showAlgorithmScores',
  'showPeqDetails', 'showFreqZones', 'spectrumWarmMode', 'rtaDbMin', 'rtaDbMax',
  'spectrumLineWidth', 'showThresholdLine', 'canvasTargetFps', 'faderMode', 'swipeLabeling',
])

/** Fields owned by diagnostics */
const DIAGNOSTICS_KEYS = new Set([
  'algorithmMode', 'enabledAlgorithms', 'mlEnabled', 'thresholdMode',
  'noiseFloorAttackMs', 'noiseFloorReleaseMs', 'maxTracks', 'trackTimeoutMs',
  'harmonicToleranceCents', 'peakMergeCents',
])

/** Fields owned by room/environment */
const ROOM_KEYS = new Set([
  'roomPreset', 'roomLengthM', 'roomWidthM', 'roomHeightM', 'roomTreatment',
  'roomDimensionsUnit',
])

// ─── Return type ─────────────────────────────────────────────────────────────

export interface UseLayeredSettingsReturn {
  /** The derived DetectorSettings — compatible with the existing pipeline */
  derivedSettings: DetectorSettings

  /** Direct access to layered state (for new UI surfaces) */
  session: DwaSessionState
  display: DisplayPrefs

  // ── Semantic actions ─────────────────────────────────────────────────
  setMode: (modeId: ModeId) => void
  setEnvironment: (env: Partial<EnvironmentSelection> & { templateId?: RoomTemplateId | string }) => void
  setSensitivityOffset: (db: number) => void
  setInputGain: (db: number) => void
  setAutoGain: (enabled: boolean, targetDb?: number) => void
  setFocusRange: (range: FocusRange) => void
  setEqStyle: (style: LiveOverrides['eqStyle']) => void
  setMicProfile: (profile: MicCalibrationProfile) => void
  updateDisplay: (partial: Partial<DisplayPrefs>) => void
  updateDiagnostics: (partial: Partial<DiagnosticsProfile>) => void
  updateLiveOverrides: (partial: Partial<LiveOverrides>) => void
  resetAll: () => void

  // ── Legacy compatibility ─────────────────────────────────────────────
  /**
   * Routes a legacy Partial<DetectorSettings> to the appropriate semantic
   * actions. Used by the transition-period shim in useAudioAnalyzer.
   * Will be removed in Phase 6.
   */
  applyLegacyPartial: (partial: Partial<DetectorSettings>) => void
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useLayeredSettings(): UseLayeredSettingsReturn {
  // Load initial state from v2 storage (or defaults)
  const [session, setSession] = useState<DwaSessionState>(() => sessionStorageV2.load())
  const [display, setDisplay] = useState<DisplayPrefs>(() => displayStorageV2.load())

  // Refs for stable callbacks
  const sessionRef = useRef(session)
  sessionRef.current = session

  // ── Persist on change ──────────────────────────────────────────────────
  const updateSession = useCallback((updater: (prev: DwaSessionState) => DwaSessionState) => {
    setSession(prev => {
      const next = updater(prev)
      sessionStorageV2.save(next)
      return next
    })
  }, [])

  const updateDisplayState = useCallback((updater: (prev: DisplayPrefs) => DisplayPrefs) => {
    setDisplay(prev => {
      const next = updater(prev)
      displayStorageV2.save(next)
      return next
    })
  }, [])

  // ── Semantic actions ───────────────────────────────────────────────────

  const setMode = useCallback((modeId: ModeId) => {
    updateSession(prev => ({
      ...prev,
      modeId,
      // Reset live overrides to defaults when switching modes,
      // but preserve gain and auto-gain settings
      liveOverrides: {
        ...DEFAULT_LIVE_OVERRIDES,
        inputGainDb: prev.liveOverrides.inputGainDb,
        autoGainEnabled: prev.liveOverrides.autoGainEnabled,
        autoGainTargetDb: prev.liveOverrides.autoGainTargetDb,
      },
    }))
  }, [updateSession])

  const setEnvironment = useCallback((partial: Partial<EnvironmentSelection> & { templateId?: RoomTemplateId | string }) => {
    updateSession(prev => {
      // If setting a known template, apply its offsets
      if (partial.templateId && partial.templateId in ENVIRONMENT_TEMPLATES) {
        const template = ENVIRONMENT_TEMPLATES[partial.templateId as RoomTemplateId]
        const merged: EnvironmentSelection = {
          ...prev.environment,
          templateId: template.templateId,
          treatment: partial.treatment ?? template.treatment,
          roomRT60: partial.roomRT60 ?? template.roomRT60,
          roomVolume: partial.roomVolume ?? template.roomVolume,
          dimensionsM: partial.dimensionsM ?? { length: template.lengthM, width: template.widthM, height: template.heightM },
          provenance: partial.provenance ?? 'template',
          displayUnit: partial.displayUnit ?? prev.environment.displayUnit,
          feedbackOffsetDb: partial.feedbackOffsetDb ?? template.feedbackOffsetDb,
          ringOffsetDb: partial.ringOffsetDb ?? template.ringOffsetDb,
        }
        return { ...prev, environment: merged }
      }
      // Custom or unknown template: apply partial directly
      return {
        ...prev,
        environment: { ...prev.environment, ...partial },
      }
    })
  }, [updateSession])

  const setSensitivityOffset = useCallback((db: number) => {
    updateSession(prev => ({
      ...prev,
      liveOverrides: { ...prev.liveOverrides, sensitivityOffsetDb: db },
    }))
  }, [updateSession])

  const setInputGain = useCallback((db: number) => {
    updateSession(prev => ({
      ...prev,
      liveOverrides: { ...prev.liveOverrides, inputGainDb: db },
    }))
  }, [updateSession])

  const setAutoGain = useCallback((enabled: boolean, targetDb?: number) => {
    updateSession(prev => ({
      ...prev,
      liveOverrides: {
        ...prev.liveOverrides,
        autoGainEnabled: enabled,
        ...(targetDb !== undefined ? { autoGainTargetDb: targetDb } : {}),
      },
    }))
  }, [updateSession])

  const setFocusRange = useCallback((range: FocusRange) => {
    updateSession(prev => ({
      ...prev,
      liveOverrides: { ...prev.liveOverrides, focusRange: range },
    }))
  }, [updateSession])

  const setEqStyle = useCallback((style: LiveOverrides['eqStyle']) => {
    updateSession(prev => ({
      ...prev,
      liveOverrides: { ...prev.liveOverrides, eqStyle: style },
    }))
  }, [updateSession])

  const setMicProfile = useCallback((profile: MicCalibrationProfile) => {
    updateSession(prev => ({ ...prev, micCalibrationProfile: profile }))
  }, [updateSession])

  const updateDisplay = useCallback((partial: Partial<DisplayPrefs>) => {
    updateDisplayState(prev => ({ ...prev, ...partial }))
  }, [updateDisplayState])

  const updateDiagnostics = useCallback((partial: Partial<DiagnosticsProfile>) => {
    updateSession(prev => ({
      ...prev,
      diagnostics: { ...prev.diagnostics, ...partial },
    }))
  }, [updateSession])

  const updateLiveOverrides = useCallback((partial: Partial<LiveOverrides>) => {
    updateSession(prev => ({
      ...prev,
      liveOverrides: { ...prev.liveOverrides, ...partial },
    }))
  }, [updateSession])

  const resetAll = useCallback(() => {
    setSession(DEFAULT_SESSION_STATE)
    setDisplay(DEFAULT_DISPLAY_PREFS)
    sessionStorageV2.save(DEFAULT_SESSION_STATE)
    displayStorageV2.save(DEFAULT_DISPLAY_PREFS)
  }, [])

  // ── Legacy shim ────────────────────────────────────────────────────────

  const applyLegacyPartial = useCallback((partial: Partial<DetectorSettings>) => {
    const keys = Object.keys(partial) as (keyof DetectorSettings)[]

    // 1. If `mode` is present, this is a mode change — route to setMode()
    //    All other mode-owned keys in the same partial are from the preset
    //    and will be derived from the new mode baseline.
    if ('mode' in partial && partial.mode) {
      setMode(partial.mode as ModeId)
      // Still process non-mode keys from the same partial
      const remaining = { ...partial }
      delete remaining.mode
      for (const k of MODE_OWNED_KEYS) {
        delete remaining[k as keyof DetectorSettings]
      }
      if (Object.keys(remaining).length > 0) {
        applyLegacyPartial(remaining)
      }
      return
    }

    // 2. Route display-only fields
    const displayPartial: Partial<DisplayPrefs> = {}
    let hasDisplay = false
    for (const k of keys) {
      if (DISPLAY_KEYS.has(k)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (displayPartial as Record<string, unknown>)[k] = (partial as Record<string, unknown>)[k]
        hasDisplay = true
      }
    }
    if (hasDisplay) updateDisplay(displayPartial)

    // 3. Route diagnostics fields
    const diagPartial: Partial<DiagnosticsProfile> = {}
    let hasDiag = false
    for (const k of keys) {
      if (DIAGNOSTICS_KEYS.has(k)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (diagPartial as Record<string, unknown>)[k] = (partial as Record<string, unknown>)[k]
        hasDiag = true
      }
    }
    if (hasDiag) updateDiagnostics(diagPartial)

    // 4. Route room/environment fields
    if (keys.some(k => ROOM_KEYS.has(k))) {
      const envUpdate: Partial<EnvironmentSelection> & { templateId?: RoomTemplateId | string } = {}

      if ('roomPreset' in partial && partial.roomPreset) {
        envUpdate.templateId = partial.roomPreset as RoomTemplateId
      }
      if ('roomLengthM' in partial || 'roomWidthM' in partial || 'roomHeightM' in partial) {
        const current = sessionRef.current.environment
        envUpdate.dimensionsM = {
          length: (partial.roomLengthM as number) ?? current.dimensionsM?.length ?? 15,
          width: (partial.roomWidthM as number) ?? current.dimensionsM?.width ?? 12,
          height: (partial.roomHeightM as number) ?? current.dimensionsM?.height ?? 5,
        }
        // If only dimensions changed (no preset), mark as custom
        if (!('roomPreset' in partial)) {
          envUpdate.templateId = 'custom'
          envUpdate.provenance = 'manual'
        }
      }
      if ('roomTreatment' in partial && partial.roomTreatment) {
        envUpdate.treatment = partial.roomTreatment
      }
      if ('roomDimensionsUnit' in partial && partial.roomDimensionsUnit) {
        envUpdate.displayUnit = partial.roomDimensionsUnit
      }

      setEnvironment(envUpdate)
    }

    // 5. Route live override fields
    if ('feedbackThresholdDb' in partial && partial.feedbackThresholdDb !== undefined) {
      // Compute the delta from current derived threshold to new value
      const baseline = MODE_BASELINES[sessionRef.current.modeId]
      const envOffset = sessionRef.current.environment.feedbackOffsetDb
      const currentEffective = baseline.feedbackThresholdDb + envOffset + sessionRef.current.liveOverrides.sensitivityOffsetDb
      const delta = partial.feedbackThresholdDb - currentEffective
      if (delta !== 0) {
        setSensitivityOffset(sessionRef.current.liveOverrides.sensitivityOffsetDb + delta)
      }
    }

    if ('inputGainDb' in partial && partial.inputGainDb !== undefined) {
      setInputGain(partial.inputGainDb)
    }

    if ('autoGainEnabled' in partial) {
      setAutoGain(
        partial.autoGainEnabled ?? false,
        partial.autoGainTargetDb,
      )
    } else if ('autoGainTargetDb' in partial && partial.autoGainTargetDb !== undefined) {
      setAutoGain(sessionRef.current.liveOverrides.autoGainEnabled, partial.autoGainTargetDb)
    }

    if (('minFrequency' in partial || 'maxFrequency' in partial) && !('mode' in partial)) {
      const baseline = MODE_BASELINES[sessionRef.current.modeId]
      const current = sessionRef.current.liveOverrides.focusRange
      let minHz: number
      let maxHz: number

      if (current.kind === 'custom') {
        minHz = partial.minFrequency ?? current.minHz
        maxHz = partial.maxFrequency ?? current.maxHz
      } else {
        minHz = partial.minFrequency ?? baseline.minFrequency
        maxHz = partial.maxFrequency ?? baseline.maxFrequency
      }
      setFocusRange({ kind: 'custom', minHz, maxHz })
    }

    if ('eqPreset' in partial && partial.eqPreset && !('mode' in partial)) {
      setEqStyle(partial.eqPreset)
    }

    if ('micCalibrationProfile' in partial && partial.micCalibrationProfile) {
      setMicProfile(partial.micCalibrationProfile)
    }
  }, [setMode, setEnvironment, setSensitivityOffset, setInputGain, setAutoGain, setFocusRange, setEqStyle, setMicProfile, updateDisplay, updateDiagnostics])

  // ── Derive DetectorSettings ────────────────────────────────────────────

  const baseline = MODE_BASELINES[session.modeId]

  const derivedSettings = useMemo(() =>
    deriveDetectorSettings(
      baseline,
      session.environment,
      session.liveOverrides,
      display,
      session.diagnostics,
      session.micCalibrationProfile,
    ),
  [baseline, session.environment, session.liveOverrides, display, session.diagnostics, session.micCalibrationProfile],
  )

  return {
    derivedSettings,
    session,
    display,
    setMode,
    setEnvironment,
    setSensitivityOffset,
    setInputGain,
    setAutoGain,
    setFocusRange,
    setEqStyle,
    setMicProfile,
    updateDisplay,
    updateDiagnostics,
    updateLiveOverrides,
    resetAll,
    applyLegacyPartial,
  }
}
