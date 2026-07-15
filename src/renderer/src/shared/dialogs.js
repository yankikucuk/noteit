/**
 * @file In-app prompt/confirm dialogs.
 *
 * A promise-based replacement for the native `window.prompt` / `window.confirm`,
 * so text entry and confirmations use the app's own styled, theme-aware modal
 * (rendered by {@link DialogHost}) instead of the unstyled browser dialog.
 * Only one dialog is active at a time, mirroring the blocking native calls.
 */

import { ref } from 'vue'

/** The currently open dialog descriptor, or null. @type {import('vue').Ref<object|null>} */
export const activeDialog = ref(null)

/** Resolver for the in-flight dialog promise. */
let resolver = null

/**
 * Opens a text-input dialog.
 * @param {object} [opts] - { title, message, value, placeholder, confirmLabel, password }.
 * @returns {Promise<string|null>} The trimmed input, or null if cancelled.
 */
export function promptDialog(opts = {}) {
  return new Promise((resolve) => {
    close(null)
    resolver = resolve
    activeDialog.value = { kind: 'prompt', value: '', ...opts }
  })
}

/**
 * Opens a confirmation dialog.
 * @param {object} [opts] - { title, message, confirmLabel, danger }.
 * @returns {Promise<boolean>} True if confirmed.
 */
export function confirmDialog(opts = {}) {
  return new Promise((resolve) => {
    close(false)
    resolver = resolve
    activeDialog.value = { kind: 'confirm', ...opts }
  })
}

/**
 * Closes the active dialog and settles its promise.
 * @param {string|boolean|null} result - Value to resolve with.
 */
export function close(result) {
  activeDialog.value = null
  const r = resolver
  resolver = null
  if (r) r(result)
}
