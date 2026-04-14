// @vitest-environment jsdom
/**
 * Tests for dwaStorage.ts — typed localStorage abstraction.
 *
 * Covers three factory functions (typedStorage, stringStorage, flagStorage),
 * domain accessors, and the clearPanelLayouts utility.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  typedStorage,
  stringStorage,
  flagStorage,
  clearPanelLayouts,
} from '../dwaStorage'

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  localStorage.clear()
})

// ── typedStorage ──────────────────────────────────────────────────────────────

describe('typedStorage', () => {
  it('returns fallback when key does not exist', () => {
    const store = typedStorage<number[]>('test-typed', [1, 2, 3])
    expect(store.load()).toEqual([1, 2, 3])
  })

  it('round-trips JSON save/load', () => {
    const store = typedStorage<{ name: string; count: number }>('test-typed-obj', { name: '', count: 0 })
    store.save({ name: 'feedback', count: 42 })
    expect(store.load()).toEqual({ name: 'feedback', count: 42 })
  })

  it('clear removes the key and load returns fallback', () => {
    const store = typedStorage<string>('test-clear', 'default')
    store.save('stored')
    expect(store.load()).toBe('stored')
    store.clear()
    expect(store.load()).toBe('default')
  })

  it('returns fallback when stored JSON is corrupt', () => {
    localStorage.setItem('test-corrupt', '{invalid json!!!}')
    const store = typedStorage<number>('test-corrupt', 99)
    expect(store.load()).toBe(99)
  })

  it('silently handles QuotaExceededError on save', () => {
    const store = typedStorage<string>('test-quota', '')
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError')
    })
    // Should not throw
    expect(() => store.save('big data')).not.toThrow()
    vi.restoreAllMocks()
  })
})

// ── stringStorage ─────────────────────────────────────────────────────────────

describe('stringStorage', () => {
  it('returns empty string fallback by default', () => {
    const store = stringStorage('test-str')
    expect(store.load()).toBe('')
  })

  it('returns custom fallback when key is missing', () => {
    const store = stringStorage('test-str-custom', 'default-device')
    expect(store.load()).toBe('default-device')
  })

  it('stores raw string without JSON wrapping', () => {
    const store = stringStorage('test-str-raw')
    store.save('device-id-123')
    // Raw value in localStorage — no JSON quotes
    expect(localStorage.getItem('test-str-raw')).toBe('device-id-123')
    expect(store.load()).toBe('device-id-123')
  })

  it('clear removes key', () => {
    const store = stringStorage('test-str-clear')
    store.save('value')
    store.clear()
    expect(store.load()).toBe('')
  })
})

// ── flagStorage ───────────────────────────────────────────────────────────────

describe('flagStorage', () => {
  it('isSet returns false when key does not exist', () => {
    const flag = flagStorage('test-flag')
    expect(flag.isSet()).toBe(false)
  })

  it('set makes isSet return true', () => {
    const flag = flagStorage('test-flag-set')
    flag.set()
    expect(flag.isSet()).toBe(true)
  })

  it('clear makes isSet return false again', () => {
    const flag = flagStorage('test-flag-cycle')
    flag.set()
    expect(flag.isSet()).toBe(true)
    flag.clear()
    expect(flag.isSet()).toBe(false)
  })

  it('stores the string "true" as the value', () => {
    const flag = flagStorage('test-flag-value')
    flag.set()
    expect(localStorage.getItem('test-flag-value')).toBe('true')
  })
})

// ── clearPanelLayouts ─────────────────────────────────────────────────────────

describe('clearPanelLayouts', () => {
  it('removes all known panel layout keys', () => {
    const keys = [
      'react-resizable-panels:dwa-layout-main',
      'react-resizable-panels:dwa-layout-main-v2',
      'react-resizable-panels:dwa-layout-main-v3',
      'react-resizable-panels:dwa-layout-main-v4',
      'react-resizable-panels:dwa-layout-vertical',
      'react-resizable-panels:dwa-layout-bottom',
    ]
    keys.forEach(k => localStorage.setItem(k, 'data'))
    clearPanelLayouts()
    keys.forEach(k => expect(localStorage.getItem(k)).toBeNull())
  })

  it('does not remove unrelated keys', () => {
    localStorage.setItem('other-key', 'keep me')
    clearPanelLayouts()
    expect(localStorage.getItem('other-key')).toBe('keep me')
  })
})
