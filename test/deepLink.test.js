import { describe, it, expect } from 'vitest'
import { noteLink, deepLinkFromArgv, parseDeepLink } from '../src/shared/deepLink.js'

describe('noteLink', () => {
  it('builds a canonical note link', () => {
    expect(noteLink(42)).toBe('noteit://note/42')
  })
})

describe('deepLinkFromArgv', () => {
  it('finds the first noteit:// argument', () => {
    expect(deepLinkFromArgv(['electron', '.', 'noteit://new'])).toBe('noteit://new')
  })

  it('returns null when there is none', () => {
    expect(deepLinkFromArgv(['electron', '.'])).toBeNull()
    expect(deepLinkFromArgv([])).toBeNull()
    expect(deepLinkFromArgv(undefined)).toBeNull()
  })
})

describe('parseDeepLink', () => {
  it('routes note links with a positive integer id', () => {
    expect(parseDeepLink('noteit://note/5')).toEqual({ action: 'note', id: 5 })
  })

  it('routes new and explorer', () => {
    expect(parseDeepLink('noteit://new')).toEqual({ action: 'new' })
    expect(parseDeepLink('noteit://explorer')).toEqual({ action: 'explorer' })
  })

  it('rejects a wrong scheme, unknown route, or bad id', () => {
    expect(parseDeepLink('https://note/5')).toBeNull()
    expect(parseDeepLink('noteit://bogus')).toBeNull()
    expect(parseDeepLink('noteit://note/abc')).toBeNull()
    expect(parseDeepLink('noteit://note/0')).toBeNull()
    expect(parseDeepLink('noteit://note/-3')).toBeNull()
    expect(parseDeepLink('not a url')).toBeNull()
  })
})
