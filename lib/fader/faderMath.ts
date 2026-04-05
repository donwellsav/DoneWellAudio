import type { FaderMode } from '@/components/analyzer/faderTypes'

export const SENSITIVITY_FADER_MIN = 2
export const SENSITIVITY_FADER_MAX = 50

interface FaderBoundsParams {
  mode: FaderMode
  min: number
  max: number
}

interface FaderValueParams extends FaderBoundsParams {
  value: number
}

interface FaderPointerParams extends FaderBoundsParams {
  clientY: number
  trackTop: number
  trackHeight: number
}

interface FaderStepParams extends FaderValueParams {
  direction: 1 | -1
}

export function getFaderBounds({ mode, min, max }: FaderBoundsParams) {
  if (mode === 'sensitivity') {
    return {
      min: SENSITIVITY_FADER_MIN,
      max: SENSITIVITY_FADER_MAX,
    }
  }

  return { min, max }
}

export function clampFaderValue({ mode, value, min, max }: FaderValueParams) {
  const bounds = getFaderBounds({ mode, min, max })
  return Math.max(bounds.min, Math.min(bounds.max, value))
}

export function getFaderValueFromClientY({
  mode,
  clientY,
  trackTop,
  trackHeight,
  min,
  max,
}: FaderPointerParams) {
  const safeHeight = Math.max(1, trackHeight)
  const y = Math.max(0, Math.min(safeHeight, clientY - trackTop))
  const ratio = 1 - y / safeHeight

  if (mode === 'sensitivity') {
    const nextValue = Math.round(SENSITIVITY_FADER_MAX - ratio * (SENSITIVITY_FADER_MAX - SENSITIVITY_FADER_MIN))
    return clampFaderValue({ mode, value: nextValue, min, max })
  }

  const nextValue = Math.round(min + ratio * (max - min))
  return clampFaderValue({ mode, value: nextValue, min, max })
}

export function getFaderThumbBottom({ mode, value, min, max }: FaderValueParams) {
  if (mode === 'sensitivity') {
    return ((SENSITIVITY_FADER_MAX - value) / (SENSITIVITY_FADER_MAX - SENSITIVITY_FADER_MIN)) * 100
  }

  return ((value - min) / (max - min)) * 100
}

export function stepFaderValue({ mode, value, direction, min, max }: FaderStepParams) {
  if (mode === 'sensitivity') {
    return clampFaderValue({
      mode,
      value: value - direction,
      min,
      max,
    })
  }

  return clampFaderValue({
    mode,
    value: value + direction,
    min,
    max,
  })
}
