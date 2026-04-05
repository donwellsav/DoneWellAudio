import { describe, expect, it } from 'vitest'
import {
  buildCompanionSettingsUpdate,
  getPA2AutoSendSummary,
  getPA2StatusSummary,
  sanitizeCompanionIp,
} from '@/components/analyzer/settings/pa2BridgeSectionUtils'

describe('pa2BridgeSectionUtils', () => {
  it('sanitizes protocol and trailing slash from companion IP input', () => {
    expect(sanitizeCompanionIp('http://192.168.0.100/')).toBe('192.168.0.100')
  })

  it('rebuilds the base url from connection field updates', () => {
    expect(
      buildCompanionSettingsUpdate(
        {
          companionIp: 'localhost',
          companionPort: 8000,
          instanceLabel: 'PA2',
        },
        { companionPort: 9000, instanceLabel: 'MainRack' },
      ),
    ).toEqual({
      companionIp: 'localhost',
      companionPort: 9000,
      instanceLabel: 'MainRack',
      baseUrl: 'http://localhost:9000/instance/MainRack',
    })
  })

  it('reports the connected status summary with PEQ slot usage', () => {
    expect(
      getPA2StatusSummary({
        status: 'connected',
        pa2Connected: true,
        notchSlotsUsed: 2,
        notchSlotsAvailable: 6,
        error: null,
      }),
    ).toEqual({
      indicatorClassName: 'bg-green-500',
      message: 'PA2 Connected - PEQ 2/8 slots',
      helperText: null,
      showMixedContentLink: false,
    })
  })

  it('prefers auto-send diagnostic guidance when active cards are below threshold', () => {
    expect(
      getPA2AutoSendSummary({
        pa2Connected: true,
        lastAutoSendError: null,
        lastAutoSendResult: null,
        autoSendDiag: { total: 3, aboveThreshold: 0, active: 2 },
        effectiveConfidence: 0.6,
        configuredConfidence: 0.3,
        now: 1000,
      }),
    ).toEqual({
      toneClassName: 'text-amber-500/70',
      text: '2 cards active but 0 above 60% confidence (raised by PA2 from 30%) - lower the threshold',
    })
  })
})
