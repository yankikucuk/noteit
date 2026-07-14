/**
 * @file Main-process i18n.
 *
 * Synchronous translation for tray/menu/dialogs/notifications. The locale is
 * resolved from the saved preference, falling back to the OS locale.
 */

import { app } from 'electron'
import { translate, DEFAULT_LOCALE, resolveLocale } from '../shared/locales/index.js'

let currentLocale = DEFAULT_LOCALE

/**
 * Initialises the locale from the saved preference, or the OS locale when unset.
 * Kept repository-free (the caller reads settings) to avoid an import cycle.
 * @param {string|null} saved - Saved language code, or null.
 */
export function initLocale(saved) {
  currentLocale = saved || resolveLocale(app.getLocale())
}

/** Sets the active main-process locale. @param {string} code */
export function setLocale(code) {
  currentLocale = code
}

/** @returns {string} The active main-process locale. */
export function getLocale() {
  return currentLocale
}

/**
 * Translates a key for the active locale.
 * @param {string} key - Translation key.
 * @param {Record<string, string|number>} [params] - Interpolation values.
 * @returns {string} The translated string.
 */
export function t(key, params) {
  return translate(currentLocale, key, params)
}
