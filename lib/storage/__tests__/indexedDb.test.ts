/**
 * Tests for indexedDb.ts — generic IndexedDB key-value helpers.
 *
 * Since Vitest's jsdom environment doesn't include a real IndexedDB
 * implementation, these tests verify the SSR/unavailability fallback paths.
 * The IDB-available happy paths are covered indirectly by
 * feedbackHistoryStorage integration tests.
 */

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'

// Ensure indexedDB is undefined to test fallback paths
const originalIndexedDB = globalThis.indexedDB
beforeEach(() => {
  // Remove indexedDB from globalThis to simulate SSR / restricted environments
  Object.defineProperty(globalThis, 'indexedDB', { value: undefined, configurable: true })
})

// Must import AFTER setting up the mock — dynamic import ensures fresh module
async function loadModule() {
  // Clear module cache to get fresh connectionCache per test
  vi.resetModules()
  return import('../indexedDb')
}

describe('indexedDb — SSR / IDB unavailable fallbacks', () => {
  it('getIndexedValue returns fallback when indexedDB is undefined', async () => {
    const { getIndexedValue } = await loadModule()
    const result = await getIndexedValue('test-db', 'key', 'fallback-value')
    expect(result).toBe('fallback-value')
  })

  it('getIndexedValue returns fallback with complex types', async () => {
    const { getIndexedValue } = await loadModule()
    const fallback = { items: [1, 2, 3], nested: { ok: true } }
    const result = await getIndexedValue('test-db', 'key', fallback)
    expect(result).toEqual(fallback)
  })

  it('setIndexedValue silently succeeds when indexedDB is undefined', async () => {
    const { setIndexedValue } = await loadModule()
    // Should not throw
    await expect(setIndexedValue('test-db', 'key', { data: 42 })).resolves.toBeUndefined()
  })

  it('deleteIndexedValue silently succeeds when indexedDB is undefined', async () => {
    const { deleteIndexedValue } = await loadModule()
    // Should not throw
    await expect(deleteIndexedValue('test-db', 'key')).resolves.toBeUndefined()
  })

  it('does not cache rejected promises when indexedDB is unavailable', async () => {
    const { getIndexedValue } = await loadModule()

    // First call — fails, should NOT cache the rejection
    const result1 = await getIndexedValue('test-db', 'key', 'fallback-1')
    expect(result1).toBe('fallback-1')

    // Second call — should also fail gracefully (not return a cached rejection)
    const result2 = await getIndexedValue('test-db', 'key', 'fallback-2')
    expect(result2).toBe('fallback-2')
  })
})

// Restore indexedDB for other test files
afterAll(() => {
  if (originalIndexedDB) {
    Object.defineProperty(globalThis, 'indexedDB', { value: originalIndexedDB, configurable: true })
  }
})
