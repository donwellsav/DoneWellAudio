// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { AboutTab } from '../help/AboutTab'
import { CHANGELOG } from '@/lib/changelog'

function formatEntryVersion(version: string): string {
  return /^[0-9]/.test(version) ? `v${version}` : version
}

describe('AboutTab', () => {
  it('surfaces the latest release and expanded release history', () => {
    const [latestEntry, firstOlderEntry, secondOlderEntry] = CHANGELOG

    render(<AboutTab />)

    expect(screen.getByText('Latest Release')).toBeDefined()
    expect(screen.getByText(formatEntryVersion(latestEntry.version))).toBeDefined()
    expect(screen.getByText(latestEntry.changes[0].description)).toBeDefined()

    fireEvent.click(screen.getByText('Release History'))

    expect(screen.getAllByText(formatEntryVersion(firstOlderEntry.version)).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(formatEntryVersion(secondOlderEntry.version)).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(firstOlderEntry.changes[0].description)).toBeDefined()
  })
})
