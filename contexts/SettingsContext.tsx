'use client'

import { createContext, useContext } from 'react'
import type { DetectorSettings, OperationMode } from '@/types/advisory'

// ── Context value ───────────────────────────────────────────────────────────

export interface SettingsContextValue {
  /** Current detector settings */
  settings: DetectorSettings
  /** Partially update detector settings */
  updateSettings: (s: Partial<DetectorSettings>) => void
  /** Reset all settings to defaults */
  resetSettings: () => void
  /** Switch operation mode (applies full preset) */
  handleModeChange: (mode: OperationMode) => void
  /** Update frequency range bounds */
  handleFreqRangeChange: (min: number, max: number) => void
}

export const SettingsContext = createContext<SettingsContextValue | null>(null)

// ── Hook ────────────────────────────────────────────────────────────────────

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used within <AudioAnalyzerProvider>')
  return ctx
}
