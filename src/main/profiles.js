/**
 * @file Profile activation.
 *
 * The single place that switches the active profile and performs the window
 * side effects that go with it. Shared by the IPC layer (user-initiated
 * switches), the idle auto-lock, and cross-profile reminder notifications, so
 * every switch behaves identically.
 */

import { setCurrentProfile, setSetting } from './repository.js'
import { closeAllNoteWindows, restoreVisibleNotes, refreshExplorer } from './windows.js'

/**
 * Switches the active profile: persists the choice, closes the previous
 * profile's note windows and opens the new profile's visible notes.
 *
 * Callers are responsible for authorisation (password verification) — this
 * function only performs the switch.
 *
 * @param {number} id - Profile id to activate.
 */
export function switchToProfile(id) {
  setCurrentProfile(id)
  setSetting('active_profile_id', id)
  closeAllNoteWindows()
  restoreVisibleNotes()
  refreshExplorer()
}
