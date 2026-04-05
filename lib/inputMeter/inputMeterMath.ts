export function clampInputMeterValue(
  value: number,
  min: number,
  max: number,
): number {
  return Math.max(min, Math.min(max, value))
}

export function getInputMeterDisplayValue(
  value: number,
  autoGainEnabled: boolean,
  autoGainDb?: number,
): number {
  return autoGainEnabled && autoGainDb != null ? autoGainDb : value
}

interface InputMeterValueFromClientXParams {
  clientX: number
  sliderLeft: number
  sliderWidth: number
  min: number
  max: number
}

export function getInputMeterValueFromClientX({
  clientX,
  sliderLeft,
  sliderWidth,
  min,
  max,
}: InputMeterValueFromClientXParams): number {
  if (sliderWidth <= 0) return min

  const x = Math.max(0, Math.min(sliderWidth, clientX - sliderLeft))
  const ratio = x / sliderWidth
  return Math.round(min + ratio * (max - min))
}

export function stepInputMeterValue(
  value: number,
  direction: 1 | -1,
  min: number,
  max: number,
): number {
  return clampInputMeterValue(value + direction, min, max)
}

export function formatInputMeterValueLabel(displayValue: number): string {
  return `${displayValue > 0 ? '+' : ''}${displayValue}dB`
}
