import { describe, it, expect } from 'vitest'
import { toFtsQuery } from '../src/shared/search.js'

describe('toFtsQuery', () => {
  it('quotes each word as a prefix term', () => {
    expect(toFtsQuery('hello world')).toBe('"hello"* "world"*')
  })

  it('lowercases input', () => {
    expect(toFtsQuery('MeetiNG')).toBe('"meeting"*')
  })

  it('treats punctuation as a separator (no MATCH syntax injection)', () => {
    expect(toFtsQuery('foo-bar, baz!')).toBe('"foo"* "bar"* "baz"*')
    expect(toFtsQuery('a AND b OR "c"')).toBe('"a"* "and"* "b"* "or"* "c"*')
  })

  it('keeps digits and non-ASCII letters', () => {
    expect(toFtsQuery('note42')).toBe('"note42"*')
    expect(toFtsQuery('café')).toBe('"café"*')
    expect(toFtsQuery('Ödev')).toBe('"ödev"*')
  })

  it('returns null when there is nothing to match', () => {
    expect(toFtsQuery('')).toBeNull()
    expect(toFtsQuery('   ')).toBeNull()
    expect(toFtsQuery('!!! ...')).toBeNull()
    expect(toFtsQuery(null)).toBeNull()
    expect(toFtsQuery(undefined)).toBeNull()
  })
})
