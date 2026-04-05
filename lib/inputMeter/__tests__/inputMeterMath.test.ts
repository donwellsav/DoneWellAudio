import { describe, expect, it } from 'vitest'
import {
  clampInputMeterValue,
  formatInputMeterValueLabel,
  getInputMeterDisplayValue,
  getInputMeterValueFromClientX,
  stepInputMeterValue,
} from '@/lib/inputMeter/inputMeterMath'

describe('inputMeterMath', () => {
  it('uses the auto-gain readout only when auto mode is active', () => {
    expect(getInputMeterDisplayValue(4, false, 12)).toBe(4)
    expect(getInputMeterDisplayValue(4, true, undefined)).toBe(4)
    expect(getInputMeterDisplayValue(4, true, 12)).toBe(12)
  })

  it('clamps and steps values inside the configured range', () => {
    expect(clampInputMeterValue(50, -40, 40)).toBe(40)
    expect(clampInputMeterValue(-50, -40, 40)).toBe(-40)
    expect(stepInputMeterValue(0, 1, -40, 40)).toBe(1)
    expect(stepInputMeterValue(-40, -1, -40, 40)).toBe(-40)
  })

  it('maps pointer positions into rounded slider values', () => {
    expect(getInputMeterValueFromClientX({
      clientX: 100,
      sliderLeft: 0,
      sliderWidth: 200,
      min: -40,
      max: 40,
    })).toBe(0)

    expect(getInputMeterValueFromClientX({
      clientX: -20,
      sliderLeft: 0,
      sliderWidth: 200,
      min: -40,
      max: 40,
    })).toBe(-40)

    expect(getInputMeterValueFromClientX({
      clientX: 260,
      sliderLeft: 0,
      sliderWidth: 200,
      min: -40,
      max: 40,
    })).toBe(40)
  })

  it('formats signed readout labels', () => {
    expect(formatInputMeterValueLabel(-6)).toBe('-6dB')
    expect(formatInputMeterValueLabel(0)).toBe('0dB')
    expect(formatInputMeterValueLabel(6)).toBe('+6dB')
  })
})
