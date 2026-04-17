import type { SpectrumSmoothingMode } from '@/types/advisory'

const MIN_POWER = 1e-20
const HALF_THIRD_OCTAVE_RATIO = 2 ** (1 / 6)

export interface DisplaySpectrumSmoothingScratch {
  prefixPower: Float64Array
  smoothedDb: Float32Array
}

function ensureScratch(
  length: number,
  scratchRef: { current: DisplaySpectrumSmoothingScratch | null },
): DisplaySpectrumSmoothingScratch {
  const scratch = scratchRef.current
  if (!scratch || scratch.smoothedDb.length !== length || scratch.prefixPower.length !== length + 1) {
    scratchRef.current = {
      prefixPower: new Float64Array(length + 1),
      smoothedDb: new Float32Array(length),
    }
  }
  return scratchRef.current as DisplaySpectrumSmoothingScratch
}

function dbToPower(db: number): number {
  return Number.isFinite(db) ? 10 ** (db / 10) : 0
}

export function usesPerceptualSpectrumView(mode: SpectrumSmoothingMode): boolean {
  return mode === 'perceptual'
}

export function smoothSpectrumForDisplay(
  freqDb: Float32Array,
  sampleRate: number,
  fftSize: number,
  scratchRef: { current: DisplaySpectrumSmoothingScratch | null },
): Float32Array {
  const length = freqDb.length
  const scratch = ensureScratch(length, scratchRef)
  const { prefixPower, smoothedDb } = scratch
  const hzPerBin = sampleRate / fftSize

  prefixPower[0] = 0
  for (let i = 0; i < length; i++) {
    prefixPower[i + 1] = prefixPower[i] + dbToPower(freqDb[i])
  }

  smoothedDb[0] = freqDb[0]

  let left = 1
  let right = 1

  for (let i = 1; i < length; i++) {
    const centerFreq = i * hzPerBin
    const minFreq = centerFreq / HALF_THIRD_OCTAVE_RATIO
    const maxFreq = centerFreq * HALF_THIRD_OCTAVE_RATIO

    while (left < length && left * hzPerBin < minFreq) {
      left++
    }

    if (right < left) {
      right = left
    }

    while (right + 1 < length && (right + 1) * hzPerBin <= maxFreq) {
      right++
    }

    const count = Math.max(1, right - left + 1)
    const avgPower = (prefixPower[right + 1] - prefixPower[left]) / count
    smoothedDb[i] = 10 * Math.log10(Math.max(avgPower, MIN_POWER))
  }

  return smoothedDb
}
