/**
 * @file App-chrome theme (Explorer, Settings, dialogs).
 *
 * Applies the saved theme preference by setting `data-theme` on the document
 * root. 'system' leaves the attribute unset so the OS preference
 * (prefers-color-scheme) decides. Self-initialises on import and stays in sync
 * via the `theme:changed` broadcast. Note windows use per-note colors, so this
 * only affects the light/dark chrome.
 */

/**
 * Applies a theme value to the document root.
 * @param {'system'|'light'|'dark'} theme - Theme preference.
 */
export function applyTheme(theme) {
  if (typeof document === 'undefined') return
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme
  else delete document.documentElement.dataset.theme
}

if (typeof window !== 'undefined' && window.api) {
  window.api.settings.get('theme', 'system').then(applyTheme)
  window.api.on('theme:changed', applyTheme)
}
