/**
 * @file Renderer i18n.
 *
 * Exposes a reactive `t(key, params)` bound to the current locale. Because
 * `t` reads the reactive `locale` ref, any template that calls it re-renders
 * when the language changes. The initial locale is fetched from the main
 * process, and `locale:changed` broadcasts keep every window in sync.
 */

import { ref, watchEffect } from 'vue'
import { translate, DEFAULT_LOCALE, AVAILABLE_LOCALES } from '../../shared/locales/index.js'

export { AVAILABLE_LOCALES }

/** Current UI locale (reactive). */
export const locale = ref(DEFAULT_LOCALE)

// Adopt the locale the main process resolved (saved preference or OS), then
// stay in sync with live changes broadcast from any window.
if (typeof window !== 'undefined' && window.api) {
  window.api.locale.current().then((l) => {
    if (l) locale.value = l
  })
  window.api.on('locale:changed', (l) => {
    if (l) locale.value = l
  })
}

// Keep the document language attribute in sync for accessibility tools.
if (typeof document !== 'undefined') {
  watchEffect(() => {
    document.documentElement.lang = locale.value
  })
}

/**
 * Translates a key for the current locale.
 * @param {string} key - Translation key.
 * @param {Record<string, string|number>} [params] - Interpolation values.
 * @returns {string} The translated string.
 */
export function t(key, params) {
  return translate(locale.value, key, params)
}
