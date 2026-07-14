/**
 * @file Shared i18n core.
 *
 * Pure translation utilities used by both the main process and every renderer.
 * Dictionaries are flat `key -> string` maps; `{param}` placeholders are
 * interpolated. Unknown keys fall back to the default locale, then to the key
 * itself, so nothing ever renders blank.
 */

import tr from './tr.js'
import en from './en.js'

/** All available locale dictionaries. */
export const LOCALES = { tr, en }

/** Locales offered in the UI (code + native label). */
export const AVAILABLE_LOCALES = [
  { code: 'tr', label: 'Türkçe' },
  { code: 'en', label: 'English' }
]

/** Fallback locale. */
export const DEFAULT_LOCALE = 'tr'

/**
 * Translates a key for a locale, interpolating `{param}` placeholders.
 * @param {string} locale - Locale code.
 * @param {string} key - Translation key.
 * @param {Record<string, string|number>} [params] - Interpolation values.
 * @returns {string} The translated (and interpolated) string.
 */
export function translate(locale, key, params) {
  const dict = LOCALES[locale] || LOCALES[DEFAULT_LOCALE]
  let str = dict[key] ?? LOCALES[DEFAULT_LOCALE][key] ?? key
  if (params) {
    for (const [k, v] of Object.entries(params)) str = str.replaceAll(`{${k}}`, String(v))
  }
  return str
}

/**
 * Resolves a supported locale from an OS locale string (e.g. "en-US" -> "en").
 * @param {string} osLocale - OS/browser locale.
 * @returns {string} A supported locale code.
 */
export function resolveLocale(osLocale) {
  const short = String(osLocale || '')
    .slice(0, 2)
    .toLowerCase()
  return LOCALES[short] ? short : DEFAULT_LOCALE
}
