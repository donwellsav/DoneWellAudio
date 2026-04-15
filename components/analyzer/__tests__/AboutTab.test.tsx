// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { AboutTab } from '../help/AboutTab'

describe('AboutTab', () => {
  it('surfaces the latest release and expanded release history', () => {
    render(<AboutTab />)

    expect(screen.getByText('Latest Release')).toBeDefined()
    expect(screen.getByText('v0.98.0')).toBeDefined()
    expect(screen.getByText(/snapshot-based speech\/worship replay lane/i)).toBeDefined()

    fireEvent.click(screen.getByText('Release History'))

    expect(screen.getAllByText('v0.97.0').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('v0.96.0').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/ring-out now detects replacement advisories by identity/i)).toBeDefined()
  })
})
