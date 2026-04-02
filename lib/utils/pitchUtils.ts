// DoneWell Audio Pitch Utilities - Hz to note/cents/MIDI conversion

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
  if (hz < 100) return `${hz.toFixed(1)}Hz`
  if (hz < 1000) return `${hz.toFixed(0)}Hz`
  return `${(hz / 1000).toFixed(2)}kHz`
}

/** Format frequency as compact label (e.g., "440", "1.2k", "10k") — for axis/chip labels */
export function formatFreqLabel(hz: number): string {
  if (hz >= 10000) return `${(hz / 1000).toFixed(0)}k`
  if (hz >= 1000) return `${(hz / 1000).toFixed(1)}k`
  return `${hz}`
}

/** Format a frequency range for display (e.g., "820 - 1000 Hz" or "1.2 - 2.5 kHz") */
export function formatFrequencyRange(minHz: number, maxHz: number): string {
  if (minHz >= 1000 && maxHz >= 1000) return `${(minHz / 1000).toFixed(1)} - ${(maxHz / 1000).toFixed(1)} kHz`
  if (minHz < 1000 && maxHz < 1000) return `${minHz.toFixed(0)} - ${maxHz.toFixed(0)} Hz`
  return `${minHz.toFixed(0)} Hz - ${(maxHz / 1000).toFixed(1)} kHz`
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
 * Format an ISO date string (or epoch ms as string) into a human-readable date.
 * e.g. "Mar 2, 2026"
 */
export function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

/**
 * Format the elapsed time between two ISO timestamps.
 * endedAt may be null (session still running) — returns "In progress" in that case.
 * e.g. "3m 42s" or "58s"
 */
export function formatDuration(startedAt: string, endedAt: string | null): string {
  if (!endedAt) return 'In progress'
  const startMs = new Date(startedAt).getTime()
  const endMs = new Date(endedAt).getTime()
  if (isNaN(startMs) || isNaN(endMs)) return '—'
  const totalSeconds = Math.max(0, Math.round((endMs - startMs) / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes === 0) return `${seconds}s`
  return `${minutes}m ${seconds}s`
}
