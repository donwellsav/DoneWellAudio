// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Advisory } from '@/types/advisory'
import type { PA2Settings } from '@/types/pa2'

const { loadMock, saveMock } = vi.hoisted(() => ({
  loadMock: vi.fn(),
  saveMock: vi.fn(),
}))

vi.mock('@/lib/pa2/pa2Storage', () => ({
  pa2Storage: {
    load: loadMock,
    save: saveMock,
  },
}))

import { DEFAULT_PA2_SETTINGS } from '@/types/pa2'
import { createPA2BridgeConfig, usePA2SettingsState } from '../usePA2SettingsState'

function makeAdvisory(overrides: Partial<Advisory> = {}): Advisory {
  return {
    id: 'adv-1',
    trackId: 'track-1',
    timestamp: Date.now(),
    label: 'ACOUSTIC_FEEDBACK',
    severity: 'GROWING',
    confidence: 0.8,
    why: ['test'],
    trueFrequencyHz: 1000,
    trueAmplitudeDb: -20,
    prominenceDb: 12,
    qEstimate: 4,
    bandwidthHz: 250,
    velocityDbPerSec: 1,
    stabilityCentsStd: 0,
    harmonicityScore: 0,
    modulationScore: 0,
    advisory: {
      geq: { bandHz: 1000, bandIndex: 15, suggestedDb: -6 },
      peq: { type: 'bell', hz: 1000, q: 4, gainDb: -6 },
      shelves: [],
      pitch: { note: 'B', octave: 5, cents: 0, midi: 83 },
    },
    ...overrides,
  } as Advisory
}

describe('usePA2SettingsState', () => {
  beforeEach(() => {
    loadMock.mockReset()
    saveMock.mockReset()
    loadMock.mockReturnValue(DEFAULT_PA2_SETTINGS)
  })

  it('loads persisted settings once and persists updates', () => {
    const { result } = renderHook(() => usePA2SettingsState([]))

    expect(loadMock).toHaveBeenCalledTimes(1)
    expect(result.current.settings).toEqual(DEFAULT_PA2_SETTINGS)

    act(() => {
      result.current.updateSettings({
        enabled: true,
        baseUrl: 'http://localhost:8000/instance/PA2',
      })
    })

    expect(saveMock).toHaveBeenCalledTimes(1)
    expect(saveMock).toHaveBeenCalledWith({
      ...DEFAULT_PA2_SETTINGS,
      enabled: true,
      baseUrl: 'http://localhost:8000/instance/PA2',
    })
  })

  it('derives active bridge config only when the bridge is enabled and configured', () => {
    const settings: PA2Settings = {
      ...DEFAULT_PA2_SETTINGS,
      enabled: true,
      baseUrl: 'http://localhost:8000/instance/PA2',
      autoSend: 'geq',
      autoSendMinConfidence: 0.75,
      panicMuteEnabled: true,
    }
    const advisories = [makeAdvisory()]

    const { isActive, bridgeConfig } = createPA2BridgeConfig(settings, advisories)

    expect(isActive).toBe(true)
    expect(bridgeConfig).toMatchObject({
      baseUrl: settings.baseUrl,
      autoSend: 'geq',
      autoSendMinConfidence: 0.75,
      enabled: true,
      panicMuteEnabled: true,
      advisories,
    })
  })

  it('forces autoSend off and strips advisories when inactive', () => {
    const advisories = [makeAdvisory()]

    const { isActive, bridgeConfig } = createPA2BridgeConfig(
      {
        ...DEFAULT_PA2_SETTINGS,
        enabled: true,
        baseUrl: '',
        autoSend: 'both',
      },
      advisories,
    )

    expect(isActive).toBe(false)
    expect(bridgeConfig.enabled).toBe(false)
    expect(bridgeConfig.autoSend).toBe('off')
    expect(bridgeConfig.advisories).toEqual([])
  })
})
