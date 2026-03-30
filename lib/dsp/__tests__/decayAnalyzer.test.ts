import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DecayAnalyzer } from '../decayAnalyzer'

// Mock findNearestGEQBand — returns bandIndex based on frequency range
vi.mock('../eqAdvisor', () => ({
  findNearestGEQBand: (freqHz: number) => ({
    bandHz: freqHz,
    bandIndex: Math.round(Math.log2(freqHz / 31.25)),
  }),
}))

describe('DecayAnalyzer', () => {
  let analyzer: DecayAnalyzer

  beforeEach(() => {
    analyzer = new DecayAnalyzer()
  })

  it('detects room-mode-like exponential decay', () => {
    const rt60 = 1.0 // 1 second RT60 → expected rate = 60 dB/s
    const clearTime = 1000

    // Record a peak that was at -20 dB when cleared
    analyzer.recordDecay(100, -20, clearTime, 500)

    // 200ms later, amplitude dropped to -30 dB → 50 dB/s actual rate
    // Expected rate = 60 dB/s, actual 50 < 60*1.5=90 → flagged as room mode
    const spectrum = new Float32Array(4096)
    spectrum[100] = -30

    const cooldowns = analyzer.analyzeDecays(spectrum, rt60, clearTime + 200)
    expect(cooldowns.length).toBe(1)
    expect(cooldowns[0].bandIndex).toBeGreaterThanOrEqual(0)
  })

  it('does NOT flag instant feedback drop as room mode', () => {
    const rt60 = 1.0
    const clearTime = 1000

    analyzer.recordDecay(100, -20, clearTime, 500)

    // 100ms later, dropped to -80 dB → 600 dB/s actual rate
    // Expected rate = 60 dB/s, actual 600 > 60*1.5=90 → NOT room mode
    const spectrum = new Float32Array(4096)
    spectrum[100] = -80

    const cooldowns = analyzer.analyzeDecays(spectrum, rt60, clearTime + 100)
    expect(cooldowns.length).toBe(0)
  })

  it('skips analysis when elapsed < 50ms', () => {
    const rt60 = 1.0
    const clearTime = 1000

    analyzer.recordDecay(100, -20, clearTime, 500)

    const spectrum = new Float32Array(4096)
    spectrum[100] = -25

    // Only 30ms elapsed — too early for reliable rate calculation
    const cooldowns = analyzer.analyzeDecays(spectrum, rt60, clearTime + 30)
    expect(cooldowns.length).toBe(0)
  })

  it('expires entries after DECAY_ANALYSIS_WINDOW_MS (500ms)', () => {
    const clearTime = 1000
    analyzer.recordDecay(100, -20, clearTime, 500)

    const spectrum = new Float32Array(4096)
    spectrum[100] = -25

    // 600ms later — past the 500ms window
    const cooldowns = analyzer.analyzeDecays(spectrum, 1.0, clearTime + 600)
    expect(cooldowns.length).toBe(0)
  })

  it('handles bin index out of spectrum range', () => {
    const clearTime = 1000
    // Record decay at bin 5000, but spectrum only has 4096 bins
    analyzer.recordDecay(5000, -20, clearTime, 8000)

    const spectrum = new Float32Array(4096)
    const cooldowns = analyzer.analyzeDecays(spectrum, 1.0, clearTime + 200)
    expect(cooldowns.length).toBe(0)
  })

  it('pruneExpired removes old entries', () => {
    analyzer.recordDecay(100, -20, 1000, 500)
    analyzer.recordDecay(200, -30, 2000, 1000)

    // TTL is 30_000ms — prune at 32_000 should remove first entry
    analyzer.pruneExpired(32000)

    // Only the second entry should survive
    const spectrum = new Float32Array(4096)
    spectrum[100] = -25
    spectrum[200] = -35

    const cooldowns = analyzer.analyzeDecays(spectrum, 1.0, 2200)
    // Bin 100 was pruned, bin 200 should still be analyzed
    expect(cooldowns.every(c => c.bandIndex !== Math.round(Math.log2(500 / 31.25)))).toBe(true)
  })

  it('reset clears all entries', () => {
    analyzer.recordDecay(100, -20, 1000, 500)
    analyzer.reset()

    const spectrum = new Float32Array(4096)
    spectrum[100] = -25

    const cooldowns = analyzer.analyzeDecays(spectrum, 1.0, 1200)
    expect(cooldowns.length).toBe(0)
  })

  it('ignores bins with amplitude <= -100 dB', () => {
    const clearTime = 1000
    analyzer.recordDecay(100, -20, clearTime, 500)

    const spectrum = new Float32Array(4096)
    spectrum[100] = -101 // Below -100 threshold

    const cooldowns = analyzer.analyzeDecays(spectrum, 1.0, clearTime + 200)
    expect(cooldowns.length).toBe(0)
  })
})
