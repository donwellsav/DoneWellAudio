/**
 * Generic IndexedDB helpers — simple key-value get/set/delete.
 *
 * Uses a single object store per database. Each entry is keyed by a string `id`
 * and stores an arbitrary JSON-serializable `value`. Connection is opened once
 * per database name (cached), so repeated calls are cheap.
 *
 * All operations fail silently and return the provided fallback — IndexedDB
 * may be unavailable in private browsing, restricted iframes, or older browsers.
 *
 * Note: Connections are cached for the page lifetime and never explicitly closed.
 * This is intentional — IDB connections are lightweight handles, and reopening
 * on every operation would add unnecessary latency.
 */

const DB_VERSION = 1
const STORE_NAME = 'kv'

/** Cached connections — one per database name. Evicted on failure so retries work. */
const connectionCache = new Map<string, Promise<IDBDatabase>>()

function openDb(name: string): Promise<IDBDatabase> {
  const cached = connectionCache.get(name)
  if (cached) return cached

  // Early bail — don't cache the rejection so we can retry if IDB becomes available
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB not available'))
  }

  const promise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => {
      connectionCache.delete(name)
      reject(request.error)
    }
  })

  connectionCache.set(name, promise)
  return promise
}

/**
 * Read a value from IndexedDB. Returns `fallback` if the key doesn't exist
 * or if IndexedDB is unavailable.
 */
export async function getIndexedValue<T>(
  dbName: string,
  key: string,
  fallback: T,
): Promise<T> {
  try {
    const db = await openDb(dbName)
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)

    return new Promise<T>((resolve) => {
      const request = store.get(key)
      request.onsuccess = () => {
        const result = request.result as { id: string; value: T } | undefined
        resolve(result?.value ?? fallback)
      }
      request.onerror = () => resolve(fallback)
    })
  } catch {
    return fallback
  }
}

/**
 * Write a value to IndexedDB. Fails silently if IndexedDB is unavailable.
 */
export async function setIndexedValue<T>(
  dbName: string,
  key: string,
  value: T,
): Promise<void> {
  try {
    const db = await openDb(dbName)
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    store.put({ id: key, value })

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    // IndexedDB unavailable — fail silently
  }
}

/**
 * Delete a value from IndexedDB. Fails silently if IndexedDB is unavailable.
 */
export async function deleteIndexedValue(
  dbName: string,
  key: string,
): Promise<void> {
  try {
    const db = await openDb(dbName)
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).delete(key)

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    // Fail silently
  }
}
