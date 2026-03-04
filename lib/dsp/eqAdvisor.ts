// KillTheRing2 EQ Advisor - GEQ/PEQ recommendations with pitch translation
// Enhanced with MINDS (MSD-Inspired Notch Depth Setting) from DAFx-16 paper

import { ISO_31_BANDS, EQ_PRESETS, SPECTRAL_TRENDS, VIZ_COLORS } from './constants'
import { calculateMINDS } from './advancedDetection'
import { hzToPitch, formatPitch } from '@/lib/utils/pitchUtils'
import { clamp } from '@/lib/utils/mathHelpers'
import type { 
  Track, 
  TrackedPeak,
  SeverityLevel, 
  Preset,
  GEQRecommendation, 
  PEQRecommendation, 
  ShelfRecommendation,
  EQAdvisory,
  PitchInfo,
} from '@/types/advisory'
import type { MINDSResult } from './advancedDetection'

// Track input type that works with both Track and TrackedPeak
type TrackInput = Track | TrackedPeak

// Helper to get frequency from either type
function getTrackFrequency(track: TrackInput): number {
  return 'trueFrequencyHz' in track ? track.trueFrequencyHz : track.frequency
}

function getTrackQ(track: TrackInput): number {
  return track.qEstimate
}

/**
 * Find nearest ISO 31-band to a given frequency
 */
export function findNearestGEQBand(freqHz: number): { bandHz: number; bandIndex: number } {
  let minDist = Infinity
  let nearestIndex = 0

  for (let i = 0; i < ISO_31_BANDS.length; i++) {
    // Use log distance for frequency comparison
    const dist = Math.abs(Math.log2(freqHz / ISO_31_BANDS[i]))
    if (dist < minDist) {
      minDist = dist
      nearestIndex = i
    }
  }

  return {
    bandHz: ISO_31_BANDS[nearestIndex],
    bandIndex: nearestIndex,
  }
}

/**
 * Calculate recommended cut depth based on severity, preset, and optional
 * recurrence count. Implements MINDS-inspired adaptive depth: the first
 * detection gets a light cut, but if feedback recurs at the same frequency
 * the notch progressively deepens (capped at preset maxCut).
 *
 * @param severity - Current severity level
 * @param preset - EQ preset (surgical / heavy)
 * @param recurrenceCount - How many times feedback has recurred at this freq (0 = first time)
 */
export function calculateCutDepth(severity: SeverityLevel, preset: Preset, recurrenceCount: number = 0): number {
  const presetConfig = EQ_PRESETS[preset]

  let baseDepth: number
  switch (severity) {
    case 'RUNAWAY':
      baseDepth = presetConfig.maxCut // -18 or -12 dB
      break
    case 'GROWING':
      baseDepth = presetConfig.moderateCut // -9 or -6 dB
      break
    case 'RESONANCE':
      baseDepth = presetConfig.lightCut // -4 or -3 dB
      break
    case 'POSSIBLE_RING':
      baseDepth = -3 // Gentle for possible rings
      break
    case 'WHISTLE':
      return 0 // No cut for whistles
    case 'INSTRUMENT':
      return 0 // No cut for instruments
    default:
      baseDepth = presetConfig.lightCut
  }

  // MINDS-inspired adaptive depth: each recurrence deepens by 2 dB
  // capped at the preset's maxCut to avoid over-cutting
  if (recurrenceCount > 0) {
    const adaptiveDepth = baseDepth - (recurrenceCount * 2)
    return Math.max(adaptiveDepth, presetConfig.maxCut) // maxCut is negative, so max() clamps
  }

  return baseDepth
}

/**
 * Calculate dynamic notch depth using MINDS algorithm
 * This uses the magnitude history to determine optimal cut depth
 * 
 * @param magnitudeHistory - Array of recent magnitude values in dB (oldest to newest)
 * @param severity - Current severity classification
 * @param preset - EQ preset (surgical/heavy)
 * @param currentDepthDb - Current applied notch depth (if any)
 */
export function calculateMINDSCutDepth(
  magnitudeHistory: number[],
  severity: SeverityLevel,
  preset: Preset,
  currentDepthDb: number = 0
): { depth: number; minds: MINDSResult } {
  // Get MINDS recommendation
  const minds = calculateMINDS(magnitudeHistory, currentDepthDb)
  
  // Get preset-based recommendation
  const presetDepth = calculateCutDepth(severity, preset)
  
  // Use the more aggressive of the two (more negative)
  // MINDS is dynamic and responds to growth rate
  // Preset is based on severity classification
  const depth = Math.min(minds.suggestedDepthDb, presetDepth)
  
  return { depth, minds }
}

/**
 * Calculate recommended Q for PEQ based on severity and preset
 */
export function calculateQ(severity: SeverityLevel, preset: Preset, trackQ: number): number {
  const presetConfig = EQ_PRESETS[preset]

  // Use higher Q for more severe issues
  let baseQ: number
  switch (severity) {
    case 'RUNAWAY':
      baseQ = presetConfig.runawayQ // 16 or 8
      break
    case 'GROWING':
      baseQ = presetConfig.defaultQ // 8 or 4
      break
    default:
      baseQ = presetConfig.defaultQ * 0.75
  }

  // Consider the actual measured Q of the feedback
  // Use a blend of preset Q and measured Q
  const measuredQ = clamp(trackQ, 2, 32)
  const blendedQ = (baseQ + measuredQ) / 2

  return clamp(blendedQ, 2, 32)
}

/**
 * Generate GEQ recommendation for a track
 */
export function generateGEQRecommendation(
  track: TrackInput,
  severity: SeverityLevel,
  preset: Preset
): GEQRecommendation {
  const { bandHz, bandIndex } = findNearestGEQBand(getTrackFrequency(track))
  const suggestedDb = calculateCutDepth(severity, preset)

  return {
    bandHz,
    bandIndex,
    suggestedDb,
  }
}

/**
 * Generate PEQ recommendation for a track
 */
export function generatePEQRecommendation(
  track: TrackInput,
  severity: SeverityLevel,
  preset: Preset
): PEQRecommendation {
  const freqHz = getTrackFrequency(track)
  const suggestedDb = calculateCutDepth(severity, preset)
  const q = calculateQ(severity, preset, getTrackQ(track))

  // Determine filter type
  let type: PEQRecommendation['type'] = 'bell'
  
  if (severity === 'RUNAWAY') {
    // Use notch for runaway (very narrow, deep cut)
    type = 'notch'
  } else if (freqHz < 80) {
    // Suggest HPF for very low frequencies
    type = 'HPF'
  } else if (freqHz > 12000) {
    // Suggest LPF for very high frequencies
    type = 'LPF'
  }

  return {
    type,
    hz: freqHz,
    q,
    gainDb: suggestedDb,
  }
}

/**
 * Analyze spectrum for shelf/filter recommendations
 */
export function analyzeSpectralTrends(
  spectrum: Float32Array,
  sampleRate: number,
  fftSize: number
): ShelfRecommendation[] {
  const shelves: ShelfRecommendation[] = []
  const hzPerBin = sampleRate / fftSize
  const n = spectrum.length

  // Calculate average level
  let totalDb = 0
  for (let i = 0; i < n; i++) {
    totalDb += spectrum[i]
  }
  const avgDb = totalDb / n

  // Check low-end rumble
  const lowEndBin = Math.round(SPECTRAL_TRENDS.LOW_RUMBLE_THRESHOLD_HZ / hzPerBin)
  let lowSum = 0
  for (let i = 1; i < Math.min(lowEndBin, n); i++) {
    lowSum += spectrum[i]
  }
  const lowAvg = lowEndBin > 1 ? lowSum / (lowEndBin - 1) : avgDb

  if (lowAvg > avgDb + SPECTRAL_TRENDS.LOW_RUMBLE_EXCESS_DB) {
    shelves.push({
      type: 'HPF',
      hz: SPECTRAL_TRENDS.LOW_RUMBLE_THRESHOLD_HZ,
      gainDb: 0, // HPF doesn't have gain, but this indicates activation
      reason: `Low-end rumble detected (${(lowAvg - avgDb).toFixed(1)} dB excess below ${SPECTRAL_TRENDS.LOW_RUMBLE_THRESHOLD_HZ}Hz)`,
    })
  }

  // Check mud buildup (200-400 Hz)
  const mudLowBin = Math.round(SPECTRAL_TRENDS.MUD_FREQ_LOW / hzPerBin)
  const mudHighBin = Math.round(SPECTRAL_TRENDS.MUD_FREQ_HIGH / hzPerBin)
  let mudSum = 0
  for (let i = mudLowBin; i < Math.min(mudHighBin, n); i++) {
    mudSum += spectrum[i]
  }
  const mudAvg = mudHighBin > mudLowBin ? mudSum / (mudHighBin - mudLowBin) : avgDb

  if (mudAvg > avgDb + SPECTRAL_TRENDS.MUD_EXCESS_DB) {
    shelves.push({
      type: 'lowShelf',
      hz: 300, // Center of mud range
      gainDb: -3,
      reason: `Mud buildup detected (${(mudAvg - avgDb).toFixed(1)} dB excess in 200-400Hz)`,
    })
  }

  // Check harshness (6-10 kHz)
  const harshLowBin = Math.round(SPECTRAL_TRENDS.HARSH_FREQ_LOW / hzPerBin)
  const harshHighBin = Math.round(SPECTRAL_TRENDS.HARSH_FREQ_HIGH / hzPerBin)
  let harshSum = 0
  for (let i = harshLowBin; i < Math.min(harshHighBin, n); i++) {
    harshSum += spectrum[i]
  }
  const harshAvg = harshHighBin > harshLowBin ? harshSum / (harshHighBin - harshLowBin) : avgDb

  if (harshAvg > avgDb + SPECTRAL_TRENDS.HARSH_EXCESS_DB) {
    shelves.push({
      type: 'highShelf',
      hz: 8000,
      gainDb: -3,
      reason: `High-frequency harshness detected (${(harshAvg - avgDb).toFixed(1)} dB excess in 6-10kHz)`,
    })
  }

  return shelves
}

/**
 * Generate complete EQ advisory for a track
 */
export function generateEQAdvisory(
  track: TrackInput,
  severity: SeverityLevel,
  preset: Preset,
  spectrum?: Float32Array,
  sampleRate?: number,
  fftSize?: number
): EQAdvisory {
  const freqHz = getTrackFrequency(track)
  const geq = generateGEQRecommendation(track, severity, preset)
  const peq = generatePEQRecommendation(track, severity, preset)
  const pitch = hzToPitch(freqHz)

  // Generate shelf recommendations if spectrum provided
  let shelves: ShelfRecommendation[] = []
  if (spectrum && sampleRate && fftSize) {
    shelves = analyzeSpectralTrends(spectrum, sampleRate, fftSize)
  }

  return {
    geq,
    peq,
    shelves,
    pitch,
  }
}

/**
 * Format EQ recommendation as human-readable string
 */
export function formatEQRecommendation(advisory: EQAdvisory): string {
  const { geq, peq, pitch } = advisory

  const parts: string[] = []

  // GEQ recommendation
  if (geq.suggestedDb < 0) {
    parts.push(`GEQ: Pull ${geq.bandHz}Hz fader to ${geq.suggestedDb}dB`)
  }

  // PEQ recommendation
  if (peq.gainDb < 0) {
    const typeStr = peq.type === 'notch' ? 'Notch' : peq.type === 'bell' ? 'Bell' : peq.type
    parts.push(`PEQ: ${typeStr} at ${peq.hz.toFixed(1)}Hz, Q=${peq.q.toFixed(1)}, ${peq.gainDb}dB`)
  }

  // Pitch info
  parts.push(`Pitch: ${formatPitch(pitch)}`)

  return parts.join(' | ')
}

/**
 * Get GEQ band labels for display
 */
export function getGEQBandLabels(): string[] {
  return ISO_31_BANDS.map(hz => {
    if (hz >= 1000) {
      return `${(hz / 1000).toFixed(hz % 1000 === 0 ? 0 : 1)}k`
    }
    return `${hz}`
  })
}

/**
 * Get color for severity level
 */
export function getSeverityColor(severity: SeverityLevel): string {
  switch (severity) {
    case 'RUNAWAY': return VIZ_COLORS.RUNAWAY
    case 'GROWING': return VIZ_COLORS.GROWING
    case 'RESONANCE': return VIZ_COLORS.RESONANCE
    case 'POSSIBLE_RING': return VIZ_COLORS.POSSIBLE_RING
    case 'WHISTLE': return VIZ_COLORS.WHISTLE
    case 'INSTRUMENT': return VIZ_COLORS.INSTRUMENT
    default: return VIZ_COLORS.NOISE_FLOOR
  }
}
