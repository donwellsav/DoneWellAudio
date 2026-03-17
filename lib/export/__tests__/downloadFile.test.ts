// @vitest-environment jsdom
/**
 * Tests for downloadFile.ts — browser file download trigger.
 *
 * Mocks DOM APIs (createElement, createObjectURL) to verify
 * the click-download-cleanup sequence.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { downloadFile } from '../downloadFile'

describe('downloadFile', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockAnchor: Record<string, any>
  let clickSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    clickSpy = vi.fn()
    mockAnchor = { href: '', download: '', click: clickSpy }

    vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor as unknown as HTMLAnchorElement)
    vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node)
    vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node)

    globalThis.URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url') as typeof URL.createObjectURL
    globalThis.URL.revokeObjectURL = vi.fn() as typeof URL.revokeObjectURL
  })

  it('creates a blob URL and triggers download via anchor click', () => {
    const blob = new Blob(['test'], { type: 'text/plain' })
    downloadFile(blob, 'report.txt')

    expect(URL.createObjectURL).toHaveBeenCalledWith(blob)
    expect(mockAnchor.href).toBe('blob:mock-url')
    expect(mockAnchor.download).toBe('report.txt')
    expect(clickSpy).toHaveBeenCalledOnce()
  })

  it('appends anchor to body then removes it after click', () => {
    const blob = new Blob(['test'], { type: 'text/plain' })
    downloadFile(blob, 'test.pdf')

    expect(document.body.appendChild).toHaveBeenCalled()
    expect(document.body.removeChild).toHaveBeenCalled()
  })

  it('revokes the object URL after cleanup', () => {
    const blob = new Blob(['data'], { type: 'application/json' })
    downloadFile(blob, 'data.json')

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
  })
})
