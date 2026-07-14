import { describe, it, expect } from 'vitest'
import tr from '../src/shared/locales/tr.js'
import en from '../src/shared/locales/en.js'
import { AVAILABLE_LOCALES, translate, resolveLocale } from '../src/shared/locales/index.js'

/** Extracts the set of `{param}` placeholder names from a string. */
function placeholders(str) {
  return new Set([...String(str).matchAll(/\{(\w+)\}/g)].map((m) => m[1]))
}

describe('locale dictionaries', () => {
  it('every advertised locale has a dictionary', () => {
    for (const { code } of AVAILABLE_LOCALES) {
      expect(translate(code, 'settings.title')).toBeTruthy()
    }
  })

  it('Turkish and English define exactly the same keys (no untranslated strings)', () => {
    const trKeys = Object.keys(tr).sort()
    const enKeys = Object.keys(en).sort()
    const missingInEn = trKeys.filter((k) => !(k in en))
    const missingInTr = enKeys.filter((k) => !(k in tr))
    expect(missingInEn, `keys missing in en.js: ${missingInEn.join(', ')}`).toEqual([])
    expect(missingInTr, `keys missing in tr.js: ${missingInTr.join(', ')}`).toEqual([])
  })

  it('has no empty translations', () => {
    for (const [key, value] of Object.entries(tr)) {
      expect(String(value).length, `tr.js "${key}" is empty`).toBeGreaterThan(0)
    }
    for (const [key, value] of Object.entries(en)) {
      expect(String(value).length, `en.js "${key}" is empty`).toBeGreaterThan(0)
    }
  })

  it('uses matching interpolation placeholders across locales', () => {
    for (const key of Object.keys(tr)) {
      expect([...placeholders(tr[key])].sort(), `placeholders differ for "${key}"`).toEqual(
        [...placeholders(en[key])].sort()
      )
    }
  })

  it('interpolates parameters and falls back to the key for unknown entries', () => {
    expect(translate('en', 'settings.version', { version: '1.2.3' })).toContain('1.2.3')
    expect(translate('en', 'nonexistent.key')).toBe('nonexistent.key')
  })

  it('resolves OS locale strings to a supported code', () => {
    expect(resolveLocale('en-US')).toBe('en')
    expect(resolveLocale('tr-TR')).toBe('tr')
    expect(resolveLocale('fr-FR')).toBe('tr') // unsupported -> default
  })
})
