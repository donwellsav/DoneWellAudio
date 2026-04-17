// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ReferenceTab } from '@/components/analyzer/help/ReferenceTab'

describe('ReferenceTab', () => {
  it('shows fresh-start defaults and the separate Speech mode baseline', () => {
    render(<ReferenceTab />)

    expect(screen.getByText('Fresh-Start Defaults')).toBeDefined()
    expect(screen.getByText('25 dB')).toBeDefined()
    expect(screen.getByText('20 dB baseline')).toBeDefined()
    expect(screen.getByText('1000 ms')).toBeDefined()
    expect(screen.getByText(/explicit speech mode itself runs at a 20 dB baseline/i)).toBeDefined()
  })
})
