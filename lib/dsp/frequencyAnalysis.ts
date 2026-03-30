/**
 * Frequency Analysis — Q Estimation + PHPR Calculation
 *
 * Query-only functions that analyze spectral peaks:
 * - estimateQ: -3dB bandwidth measurement for Q factor
 * - calculatePHPR: peak-to-harmonic power ratio (feedback vs music)
 *
 * These read from the spectrum buffer and return computed values.
 * No side effects, no mutable state. Safe to call from the hot path.
 *
 * @see Van Waterschoot & Moonen (2011), "50 years of acoustic feedback control"
 */

import { EXP_LUT, PHPR_SETTINGS } from './constants'
import { clamp } from '@/lib/utils/mathHelpers'

// ── Q Estimation ────────────────────────────────────────────────────────────

/**
 * Estimate Q factor and bandwidth of a spectral peak via -3dB point search.
 * Interpolates crossing points for sub-bin accuracy.
 *
 * @param spectrum - Frequency-domain dB values (freqDb)
 * @param binIndex - FFT bin of the peak
 * @param peakDb - Peak amplitude in dB
 * @param sampleRate - Audio sample rate (Hz)
 * @param fftSize - FFT size
 * @param trueFrequencyHz - Optional interpolated center frequency
 */
export function estimateQ(
  spectrum: Float32Array,
  binIndex: number,
  peakDb: number,
  sampleRate: number,
  fftSize: number,
  trueFrequencyHz?: number,
): { qEstimate: number; bandwidthHz: number } {
  const hzPerBin = sampleRate / fftSize
  const n = spectrum.length
  const threshold = peakDb - 3

  // Search left for -3dB crossing
  let leftBin = binIndex
  let foundLeft = false
  for (let i = binIndex - 1; i >= 0; i--) {
    if (spectrum[i] < threshold) {
      const denom = spectrum[i + 1] - spectrum[i]
      if (denom > 0) {
        const t = (threshold - spectrum[i]) / denom
        leftBin = i + t
      } else {
        leftBin = i
      }
      foundLeft = true
      break
    }
  }

  // Search right for -3dB crossing
  let rightBin = binIndex
  let foundRight = false
  for (let i = binIndex + 1; i < n; i++) {
    if (spectrum[i] < threshold) {
      const denom = spectrum[i] - spectrum[i - 1]
      if (denom < 0) {
        const t = (threshold - spectrum[i - 1]) / denom
        rightBin = i - 1 + t
      } else {
        rightBin = i
      }
      foundRight = true
      break
    }
  }

  // If no crossing found on either side, use 1-bin default bandwidth
  if (!foundLeft && !foundRight) {
    return { qEstimate: 100, bandwidthHz: hzPerBin }
  }
  // Mirror the found side if only one crossing was located
  if (!foundLeft) leftBin = binIndex - (rightBin - binIndex)
  if (!foundRight) rightBin = binIndex + (binIndex - leftBin)

  const bandwidthBins = rightBin - leftBin
  const bandwidthHz = bandwidthBins * hzPerBin
  const centerHz = trueFrequencyHz ?? binIndex * hzPerBin

  // Q = center / bandwidth
  const qEstimate = bandwidthHz > 0 ? centerHz / bandwidthHz : 100

  return { qEstimate: clamp(qEstimate, 1, 500), bandwidthHz: Math.max(bandwidthHz, hzPerBin) }
}

// ── PHPR (Peak-to-Harmonic Power Ratio) ─────────────────────────────────────

/**
 * Calculate PHPR (Peak-to-Harmonic Power Ratio) for a detected peak.
 * Feedback is sinusoidal (no harmonics), music has rich harmonics.
 *
 * PHPR = peakDb - 10 * log10( mean( 10^(harmonicDb_i / 10) ) )
 *
 * Harmonic powers are averaged in the linear domain (not dB) to avoid
 * overweighting quiet harmonics. Arithmetic dB averaging is nonlinear and
 * introduces up to 3-5 dB error when harmonics span 20+ dB.
 *
 * High PHPR (>15 dB) = likely feedback (pure tone)
 * Low PHPR (<8 dB) = likely music/speech (harmonics present)
 *
 * @param spectrum - Frequency-domain dB values (freqDb)
 * @param freqBin - FFT bin index of the peak
 * @returns PHPR in dB, or undefined if harmonics are out of FFT range
 */
export function calculatePHPR(spectrum: Float32Array, freqBin: number): number | undefined {
  const n = spectrum.length
  const peakDb = spectrum[freqBin]
  let linearSum = 0
  let harmonicCount = 0

  for (let h = 2; h <= PHPR_SETTINGS.NUM_HARMONICS + 1; h++) {
    const harmonicBin = Math.round(freqBin * h)
    if (harmonicBin >= n) break

    // Find max within ±BIN_TOLERANCE (accounts for FFT leakage)
    let maxHarmonicDb = -Infinity
    const lo = Math.max(0, harmonicBin - PHPR_SETTINGS.BIN_TOLERANCE)
    const hi = Math.min(n - 1, harmonicBin + PHPR_SETTINGS.BIN_TOLERANCE)
    for (let b = lo; b <= hi; b++) {
      if (spectrum[b] > maxHarmonicDb) {
        maxHarmonicDb = spectrum[b]
      }
    }

    // Convert dB → linear power via EXP_LUT (clamped to [-100, 0] dB range)
    const lutIdx = ((maxHarmonicDb + 100) * 10 + 0.5) | 0
    linearSum += EXP_LUT[lutIdx < 0 ? 0 : lutIdx > 1300 ? 1300 : lutIdx]
    harmonicCount++
  }

  if (harmonicCount === 0) return undefined

  // Convert mean linear power back to dB: 10 * log10(meanLinearPower)
  const meanLinearPower = linearSum / harmonicCount
  const meanHarmonicDb = 10 * Math.log10(meanLinearPower)
  return peakDb - meanHarmonicDb
}
