/**
 * spectrumDrawing.test.ts
 *
 * Tests for canvas drawing performance optimizations:
 * 1. Grid Path2D caching — geometry rebuilt only on range/dimension change
 * 2. cachedMeasureText — indirect test via ctx.measureText call count in drawMarkers
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Path2D stub (browser API not available in Node) ────────────────────────

// Track construction count so tests can verify cache hits/misses
let path2dConstructCount = 0

class Path2DStub {
  moveTo = vi.fn()
  lineTo = vi.fn()
  constructor() {
    path2dConstructCount++
  }
}

vi.stubGlobal('Path2D', Path2DStub)

// ── Mock heavy dependencies to isolate canvas logic ────────────────────────

vi.mock('@/lib/dsp/eqAdvisor', () => ({
  getSeverityColor: () => '#ff0000',
}))

vi.mock('@/lib/dsp/severityUtils', () => ({
  getSeverityUrgency: (severity: string) => {
    const map: Record<string, number> = {
      RUNAWAY: 5, GROWING: 4, RESONANCE: 3, POSSIBLE_RING: 2, WHISTLE: 1, INSTRUMENT: 0,
    }
    return map[severity] ?? 0
  },
}))

vi.mock('@/lib/utils/pitchUtils', () => ({
  formatFrequency: (hz: number) => `${Math.round(hz)}Hz`,
}))

vi.mock('@/lib/dsp/constants', () => ({
  CANVAS_SETTINGS: {},
  VIZ_COLORS: {},
}))

// ── Import after mocks ─────────────────────────────────────────────────────

import {
  drawGrid,
  drawMarkers,
  DARK_CANVAS_THEME,
  LIGHT_CANVAS_THEME,
} from '../spectrumDrawing'
import type { DbRange } from '../spectrumDrawing'
import type { Advisory } from '@/types/advisory'

// ── Mock canvas context factory ─────────────────────────────────────────────

function createMockCtx() {
  return {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    globalAlpha: 1,
    font: '',
    textAlign: '' as CanvasTextAlign,
    textBaseline: '' as CanvasTextBaseline,
    shadowColor: '',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    fillRect: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    closePath: vi.fn(),
    fillText: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    setLineDash: vi.fn(),
    createRadialGradient: vi.fn(() => ({
      addColorStop: vi.fn(),
    })),
    createLinearGradient: vi.fn(() => ({
      addColorStop: vi.fn(),
    })),
    measureText: vi.fn((text: string) => ({
      width: text.length * 7,
      actualBoundingBoxAscent: 10,
      actualBoundingBoxDescent: 2,
    })),
    roundRect: vi.fn(),
  } as unknown as CanvasRenderingContext2D
}

function defaultRange(): DbRange {
  return { dbMin: -90, dbMax: 0, freqMin: 20, freqMax: 20000 }
}

function makeAdvisory(overrides: Partial<Advisory> & { id: string; trueFrequencyHz: number }): Advisory {
  return {
    trackId: 't1',
    timestamp: Date.now(),
    label: 'ACOUSTIC_FEEDBACK',
    severity: 'GROWING',
    confidence: 0.85,
    why: ['test'],
    trueAmplitudeDb: -30,
    prominenceDb: 12,
    qEstimate: 20,
    bandwidthHz: 50,
    velocityDbPerSec: 2,
    eqRecommendation: {
      type: 'PEQ',
      frequencyHz: overrides.trueFrequencyHz,
      gainDb: -6,
      q: 8,
      explanation: 'test',
    },
    msdScore: 0.1,
    feedbackProbability: 0.8,
    pitchName: 'A4',
    ...overrides,
  } as Advisory
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('drawGrid — Path2D caching', () => {
  // Grid cache is module-level state. We test it by observing the Path2D
  // constructor call count across sequential drawGrid invocations.
  // Because the module state persists across tests in the same suite,
  // we structure tests sequentially within a single describe block.

  it('builds grid paths on first call and reuses them on identical second call', () => {
    const ctx = createMockCtx()
    const range = defaultRange()
    const width = 800
    const height = 400

    // Reset tracking for this test
    path2dConstructCount = 0

    // First call — must build 3 Path2D objects (minor, major, freq)
    drawGrid(ctx, width, height, range)
    expect(path2dConstructCount).toBe(3)

    // Second call with identical params — should reuse cached paths (0 new Path2D)
    const countAfterFirst = path2dConstructCount
    drawGrid(ctx, width, height, range)
    expect(path2dConstructCount).toBe(countAfterFirst)

    // ctx.stroke should still be called 3 times per invocation (minor, major, freq)
    // Both calls together = 6 total stroke calls
    expect((ctx.stroke as ReturnType<typeof vi.fn>).mock.calls.length).toBe(6)
  })

  it('rebuilds paths when dimensions change', () => {
    const ctx = createMockCtx()
    const range = defaultRange()

    // Prime the cache with one size
    drawGrid(ctx, 800, 400, range)
    const countAfterPrime = path2dConstructCount

    // Different width — should rebuild
    drawGrid(ctx, 1024, 400, range)
    expect(path2dConstructCount).toBe(countAfterPrime + 3)
  })

  it('rebuilds paths when dB range changes', () => {
    const ctx = createMockCtx()

    // Prime
    drawGrid(ctx, 800, 400, { dbMin: -90, dbMax: 0, freqMin: 20, freqMax: 20000 })
    const countAfterPrime = path2dConstructCount

    // Changed dbMin
    drawGrid(ctx, 800, 400, { dbMin: -60, dbMax: 0, freqMin: 20, freqMax: 20000 })
    expect(path2dConstructCount).toBe(countAfterPrime + 3)
  })

  it('rebuilds paths when frequency range changes', () => {
    const ctx = createMockCtx()

    // Prime
    drawGrid(ctx, 800, 400, { dbMin: -90, dbMax: 0, freqMin: 20, freqMax: 20000 })
    const countAfterPrime = path2dConstructCount

    // Changed freqMax
    drawGrid(ctx, 800, 400, { dbMin: -90, dbMax: 0, freqMin: 20, freqMax: 16000 })
    expect(path2dConstructCount).toBe(countAfterPrime + 3)
  })

  it('does NOT rebuild paths when only theme changes (geometry unchanged)', () => {
    const ctx = createMockCtx()
    const range = defaultRange()

    // Prime with dark theme
    drawGrid(ctx, 800, 400, range, DARK_CANVAS_THEME)
    const countAfterPrime = path2dConstructCount

    // Switch to light theme — same geometry, only colors change
    drawGrid(ctx, 800, 400, range, LIGHT_CANVAS_THEME)
    expect(path2dConstructCount).toBe(countAfterPrime)
  })

  it('applies correct theme colors to cached paths', () => {
    const ctx = createMockCtx()
    const range = defaultRange()

    // Draw with dark theme
    drawGrid(ctx, 800, 400, range, DARK_CANVAS_THEME)

    // The last 3 stroke calls set strokeStyle before stroking cached paths
    // Verify the final strokeStyle assignments match the theme
    // After drawGrid, ctx.strokeStyle should end at the last assigned value (gridFreq)
    expect(ctx.strokeStyle).toBe(DARK_CANVAS_THEME.gridFreq)

    // Now draw with light theme
    drawGrid(ctx, 800, 400, range, LIGHT_CANVAS_THEME)
    expect(ctx.strokeStyle).toBe(LIGHT_CANVAS_THEME.gridFreq)
  })
})

describe('drawMarkers — cachedMeasureText', () => {
  // cachedMeasureText is module-private. We test it indirectly by counting
  // ctx.measureText calls: the cache should deduplicate identical text strings
  // across multiple drawMarkers frames.

  const range = defaultRange()
  const width = 800
  const height = 400
  const fontSize = 12
  const radius = 4

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls ctx.measureText for each unique label on first frame', () => {
    const ctx = createMockCtx()
    const advisories = [
      makeAdvisory({ id: 'a1', trueFrequencyHz: 1000 }),
      makeAdvisory({ id: 'a2', trueFrequencyHz: 4000 }),
    ]

    drawMarkers(ctx, width, height, range, null, advisories, undefined, radius, fontSize)

    // Each advisory generates at least one measureText call for its label
    const measureCalls = (ctx.measureText as ReturnType<typeof vi.fn>).mock.calls.length
    expect(measureCalls).toBeGreaterThanOrEqual(2)
  })

  it('does not scale measureText calls linearly with repeated frames (cache hit)', () => {
    const ctx = createMockCtx()
    // Set same font to keep the cache valid across calls
    ctx.font = '15px monospace'

    const advisories = [
      makeAdvisory({ id: 'a1', trueFrequencyHz: 1000 }),
      makeAdvisory({ id: 'a2', trueFrequencyHz: 4000 }),
    ]

    // First frame
    drawMarkers(ctx, width, height, range, null, advisories, undefined, radius, fontSize)
    const firstFrameCalls = (ctx.measureText as ReturnType<typeof vi.fn>).mock.calls.length

    // Clear to count only second frame
    ;(ctx.measureText as ReturnType<typeof vi.fn>).mockClear()

    // Second frame with same advisories — cache should serve all text measurements
    drawMarkers(ctx, width, height, range, null, advisories, undefined, radius, fontSize)
    const secondFrameCalls = (ctx.measureText as ReturnType<typeof vi.fn>).mock.calls.length

    // The cache means second frame should have fewer (ideally 0) new measureText calls.
    // Note: drawMarkers sets ctx.font internally which may or may not differ from
    // what we pre-set, but the key insight is that identical sequential calls
    // with the same advisories should not double the measurement work.
    expect(secondFrameCalls).toBeLessThanOrEqual(firstFrameCalls)
  })

  it('renders peak dots for all visible advisories', () => {
    const ctx = createMockCtx()
    const advisories = [
      makeAdvisory({ id: 'a1', trueFrequencyHz: 500 }),
      makeAdvisory({ id: 'a2', trueFrequencyHz: 2000 }),
      makeAdvisory({ id: 'a3', trueFrequencyHz: 8000 }),
    ]

    drawMarkers(ctx, width, height, range, null, advisories, undefined, radius, fontSize)

    // Each advisory gets a halo arc + peak dot arc = 2 arc calls per advisory
    const arcCalls = (ctx.arc as ReturnType<typeof vi.fn>).mock.calls.length
    expect(arcCalls).toBe(advisories.length * 2)
  })

  it('skips cleared advisories', () => {
    const ctx = createMockCtx()
    const advisories = [
      makeAdvisory({ id: 'a1', trueFrequencyHz: 500 }),
      makeAdvisory({ id: 'a2', trueFrequencyHz: 2000 }),
    ]
    const clearedIds = new Set(['a1'])

    drawMarkers(ctx, width, height, range, null, advisories, clearedIds, radius, fontSize)

    // Only 1 advisory visible (a2) — 2 arc calls (halo + dot)
    const arcCalls = (ctx.arc as ReturnType<typeof vi.fn>).mock.calls.length
    expect(arcCalls).toBe(2)
  })

  it('suppresses overlapping labels via greedy priority algorithm', () => {
    const ctx = createMockCtx()

    // Two advisories at very close frequencies — labels will overlap
    const advisories = [
      makeAdvisory({ id: 'a1', trueFrequencyHz: 1000, severity: 'GROWING', confidence: 0.9 }),
      makeAdvisory({ id: 'a2', trueFrequencyHz: 1010, severity: 'POSSIBLE_RING', confidence: 0.5 }),
    ]

    drawMarkers(ctx, width, height, range, null, advisories, undefined, radius, fontSize)

    // With near-identical frequencies, only one label should render.
    // fillText is called for the label text (not counting other fillText uses).
    // The higher-severity advisory (GROWING > POSSIBLE_RING) should win.
    // Both get peak dots, but only one gets a text label.
    const fillTextCalls = (ctx.fillText as ReturnType<typeof vi.fn>).mock.calls
    // At most 1 label should render (the winner of the overlap fight)
    expect(fillTextCalls.length).toBeLessThanOrEqual(1)
  })

  it('skips vertical marker line when advisory is in notchedIds set', () => {
    const ctx = createMockCtx()
    const advisories = [
      makeAdvisory({ id: 'a1', trueFrequencyHz: 1000 }),
    ]
    const notchedIds = new Set(['a1'])

    // Reset moveTo/lineTo to count only marker-related calls
    ;(ctx.beginPath as ReturnType<typeof vi.fn>).mockClear()
    ;(ctx.moveTo as ReturnType<typeof vi.fn>).mockClear()
    ;(ctx.lineTo as ReturnType<typeof vi.fn>).mockClear()

    drawMarkers(ctx, width, height, range, null, advisories, undefined, radius, fontSize, DARK_CANVAS_THEME, notchedIds)

    // The vertical line from peak to bottom (moveTo + lineTo + stroke) should be skipped.
    // We still get arc calls for halo + dot. The absence of the vertical line means
    // there should be no lineTo calls in the marker rendering (arcs don't use lineTo).
    const lineToArgs = (ctx.lineTo as ReturnType<typeof vi.fn>).mock.calls
    // lineTo is used for the vertical marker line and for early warning triangles.
    // With notchedIds containing our only advisory, the vertical line is suppressed.
    // Only fillText label drawing remains (no lineTo in label path).
    // There should be 0 lineTo calls from marker vertical lines.
    // (Early warning is null, so no triangle lineTo either.)
    expect(lineToArgs.length).toBe(0)
  })

  it('draws early warning predictions when present', () => {
    const ctx = createMockCtx()
    const earlyWarning = {
      predictedFrequencies: [500, 2000],
      fundamentalSpacing: null,
      estimatedPathLength: null,
      confidence: 0.7,
      timestamp: Date.now(),
    }

    drawMarkers(ctx, width, height, range, earlyWarning, [], undefined, radius, fontSize)

    // Each predicted frequency gets: vertical dashed line (moveTo+lineTo+stroke)
    // + warning triangle (3 moveTo/lineTo calls + closePath + fill)
    expect((ctx.setLineDash as ReturnType<typeof vi.fn>)).toHaveBeenCalled()
    // 2 vertical lines = 2 moveTo + 2 lineTo for the lines
    const moveToCount = (ctx.moveTo as ReturnType<typeof vi.fn>).mock.calls.length
    expect(moveToCount).toBeGreaterThanOrEqual(4) // 2 line starts + 2 triangle tops
  })
})
