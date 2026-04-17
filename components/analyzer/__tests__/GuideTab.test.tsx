// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GuideTab } from '@/components/analyzer/help/GuideTab'

describe('GuideTab', () => {
  it('explains pre-show ring-out and non-feedback speech problems', () => {
    render(<GuideTab />)

    expect(screen.getByText(/pre-show calibration with performers and wedges/i)).toBeDefined()
    expect(screen.getByText(/clustered cards can mean a broader region/i)).toBeDefined()
    expect(screen.getByText(/Fresh-start uses the 25 dB startup snapshot/i)).toBeDefined()
    expect(screen.getByText(/harsh or unclear speech without stable rings/i)).toBeDefined()
    expect(screen.getByText(/often a placement or reflection problem, not true feedback/i)).toBeDefined()
    expect(screen.getByText(/Use the Perceptual spectrum view for room and speech interpretation/i)).toBeDefined()
    expect(screen.getByText(/does not yet separate direct, early, and late arrivals/i)).toBeDefined()
  })
})
