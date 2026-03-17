'use client'

import { createContext, useContext } from 'react'
import type { Advisory } from '@/types/advisory'
import type { EarlyWarning } from '@/hooks/useAudioAnalyzer'

// ── Context value ───────────────────────────────────────────────────────────

export interface DetectionContextValue {
  /** Live feedback detection advisories (sorted by urgency + amplitude) */
  advisories: Advisory[]
  /** Early warning of predicted ring-down before feedback occurs */
  earlyWarning: EarlyWarning | null
}

export const DetectionContext = createContext<DetectionContextValue | null>(null)

// ── Hook ────────────────────────────────────────────────────────────────────

export function useDetection(): DetectionContextValue {
  const ctx = useContext(DetectionContext)
  if (!ctx) throw new Error('useDetection must be used within <AudioAnalyzerProvider>')
  return ctx
}
