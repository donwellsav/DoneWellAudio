/**
 * Tests for SnapshotCollector — ring buffer of quantized spectral snapshots
 *
 * Covers: constructor, quantizeSpectrum, recordFrame, ring buffer wrapping,
 * throttling, markFeedbackEvent, applyUserFeedback, extractBatch,
 * hasPendingBatches, getStats, getLabelBalance, reset, and privacy invariants.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { SnapshotCollector, quantizeSpectrum } from '@/lib/data/snapshotCollector'

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Create a Float32Array spectrum of `length` bins filled with a constant dB value */
function makeSpectrum(length: number, dbValue: number): Float32Array {
  return new Float32Array(length).fill(dbValue)
}

/** Feed N frames into the collector (only every 5th is captured) */
function feedFrames(
  collector: SnapshotCollector,
  count: number,
  spectrum?: Float32Array
): void {
  const spec = spectrum ?? makeSpectrum(4096, -50)
  for (let i = 0; i < count; i++) {
    collector.recordFrame(spec)
  }
}

/** Mark a feedback event with sensible defaults */
function markEvent(
  collector: SnapshotCollector,
  frequencyHz: number = 1000,
  opts?: { algorithmScores?: Parameters<typeof collector.markFeedbackEvent>[5] }
): void {
  collector.markFeedbackEvent(
    frequencyHz,
    -20,       // amplitudeDb
    'GROWING', // severity
    0.8,       // confidence
    'speech',  // contentType
    opts?.algorithmScores
  )
}

// ─── Constants (mirror private values from the source) ───────────────────────

const RING_CAPACITY = 240
const CAPTURE_EVERY_N = 5
const TARGET_BINS = 512
const MAX_PENDING_EVENTS = 10

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('SnapshotCollector', () => {
  let collector: SnapshotCollector

  beforeEach(() => {
    collector = new SnapshotCollector('test-session-id', 8192, 48000)
  })

  // ── 1. Constructor ──────────────────────────────────────────────────

  describe('constructor', () => {
    it('creates with session ID, FFT size, and sample rate', () => {
      const stats = collector.getStats()
      expect(stats.bufferSize).toBe(0)
      expect(stats.taggedEvents).toBe(0)
      expect(stats.bytesCollected).toBe(0)
    })

    it('starts with no pending batches', () => {
      expect(collector.hasPendingBatches).toBe(false)
    })

    it('starts with zeroed label balance', () => {
      const labels = collector.getLabelBalance()
      expect(labels).toEqual({ confirmed: 0, falsePositive: 0, unlabeled: 0 })
    })
  })

  // ── 2. quantizeSpectrum ─────────────────────────────────────────────

  describe('quantizeSpectrum', () => {
    it('maps -100 dB to 0', () => {
      const spectrum = makeSpectrum(512, -100)
      const q = quantizeSpectrum(spectrum)
      expect(q[0]).toBe(0)
      expect(q[511]).toBe(0)
    })

    it('maps 0 dB to 255', () => {
      const spectrum = makeSpectrum(512, 0)
      const q = quantizeSpectrum(spectrum)
      expect(q[0]).toBe(255)
      expect(q[511]).toBe(255)
    })

    it('maps -50 dB to approximately 128', () => {
      const spectrum = makeSpectrum(512, -50)
      const q = quantizeSpectrum(spectrum)
      // -50 dB => ((-50 - (-100)) * 255 / 100 + 0.5) | 0 = (50*255/100+0.5)|0 = 128
      expect(q[0]).toBe(128)
    })

    it('clamps values below -100 dB to 0', () => {
      const spectrum = makeSpectrum(512, -150)
      const q = quantizeSpectrum(spectrum)
      expect(q[0]).toBe(0)
    })

    it('clamps values above 0 dB to 255', () => {
      const spectrum = makeSpectrum(512, 10)
      const q = quantizeSpectrum(spectrum)
      expect(q[0]).toBe(255)
    })

    it('returns Uint8Array of TARGET_BINS length', () => {
      const spectrum = makeSpectrum(4096, -30)
      const q = quantizeSpectrum(spectrum)
      expect(q).toBeInstanceOf(Uint8Array)
      expect(q.length).toBe(TARGET_BINS)
    })

    it('downsamples larger spectra with peak-hold', () => {
      // Create a spectrum where every 8th group has a known peak
      const len = 4096
      const spectrum = makeSpectrum(len, -80) // background at -80 dB
      // Plant a loud peak in the first group of 8 bins
      spectrum[0] = -10
      const q = quantizeSpectrum(spectrum)
      // Group size = 4096/512 = 8. First group [0..7] has peak at -10 dB.
      // dbToUint8(-10) = ((-10 - (-100)) * 255/100 + 0.5)|0 = (90*2.55+0.5)|0 = 230
      expect(q[0]).toBe(230)
    })

    it('handles source smaller than target bins without downsampling', () => {
      const spectrum = makeSpectrum(256, -60)
      const q = quantizeSpectrum(spectrum, 512)
      // First 256 bins are quantized, rest default to 0
      const expected = Math.round((-60 - (-100)) * 255 / 100)
      expect(q[0]).toBe(expected)
      expect(q[255]).toBe(expected)
      // Beyond source length should be 0
      expect(q[256]).toBe(0)
    })

    it('accepts custom targetBins parameter', () => {
      const spectrum = makeSpectrum(1024, -40)
      const q = quantizeSpectrum(spectrum, 256)
      expect(q.length).toBe(256)
    })
  })

  // ── 3. recordFrame ──────────────────────────────────────────────────

  describe('recordFrame', () => {
    it('adds a snapshot to the buffer', () => {
      // Need to feed CAPTURE_EVERY_N frames for one capture
      feedFrames(collector, CAPTURE_EVERY_N)
      const stats = collector.getStats()
      expect(stats.bufferSize).toBe(1)
    })

    it('accumulates bytes collected', () => {
      feedFrames(collector, CAPTURE_EVERY_N)
      const stats = collector.getStats()
      expect(stats.bytesCollected).toBe(TARGET_BINS)
    })

    it('captures multiple snapshots over many frames', () => {
      feedFrames(collector, CAPTURE_EVERY_N * 10)
      const stats = collector.getStats()
      expect(stats.bufferSize).toBe(10)
      expect(stats.bytesCollected).toBe(TARGET_BINS * 10)
    })
  })

  // ── 4. Ring buffer capacity ─────────────────────────────────────────

  describe('ring buffer capacity', () => {
    it('holds up to 240 snapshots', () => {
      feedFrames(collector, CAPTURE_EVERY_N * RING_CAPACITY)
      const stats = collector.getStats()
      expect(stats.bufferSize).toBe(RING_CAPACITY)
    })

    it('does not grow beyond 240 when overflowing', () => {
      // Fill past capacity
      feedFrames(collector, CAPTURE_EVERY_N * (RING_CAPACITY + 50))
      const stats = collector.getStats()
      expect(stats.bufferSize).toBe(RING_CAPACITY)
    })

    it('tracks total bytes even after wrapping', () => {
      const totalFrames = RING_CAPACITY + 50
      feedFrames(collector, CAPTURE_EVERY_N * totalFrames)
      const stats = collector.getStats()
      expect(stats.bytesCollected).toBe(TARGET_BINS * totalFrames)
    })
  })

  // ── 5. Throttling (CAPTURE_EVERY_N) ─────────────────────────────────

  describe('throttling', () => {
    it('captures only every 5th frame', () => {
      // Feed 4 frames — nothing captured
      feedFrames(collector, 4)
      expect(collector.getStats().bufferSize).toBe(0)

      // Feed 1 more (5th frame) — now captured
      feedFrames(collector, 1)
      expect(collector.getStats().bufferSize).toBe(1)
    })

    it('captures exactly N snapshots from N*5 frames', () => {
      feedFrames(collector, 25)
      expect(collector.getStats().bufferSize).toBe(5)
    })

    it('does not capture on frames 1-4, 6-9, etc.', () => {
      feedFrames(collector, 1)
      expect(collector.getStats().bufferSize).toBe(0)
      feedFrames(collector, 1)
      expect(collector.getStats().bufferSize).toBe(0)
      feedFrames(collector, 1)
      expect(collector.getStats().bufferSize).toBe(0)
      feedFrames(collector, 1)
      expect(collector.getStats().bufferSize).toBe(0)
      // 5th frame
      feedFrames(collector, 1)
      expect(collector.getStats().bufferSize).toBe(1)
      // 6th-9th
      feedFrames(collector, 4)
      expect(collector.getStats().bufferSize).toBe(1)
      // 10th
      feedFrames(collector, 1)
      expect(collector.getStats().bufferSize).toBe(2)
    })
  })

  // ── 6. markFeedbackEvent (tagEvent equivalent) ──────────────────────

  describe('markFeedbackEvent', () => {
    it('queues a pending event', () => {
      feedFrames(collector, CAPTURE_EVERY_N * 10)
      markEvent(collector)
      expect(collector.hasPendingBatches).toBe(true)
    })

    it('increments taggedEvents in stats', () => {
      feedFrames(collector, CAPTURE_EVERY_N * 10)
      markEvent(collector)
      expect(collector.getStats().taggedEvents).toBe(1)
    })

    it('increments unlabeled count in label balance', () => {
      feedFrames(collector, CAPTURE_EVERY_N * 10)
      markEvent(collector)
      expect(collector.getLabelBalance().unlabeled).toBe(1)
    })

    it('drops oldest event when exceeding MAX_PENDING_EVENTS', () => {
      feedFrames(collector, CAPTURE_EVERY_N * 10)
      // Queue MAX_PENDING_EVENTS + 1 events
      for (let i = 0; i < MAX_PENDING_EVENTS + 1; i++) {
        markEvent(collector, 1000 + i * 100)
      }
      // Should still have MAX_PENDING_EVENTS pending (oldest dropped)
      let count = 0
      while (collector.hasPendingBatches) {
        collector.extractBatch()
        count++
      }
      expect(count).toBe(MAX_PENDING_EVENTS)
    })

    it('tags surrounding snapshots in the ring buffer', () => {
      // Fill some snapshots, mark event, extract batch — should have snapshots
      feedFrames(collector, CAPTURE_EVERY_N * 10)
      markEvent(collector)
      const batch = collector.extractBatch()
      expect(batch).not.toBeNull()
      expect(batch!.snapshots.length).toBeGreaterThan(0)
    })
  })

  // ── 7. applyUserFeedback ────────────────────────────────────────────

  describe('applyUserFeedback', () => {
    beforeEach(() => {
      feedFrames(collector, CAPTURE_EVERY_N * 10)
      markEvent(collector, 1000)
    })

    it('returns true when matching event found within +/-10 Hz', () => {
      expect(collector.applyUserFeedback(1005, 'false_positive')).toBe(true)
    })

    it('returns false when no event matches', () => {
      expect(collector.applyUserFeedback(5000, 'false_positive')).toBe(false)
    })

    it('labels a pending event as false_positive', () => {
      collector.applyUserFeedback(1000, 'false_positive')
      const labels = collector.getLabelBalance()
      expect(labels.falsePositive).toBe(1)
      expect(labels.unlabeled).toBe(0)
    })

    it('labels a pending event as confirmed_feedback', () => {
      collector.applyUserFeedback(1000, 'confirmed_feedback')
      const labels = collector.getLabelBalance()
      expect(labels.confirmed).toBe(1)
      expect(labels.unlabeled).toBe(0)
    })

    it('correctly transitions label from unlabeled to false_positive to confirmed', () => {
      // Starts as unlabeled
      expect(collector.getLabelBalance().unlabeled).toBe(1)

      // Label as false_positive
      collector.applyUserFeedback(1000, 'false_positive')
      expect(collector.getLabelBalance()).toEqual({
        confirmed: 0,
        falsePositive: 1,
        unlabeled: 0,
      })

      // Re-label as confirmed_feedback
      collector.applyUserFeedback(1000, 'confirmed_feedback')
      expect(collector.getLabelBalance()).toEqual({
        confirmed: 1,
        falsePositive: 0,
        unlabeled: 0,
      })
    })

    it('matches the most recent event when multiple events are near same frequency', () => {
      // Add a second event at 1005 Hz
      markEvent(collector, 1005)
      // Apply feedback at 1005 — should match the second (most recent)
      collector.applyUserFeedback(1005, 'false_positive')
      const labels = collector.getLabelBalance()
      // 2 events total: one still unlabeled, one false_positive
      expect(labels.unlabeled).toBe(1)
      expect(labels.falsePositive).toBe(1)
    })

    it('does not match events beyond 10 Hz tolerance', () => {
      expect(collector.applyUserFeedback(1011, 'false_positive')).toBe(false)
    })

    it('matches at exactly 10 Hz boundary', () => {
      // 1010 is exactly 10 Hz from 1000 — should match
      expect(collector.applyUserFeedback(1010, 'false_positive')).toBe(true)
      // 990 is also exactly 10 Hz from 1000 — should still match (re-labels the same event)
      expect(collector.applyUserFeedback(990, 'confirmed_feedback')).toBe(true)
    })
  })

  // ── 8. extractBatch ─────────────────────────────────────────────────

  describe('extractBatch', () => {
    it('returns null when no pending events', () => {
      expect(collector.extractBatch()).toBeNull()
    })

    it('returns a SnapshotBatch with correct metadata', () => {
      feedFrames(collector, CAPTURE_EVERY_N * 10)
      markEvent(collector, 440)
      const batch = collector.extractBatch()

      expect(batch).not.toBeNull()
      expect(batch!.sessionId).toBe('test-session-id')
      expect(batch!.fftSize).toBe(8192)
      expect(batch!.sampleRate).toBe(48000)
      expect(batch!.binsPerSnapshot).toBe(TARGET_BINS)
      expect(batch!.event.frequencyHz).toBe(440)
      expect(batch!.event.amplitudeDb).toBe(-20)
      expect(batch!.event.severity).toBe('GROWING')
      expect(batch!.event.confidence).toBe(0.8)
      expect(batch!.event.contentType).toBe('speech')
    })

    it('returns version 1.0 without algorithmScores', () => {
      feedFrames(collector, CAPTURE_EVERY_N * 10)
      markEvent(collector, 1000)
      const batch = collector.extractBatch()
      expect(batch!.version).toBe('1.0')
    })

    it('returns version 1.1 with algorithmScores (ml undefined)', () => {
      feedFrames(collector, CAPTURE_EVERY_N * 10)
      markEvent(collector, 1000, {
        algorithmScores: {
          msd: 0.5,
          phase: 0.6,
          spectral: 0.3,
          comb: 0.1,
          ihr: 0.4,
          ptmr: 0.2,
          ml: undefined as unknown as number | null,
          fusedProbability: 0.7,
          fusedConfidence: 0.8,
          modelVersion: null,
        },
      })
      const batch = collector.extractBatch()
      // ml is undefined (not present), so version is 1.1
      expect(batch!.version).toBe('1.1')
    })

    it('returns version 1.2 with algorithmScores including ml', () => {
      feedFrames(collector, CAPTURE_EVERY_N * 10)
      markEvent(collector, 1000, {
        algorithmScores: {
          msd: 0.5,
          phase: 0.6,
          spectral: 0.3,
          comb: 0.1,
          ihr: 0.4,
          ptmr: 0.2,
          ml: 0.65,
          fusedProbability: 0.7,
          fusedConfidence: 0.8,
          modelVersion: 'v1-bootstrap',
        },
      })
      const batch = collector.extractBatch()
      expect(batch!.version).toBe('1.2')
    })

    it('includes base64-encoded snapshots', () => {
      feedFrames(collector, CAPTURE_EVERY_N * 10)
      markEvent(collector, 1000)
      const batch = collector.extractBatch()
      expect(batch!.snapshots.length).toBeGreaterThan(0)
      for (const snap of batch!.snapshots) {
        expect(typeof snap.t).toBe('number')
        expect(typeof snap.s).toBe('string')
        // Base64 strings contain only valid chars
        expect(snap.s).toMatch(/^[A-Za-z0-9+/=]+$/)
      }
    })

    it('removes the event from pending after extraction', () => {
      feedFrames(collector, CAPTURE_EVERY_N * 10)
      markEvent(collector, 1000)
      expect(collector.hasPendingBatches).toBe(true)
      collector.extractBatch()
      expect(collector.hasPendingBatches).toBe(false)
    })

    it('returns null if event has no surrounding snapshots', () => {
      // Mark event without recording any frames
      markEvent(collector, 1000)
      const batch = collector.extractBatch()
      // No snapshots in the ring buffer, so batch is null
      expect(batch).toBeNull()
    })

    it('contains capturedAt as ISO 8601 string', () => {
      feedFrames(collector, CAPTURE_EVERY_N * 10)
      markEvent(collector, 1000)
      const batch = collector.extractBatch()
      expect(batch!.capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    })

    it('includes userFeedback in the event when labeled', () => {
      feedFrames(collector, CAPTURE_EVERY_N * 10)
      markEvent(collector, 1000)
      collector.applyUserFeedback(1000, 'false_positive')
      const batch = collector.extractBatch()
      expect(batch!.event.userFeedback).toBe('false_positive')
    })
  })

  // ── 9. hasPendingBatches ────────────────────────────────────────────

  describe('hasPendingBatches', () => {
    it('returns false initially', () => {
      expect(collector.hasPendingBatches).toBe(false)
    })

    it('returns true after markFeedbackEvent', () => {
      feedFrames(collector, CAPTURE_EVERY_N * 10)
      markEvent(collector)
      expect(collector.hasPendingBatches).toBe(true)
    })

    it('returns false after all batches are extracted', () => {
      feedFrames(collector, CAPTURE_EVERY_N * 10)
      markEvent(collector)
      collector.extractBatch()
      expect(collector.hasPendingBatches).toBe(false)
    })

    it('tracks multiple pending events correctly', () => {
      feedFrames(collector, CAPTURE_EVERY_N * 10)
      markEvent(collector, 500)
      markEvent(collector, 1000)
      markEvent(collector, 2000)
      expect(collector.hasPendingBatches).toBe(true)

      collector.extractBatch()
      expect(collector.hasPendingBatches).toBe(true)

      collector.extractBatch()
      expect(collector.hasPendingBatches).toBe(true)

      collector.extractBatch()
      expect(collector.hasPendingBatches).toBe(false)
    })
  })

  // ── 10. getStats ────────────────────────────────────────────────────

  describe('getStats', () => {
    it('returns zeroes initially', () => {
      expect(collector.getStats()).toEqual({
        bufferSize: 0,
        taggedEvents: 0,
        bytesCollected: 0,
      })
    })

    it('tracks buffer size as frames accumulate', () => {
      feedFrames(collector, CAPTURE_EVERY_N * 5)
      expect(collector.getStats().bufferSize).toBe(5)
    })

    it('tracks taggedEvents count', () => {
      feedFrames(collector, CAPTURE_EVERY_N * 10)
      markEvent(collector, 500)
      markEvent(collector, 1500)
      expect(collector.getStats().taggedEvents).toBe(2)
    })

    it('tracks bytesCollected accurately', () => {
      feedFrames(collector, CAPTURE_EVERY_N * 3)
      expect(collector.getStats().bytesCollected).toBe(TARGET_BINS * 3)
    })
  })

  // ── 11. reset() ─────────────────────────────────────────────────────

  describe('reset', () => {
    it('clears buffer size', () => {
      feedFrames(collector, CAPTURE_EVERY_N * 50)
      collector.reset()
      expect(collector.getStats().bufferSize).toBe(0)
    })

    it('clears pending events', () => {
      feedFrames(collector, CAPTURE_EVERY_N * 10)
      markEvent(collector)
      collector.reset()
      expect(collector.hasPendingBatches).toBe(false)
    })

    it('clears taggedEvents and bytesCollected', () => {
      feedFrames(collector, CAPTURE_EVERY_N * 10)
      markEvent(collector)
      collector.reset()
      expect(collector.getStats()).toEqual({
        bufferSize: 0,
        taggedEvents: 0,
        bytesCollected: 0,
      })
    })

    it('clears label balance', () => {
      feedFrames(collector, CAPTURE_EVERY_N * 10)
      markEvent(collector, 1000)
      collector.applyUserFeedback(1000, 'false_positive')
      collector.reset()
      expect(collector.getLabelBalance()).toEqual({
        confirmed: 0,
        falsePositive: 0,
        unlabeled: 0,
      })
    })

    it('resets frame counter so throttle cycle restarts', () => {
      // Feed 3 frames (not enough for a capture)
      feedFrames(collector, 3)
      collector.reset()
      // After reset, frame counter is 0. Feed 5 frames — should capture 1.
      feedFrames(collector, CAPTURE_EVERY_N)
      expect(collector.getStats().bufferSize).toBe(1)
    })

    it('allows normal operation after reset', () => {
      feedFrames(collector, CAPTURE_EVERY_N * 10)
      markEvent(collector, 1000)
      collector.reset()

      // Use it again
      feedFrames(collector, CAPTURE_EVERY_N * 5)
      markEvent(collector, 2000)
      expect(collector.getStats().bufferSize).toBe(5)
      expect(collector.getStats().taggedEvents).toBe(1)
      expect(collector.hasPendingBatches).toBe(true)
      const batch = collector.extractBatch()
      expect(batch).not.toBeNull()
      expect(batch!.event.frequencyHz).toBe(2000)
    })
  })

  // ── 12. Privacy invariants ──────────────────────────────────────────

  describe('privacy', () => {
    it('output batch contains no phase data', () => {
      feedFrames(collector, CAPTURE_EVERY_N * 10)
      markEvent(collector, 1000)
      const batch = collector.extractBatch()
      expect(batch).not.toBeNull()

      // Verify no "phase" key anywhere in the batch JSON
      const json = JSON.stringify(batch)
      // "phase" can appear in algorithmScores as a score name — that's fine.
      // What we check is that there is no raw phase array data.
      expect(json).not.toContain('phaseData')
      expect(json).not.toContain('phaseSpectrum')
      expect(json).not.toContain('phaseArray')
    })

    it('output batch contains no device identifiers', () => {
      feedFrames(collector, CAPTURE_EVERY_N * 10)
      markEvent(collector, 1000)
      const batch = collector.extractBatch()
      expect(batch).not.toBeNull()

      const json = JSON.stringify(batch)
      expect(json).not.toContain('deviceId')
      expect(json).not.toContain('device_id')
      expect(json).not.toContain('deviceName')
      expect(json).not.toContain('userAgent')
      expect(json).not.toContain('fingerprint')
    })

    it('session ID is the one provided, not derived from device', () => {
      feedFrames(collector, CAPTURE_EVERY_N * 10)
      markEvent(collector, 1000)
      const batch = collector.extractBatch()
      expect(batch!.sessionId).toBe('test-session-id')
    })

    it('snapshots contain only magnitude (Uint8 spectrum), no raw Float32 data', () => {
      feedFrames(collector, CAPTURE_EVERY_N * 10)
      markEvent(collector, 1000)
      const batch = collector.extractBatch()
      expect(batch).not.toBeNull()

      for (const snap of batch!.snapshots) {
        // Encoded as base64 string, not raw arrays
        expect(typeof snap.s).toBe('string')
        // No raw spectrum field
        expect((snap as unknown as Record<string, unknown>)['spectrum']).toBeUndefined()
      }
    })
  })

  // ── Edge cases / integration ────────────────────────────────────────

  describe('edge cases', () => {
    it('handles multiple events and extracts in FIFO order', () => {
      feedFrames(collector, CAPTURE_EVERY_N * 20)
      markEvent(collector, 500)
      markEvent(collector, 1000)
      markEvent(collector, 2000)

      const batch1 = collector.extractBatch()
      expect(batch1!.event.frequencyHz).toBe(500)

      const batch2 = collector.extractBatch()
      expect(batch2!.event.frequencyHz).toBe(1000)

      const batch3 = collector.extractBatch()
      expect(batch3!.event.frequencyHz).toBe(2000)
    })

    it('getLabelBalance tracks across multiple events', () => {
      feedFrames(collector, CAPTURE_EVERY_N * 10)
      markEvent(collector, 500)
      markEvent(collector, 1000)
      markEvent(collector, 2000)

      collector.applyUserFeedback(500, 'confirmed_feedback')
      collector.applyUserFeedback(1000, 'false_positive')
      // 2000 remains unlabeled

      expect(collector.getLabelBalance()).toEqual({
        confirmed: 1,
        falsePositive: 1,
        unlabeled: 1,
      })
    })

    it('extractBatch returns snapshots with chronological ordering', () => {
      feedFrames(collector, CAPTURE_EVERY_N * 20)
      markEvent(collector, 1000)
      const batch = collector.extractBatch()
      expect(batch).not.toBeNull()

      for (let i = 1; i < batch!.snapshots.length; i++) {
        expect(batch!.snapshots[i].t).toBeGreaterThanOrEqual(batch!.snapshots[i - 1].t)
      }
    })

    it('works with different FFT sizes and sample rates', () => {
      const col44k = new SnapshotCollector('s2', 4096, 44100)
      const spectrum = makeSpectrum(2048, -30)
      for (let i = 0; i < CAPTURE_EVERY_N * 10; i++) {
        col44k.recordFrame(spectrum)
      }
      col44k.markFeedbackEvent(800, -15, 'RESONANCE', 0.6, 'music')
      const batch = col44k.extractBatch()
      expect(batch).not.toBeNull()
      expect(batch!.fftSize).toBe(4096)
      expect(batch!.sampleRate).toBe(44100)
    })
  })
})
