import { describe, expect, it, vi } from 'vitest'

vi.mock('@sentry/nextjs', () => ({
  logger: {
    info: vi.fn(),
  },
}))

describe('GET /api/sentry-example-api', () => {
  it('logs to Sentry and throws the example backend error', async () => {
    const Sentry = await import('@sentry/nextjs')
    const { GET } = await import('../route')

    expect(() => GET()).toThrow('This error is raised on the backend called by the example page.')
    expect(Sentry.logger.info).toHaveBeenCalledWith('Sentry example API called')
  })
})
