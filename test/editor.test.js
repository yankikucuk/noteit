import { describe, it, expect } from 'vitest'
import { buildExtensions } from '../src/renderer/src/shared/editor.js'

describe('buildExtensions', () => {
  it('returns a non-empty list of defined extensions', () => {
    const exts = buildExtensions()
    expect(Array.isArray(exts)).toBe(true)
    expect(exts.length).toBeGreaterThan(6)
    expect(exts.every(Boolean)).toBe(true)
  })

  it('wires the expected rich-content extensions', () => {
    const names = buildExtensions().map((e) => e.name)
    for (const name of [
      'starterKit',
      'underline',
      'link',
      'highlight',
      'image',
      'tableKit',
      'codeBlock'
    ]) {
      expect(names, `missing extension: ${name}`).toContain(name)
    }
  })

  it('accepts a custom placeholder without throwing', () => {
    expect(() => buildExtensions('Type here')).not.toThrow()
  })
})
