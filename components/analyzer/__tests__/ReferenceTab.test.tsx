// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ReferenceTab } from '@/components/analyzer/help/ReferenceTab'

describe('ReferenceTab', () => {
  it('shows startup defaults from the canonical Speech profile', () => {
    render(<ReferenceTab />)

    expect(screen.getByText('Startup Defaults')).toBeDefined()
    expect(screen.getByText('20 dB')).toBeDefined()
    expect(screen.getByText('1000 ms')).toBeDefined()
    expect(screen.getByText(/switching modes changes mode-owned defaults/i)).toBeDefined()
  })
})
