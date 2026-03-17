/**
 * SnapshotCollector — ring buffer of quantized spectral snapshots (worker-side)
 *
 * Runs inside the DSP Web Worker. Dynamically imported only for free-tier
 * users who have consented to anonymous data collection.
 *
 * Privacy invariants:
 *   - Collects ONLY magnitude spectrum (Float32 dB → Uint8)
 *   - NEVER collects phase data (prevents audio reconstruction)
 *   - NEVER collects device identifiers
 *   - Session IDs are random UUIDs, not linked to user accounts
 */

import type {
  QuantizedSnapshot,
  FeedbackMarker,
  MarkerAlgorithmScores,
  UserFeedback,
  SnapshotBatch,
  EncodedSnapshot,
} from '@/types/data'

// ─── Constants ──────────────────────────────────────────────────────────────

/** Target bins after downsampling (from FFT's binCount) */
const TARGET_BINS = 512

/** Ring buffer capacity: 240 snapshots ≈ 60 seconds at 4/sec */
const RING_CAPACITY = 240

/** Only capture every Nth frame from the worker (throttle) */
const CAPTURE_EVERY_N = 5

/** Snapshots to extract around a feedback event (±30 = 60 total) */
const EVENT_WINDOW_HALF = 30

/** dB range for quantization: maps [-100, 0] dB → [0, 255] Uint8 */
const DB_MIN = -100
const DB_MAX = 0
const DB_RANGE = DB_MAX - DB_MIN // 100

/** Maximum pending events before oldest is dropped */
const MAX_PENDING_EVENTS = 10

// ─── Quantization ───────────────────────────────────────────────────────────

/**
 * Quantize a Float32 dB spectrum to Uint8 (0-255 maps -100..0 dB).
 * Also downsamples from source bins to TARGET_BINS using peak-hold.
 *
 * Resolution: ~0.4 dB per step — sufficient for ML feature extraction.
 */
export function quantizeSpectrum(
  freqDb: Float32Array,
  targetBins: number = TARGET_BINS
): Uint8Array {
  const sourceLen = freqDb.length
  const out = new Uint8Array(targetBins)

  if (sourceLen <= targetBins) {
    // No downsampling needed — just quantize
    for (let i = 0; i < sourceLen; i++) {
      out[i] = dbToUint8(freqDb[i])
    }
    return out
  }

  // Peak-hold downsample (same strategy as calibrationSession)
  const groupSize = sourceLen / targetBins
  for (let i = 0; i < targetBins; i++) {
    const start = (i * groupSize) | 0     // Math.floor via bitwise
    const end = ((i + 1) * groupSize) | 0
    let max = -Infinity
    for (let j = start; j < end; j++) {
      if (freqDb[j] > max) max = freqDb[j]
    }
    out[i] = dbToUint8(max)
  }

  return out
}

/** Clamp and quantize a single dB value to Uint8 */
function dbToUint8(db: number): number {
  if (db <= DB_MIN) return 0
  if (db >= DB_MAX) return 255
  return ((db - DB_MIN) * 255 / DB_RANGE + 0.5) | 0
}

// ─── Base64 encoding (worker-safe, no btoa) ─────────────────────────────────

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** Encode Uint8Array to base64 string (works in Web Worker context) */
function uint8ToBase64(bytes: Uint8Array): string {
  const len = bytes.length
  const pad = len % 3
  let result = ''

  for (let i = 0; i < len - pad; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2]
    result += BASE64_CHARS[(n >> 18) & 63]
    result += BASE64_CHARS[(n >> 12) & 63]
    result += BASE64_CHARS[(n >> 6) & 63]
    result += BASE64_CHARS[n & 63]
  }

  if (pad === 1) {
    const n = bytes[len - 1]
    result += BASE64_CHARS[(n >> 2) & 63]
    result += BASE64_CHARS[(n << 4) & 63]
    result += '=='
  } else if (pad === 2) {
    const n = (bytes[len - 2] << 8) | bytes[len - 1]
    result += BASE64_CHARS[(n >> 10) & 63]
    result += BASE64_CHARS[(n >> 4) & 63]
    result += BASE64_CHARS[(n << 2) & 63]
    result += '='
  }

  return result
}

// ─── SnapshotCollector class ────────────────────────────────────────────────

export class SnapshotCollector {
  private _ring: (QuantizedSnapshot | null)[]
  private _writeIdx = 0
  private _count = 0
  private _frameCounter = 0
  private _sessionId: string
  private _sessionStartMs: number
  private _fftSize: number
  private _sampleRate: number
  private _pendingEvents: FeedbackMarker[] = []
  private _totalBytesCollected = 0
  private _taggedEventCount = 0
  private _labelCounts = { confirmed: 0, falsePositive: 0, unlabeled: 0 }

  constructor(sessionId: string, fftSize: number, sampleRate: number) {
    this._ring = new Array(RING_CAPACITY).fill(null)
    this._sessionId = sessionId
    this._sessionStartMs = Date.now()
    this._fftSize = fftSize
    this._sampleRate = sampleRate
  }

  // ─── Public API ─────────────────────────────────────────────────────

  /**
   * Called on every processPeak frame. Throttles to every 5th frame.
   * Must be called BEFORE buffer transfer (while spectrum is still valid).
   */
  recordFrame(spectrum: Float32Array): void {
    this._frameCounter++
    if (this._frameCounter % CAPTURE_EVERY_N !== 0) return

    const snapshot: QuantizedSnapshot = {
      relativeMs: Date.now() - this._sessionStartMs,
      spectrum: quantizeSpectrum(spectrum),
      tagged: false,
    }

    this._ring[this._writeIdx] = snapshot
    this._writeIdx = (this._writeIdx + 1) % RING_CAPACITY
    if (this._count < RING_CAPACITY) this._count++

    this._totalBytesCollected += TARGET_BINS // Uint8Array size
  }

  /**
   * Mark a feedback detection event. Tags surrounding snapshots.
   * Optional algorithmScores enables ML training data enrichment (v1.1+).
   */
  markFeedbackEvent(
    frequencyHz: number,
    amplitudeDb: number,
    severity: string,
    confidence: number,
    contentType: string,
    algorithmScores?: MarkerAlgorithmScores
  ): void {
    const marker: FeedbackMarker = {
      relativeMs: Date.now() - this._sessionStartMs,
      frequencyHz,
      amplitudeDb,
      severity,
      confidence,
      contentType,
      algorithmScores,
    }

    // Tag snapshots in the window around this event
    this._tagSnapshots(marker.relativeMs)
    this._taggedEventCount++
    this._labelCounts.unlabeled++

    // Queue for batch extraction
    if (this._pendingEvents.length >= MAX_PENDING_EVENTS) {
      this._pendingEvents.shift() // Drop oldest
    }
    this._pendingEvents.push(marker)
  }

  /**
   * Extract the next pending batch (tagged snapshots around a feedback event).
   * Returns null if no pending events.
   */
  extractBatch(): SnapshotBatch | null {
    const event = this._pendingEvents.shift()
    if (!event) return null

    // Find tagged snapshots in the window
    const windowSnapshots = this._getWindowSnapshots(event.relativeMs)
    if (windowSnapshots.length === 0) return null

    const encoded: EncodedSnapshot[] = windowSnapshots.map(snap => ({
      t: snap.relativeMs,
      s: uint8ToBase64(snap.spectrum),
    }))

    return {
      version: event.algorithmScores?.ml !== undefined ? '1.2' : event.algorithmScores ? '1.1' : '1.0',
      sessionId: this._sessionId,
      capturedAt: new Date().toISOString(),
      fftSize: this._fftSize,
      sampleRate: this._sampleRate,
      binsPerSnapshot: TARGET_BINS,
      event,
      snapshots: encoded,
    }
  }

  /**
   * Apply user feedback to a pending event by frequency.
   * Matches the most recent pending marker within ±10 Hz of the given frequency.
   */
  applyUserFeedback(frequencyHz: number, feedback: UserFeedback): boolean {
    // Search backwards (most recent first) for a matching event
    for (let i = this._pendingEvents.length - 1; i >= 0; i--) {
      if (Math.abs(this._pendingEvents[i].frequencyHz - frequencyHz) <= 10) {
        // Update label balance counters
        const prev = this._pendingEvents[i].userFeedback
        if (prev === 'confirmed_feedback') this._labelCounts.confirmed--
        else if (prev === 'false_positive') this._labelCounts.falsePositive--
        else if (!prev || prev === 'correct') this._labelCounts.unlabeled--

        this._pendingEvents[i].userFeedback = feedback

        if (feedback === 'confirmed_feedback') this._labelCounts.confirmed++
        else if (feedback === 'false_positive') this._labelCounts.falsePositive++
        else this._labelCounts.unlabeled++
        return true
      }
    }
    return false
  }

  /** Check if there are pending batches to extract */
  get hasPendingBatches(): boolean {
    return this._pendingEvents.length > 0
  }

  /** Get collection statistics */
  getStats(): { bufferSize: number; taggedEvents: number; bytesCollected: number } {
    return {
      bufferSize: this._count,
      taggedEvents: this._taggedEventCount,
      bytesCollected: this._totalBytesCollected,
    }
  }

  /** Get label balance for ML training data quality tracking */
  getLabelBalance(): { confirmed: number; falsePositive: number; unlabeled: number } {
    return { ...this._labelCounts }
  }

  /** Reset all state (on worker reset) */
  reset(): void {
    this._ring.fill(null)
    this._writeIdx = 0
    this._count = 0
    this._frameCounter = 0
    this._pendingEvents = []
    this._totalBytesCollected = 0
    this._taggedEventCount = 0
    this._labelCounts = { confirmed: 0, falsePositive: 0, unlabeled: 0 }
    this._sessionStartMs = Date.now()
  }

  // ─── Private ────────────────────────────────────────────────────────

  /** Tag snapshots within ±EVENT_WINDOW_HALF of a given time */
  private _tagSnapshots(eventRelativeMs: number): void {
    // Calculate time window based on capture rate
    // At 4 snapshots/sec, each is ~250ms apart
    // EVENT_WINDOW_HALF=30 snapshots × 250ms = 7.5 seconds each side
    const msPerSnapshot = (CAPTURE_EVERY_N * 20) // ~100ms at 20ms frame interval
    const windowMs = EVENT_WINDOW_HALF * msPerSnapshot

    for (let i = 0; i < this._count; i++) {
      const idx = ((this._writeIdx - 1 - i) + RING_CAPACITY * 2) % RING_CAPACITY
      const snap = this._ring[idx]
      if (!snap) continue

      const delta = Math.abs(snap.relativeMs - eventRelativeMs)
      if (delta <= windowMs) {
        snap.tagged = true
      }
    }
  }

  /** Get snapshots within the event window, sorted by time */
  private _getWindowSnapshots(eventRelativeMs: number): QuantizedSnapshot[] {
    const msPerSnapshot = CAPTURE_EVERY_N * 20
    const windowMs = EVENT_WINDOW_HALF * msPerSnapshot
    const result: QuantizedSnapshot[] = []

    for (let i = 0; i < this._count; i++) {
      const idx = ((this._writeIdx - 1 - i) + RING_CAPACITY * 2) % RING_CAPACITY
      const snap = this._ring[idx]
      if (!snap) continue

      const delta = Math.abs(snap.relativeMs - eventRelativeMs)
      if (delta <= windowMs) {
        result.push(snap)
      }
    }

    // Sort chronologically
    result.sort((a, b) => a.relativeMs - b.relativeMs)

    // Limit to 60 snapshots
    if (result.length > EVENT_WINDOW_HALF * 2) {
      const center = result.findIndex(s => s.relativeMs >= eventRelativeMs)
      const start = Math.max(0, center - EVENT_WINDOW_HALF)
      return result.slice(start, start + EVENT_WINDOW_HALF * 2)
    }

    return result
  }
}
