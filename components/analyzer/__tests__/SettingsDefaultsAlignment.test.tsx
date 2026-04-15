// @vitest-environment jsdom

import { type PropsWithChildren } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DisplayTab } from '@/components/analyzer/settings/DisplayTab'
import { SetupTab } from '@/components/analyzer/settings/SetupTab'
import {
  AdvancedDetectionPolicySection,
} from '@/components/analyzer/settings/advancedSections/AdvancedDetectionSections'
import { AdvancedTrackManagementSection } from '@/components/analyzer/settings/advancedSections/AdvancedEngineSections'
import { deriveDefaultDetectorSettings } from '@/lib/settings/defaultDetectorSettings'

const { mockUseSettings, mockUseSetupTabExport } = vi.hoisted(() => ({
  mockUseSettings: vi.fn(),
  mockUseSetupTabExport: vi.fn(),
}))

function slug(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

interface MockSliderProps {
  label: string
  defaultValue?: number
  onResetToDefault?: () => void
}

interface SectionProps extends PropsWithChildren {
  title?: string
}

vi.mock('@/components/ui/console-slider', () => ({
  ConsoleSlider: ({ label, defaultValue, onResetToDefault }: MockSliderProps) => (
    <div
      data-testid={`slider-${slug(label)}`}
      data-default-value={defaultValue != null ? String(defaultValue) : ''}
    >
      <span>{label}</span>
      {onResetToDefault ? (
        <button
          type="button"
          aria-label={`reset-${slug(label)}`}
          onClick={onResetToDefault}
        >
          reset
        </button>
      ) : null}
    </div>
  ),
}))

vi.mock('@/components/ui/led-toggle', () => ({
  LEDToggle: ({ label }: { label: string }) => <div>{label}</div>,
}))

vi.mock('@/components/ui/channel-section', () => ({
  ChannelSection: ({ title, children }: SectionProps) => (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  ),
}))

vi.mock('@/components/analyzer/settings/SettingsShared', () => ({
  Section: ({ title, children }: SectionProps) => (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  ),
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: PropsWithChildren<Record<string, unknown>>) => (
    <button type="button" {...props}>{children}</button>
  ),
}))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: PropsWithChildren) => <>{children}</>,
  TooltipTrigger: ({ children }: PropsWithChildren) => <>{children}</>,
  TooltipContent: ({ children }: PropsWithChildren) => <>{children}</>,
}))

vi.mock('@/components/analyzer/settings/RoomTab', () => ({
  RoomTab: () => <div>Room tab</div>,
}))

vi.mock('@/components/analyzer/settings/RigPresetsSection', () => ({
  RigPresetsSection: () => <div>Rig presets</div>,
}))

vi.mock('@/components/analyzer/settings/SessionExportSection', () => ({
  SessionExportSection: () => <div>Session export</div>,
}))

vi.mock('@/components/analyzer/settings/CalibrationTab', () => ({
  CalibrationTab: () => <div>Calibration</div>,
}))

vi.mock('@/hooks/useSetupTabExport', () => ({
  useSetupTabExport: () => mockUseSetupTabExport(),
}))

vi.mock('@/contexts/SettingsContext', () => ({
  useSettings: () => mockUseSettings(),
}))

function buildAdvancedActions() {
  return {
    updateDisplayField: vi.fn(),
    updateDiagnosticField: vi.fn(),
    toggleAlgorithmMode: vi.fn(),
    toggleAlgorithm: vi.fn(),
    handleCollectionToggle: vi.fn(),
  }
}

describe('settings default alignment', () => {
  beforeEach(() => {
    mockUseSetupTabExport.mockReturnValue({
      metadata: {},
      isExporting: false,
      updateMetadata: vi.fn(),
      handleExportTxt: vi.fn(),
      handleExportCSV: vi.fn(),
      handleExportJSON: vi.fn(),
      handleExportPdf: vi.fn(),
    })
  })

  it('uses the canonical Canvas FPS display default', () => {
    render(
      <DisplayTab
        settings={deriveDefaultDetectorSettings('speech')}
        updateDisplay={vi.fn()}
      />,
    )

    expect(screen.getByTestId('slider-canvas-fps').dataset.defaultValue).toBe('30')
  })

  it('resets mode-owned detection overrides back to the active mode baseline', () => {
    const actions = buildAdvancedActions()

    render(
      <AdvancedDetectionPolicySection
        settings={deriveDefaultDetectorSettings('liveMusic')}
        actions={actions}
      />,
    )

    expect(screen.getByTestId('slider-ring').dataset.defaultValue).toBe('8')

    fireEvent.click(screen.getByRole('button', { name: 'reset-ring' }))

    expect(actions.updateDiagnosticField).toHaveBeenCalledWith('ringThresholdDbOverride', undefined)
  })

  it('resets track timeout to mode-default instead of freezing a numeric override', () => {
    const actions = buildAdvancedActions()

    render(
      <AdvancedTrackManagementSection
        settings={deriveDefaultDetectorSettings('monitors')}
        actions={actions}
      />,
    )

    expect(screen.getByTestId('slider-track-timeout').dataset.defaultValue).toBe('500')

    fireEvent.click(screen.getByRole('button', { name: 'reset-track-timeout' }))

    expect(actions.updateDiagnosticField).toHaveBeenCalledWith('trackTimeoutMs', 'mode-default')
  })

  it('shows the mode-derived auto-gain target and resets via the live override sentinel', () => {
    const setMode = vi.fn()
    const setEqStyle = vi.fn()
    const setAutoGain = vi.fn()

    mockUseSettings.mockReturnValue({
      session: { modeId: 'ringOut' },
      setMode,
      setEqStyle,
      setAutoGain,
    })

    render(
      <SetupTab
        settings={{ ...deriveDefaultDetectorSettings('ringOut'), autoGainEnabled: true }}
        customPresets={[]}
        canSavePreset={false}
        showSaveInput={false}
        setShowSaveInput={vi.fn()}
        presetName=""
        setPresetName={vi.fn()}
        handleSavePreset={vi.fn()}
        handleDeletePreset={vi.fn()}
        handleLoadPreset={vi.fn()}
      />,
    )

    expect(screen.getByTestId('slider-ag-target').dataset.defaultValue).toBe('-12')

    fireEvent.click(screen.getByRole('button', { name: 'reset-ag-target' }))

    expect(setAutoGain).toHaveBeenCalledWith(true, -18)
  })

  it('uses the shared toggle-group control for the two-option EQ style selector', () => {
    const setMode = vi.fn()
    const setEqStyle = vi.fn()
    const setAutoGain = vi.fn()

    mockUseSettings.mockReturnValue({
      session: { modeId: 'speech' },
      setMode,
      setEqStyle,
      setAutoGain,
    })

    render(
      <SetupTab
        settings={deriveDefaultDetectorSettings('speech')}
        customPresets={[]}
        canSavePreset={false}
        showSaveInput={false}
        setShowSaveInput={vi.fn()}
        presetName=""
        setPresetName={vi.fn()}
        handleSavePreset={vi.fn()}
        handleDeletePreset={vi.fn()}
        handleLoadPreset={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('radio', { name: 'Heavy' }))

    expect(setEqStyle).toHaveBeenCalledWith('heavy')
  })
})
