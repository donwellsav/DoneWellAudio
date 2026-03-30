/**
 * Music Theory & Math Constants
 *
 * ISO 31-band EQ frequencies, pitch reference (A4=440), note names,
 * cents/semitone constants, and the precomputed dB→linear EXP_LUT.
 */

// Standard ISO 31-band graphic EQ center frequencies (1/3 octave)
export const ISO_31_BANDS: readonly number[] = [
  20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160,
  200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600,
  2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000,
  20000
] as const

// A4 = 440 Hz reference
export const A4_HZ = 440
export const A4_MIDI = 69

// Note names for pitch display
export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const

// Cents per semitone
export const CENTS_PER_SEMITONE = 100
export const SEMITONES_PER_OCTAVE = 12
// Mathematical constants (precomputed for performance)
export const LN10_OVER_10 = Math.LN10 / 10 // For dB to power conversion
export const LOG10_E = Math.LOG10E // For power to dB conversion

// Precomputed lookup table: dB → linear power for range [-100, +30] at 0.1 dB steps
// Extended from [-100, 0] to handle A-weighting (+12dB) + mic calibration (+12dB)
// extremes without clamp-induced quantization error.
// Index formula: lutIdx = ((db + 100) * 10 + 0.5) | 0
// 1301 entries × 4 bytes = 5.2KB — fits comfortably in L1 cache
export const EXP_LUT = /* @__PURE__ */ (() => {
  const table = new Float32Array(1301)
  for (let i = 0; i <= 1300; i++) {
    table[i] = Math.pow(10, (i / 10 - 100) / 10)
  }
  return table
})()
