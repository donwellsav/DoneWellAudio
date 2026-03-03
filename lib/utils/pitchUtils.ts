// KillTheRing2 Pitch Utilities - Hz to note/cents/MIDI conversion

import { A4_HZ, A4_MIDI, NOTE_NAMES, CENTS_PER_SEMITONE, SEMITONES_PER_OCTAVE } from '@/lib/dsp/constants'
import type { PitchInfo } from '@/types/advisory'

/**
 * Convert frequency in Hz to pitch information
 */
export function hzToPitch(hz: number): PitchInfo {
  if (hz <= 0 || !Number.isFinite(hz)) {
    return { note: '-', octave: 0, cents: 0, midi: 0 }
  }

  // Calculate MIDI note number (can be fractional)
  const midiFloat = 12 * Math.log2(hz / A4_HZ) + A4_MIDI
  
  // Round to nearest semitone for note name
  const midiRounded = Math.round(midiFloat)
  
  // Calculate cents deviation from nearest note
  const cents = Math.round((midiFloat - midiRounded) * CENTS_PER_SEMITONE)
  
  // Get note name and octave
  const noteIndex = ((midiRounded % 12) + 12) % 12
  const note = NOTE_NAMES[noteIndex]
  const octave = Math.floor(midiRounded / 12) - 1
  
  return {
    note,
    octave,
    cents,
    midi: midiRounded,
  }
}

/**
 * Convert MIDI note number to frequency in Hz
 */
export function midiToHz(midi: number): number {
  return A4_HZ * Math.pow(2, (midi - A4_MIDI) / SEMITONES_PER_OCTAVE)
}

/**
 * Convert note name and octave to frequency in Hz
 */
export function noteToHz(note: string, octave: number): number {
  const noteIndex = NOTE_NAMES.indexOf(note.toUpperCase() as typeof NOTE_NAMES[number])
  if (noteIndex === -1) return 0
  
  const midi = (octave + 1) * 12 + noteIndex
  return midiToHz(midi)
}

/**
 * Calculate cents difference between two frequencies
 */
export function hzToCents(hz1: number, hz2: number): number {
  if (hz1 <= 0 || hz2 <= 0) return 0
  return 1200 * Math.log2(hz1 / hz2)
}

/**
 * Format pitch for display (e.g., "A4 +12c" or "C#5 -5c")
 */
export function formatPitch(pitch: PitchInfo): string {
  if (pitch.note === '-') return '-'
  
  const centsStr = pitch.cents >= 0 ? `+${pitch.cents}` : `${pitch.cents}`
  return `${pitch.note}${pitch.octave} ${centsStr}c`
}

/**
 * Format frequency for display with appropriate precision
 */
export function formatFrequency(hz: number): string {
  if (hz < 100) return hz.toFixed(1)
  if (hz < 1000) return hz.toFixed(0)
  return `${(hz / 1000).toFixed(2)}k`
}

/**
 * Get musical interval name from cents
 */
export function centsToInterval(cents: number): string {
  const absCents = Math.abs(cents)
  
  if (absCents < 50) return 'unison'
  if (absCents < 150) return 'minor 2nd'
  if (absCents < 250) return 'major 2nd'
  if (absCents < 350) return 'minor 3rd'
  if (absCents < 450) return 'major 3rd'
  if (absCents < 550) return 'perfect 4th'
  if (absCents < 650) return 'tritone'
  if (absCents < 750) return 'perfect 5th'
  if (absCents < 850) return 'minor 6th'
  if (absCents < 950) return 'major 6th'
  if (absCents < 1050) return 'minor 7th'
  if (absCents < 1150) return 'major 7th'
  return 'octave'
}

/**
 * Check if two frequencies are harmonically related
 * Returns the harmonic number (2, 3, 4, etc.) or 0 if not harmonic
 */
export function getHarmonicRelation(fundamental: number, harmonic: number, tolerance: number = 0.015): number {
  if (fundamental <= 0 || harmonic <= 0 || harmonic <= fundamental) return 0
  
  const ratio = harmonic / fundamental
  const k = Math.round(ratio)
  
  if (k < 2 || k > 16) return 0
  
  const expected = fundamental * k
  const diff = Math.abs(harmonic - expected)
  
  return diff <= expected * tolerance ? k : 0
}

/**
 * Generate harmonic series from fundamental
 */
export function harmonicSeries(fundamental: number, count: number = 8): number[] {
  const harmonics: number[] = []
  for (let i = 1; i <= count; i++) {
    harmonics.push(fundamental * i)
  }
  return harmonics
}

/**
 * Format a duration to a human-readable string.
 * Accepts either a single value in milliseconds or two date/timestamp
 * arguments (start, end) and computes the elapsed time between them.
 */
export function formatDuration(msOrStart: number | string | Date, end?: string | Date | null): string {
  let ms: number
  if (end != null) {
    const startTime = msOrStart instanceof Date ? msOrStart.getTime() : new Date(msOrStart).getTime()
    const endTime = end instanceof Date ? end.getTime() : new Date(end).getTime()
    ms = Math.abs(endTime - startTime)
  } else if (typeof msOrStart === 'number') {
    ms = msOrStart
  } else {
    return '—'
  }

  if (ms < 1000) return `${Math.round(ms)}ms`
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSec = Math.round(seconds % 60)
  if (minutes < 60) return `${minutes}m ${remainingSec}s`
  const hours = Math.floor(minutes / 60)
  const remainingMin = minutes % 60
  return `${hours}h ${remainingMin}m`
}

/**
 * Format a Date or timestamp to a locale-appropriate display string
 */
export function formatDate(date: Date | number | string): string {
  const d = date instanceof Date ? date : new Date(date)
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
