import { useCallback, useMemo } from 'react'

// ── Constants ────────────────────────────────────────────────────────────────

const GAIN_MIN = -40
const GAIN_MAX = 40
const GAIN_SPAN = GAIN_MAX - GAIN_MIN // 80

const SENS_MIN = 2
const SENS_MAX = 50
const SENS_SPAN = SENS_MAX - SENS_MIN // 48

// ── Visual-position conversions ──────────────────────────────────────────────
// Both normalize to 0 = bottom, 1 = top in the fader's visual coordinate space.
// Sensitivity is inverted: fader up = lower dB = more sensitive.

/** Gain dB → visual position (0 at -40dB, 1 at +40dB) */
function gainToVisual(db: number): number {
  return (db - GAIN_MIN) / GAIN_SPAN
}

/** Visual position → gain dB */
function visualToGain(v: number): number {
  return GAIN_MIN + v * GAIN_SPAN
}

/** Sensitivity dB → visual position (0 at 50dB bottom, 1 at 2dB top) */
function sensToVisual(db: number): number {
  return (SENS_MAX - db) / SENS_SPAN
}

/** Visual position → sensitivity dB */
function visualToSens(v: number): number {
  return SENS_MAX - v * SENS_SPAN
}

function clamp(val: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, val))
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export type FaderLinkMode = 'unlinked' | 'linked' | 'linked-reversed'

export interface UseFaderLinkOptions {
  linkMode: FaderLinkMode
  linkRatio: number           // sensitivity-to-gain visual ratio (0.5–2.0)
  centerGainDb: number        // home position for gain
  centerSensDb: number        // home position for sensitivity
  gainDb: number              // current gain value
  sensitivityDb: number       // current sensitivity value
  onGainChange: (db: number) => void
  onSensitivityChange: (db: number) => void
  onAutoGainToggle?: (enabled: boolean) => void
}

export interface UseFaderLinkReturn {
  /** Call when the gain fader is dragged to a new absolute dB value */
  handleGainDrag: (newGainDb: number) => void
  /** Call when the sensitivity fader is dragged to a new absolute dB value */
  handleSensDrag: (newSensDb: number) => void
  /** Snap both faders to their center/home positions */
  goHome: () => void
}

/**
 * Couples two faders with optional linking in visual-position space.
 *
 * When linked, dragging one fader moves the other proportionally.
 * The "linked" mode moves both thumbs in the same visual direction
 * (both up together). "Linked-reversed" moves them opposite.
 *
 * The ratio controls how much the follower moves relative to the leader,
 * in visual-position units (not raw dB). A ratio of 1.0 means equal
 * visual travel; 2.0 means the sensitivity fader moves twice as fast.
 *
 * Edge behavior: the follower clamps at its limits while the leader
 * continues — standard console link-group behavior.
 */
export function useFaderLink({
  linkMode,
  linkRatio,
  centerGainDb,
  centerSensDb,
  onGainChange,
  onSensitivityChange,
  onAutoGainToggle,
}: UseFaderLinkOptions): UseFaderLinkReturn {

  const centerGainVisual = useMemo(() => gainToVisual(centerGainDb), [centerGainDb])
  const centerSensVisual = useMemo(() => sensToVisual(centerSensDb), [centerSensDb])

  const handleGainDrag = useCallback((newGainDb: number) => {
    const clampedGain = Math.round(clamp(newGainDb, GAIN_MIN, GAIN_MAX))
    onGainChange(clampedGain)

    if (linkMode === 'unlinked') return

    // Compute visual delta from center
    const gainVisualDelta = gainToVisual(clampedGain) - centerGainVisual
    let sensVisualDelta = gainVisualDelta * linkRatio

    if (linkMode === 'linked-reversed') {
      sensVisualDelta = -sensVisualDelta
    }

    const newSensVisual = clamp(centerSensVisual + sensVisualDelta, 0, 1)
    const newSensDb = Math.round(visualToSens(newSensVisual))
    onSensitivityChange(clamp(newSensDb, SENS_MIN, SENS_MAX))
  }, [linkMode, linkRatio, centerGainVisual, centerSensVisual, onGainChange, onSensitivityChange])

  const handleSensDrag = useCallback((newSensDb: number) => {
    const clampedSens = Math.round(clamp(newSensDb, SENS_MIN, SENS_MAX))
    onSensitivityChange(clampedSens)

    if (linkMode === 'unlinked') return

    // Compute visual delta from center
    const sensVisualDelta = sensToVisual(clampedSens) - centerSensVisual
    // Divide by ratio (inverse: sensitivity is leader, gain is follower)
    let gainVisualDelta = linkRatio !== 0 ? sensVisualDelta / linkRatio : 0

    if (linkMode === 'linked-reversed') {
      gainVisualDelta = -gainVisualDelta
    }

    const newGainVisual = clamp(centerGainVisual + gainVisualDelta, 0, 1)
    const newGainDb = Math.round(visualToGain(newGainVisual))
    if (onAutoGainToggle) onAutoGainToggle(false)
    onGainChange(clamp(newGainDb, GAIN_MIN, GAIN_MAX))
  }, [linkMode, linkRatio, centerGainVisual, centerSensVisual, onGainChange, onSensitivityChange, onAutoGainToggle])

  const goHome = useCallback(() => {
    onGainChange(centerGainDb)
    onSensitivityChange(centerSensDb)
    if (onAutoGainToggle) onAutoGainToggle(false)
  }, [centerGainDb, centerSensDb, onGainChange, onSensitivityChange, onAutoGainToggle])

  return { handleGainDrag, handleSensDrag, goHome }
}

// Export conversion utilities for testing
export const _testUtils = { gainToVisual, visualToGain, sensToVisual, visualToSens }
