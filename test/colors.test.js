import { describe, it, expect } from 'vitest'
import {
  getColor,
  getTagColor,
  isCustomColor,
  COLOR_ORDER,
  TAG_COLOR_ORDER,
  COLORS,
  TAG_COLORS
} from '../src/renderer/src/shared/colors.js'

describe('custom colors', () => {
  it('detects custom hex values', () => {
    expect(isCustomColor('#aabbcc')).toBe(true)
    expect(isCustomColor('yellow')).toBe(false)
    expect(isCustomColor('#xyz')).toBe(false)
    expect(isCustomColor(null)).toBe(false)
  })

  it('derives a palette from a custom hex with contrasting text', () => {
    const light = getColor('#ffffff')
    expect(light.bg).toBe('#ffffff')
    expect(light.text).toBe('#2a2a2a') // dark text on a light color
    const dark = getColor('#101010')
    expect(dark.bg).toBe('#101010')
    expect(dark.text).toBe('#f0f0f0') // light text on a dark color
    for (const field of ['bg', 'bar', 'text', 'accent']) {
      expect(light[field]).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it('falls back to a preset for non-hex names', () => {
    expect(getColor('blue')).toBe(COLORS.blue)
  })
})

describe('note colors', () => {
  it('resolves a known color', () => {
    expect(getColor('blue')).toBe(COLORS.blue)
  })

  it('falls back to yellow for an unknown color', () => {
    expect(getColor('does-not-exist')).toBe(COLORS.yellow)
  })

  it('every ordered key exists in the palette with the required fields', () => {
    for (const key of COLOR_ORDER) {
      const c = COLORS[key]
      expect(c).toBeDefined()
      for (const field of ['bg', 'bar', 'text', 'accent']) {
        expect(typeof c[field]).toBe('string')
      }
    }
  })
})

describe('tag colors', () => {
  it('resolves a known tag color', () => {
    expect(getTagColor('green')).toBe(TAG_COLORS.green)
  })

  it('falls back to slate for an unknown tag color', () => {
    expect(getTagColor('nope')).toBe(TAG_COLORS.slate)
  })

  it('every ordered key exists with bg and fg', () => {
    for (const key of TAG_COLOR_ORDER) {
      const c = TAG_COLORS[key]
      expect(c).toBeDefined()
      expect(typeof c.bg).toBe('string')
      expect(typeof c.fg).toBe('string')
    }
  })
})
