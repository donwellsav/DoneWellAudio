/**
 * Tests for exportTxt.ts — plain text report generation.
 *
 * generateTxtReport is a pure function: SessionSummary + FrequencyHotspot[] → string.
 * No DOM or browser APIs needed (runs in node environment).
 */

import { describe, it, expect } from 'vitest'
import { generateTxtReport } from '../exportTxt'
import type { SessionSummary, FrequencyHotspot, FeedbackEvent } from '@/lib/dsp/feedbackHistory'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<FeedbackEvent> = {}): FeedbackEvent {
  return {
    id: 'evt-1',
    timestamp: 1710000000000,
    frequencyHz: 1000,
    amplitudeDb: -12,
    prominenceDb: 8,
    qEstimate: 15,
    severity: 'GROWING',
    confidence: 0.85,
    wasActedOn: false,
    label: 'ACOUSTIC_FEEDBACK',
    frequencyBand: 'MID',
    ...overrides,
  }
}

function makeHotspot(overrides: Partial<FrequencyHotspot> = {}): FrequencyHotspot {
  return {
    centerFrequencyHz: 1000,
    occurrences: 5,
    events: [makeEvent()],
    firstSeen: 1710000000000,
    lastSeen: 1710000060000,
    maxAmplitudeDb: -8,
    avgAmplitudeDb: -12,
    avgConfidence: 0.85,
    suggestedCutDb: 3,
    isRepeatOffender: true,
    lastEventTime: 1710000060000,
    ...overrides,
  }
}

function makeSummary(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    sessionId: 'session-test',
    startTime: 1710000000000,
    endTime: 1710003600000, // 1 hour later
    totalEvents: 10,
    hotspots: [makeHotspot()],
    repeatOffenders: [makeHotspot()],
    mostProblematicFrequency: makeHotspot(),
    frequencyBandBreakdown: { LOW: 2, MID: 6, HIGH: 2 },
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('generateTxtReport', () => {
  it('includes the report title', () => {
    const report = generateTxtReport(makeSummary(), [makeHotspot()])
    expect(report).toContain('KILL THE RING - FEEDBACK ANALYSIS REPORT')
  })

  it('includes session info section with duration', () => {
    const report = generateTxtReport(makeSummary(), [])
    expect(report).toContain('SESSION INFORMATION')
    expect(report).toContain('Duration:')
    // 1 hour session
    expect(report).toContain('1h 0m 0s')
  })

  it('includes frequency band breakdown', () => {
    const report = generateTxtReport(
      makeSummary({ frequencyBandBreakdown: { LOW: 3, MID: 5, HIGH: 2 } }),
      [],
    )
    expect(report).toContain('FREQUENCY BAND BREAKDOWN')
    expect(report).toContain('LOW')
    expect(report).toContain('MID')
    expect(report).toContain('HIGH')
  })

  it('shows "No hotspots recorded" when hotspots array is empty', () => {
    const report = generateTxtReport(
      makeSummary({ hotspots: [], repeatOffenders: [], mostProblematicFrequency: null }),
      [],
    )
    expect(report).toContain('No hotspots recorded')
  })

  it('includes hotspot frequency and occurrence count', () => {
    const hotspot = makeHotspot({ centerFrequencyHz: 2500, occurrences: 7 })
    const report = generateTxtReport(makeSummary(), [hotspot])
    expect(report).toContain('2.50kHz')
    expect(report).toContain('7x')
  })

  it('includes repeat offenders section when present', () => {
    const report = generateTxtReport(
      makeSummary({ repeatOffenders: [makeHotspot()] }),
      [makeHotspot()],
    )
    expect(report).toContain('REPEAT OFFENDERS')
  })

  it('includes EQ recommendations when hotspots have GEQ data', () => {
    const event = makeEvent({ geqBandHz: 1000, geqSuggestedDb: -3 })
    const hotspot = makeHotspot({ events: [event] })
    const report = generateTxtReport(makeSummary(), [hotspot])
    expect(report).toContain('EQ RECOMMENDATIONS')
    expect(report).toContain('1.00kHz')
  })
})
