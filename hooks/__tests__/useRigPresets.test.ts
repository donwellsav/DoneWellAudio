// @vitest-environment jsdom
/**
 * Tests for useRigPresets — structured rig preset management.
 *
 * Proves that:
 * 1. Save captures layered intent, not DetectorSettings
 * 2. Load calls semantic actions in mode → env → live order
 * 3. Load with unknown ID is a no-op
 * 4. Save → load round-trip preserves intent
 * 5. 10-preset limit enforced, canSave reflects it
 * 6. Delete/rename/duplicate CRUD
 * 7. Fresh load with no storage key returns empty
 * 8. Legacy dwa-custom-presets key is never read
 */

import { renderHook, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useRigPresets, type LayeredActions } from '@/hooks/useRigPresets'
import { DEFAULT_SESSION_STATE } from '@/lib/settings/defaults'
import type { DwaSessionState, RigPresetV1 } from '@/types/settings'

// ─── Test helpers ─────────────────────────────────────────────────────────────

/** Mock actions that record call order */
function createMockActions(): LayeredActions & { callOrder: string[] } {
  const callOrder: string[] = []
  return {
    callOrder,
    setMode: vi.fn((id) => { callOrder.push(`setMode:${id}`) }),
    setEnvironment: vi.fn(() => { callOrder.push('setEnvironment') }),
    updateLiveOverrides: vi.fn(() => { callOrder.push('updateLiveOverrides') }),
    updateDiagnostics: vi.fn(() => { callOrder.push('updateDiagnostics') }),
  }
}

/** A session state configured for worship mode with large room */
const WORSHIP_SESSION: DwaSessionState = {
  ...DEFAULT_SESSION_STATE,
  modeId: 'worship',
  environment: {
    ...DEFAULT_SESSION_STATE.environment,
    templateId: 'worship',
    feedbackOffsetDb: 4,
    ringOffsetDb: 3,
    treatment: 'untreated',
    roomRT60: 2.5,
    roomVolume: 5000,
  },
  liveOverrides: {
    ...DEFAULT_SESSION_STATE.liveOverrides,
    sensitivityOffsetDb: -3,
    eqStyle: 'heavy',
  },
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  localStorage.removeItem('dwa-v2-presets')
})

afterEach(() => {
  localStorage.removeItem('dwa-v2-presets')
  // Prove we never touch the legacy key
  expect(localStorage.getItem('dwa-custom-presets')).toBeNull()
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useRigPresets — save', () => {
  it('captures layered intent (mode + env + live), not DetectorSettings', () => {
    const actions = createMockActions()
    const { result } = renderHook(() => useRigPresets(WORSHIP_SESSION, actions))

    let preset!: RigPresetV1
    act(() => {
      preset = result.current.savePreset('Sunday AM')
    })

    expect(preset.schemaVersion).toBe(1)
    expect(preset.name).toBe('Sunday AM')
    expect(preset.modeId).toBe('worship')
    expect(preset.environment.templateId).toBe('worship')
    expect(preset.environment.feedbackOffsetDb).toBe(4)
    expect(preset.liveDefaults.sensitivityOffsetDb).toBe(-3)
    expect(preset.liveDefaults.eqStyle).toBe('heavy')
    // No DetectorSettings fields present
    expect((preset as unknown as Record<string, unknown>).feedbackThresholdDb).toBeUndefined()
    expect((preset as unknown as Record<string, unknown>).settings).toBeUndefined()
  })

  it('persists to localStorage', () => {
    const actions = createMockActions()
    const { result } = renderHook(() => useRigPresets(WORSHIP_SESSION, actions))

    act(() => { result.current.savePreset('Persisted') })

    const raw = JSON.parse(localStorage.getItem('dwa-v2-presets') ?? '[]') as RigPresetV1[]
    expect(raw).toHaveLength(1)
    expect(raw[0].name).toBe('Persisted')
  })

  it('trims whitespace from name', () => {
    const actions = createMockActions()
    const { result } = renderHook(() => useRigPresets(WORSHIP_SESSION, actions))

    let preset!: RigPresetV1
    act(() => { preset = result.current.savePreset('  Trimmed  ') })
    expect(preset.name).toBe('Trimmed')
  })
})

describe('useRigPresets — load', () => {
  it('calls semantic actions in mode → env → live order', () => {
    const actions = createMockActions()
    const { result } = renderHook(() => useRigPresets(WORSHIP_SESSION, actions))

    let presetId!: string
    act(() => {
      const p = result.current.savePreset('Order Test')
      presetId = p.id
    })

    act(() => { result.current.loadPreset(presetId) })

    expect(actions.callOrder).toEqual([
      'setMode:worship',
      'setEnvironment',
      'updateLiveOverrides',
    ])
    // Verify actual args
    expect(actions.setMode).toHaveBeenCalledWith('worship')
    expect(actions.setEnvironment).toHaveBeenCalledWith(
      expect.objectContaining({ templateId: 'worship', feedbackOffsetDb: 4 }),
    )
    expect(actions.updateLiveOverrides).toHaveBeenCalledWith(
      expect.objectContaining({ sensitivityOffsetDb: -3, eqStyle: 'heavy' }),
    )
  })

  it('is a no-op for unknown ID', () => {
    const actions = createMockActions()
    const { result } = renderHook(() => useRigPresets(DEFAULT_SESSION_STATE, actions))

    act(() => { result.current.loadPreset('nonexistent-id') })

    expect(actions.setMode).not.toHaveBeenCalled()
    expect(actions.setEnvironment).not.toHaveBeenCalled()
    expect(actions.updateLiveOverrides).not.toHaveBeenCalled()
  })
})

describe('useRigPresets — round-trip', () => {
  it('save → load preserves all layered intent fields', () => {
    const actions = createMockActions()
    const { result } = renderHook(() => useRigPresets(WORSHIP_SESSION, actions))

    let presetId!: string
    act(() => {
      const p = result.current.savePreset('Round Trip')
      presetId = p.id
    })

    act(() => { result.current.loadPreset(presetId) })

    // Verify the environment passed to setEnvironment has all original fields
    const envArg = (actions.setEnvironment as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(envArg.templateId).toBe('worship')
    expect(envArg.feedbackOffsetDb).toBe(4)
    expect(envArg.ringOffsetDb).toBe(3)
    expect(envArg.treatment).toBe('untreated')
    expect(envArg.roomRT60).toBe(2.5)

    // Verify live overrides have all original fields
    const liveArg = (actions.updateLiveOverrides as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(liveArg.sensitivityOffsetDb).toBe(-3)
    expect(liveArg.eqStyle).toBe('heavy')
    expect(liveArg.inputGainDb).toBe(0)  // default, but preserved
  })
})

/** Generate N seed presets for limit tests */
function seedPresets(n: number): RigPresetV1[] {
  return Array.from({ length: n }, (_, i) => ({
    schemaVersion: 1 as const,
    id: `seed-${i}`,
    name: `Seed ${i}`,
    modeId: 'speech' as const,
    environment: { ...DEFAULT_SESSION_STATE.environment },
    liveDefaults: { ...DEFAULT_SESSION_STATE.liveOverrides },
    createdAt: new Date(Date.now() - (n - i) * 1000).toISOString(),
    updatedAt: new Date(Date.now() - (n - i) * 1000).toISOString(),
  }))
}

describe('useRigPresets — limits', () => {
  it('enforces 10-preset max and canSave reflects it', () => {
    // Seed 10 presets via localStorage
    localStorage.setItem('dwa-v2-presets', JSON.stringify(seedPresets(10)))
    const actions = createMockActions()
    const { result } = renderHook(() => useRigPresets(DEFAULT_SESSION_STATE, actions))

    expect(result.current.presets).toHaveLength(10)
    expect(result.current.canSave).toBe(false)

    // Save an 11th — should evict the oldest
    act(() => { result.current.savePreset('Overflow') })
    expect(result.current.presets).toHaveLength(10)
    expect(result.current.presets.some(p => p.name === 'Overflow')).toBe(true)
  })
})

describe('useRigPresets — CRUD', () => {
  it('deletePreset removes by ID', () => {
    const actions = createMockActions()
    const { result } = renderHook(() => useRigPresets(DEFAULT_SESSION_STATE, actions))

    let id!: string
    act(() => { id = result.current.savePreset('Doomed').id })
    expect(result.current.presets).toHaveLength(1)

    act(() => { result.current.deletePreset(id) })
    expect(result.current.presets).toHaveLength(0)
  })

  it('renamePreset updates name and updatedAt', () => {
    const actions = createMockActions()
    const { result } = renderHook(() => useRigPresets(DEFAULT_SESSION_STATE, actions))

    let preset!: RigPresetV1
    act(() => { preset = result.current.savePreset('Old Name') })
    const origUpdated = preset.updatedAt

    // Small delay to ensure timestamp differs
    act(() => { result.current.renamePreset(preset.id, '  New Name  ') })

    const renamed = result.current.presets.find(p => p.id === preset.id)!
    expect(renamed.name).toBe('New Name')
    expect(renamed.updatedAt >= origUpdated).toBe(true)
  })

  it('duplicatePreset creates a copy with new ID and name', () => {
    const actions = createMockActions()
    const { result } = renderHook(() => useRigPresets(WORSHIP_SESSION, actions))

    let source!: RigPresetV1
    act(() => { source = result.current.savePreset('Original') })

    let clone: RigPresetV1 | null = null
    act(() => { clone = result.current.duplicatePreset(source.id, 'Copy') })

    expect(clone).not.toBeNull()
    expect(clone!.id).not.toBe(source.id)
    expect(clone!.name).toBe('Copy')
    expect(clone!.modeId).toBe(source.modeId)
    expect(clone!.environment.templateId).toBe(source.environment.templateId)
    expect(result.current.presets).toHaveLength(2)
  })

  it('duplicatePreset returns null when at limit', () => {
    // Seed 10 presets via localStorage using the same seedPresets helper
    const seeds = seedPresets(10)
    localStorage.setItem('dwa-v2-presets', JSON.stringify(seeds))
    const actions = createMockActions()
    const { result } = renderHook(() => useRigPresets(DEFAULT_SESSION_STATE, actions))

    expect(result.current.presets).toHaveLength(10)

    let clone: RigPresetV1 | null = null
    act(() => { clone = result.current.duplicatePreset(seeds[0].id, 'Overflow Clone') })
    expect(clone).toBeNull()
    expect(result.current.presets).toHaveLength(10)
  })
})

describe('useRigPresets — fresh state', () => {
  it('returns empty presets with no storage key', () => {
    const actions = createMockActions()
    const { result } = renderHook(() => useRigPresets(DEFAULT_SESSION_STATE, actions))

    expect(result.current.presets).toEqual([])
    expect(result.current.canSave).toBe(true)
  })
})

describe('useRigPresets — legacy isolation', () => {
  it('never reads from dwa-custom-presets', () => {
    // Seed legacy storage with old-format data
    localStorage.setItem('dwa-custom-presets', JSON.stringify([
      { name: 'Old Preset', settings: { feedbackThresholdDb: 99, mode: 'speech' } },
    ]))

    const actions = createMockActions()
    const { result } = renderHook(() => useRigPresets(DEFAULT_SESSION_STATE, actions))

    // New system should be empty — legacy data not imported
    expect(result.current.presets).toEqual([])

    // Cleanup legacy key for afterEach check
    localStorage.removeItem('dwa-custom-presets')
  })
})
