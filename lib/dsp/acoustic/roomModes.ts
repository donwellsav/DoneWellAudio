/**
 * Room Mode Calculation & Inverse Dimension Estimation
 *
 * Computes axial, tangential, and oblique room modes from physical dimensions,
 * and inversely estimates room dimensions from detected resonance frequencies.
 *
 * @see Kuttruff, "Room Acoustics" 6th ed., §3.3
 * @see Morse & Ingard, "Theoretical Acoustics" — axial mode decomposition
 */

import { ROOM_ESTIMATION } from '../constants'
import type { RoomDimensionEstimate, DetectedDimensionSeries } from '@/types/calibration'

// ============================================================================
// TYPES
// ============================================================================

export interface RoomMode {
  frequency: number   // Hz
  label: string       // e.g. "1,0,0"
  type: 'axial' | 'tangential' | 'oblique'
}

export interface RoomModesResult {
  all: RoomMode[]
  axial: RoomMode[]
  tangential: RoomMode[]
  oblique: RoomMode[]
}

export interface FormattedRoomMode {
  hz: string
  label: string
}

export interface FormattedRoomModesResult {
  all: FormattedRoomMode[]
  axial: FormattedRoomMode[]
  tangential: FormattedRoomMode[]
  oblique: FormattedRoomMode[]
}

// ============================================================================
// ROOM MODE CALCULATION
// ============================================================================

/**
 * Calculate axial, tangential, and oblique room modes up to 300 Hz.
 * Uses the standard formula: f = (c/2) * sqrt((nx/L)² + (ny/W)² + (nz/H)²)
 * where c = 343 m/s (speed of sound).
 *
 * @param lengthM - Room length in meters
 * @param widthM  - Room width in meters
 * @param heightM - Room height in meters
 * @param maxHz   - Upper frequency limit (default 300 Hz)
 */
export function calculateRoomModes(
  lengthM: number,
  widthM: number,
  heightM: number,
  maxHz = 300
): RoomModesResult {
  const c = 343 // speed of sound m/s
  const MAX_ORDER = 6 // check modes up to 6th order per dimension
  const modes: RoomMode[] = []

  for (let nx = 0; nx <= MAX_ORDER; nx++) {
    for (let ny = 0; ny <= MAX_ORDER; ny++) {
      for (let nz = 0; nz <= MAX_ORDER; nz++) {
        if (nx === 0 && ny === 0 && nz === 0) continue

        const term = (nx / lengthM) ** 2 + (ny / widthM) ** 2 + (nz / heightM) ** 2
        const freq = (c / 2) * Math.sqrt(term)

        if (freq > maxHz) continue

        // Classify mode type by number of non-zero indices
        const nonZero = (nx > 0 ? 1 : 0) + (ny > 0 ? 1 : 0) + (nz > 0 ? 1 : 0)
        const type: RoomMode['type'] =
          nonZero === 1 ? 'axial' : nonZero === 2 ? 'tangential' : 'oblique'

        modes.push({
          frequency: freq,
          label: `${nx},${ny},${nz}`,
          type,
        })
      }
    }
  }

  // Sort by frequency
  modes.sort((a, b) => a.frequency - b.frequency)

  return {
    all: modes,
    axial: modes.filter((m) => m.type === 'axial'),
    tangential: modes.filter((m) => m.type === 'tangential'),
    oblique: modes.filter((m) => m.type === 'oblique'),
  }
}

/**
 * Format room modes for display in the UI
 */
export function formatRoomModesForDisplay(modes: RoomModesResult): FormattedRoomModesResult {
  const fmt = (m: RoomMode): FormattedRoomMode => ({
    hz: m.frequency.toFixed(1),
    label: m.label,
  })
  return {
    all: modes.all.map(fmt),
    axial: modes.axial.map(fmt),
    tangential: modes.tangential.map(fmt),
    oblique: modes.oblique.map(fmt),
  }
}

// ============================================================================
// ROOM MODE PROXIMITY PENALTY
// ============================================================================

/**
 * Check if a detected peak frequency coincides with a calculated room mode.
 *
 * Uses existing calculateRoomModes() to enumerate eigenfrequencies, then
 * checks if the detected peak falls within the -3 dB bandwidth of any mode.
 * Bandwidth from Hopkins §1.2.6.3: Δf_3dB = 6.9 / (π × RT60).
 *
 * @param frequencyHz - Detected peak frequency
 * @param roomLengthM - Room length in meters
 * @param roomWidthM  - Room width in meters
 * @param roomHeightM - Room height in meters
 * @param rt60        - Room RT60 in seconds
 * @returns delta to apply to pFeedback, plus reason string
 */
export function roomModeProximityPenalty(
  frequencyHz: number,
  roomLengthM: number,
  roomWidthM: number,
  roomHeightM: number,
  rt60: number
): { delta: number; reason: string | null } {
  if (roomLengthM <= 0 || roomWidthM <= 0 || roomHeightM <= 0 || rt60 <= 0) {
    return { delta: 0, reason: null }
  }

  // Only check up to 500 Hz — above that, room modes are too dense to be useful
  if (frequencyHz > 500) {
    return { delta: 0, reason: null }
  }

  // Mode bandwidth (Hopkins §1.2.6.3): Δf_3dB = 6.9 / (π × RT60)
  const bandwidth3dB = 6.9 / (Math.PI * rt60)

  const modes = calculateRoomModes(roomLengthM, roomWidthM, roomHeightM, 500)

  let bestDelta = 0
  let bestReason: string | null = null

  for (const mode of modes.all) {
    const distance = Math.abs(frequencyHz - mode.frequency)

    if (distance <= bandwidth3dB && bestDelta > -0.15) {
      // Within -3 dB bandwidth — strong room mode match
      bestDelta = -0.15
      bestReason = `Peak ${frequencyHz.toFixed(0)} Hz matches room mode ${mode.label} (${mode.type}) at ${mode.frequency.toFixed(1)} Hz ±${bandwidth3dB.toFixed(1)} Hz`
    } else if (distance <= 2 * bandwidth3dB && bestDelta > -0.08) {
      // Within 2× bandwidth — mild room mode proximity
      bestDelta = -0.08
      bestReason = `Peak ${frequencyHz.toFixed(0)} Hz near room mode ${mode.label} at ${mode.frequency.toFixed(1)} Hz`
    }
  }

  return { delta: bestDelta, reason: bestReason }
}

// ============================================================================
// INVERSE ROOM DIMENSION ESTIMATION
// ============================================================================

/**
 * Find harmonic series (evenly-spaced frequency groups) in a set of detected peaks.
 * Each series corresponds to axial modes along one room dimension:
 *   f_n = n × c/(2L)  →  spacing Δf = c/(2L)  →  L = c/(2×Δf)
 *
 * Algorithm:
 * 1. For every pair of peaks, compute their GCD-candidate fundamental
 * 2. For each candidate, count how many peaks are integer multiples (within tolerance)
 * 3. Keep candidates with ≥ MIN_HARMONICS matches
 * 4. Merge overlapping candidates, keep up to 3 strongest independent series
 *
 * @param frequencies - Array of stable detected peak frequencies (Hz), pre-filtered for Q and persistence
 * @param knownDimensionM - Optional: one known dimension (meters) to constrain the solver
 * @returns Array of detected harmonic series, sorted by confidence (highest first)
 *
 * @see Kuttruff, "Room Acoustics" 6th ed., §3.3 — rectangular room eigenfrequencies
 * @see Morse & Ingard, "Theoretical Acoustics" — axial mode decomposition
 */
export function findHarmonicSeries(
  frequencies: number[],
  knownDimensionM?: number
): DetectedDimensionSeries[] {
  const C = ROOM_ESTIMATION.SPEED_OF_SOUND
  const TOL = ROOM_ESTIMATION.HARMONIC_TOLERANCE
  const MIN_H = ROOM_ESTIMATION.MIN_HARMONICS

  if (frequencies.length < MIN_H) return []

  const sorted = [...frequencies].sort((a, b) => a - b)

  // If a known dimension is provided, convert to its expected fundamental spacing
  const knownFundamental = knownDimensionM
    ? C / (2 * knownDimensionM)
    : undefined

  // ── Step 1: Generate candidate fundamentals ──────────────────────────────
  // For each pair, compute f_diff / k for k=1..8 (same approach as detectCombPattern)
  const candidates = new Map<number, { fundamental: number; votes: number }>()

  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const diff = sorted[j] - sorted[i]

      for (let k = 1; k <= 8; k++) {
        const f0 = diff / k
        if (f0 < 10) continue // Below useful range

        // Convert to dimension and sanity-check
        const dim = C / (2 * f0)
        if (dim < ROOM_ESTIMATION.MIN_DIMENSION_M || dim > ROOM_ESTIMATION.MAX_DIMENSION_M) continue

        // Quantize to 0.5 Hz bins for grouping
        const key = Math.round(f0 * 2) / 2
        const existing = candidates.get(key)
        if (existing) {
          // Weighted average of fundamentals
          existing.fundamental = (existing.fundamental * existing.votes + f0) / (existing.votes + 1)
          existing.votes++
        } else {
          candidates.set(key, { fundamental: f0, votes: 1 })
        }
      }
    }
  }

  // Also test the known dimension's fundamental if provided
  if (knownFundamental) {
    const key = Math.round(knownFundamental * 2) / 2
    if (!candidates.has(key)) {
      candidates.set(key, { fundamental: knownFundamental, votes: 1 })
    }
  }

  // ── Step 2: Score each candidate — count how many peaks fit ──────────────
  const scoredSeries: DetectedDimensionSeries[] = []

  for (const { fundamental } of candidates.values()) {
    const matchedFreqs: number[] = []

    for (const freq of sorted) {
      const nearestN = Math.round(freq / fundamental)
      if (nearestN < 1) continue
      const expected = nearestN * fundamental
      const error = Math.abs(freq - expected) / expected

      if (error <= TOL) {
        matchedFreqs.push(freq)
      }
    }

    if (matchedFreqs.length < MIN_H) continue

    const dim = C / (2 * fundamental)

    // Check harmonic density: what fraction of expected harmonics are present?
    // A real axial series should have consecutive harmonics (n=1,2,3,4...)
    // A spurious super-series will have gaps (n=1,2,3,4,8,11,15...)
    const harmonicIndices = matchedFreqs.map((f) => Math.round(f / fundamental))
    const maxN = Math.max(...harmonicIndices)
    const density = matchedFreqs.length / maxN // 1.0 = no gaps, 0.5 = half missing

    // Confidence: harmonic density is the strongest signal.
    // A real axial series n=1,2,3,4 has density=1.0.
    // A spurious super-series n=1,2,3,4,8,11,15 has density=0.47 — should be penalized hard.
    const matchRatio = matchedFreqs.length / sorted.length
    const harmonicBonus = Math.min(matchedFreqs.length / 4, 1) // saturates at 4 harmonics
    const confidence = 0.25 * matchRatio + 0.25 * harmonicBonus + 0.50 * density

    scoredSeries.push({
      fundamentalHz: fundamental,
      dimensionM: dim,
      harmonicsMatched: matchedFreqs.length,
      peakFrequencies: matchedFreqs,
      confidence,
    })
  }

  // ── Step 3: Deduplicate — merge series with similar fundamentals ─────────
  scoredSeries.sort((a, b) => b.confidence - a.confidence)

  const independent: DetectedDimensionSeries[] = []
  for (const series of scoredSeries) {
    const isDuplicate = independent.some(
      (existing) => Math.abs(existing.fundamentalHz - series.fundamentalHz) / existing.fundamentalHz < 0.08
    )
    if (!isDuplicate) {
      independent.push(series)
    }
    if (independent.length >= 3) break // max 3 dimensions
  }

  return independent
}

/**
 * Estimate room dimensions from detected resonance frequencies.
 * Inverse of calculateRoomModes(): frequencies → dimensions.
 *
 * Takes an array of stable peak frequencies detected at high sensitivity,
 * finds up to 3 independent harmonic series (one per room axis),
 * and converts each to a physical dimension via L = c/(2×Δf).
 *
 * Forward-validates by computing expected room modes from the estimated
 * dimensions and measuring residual error against the detected peaks.
 *
 * @param stableFrequencies - Detected peak frequencies that persisted ≥500ms with Q ≥10
 * @param knownDimensionM - Optional: one known dimension to constrain the solver
 * @returns RoomDimensionEstimate with dimensions, confidence, and validation metrics
 *
 * @see Kuttruff §3.3, Morse & Ingard ch. 9
 */
export function estimateRoomDimensions(
  stableFrequencies: number[],
  knownDimensionM?: number
): RoomDimensionEstimate | null {
  // Filter to room mode range
  const filtered = stableFrequencies.filter(
    (f) => f > 20 && f <= ROOM_ESTIMATION.MAX_FREQUENCY_HZ
  )

  if (filtered.length < ROOM_ESTIMATION.MIN_PEAKS) return null

  // Find harmonic series
  const series = findHarmonicSeries(filtered, knownDimensionM)
  if (series.length === 0) return null

  // Extract dimensions from series, sorted longest → shortest
  const dims = series.map((s) => s.dimensionM).sort((a, b) => b - a)

  // Pad missing dimensions with reasonable defaults based on found ones
  // If we only found 1 or 2 series, we can't determine all 3 dimensions
  const length = dims[0] ?? 0
  const width = dims[1] ?? 0
  const height = dims[2] ?? 0

  // ── Forward validation ──────────────────────────────────────────────────
  // If we have all 3 dimensions, compute expected modes and check residual
  let residualError = 0
  if (length > 0 && width > 0 && height > 0) {
    const predicted = calculateRoomModes(length, width, height, ROOM_ESTIMATION.MAX_FREQUENCY_HZ)
    const predictedFreqs = predicted.axial.map((m) => m.frequency)

    // For each detected frequency, find the closest predicted mode
    let totalError = 0
    let matched = 0
    for (const detected of filtered) {
      let minError = Infinity
      for (const predicted of predictedFreqs) {
        const err = Math.abs(detected - predicted)
        if (err < minError) minError = err
      }
      if (minError < 20) { // 20 Hz tolerance for matching
        totalError += minError
        matched++
      }
    }
    residualError = matched > 0 ? totalError / matched : 999
  }

  // ── Overall confidence ──────────────────────────────────────────────────
  // Weighted by: series count, average series confidence, and residual error
  const seriesConfidence = series.reduce((sum, s) => sum + s.confidence, 0) / series.length
  const seriesCountBonus = series.length / 3 // 1 series = 0.33, 3 series = 1.0
  const residualPenalty = residualError < 5 ? 1.0 : residualError < 10 ? 0.8 : residualError < 20 ? 0.5 : 0.2
  const confidence = seriesConfidence * 0.4 + seriesCountBonus * 0.3 + residualPenalty * 0.3

  if (confidence < ROOM_ESTIMATION.MIN_CONFIDENCE) return null

  return {
    dimensions: { length, width, height },
    confidence,
    seriesFound: series.length,
    residualError,
    detectedSeries: series,
    totalPeaksAnalyzed: filtered.length,
  }
}
