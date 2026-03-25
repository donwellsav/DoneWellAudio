'use client'

import { createContext, useContext } from 'react'
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

// ── Context value ───────────────────────────────────────────────────────────

export interface SettingsContextValue {
  /** Current detector settings (derived from layered state) */
  settings: DetectorSettings
  /** Partially update detector settings (legacy shim — routes to semantic actions) */
  updateSettings: (s: Partial<DetectorSettings>) => void
  /** Reset all settings to defaults */
  resetSettings: () => void
  /** Switch operation mode (applies full preset) */
  handleModeChange: (mode: OperationMode) => void
  /** Update frequency range bounds */
  handleFreqRangeChange: (min: number, max: number) => void

  // ── Layered state (Phase 3+) ──────────────────────────────────────────
  /** Direct access to layered session state — for new UI surfaces */
  session?: DwaSessionState
  /** Direct access to layered display preferences — for new UI surfaces */
  displayPrefs?: DisplayPrefs

  // ── Semantic actions (Phase 5+) ───────────────────────────────────────
  /** Set operation mode — applies full baseline, resets live overrides */
  setMode?: (modeId: ModeId) => void
  /** Set environment — applies room template or custom offsets */
  setEnvironment?: (env: Partial<EnvironmentSelection> & { templateId?: RoomTemplateId | string }) => void
  /** Set live sensitivity offset (dB above baseline + environment) */
  setSensitivityOffset?: (db: number) => void
  /** Set input gain (dB) */
  setInputGain?: (db: number) => void
  /** Set auto-gain mode */
  setAutoGain?: (enabled: boolean, targetDb?: number) => void
  /** Set focus frequency range */
  setFocusRange?: (range: FocusRange) => void
  /** Set EQ recommendation style */
  setEqStyle?: (style: LiveOverrides['eqStyle']) => void
  /** Set mic calibration profile */
  setMicProfile?: (profile: MicCalibrationProfile) => void
  /** Update display preferences (partial merge) */
  updateDisplay?: (partial: Partial<DisplayPrefs>) => void
  /** Update diagnostics profile (partial merge) */
  updateDiagnostics?: (partial: Partial<DiagnosticsProfile>) => void
  /** Update live overrides (partial merge) */
  updateLiveOverrides?: (partial: Partial<LiveOverrides>) => void
}

export const SettingsContext = createContext<SettingsContextValue | null>(null)

// ── Hook ────────────────────────────────────────────────────────────────────

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used within <AudioAnalyzerProvider>')
  return ctx
}
