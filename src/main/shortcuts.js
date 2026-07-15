/**
 * @file Global shortcut registration.
 *
 * Reads the user's (re-bindable) accelerators from settings and registers them,
 * falling back to sensible defaults. Re-applied whenever a shortcut preference
 * changes so new bindings take effect immediately.
 */

import { globalShortcut } from 'electron'
import log from './logger.js'
import { getSetting } from './repository.js'
import { newNote } from './tray.js'
import { openExplorer } from './windows.js'

/** Default accelerators, keyed by their settings key. */
export const DEFAULT_SHORTCUTS = {
  shortcut_new_note: 'CommandOrControl+Alt+N',
  shortcut_explorer: 'CommandOrControl+Alt+E'
}

/**
 * Registers one accelerator, logging a warning if it is unavailable (already
 * owned by another app) or invalid.
 * @param {string} accelerator - Electron accelerator.
 * @param {() => void} handler - Invoked when the shortcut fires.
 */
function register(accelerator, handler) {
  if (!accelerator) return
  try {
    globalShortcut.register(accelerator, handler)
    if (!globalShortcut.isRegistered(accelerator)) {
      log.warn(`Global shortcut ${accelerator} is unavailable (already in use).`)
    }
  } catch (err) {
    log.warn(`Could not register global shortcut ${accelerator}:`, err)
  }
}

/**
 * Clears and re-registers all global shortcuts from the current preferences.
 */
export function applyGlobalShortcuts() {
  globalShortcut.unregisterAll()
  register(getSetting('shortcut_new_note', DEFAULT_SHORTCUTS.shortcut_new_note), () => newNote())
  register(getSetting('shortcut_explorer', DEFAULT_SHORTCUTS.shortcut_explorer), () =>
    openExplorer()
  )
}
