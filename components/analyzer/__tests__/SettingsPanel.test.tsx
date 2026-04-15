// @vitest-environment jsdom

import { type PropsWithChildren, type ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsPanel } from '@/components/analyzer/settings/SettingsPanel'
import { deriveDefaultDetectorSettings } from '@/lib/settings/defaultDetectorSettings'

const { mockUseSettingsPanelState } = vi.hoisted(() => ({
  mockUseSettingsPanelState: vi.fn(),
}))

vi.mock('@/hooks/useSettingsPanelState', () => ({
  useSettingsPanelState: () => mockUseSettingsPanelState(),
}))

vi.mock('@/components/analyzer/settings/LiveTab', () => ({
  LiveTab: () => <div>Live tab content</div>,
}))

vi.mock('@/components/analyzer/settings/SetupTab', () => ({
  SetupTab: () => <div>Setup tab content</div>,
}))

vi.mock('@/components/analyzer/settings/DisplayTab', () => ({
  DisplayTab: () => <div>Display tab content</div>,
}))

vi.mock('@/components/analyzer/settings/AdvancedTab', () => ({
  AdvancedTab: () => <div>Advanced tab content</div>,
}))

vi.mock('@/components/analyzer/ResetConfirmDialog', () => ({
  ResetConfirmDialog: ({ trigger }: { trigger: ReactNode }) => <>{trigger}</>,
}))

vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: PropsWithChildren<{ delayDuration?: number }>) => <>{children}</>,
}))

describe('SettingsPanel', () => {
  beforeEach(() => {
    mockUseSettingsPanelState.mockReset()
  })

  it('renders tab semantics and routes tab changes through the panel state hook', () => {
    const setActiveTab = vi.fn()

    mockUseSettingsPanelState.mockReturnValue({
      activeTab: 'live',
      setActiveTab,
      customPresets: [],
      canSavePreset: false,
      showSaveInput: false,
      setShowSaveInput: vi.fn(),
      presetName: '',
      setPresetName: vi.fn(),
      handleSavePreset: vi.fn(),
      handleDeletePreset: vi.fn(),
      handleLoadPreset: vi.fn(),
      hasCustomGates: true,
      updateDisplay: vi.fn(),
      resetSettings: vi.fn(),
    })

    render(<SettingsPanel settings={deriveDefaultDetectorSettings('speech')} />)

    expect(screen.getByRole('tablist', { name: 'Settings tabs' })).toBeDefined()
    expect(screen.getAllByRole('tab')).toHaveLength(4)

    fireEvent.mouseDown(screen.getByRole('tab', { name: /setup/i }), { button: 0 })

    expect(setActiveTab).toHaveBeenCalledWith('setup')
  })
})
