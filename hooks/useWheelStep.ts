import { useEffect, useRef, type RefObject } from 'react'

/**
 * Adds focus-gated scroll-wheel step adjustment to any numerical control.
 *
 * **Why a ref-based native listener?** React 17+ registers `onWheel` as a
 * passive event listener, so `e.preventDefault()` silently fails — the
 * page scrolls anyway. We must attach a native `wheel` listener with
 * `{ passive: false }` to actually prevent scrolling.
 *
 * **Focus-gated:** Wheel events only capture (preventDefault + adjust value)
 * after the user clicks/focuses the slider. Otherwise the event passes
 * through and the settings panel scrolls normally.
 *
 * Workflow: click slider thumb → focus → scroll adjusts value →
 * click away / Tab → blur → normal panel scrolling resumes.
 *
 * Hold Shift for fine-stepping (step/10).
 *
 * @example
 * const ref = useRef<HTMLSpanElement>(null)
 * useWheelStep(ref, { value, min, max, step, onChange })
 * <SliderRoot ref={ref}>...</SliderRoot>
 */
export interface UseWheelStepOptions {
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  /** Invert direction (e.g. sensitivity fader: scroll up = lower dB) */
  inverted?: boolean
}

export function useWheelStep(
  ref: RefObject<HTMLElement | null>,
  opts: UseWheelStepOptions,
) {
  const optsRef = useRef(opts)
  const focusedRef = useRef(false)

  useEffect(() => {
    optsRef.current = opts
  }, [opts])

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const onFocus = () => { focusedRef.current = true }
    const onBlur = () => { focusedRef.current = false }

    const onWheel = (e: WheelEvent) => {
      if (!focusedRef.current) return

      e.preventDefault()
      e.stopPropagation()

      const { value, min, max, step, onChange, inverted } = optsRef.current
      const direction = e.deltaY < 0 ? 1 : -1
      const sign = inverted ? -direction : direction
      const effectiveStep = e.shiftKey ? Math.max(step / 10, Number.EPSILON) : step
      const raw = value + sign * effectiveStep
      const rounded = Math.round(raw / step) * step
      const clamped = Math.min(max, Math.max(min, rounded))
      if (clamped !== value) onChange(clamped)
    }

    // Native listener with { passive: false } — required to preventDefault
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('focusin', onFocus)
    el.addEventListener('focusout', onBlur)

    return () => {
      focusedRef.current = false
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('focusin', onFocus)
      el.removeEventListener('focusout', onBlur)
    }
  }, [ref])
}
