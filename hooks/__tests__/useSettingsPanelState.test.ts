// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSettingsPanelState } from '@/hooks/useSettingsPanelState'

const mockUseSettings = vi.fn()
const mockUseRigPresets = vi.fn()

vi.mock('@/contexts/SettingsContext', () => ({
  useSettings: () => mockUseSettings(),
}))

vi.mock('@/hooks/useRigPresets', () => ({
  useRigPresets: (...args: unknown[]) => mockUseRigPresets(...args),
}))

describe('useSettingsPanelState', () => {
  beforeEach(() => {
    mockUseSettings.mockReset()
    mockUseRigPresets.mockReset()

    mockUseSettings.mockReturnValue({
      session: {
        diagnostics: {},
      },
      setMode: vi.fn(),
      setEnvironment: vi.fn(),
      updateLiveOverrides: vi.fn(),
      updateDiagnostics: vi.fn(),
      updateDisplay: vi.fn(),
      resetSettings: vi.fn(),
    })

    mockUseRigPresets.mockReturnValue({
      presets: [{ id: 'preset-1', name: 'Sunday AM' }],
      canSave: true,
      savePreset: vi.fn(),
      deletePreset: vi.fn(),
      loadPreset: vi.fn(),
    })
  })

  it('manages uncontrolled tab state and preset save flow', () => {
    const { result } = renderHook(() => useSettingsPanelState({}))

    expect(result.current.activeTab).toBe('live')
    expect(result.current.customPresets).toEqual([{ id: 'preset-1', name: 'Sunday AM' }])

    act(() => {
      result.current.setActiveTab('display')
      result.current.setShowSaveInput(true)
      result.current.setPresetName('  Main Room  ')
    })

    expect(result.current.activeTab).toBe('display')
    expect(result.current.showSaveInput).toBe(true)

    act(() => {
      result.current.handleSavePreset()
    })

    const rigPresets = mockUseRigPresets.mock.results[0]?.value as {
      savePreset: ReturnType<typeof vi.fn>
    }

    expect(rigPresets.savePreset).toHaveBeenCalledWith('Main Room')
    expect(result.current.presetName).toBe('')
    expect(result.current.showSaveInput).toBe(false)
  })

  it('delegates tab changes in controlled mode', () => {
    const onTabChange = vi.fn()

    const { result } = renderHook(() => useSettingsPanelState({
      activeTab: 'advanced',
      onTabChange,
    }))

    expect(result.current.activeTab).toBe('advanced')

    act(() => {
      result.current.setActiveTab('setup')
    })

    expect(onTabChange).toHaveBeenCalledWith('setup')
    expect(result.current.activeTab).toBe('advanced')
  })

  it('reports when custom gate overrides are active', () => {
    mockUseSettings.mockReturnValue({
      session: {
        diagnostics: {
          chromaticGateOverride: 0.5,
        },
      },
      setMode: vi.fn(),
      setEnvironment: vi.fn(),
      updateLiveOverrides: vi.fn(),
      updateDiagnostics: vi.fn(),
      updateDisplay: vi.fn(),
      resetSettings: vi.fn(),
    })

    const { result } = renderHook(() => useSettingsPanelState({}))

    expect(result.current.hasCustomGates).toBe(true)
  })
})
