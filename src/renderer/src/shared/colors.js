/**
 * @file Color palettes for sticky notes and tags.
 *
 * Note colors define the note surface (bg), title bar (bar), text and accent.
 * Tag colors define a chip's background (bg) and foreground (fg).
 */

/**
 * Sticky-note color palette, keyed by color name. Human-readable labels live in
 * the i18n dictionaries under `color.<name>`.
 * @type {Record<string, {bg: string, bar: string, text: string, accent: string}>}
 */
export const COLORS = {
  yellow: { bg: '#FEF3A6', bar: '#FCE571', text: '#6b5900', accent: '#e0c200' },
  green: { bg: '#DBF5C7', bar: '#BCEE9B', text: '#33540f', accent: '#7cc63f' },
  pink: { bg: '#FBD3E2', bar: '#F6AECB', text: '#7a1f45', accent: '#e26a97' },
  blue: { bg: '#CFE8FB', bar: '#A8D6F6', text: '#114264', accent: '#4aa3e0' },
  purple: { bg: '#E6D6F8', bar: '#CDB2EF', text: '#4a2673', accent: '#9a6fd0' },
  orange: { bg: '#FFDFBC', bar: '#FFC98A', text: '#7a4708', accent: '#f09b3e' },
  teal: { bg: '#C9F1EC', bar: '#9CE4DA', text: '#0f5850', accent: '#3fb8a8' },
  white: { bg: '#FFFFFF', bar: '#EDEDED', text: '#333333', accent: '#bdbdbd' },
  gray: { bg: '#E4E6E9', bar: '#CBCED3', text: '#33383f', accent: '#9aa0a8' },
  charcoal: { bg: '#3A3D42', bar: '#2C2E33', text: '#E8E8E8', accent: '#6b6f77' }
}

/** Note color keys, in palette (swatch) order. @type {string[]} */
export const COLOR_ORDER = [
  'yellow',
  'green',
  'pink',
  'blue',
  'purple',
  'orange',
  'teal',
  'white',
  'gray',
  'charcoal'
]

/**
 * Resolves a note color, defaulting to yellow for unknown keys.
 * @param {string} name - Color key.
 * @returns {{bg: string, bar: string, text: string, accent: string}}
 */
export function getColor(name) {
  return COLORS[name] || COLORS.yellow
}

/**
 * Tag color palette, keyed by color name. Labels live in the i18n dictionaries
 * under `tagColor.<name>`.
 * @type {Record<string, {bg: string, fg: string}>}
 */
export const TAG_COLORS = {
  slate: { bg: '#e6e8ec', fg: '#454b54' },
  red: { bg: '#fde0e0', fg: '#a02626' },
  orange: { bg: '#ffe6cc', fg: '#a75a12' },
  amber: { bg: '#fdefc4', fg: '#8a6410' },
  green: { bg: '#d8f2d3', fg: '#2f6a2c' },
  teal: { bg: '#cdeeea', fg: '#1f6b62' },
  blue: { bg: '#d6e6fc', fg: '#1f5aa8' },
  violet: { bg: '#e7ddfb', fg: '#5f3fb0' },
  pink: { bg: '#fbdcec', fg: '#a83071' }
}

/** Tag color keys, in palette order (used to auto-assign new tag colors). @type {string[]} */
export const TAG_COLOR_ORDER = [
  'slate',
  'red',
  'orange',
  'amber',
  'green',
  'teal',
  'blue',
  'violet',
  'pink'
]

/**
 * Resolves a tag color, defaulting to slate for unknown keys.
 * @param {string} name - Color key.
 * @returns {{bg: string, fg: string}}
 */
export function getTagColor(name) {
  return TAG_COLORS[name] || TAG_COLORS.slate
}
