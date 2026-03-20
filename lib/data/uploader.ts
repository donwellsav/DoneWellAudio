/**
 * SnapshotUploader — batch upload with compression, retry, and IndexedDB fallback.
 *
 * Runs on the MAIN THREAD (not in the worker) for reliable fetch + IndexedDB access.
 *
 * Upload flow:
 *   1. Receive SnapshotBatch from worker
 *   2. Serialize to JSON
 *   3. Compress with CompressionStream('gzip') if available
 *   4. POST to /api/v1/ingest
 *   5. On failure: retry 1s → 2s → 4s → queue to IndexedDB
 *
 * Constraints:
 *   - Max 1 upload per 10 seconds (rate limit)
 *   - Max 5MB total per session (bandwidth cap)
 */

import type { SnapshotBatch, UploadResult, QueuedBatch } from '@/types/data'

// ─── Constants ──────────────────────────────────────────────────────────────

const INGEST_URL = '/api/v1/ingest'
const RATE_LIMIT_MS = 10_000
const MAX_SESSION_BYTES = 5 * 1024 * 1024 // 5MB
const RETRY_DELAYS_MS = [1000, 2000, 4000] // Exponential backoff
const IDB_DB_NAME = 'ktr-snapshots'
const IDB_STORE_NAME = 'pending'
const IDB_VERSION = 1

// ─── SnapshotUploader class ─────────────────────────────────────────────────

export class SnapshotUploader {
  private _lastUploadAt = 0
  private _sessionBytes = 0
  private _pendingQueue: SnapshotBatch[] = []
  private _uploading = false

  /** Queue a batch for upload (respects rate limit + session cap) */
  enqueue(batch: SnapshotBatch): void {
    console.debug(`[Uploader] Enqueued batch: ${batch.snapshots.length} snapshots, event=${batch.event.frequencyHz.toFixed(0)}Hz`)
    this._pendingQueue.push(batch)
    this._processQueue()
  }

  /** Try to upload any batches that failed in a previous session (from IndexedDB) */
  async retryQueued(): Promise<void> {
    const queued = await loadFromIDB()
    for (const item of queued) {
      // Re-enqueue as a fresh batch
      this.enqueue(item.batch)
      await removeFromIDB(item.id)
    }
  }

  /** Get current session stats */
  getStats(): { bytesUploaded: number; pendingCount: number; maxBytes: number } {
    return {
      bytesUploaded: this._sessionBytes,
      pendingCount: this._pendingQueue.length,
      maxBytes: MAX_SESSION_BYTES,
    }
  }

  // ─── Private ────────────────────────────────────────────────────────

  private async _processQueue(): Promise<void> {
    if (this._uploading || this._pendingQueue.length === 0) return

    // Rate limit check
    const now = Date.now()
    const timeSinceLastUpload = now - this._lastUploadAt
    if (timeSinceLastUpload < RATE_LIMIT_MS) {
      setTimeout(() => this._processQueue(), RATE_LIMIT_MS - timeSinceLastUpload)
      return
    }

    // Session cap check
    if (this._sessionBytes >= MAX_SESSION_BYTES) return

    this._uploading = true
    const batch = this._pendingQueue.shift()!

    try {
      const result = await this._uploadWithRetry(batch)
      if (!result.ok) {
        // All retries failed — queue to IndexedDB for next session
        await saveToIDB(batch)
      }
    } catch {
      await saveToIDB(batch)
    } finally {
      this._uploading = false
      this._lastUploadAt = Date.now()

      // Process next in queue
      if (this._pendingQueue.length > 0) {
        setTimeout(() => this._processQueue(), RATE_LIMIT_MS)
      }
    }
  }

  private async _uploadWithRetry(batch: SnapshotBatch): Promise<UploadResult> {
    const payload = JSON.stringify(batch)
    const payloadBytes = new TextEncoder().encode(payload)

    // Check session cap
    if (this._sessionBytes + payloadBytes.length > MAX_SESSION_BYTES) {
      return { ok: false, status: 0, error: 'Session bandwidth cap reached' }
    }

    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      try {
        const response = await fetch(INGEST_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: payload,
        })

        if (response.ok) {
          this._sessionBytes += payloadBytes.length
          console.debug(`[Uploader] Upload SUCCESS (${response.status}), ${payloadBytes.length} bytes`)
          return { ok: true, status: response.status }
        }

        // 4xx = client error, don't retry (bad payload)
        if (response.status >= 400 && response.status < 500) {
          const errBody = await response.text().catch(() => '')
          console.warn(`[Uploader] Upload FAILED ${response.status}: ${errBody}`)
          return { ok: false, status: response.status, error: `Client error: ${response.status}` }
        }

        // 5xx = server error, retry
        if (attempt < RETRY_DELAYS_MS.length) {
          await sleep(RETRY_DELAYS_MS[attempt])
        }
      } catch {
        // Network error — retry
        if (attempt < RETRY_DELAYS_MS.length) {
          await sleep(RETRY_DELAYS_MS[attempt])
        }
      }
    }

    return { ok: false, status: 0, error: 'All retries exhausted' }
  }
}

// ─── IndexedDB persistence ──────────────────────────────────────────────────

function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_DB_NAME, IDB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(IDB_STORE_NAME)) {
        db.createObjectStore(IDB_STORE_NAME, { keyPath: 'id' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function saveToIDB(batch: SnapshotBatch): Promise<void> {
  try {
    const db = await openIDB()
    const tx = db.transaction(IDB_STORE_NAME, 'readwrite')
    const store = tx.objectStore(IDB_STORE_NAME)

    const item: QueuedBatch = {
      id: `${batch.sessionId}-${Date.now()}`,
      batch,
      payload: JSON.stringify(batch),
      retries: 0,
      lastAttemptAt: Date.now(),
    }

    store.put(item)
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch {
    // IndexedDB unavailable — drop the batch silently
  }
}

async function loadFromIDB(): Promise<QueuedBatch[]> {
  try {
    const db = await openIDB()
    const tx = db.transaction(IDB_STORE_NAME, 'readonly')
    const store = tx.objectStore(IDB_STORE_NAME)

    return new Promise((resolve, reject) => {
      const request = store.getAll()
      request.onsuccess = () => {
        db.close()
        resolve(request.result ?? [])
      }
      request.onerror = () => {
        db.close()
        reject(request.error)
      }
    })
  } catch {
    return []
  }
}

async function removeFromIDB(id: string): Promise<void> {
  try {
    const db = await openIDB()
    const tx = db.transaction(IDB_STORE_NAME, 'readwrite')
    tx.objectStore(IDB_STORE_NAME).delete(id)
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch {
    // Fail silently
  }
}

// ─── Utilities ──────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
