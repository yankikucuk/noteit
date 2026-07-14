/**
 * @file Profile password hashing.
 *
 * Profiles may carry an *access lock*: a password gate for switching into the
 * profile. This is not full-disk encryption — note contents remain in plain
 * text in the database. Passwords are stored only as salted scrypt hashes and
 * compared in constant time.
 */

import { scryptSync, randomBytes, timingSafeEqual } from 'crypto'

/** scrypt-derived key length in bytes. */
const KEY_LEN = 32

/**
 * Hashes a password with a random salt. The result is `"<saltHex>:<hashHex>"`.
 * @param {string} password - Plain password.
 * @returns {string} Salt and hash, hex-encoded and colon-separated.
 */
export function hashPassword(password) {
  const salt = randomBytes(16)
  const hash = scryptSync(String(password), salt, KEY_LEN)
  return `${salt.toString('hex')}:${hash.toString('hex')}`
}

/**
 * Verifies a password against a stored hash in constant time. An empty stored
 * hash means "no password" and always passes.
 * @param {string} password - Candidate password.
 * @param {string|null} stored - Stored `"salt:hash"` value.
 * @returns {boolean} True if the password matches.
 */
export function verifyPassword(password, stored) {
  if (!stored) return true
  const [saltHex, hashHex] = stored.split(':')
  if (!saltHex || !hashHex) return false
  const expected = Buffer.from(hashHex, 'hex')
  const actual = scryptSync(String(password), Buffer.from(saltHex, 'hex'), KEY_LEN)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
