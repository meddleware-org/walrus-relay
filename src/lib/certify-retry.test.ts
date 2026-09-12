import { describe, it, expect } from 'vitest'
import { attachCertifyRetry, getCertifyRetry } from './certify-retry.js'

describe('certify-retry', () => {
  it('attaches a retry closure to an error and reads it back', async () => {
    const err = new Error('certify rejected')
    const retry = async () => 'certified'
    attachCertifyRetry(err, retry)
    const got = getCertifyRetry<string>(err)
    expect(got).toBe(retry)
    expect(await got!()).toBe('certified')
  })

  it('returns null when no retry was attached', () => {
    expect(getCertifyRetry(new Error('network'))).toBeNull()
    expect(getCertifyRetry('a string error')).toBeNull()
    expect(getCertifyRetry(null)).toBeNull()
    expect(getCertifyRetry(undefined)).toBeNull()
  })

  it('attach is a safe no-op on non-object throwables', () => {
    expect(() => attachCertifyRetry('oops', async () => 1)).not.toThrow()
    expect(getCertifyRetry('oops')).toBeNull()
  })
})
