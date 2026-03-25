// @vitest-environment jsdom
/**
 * Tests for the v2 settings storage layer.
 *
 * Verifies that each storage accessor loads defaults, saves/loads round-trips,
 * and clears correctly. Uses the same patterns as the existing dwaStorage tests.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_DISPLAY_PREFS, DEFAULT_SESSION_STATE } from '@/lib/settings/defaults'
import {
  displayStorageV2,
  presetsStorageV2,
  sessionStorageV2,
  startupStorageV2,
} from '@/lib/storage/settingsStorageV2'
import type { DwaSessionState, RigPresetV1 } from '@/types/settings'

// Clean up after each test
afterEach(() => {
  localStorage.removeItem('dwa-v2-session')
  localStorage.removeItem('dwa-v2-display')
  localStorage.removeItem('dwa-v2-presets')
  localStorage.removeItem('dwa-v2-startup')
})

describe('sessionStorageV2', () => {
  it('returns DEFAULT_SESSION_STATE when no saved data', () => {
    const loaded = sessionStorageV2.load()
    expect(loaded).toEqual(DEFAULT_SESSION_STATE)
  })

  it('round-trips session state', () => {
    const custom: DwaSessionState = {
      ...DEFAULT_SESSION_STATE,
      modeId: 'liveMusic',
      liveOverrides: {
        ...DEFAULT_SESSION_STATE.liveOverrides,
        sensitivityOffsetDb: 5,
      },
    }
    sessionStorageV2.save(custom)
    const loaded = sessionStorageV2.load()
    expect(loaded.modeId).toBe('liveMusic')
    expect(loaded.liveOverrides.sensitivityOffsetDb).toBe(5)
  })

  it('clear resets to default', () => {
    sessionStorageV2.save({ ...DEFAULT_SESSION_STATE, modeId: 'worship' })
    sessionStorageV2.clear()
    expect(sessionStorageV2.load()).toEqual(DEFAULT_SESSION_STATE)
  })
})

describe('displayStorageV2', () => {
  it('returns DEFAULT_DISPLAY_PREFS when no saved data', () => {
    expect(displayStorageV2.load()).toEqual(DEFAULT_DISPLAY_PREFS)
  })

  it('round-trips display prefs', () => {
    const custom = { ...DEFAULT_DISPLAY_PREFS, graphFontSize: 22, showFreqZones: true }
    displayStorageV2.save(custom)
    const loaded = displayStorageV2.load()
    expect(loaded.graphFontSize).toBe(22)
    expect(loaded.showFreqZones).toBe(true)
  })
})

describe('presetsStorageV2', () => {
  it('returns empty array when no saved presets', () => {
    expect(presetsStorageV2.load()).toEqual([])
  })

  it('round-trips presets', () => {
    const preset: RigPresetV1 = {
      schemaVersion: 1,
      id: 'test-1',
      name: 'My Speech Preset',
      modeId: 'speech',
      environment: DEFAULT_SESSION_STATE.environment,
      liveDefaults: DEFAULT_SESSION_STATE.liveOverrides,
      createdAt: '2026-03-25T00:00:00Z',
      updatedAt: '2026-03-25T00:00:00Z',
    }
    presetsStorageV2.save([preset])
    const loaded = presetsStorageV2.load()
    expect(loaded).toHaveLength(1)
    expect(loaded[0].name).toBe('My Speech Preset')
    expect(loaded[0].schemaVersion).toBe(1)
  })
})

describe('startupStorageV2', () => {
  it('returns empty object when no saved preference', () => {
    expect(startupStorageV2.load()).toEqual({})
  })

  it('round-trips startup preference', () => {
    startupStorageV2.save({ presetId: 'test-1' })
    expect(startupStorageV2.load().presetId).toBe('test-1')
  })
})

describe('v2 keys do not conflict with v1 keys', () => {
  it('v2 session key is distinct from v1 defaults key', () => {
    // Write to both v1 and v2 keys
    localStorage.setItem('dwa-custom-defaults', JSON.stringify({ mode: 'worship' }))
    sessionStorageV2.save({ ...DEFAULT_SESSION_STATE, modeId: 'liveMusic' })

    // Each reads its own key
    const v1 = JSON.parse(localStorage.getItem('dwa-custom-defaults') ?? '{}')
    const v2 = sessionStorageV2.load()

    expect(v1.mode).toBe('worship')
    expect(v2.modeId).toBe('liveMusic')

    localStorage.removeItem('dwa-custom-defaults')
  })
})
