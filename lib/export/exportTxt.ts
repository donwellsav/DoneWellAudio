/**
 * TXT Report Generator for Kill The Ring feedback history.
 * Produces a fixed-width plain text report readable in any text editor.
 */

import { hzToPitch, formatFrequency, formatPitch } from '@/lib/utils/pitchUtils'
import type { SessionSummary, FrequencyHotspot, FeedbackEvent } from '@/lib/dsp/feedbackHistory'

const LINE = '=' .repeat(76)
const THIN = '-'.repeat(76)

function pad(str: string, len: number): string {
  return str.padEnd(len)
}

function rpad(str: string, len: number): string {
  return str.padStart(len)
}

function formatTimestamp(ms: number): string {
  const d = new Date(ms)
  return d.toLocaleTimeString('en-US', { hour12: false })
}

function formatDateFull(ms: number): string {
  return new Date(ms).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  })
}

function formatDurationMs(startMs: number, endMs: number): string {
  const totalSec = Math.max(0, Math.round((endMs - startMs) / 1000))
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function freqWithNote(hz: number): string {
  const pitch = hzToPitch(hz)
  return `${formatFrequency(hz)} (${formatPitch(pitch)})`
}

function pct(count: number, total: number): string {
  if (total === 0) return '0.0%'
  return `${((count / total) * 100).toFixed(1)}%`
}

export function generateTxtReport(
  summary: SessionSummary,
  hotspots: FrequencyHotspot[],
): string {
  const lines: string[] = []
  const w = (s: string) => lines.push(s)
  const blank = () => lines.push('')

  // Header
  w(LINE)
  w('                KILL THE RING - FEEDBACK ANALYSIS REPORT')
  w(LINE)
  blank()

  // Session info
  w('SESSION INFORMATION')
  w(THIN)
  w(`  Date:           ${formatDateFull(summary.startTime)}`)
  w(`  Start Time:     ${formatTimestamp(summary.startTime)}`)
  w(`  End Time:       ${formatTimestamp(summary.endTime)}`)
  w(`  Duration:       ${formatDurationMs(summary.startTime, summary.endTime)}`)
  w(`  Total Events:   ${summary.totalEvents}`)
  w(`  Hotspots:       ${hotspots.length}`)
  w(`  Repeat Offenders: ${summary.repeatOffenders.length}`)
  blank()

  // Frequency band breakdown
  const total = summary.totalEvents
  const { LOW, MID, HIGH } = summary.frequencyBandBreakdown
  w('FREQUENCY BAND BREAKDOWN')
  w(THIN)
  w(`  LOW  (20-500 Hz):     ${rpad(String(LOW), 4)} events  (${pct(LOW, total)})`)
  w(`  MID  (500-4000 Hz):   ${rpad(String(MID), 4)} events  (${pct(MID, total)})`)
  w(`  HIGH (4000-20k Hz):   ${rpad(String(HIGH), 4)} events  (${pct(HIGH, total)})`)
  blank()

  // Repeat offenders
  if (summary.repeatOffenders.length > 0) {
    w(LINE)
    w('REPEAT OFFENDERS (3+ occurrences)')
    w(LINE)
    w(`  ${pad('#', 4)}${pad('Frequency', 16)}${pad('Note', 10)}${rpad('Occ', 5)}${rpad('Avg dB', 9)}${rpad('Max dB', 9)}${rpad('Cut', 10)}`)
    w(`  ${'-'.repeat(63)}`)
    summary.repeatOffenders.forEach((h, i) => {
      const pitch = hzToPitch(h.centerFrequencyHz)
      w(`  ${pad(String(i + 1), 4)}${pad(formatFrequency(h.centerFrequencyHz), 16)}${pad(formatPitch(pitch), 10)}${rpad(`${h.occurrences}x`, 5)}${rpad(h.avgAmplitudeDb.toFixed(1), 9)}${rpad(h.maxAmplitudeDb.toFixed(1), 9)}${rpad(`-${h.suggestedCutDb.toFixed(1)} dB`, 10)}`)
    })
    blank()
  }

  // All hotspots
  w(LINE)
  w('ALL HOTSPOTS (sorted by occurrence)')
  w(LINE)
  if (hotspots.length === 0) {
    w('  No hotspots recorded.')
  } else {
    w(`  ${pad('#', 4)}${pad('Frequency', 16)}${pad('Note', 10)}${rpad('Occ', 5)}${rpad('Avg dB', 9)}${rpad('Max dB', 9)}${rpad('Conf', 7)}${rpad('Cut', 10)}`)
    w(`  ${'-'.repeat(70)}`)
    hotspots.forEach((h, i) => {
      const pitch = hzToPitch(h.centerFrequencyHz)
      const conf = `${(h.avgConfidence * 100).toFixed(0)}%`
      w(`  ${pad(String(i + 1), 4)}${pad(formatFrequency(h.centerFrequencyHz), 16)}${pad(formatPitch(pitch), 10)}${rpad(`${h.occurrences}x`, 5)}${rpad(h.avgAmplitudeDb.toFixed(1), 9)}${rpad(h.maxAmplitudeDb.toFixed(1), 9)}${rpad(conf, 7)}${rpad(`-${h.suggestedCutDb.toFixed(1)} dB`, 10)}`)
    })
  }
  blank()

  // EQ Recommendations
  const hotspotsWithGeq = hotspots.filter(h => h.events.some(e => e.geqBandHz))
  if (hotspotsWithGeq.length > 0) {
    w(LINE)
    w('EQ RECOMMENDATIONS')
    w(LINE)
    w(`  ${pad('GEQ Band', 12)}${rpad('Cut', 10)}${pad('Affected Frequency', 30)}`)
    w(`  ${'-'.repeat(52)}`)

    // Group by GEQ band
    const geqMap = new Map<number, { cutDb: number; freqs: string[] }>()
    for (const h of hotspotsWithGeq) {
      const ev = h.events.find(e => e.geqBandHz)
      if (!ev?.geqBandHz) continue
      const band = ev.geqBandHz
      const existing = geqMap.get(band)
      if (existing) {
        existing.freqs.push(freqWithNote(h.centerFrequencyHz))
        existing.cutDb = Math.min(existing.cutDb, ev.geqSuggestedDb ?? 0)
      } else {
        geqMap.set(band, {
          cutDb: ev.geqSuggestedDb ?? -h.suggestedCutDb,
          freqs: [freqWithNote(h.centerFrequencyHz)],
        })
      }
    }

    const sorted = [...geqMap.entries()].sort((a, b) => a[0] - b[0])
    for (const [band, data] of sorted) {
      w(`  ${pad(`${formatFrequency(band)}`, 12)}${rpad(`${data.cutDb.toFixed(1)} dB`, 10)}${data.freqs.join(', ')}`)
    }
    blank()
  }

  // Recent events
  const allEvents = hotspots.flatMap(h => h.events).sort((a, b) => b.timestamp - a.timestamp)
  const recentEvents = allEvents.slice(0, 20)
  if (recentEvents.length > 0) {
    w(LINE)
    w(`RECENT EVENTS (last ${recentEvents.length}${allEvents.length > 20 ? ` of ${allEvents.length}` : ''})`)
    w(LINE)
    w(`  ${pad('Time', 12)}${pad('Frequency', 14)}${pad('Severity', 14)}${rpad('Conf', 7)}${rpad('Q', 8)}${rpad('Amp dB', 9)}`)
    w(`  ${'-'.repeat(64)}`)
    recentEvents.forEach(e => {
      w(`  ${pad(formatTimestamp(e.timestamp), 12)}${pad(formatFrequency(e.frequencyHz), 14)}${pad(e.severity, 14)}${rpad(`${(e.confidence * 100).toFixed(0)}%`, 7)}${rpad(e.qEstimate.toFixed(1), 8)}${rpad(e.amplitudeDb.toFixed(1), 9)}`)
    })
  }
  blank()

  // Footer
  w(LINE)
  const version = typeof window !== 'undefined'
    ? (document.querySelector('meta[name="app-version"]')?.getAttribute('content') ?? '')
    : ''
  w(`Report generated by Kill The Ring${version ? ` v${version}` : ''}`)
  w(`Generated: ${new Date().toISOString()}`)
  w(LINE)

  return lines.join('\n')
}
