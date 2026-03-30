/**
 * Calibration Constants — A-Weighting + Mic Profiles
 *
 * IEC 61672-1 A-weighting filter coefficients, mic calibration curves
 * (ECM8000, RTA-M, smartphone MEMS), and FFT size options.
 */

import type { MicCalibrationProfile } from '@/types/advisory'

// A-weighting constants (IEC/CD 1672)
export const A_WEIGHTING = {
  C1: 20.6,
  C2: 107.7,
  C3: 737.9,
  C4: 12200,
  OFFSET: 2.0, // dB offset for A-weighting formula
  MIN_DB: -120, // Clamp for frequencies near 0 Hz
} as const

// ── Mic Calibration: Behringer ECM8000 (CSL 746) ────────────────────────────
// Cross-Spectrum Labs measurement, serial D1103249118/CSL 746, 0° on-axis
// Format: [frequency Hz, response dB relative to 1 kHz]
// Compensation = negate these values to flatten the mic's frequency response
export const ECM8000_CALIBRATION: readonly [number, number][] = [
  [5, -18.33], [6.3, -14.81], [8, -11.98], [10, -9.81], [12.5, -7.96],
  [16, -6.27], [20, -4.64], [25, -3.11], [31.5, -1.87], [40, -1.07],
  [50, -0.73], [63, -0.54], [80, -0.15], [100, -0.12], [125, -0.06],
  [160, -0.01], [200, 0.13], [250, 0.13], [315, 0.12], [400, 0.08],
  [500, 0.06], [630, 0.05], [800, 0.03], [1000, 0.00], [1250, 0.06],
  [1600, 0.16], [2000, 0.42], [2500, 0.61], [3150, 1.02], [4000, 1.56],
  [5000, 2.02], [6300, 2.67], [8000, 3.83], [10000, 4.65], [12500, 4.48],
  [16000, 4.72], [20000, 2.26], [25000, -2.86],
] as const

// ── Mic Calibration: dbx RTA-M ──────────────────────────────────────────────
// Digitized from published frequency response graph (cut sheet)
// Omni-directional flat measurement mic for DriveRack series
// Format: [frequency Hz, response dB relative to 1 kHz]
export const RTA_M_CALIBRATION: readonly [number, number][] = [
  [20, -1.5], [25, -1.0], [31.5, -0.7], [40, -0.4], [50, -0.2],
  [63, -0.1], [80, 0.0], [100, 0.0], [125, 0.0], [160, 0.0],
  [200, 0.0], [250, 0.0], [315, 0.0], [400, 0.0], [500, 0.0],
  [630, 0.0], [800, 0.0], [1000, 0.0], [1250, 0.0], [1600, 0.0],
  [2000, 0.0], [2500, 0.0], [3150, 0.0], [4000, 0.1], [5000, 0.2],
  [6300, 0.3], [8000, 0.5], [10000, 0.7], [12500, 1.0], [16000, 0.8],
  [20000, -1.0],
] as const

// ── Mic Calibration: Smartphone (Generic MEMS) ──────────────────────────────
// Typical bottom-port MEMS microphone response (Knowles/Goertek/InvenSense)
// Based on published MEMS mic datasheets (SPH0645, ICS-43434, BME680)
// Characteristics: steep LF roll-off from small acoustic port, flat midrange,
// presence peak ~8-12 kHz from diaphragm resonance, HF roll-off above 15 kHz
// Format: [frequency Hz, response dB relative to 1 kHz]
export const SMARTPHONE_MEMS_CALIBRATION: readonly [number, number][] = [
  [20, -12.0], [25, -10.5], [31.5, -9.0], [40, -7.5], [50, -6.0],
  [63, -4.5], [80, -3.0], [100, -1.8], [125, -1.0], [160, -0.5],
  [200, -0.2], [250, -0.1], [315, 0.0], [400, 0.0], [500, 0.0],
  [630, 0.0], [800, 0.0], [1000, 0.0], [1250, 0.1], [1600, 0.2],
  [2000, 0.3], [2500, 0.5], [3150, 0.8], [4000, 1.2], [5000, 1.8],
  [6300, 2.5], [8000, 3.5], [10000, 3.8], [12500, 2.5], [16000, 0.0],
  [20000, -6.0],
] as const

// ── Mic Calibration Profiles ─────────────────────────────────────────────────

export interface MicProfileData {
  label: string
  model: string
  calibrationId: string
  curve: readonly [number, number][]
}

export const MIC_CALIBRATION_PROFILES: Record<Exclude<MicCalibrationProfile, 'none'>, MicProfileData> = {
  ecm8000: {
    label: 'Behringer ECM8000',
    model: 'Behringer ECM8000',
    calibrationId: 'CSL 746',
    curve: ECM8000_CALIBRATION,
  },
  'rta-m': {
    label: 'dbx RTA-M',
    model: 'dbx RTA-M',
    calibrationId: 'Cut Sheet Rev A',
    curve: RTA_M_CALIBRATION,
  },
  smartphone: {
    label: 'Smartphone (Generic MEMS)',
    model: 'Generic MEMS Microphone',
    calibrationId: 'Typical MEMS Response',
    curve: SMARTPHONE_MEMS_CALIBRATION,
  },
} as const

// FFT size options
export const FFT_SIZE_OPTIONS = [2048, 4096, 8192, 16384, 32768] as const
