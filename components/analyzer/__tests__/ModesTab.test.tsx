// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ModesTab } from '@/components/analyzer/help/ModesTab'

describe('ModesTab', () => {
  it('frames ring-out as pre-show workflow and warns about repeated same-band cuts', () => {
    render(<ModesTab />)

    expect(screen.getByText(/pre-show system calibration, sound check/i)).toBeDefined()
    expect(screen.getByText(/starts from the historical 25 dB fresh-start speech snapshot/i)).toBeDefined()
    expect(screen.getByText(/explicitly choosing Speech uses its 20 dB mode baseline/i)).toBeDefined()
    expect(screen.getByText(/not as a substitute for live emergency handling/i)).toBeDefined()
    expect(screen.getByText(/ring out with performers, wedges, and open mics/i)).toBeDefined()
    expect(screen.getByText(/same band keeps returning/i)).toBeDefined()
  })
})
