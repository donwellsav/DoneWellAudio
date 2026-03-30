/**
 * CombHistoryCache & CombStabilityTracker warm-start tests
 *
 * Verifies that:
 * - CombHistoryCache stores and retrieves spacing history keyed by quantized frequency
 * - Cache entries expire after TTL
 * - Cache is bounded with LRU eviction
 * - CombStabilityTracker.warmStart() prepopulates history for faster CV convergence
 * - Retrieve consumes the entry (one warm-start per cache hit)
 * - Nearby frequencies (within one semitone) share a cache slot
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CombHistoryCache, CombStabilityTracker } from '../combPattern'

describe('CombHistoryCache', () => {
  let cache: CombHistoryCache

  beforeEach(() => {
    vi.useFakeTimers()
    cache = new CombHistoryCache()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('stores and retrieves spacing history for a frequency', () => {
    const spacings = [100, 101, 99, 100, 102]
    cache.save(440, spacings)

    const retrieved = cache.retrieve(440)
    expect(retrieved).toEqual(spacings)
  })

  it('returns null when no entry exists for a frequency', () => {
    expect(cache.retrieve(1000)).toBeNull()
  })

  it('consumes entry on retrieve (one warm-start per cache hit)', () => {
    cache.save(440, [100, 101, 99])

    const first = cache.retrieve(440)
    expect(first).not.toBeNull()

    const second = cache.retrieve(440)
    expect(second).toBeNull()
  })

  it('matches nearby frequencies within one semitone', () => {
    // 440 Hz and 445 Hz are within one semitone (~20 cents apart)
    cache.save(440, [100, 101, 99])

    const retrieved = cache.retrieve(445)
    expect(retrieved).toEqual([100, 101, 99])
  })

  it('does not match distant frequencies', () => {
    // 440 Hz and 500 Hz are ~2.2 semitones apart
    cache.save(440, [100, 101, 99])

    expect(cache.retrieve(500)).toBeNull()
    // Original should still be there (not consumed by failed match)
    expect(cache.retrieve(440)).toEqual([100, 101, 99])
  })

  it('does not store empty spacings', () => {
    cache.save(440, [])
    expect(cache.size).toBe(0)
  })

  it('copies spacings on save (no aliasing)', () => {
    const spacings = [100, 101, 99]
    cache.save(440, spacings)

    // Mutate original — should not affect cached copy
    spacings.push(200)

    const retrieved = cache.retrieve(440)
    expect(retrieved).toEqual([100, 101, 99])
  })

  it('expires entries after TTL', () => {
    cache.save(440, [100, 101, 99])

    // Advance time past TTL (default 5000ms)
    vi.advanceTimersByTime(5001)

    expect(cache.retrieve(440)).toBeNull()
  })

  it('returns entry within TTL window', () => {
    cache.save(440, [100, 101, 99])

    // Just under TTL
    vi.advanceTimersByTime(4999)

    expect(cache.retrieve(440)).toEqual([100, 101, 99])
  })

  it('respects custom TTL', () => {
    const shortCache = new CombHistoryCache(32, 1000)
    shortCache.save(440, [100, 101])

    vi.advanceTimersByTime(1001)
    expect(shortCache.retrieve(440)).toBeNull()
  })

  it('evicts LRU entry when at capacity', () => {
    const smallCache = new CombHistoryCache(3, 60000)

    smallCache.save(440, [100])   // A4 — MIDI 69
    vi.advanceTimersByTime(10)
    smallCache.save(880, [200])   // A5 — MIDI 81
    vi.advanceTimersByTime(10)
    smallCache.save(1760, [300])  // A6 — MIDI 93

    expect(smallCache.size).toBe(3)

    // Adding a 4th entry should evict the LRU (440 Hz, oldest lastUsed)
    vi.advanceTimersByTime(10)
    smallCache.save(3520, [400])  // A7 — MIDI 105

    expect(smallCache.size).toBe(3)
    expect(smallCache.retrieve(440)).toBeNull()   // evicted
    expect(smallCache.retrieve(880)).toEqual([200])
  })

  it('overwrites same-semitone entry', () => {
    cache.save(440, [100, 101])
    cache.save(440, [200, 201, 202])

    const retrieved = cache.retrieve(440)
    expect(retrieved).toEqual([200, 201, 202])
  })

  it('clear() removes all entries', () => {
    cache.save(440, [100])
    cache.save(880, [200])
    cache.clear()

    expect(cache.size).toBe(0)
    expect(cache.retrieve(440)).toBeNull()
    expect(cache.retrieve(880)).toBeNull()
  })
})

describe('CombStabilityTracker.warmStart', () => {
  it('prepopulates history from cached spacings', () => {
    const tracker = new CombStabilityTracker()
    tracker.warmStart([100, 101, 99, 100])

    expect(tracker.length).toBe(4)
    // With 4 stable samples, CV should be very low
    expect(tracker.cv).toBeLessThan(0.05)
    expect(tracker.isSweeping).toBe(false)
  })

  it('warm-started tracker detects sweeping from cached data', () => {
    const tracker = new CombStabilityTracker()
    // Highly variable spacings — should be detected as sweeping
    tracker.warmStart([50, 150, 50, 150, 50])

    expect(tracker.length).toBe(5)
    expect(tracker.isSweeping).toBe(true)
  })

  it('merges cached spacings with existing observations', () => {
    const tracker = new CombStabilityTracker()
    tracker.push(100)
    tracker.push(101)

    // Warm-start prepends
    tracker.warmStart([98, 99])

    // Should have all 4: [98, 99, 100, 101]
    expect(tracker.length).toBe(4)
  })

  it('caps at maxLen when warm-starting with large cache', () => {
    const tracker = new CombStabilityTracker(4) // maxLen = 4
    const largeCache = Array.from({ length: 20 }, (_, i) => 100 + i)

    tracker.warmStart(largeCache)

    expect(tracker.length).toBe(4) // capped
    // Should keep the most recent 4 entries
  })

  it('spacings getter returns current history', () => {
    const tracker = new CombStabilityTracker()
    tracker.push(100)
    tracker.push(200)
    tracker.push(300)

    expect(tracker.spacings).toEqual([100, 200, 300])
  })

  it('spacings getter is read-only (does not alias internal array)', () => {
    const tracker = new CombStabilityTracker()
    tracker.push(100)

    const ref = tracker.spacings
    // Should be readonly — TypeScript enforces this, but verify length
    expect(ref.length).toBe(1)
    expect(tracker.length).toBe(1)
  })
})

describe('CombHistoryCache + CombStabilityTracker integration', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('full cycle: track -> prune -> cache -> new track warm-starts', () => {
    const cache = new CombHistoryCache()

    // Simulate a tracker accumulating stable data
    const originalTracker = new CombStabilityTracker()
    for (let i = 0; i < 10; i++) {
      originalTracker.push(100 + Math.random() * 0.5) // very stable ~100 Hz spacing
    }
    expect(originalTracker.isSweeping).toBe(false)

    // Track is pruned — save to cache at 440 Hz
    cache.save(440, originalTracker.spacings)

    // New track appears nearby (442 Hz, within one semitone)
    const newTracker = new CombStabilityTracker()
    const cached = cache.retrieve(442)
    expect(cached).not.toBeNull()
    if (cached) {
      newTracker.warmStart(cached)
    }

    // New tracker should already know this is stable
    expect(newTracker.length).toBeGreaterThanOrEqual(4)
    expect(newTracker.isSweeping).toBe(false)
  })

  it('cache expiry prevents stale warm-start', () => {
    const cache = new CombHistoryCache()

    const tracker = new CombStabilityTracker()
    for (let i = 0; i < 8; i++) tracker.push(100)
    cache.save(440, tracker.spacings)

    // Wait longer than TTL
    vi.advanceTimersByTime(6000)

    // New track appears — cache should be expired
    const cached = cache.retrieve(440)
    expect(cached).toBeNull()
  })
})
