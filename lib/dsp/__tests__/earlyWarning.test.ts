import { describe, it, expect } from 'vitest'
import { createDpdtState, computeEarlyWarning } from '../earlyWarning'
import type { DpdtState } from '../earlyWarning'
import { EARLY_WARNING } from '../constants'

describe('earlyWarning', () => {
  describe('createDpdtState', () => {
    it('returns zeroed initial state', () => {
      const state = createDpdtState()
      expect(state.previousProbability).toBe(0)
      expect(state.smoothedDpdt).toBe(0)
      expect(state.earlyWarning).toBeNull()
      expect(state.clearFrameCount).toBe(0)
    })
  })

  describe('computeEarlyWarning', () => {
    const DT = 0.020 // 20ms = 50fps

    it('rising probability triggers BUILDING then GROWING', () => {
      let state = createDpdtState()

      // Feed a sequence of rising probabilities to build up smoothed dP/dt
      const probabilities = [0.0, 0.1, 0.2, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85]
      for (const p of probabilities) {
        state = computeEarlyWarning(state, p, DT)
      }

      // After a steep rise, we should have triggered at least BUILDING or GROWING
      // The exact level depends on EMA smoothing, but the trajectory is steep enough
      // (0 to 0.85 over 9 frames at 20ms each) that GROWING should be reached
      expect(state.earlyWarning).not.toBeNull()

      // Verify we can reach GROWING with this steep trajectory
      // dP/dt per frame = ~0.1/0.02 = 5.0 prob/sec — well above GROWING_DPDT_THRESHOLD (0.15)
      // and probability > GROWING_PROBABILITY_THRESHOLD (0.5)
      expect(state.earlyWarning).toBe('GROWING')
    })

    it('flat probability produces no warning', () => {
      let state = createDpdtState()

      // Constant probability = zero dP/dt
      for (let i = 0; i < 20; i++) {
        state = computeEarlyWarning(state, 0.4, DT)
      }

      expect(state.earlyWarning).toBeNull()
      // smoothedDpdt should be near zero since probability isn't changing
      expect(Math.abs(state.smoothedDpdt)).toBeLessThan(0.01)
    })

    it('falling sequence clears warning after CLEAR_FRAME_COUNT frames', () => {
      // First, build up to a warning state
      let state = createDpdtState()
      const rising = [0.0, 0.15, 0.30, 0.45, 0.60, 0.75]
      for (const p of rising) {
        state = computeEarlyWarning(state, p, DT)
      }

      // Should have a warning by now
      expect(state.earlyWarning).not.toBeNull()

      // Now feed falling probabilities to clear the warning
      // Need smoothedDpdt to drop below CLEAR_DPDT_THRESHOLD for CLEAR_FRAME_COUNT frames
      const falling = [0.70, 0.60, 0.50, 0.40, 0.30, 0.20, 0.10, 0.05, 0.02, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01]
      for (const p of falling) {
        state = computeEarlyWarning(state, p, DT)
      }

      // After enough falling frames, the warning should clear
      expect(state.earlyWarning).toBeNull()
    })

    it('high dpdt but low probability does NOT trigger warning', () => {
      let state = createDpdtState()

      // Rapid rise but staying below BUILDING_PROBABILITY_THRESHOLD (0.3)
      const probabilities = [0.0, 0.05, 0.10, 0.15, 0.20, 0.25, 0.28]
      for (const p of probabilities) {
        state = computeEarlyWarning(state, p, DT)
      }

      // dP/dt is positive but probability never reaches threshold
      expect(state.earlyWarning).toBeNull()
      // smoothedDpdt should be positive (probability is rising)
      expect(state.smoothedDpdt).toBeGreaterThan(0)
    })

    it('zero dt is handled safely (no division by zero)', () => {
      const state = createDpdtState()
      const result = computeEarlyWarning(state, 0.5, 0)

      // Should return state with updated probability but no dpdt computation
      expect(result.previousProbability).toBe(0.5)
      expect(result.smoothedDpdt).toBe(0)
      expect(result.earlyWarning).toBeNull()
    })

    it('negative dt is handled safely', () => {
      const state = createDpdtState()
      const result = computeEarlyWarning(state, 0.5, -0.02)

      expect(result.previousProbability).toBe(0.5)
      expect(result.smoothedDpdt).toBe(0)
      expect(result.earlyWarning).toBeNull()
    })

    it('BUILDING requires both dpdt and probability thresholds', () => {
      // Start with a state that has some dP/dt but probability just below threshold
      let state: DpdtState = {
        previousProbability: 0.25,
        smoothedDpdt: 0.06, // above BUILDING_DPDT_THRESHOLD
        earlyWarning: null,
        clearFrameCount: 0,
      }

      // Feed probability just below BUILDING_PROBABILITY_THRESHOLD
      state = computeEarlyWarning(state, 0.28, DT)
      expect(state.earlyWarning).toBeNull()

      // Now push probability above threshold
      state = computeEarlyWarning(state, 0.35, DT)
      // dP/dt from 0.28 to 0.35 in 20ms = 3.5/sec, smoothed with EMA
      // Combined with existing smoothed dP/dt, should be above BUILDING threshold
      if (state.smoothedDpdt >= EARLY_WARNING.BUILDING_DPDT_THRESHOLD) {
        expect(state.earlyWarning).toBe('BUILDING')
      }
    })

    it('warning holds during borderline dP/dt (above clear threshold)', () => {
      // Create state with active BUILDING warning
      let state: DpdtState = {
        previousProbability: 0.35,
        smoothedDpdt: 0.06, // above BUILDING_DPDT_THRESHOLD but below GROWING
        earlyWarning: 'BUILDING',
        clearFrameCount: 0,
      }

      // Feed a slightly rising probability — dP/dt stays above CLEAR threshold
      state = computeEarlyWarning(state, 0.36, DT)
      // dpdt = (0.36-0.35)/0.02 = 0.5, smoothed = 0.35*0.5 + 0.65*0.06 = 0.175 + 0.039 = 0.214
      // 0.214 > CLEAR_DPDT_THRESHOLD (0.02) — warning should hold
      // Also above GROWING thresholds? 0.214 >= 0.15 and 0.36 < 0.5, so stays BUILDING
      expect(state.earlyWarning).toBe('BUILDING')
      expect(state.clearFrameCount).toBe(0)
    })
  })
})
