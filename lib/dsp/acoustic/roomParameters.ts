/**
 * Room Parameter Estimation
 *
 * Schroeder frequency, frequency band classification, and composite room
 * parameter estimation from physical dimensions.
 *
 * @see Hopkins, "Sound Insulation" (2007) §1.2.6 (Eq. 1.111)
 */

import { SCHROEDER_CONSTANTS, FREQUENCY_BANDS } from '../constants'
import { calculateEyringRT60 } from './reverberation'

// ============================================================================
// SCHROEDER FREQUENCY
// ============================================================================

/**
 * Calculate Schroeder frequency for a room
 * From textbook Equation 1.111: f_S = 2000 * sqrt(T/V)
 *
 * Below this frequency, individual room modes dominate and statistical
 * analysis breaks down. Feedback detection needs different handling.
 *
 * @param rt60 - Reverberation time in seconds (typical: 0.5-2.0)
 * @param volume - Room volume in cubic meters (typical: 100-2000)
 * @returns Schroeder cut-off frequency in Hz
 */
export function calculateSchroederFrequency(rt60: number, volume: number): number {
  // Validate inputs
  if (rt60 <= 0 || volume <= 0) {
    return SCHROEDER_CONSTANTS.DEFAULT_FREQUENCY
  }

  // f_S = 2000 * sqrt(T/V)
  const fs = SCHROEDER_CONSTANTS.COEFFICIENT * Math.sqrt(rt60 / volume)

  // Clamp to reasonable range (50Hz - 500Hz)
  return Math.max(50, Math.min(500, fs))
}

/**
 * Get frequency band for a given frequency
 * Uses Schroeder frequency to set the LOW/MID boundary
 *
 * @param frequencyHz - Frequency to classify
 * @param schroederHz - Schroeder frequency (LOW/MID boundary)
 * @returns Band classification and multipliers
 */
export function getFrequencyBand(
  frequencyHz: number,
  schroederHz: number = SCHROEDER_CONSTANTS.DEFAULT_FREQUENCY
): {
  band: 'LOW' | 'MID' | 'HIGH'
  prominenceMultiplier: number
  sustainMultiplier: number
  qThresholdMultiplier: number
  description: string
} {
  // Use Schroeder frequency as LOW/MID boundary
  const lowMidBoundary = Math.max(schroederHz, FREQUENCY_BANDS.LOW.maxHz)

  if (frequencyHz < lowMidBoundary) {
    return {
      band: 'LOW',
      ...FREQUENCY_BANDS.LOW,
    }
  } else if (frequencyHz < FREQUENCY_BANDS.MID.maxHz) {
    return {
      band: 'MID',
      ...FREQUENCY_BANDS.MID,
    }
  } else {
    return {
      band: 'HIGH',
      ...FREQUENCY_BANDS.HIGH,
    }
  }
}

// ============================================================================
// UNIT CONVERSIONS
// ============================================================================

/**
 * Convert feet to meters
 */
export function feetToMeters(feet: number): number {
  return feet * 0.3048
}

// ============================================================================
// ROOM PARAMETER ESTIMATION FROM DIMENSIONS
// ============================================================================

export interface RoomParameters {
  volume: number    // m³
  rt60: number      // seconds (estimated)
  schroederHz: number
}

/**
 * Estimate RT60 and calculate room volume from physical dimensions.
 * Uses a simplified Sabine approximation with preset absorption coefficients.
 *
 * @param lengthM        - Room length in meters
 * @param widthM         - Room width in meters
 * @param heightM        - Room height in meters
 * @param absorptionType - Acoustic treatment level
 */
export function getRoomParametersFromDimensions(
  lengthM: number,
  widthM: number,
  heightM: number,
  absorptionType: 'untreated' | 'typical' | 'treated' | 'studio' = 'typical'
): RoomParameters {
  // Average absorption coefficient by treatment type (broadband estimate)
  const absorptionCoeff: Record<typeof absorptionType, number> = {
    untreated: 0.07,
    typical:   0.15,
    treated:   0.25,
    studio:    0.45,
  }

  const alpha = absorptionCoeff[absorptionType]
  const volume = lengthM * widthM * heightM

  // Total surface area
  const surface =
    2 * (lengthM * widthM + lengthM * heightM + widthM * heightM)

  // Sabine's formula: RT60 = 0.161 * V / (alpha * S)
  const sabineRT60 = surface > 0 ? (0.161 * volume) / (alpha * surface) : 1.0
  // Eyring is more accurate for absorptive rooms (α > 0.2)
  const eyringRT60 = calculateEyringRT60(volume, surface, alpha)
  // Use the more conservative (shorter) estimate
  const rt60 = Math.min(sabineRT60, eyringRT60)

  const schroederHz = calculateSchroederFrequency(rt60, volume)

  return {
    volume: Math.round(volume * 10) / 10,
    rt60: Math.round(rt60 * 10) / 10,
    schroederHz,
  }
}
