import { describe, it, expect } from 'vitest'
import { PA2ClientError } from '../pa2Client'

describe('PA2ClientError', () => {
  it('stores statusCode and responseBody', () => {
    const err = new PA2ClientError('PA2 API test: HTTP 500', 500, 'Internal error')
    expect(err.statusCode).toBe(500)
    expect(err.responseBody).toBe('Internal error')
    expect(err.message).toBe('PA2 API test: HTTP 500')
    expect(err.name).toBe('PA2ClientError')
  })

  it('is an instance of Error', () => {
    const err = new PA2ClientError('test', 400, '')
    expect(err).toBeInstanceOf(Error)
  })
})
