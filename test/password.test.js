import { describe, it, expect } from 'vitest'
import { hashPassword, verifyPassword } from '../src/main/password.js'

describe('password hashing', () => {
  it('produces a "salt:hash" string', () => {
    const stored = hashPassword('secret')
    expect(stored).toMatch(/^[0-9a-f]+:[0-9a-f]+$/)
  })

  it('uses a random salt (different hashes for the same password)', () => {
    expect(hashPassword('secret')).not.toBe(hashPassword('secret'))
  })

  it('verifies the correct password', () => {
    const stored = hashPassword('correct horse')
    expect(verifyPassword('correct horse', stored)).toBe(true)
  })

  it('rejects an incorrect password', () => {
    const stored = hashPassword('correct horse')
    expect(verifyPassword('wrong', stored)).toBe(false)
  })

  it('treats an empty stored hash as "no password" (always passes)', () => {
    expect(verifyPassword('anything', null)).toBe(true)
    expect(verifyPassword('', '')).toBe(true)
  })

  it('rejects a malformed stored hash', () => {
    expect(verifyPassword('x', 'not-a-valid-hash')).toBe(false)
  })
})
