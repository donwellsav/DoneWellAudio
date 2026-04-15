// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ModesTab } from '@/components/analyzer/help/ModesTab'
import { deriveDefaultDetectorSettings } from '@/lib/settings/defaultDetectorSettings'

describe('ModesTab', () => {
  it('renders canonical mode-owned defaults from the derived settings helper', () => {
    const speechDefaults = deriveDefaultDetectorSettings('speech')
    const broadcastDefaults = deriveDefaultDetectorSettings('broadcast')

    render(<ModesTab />)

    expect(screen.getByText('Speech')).toBeDefined()
    expect(screen.getByText('Startup default')).toBeDefined()
    expect(
      screen.getByText(
        new RegExp(
          `Feedback ${speechDefaults.feedbackThresholdDb} dB \\| Ring ${speechDefaults.ringThresholdDb} dB \\| Growth ${speechDefaults.growthRateThreshold.toFixed(1)} dB/s`,
        ),
      ),
    ).toBeDefined()
    expect(
      screen.getByText(
        new RegExp(
          `AG ${broadcastDefaults.autoGainTargetDb} dBFS \\| Track ${broadcastDefaults.trackTimeoutMs} ms`,
        ),
      ),
    ).toBeDefined()
    expect(screen.getByText(/switching modes resets mode-owned controls to that mode's baseline/i)).toBeDefined()
  })
})
