/**
 * PDF Report Generator for Kill The Ring feedback history.
 * Produces a professional multi-page report with charts and tables.
 * Uses dynamic imports to keep jsPDF out of the initial bundle.
 */

import { hzToPitch, formatFrequency, formatPitch } from '@/lib/utils/pitchUtils'
import type { SessionSummary, FrequencyHotspot } from '@/lib/dsp/feedbackHistory'
import type { jsPDF } from 'jspdf'

// ============================================================================
// COLORS
// ============================================================================

const COLORS = {
  headerBg: [26, 26, 46] as const,       // #1a1a2e
  headerText: [255, 255, 255] as const,
  amber: [245, 158, 11] as const,         // #f59e0b
  amberLight: [254, 243, 199] as const,   // #fef3c7
  blue: [59, 130, 246] as const,          // #3b82f6
  blueLight: [219, 234, 254] as const,    // #dbeafe
  green: [34, 197, 94] as const,          // #22c55e
  red: [239, 68, 68] as const,            // #ef4444
  muted: [107, 114, 128] as const,        // #6b7280
  mutedLight: [229, 231, 235] as const,   // #e5e7eb
  text: [17, 24, 39] as const,            // #111827
  textLight: [75, 85, 99] as const,       // #4b5563
  white: [255, 255, 255] as const,
  bg: [249, 250, 251] as const,           // #f9fafb
}

type RGB = readonly [number, number, number]

// ============================================================================
// HELPERS
// ============================================================================

const PAGE_W = 210 // A4 width mm
const PAGE_H = 297 // A4 height mm
const MARGIN = 15
const CONTENT_W = PAGE_W - MARGIN * 2

function setColor(doc: jsPDF, color: RGB, type: 'fill' | 'draw' | 'text' = 'text') {
  if (type === 'fill') doc.setFillColor(color[0], color[1], color[2])
  else if (type === 'draw') doc.setDrawColor(color[0], color[1], color[2])
  else doc.setTextColor(color[0], color[1], color[2])
}

function formatTimestamp(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-US', { hour12: false })
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

function pct(count: number, total: number): string {
  if (total === 0) return '0%'
  return `${((count / total) * 100).toFixed(1)}%`
}

function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  if (y + needed > PAGE_H - 20) {
    doc.addPage()
    return 25
  }
  return y
}

// ============================================================================
// DRAWING FUNCTIONS
// ============================================================================

function drawHeader(doc: jsPDF): number {
  // Dark header bar
  setColor(doc, COLORS.headerBg, 'fill')
  doc.rect(0, 0, PAGE_W, 38, 'F')

  // Title
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  setColor(doc, COLORS.white)
  doc.text('KILL THE RING', MARGIN, 17)

  // Subtitle
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  setColor(doc, [180, 180, 210])
  doc.text('Feedback Analysis Report', MARGIN, 28)

  // Date right-aligned
  doc.setFontSize(9)
  setColor(doc, [160, 160, 190])
  doc.text(new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  }), PAGE_W - MARGIN, 28, { align: 'right' })

  return 48 // y position after header
}

function drawSessionInfo(doc: jsPDF, summary: SessionSummary, y: number): number {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  setColor(doc, COLORS.text)
  doc.text('Session Overview', MARGIN, y)
  y += 3

  // Underline
  setColor(doc, COLORS.blue, 'draw')
  doc.setLineWidth(0.5)
  doc.line(MARGIN, y, MARGIN + 45, y)
  y += 8

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  setColor(doc, COLORS.textLight)

  const info = [
    ['Date', formatDateFull(summary.startTime)],
    ['Time', `${formatTimestamp(summary.startTime)} — ${formatTimestamp(summary.endTime)}`],
    ['Duration', formatDurationMs(summary.startTime, summary.endTime)],
  ]

  for (const [label, value] of info) {
    doc.setFont('helvetica', 'bold')
    setColor(doc, COLORS.muted)
    doc.text(`${label}:`, MARGIN, y)
    doc.setFont('helvetica', 'normal')
    setColor(doc, COLORS.text)
    doc.text(value, MARGIN + 28, y)
    y += 5
  }

  return y + 4
}

function drawMetricsRow(doc: jsPDF, summary: SessionSummary, y: number): number {
  const boxW = (CONTENT_W - 8) / 3
  const boxH = 22
  const metrics = [
    { label: 'Total Events', value: String(summary.totalEvents), color: COLORS.blue },
    { label: 'Repeat Offenders', value: String(summary.repeatOffenders.length), color: COLORS.amber },
    {
      label: 'Most Problematic',
      value: summary.mostProblematicFrequency
        ? formatFrequency(summary.mostProblematicFrequency.centerFrequencyHz)
        : 'None',
      color: COLORS.red,
    },
  ]

  metrics.forEach((m, i) => {
    const x = MARGIN + i * (boxW + 4)

    // Box background
    setColor(doc, COLORS.bg, 'fill')
    setColor(doc, COLORS.mutedLight, 'draw')
    doc.setLineWidth(0.3)
    doc.roundedRect(x, y, boxW, boxH, 2, 2, 'FD')

    // Colored top accent
    setColor(doc, m.color, 'fill')
    doc.rect(x, y, boxW, 1.5, 'F')

    // Value
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    setColor(doc, COLORS.text)
    doc.text(m.value, x + boxW / 2, y + 11, { align: 'center' })

    // Label
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    setColor(doc, COLORS.muted)
    doc.text(m.label, x + boxW / 2, y + 18, { align: 'center' })
  })

  return y + boxH + 8
}

function drawBandBreakdown(doc: jsPDF, summary: SessionSummary, y: number): number {
  y = ensureSpace(doc, y, 45)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  setColor(doc, COLORS.text)
  doc.text('Frequency Band Distribution', MARGIN, y)
  y += 8

  const total = summary.totalEvents || 1
  const bands = [
    { label: 'LOW (20-500 Hz)', count: summary.frequencyBandBreakdown.LOW, color: COLORS.blue },
    { label: 'MID (500-4k Hz)', count: summary.frequencyBandBreakdown.MID, color: COLORS.green },
    { label: 'HIGH (4k-20k Hz)', count: summary.frequencyBandBreakdown.HIGH, color: COLORS.red },
  ]

  const barMaxW = CONTENT_W - 55
  const barH = 8

  for (const band of bands) {
    const ratio = band.count / total
    const barW = Math.max(1, ratio * barMaxW)

    // Label
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    setColor(doc, COLORS.textLight)
    doc.text(band.label, MARGIN, y + 5.5)

    // Bar background
    setColor(doc, COLORS.mutedLight, 'fill')
    doc.roundedRect(MARGIN + 50, y, barMaxW, barH, 1.5, 1.5, 'F')

    // Bar fill
    setColor(doc, band.color, 'fill')
    if (barW > 3) {
      doc.roundedRect(MARGIN + 50, y, barW, barH, 1.5, 1.5, 'F')
    } else {
      doc.rect(MARGIN + 50, y, barW, barH, 'F')
    }

    // Count label
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    setColor(doc, ratio > 0.15 ? COLORS.white : COLORS.text)
    const countText = `${band.count} (${pct(band.count, total)})`
    if (ratio > 0.15) {
      doc.text(countText, MARGIN + 53, y + 5.5)
    } else {
      setColor(doc, COLORS.text)
      doc.text(countText, MARGIN + 50 + barW + 3, y + 5.5)
    }

    y += barH + 4
  }

  return y + 4
}

function drawHotspotChart(doc: jsPDF, hotspots: FrequencyHotspot[], y: number): number {
  const top10 = hotspots.slice(0, 10)
  if (top10.length === 0) return y

  const chartHeight = top10.length * 10 + 20
  y = ensureSpace(doc, y, chartHeight)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  setColor(doc, COLORS.text)
  doc.text('Top Problem Frequencies', MARGIN, y)
  y += 8

  const maxOcc = Math.max(...top10.map(h => h.occurrences))
  const barMaxW = CONTENT_W - 60
  const barH = 7

  for (const h of top10) {
    const ratio = h.occurrences / maxOcc
    const barW = Math.max(2, ratio * barMaxW)
    const color = h.isRepeatOffender ? COLORS.amber : COLORS.blue

    // Frequency label
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    setColor(doc, COLORS.text)
    const pitch = hzToPitch(h.centerFrequencyHz)
    doc.text(`${formatFrequency(h.centerFrequencyHz)} ${pitch.note}${pitch.octave}`, MARGIN, y + 5)

    // Bar
    setColor(doc, color, 'fill')
    doc.roundedRect(MARGIN + 38, y, barW, barH, 1, 1, 'F')

    // Occurrence count
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    setColor(doc, ratio > 0.2 ? COLORS.white : COLORS.text)
    if (ratio > 0.2) {
      doc.text(`${h.occurrences}x`, MARGIN + 41, y + 5)
    } else {
      setColor(doc, COLORS.text)
      doc.text(`${h.occurrences}x`, MARGIN + 38 + barW + 2, y + 5)
    }

    y += barH + 3
  }

  return y + 4
}

function drawSectionHeader(doc: jsPDF, title: string, y: number, accentColor: RGB = COLORS.blue): number {
  y = ensureSpace(doc, y, 15)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  setColor(doc, COLORS.text)
  doc.text(title, MARGIN, y)
  y += 2.5

  setColor(doc, accentColor, 'draw')
  doc.setLineWidth(0.5)
  doc.line(MARGIN, y, MARGIN + doc.getTextWidth(title), y)

  return y + 6
}

function drawFooter(doc: jsPDF) {
  const pageCount = doc.getNumberOfPages()
  const version = typeof window !== 'undefined'
    ? (document.querySelector('meta[name="app-version"]')?.getAttribute('content') ?? '')
    : ''

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)

    // Separator line
    setColor(doc, COLORS.mutedLight, 'draw')
    doc.setLineWidth(0.3)
    doc.line(MARGIN, PAGE_H - 14, PAGE_W - MARGIN, PAGE_H - 14)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    setColor(doc, COLORS.muted)

    // Left: app name
    doc.text(`Kill The Ring${version ? ` v${version}` : ''}`, MARGIN, PAGE_H - 9)

    // Center: page number
    doc.text(`Page ${i} of ${pageCount}`, PAGE_W / 2, PAGE_H - 9, { align: 'center' })

    // Right: date
    doc.text(new Date().toLocaleDateString(), PAGE_W - MARGIN, PAGE_H - 9, { align: 'right' })
  }
}

// ============================================================================
// MAIN EXPORT
// ============================================================================

export async function generatePdfReport(
  summary: SessionSummary,
  hotspots: FrequencyHotspot[],
): Promise<Blob> {
  // Dynamic imports
  const { jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  // ── Page 1: Summary ──────────────────────────────────────────────────────
  let y = drawHeader(doc)
  y = drawSessionInfo(doc, summary, y)
  y = drawMetricsRow(doc, summary, y)
  y = drawBandBreakdown(doc, summary, y)
  y = drawHotspotChart(doc, hotspots, y)

  // ── Page 2: Tables ───────────────────────────────────────────────────────
  if (hotspots.length > 0) {
    doc.addPage()
    y = 20

    // Repeat offenders table
    if (summary.repeatOffenders.length > 0) {
      y = drawSectionHeader(doc, 'Repeat Offenders', y, COLORS.amber)

      autoTable(doc, {
        startY: y,
        margin: { left: MARGIN, right: MARGIN },
        headStyles: {
          fillColor: [245, 158, 11],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 8,
        },
        bodyStyles: { fontSize: 7.5, textColor: [17, 24, 39] },
        alternateRowStyles: { fillColor: [254, 243, 199] },
        head: [['Frequency', 'Note', 'Occurrences', 'Avg dB', 'Max dB', 'Suggested Cut']],
        body: summary.repeatOffenders.map(h => {
          const pitch = hzToPitch(h.centerFrequencyHz)
          return [
            formatFrequency(h.centerFrequencyHz),
            formatPitch(pitch),
            `${h.occurrences}x`,
            h.avgAmplitudeDb.toFixed(1),
            h.maxAmplitudeDb.toFixed(1),
            `-${h.suggestedCutDb.toFixed(1)} dB`,
          ]
        }),
      })

      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10
    }

    // All hotspots table
    y = drawSectionHeader(doc, 'All Frequency Hotspots', y)

    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      headStyles: {
        fillColor: [59, 130, 246],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8,
      },
      bodyStyles: { fontSize: 7.5, textColor: [17, 24, 39] },
      alternateRowStyles: { fillColor: [239, 246, 255] },
      head: [['#', 'Frequency', 'Note', 'Occ', 'Avg dB', 'Max dB', 'Conf', 'Cut']],
      body: hotspots.map((h, i) => {
        const pitch = hzToPitch(h.centerFrequencyHz)
        return [
          String(i + 1),
          formatFrequency(h.centerFrequencyHz),
          formatPitch(pitch),
          `${h.occurrences}x`,
          h.avgAmplitudeDb.toFixed(1),
          h.maxAmplitudeDb.toFixed(1),
          `${(h.avgConfidence * 100).toFixed(0)}%`,
          `-${h.suggestedCutDb.toFixed(1)} dB`,
        ]
      }),
      didParseCell: (data) => {
        if (data.section === 'body' && hotspots[data.row.index]?.isRepeatOffender) {
          data.cell.styles.fillColor = [254, 252, 232]
        }
      },
    })

    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10
  }

  // ── Page 3: EQ Recommendations ───────────────────────────────────────────
  const hotspotsWithGeq = hotspots.filter(h => h.events.some(e => e.geqBandHz))
  if (hotspotsWithGeq.length > 0) {
    y = ensureSpace(doc, y, 40)
    y = drawSectionHeader(doc, 'EQ Recommendations', y, COLORS.green)

    // Build GEQ map
    const geqMap = new Map<number, { cutDb: number; freqs: string[] }>()
    for (const h of hotspotsWithGeq) {
      const ev = h.events.find(e => e.geqBandHz)
      if (!ev?.geqBandHz) continue
      const band = ev.geqBandHz
      const existing = geqMap.get(band)
      const pitch = hzToPitch(h.centerFrequencyHz)
      const freqStr = `${formatFrequency(h.centerFrequencyHz)} (${formatPitch(pitch)})`
      if (existing) {
        existing.freqs.push(freqStr)
        existing.cutDb = Math.min(existing.cutDb, ev.geqSuggestedDb ?? 0)
      } else {
        geqMap.set(band, {
          cutDb: ev.geqSuggestedDb ?? -h.suggestedCutDb,
          freqs: [freqStr],
        })
      }
    }

    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      headStyles: {
        fillColor: [34, 197, 94],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8,
      },
      bodyStyles: { fontSize: 7.5, textColor: [17, 24, 39] },
      alternateRowStyles: { fillColor: [240, 253, 244] },
      head: [['GEQ Band', 'Recommended Cut', 'Affected Frequencies']],
      body: [...geqMap.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([band, data]) => [
          formatFrequency(band),
          `${data.cutDb.toFixed(1)} dB`,
          data.freqs.join(', '),
        ]),
    })

    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10
  }

  // ── Event Timeline Scatter ───────────────────────────────────────────────
  const allEvents = hotspots.flatMap(h => h.events).sort((a, b) => a.timestamp - b.timestamp)
  if (allEvents.length > 2) {
    y = ensureSpace(doc, y, 70)
    y = drawSectionHeader(doc, 'Event Timeline', y)

    const chartX = MARGIN + 10
    const chartW = CONTENT_W - 15
    const chartH = 45
    const chartBottom = y + chartH

    // Background
    setColor(doc, COLORS.bg, 'fill')
    doc.rect(chartX, y, chartW, chartH, 'F')

    // Axes
    setColor(doc, COLORS.mutedLight, 'draw')
    doc.setLineWidth(0.3)
    doc.line(chartX, chartBottom, chartX + chartW, chartBottom) // x-axis
    doc.line(chartX, y, chartX, chartBottom) // y-axis

    // Time range
    const tMin = allEvents[0].timestamp
    const tMax = allEvents[allEvents.length - 1].timestamp
    const tRange = Math.max(tMax - tMin, 1000)

    // Frequency range (log scale)
    const freqs = allEvents.map(e => e.frequencyHz)
    const fMin = Math.max(20, Math.min(...freqs) * 0.8)
    const fMax = Math.min(20000, Math.max(...freqs) * 1.2)
    const logMin = Math.log10(fMin)
    const logMax = Math.log10(fMax)
    const logRange = Math.max(logMax - logMin, 0.1)

    // Axis labels
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6)
    setColor(doc, COLORS.muted)
    doc.text('Time', chartX + chartW / 2, chartBottom + 5, { align: 'center' })
    doc.text(formatTimestamp(tMin), chartX, chartBottom + 5)
    doc.text(formatTimestamp(tMax), chartX + chartW, chartBottom + 5, { align: 'right' })

    // Y-axis labels
    const yLabels = [100, 500, 1000, 2000, 5000, 10000].filter(f => f >= fMin && f <= fMax)
    for (const f of yLabels) {
      const yPos = chartBottom - ((Math.log10(f) - logMin) / logRange) * chartH
      if (yPos > y + 2 && yPos < chartBottom - 2) {
        doc.text(formatFrequency(f), chartX - 2, yPos + 1.5, { align: 'right' })
        setColor(doc, COLORS.mutedLight, 'draw')
        doc.setLineWidth(0.1)
        doc.line(chartX, yPos, chartX + chartW, yPos)
      }
    }

    // Plot dots
    for (const e of allEvents) {
      const px = chartX + ((e.timestamp - tMin) / tRange) * chartW
      const py = chartBottom - ((Math.log10(e.frequencyHz) - logMin) / logRange) * chartH

      if (py < y || py > chartBottom) continue

      const bandColor = e.frequencyBand === 'LOW' ? COLORS.blue
        : e.frequencyBand === 'HIGH' ? COLORS.red
        : COLORS.green

      setColor(doc, bandColor, 'fill')
      const radius = e.confidence > 0.8 ? 1.8 : e.confidence > 0.5 ? 1.3 : 0.9
      doc.circle(px, py, radius, 'F')
    }

    // Legend
    y = chartBottom + 9
    const legendItems = [
      { label: 'LOW', color: COLORS.blue },
      { label: 'MID', color: COLORS.green },
      { label: 'HIGH', color: COLORS.red },
    ]
    let lx = MARGIN + 10
    doc.setFontSize(6.5)
    for (const item of legendItems) {
      setColor(doc, item.color, 'fill')
      doc.circle(lx, y - 1, 1.5, 'F')
      setColor(doc, COLORS.textLight)
      doc.text(item.label, lx + 3, y)
      lx += 20
    }
    y += 8
  }

  // ── Recent Events Table ──────────────────────────────────────────────────
  if (allEvents.length > 0) {
    const recentEvents = [...allEvents].sort((a, b) => b.timestamp - a.timestamp).slice(0, 50)
    y = ensureSpace(doc, y, 30)
    y = drawSectionHeader(doc, `Recent Events (${recentEvents.length}${allEvents.length > 50 ? ` of ${allEvents.length}` : ''})`, y)

    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      headStyles: {
        fillColor: [107, 114, 128],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 7,
      },
      bodyStyles: { fontSize: 6.5, textColor: [17, 24, 39] },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      head: [['Time', 'Frequency', 'Severity', 'Conf', 'Q', 'Amplitude']],
      body: recentEvents.map(e => [
        formatTimestamp(e.timestamp),
        formatFrequency(e.frequencyHz),
        e.severity,
        `${(e.confidence * 100).toFixed(0)}%`,
        e.qEstimate.toFixed(1),
        `${e.amplitudeDb.toFixed(1)} dB`,
      ]),
    })
  }

  // ── Footer on all pages ──────────────────────────────────────────────────
  drawFooter(doc)

  return doc.output('blob')
}
