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
import { MODE_BASELINES } from '@/lib/settings/modeBaselines'
import {
  applyInitialDetectorSettings,
  resolveEnvironmentSelection,
} from '@/lib/settings/seedLayeredSettings'
import {
  displayStorageV2,
  sessionStorageV2,
} from '@/lib/storage/settingsStorageV2'
import type { DetectorSettings, MicCalibrationProfile } from '@/types/advisory'
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

// Legacy key sets and shim removed in Phase 6c — all controls now use semantic actions directly

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

}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useLayeredSettings(initialSettings: Partial<DetectorSettings> = {}): UseLayeredSettingsReturn {
  const initialStateRef = useRef<{ session: DwaSessionState; display: DisplayPrefs } | null>(null)
  if (initialStateRef.current === null) {
    const storedSession = sessionStorageV2.load()
    const storedDisplay = displayStorageV2.load()
    const baseSession: DwaSessionState = {
      ...DEFAULT_SESSION_STATE,
      ...storedSession,
      environment: { ...DEFAULT_ENVIRONMENT, ...storedSession.environment },
      liveOverrides: { ...DEFAULT_LIVE_OVERRIDES, ...storedSession.liveOverrides },
      diagnostics: { ...DEFAULT_DIAGNOSTICS, ...storedSession.diagnostics },
    }
    const baseDisplay: DisplayPrefs = {
      ...DEFAULT_DISPLAY_PREFS,
      ...storedDisplay,
    }
    initialStateRef.current = applyInitialDetectorSettings(baseSession, baseDisplay, initialSettings)
  }

  // Load initial state from v2 storage, backfilling new fields from defaults.
  // Flat spread works for DisplayPrefs; nested merge needed for DwaSessionState
  // because environment/liveOverrides/diagnostics are objects that gain fields over time.
  const [session, setSession] = useState<DwaSessionState>(() => initialStateRef.current?.session ?? DEFAULT_SESSION_STATE)
  const [display, setDisplay] = useState<DisplayPrefs>(() => initialStateRef.current?.display ?? DEFAULT_DISPLAY_PREFS)

  // Refs for stable callbacks
  const sessionRef = useRef(session)
  sessionRef.current = session

  // ── Persist on change (debounced to 100ms for slider performance) ─────
  const sessionPersistRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const displayPersistRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  const updateSession = useCallback((updater: (prev: DwaSessionState) => DwaSessionState) => {
    setSession(prev => {
      const next = updater(prev)
      clearTimeout(sessionPersistRef.current)
      sessionPersistRef.current = setTimeout(() => sessionStorageV2.save(next), 100)
      return next
    })
  }, [])

  const updateDisplayState = useCallback((updater: (prev: DisplayPrefs) => DisplayPrefs) => {
    setDisplay(prev => {
      const next = updater(prev)
      clearTimeout(displayPersistRef.current)
      displayPersistRef.current = setTimeout(() => displayStorageV2.save(next), 100)
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
    updateSession(prev => ({
      ...prev,
      environment: resolveEnvironmentSelection(prev.environment, partial),
    }))
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
    // Cancel any in-flight debounced persistence to prevent stale data
    // from overwriting the clean defaults after reset (P1 race condition fix)
    clearTimeout(sessionPersistRef.current)
    clearTimeout(displayPersistRef.current)
    setSession(DEFAULT_SESSION_STATE)
    setDisplay(DEFAULT_DISPLAY_PREFS)
    sessionStorageV2.save(DEFAULT_SESSION_STATE)
    displayStorageV2.save(DEFAULT_DISPLAY_PREFS)
  }, [])

  // Legacy shim (applyLegacyPartial) removed in Phase 6c.
  // All UI controls now call semantic actions directly.

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
  }
}
