import { describe, it, expect } from 'vitest'
import { getSeverityUrgency } from '../severityUtils'

describe('getSeverityUrgency', () => {
  it('maps each severity level to correct urgency', () => {
    expect(getSeverityUrgency('RUNAWAY')).toBe(5)
    expect(getSeverityUrgency('GROWING')).toBe(4)
    expect(getSeverityUrgency('RESONANCE')).toBe(3)
    expect(getSeverityUrgency('POSSIBLE_RING')).toBe(2)
    expect(getSeverityUrgency('WHISTLE')).toBe(1)
    expect(getSeverityUrgency('INSTRUMENT')).toBe(1)
  })

  it('returns 0 for unknown severity', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(getSeverityUrgency('UNKNOWN' as any)).toBe(0)
  })
})
