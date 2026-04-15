import { describe, expect, it } from 'vitest'
import {
  constraintPenalty,
  findScenarioContradictions,
  validateWeightConstraints,
} from '@/autoresearch/evaluate'

describe('autoresearch evaluation harness', () => {
  it('current fusion weights satisfy declared constraints', () => {
    const issues = validateWeightConstraints()

    expect(issues).toHaveLength(0)
    expect(constraintPenalty(issues)).toBe(0)
  })

  it('scenario dataset contains no contradictory signatures', () => {
    const contradictions = findScenarioContradictions()

    expect(contradictions).toHaveLength(0)
  })
})
