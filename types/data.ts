// Spectral Snapshot Collection — types for anonymous data collection (free tier only)
//
// Privacy invariants (NON-NEGOTIABLE):
//   - NEVER collect phase data (prevents audio reconstruction)
//   - NEVER collect device identifiers
//   - NEVER collect precise geolocation
//   - Session IDs are random UUIDs, not linked to user accounts
//   - Premium tier code must not even IMPORT these modules

// ─── Consent ────────────────────────────────────────────────────────────────

export type ConsentStatus = 'not_asked' | 'prompted' | 'accepted' | 'declined'

export interface ConsentState {
  status: ConsentStatus
  /** Consent version — bump to re-ask on terms change */
  version: number
  /** ISO 8601 timestamp when user last responded */
  respondedAt: string | null
}

/** Current consent version — increment when terms change to re-prompt */
export const CONSENT_VERSION = 1

// ─── Snapshots (worker-side) ────────────────────────────────────────────────

/** A single quantized spectral snapshot stored in the ring buffer */
export interface QuantizedSnapshot {
  /** Milliseconds since session start */
  relativeMs: number
  /** Quantized spectrum: Uint8, 0-255 maps -100..0 dB, 512 bins */
  spectrum: Uint8Array
  /** True if this snapshot was captured during/near a feedback event */
  tagged: boolean
}

/** Feedback event marker for tagging snapshots */
export interface FeedbackMarker {
  /** Milliseconds since session start */
  relativeMs: number
  frequencyHz: number
  amplitudeDb: number
  severity: string
  confidence: number
  /** Content type detected at time of event */
  contentType: string
}

/** A batch of tagged snapshots ready for upload */
export interface SnapshotBatch {
  version: '1.0'
  /** Random UUID, not linked to any user account */
  sessionId: string
  /** ISO 8601 */
  capturedAt: string
  /** FFT size used during capture */
  fftSize: number
  /** Audio sample rate */
  sampleRate: number
  /** Number of bins per snapshot (512) */
  binsPerSnapshot: number
  /** The feedback event that triggered this batch */
  event: FeedbackMarker
  /** Surrounding spectral snapshots (up to 60, ~15 sec window) */
  snapshots: EncodedSnapshot[]
}

/** Wire format for a single snapshot (base64-encoded Uint8Array) */
export interface EncodedSnapshot {
  /** Relative time in ms */
  t: number
  /** Base64-encoded Uint8 spectrum */
  s: string
}

// ─── Upload ─────────────────────────────────────────────────────────────────

export interface UploadResult {
  ok: boolean
  /** HTTP status or 0 for network error */
  status: number
  /** Error message if !ok */
  error?: string
}

/** Queued batch waiting for retry (stored in IndexedDB) */
export interface QueuedBatch {
  id: string
  batch: SnapshotBatch
  /** Compressed payload bytes (gzip) or raw JSON string */
  payload: ArrayBuffer | string
  /** Number of retry attempts so far */
  retries: number
  /** Timestamp of last attempt */
  lastAttemptAt: number
}

// ─── Worker messages ────────────────────────────────────────────────────────

/** Messages from main thread to worker for snapshot collection */
export type SnapshotWorkerInbound =
  | {
      type: 'enableCollection'
      sessionId: string
      fftSize: number
      sampleRate: number
    }
  | {
      type: 'disableCollection'
    }
  | {
      type: 'getSnapshotBatch'
    }

/** Messages from worker to main thread for snapshot collection */
export type SnapshotWorkerOutbound =
  | {
      type: 'snapshotBatch'
      batch: SnapshotBatch | null
    }
  | {
      type: 'collectionStats'
      bufferSize: number
      taggedEvents: number
      bytesCollected: number
    }
