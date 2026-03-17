'use client'

import { createContext, useContext } from 'react'
import type { SpectrumStatus } from '@/hooks/useAudioAnalyzer'
import type { SpectrumData, TrackedPeak } from '@/types/advisory'

// ── Context value ───────────────────────────────────────────────────────────

export interface MeteringContextValue {
  /** Live spectrum data (Float32Arrays). Read imperatively from canvas at 30fps. */
  spectrumRef: React.RefObject<SpectrumData | null>
  /** Tracked peaks by frequency */
  tracksRef: React.RefObject<TrackedPeak[]>
  /** Frame-level metadata: algorithm mode, compression, MSD count, peak dB */
  spectrumStatus: SpectrumStatus | null
  /** Ambient noise floor estimate in dB */
  noiseFloorDb: number | null
  /** Microphone sample rate (typically 44100 or 48000) */
  sampleRate: number
  /** FFT size (typically 8192) */
  fftSize: number
  /** Current peak input level in dB (derived from spectrumStatus, ~4Hz) */
  inputLevel: number
  /** Whether auto-gain is enabled */
  isAutoGain: boolean
  /** Computed auto-gain adjustment in dB */
  autoGainDb: number | undefined
  /** Whether auto-gain has locked after calibration */
  autoGainLocked: boolean
}

export const MeteringContext = createContext<MeteringContextValue | null>(null)

// ── Hook ────────────────────────────────────────────────────────────────────

export function useMetering(): MeteringContextValue {
  const ctx = useContext(MeteringContext)
  if (!ctx) throw new Error('useMetering must be used within <AudioAnalyzerProvider>')
  return ctx
}
