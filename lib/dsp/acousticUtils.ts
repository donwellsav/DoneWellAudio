/**
 * Acoustic Utilities — Barrel Re-export
 *
 * All functions and types are implemented in domain-focused sub-modules
 * under `lib/dsp/acoustic/`. This barrel preserves the original import path
 * (`@/lib/dsp/acousticUtils`) so no consumers need to change.
 */

// Room modes, formatting, proximity penalty, harmonic series, dimension estimation
export {
  calculateRoomModes,
  formatRoomModesForDisplay,
  roomModeProximityPenalty,
  findHarmonicSeries,
  estimateRoomDimensions,
} from './acoustic/roomModes'
export type {
  RoomMode,
  RoomModesResult,
  FormattedRoomMode,
  FormattedRoomModesResult,
} from './acoustic/roomModes'

// Reverberation: Eyring RT60, air absorption, Q adjustment
export {
  calculateEyringRT60,
  airAbsorptionCorrectedRT60,
  reverberationQAdjustment,
} from './acoustic/reverberation'

// Modal analysis: density, overlap, classification, prominence
export {
  calculateModalDensity,
  calculateModalOverlap,
  classifyModalOverlap,
  modalDensityFeedbackAdjustment,
  frequencyDependentProminence,
} from './acoustic/modalAnalysis'

// Room parameters: Schroeder frequency, frequency bands, dimensions
export {
  calculateSchroederFrequency,
  getFrequencyBand,
  getRoomParametersFromDimensions,
  feetToMeters,
} from './acoustic/roomParameters'
export type { RoomParameters } from './acoustic/roomParameters'

// Vibrato / whistle detection
export { analyzeVibrato } from './acoustic/vibratoDetection'

// Cumulative growth tracking
export { analyzeCumulativeGrowth } from './acoustic/cumulativeGrowth'

// Confidence calibration
export { calculateCalibratedConfidence } from './acoustic/confidenceCalibration'
